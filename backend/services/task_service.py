"""Task service - manages tasks within teams."""

import json
import subprocess
from datetime import datetime
from pathlib import Path
from typing import Optional

from backend.core.config import settings
from backend.models.schemas import (
    TaskCreate,
    TaskResponse,
    TaskUpdate,
    TaskMove,
    TaskStatus,
    TaskPriority,
    TaskListResponse,
    TaskAssignee,
    TaskExecution,
)


def _cli_task_to_response(team_name: str, task_data: dict) -> TaskResponse:
    """Convert CLI task data (TaskItem JSON) to TaskResponse."""
    assignee = None
    owner = task_data.get("owner", "")
    if owner:
        assignee = TaskAssignee(id=owner, name=owner)

    # Map execution metadata
    execution = None
    started_at = task_data.get("started_at") or task_data.get("created_at")
    completed_at = task_data.get("completed_at")
    progress = task_data.get("progress", 0)
    if task_data.get("status") == "completed":
        progress = 100

    if started_at or progress > 0:
        execution = TaskExecution(
            started_at=started_at,
            completed_at=completed_at,
            progress=progress,
            output=task_data.get("output"),
            error=task_data.get("error"),
        )

    return TaskResponse(
        id=task_data.get("id", ""),
        team_id=team_name,
        subject=task_data.get("subject", ""),
        description=task_data.get("description"),
        status=TaskStatus(task_data.get("status", "pending")),
        priority=TaskPriority(task_data.get("priority", "medium")),
        assignee=assignee,
        created_at=task_data.get("created_at", datetime.now().isoformat()),
        updated_at=task_data.get("updated_at", datetime.now().isoformat()),
        blocked_by=task_data.get("blockedBy", task_data.get("blocked_by", [])),
        blocks=task_data.get("blocks", []),
        workdir=task_data.get("workdir"),
        execution=execution,
    )


