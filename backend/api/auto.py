"""Auto mode API - 自动执行相关 API"""

import asyncio
import json
import uuid
from typing import AsyncGenerator

from fastapi import APIRouter, HTTPException, BackgroundTasks
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from backend.models.execution import (
    ExecutionRecord,
    ExecutionStatus,
    execution_storage,
)
from backend.services.orchestrator import orchestrator_agent
from backend.services.advanced_agent import advanced_agent


router = APIRouter(prefix="/auto", tags=["auto"])


class ExecuteRequest(BaseModel):
    """启动自动执行的请求"""
    prompt: str
    team_name: str | None = None
    workdir: str | None = None  # 工作目录，如 "/Users/likang/geminicode/Agent/team_test"
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
    workdir: str | None
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
    records = execution_storage.list_meta_only()
    running = [r for r in records if r.status == ExecutionStatus.RUNNING]
    if running:
        raise HTTPException(
            status_code=409,
            detail="已有执行正在进行中，请等待完成或停止后再试"
        )

    # 生成唯一的 execution_id 和 team_id
    execution_id = str(uuid.uuid4())[:12]
    team_id = request.team_name or f"auto-{execution_id}"

    # 同步创建执行记录，确保 SSE stream 可以立即找到
    record = ExecutionRecord(
        id=execution_id,
        prompt=request.prompt,
        team_id=team_id,
        workdir=request.workdir,
        status=ExecutionStatus.RUNNING,
    )
    execution_storage.save(record)

    # 异步执行（传入已创建的 execution_id）
    async def run_orchestrator():
        await orchestrator_agent.execute(
            request.prompt, team_id,
            workdir=request.workdir,
            execution_id=execution_id,
        )

    background_tasks.add_task(run_orchestrator)

    # 返回响应
    return ExecuteResponse(
        execution_id=execution_id,
        team_id=team_id,
        status="running",
        stream_url=f"/api/v1/auto/execute/{team_id}/stream",
    )


@router.post("/execute-advanced", response_model=ExecuteResponse)
async def start_advanced_execution(
    request: ExecuteRequest,
    background_tasks: BackgroundTasks,
):
    """启动进阶自动执行 (ReAct 循环)"""
    records = execution_storage.list_meta_only()
    running = [r for r in records if r.status == ExecutionStatus.RUNNING]
    if running:
        raise HTTPException(
            status_code=409,
            detail="已有执行正在进行中，请等待完成或停止后再试"
        )

    execution_id = str(uuid.uuid4())[:12]
    team_id = request.team_name or f"auto-adv-{execution_id}"

    record = ExecutionRecord(
        id=execution_id,
        prompt=request.prompt,
        team_id=team_id,
        workdir=request.workdir,
        status=ExecutionStatus.RUNNING,
    )
    execution_storage.save(record)

    async def run_advanced_agent():
        await advanced_agent.execute(
            request.prompt, team_id,
            workdir=request.workdir,
            execution_id=execution_id,
        )

    background_tasks.add_task(run_advanced_agent)

    return ExecuteResponse(
        execution_id=execution_id,
        team_id=team_id,
        status="running",
        stream_url=f"/api/v1/auto/execute/{team_id}/stream",
    )

async def _stream_generator(identifier: str):
    """SSE 流生成器 - 组合历史日志与实时事件"""
    from backend.services.event_service import event_service
    
    # 1. 尝试加载现有记录以补齐历史日志
    record = execution_storage.load(identifier)
    
    # 如果 identifier 是 team_id，遍历搜索
    if not record:
        records = execution_storage.list()
        for r in records:
            if r.team_id == identifier or r.id == identifier:
                record = r
                break
                
    # 已有的内容先全部推过去
    sent_log_ids = set()
    if record:
        for log in record.logs:
            if log.id not in sent_log_ids:
                sent_log_ids.add(log.id)
                yield f"data: {json.dumps(log.to_sse_data())}\n\n"
            
    # 2. 订阅实时事件流
    queue = event_service.subscribe(identifier)
    try:
        # 再次检查加载后的这段时间是否有新保存的日志（防止订阅瞬间的消息丢失）
        # 这里使用 identifier 重新尝试 search
        latest_record = record
        if not latest_record:
             for r in execution_storage.list():
                if r.team_id == identifier or r.id == identifier:
                    latest_record = r
                    break
        else:
            latest_record = execution_storage.load(record.id)

        if latest_record:
            for log in latest_record.logs:
                if log.id not in sent_log_ids:
                    sent_log_ids.add(log.id)
                    yield f"data: {json.dumps(log.to_sse_data())}\n\n"
        
        # 3. 开始消费实时队列
        while True:
            try:
                event_str = await asyncio.wait_for(queue.get(), timeout=30)
                event_data = json.loads(event_str)
                
                # 兼容性处理：前端期望的是直接的 log 对象（含 id, content, type）
                # 而 event_service 发出的是 SSEEvent 对象（含 type, data）
                inner_data = event_data.get("data", {})
                log_id = inner_data.get("id")
                
                # 如果是日志类事件，直接向前端推送 inner_data，使其符合前端 ExecutionLog 接口
                if log_id:
                    if log_id in sent_log_ids:
                        continue
                    sent_log_ids.add(log_id)
                    # 确保 type 字段存在（前端解析需要）
                    if "type" not in inner_data and "type" in event_data:
                         # SSEEvent.type 是 EXECUTION_THINKING，而 Log.type 是 thinking
                         # 这里的转换逻辑在后端 emit 时已经保持一致，通常可以直接透传
                         pass
                    yield f"data: {json.dumps(inner_data)}\n\n"
                else:
                    # 如果不是标准日志（比如 start/stop 事件），推原始数据
                    yield f"data: {event_str}\n\n"
                
                # 终止条件
                if event_data.get("type") in ["execution_completed", "execution_failed", "execution_stopped"]:
                    break
                    
            except asyncio.TimeoutError:
                yield ": keepalive\n\n"
    finally:
        event_service.unsubscribe(identifier, queue)


@router.get("/execute/{identifier}/stream")
async def stream_execution(identifier: str):
    """
    SSE 流式获取执行日志

    identifier 可以是 execution_id 或 team_id
    """
    return StreamingResponse(
        _stream_generator(identifier),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )


@router.get("/execute/{identifier}", response_model=ExecutionStatusResponse)
async def get_execution_status(identifier: str):
    """获取执行状态"""
    # Try loading by execution ID first
    record = execution_storage.load(identifier)

    # If not found, try searching by team_id
    if not record:
        records = execution_storage.list()
        for r in records:
            if r.team_id == identifier:
                record = r
                break

    if not record:
        raise HTTPException(status_code=404, detail="执行记录不存在")

    progress = record.get_progress()

    return ExecutionStatusResponse(
        id=record.id,
        prompt=record.prompt,
        team_id=record.team_id,
        workdir=record.workdir,
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
                "workdir": r.workdir,
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


class DeleteResponse(BaseModel):
    """删除执行的响应"""
    execution_id: str
    success: bool
    message: str


@router.delete("/execute/{execution_id}", response_model=DeleteResponse)
async def delete_execution(execution_id: str):
    """删除执行记录"""
    success = execution_storage.delete(execution_id)

    if not success:
        raise HTTPException(status_code=404, detail="执行记录不存在")

    return DeleteResponse(
        execution_id=execution_id,
        success=True,
        message="执行记录已删除"
    )
