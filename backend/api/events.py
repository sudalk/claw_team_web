"""SSE Events API endpoint."""

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from backend.services.event_service import event_service
from backend.services.team_service import team_service
from fastapi import HTTPException

router = APIRouter(prefix="/teams/{team_name}/events", tags=["events"])


@router.get("")
async def stream_events(team_name: str):
    """Stream real-time events for a team via Server-Sent Events."""
    # Verify team exists
    team = team_service.get_team(team_name)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")

    async def event_generator():
        async for event in event_service.stream_events(team_name):
            yield event

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
