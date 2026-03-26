"""Agent tools for ReAct loop - ClawTeam Management Tools"""

import asyncio
from typing import Optional

from backend.services.task_service import task_service
from backend.services.worker_service import worker_service
from backend.models.schemas import TaskCreate, TaskPriority, WorkerCreate, WorkerConfig, CLIVendor, SpawnBackend, ExecutionMode

TOOLS_SCHEMA = [
    {
        "name": "create_task",
        "description": "Create a new task in the ClawTeam platform. Use this to break down the main goal into smaller executable units.",
        "input_schema": {
            "type": "object",
            "properties": {
                "subject": {
                    "type": "string",
                    "description": "Short, descriptive title of the task"
                },
                "description": {
                    "type": "string",
                    "description": "Detailed explanation of what needs to be done"
                },
                "priority": {
                    "type": "string",
                    "enum": ["low", "medium", "high"],
                    "description": "Priority of the task (default: medium)"
                },
                "assignee_id": {
                    "type": "string",
                    "description": "Optional name of the worker to automatically assign this task to upon creation"
                },
                "blocked_by": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Optional list of task IDs that must be completed before this task can start"
                }
            },
            "required": ["subject"]
        }
    },
    {
        "name": "list_tasks",
        "description": "List all tasks in the current team to check their status (pending, in_progress, completed, failed, blocked).",
        "input_schema": {
            "type": "object",
            "properties": {}
        }
    },
    {
        "name": "hire_worker",
        "description": "Hire (spawn) a new AI Worker to perform tasks in this team. Wait briefly after calling this for the worker to initialize.",
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {
                    "type": "string",
                    "description": "A unique, recognizable name for the worker (e.g., 'frontend-claude', 'backend-coder')"
                },
                "role": {
                    "type": "string",
                    "description": "The worker's designated role or specialty"
                },
                "cli_vendor": {
                    "type": "string",
                    "enum": ["claude", "codex", "codeflicker", "nanobot", "gemini"],
                    "description": "The AI vendor CLI to use for this worker. Use 'claude' for Claude Code, or 'codeflicker' for Codeflicker."
                }
            },
            "required": ["name", "role", "cli_vendor"]
        }
    },
    {
        "name": "list_workers",
        "description": "List all active workers in the current team to check their availability (status: ready, busy, idle).",
        "input_schema": {
            "type": "object",
            "properties": {}
        }
    },
    {
        "name": "assign_task",
        "description": "Assign an existing task to an existing worker. Note: Many times worker auto_assign takes care of this, but use this if explicit delegation is needed.",
        "input_schema": {
            "type": "object",
            "properties": {
                "worker_id": {
                    "type": "string",
                    "description": "The ID of the worker"
                },
                "task_id": {
                    "type": "string",
                    "description": "The ID of the task"
                }
            },
            "required": ["worker_id", "task_id"]
        }
    },
    {
        "name": "trigger_worker",
        "description": "Trigger a worker to start executing its assigned task. MUST call this after a worker has been assigned a task, otherwise it will sit idle.",
        "input_schema": {
            "type": "object",
            "properties": {
                "worker_id": {
                    "type": "string",
                    "description": "The ID of the worker to trigger"
                }
            },
            "required": ["worker_id"]
        }
    },
    {
        "name": "wait_for_tasks",
        "description": "Efficiently wait for one or more tasks to finish (completed or failed). Use this instead of manually calling list_tasks in a loop. Returning to the loop only when tasks are done or timeout occurs.",
        "input_schema": {
            "type": "object",
            "properties": {
                "task_ids": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "List of task IDs to wait for"
                },
                "timeout_seconds": {
                    "type": "integer",
                    "description": "Max seconds to wait (default 60, max 300)"
                }
            },
            "required": ["task_ids"]
        }
    }
]

async def execute_tool(name: str, args: dict, team_id: str) -> str:
    """Execute the management tool and return output."""
    try:
        if name == "create_task":
            priority = args.get("priority", "medium").upper()
            data = TaskCreate(
                subject=args["subject"],
                description=args.get("description"),
                priority=getattr(TaskPriority, priority, TaskPriority.MEDIUM),
                assignee_id=args.get("assignee_id"),
                blocked_by=args.get("blocked_by", [])
            )
            resp = task_service.create_task(team_id, data)
            return f"Task created successfully. Task ID: {resp.id}"
            
        elif name == "list_tasks":
            resp = task_service.list_tasks(team_id)
            if not resp.tasks:
                return "No tasks found."
            lines = []
            for t in resp.tasks:
                owner = t.assignee.name if t.assignee else "Unassigned"
                lines.append(f"- ID: {t.id} | Subject: {t.subject} | Status: {t.status.value} | Owner: {owner}")
            return "\n".join(lines)
            
        elif name == "hire_worker":
            cli_v = args.get("cli_vendor", "claude").upper()
            config = WorkerConfig(
                cli=getattr(CLIVendor, cli_v, CLIVendor.CLAUDE),
                backend=SpawnBackend.TMUX,
                execution_mode=ExecutionMode.AUTO,
                auto_assign=True
            )
            data = WorkerCreate(name=args["name"], role=args["role"], config=config)
            # Create worker might be synchronous but takes a second to span tmux
            resp = worker_service.create_worker(team_id, data)
            return f"Worker created. ID: {resp.id}, Name: {resp.name}, Status: {resp.status.value}"
            
        elif name == "list_workers":
            resp = worker_service.list_workers(team_id)
            if not resp.workers:
                return "No workers found."
            lines = []
            for w in resp.workers:
                task = w.current_task.id if w.current_task else "None"
                lines.append(f"- ID: {w.id} | Name: {w.name} | Role: {w.role} | Status: {w.status.value} | Current Task: {task}")
            return "\n".join(lines)
            
        elif name == "assign_task":
            resp = worker_service.assign_task(team_id, args["worker_id"], args["task_id"])
            if not resp:
                return "Failed to assign task. Please check ID validity."
            return f"Task {args['task_id']} assigned to Worker {args['worker_id']}"
            
        elif name == "trigger_worker":
            # worker_service.execute_task is sync
            resp = worker_service.execute_task(team_id, args["worker_id"])
            if not resp:
                return "Worker could not be triggered. Ensure it has an assigned task."
            return f"Worker {args['worker_id']} is now running task {resp.id}."
            
        elif name == "wait_for_tasks":
            task_ids = args["task_ids"]
            timeout = min(args.get("timeout_seconds", 60), 300)
            start_time = asyncio.get_event_loop().time()
            
            while True:
                resp = task_service.list_tasks(team_id)
                pending_ids = []
                for t in resp.tasks:
                    if t.id in task_ids:
                        if t.status.value not in ["completed", "failed"]:
                            pending_ids.append(t.id)
                
                if not pending_ids:
                    return f"All requested tasks ({', '.join(task_ids)}) have finished."
                
                elapsed = asyncio.get_event_loop().time() - start_time
                if elapsed >= timeout:
                    return f"Timeout reached. Remaining tasks: {', '.join(pending_ids)}"
                
                await asyncio.sleep(5) # Wait 5 seconds before next check
            
        else:
            return f"Error: Unknown tool '{name}'"
    except Exception as e:
        return f"Error executing tool {name}: {str(e)}"
