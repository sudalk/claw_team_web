"""Worker service - manages worker/agent lifecycle and task execution."""

import json
import subprocess
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional

from backend.core.config import settings
from backend.models.schemas import (
    WorkerCreate,
    WorkerResponse,
    WorkerUpdate,
    WorkerConfig,
    WorkerListResponse,
    AgentStatus,
    SpawnBackend,
    CLIVendor,
    TaskExecute,
    TaskResponse,
    TaskStatus,
    TaskExecution,
    TaskAssignee,
)


# CLI to command mapping
CLI_COMMANDS = {
    CLIVendor.CLAUDE: "claude",
    CLIVendor.CODEX: "codex",
    CLIVendor.CODEFLICKER: "f",
    CLIVendor.NANOBOT: "nanobot",
    CLIVendor.GEMINI: "gemini",
}


class WorkerService:
    """Service for worker management."""

    def __init__(self):
        self.clawteam_dir = settings.clawteam_dir

    def _get_team_dir(self, team_name: str) -> Path:
        return self.clawteam_dir / "teams" / team_name

    def _get_cli_tasks_dir(self, team_name: str) -> Path:
        """Get CLI tasks directory (same location as clawteam CLI uses)."""
        return self.clawteam_dir / "tasks" / team_name

    def _get_workers_dir(self, team_name: str) -> Path:
        return self._get_team_dir(team_name) / "workers"

    def _read_json(self, path: Path) -> dict:
        if not path.exists():
            return {}
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)

    def _write_json(self, path: Path, data: dict) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp_path = path.with_suffix(".tmp")
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        tmp_path.rename(path)

    def _get_team_workdir(self, team_name: str) -> Optional[str]:
        """Get team's base working directory."""
        config = self._read_json(self._get_team_dir(team_name) / "config.json")
        return config.get("workdir")

    def list_workers(self, team_name: str) -> WorkerListResponse:
        """List all workers in a team."""
        workers = []
        workers_dir = self._get_workers_dir(team_name)

        if not workers_dir.exists():
            return WorkerListResponse(workers=[], total=0)

        for worker_file in workers_dir.glob("*.json"):
            worker_data = self._read_json(worker_file)
            workers.append(self._worker_to_response(team_name, worker_data))

        return WorkerListResponse(workers=workers, total=len(workers))

    def _worker_to_response(self, team_name: str, data: dict) -> WorkerResponse:
        """Convert worker data to response."""
        config_data = data.get("config", {})
        config = WorkerConfig(
            cli=CLIVendor(config_data.get("cli", "claude")),
            backend=SpawnBackend(config_data.get("backend", "tmux")),
            workdir=config_data.get("workdir"),
            execution_mode=config_data.get("execution_mode", "auto"),
            auto_assign=config_data.get("auto_assign", True),
        )

        # Get current task if any
        current_task = None
        if data.get("current_task_id"):
            tasks_dir = self._get_cli_tasks_dir(team_name)
            task_file = tasks_dir / f"task-{data['current_task_id']}.json"
            if task_file.exists():
                task_data = self._read_json(task_file)
                assignee = None
                owner = task_data.get("owner") or task_data.get("assignee")
                if owner:
                    assignee = TaskAssignee(id=owner, name=owner)
                started_at = task_data.get("started_at") or task_data.get("created_at")
                execution = None
                if started_at:
                    execution = TaskExecution(
                        started_at=started_at,
                        completed_at=task_data.get("completed_at"),
                        progress=task_data.get("progress", 0) or (100 if task_data.get("status") == "completed" else 0),
                    )
                current_task = TaskResponse(
                    id=task_data.get("id", ""),
                    team_id=team_name,
                    subject=task_data.get("subject", ""),
                    description=task_data.get("description"),
                    status=TaskStatus(task_data.get("status", "pending")),
                    priority=task_data.get("priority", "medium"),
                    assignee=assignee,
                    created_at=task_data.get("created_at", datetime.now().isoformat()),
                    updated_at=task_data.get("updated_at", datetime.now().isoformat()),
                    blocked_by=task_data.get("blockedBy", task_data.get("blocked_by", [])),
                    blocks=task_data.get("blocks", []),
                    execution=execution,
                )

        return WorkerResponse(
            id=data.get("id", ""),
            team_id=team_name,
            name=data.get("name", ""),
            role=data.get("role", "worker"),
            status=AgentStatus(data.get("status", "idle")),
            config=config,
            current_task=current_task,
            completed_tasks=data.get("completed_tasks", 0),
            failed_tasks=data.get("failed_tasks", 0),
            spawned_at=datetime.fromisoformat(data.get("spawned_at", datetime.now().isoformat())),
            last_activity=datetime.fromisoformat(data.get("last_activity", datetime.now().isoformat())) if data.get("last_activity") else None,
            tmux_session=data.get("tmux_session"),
        )

    def get_worker(self, team_name: str, worker_id: str) -> Optional[WorkerResponse]:
        """Get a single worker."""
        workers_dir = self._get_workers_dir(team_name)
        worker_file = workers_dir / f"{worker_id}.json"

        if not worker_file.exists():
            return None

        worker_data = self._read_json(worker_file)
        return self._worker_to_response(team_name, worker_data)

    def create_worker(self, team_name: str, data: WorkerCreate) -> WorkerResponse:
        """Create and spawn a new worker."""
        worker_id = str(uuid.uuid4())[:8]
        now = datetime.now()

        # Determine workdir
        workdir = data.config.workdir or self._get_team_workdir(team_name)
        if not workdir:
            workdir = str(self.clawteam_dir / "workspaces" / team_name / worker_id)

        # Build spawn command
        cli_cmd = CLI_COMMANDS.get(data.config.cli, "claude")
        cmd = [
            "clawteam", "spawn",
            data.config.backend.value,
            cli_cmd,
            "--team", team_name,
            "--agent-name", data.name,
            "--skip-permissions",  # Auto-approve permissions to avoid blocking on bypass prompt
        ]

        if data.config.backend == SpawnBackend.TMUX:
            tmux_session = f"clawteam-{team_name}:{data.name}"
        else:
            tmux_session = None

        # Actually spawn the agent via clawteam CLI
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
            if result.returncode != 0:
                print(f"Warning: Failed to spawn agent: {result.stderr.decode() if result.stderr else 'unknown error'}")
        except Exception as e:
            print(f"Warning: Exception spawning agent: {e}")

        # Save worker config
        worker_data = {
            "id": worker_id,
            "name": data.name,
            "role": data.role,
            "team": team_name,
            "status": "ready",
            "config": {
                "cli": data.config.cli.value,
                "backend": data.config.backend.value,
                "workdir": workdir,
                "execution_mode": data.config.execution_mode.value,
                "auto_assign": data.config.auto_assign,
            },
            "current_task_id": None,
            "completed_tasks": 0,
            "failed_tasks": 0,
            "spawned_at": now.isoformat(),
            "last_activity": now.isoformat(),
            "tmux_session": tmux_session,
        }

        workers_dir = self._get_workers_dir(team_name)
        worker_file = workers_dir / f"{worker_id}.json"
        self._write_json(worker_file, worker_data)

        return self._worker_to_response(team_name, worker_data)

    def update_worker(self, team_name: str, worker_id: str, data: WorkerUpdate) -> Optional[WorkerResponse]:
        """Update worker configuration."""
        workers_dir = self._get_workers_dir(team_name)
        worker_file = workers_dir / f"{worker_id}.json"

        if not worker_file.exists():
            return None

        worker_data = self._read_json(worker_file)

        if data.name is not None:
            worker_data["name"] = data.name
        if data.role is not None:
            worker_data["role"] = data.role
        if data.config is not None:
            worker_data["config"].update({
                "cli": data.config.cli.value,
                "backend": data.config.backend.value,
                "workdir": data.config.workdir,
                "execution_mode": data.config.execution_mode.value,
                "auto_assign": data.config.auto_assign,
            })

        worker_data["last_activity"] = datetime.now().isoformat()
        self._write_json(worker_file, worker_data)

        return self._worker_to_response(team_name, worker_data)

    def delete_worker(self, team_name: str, worker_id: str) -> bool:
        """Delete (terminate) a worker."""
        workers_dir = self._get_workers_dir(team_name)
        worker_file = workers_dir / f"{worker_id}.json"

        if not worker_file.exists():
            return False

        worker_data = self._read_json(worker_file)

        # Kill tmux session if exists
        if worker_data.get("tmux_session"):
            subprocess.run(
                ["tmux", "kill-session", "-t", worker_data["tmux_session"]],
                capture_output=True
            )

        # Update status
        worker_data["status"] = "terminated"
        self._write_json(worker_file, worker_data)

        return True

    def assign_task(self, team_name: str, worker_id: str, task_id: str) -> Optional[WorkerResponse]:
        """Assign a task to a worker via CLI."""
        workers_dir = self._get_workers_dir(team_name)
        worker_file = workers_dir / f"{worker_id}.json"

        if not worker_file.exists():
            return None

        worker_data = self._read_json(worker_file)

        # Update task via CLI: set owner and status to in_progress
        cmd_update = ["clawteam", "task", "update", team_name, task_id,
                       "--owner", worker_data["name"],
                       "--status", "in_progress"]
        try:
            subprocess.run(cmd_update, capture_output=True, text=True, timeout=30)
        except Exception as e:
            print(f"Warning: Exception updating task: {e}")

        # Update worker state
        worker_data["current_task_id"] = task_id
        worker_data["status"] = "busy"
        worker_data["last_activity"] = datetime.now().isoformat()
        self._write_json(worker_file, worker_data)

        return self._worker_to_response(team_name, worker_data)

    def execute_task(self, team_name: str, worker_id: str) -> Optional[TaskResponse]:
        """Trigger worker to execute its assigned task."""
        workers_dir = self._get_workers_dir(team_name)
        worker_file = workers_dir / f"{worker_id}.json"

        if not worker_file.exists():
            return None

        worker_data = self._read_json(worker_file)
        task_id = worker_data.get("current_task_id")

        if not task_id:
            return None

        # Get task
        tasks_dir = self._get_cli_tasks_dir(team_name)
        task_file = tasks_dir / f"task-{task_id}.json"

        if not task_file.exists():
            return None

        task_data = self._read_json(task_file)
        workdir = worker_data.get("config", {}).get("workdir") or self._get_team_workdir(team_name)

        # Build task prompt
        task_prompt = (
            f"你被分配了以下任务:\n\n"
            f"任务主体: {task_data.get('subject', '')}\n"
            f"任务描述: {task_data.get('description', '')}\n\n"
            f"【关键要求】项目工作目录为: {workdir or '自动分配'}\n"
            f"请按照以下步骤执行:\n"
            f"1. 立即执行 `cd {workdir}` 切换到工作目录 (如果尚未进入)\n"
            f"2. 按照任务描述进行开发/修复\n"
            f"3. **重要**: 任务完成后，请第一时间通过信箱汇报产出：执行 `clawteam inbox send {team_name} leader \"[任务完成报告] 原计划: {task_data.get('subject')}. 实际完成情况: ... (请提供关键结果、产出文件、或给后续环节的建议)\"`\n"
            f"4. 最后执行 `clawteam task update {team_name} {task_id} --status completed` 标记任务正式结束"
        )

        backend_type = worker_data.get("config", {}).get("backend", "tmux")
        tmux_session = worker_data.get("tmux_session")

        if backend_type == "tmux" and tmux_session:
            # Send task directly to tmux session (same approach as clawteam spawn)
            import tempfile
            with tempfile.NamedTemporaryFile(
                mode="w", suffix=".txt", delete=False, prefix="clawteam-task-"
            ) as f:
                f.write(task_prompt)
                tmp_path = f.name

            try:
                # Load prompt to tmux buffer
                subprocess.run(
                    ["tmux", "load-buffer", "-b", f"task-{worker_data['name']}", tmp_path],
                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                )
                # Paste into tmux pane
                subprocess.run(
                    ["tmux", "paste-buffer", "-b", f"task-{worker_data['name']}", "-t", tmux_session],
                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                )
                # Send Enter twice (Claude needs confirmation + submit)
                subprocess.run(
                    ["tmux", "send-keys", "-t", tmux_session, "Enter"],
                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                )
                import time
                time.sleep(0.5)
                subprocess.run(
                    ["tmux", "send-keys", "-t", tmux_session, "Enter"],
                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                )
                # Clean up buffer
                subprocess.run(
                    ["tmux", "delete-buffer", "-b", f"task-{worker_data['name']}"],
                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                )
            finally:
                import os
                os.unlink(tmp_path)
        else:
            # Fallback: send via inbox
            cmd = [
                "clawteam", "inbox", "send",
                team_name,
                worker_data["name"],
                task_prompt,
            ]
            subprocess.run(cmd, capture_output=True)

        # Update task status via CLI
        cmd_update = ["clawteam", "task", "update", team_name, task_id, "--status", "in_progress"]
        try:
            subprocess.run(cmd_update, capture_output=True, text=True, timeout=30)
        except Exception as e:
            print(f"Warning: Exception updating task status: {e}")

        # Reload task data after CLI update
        if task_file.exists():
            task_data = self._read_json(task_file)

        # Update worker status
        worker_data["status"] = "busy"
        worker_data["last_activity"] = datetime.now().isoformat()
        self._write_json(worker_file, worker_data)

        owner = task_data.get("owner") or task_data.get("assignee")
        assignee = TaskAssignee(id=owner, name=owner) if owner else None
        started_at = task_data.get("startedAt") or task_data.get("createdAt")

        return TaskResponse(
            id=task_data.get("id", ""),
            team_id=team_name,
            subject=task_data.get("subject", ""),
            description=task_data.get("description"),
            status=TaskStatus(task_data.get("status", "pending")),
            priority=task_data.get("priority", "medium"),
            assignee=assignee,
            created_at=task_data.get("createdAt", datetime.now().isoformat()),
            updated_at=task_data.get("updatedAt", datetime.now().isoformat()),
            blocked_by=task_data.get("blockedBy", task_data.get("blocked_by", [])),
            blocks=task_data.get("blocks", []),
            workdir=workdir,
            execution=TaskExecution(
                started_at=started_at,
                progress=task_data.get("progress", 0),
            ),
        )

    def update_task_progress(self, team_name: str, task_id: str, progress: int, output: Optional[str] = None) -> Optional[TaskResponse]:
        """Update task execution progress."""
        tasks_dir = self._get_cli_tasks_dir(team_name)
        task_file = tasks_dir / f"task-{task_id}.json"

        if not task_file.exists():
            return None

        task_data = self._read_json(task_file)

        task_data["progress"] = min(100, max(0, progress))
        if output:
            task_data["output"] = output
        task_data["updated_at"] = datetime.now().isoformat()

        self._write_json(task_file, task_data)

        owner = task_data.get("owner") or task_data.get("assignee")
        assignee = TaskAssignee(id=owner, name=owner) if owner else None
        started_at = task_data.get("startedAt") or task_data.get("createdAt")

        return TaskResponse(
            id=task_data.get("id", ""),
            team_id=team_name,
            subject=task_data.get("subject", ""),
            description=task_data.get("description"),
            status=TaskStatus(task_data.get("status", "pending")),
            priority=task_data.get("priority", "medium"),
            assignee=assignee,
            created_at=task_data.get("createdAt", datetime.now().isoformat()),
            updated_at=task_data.get("updatedAt", datetime.now().isoformat()),
            blocked_by=task_data.get("blockedBy", task_data.get("blocked_by", [])),
            blocks=task_data.get("blocks", []),
            execution=TaskExecution(
                started_at=started_at,
                progress=task_data.get("progress", 0),
                output=task_data.get("output"),
            ),
        )

    def complete_task(self, team_name: str, task_id: str, success: bool = True) -> Optional[TaskResponse]:
        """Mark task as completed or failed."""
        tasks_dir = self._get_cli_tasks_dir(team_name)
        task_file = tasks_dir / f"task-{task_id}.json"

        if not task_file.exists():
            return None

        task_data = self._read_json(task_file)

        # Update task status via CLI
        new_status = "completed" if success else "blocked"
        cmd_update = ["clawteam", "task", "update", team_name, task_id, "--status", new_status]
        try:
            subprocess.run(cmd_update, capture_output=True, text=True, timeout=30)
        except Exception as e:
            print(f"Warning: Exception completing task: {e}")

        # Reload task data after CLI update
        if task_file.exists():
            task_data = self._read_json(task_file)
            task_data["status"] = "completed" if success else "failed"
            task_data["progress"] = 100 if success else task_data.get("progress", 0)
            task_data["updated_at"] = datetime.now().isoformat()
            self._write_json(task_file, task_data)

        # Update worker's completed/failed count
        workers_dir = self._get_workers_dir(team_name)
        assignee_name = task_data.get("owner") or task_data.get("assignee")
        if assignee_name:
            for worker_file in workers_dir.glob("*.json"):
                worker_data = self._read_json(worker_file)
                if worker_data.get("name") == assignee_name:
                    if success:
                        worker_data["completed_tasks"] = worker_data.get("completed_tasks", 0) + 1
                    else:
                        worker_data["failed_tasks"] = worker_data.get("failed_tasks", 0) + 1
                    worker_data["current_task_id"] = None
                    worker_data["status"] = "ready"
                    worker_data["last_activity"] = datetime.now().isoformat()
                    self._write_json(worker_file, worker_data)
                    break

        owner = task_data.get("owner") or task_data.get("assignee")
        assignee = TaskAssignee(id=owner, name=owner) if owner else None
        started_at = task_data.get("startedAt") or task_data.get("createdAt")
        completed_at = task_data.get("completedAt")

        return TaskResponse(
            id=task_data.get("id", ""),
            team_id=team_name,
            subject=task_data.get("subject", ""),
            description=task_data.get("description"),
            status=TaskStatus(task_data.get("status", "pending")),
            priority=task_data.get("priority", "medium"),
            assignee=assignee,
            created_at=task_data.get("createdAt", datetime.now().isoformat()),
            updated_at=task_data.get("updatedAt", datetime.now().isoformat()),
            blocked_by=task_data.get("blockedBy", task_data.get("blocked_by", [])),
            blocks=task_data.get("blocks", []),
            execution=TaskExecution(
                started_at=started_at,
                completed_at=completed_at,
                progress=task_data.get("progress", 0),
            ),
        )


worker_service = WorkerService()
