"""Orchestrator Agent - 自动执行的核心协调器"""

import asyncio
import json
import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel

from backend.core.config import settings
from backend.core.llm_client import llm_client
from backend.models.execution import (
    ExecutionRecord,
    ExecutionStatus,
    LogType,
    execution_storage,
)
from backend.models.schemas import (
    TeamCreate, WorkerCreate, WorkerConfig, TaskCreate,
    TaskPriority, TaskStatus, CLIVendor, SpawnBackend,
    SSEEventType,
)
from backend.services.event_service import event_service
from backend.services.team_service import team_service
from backend.services.worker_service import worker_service
from backend.services.task_service import task_service
from backend.services.executor_service import executor_service


# Task decomposition prompt template
TASK_DECOMPOSE_PROMPT = """
你是一个项目经理，需要将用户需求拆解成具体的开发任务。

用户需求：
{prompt}

请按照以下 JSON 格式输出任务列表：
{{
    "summary": "需求摘要（一句话描述）",
    "workers": [
        {{
            "name": "worker名称（英文，用于 CLI）",
            "role": "frontend/backend/fullstack",
            "description": "职责描述"
        }}
    ],
    "tasks": [
        {{
            "id": "task-1",
            "subject": "任务标题",
            "description": "详细描述（包含具体技术选型和实现要点）",
            "priority": "high/medium/low",
            "assignee": "对应的 worker 名称",
            "blocked_by": [],
            "type": "backend/frontend/infra",
            "estimated_hours": 1
        }}
    ],
    "execution_order": ["task_id_1", "task_id_2"],
    "tech_stack": {{
        "frontend": "推荐的技术栈",
        "backend": "推荐的技术栈"
    }}
}}

规则：
1. 任务需要按照依赖关系排序（blocked_by 必须在被阻塞任务之前）
2. 每个任务必须有明确的 assignee
3. 考虑前后端分离，任务分配合理
4. 单个任务尽量控制在 1-2 小时
5. frontend 任务和 backend 任务分开
6. 不要包含 README 等文档类任务
"""

TASK_DECOMPOSE_EXAMPLE = """
示例输入：帮我做一个待办应用，包含用户登录和任务管理

示例输出：
{
    "summary": "待办应用，包含用户认证和任务管理功能",
    "workers": [
        {"name": "backend-dev", "role": "backend", "description": "后端开发，负责 API 和数据库"},
        {"name": "frontend-dev", "role": "frontend", "description": "前端开发，负责 UI 界面"}
    ],
    "tasks": [
        {"id": "task-1", "subject": "初始化后端项目", "description": "使用 FastAPI 创建项目，安装 SQLAlchemy、Pydantic、JWT 等依赖", "priority": "high", "assignee": "backend-dev", "blocked_by": [], "type": "backend", "estimated_hours": 1},
        {"id": "task-2", "subject": "设计数据库模型", "description": "设计 User 和 Task 表结构，包含用户名、密码哈希、任务标题、描述、状态、优先级等字段", "priority": "high", "assignee": "backend-dev", "blocked_by": ["task-1"], "type": "backend", "estimated_hours": 1},
        {"id": "task-3", "subject": "实现用户认证 API", "description": "实现登录、注册接口，使用 JWT token，包含密码哈希和验证", "priority": "high", "assignee": "backend-dev", "blocked_by": ["task-2"], "type": "backend", "estimated_hours": 2},
        {"id": "task-4", "subject": "实现任务 CRUD API", "description": "实现任务的创建、查询、更新、删除 API，包含分页和过滤", "priority": "high", "assignee": "backend-dev", "blocked_by": ["task-2"], "type": "backend", "estimated_hours": 2},
        {"id": "task-5", "subject": "初始化前端项目", "description": "使用 Next.js 创建项目，安装 Tailwind CSS", "priority": "high", "assignee": "frontend-dev", "blocked_by": [], "type": "frontend", "estimated_hours": 1},
        {"id": "task-6", "subject": "实现登录页面", "description": "实现登录/注册表单，包含表单验证、错误提示、使用 JWT token 存储", "priority": "medium", "assignee": "frontend-dev", "blocked_by": ["task-3", "task-5"], "type": "frontend", "estimated_hours": 2},
        {"id": "task-7", "subject": "实现任务列表页面", "description": "实现任务列表页面，包含新增、编辑、删除、状态切换功能", "priority": "medium", "assignee": "frontend-dev", "blocked_by": ["task-4", "task-5"], "type": "frontend", "estimated_hours": 3}
    ],
    "execution_order": ["task-1", "task-2", "task-3", "task-4", "task-5", "task-6", "task-7"],
    "tech_stack": {
        "frontend": "Next.js 14 + Tailwind CSS",
        "backend": "FastAPI + SQLAlchemy + JWT"
    }
}
"""


