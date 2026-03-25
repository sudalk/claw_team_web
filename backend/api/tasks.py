"""Tasks API endpoints."""

from typing import Optional
from fastapi import APIRouter, HTTPException, Query, status

from backend.models.schemas import (
    TaskCreate,
    TaskResponse,
    TaskUpdate,
    TaskMove,
    TaskStatus,
    TaskListResponse,
)
from backend.services.task_service import task_service
from backend.services.team_service import team_service
from backend.services.event_service import event_service
from backend.models.schemas import SSEEventType

router = APIRouter(prefix="/teams/{team_name}/tasks", tags=["tasks"])


@router.get("", response_model=TaskListResponse)
async def list_tasks(
    team_name: str,
    status_filter: Optional[TaskStatus] = Query(None, alias="status"),
):
    """List all tasks in a team."""
    # Verify team exists
    team = team_service.get_team(team_name)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    return task_service.list_tasks(team_name, status_filter)


@router.post("", response_model=TaskResponse, status_code=status.HTTP_201_CREATED)
async def create_task(team_name: str, data: TaskCreate):
    """Create a new task."""
    # Verify team exists
    team = team_service.get_team(team_name)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")

    task = task_service.create_task(team_name, data)
    await event_service.emit(team_name, SSEEventType.TASK_CREATED, {
        "task_id": task.id,
        "subject": task.subject,
        "status": task.status.value,
    })
    return task


@router.get("/{task_id}", response_model=TaskResponse)
async def get_task(team_name: str, task_id: str):
    """Get a task by ID."""
    task = task_service.get_task(team_name, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@router.patch("/{task_id}", response_model=TaskResponse)
async def update_task(team_name: str, task_id: str, data: TaskUpdate):
    """Update a task."""
    task = task_service.update_task(team_name, task_id, data)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    await event_service.emit(team_name, SSEEventType.TASK_UPDATED, {
        "task_id": task.id,
        "subject": task.subject,
        "status": task.status.value,
        "old_status": data.status.value if data.status else None,
    })
    return task


@router.post("/{task_id}/move", response_model=TaskResponse)
async def move_task(team_name: str, task_id: str, data: TaskMove):
    """Move a task to a different status column."""
    task = task_service.move_task(team_name, task_id, data)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    await event_service.emit(team_name, SSEEventType.TASK_MOVED, {
        "task_id": task.id,
        "subject": task.subject,
        "status": task.status.value,
    })
    return task


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(team_name: str, task_id: str):
    """Delete a task."""
    success = task_service.delete_task(team_name, task_id)
    if not success:
        raise HTTPException(status_code=404, detail="Task not found")

    await event_service.emit(team_name, SSEEventType.TASK_DELETED, {
        "task_id": task_id,
    })
