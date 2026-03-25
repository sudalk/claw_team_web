"""Teams API endpoints."""

from fastapi import APIRouter, HTTPException, status

from backend.models.schemas import (
    TeamCreate,
    TeamResponse,
    TeamUpdate,
    TeamListResponse,
)
from backend.services.team_service import team_service
from backend.services.event_service import event_service
from backend.models.schemas import SSEEventType

router = APIRouter(prefix="/teams", tags=["teams"])


@router.get("", response_model=TeamListResponse)
async def list_teams():
    """List all teams."""
    return team_service.list_teams()


@router.post("", response_model=TeamResponse, status_code=status.HTTP_201_CREATED)
async def create_team(data: TeamCreate):
    """Create a new team."""
    try:
        team = team_service.create_team(data)
        await event_service.emit(data.name, SSEEventType.TEAM_UPDATED, {"action": "created"})
        return team
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{team_name}", response_model=TeamResponse)
async def get_team(team_name: str):
    """Get a team by name."""
    team = team_service.get_team(team_name)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    return team


@router.patch("/{team_name}", response_model=TeamResponse)
async def update_team(team_name: str, data: TeamUpdate):
    """Update a team."""
    team = team_service.update_team(team_name, data)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    await event_service.emit(team_name, SSEEventType.TEAM_UPDATED, {"action": "updated"})
    return team


@router.delete("/{team_name}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_team(team_name: str):
    """Delete a team."""
    success = team_service.delete_team(team_name)
    if not success:
        raise HTTPException(status_code=404, detail="Team not found or delete failed")
    await event_service.emit(team_name, SSEEventType.TEAM_UPDATED, {"action": "deleted"})
