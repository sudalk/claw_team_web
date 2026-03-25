"""Workers API endpoints - manages worker/agent lifecycle and task execution."""

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from typing import Optional

from backend.models.schemas import (
    WorkerCreate,
    WorkerResponse,
    WorkerUpdate,
    WorkerListResponse,
    WorkerAssignTask,
    TaskResponse,
)
from backend.services.worker_service import worker_service
from backend.services.team_service import team_service
from backend.services.event_service import event_service
from backend.models.schemas import SSEEventType

router = APIRouter(prefix="/teams/{team_name}/workers", tags=["workers"])


@router.get("", response_model=WorkerListResponse)
async def list_workers(team_name: str):
    """List all workers in a team."""
    team = team_service.get_team(team_name)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    return worker_service.list_workers(team_name)


@router.post("", response_model=WorkerResponse, status_code=status.HTTP_201_CREATED)
async def create_worker(team_name: str, data: WorkerCreate):
    """Create and spawn a new worker."""
    team = team_service.get_team(team_name)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")

    worker = worker_service.create_worker(team_name, data)
    await event_service.emit(team_name, SSEEventType.WORKER_SPAWNED, {
        "worker_id": worker.id,
        "name": worker.name,
        "role": worker.role,
    })
    return worker


@router.get("/{worker_id}", response_model=WorkerResponse)
async def get_worker(team_name: str, worker_id: str):
    """Get a worker by ID."""
    worker = worker_service.get_worker(team_name, worker_id)
    if not worker:
        raise HTTPException(status_code=404, detail="Worker not found")
    return worker


@router.patch("/{worker_id}", response_model=WorkerResponse)
async def update_worker(team_name: str, worker_id: str, data: WorkerUpdate):
    """Update worker configuration."""
    worker = worker_service.update_worker(team_name, worker_id, data)
    if not worker:
        raise HTTPException(status_code=404, detail="Worker not found")

    await event_service.emit(team_name, SSEEventType.WORKER_STATUS_CHANGED, {
        "worker_id": worker.id,
        "name": worker.name,
        "status": worker.status.value,
    })
    return worker


@router.delete("/{worker_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_worker(team_name: str, worker_id: str):
    """Delete (terminate) a worker."""
    success = worker_service.delete_worker(team_name, worker_id)
    if not success:
        raise HTTPException(status_code=404, detail="Worker not found")

    await event_service.emit(team_name, SSEEventType.WORKER_TERMINATED, {
        "worker_id": worker_id,
    })


@router.post("/{worker_id}/assign", response_model=WorkerResponse)
async def assign_task_to_worker(team_name: str, worker_id: str, data: WorkerAssignTask):
    """Assign a task to a worker."""
    worker = worker_service.assign_task(team_name, worker_id, data.task_id)
    if not worker:
        raise HTTPException(status_code=404, detail="Worker or task not found")

    await event_service.emit(team_name, SSEEventType.WORKER_ASSIGNED, {
        "worker_id": worker.id,
        "name": worker.name,
        "task_id": data.task_id,
    })
    return worker


@router.post("/{worker_id}/execute", response_model=TaskResponse)
async def execute_task(team_name: str, worker_id: str):
    """Trigger worker to execute its assigned task."""
    task = worker_service.execute_task(team_name, worker_id)
    if not task:
        raise HTTPException(status_code=400, detail="No task assigned to this worker")

    await event_service.emit(team_name, SSEEventType.TASK_STARTED, {
        "task_id": task.id,
        "subject": task.subject,
        "worker_id": worker_id,
    })
    return task


@router.post("/{worker_id}/complete", response_model=TaskResponse)
async def complete_task(team_name: str, worker_id: str):
    """Mark worker's current task as completed."""
    worker = worker_service.get_worker(team_name, worker_id)
    if not worker:
        raise HTTPException(status_code=404, detail="Worker not found")
    if not worker.current_task:
        raise HTTPException(status_code=400, detail="No task assigned")

    task = worker_service.complete_task(team_name, worker.current_task.id, success=True)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    await event_service.emit(team_name, SSEEventType.TASK_COMPLETED, {
        "task_id": task.id,
        "subject": task.subject,
        "worker_id": worker_id,
    })
    return task


@router.post("/{worker_id}/fail", response_model=TaskResponse)
async def fail_task(team_name: str, worker_id: str):
    """Mark worker's current task as failed."""
    worker = worker_service.get_worker(team_name, worker_id)
    if not worker:
        raise HTTPException(status_code=404, detail="Worker not found")
    if not worker.current_task:
        raise HTTPException(status_code=400, detail="No task assigned")

    task = worker_service.complete_task(team_name, worker.current_task.id, success=False)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    await event_service.emit(team_name, SSEEventType.TASK_FAILED, {
        "task_id": task.id,
        "subject": task.subject,
        "worker_id": worker_id,
    })
    return task


class ProgressUpdate(BaseModel):
    progress: int
    output: Optional[str] = None


@router.post("/{worker_id}/progress")
async def update_progress(
    team_name: str,
    worker_id: str,
    data: ProgressUpdate
):
    """Update task execution progress."""
    worker = worker_service.get_worker(team_name, worker_id)
    if not worker or not worker.current_task:
        raise HTTPException(status_code=404, detail="Worker or task not found")

    task = worker_service.update_task_progress(team_name, worker.current_task.id, data.progress, data.output)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    await event_service.emit(team_name, SSEEventType.TASK_PROGRESS, {
        "task_id": task.id,
        "progress": data.progress,
        "worker_id": worker_id,
    })
    return task
