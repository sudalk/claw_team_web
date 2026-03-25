"""Messages API endpoints."""

from typing import Optional
from fastapi import APIRouter, HTTPException, Query, status

from backend.models.schemas import (
    MessageCreate,
    MessageBroadcast,
    MessageResponse,
    MessageListResponse,
)
from backend.services.message_service import message_service
from backend.services.team_service import team_service
from backend.services.event_service import event_service
from backend.models.schemas import SSEEventType

router = APIRouter(prefix="/teams/{team_name}/messages", tags=["messages"])


@router.get("", response_model=MessageListResponse)
async def list_messages(
    team_name: str,
    agent: Optional[str] = Query(None, description="Filter by agent name"),
    unread_only: bool = Query(False, description="Only return unread messages"),
):
    """List messages in a team."""
    # Verify team exists
    team = team_service.get_team(team_name)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    return message_service.list_messages(team_name, agent, unread_only)


@router.post("", response_model=MessageResponse, status_code=status.HTTP_201_CREATED)
async def send_message(team_name: str, data: MessageCreate):
    """Send a message to an agent."""
    # Verify team exists
    team = team_service.get_team(team_name)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")

    message = message_service.send_message(team_name, data)
    if not message:
        raise HTTPException(status_code=400, detail="Failed to send message")

    await event_service.emit(team_name, SSEEventType.AGENT_MESSAGE, {
        "message_id": message.id,
        "from": message.from_agent,
        "to": message.to_agent,
        "content": message.content,
    })
    return message


@router.post("/broadcast")
async def broadcast_message(team_name: str, data: MessageBroadcast):
    """Broadcast a message to all team members."""
    # Verify team exists
    team = team_service.get_team(team_name)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")

    success = message_service.broadcast_message(team_name, data)
    if not success:
        raise HTTPException(status_code=400, detail="Failed to broadcast message")

    return {"status": "broadcasted"}


@router.post("/receive")
async def receive_message(team_name: str, agent: str = Query(..., description="Agent name")):
    """Receive the next message from an agent's inbox."""
    # Verify team exists
    team = team_service.get_team(team_name)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")

    message = message_service.receive_message(team_name, agent)
    if not message:
        raise HTTPException(status_code=404, detail="No messages in inbox")

    return message
