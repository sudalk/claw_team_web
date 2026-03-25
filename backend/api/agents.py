"""Agents API endpoints."""

from fastapi import APIRouter, HTTPException, status

from backend.models.schemas import (
    AgentCreate,
    AgentResponse,
    AgentListResponse,
    AgentMessage,
)
from backend.services.agent_service import agent_service
from backend.services.team_service import team_service
from backend.services.event_service import event_service
from backend.models.schemas import SSEEventType

router = APIRouter(prefix="/teams/{team_name}/agents", tags=["agents"])


@router.get("", response_model=AgentListResponse)
async def list_agents(team_name: str):
    """List all agents in a team."""
    # Verify team exists
    team = team_service.get_team(team_name)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    return agent_service.list_agents(team_name)


@router.post("", response_model=AgentResponse, status_code=status.HTTP_201_CREATED)
async def spawn_agent(team_name: str, data: AgentCreate):
    """Spawn a new agent."""
    # Verify team exists
    team = team_service.get_team(team_name)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")

    try:
        agent = agent_service.spawn_agent(team_name, data)
        await event_service.emit(team_name, SSEEventType.AGENT_SPAWNED, {
            "agent_id": agent.id,
            "name": agent.name,
            "cli": agent.cli,
            "backend": agent.backend.value if agent.backend else None,
        })
        return agent
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{agent_id}", response_model=AgentResponse)
async def get_agent(team_name: str, agent_id: str):
    """Get an agent by ID."""
    agent = agent_service.get_agent(team_name, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    return agent


@router.post("/{agent_id}/message")
async def send_message_to_agent(
    team_name: str,
    agent_id: str,
    data: AgentMessage,
):
    """Send a message to an agent."""
    success = agent_service.send_message(team_name, agent_id, data.content)
    if not success:
        raise HTTPException(status_code=404, detail="Agent not found or message failed")

    await event_service.emit(team_name, SSEEventType.AGENT_MESSAGE, {
        "agent_id": agent_id,
        "content": data.content,
        "direction": "outgoing",
    })
    return {"status": "sent"}


@router.post("/{agent_id}/terminate")
async def terminate_agent(team_name: str, agent_id: str):
    """Terminate an agent."""
    success = agent_service.terminate_agent(team_name, agent_id)
    if not success:
        raise HTTPException(status_code=404, detail="Agent not found")

    await event_service.emit(team_name, SSEEventType.AGENT_TERMINATED, {
        "agent_id": agent_id,
    })
    return {"status": "terminated"}