class TaskService:
    """Service for task management operations."""

    def __init__(self):
        self.clawteam_dir = settings.clawteam_dir

    def _get_cli_tasks_dir(self, team_name: str) -> Path:
        """Get the CLI tasks directory (same as clawteam CLI uses)."""
        return self.clawteam_dir / "tasks" / team_name

    def _get_tasks_dir(self, team_name: str) -> Path:
        """Get the tasks directory for a team (legacy location)."""
        return self.clawteam_dir / "teams" / team_name / "tasks"

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

    def _cli_task_filename(self, task_id: str) -> str:
        """Convert task ID to CLI filename (task-{id}.json)."""
        return f"task-{task_id}.json"

    def list_tasks(self, team_name: str, status: Optional[TaskStatus] = None) -> TaskListResponse:
        """List all tasks in a team (reads from CLI data dir)."""
        tasks_dir = self._get_cli_tasks_dir(team_name)
        if not tasks_dir.exists():
            return TaskListResponse(tasks=[], total=0)

        tasks = []
        for task_file in tasks_dir.glob("task-*.json"):
            task = self._read_json(task_file)
            if status and task.get("status") != status.value:
                continue
            tasks.append(_cli_task_to_response(team_name, task))

        # Sort by created_at descending
        tasks.sort(key=lambda t: t.created_at, reverse=True)
        return TaskListResponse(tasks=tasks, total=len(tasks))

    def get_task(self, team_name: str, task_id: str) -> Optional[TaskResponse]:
        """Get a single task."""
        tasks_dir = self._get_cli_tasks_dir(team_name)
        task_file = tasks_dir / self._cli_task_filename(task_id)

        if not task_file.exists():
            return None

        task_data = self._read_json(task_file)
        return _cli_task_to_response(team_name, task_data)

    def create_task(self, team_name: str, data: TaskCreate) -> TaskResponse:
        """Create a new task via clawteam CLI."""
        cmd = ["clawteam", "task", "create", team_name, data.subject]

        if data.description:
            cmd.extend(["--description", data.description])
        if data.assignee_id:
            cmd.extend(["--owner", data.assignee_id])
        if data.priority:
            cmd.extend(["--priority", data.priority.value])
        if data.blocked_by:
            cmd.extend(["--blocked-by", ",".join(data.blocked_by)])

        task_id = None
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
            if result.returncode == 0 and result.stdout:
                # Parse "OK Task created: {id}" from stdout
                for line in result.stdout.splitlines():
                    if "Task created:" in line:
                        task_id = line.split("Task created:")[-1].strip()
                        break
            else:
                print(f"Warning: task create CLI failed: {result.stderr}")
        except Exception as e:
            print(f"Warning: Exception running task create: {e}")

        # Read the created task file directly by ID
        if task_id:
            tasks_dir = self._get_cli_tasks_dir(team_name)
            task_file = tasks_dir / self._cli_task_filename(task_id)
            if task_file.exists():
                return _cli_task_to_response(team_name, self._read_json(task_file))

        raise ValueError(f"Failed to create task: {data.subject}")

    def update_task(self, team_name: str, task_id: str, data: TaskUpdate) -> Optional[TaskResponse]:
        """Update a task via clawteam CLI."""
        tasks_dir = self._get_cli_tasks_dir(team_name)
        task_file = tasks_dir / self._cli_task_filename(task_id)
        if not task_file.exists():
            return None

        # 支持 dict 或 TaskUpdate
        if isinstance(data, dict):
            status_val = data.get("status")
            assignee_val = data.get("assignee_id")
            subject_val = data.get("subject")
            desc_val = data.get("description")
            priority_val = data.get("priority")
        else:
            status_val = data.status.value if hasattr(data.status, 'value') else str(data.status) if data.status else None
            assignee_val = data.assignee_id
            subject_val = data.subject
            desc_val = data.description
            priority_val = data.priority.value if hasattr(data.priority, 'value') else str(data.priority) if data.priority else None

        cmd = ["clawteam", "task", "update", team_name, task_id]
        if status_val is not None:
            cmd.extend(["--status", str(status_val)])
        if assignee_val is not None:
            cmd.extend(["--owner", str(assignee_val)])
        if subject_val is not None:
            cmd.extend(["--subject", str(subject_val)])
        if desc_val is not None:
            cmd.extend(["--description", str(desc_val)])
        if priority_val is not None:
            cmd.extend(["--priority", str(priority_val)])

        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
            if result.returncode != 0:
                print(f"Warning: task update CLI failed: {result.stderr}")
        except Exception as e:
            print(f"Warning: Exception running task update: {e}")

        # Read updated task
        if task_file.exists():
            return _cli_task_to_response(team_name, self._read_json(task_file))
        return None

    def move_task(self, team_name: str, task_id: str, data: TaskMove) -> Optional[TaskResponse]:
        """Move a task to a new status column."""
        return self.update_task(team_name, task_id, TaskUpdate(status=data.status))

    def delete_task(self, team_name: str, task_id: str) -> bool:
        """Delete a task from CLI data dir."""
        tasks_dir = self._get_cli_tasks_dir(team_name)
        task_file = tasks_dir / self._cli_task_filename(task_id)

        if not task_file.exists():
            return False

        # Update blocking tasks to remove references to this task
        task_data = self._read_json(task_file)
        for blocked_by_id in task_data.get("blocked_by", []):
            blocked_file = tasks_dir / self._cli_task_filename(blocked_by_id)
            if blocked_file.exists():
                blocked_data = self._read_json(blocked_file)
                if task_id in blocked_data.get("blocks", []):
                    blocked_data["blocks"].remove(task_id)
                    self._write_json(blocked_file, blocked_data)

        # Update blocked tasks to remove references to this task
        for blocks_id in task_data.get("blocks", []):
            blocks_file = tasks_dir / self._cli_task_filename(blocks_id)
            if blocks_file.exists():
                blocks_data = self._read_json(blocks_file)
                if task_id in blocks_data.get("blocked_by", []):
                    blocks_data["blocked_by"].remove(task_id)
                    self._write_json(blocks_file, blocks_data)

        task_file.unlink()
        return True


task_service = TaskService()