class ExecutionPlan(BaseModel):
    """执行计划"""
    summary: str
    workers: list[dict]
    tasks: list[dict]
    execution_order: list[str]
    tech_stack: dict


class OrchestratorAgent:
    """AI Orchestrator for automatic task execution."""

    def __init__(self):
        self.clawteam_dir = settings.clawteam_dir

    async def analyze_and_decompose(self, prompt: str) -> ExecutionPlan:
        """分析需求并拆解任务"""
        full_prompt = TASK_DECOMPOSE_PROMPT.replace("{prompt}", prompt) + "\n\n" + TASK_DECOMPOSE_EXAMPLE + "\n\n请开始分析并输出："
        result = llm_client.structured_output(
            prompt=full_prompt,
            json_schema={
                "type": "object",
                "properties": {
                    "summary": {"type": "string"},
                    "workers": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "name": {"type": "string"},
                                "role": {"type": "string"},
                                "description": {"type": "string"}
                            },
                            "required": ["name", "role"]
                        }
                    },
                    "tasks": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "id": {"type": "string"},
                                "subject": {"type": "string"},
                                "description": {"type": "string"},
                                "priority": {"type": "string"},
                                "assignee": {"type": "string"},
                                "blocked_by": {"type": "array", "items": {"type": "string"}},
                                "type": {"type": "string"},
                                "estimated_hours": {"type": "number"}
                            },
                            "required": ["id", "subject", "assignee", "type"]
                        }
                    },
                    "execution_order": {"type": "array", "items": {"type": "string"}},
                    "tech_stack": {
                        "type": "object",
                        "properties": {
                            "frontend": {"type": "string"},
                            "backend": {"type": "string"}
                        }
                    }
                },
                "required": ["summary", "workers", "tasks", "execution_order"]
            }
        )
        return ExecutionPlan(**result)

    async def execute(self, prompt: str, team_name: Optional[str] = None,
                      workdir: Optional[str] = None, execution_id: Optional[str] = None) -> ExecutionRecord:
        """
        执行自动任务

        流程:
        1. 创建/復用执行记录
        2. 需求分析 & 任务拆解
        3. 创建团队
        4. 启动 Workers
        5. 创建并分配任务
        6. 监控执行状态
        """
        team_id = team_name or f"auto-{execution_id or str(uuid.uuid4())[:12]}"

        # 復用或创建执行记录
        if execution_id:
            record = execution_storage.load(execution_id)
        else:
            record = None

        if not record:
            record = ExecutionRecord(
                id=execution_id or str(uuid.uuid4())[:12],
                prompt=prompt,
                team_id=team_id,
                status=ExecutionStatus.RUNNING,
            )
            execution_storage.save(record)

        try:
            # 1. 需求分析
            record.add_log(
                LogType.THINKING,
                "analyzing",
                "🤔 正在分析需求..."
            )
            execution_storage.save(record)
            await event_service.emit(team_id, SSEEventType.EXECUTION_STARTED, record.to_sse_data())

            record.add_log(
                LogType.THINKING,
                "decomposing",
                f"📝 需求：{prompt}"
            )
            execution_storage.save(record)

            # 2. 任务拆解
            record.add_log(
                LogType.THINKING,
                "decomposing",
                "🔄 正在拆解任务..."
            )
            execution_storage.save(record)

            plan = await self.analyze_and_decompose(prompt)

            record.add_log(
                LogType.THINKING,
                "decomposed",
                f"✅ 拆解完成：{len(plan.tasks)} 个任务，{len(plan.workers)} 个 Worker"
            )
            record.total_tasks = len(plan.tasks)
            execution_storage.save(record)

            # 打印任务列表到日志
            for task in plan.tasks:
                record.add_log(
                    LogType.STEP,
                    "task_list",
                    f"  📋 [{task['id']}] {task['subject']} → {task['assignee']}"
                )
            execution_storage.save(record)

            # 3. 创建团队
            record.add_log(
                LogType.TEAM_CREATING,
                "creating_team",
                f"👥 正在创建团队：{team_id}"
            )
            execution_storage.save(record)

            try:
                team = team_service.create_team(TeamCreate(
                    name=team_id,
                    description=f"自动执行团队 - {plan.summary}",
                    workdir=workdir,
                ))
                record.add_log(
                    LogType.TEAM_CREATED,
                    "team_created",
                    f"✅ 团队创建成功：{team_id}"
                )
            except Exception as e:
                record.add_log(
                    LogType.TEAM_FAILED,
                    "team_failed",
                    f"⚠️ 团队已存在或创建失败：{str(e)}",
                    detail={"team_id": team_id}
                )
            execution_storage.save(record)

            # 4. 启动 Workers
            for worker_config in plan.workers:
                # 检查是否已停止
                record = execution_storage.load(record.id)
                if record.status == ExecutionStatus.STOPPED:
                    record.add_log(LogType.EXECUTION_STOPPED, "stopped", "🛑 用户停止了执行")
                    execution_storage.save(record)
                    return record

                record.add_log(
                    LogType.WORKER_SPAWNING,
                    "spawning_worker",
                    f"🤖 正在启动 Worker：{worker_config['name']} ({worker_config['role']})"
                )
                execution_storage.save(record)

                try:
                    # 根据 plan 中的 role 选择 CLI
                    cli_vendor = CLIVendor.CLAUDE  # 默认
                    cli_name = worker_config.get("cli", "").lower()
                    for vendor in CLIVendor:
                        if vendor.value == cli_name:
                            cli_vendor = vendor
                            break

                    worker = worker_service.create_worker(team_id, WorkerCreate(
                        name=worker_config["name"],
                        role=worker_config["role"],
                        config=WorkerConfig(
                            cli=cli_vendor,
                            backend=SpawnBackend.TMUX,
                            workdir=workdir,
                        ),
                    ))
                    record.add_log(
                        LogType.WORKER_SPAWNED,
                        "worker_spawned",
                        f"✅ Worker 已启动：{worker.name} (ID: {worker.id})",
                        detail={"worker_id": worker.id}
                    )
                except Exception as e:
                    record.add_log(
                        LogType.WORKER_FAILED,
                        "worker_failed",
                        f"⚠️ Worker 启动失败：{str(e)}"
                    )
                execution_storage.save(record)

            # 5. 创建任务
            task_map = {}  # id -> task_id 映射
            for task_def in plan.tasks:
                record.add_log(
                    LogType.TASK_CREATING,
                    "creating_task",
                    f"📝 正在创建任务：{task_def['subject']}"
                )
                execution_storage.save(record)

                try:
                    priority = TaskPriority.MEDIUM
                    if task_def.get("priority", "").lower() == "high":
                        priority = TaskPriority.HIGH
                    elif task_def.get("priority", "").lower() == "low":
                        priority = TaskPriority.LOW

                    task = task_service.create_task(team_id, TaskCreate(
                        subject=task_def["subject"],
                        description=task_def.get("description", ""),
                        priority=priority,
                        blocked_by=task_def.get("blocked_by", []),
                    ))
                    task_map[task_def["id"]] = task.id

                    record.add_log(
                        LogType.TASK_CREATED,
                        "task_created",
                        f"✅ 任务已创建：{task_def['subject']} (ID: {task.id})",
                        detail={"task_id": task.id}
                    )
                except Exception as e:
                    record.add_log(
                        LogType.TASK_FAILED,
                        "task_failed",
                        f"❌ 任务创建失败：{str(e)}"
                    )
                execution_storage.save(record)

            # 6. 分配并执行任务（按执行顺序）
            for task_id in plan.execution_order:
                # 检查是否已停止
                record = execution_storage.load(record.id)
                if record.status == ExecutionStatus.STOPPED:
                    record.add_log(LogType.EXECUTION_STOPPED, "stopped", "🛑 用户停止了执行")
                    execution_storage.save(record)
                    return record

                task_def = next((t for t in plan.tasks if t["id"] == task_id), None)
                if not task_def or task_id not in task_map:
                    continue

                record.add_log(
                    LogType.TASK_ASSIGNING,
                    "assigning_task",
                    f"📋 正在分配任务：{task_def['subject']} → {task_def['assignee']}"
                )
                execution_storage.save(record)

                # 找到对应的 worker
                workers_resp = worker_service.list_workers(team_id)
                worker = next(
                    (w for w in workers_resp.workers if w.name == task_def["assignee"]),
                    None
                )

                if worker:
                    try:
                        worker_service.assign_task(team_id, worker.id, task_map[task_id])
                        record.add_log(
                            LogType.TASK_ASSIGNED,
                            "task_assigned",
                            f"✅ 任务已分配：{task_def['subject']} → {worker.name}",
                            detail={"task_id": task_map[task_id], "worker_id": worker.id}
                        )
                    except Exception as e:
                        record.add_log(
                            LogType.TASK_FAILED,
                            "task_assign_failed",
                            f"⚠️ 任务分配失败：{str(e)}"
                        )
                else:
                    record.add_log(
                        LogType.TASK_FAILED,
                        "task_assign_failed",
                        f"⚠️ 未找到 Worker：{task_def['assignee']}"
                    )
                execution_storage.save(record)

                # 检查并等待依赖任务完成
                blocked_by = task_def.get("blocked_by", [])
                if blocked_by:
                    # 将 plan 中的任务 ID 映射为实际的任务 ID
                    real_dep_ids = [task_map[dep_id] for dep_id in blocked_by if dep_id in task_map]
                    if real_dep_ids:
                        deps_met, pending = executor_service.check_dependencies_met(team_id, real_dep_ids)
                        if not deps_met:
                            record.add_log(
                                LogType.THINKING,
                                "waiting_deps",
                                f"⏳ 等待依赖任务完成：{', '.join(pending)} -> {task_def['subject']}"
                            )
                            execution_storage.save(record)
                            # 等待所有依赖完成（最多等待 settings.execution_timeout 秒）
                            deps_met = await executor_service.wait_for_dependencies(
                                team_id, task_map[task_id], real_dep_ids,
                                timeout=settings.execution_timeout,
                            )
                            if not deps_met:
                                record.add_log(
                                    LogType.TASK_FAILED_STEP,
                                    "deps_timeout",
                                    f"⚠️ 等待依赖超时，跳过任务：{task_def['subject']}"
                                )
                                record.failed_tasks += 1
                                execution_storage.save(record)
                                continue

                # 执行任务
                if worker:
                    record.add_log(
                        LogType.TASK_RUNNING,
                        "executing_task",
                        f"⚡ 开始执行任务：{task_def['subject']}"
                    )
                    execution_storage.save(record)

                    try:
                        # 调用执行器执行任务
                        result = await executor_service.execute_task(
                            team_name=team_id,
                            task_id=task_map[task_id],
                            workdir=workdir,
                            skip_dep_check=True,
                        )

                        if result["success"]:
                            record.add_log(
                                LogType.TASK_COMPLETED,
                                "task_completed",
                                f"✅ 任务执行完成：{task_def['subject']}",
                                detail={"task_id": task_map[task_id]}
                            )
                            record.completed_tasks += 1
                        else:
                            record.add_log(
                                LogType.TASK_FAILED_STEP,
                                "task_failed",
                                f"❌ 任务执行失败：{task_def['subject']} - {result.get('error', 'Unknown error')}",
                                detail={"task_id": task_map[task_id]}
                            )
                            record.failed_tasks += 1
                    except Exception as e:
                        record.add_log(
                            LogType.TASK_FAILED_STEP,
                            "task_execute_error",
                            f"⚠️ 执行异常：{task_def['subject']} - {str(e)}"
                        )
                        record.failed_tasks += 1
                else:
                    record.add_log(
                        LogType.TASK_FAILED_STEP,
                        "no_worker",
                        f"⚠️ 未找到 Worker，跳过任务：{task_def['subject']}"
                    )
                    record.failed_tasks += 1
                execution_storage.save(record)

            # 完成
            record.status = ExecutionStatus.COMPLETED
            record.completed_at = datetime.now()
            record.add_log(
                LogType.EXECUTION_COMPLETED,
                "execution_completed",
                f"🎉 执行完成！共 {record.completed_tasks} 个任务成功，{record.failed_tasks} 个失败"
            )
            execution_storage.save(record)
            await event_service.emit(team_id, SSEEventType.EXECUTION_COMPLETED, record.to_sse_data())

        except Exception as e:
            record.status = ExecutionStatus.FAILED
            record.completed_at = datetime.now()
            record.add_log(
                LogType.EXECUTION_FAILED,
                "execution_failed",
                f"❌ 执行失败：{str(e)}"
            )
            execution_storage.save(record)
            await event_service.emit(team_id, SSEEventType.EXECUTION_FAILED, record.to_sse_data())

        return record


# 全局单例
orchestrator_agent = OrchestratorAgent()
