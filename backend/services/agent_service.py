"""Agent service - manages agent spawning and lifecycle."""

import json
import shutil
import subprocess
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional

from backend.core.config import settings
from backend.models.schemas import (
    AgentCreate,
    AgentResponse,
    AgentStatus,
    AgentListResponse,
    CLIVendor,
    SpawnBackend,
)


# CLI to command mapping
CLI_COMMANDS = {
    CLIVendor.CLAUDE: "claude",
    CLIVendor.CODEX: "codex",
    CLIVendor.CODEFLICKER: "f",
    CLIVendor.NANOBOT: "nanobot",
    CLIVendor.GEMINI: "gemini",
}


class AgentService:
    """Service for agent management operations."""

    def __init__(self):
        self.clawteam_dir = settings.clawteam_dir

    def _get_team_dir(self, team_name: str) -> Path:
        """Get the directory for a team."""
        return self.clawteam_dir / "teams" / team_name

    def _get_sessions_dir(self, team_name: str) -> Path:
        """Get the sessions directory for a team."""
        return self._get_team_dir(team_name) / "sessions"

    def _read_json(self, path: Path) -> dict:
        """Read JSON file safely."""
        if not path.exists():
            return {}
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)

    def _write_json(self, path: Path, data: dict) -> None:
        """Write JSON file atomically."""
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp_path = path.with_suffix(".tmp")
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        tmp_path.rename(path)

    def list_agents(self, team_name: str) -> AgentListResponse:
        """List all agents in a team."""
        agents = []

        # Get team config
        team_dir = self._get_team_dir(team_name)
        config = self._read_json(team_dir / "config.json")
        members_data = config.get("members", [])
        created_at_str = config.get("createdAt", datetime.now().isoformat())

        # Add leader
        for m in members_data:
            if m.get("agentType") == "leader":
                try:
                    joined_at = datetime.fromisoformat(m.get("joinedAt", created_at_str))
                except (ValueError, TypeError):
                    joined_at = datetime.now()
                agents.append(AgentResponse(
                    id=m.get("agentId", ""),
                    team_id=team_name,
                    name=m.get("name", "leader"),
                    type="leader",
                    status=AgentStatus.ACTIVE,
                    spawned_at=joined_at,
                    inbox_count=self._count_inbox(team_name, m.get("name", "leader")),
                ))
                break

        # Get spawned agents from spawn_registry.json
        spawn_registry_path = team_dir / "spawn_registry.json"
        if spawn_registry_path.exists():
            spawn_registry = self._read_json(spawn_registry_path)
            for agent_name, agent_data in spawn_registry.items():
                # Skip if it's the leader
                if any(a.name == agent_name for a in agents):
                    continue
                agents.append(AgentResponse(
                    id=str(agent_data.get("pid", agent_name)),
                    team_id=team_name,
                    name=agent_name,
                    type="general-purpose",
                    status=AgentStatus.ACTIVE if agent_data.get("pid") else AgentStatus.TERMINATED,
                    cli=agent_data.get("command", [""])[0] if agent_data.get("command") else None,
                    backend=SpawnBackend(agent_data.get("backend", "tmux")),
                    spawned_at=datetime.now(),
                    inbox_count=self._count_inbox(team_name, agent_name),
                    workspace=agent_data.get("workspace"),
                ))

        return AgentListResponse(agents=agents, total=len(agents))

    def _count_inbox(self, team_name: str, agent_name: str) -> int:
        """Count unread messages in agent's inbox."""
        inbox_dir = self.clawteam_dir / "teams" / team_name / "inboxes" / agent_name
        if not inbox_dir.exists():
            return 0
        return len(list(inbox_dir.glob("*.json")))

    def _get_agent_status(self, session: dict) -> AgentStatus:
        """Determine agent status from session data."""
        if session.get("terminated"):
            return AgentStatus.TERMINATED
        if session.get("current_task") or session.get("last_message"):
            return AgentStatus.ACTIVE
        return AgentStatus.IDLE

    def get_agent(self, team_name: str, agent_id: str) -> Optional[AgentResponse]:
        """Get a single agent."""
        agents = self.list_agents(team_name)
        for agent in agents.agents:
            if agent.id == agent_id or agent.name == agent_id:
                return agent
        return None

    def spawn_agent(self, team_name: str, data: AgentCreate) -> AgentResponse:
        """Spawn a new agent using clawteam CLI."""
        agent_id = str(uuid.uuid4())[:8]
        now = datetime.now()

        # Determine CLI command
        cli_cmd = CLI_COMMANDS.get(data.cli, "claude") if data.cli else "claude"

        # Build spawn command
        cmd = [
            "clawteam", "spawn",
            data.backend.value,  # tmux or subprocess
            cli_cmd,
            "--team", team_name,
            "--agent-name", data.name,
            "--task", data.task,
        ]

        if not data.workspace_enabled:
            cmd.append("--no-workspace")

        # Execute spawn command
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            cwd=self.clawteam_dir.parent,
        )

        if result.returncode != 0:
            raise Exception(f"Failed to spawn agent: {result.stderr}")

        # Save agent session info
        session_data = {
            "id": agent_id,
            "name": data.name,
            "type": "general-purpose",
            "team": team_name,
            "command": cli_cmd,
            "backend": data.backend.value,
            "task": data.task,
            "workspace_enabled": data.workspace_enabled,
            "spawned_at": now.isoformat(),
            "current_task": data.task,
        }

        # Extract workspace from output if available
        if "Workspace:" in result.stdout:
            for line in result.stdout.split("\n"):
                if "Workspace:" in line:
                    workspace = line.split("Workspace:")[1].strip()
                    session_data["workspace"] = workspace
                    break

        # Save session
        sessions_dir = self._get_sessions_dir(team_name)
        sessions_dir.mkdir(parents=True, exist_ok=True)
        session_file = sessions_dir / f"{agent_id}.json"
        self._write_json(session_file, session_data)

        return AgentResponse(
            id=agent_id,
            team_id=team_name,
            name=data.name,
            type="general-purpose",
            status=AgentStatus.ACTIVE,
            cli=cli_cmd,
            backend=data.backend,
            current_task=data.task,
            spawned_at=now,
            workspace=session_data.get("workspace"),
            inbox_count=0,
        )

    def send_message(self, team_name: str, agent_id: str, content: str) -> bool:
        """Send a message to an agent."""
        # Get agent name
        agent = self.get_agent(team_name, agent_id)
        if not agent:
            return False

        # Use clawteam inbox send
        cmd = [
            "clawteam", "inbox", "send",
            team_name,
            agent.name,
            content,
        ]

        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            cwd=self.clawteam_dir.parent,
        )

        return result.returncode == 0

    def receive_messages(self, team_name: str, agent_name: str, peek: bool = True) -> list[dict]:
        """Receive or peek messages from an agent's inbox."""
        cmd = [
            "clawteam", "inbox",
            "peek" if peek else "receive",
            team_name,
            "--agent", agent_name,
        ]

        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            cwd=self.clawteam_dir.parent,
        )

        if result.returncode != 0:
            return []

        messages = []
        # The CLI output for peek/receive is usually one message per line or a JSON block
        # For simplicity, if it's multiple messages, we try to parse them
        output = result.stdout.strip()
        if not output:
            return []

        # If the output looks like a JSON array, parse it
        if output.startswith("[") and output.endswith("]"):
            try:
                return json.loads(output)
            except:
                pass

        # Otherwise, treat each paragraph/line as a message content
        return [{"content": output}]

    def terminate_agent(self, team_name: str, agent_id: str) -> bool:
        """Terminate an agent."""
        # Get agent name
        agent = self.get_agent(team_name, agent_id)
        if not agent:
            return False

        # Update session to mark as terminated
        sessions_dir = self._get_sessions_dir(team_name)
        for session_file in sessions_dir.glob("*.json"):
            session = self._read_json(session_file)
            if session.get("id") == agent_id or session.get("name") == agent.name:
                session["terminated"] = True
                session["terminated_at"] = datetime.now().isoformat()
                self._write_json(session_file, session)
                break

        # Kill tmux window if tmux backend
        if agent.backend == SpawnBackend.TMUX:
            tmux_window = f"clawteam-{team_name}:{agent.name}"
            subprocess.run(["tmux", "kill-window", "-t", tmux_window], capture_output=True)

        return True


agent_service = AgentService()
