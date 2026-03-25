"""SSE event service - provides real-time event streaming."""

import asyncio
import json
from datetime import datetime
from pathlib import Path
from typing import AsyncGenerator, Optional
import threading

from backend.core.config import settings
from backend.models.schemas import SSEEvent, SSEEventType


class EventService:
    """Service for SSE event streaming."""

    def __init__(self):
        self.clawteam_dir = settings.clawteam_dir
        self._subscribers: dict[str, list[asyncio.Queue]] = {}
        self._lock = threading.Lock()

    def _get_team_dir(self, team_name: str) -> Path:
        """Get the directory for a team."""
        return self.clawteam_dir / "teams" / team_name

    def subscribe(self, team_name: str) -> asyncio.Queue:
        """Subscribe to events for a team."""
        queue = asyncio.Queue()
        with self._lock:
            if team_name not in self._subscribers:
                self._subscribers[team_name] = []
            self._subscribers[team_name].append(queue)
        return queue

    def unsubscribe(self, team_name: str, queue: asyncio.Queue) -> None:
        """Unsubscribe from events."""
        with self._lock:
            if team_name in self._subscribers:
                try:
                    self._subscribers[team_name].remove(queue)
                except ValueError:
                    pass

    async def emit(self, team_name: str, event_type: SSEEventType, data: dict) -> None:
        """Emit an event to all subscribers of a team."""
        event = SSEEvent(type=event_type, data=data)
        with self._lock:
            subscribers = self._subscribers.get(team_name, []).copy()

        for queue in subscribers:
            try:
                await queue.put(event.model_dump_json())
            except Exception:
                pass

    def emit_sync(self, team_name: str, event_type: SSEEventType, data: dict) -> None:
        """Synchronously emit an event (for use in non-async contexts)."""
        asyncio.create_task(self.emit(team_name, event_type, data))

    async def stream_events(self, team_name: str) -> AsyncGenerator[str, None]:
        """Stream events for a team."""
        queue = self.subscribe(team_name)

        try:
            while True:
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=30)
                    yield f"data: {event}\n\n"
                except asyncio.TimeoutError:
                    # Send keepalive
                    yield f": keepalive\n\n"
        finally:
            self.unsubscribe(team_name, queue)


event_service = EventService()
