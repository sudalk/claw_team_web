"""Auto mode API - 自动执行相关 API"""

import asyncio
from typing import AsyncGenerator

from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel

from backend.models.execution import (
    ExecutionRecord,
    ExecutionStatus,
    execution_storage,
)
from backend.services.orchestrator import orchestrator_agent


router = APIRouter(prefix="/auto", tags=["auto"])


class ExecuteRequest(BaseModel):
    """启动自动执行的请求"""
    prompt: str
    team_name: str | None = None
    model: str | None = None  # 可选，指定 LLM 模型


class ExecuteResponse(BaseModel):
    """启动自动执行的响应"""
    execution_id: str
    team_id: str
    status: str
    stream_url: str


class ExecutionStatusResponse(BaseModel):
    """执行状态响应"""
    id: str
    prompt: str
    team_id: str | None
    status: str
    total_tasks: int
    completed_tasks: int
    failed_tasks: int
    progress_percent: int
    logs: list[dict]
    created_at: str
    completed_at: str | None


@router.post("/execute", response_model=ExecuteResponse)
async def start_execution(
    request: ExecuteRequest,
    background_tasks: BackgroundTasks,
):
    """启动自动执行"""
    # 检查是否有正在运行的执行
    records = execution_storage.list()
    running = [r for r in records if r.status == ExecutionStatus.RUNNING]
    if running:
        raise HTTPException(
            status_code=409,
            detail="已有执行正在进行中，请等待完成或停止后再试"
        )

    # 创建执行记录
    team_id = request.team_name or f"auto-execution"

    # 异步执行
    async def run_orchestrator():
        await orchestrator_agent.execute(request.prompt, team_id)

    background_tasks.add_task(run_orchestrator)

    # 返回响应
    return ExecuteResponse(
        execution_id="pending",  # 会在 SSE 中获取真实 ID
        team_id=team_id,
        status="running",
        stream_url=f"/api/v1/auto/execute/{team_id}/stream",
    )


@router.get("/execute/{identifier}/stream")
async def stream_execution(identifier: str) -> AsyncGenerator[str, None]:
    """
    SSE 流式获取执行日志

    identifier 可以是 execution_id 或 team_id
    """
    # 尝试通过 team_id 查找（初始阶段）
    # 查找最新的执行记录
    records = execution_storage.list()
    record = None

    # 如果 identifier 是 team_id，找对应的执行
    for r in records:
        if r.team_id == identifier or r.id == identifier:
            record = r
            break

    if not record:
        # 还没创建记录，发送初始消息
        yield f"data: {{'type': 'connected', 'team_id': '{identifier}', 'status': 'initializing'}}\n\n"
        # 等待记录创建
        for _ in range(30):  # 最多等 30 秒
            await asyncio.sleep(1)
            records = execution_storage.list()
            for r in records:
                if r.team_id == identifier or r.id == identifier:
                    record = r
                    break
            if record:
                break

    if not record:
        yield f"data: {{'type': 'error', 'content': '执行记录未找到'}}\n\n"
        return

    # 流式发送日志
    last_log_count = 0
    while True:
        if record.status in [ExecutionStatus.COMPLETED, ExecutionStatus.FAILED, ExecutionStatus.STOPPED]:
            # 发送最后的状态
            yield f"data: {record.to_sse_data()}\n\n"
            break

        # 检查新日志
        if len(record.logs) > last_log_count:
            for log in record.logs[last_log_count:]:
                yield f"data: {log.to_sse_data()}\n\n"
            last_log_count = len(record.logs)

        await asyncio.sleep(1)

        # 重新加载记录
        record = execution_storage.load(record.id)
        if not record:
            break


@router.get("/execute/{execution_id}", response_model=ExecutionStatusResponse)
async def get_execution_status(execution_id: str):
    """获取执行状态"""
    record = execution_storage.load(execution_id)

    if not record:
        raise HTTPException(status_code=404, detail="执行记录不存在")

    progress = record.get_progress()

    return ExecutionStatusResponse(
        id=record.id,
        prompt=record.prompt,
        team_id=record.team_id,
        status=record.status.value,
        total_tasks=progress["total_tasks"],
        completed_tasks=progress["completed_tasks"],
        failed_tasks=progress["failed_tasks"],
        progress_percent=progress["progress_percent"],
        logs=[log.to_sse_data() for log in record.logs],
        created_at=record.created_at.isoformat(),
        completed_at=record.completed_at.isoformat() if record.completed_at else None,
    )


@router.get("/executions")
async def list_executions():
    """列出所有执行记录"""
    records = execution_storage.list()
    return {
        "executions": [
            {
                "id": r.id,
                "prompt": r.prompt,
                "team_id": r.team_id,
                "status": r.status.value,
                "total_tasks": r.total_tasks,
                "completed_tasks": r.completed_tasks,
                "failed_tasks": r.failed_tasks,
                "created_at": r.created_at.isoformat(),
                "completed_at": r.completed_at.isoformat() if r.completed_at else None,
            }
            for r in records
        ],
        "total": len(records),
    }


class StopResponse(BaseModel):
    """停止执行的响应"""
    execution_id: str
    status: str
    message: str


@router.post("/execute/{execution_id}/stop", response_model=StopResponse)
async def stop_execution(execution_id: str):
    """停止执行"""
    record = execution_storage.load(execution_id)

    if not record:
        raise HTTPException(status_code=404, detail="执行记录不存在")

    if record.status != ExecutionStatus.RUNNING:
        raise HTTPException(status_code=400, detail="执行不在运行中")

    record.status = ExecutionStatus.STOPPED
    execution_storage.save(record)

    return StopResponse(
        execution_id=record.id,
        status="stopped",
        message="执行已停止"
    )
