"""Team service - interacts with ClawTeam's data store."""

import json
import subprocess
from datetime import datetime
from pathlib import Path
from typing import Optional

from backend.core.config import settings
from backend.models.schemas import (
    TeamCreate,
    TeamResponse,
    TeamMember,
    TeamStats,
    TeamUpdate,
    TeamListResponse,
)


class TeamService:
    """Service for team management operations."""

    def __init__(self):
        self.clawteam_dir = settings.clawteam_dir

    def _get_team_dir(self, team_name: str) -> Path:
        """Get the directory for a team."""
        return self.clawteam_dir / "teams" / team_name

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

    def list_teams(self) -> TeamListResponse:
        """List all teams."""
        teams_dir = self.clawteam_dir / "teams"
        if not teams_dir.exists():
            return TeamListResponse(teams=[], total=0)

        teams = []
        for team_path in teams_dir.iterdir():
            if team_path.is_dir():
                team = self._get_team(team_path.name)
                if team:
                    teams.append(team)

        # Sort by created_at descending
        teams.sort(key=lambda t: t.created_at, reverse=True)
        return TeamListResponse(teams=teams, total=len(teams))

    def _get_team(self, team_name: str) -> Optional[TeamResponse]:
        """Get a single team by name."""
        team_dir = self._get_team_dir(team_name)
        if not team_dir.exists():
            return None

        # Read team metadata - check both config.json and meta.json
        config_path = team_dir / "config.json"
        meta_path = team_dir / "meta.json"

        if config_path.exists():
            meta = self._read_json(config_path)
        elif meta_path.exists():
            meta = self._read_json(meta_path)
        else:
            return None

        # Get members
        members = self._get_team_members(team_name)

        # Get stats
        stats = self._get_team_stats(team_name)

        # Extract leader info from config.json format
        members_data = meta.get("members", [])
        leader_data = next((m for m in members_data if m.get("agentType") == "leader"), {})
        leader_id = leader_data.get("agentId", meta.get("leadAgentId", ""))

        # Parse created_at - may be in different formats
        created_at_str = meta.get("createdAt", meta.get("created_at", datetime.now().isoformat()))
        try:
            created_at = datetime.fromisoformat(created_at_str)
        except (ValueError, TypeError):
            created_at = datetime.now()

        leader = TeamMember(
            id=leader_id,
            name=leader_data.get("name", "leader"),
            type="leader",
            joined_at=created_at,
            inbox_count=0,
        )

        return TeamResponse(
            id=team_name,
            name=meta.get("name", team_name),
            description=meta.get("description"),
            status="active",
            created_at=created_at,
            leader=leader,
            stats=stats,
            members=members,
            workdir=meta.get("workdir"),
        )

    def _get_team_members(self, team_name: str) -> list[TeamMember]:
        """Get all members of a team."""
        members = []
        team_dir = self._get_team_dir(team_name)

        # Get leader from config.json
        config_path = team_dir / "config.json"
        meta_path = team_dir / "meta.json"

        if config_path.exists():
            config = self._read_json(config_path)
            members_data = config.get("members", [])
            created_at_str = config.get("createdAt", datetime.now().isoformat())
        elif meta_path.exists():
            config = self._read_json(meta_path)
            members_data = config.get("members", [])
            created_at_str = config.get("created_at", datetime.now().isoformat())
        else:
            created_at_str = datetime.now().isoformat()
            members_data = []

        # Add all members from config
        leader_name = None
        for m in members_data:
            member_type = m.get("agentType", "general-purpose")
            if member_type == "leader":
                leader_name = m.get("name", "leader")
            joined_at_str = m.get("joinedAt", created_at_str)
            try:
                joined_at = datetime.fromisoformat(joined_at_str)
            except (ValueError, TypeError):
                joined_at = datetime.now()

            members.append(TeamMember(
                id=m.get("agentId", m.get("id", "")),
                name=m.get("name", ""),
                type=member_type,
                joined_at=joined_at,
                inbox_count=0,
            ))

        # Get inbox directory to count agents and find spawned agents
        inbox_dir = self.clawteam_dir / "inbox" / team_name
        if inbox_dir.exists():
            for agent_dir in inbox_dir.iterdir():
                if agent_dir.is_dir() and agent_dir.name != leader_name:
                    # Count unread messages
                    unread = len(list(agent_dir.glob("*.json")))
                    # Check if already in members
                    if not any(m.name == agent_dir.name for m in members):
                        members.append(TeamMember(
                            id=agent_dir.name,
                            name=agent_dir.name,
                            type="general-purpose",
                            joined_at=datetime.now(),
                            inbox_count=unread,
                        ))

        return members

    def _get_team_stats(self, team_name: str) -> TeamStats:
        """Get task statistics for a team."""
        tasks = []
        tasks_dir = self._get_team_dir(team_name) / "tasks"
        if tasks_dir.exists():
            for task_file in tasks_dir.glob("*.json"):
                task = self._read_json(task_file)
                tasks.append(task)

        # Count workers
        workers_dir = self._get_team_dir(team_name) / "workers"
        workers_count = 0
        if workers_dir.exists():
            workers_count = len(list(workers_dir.glob("*.json")))

        return TeamStats(
            members=len(self._get_team_members(team_name)),
            workers=workers_count,
            tasks_total=len(tasks),
            tasks_completed=len([t for t in tasks if t.get("status") == "completed"]),
            tasks_pending=len([t for t in tasks if t.get("status") == "pending"]),
            tasks_in_progress=len([t for t in tasks if t.get("status") == "in_progress"]),
            tasks_blocked=len([t for t in tasks if t.get("status") == "blocked"]),
            tasks_failed=len([t for t in tasks if t.get("status") == "failed"]),
        )

    def get_team(self, team_name: str) -> Optional[TeamResponse]:
        """Get a team by name."""
        return self._get_team(team_name)

    def create_team(self, data: TeamCreate) -> TeamResponse:
        """Create a new team using clawteam CLI."""
        cmd = [
            "clawteam", "team", "spawn-team",
            data.name,
            "-d", data.description or "",
            "-n", "leader",
        ]

        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            cwd=self.clawteam_dir.parent,
        )

        if result.returncode != 0:
            raise Exception(f"Failed to create team: {result.stderr}")

        # Save workdir to config
        team_dir = self._get_team_dir(data.name)
        config_path = team_dir / "config.json"
        if config_path.exists():
            config = self._read_json(config_path)
            if data.workdir:
                config["workdir"] = data.workdir
                self._write_json(config_path, config)

        # Refresh and return the created team
        team = self._get_team(data.name)
        if not team:
            raise Exception("Team created but could not be retrieved")
        return team

    def update_team(self, team_name: str, data: TeamUpdate) -> Optional[TeamResponse]:
        """Update a team's metadata."""
        team_dir = self._get_team_dir(team_name)
        config_path = team_dir / "config.json"
        meta_path = team_dir / "meta.json"

        # Update config.json if exists
        if config_path.exists():
            config = self._read_json(config_path)
            if data.name is not None:
                config["name"] = data.name
            if data.description is not None:
                config["description"] = data.description
            if data.workdir is not None:
                config["workdir"] = data.workdir
            self._write_json(config_path, config)

        # Update meta.json if exists
        if meta_path.exists():
            meta = self._read_json(meta_path)
            if data.name is not None:
                meta["name"] = data.name
            if data.description is not None:
                meta["description"] = data.description
            if data.status is not None:
                meta["status"] = data.status
            self._write_json(meta_path, meta)

        return self._get_team(team_name)

    def delete_team(self, team_name: str) -> bool:
        """Delete a team using clawteam CLI."""
        cmd = ["clawteam", "team", "cleanup", team_name, "--force"]

        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            cwd=self.clawteam_dir.parent,
        )

        return result.returncode == 0


team_service = TeamService()
