"""Message service - handles inbox/messages."""

import json
import subprocess
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional

from backend.core.config import settings
from backend.models.schemas import (
    MessageCreate,
    MessageBroadcast,
    MessageResponse,
    MessageListResponse,
)


class MessageService:
    """Service for message operations."""

    def __init__(self):
        self.clawteam_dir = settings.clawteam_dir

    def _get_inbox_dir(self, team_name: str) -> Path:
        """Get the inbox directory for a team."""
        # ClawTeam stores inboxes under teams/{team}/inboxes
        return self.clawteam_dir / "teams" / team_name / "inboxes"

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

    def _get_agent_inbox(self, team_name: str, agent_name: str) -> Path:
        """Get inbox directory for a specific agent."""
        return self._get_inbox_dir(team_name) / agent_name

    def list_messages(
        self,
        team_name: str,
        agent_name: Optional[str] = None,
        unread_only: bool = False,
    ) -> MessageListResponse:
        """List messages in team's inbox."""
        messages = []
        inbox_dir = self._get_inbox_dir(team_name)

        if not inbox_dir.exists():
            return MessageListResponse(messages=[], total=0)

        # If agent_name specified, only look at that inbox
        if agent_name:
            agent_inboxes = [inbox_dir / agent_name] if (inbox_dir / agent_name).exists() else []
        else:
            agent_inboxes = [d for d in inbox_dir.iterdir() if d.is_dir()]

        for agent_inbox in agent_inboxes:
            for msg_file in agent_inbox.glob("*.json"):
                msg = self._read_json(msg_file)
                if unread_only and msg.get("read"):
                    continue
                messages.append(MessageResponse(
                    id=msg.get("id", msg_file.stem),
                    team_id=team_name,
                    from_agent=msg.get("from", agent_inbox.name),
                    to_agent=agent_inbox.name,
                    content=msg.get("content", ""),
                    created_at=datetime.fromisoformat(msg.get("created_at", datetime.now().isoformat())),
                    read=msg.get("read", False),
                ))

        # Sort by created_at descending
        messages.sort(key=lambda m: m.created_at, reverse=True)
        return MessageListResponse(messages=messages, total=len(messages))

    def send_message(self, team_name: str, data: MessageCreate) -> Optional[MessageResponse]:
        """Send a message to an agent."""
        cmd = [
            "clawteam", "inbox", "send",
            team_name,
            data.to_agent,
            data.content,
        ]

        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            cwd=self.clawteam_dir.parent,
        )

        if result.returncode != 0:
            return None

        return MessageResponse(
            id=str(uuid.uuid4())[:8],
            team_id=team_name,
            from_agent="user",
            to_agent=data.to_agent,
            content=data.content,
            created_at=datetime.now(),
            read=False,
        )

    def broadcast_message(self, team_name: str, data: MessageBroadcast) -> bool:
        """Broadcast a message to all team members."""
        cmd = [
            "clawteam", "inbox", "broadcast",
            team_name,
            data.content,
        ]

        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            cwd=self.clawteam_dir.parent,
        )

        return result.returncode == 0

    def receive_message(self, team_name: str, agent_name: str) -> Optional[MessageResponse]:
        """Receive (consume) the next message from agent's inbox."""
        cmd = ["clawteam", "inbox", "receive", team_name]

        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            cwd=self.clawteam_dir.parent,
        )

        if result.returncode != 0:
            # Try manual receive
            inbox_dir = self._get_agent_inbox(team_name, agent_name)
            messages = sorted(inbox_dir.glob("*.json"), key=lambda p: p.stat().st_mtime)
            if messages:
                msg_file = messages[0]
                msg = self._read_json(msg_file)
                msg_file.unlink()  # Consume the message
                return MessageResponse(
                    id=msg.get("id", msg_file.stem),
                    team_id=team_name,
                    from_agent=msg.get("from", "unknown"),
                    to_agent=agent_name,
                    content=msg.get("content", ""),
                    created_at=datetime.fromisoformat(msg.get("created_at", datetime.now().isoformat())),
                    read=True,
                )
            return None

        return None


message_service = MessageService()
