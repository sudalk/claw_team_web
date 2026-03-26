"""Execution models - 自动执行记录的数据模型"""
from __future__ import annotations

import json
import uuid
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Optional

from pydantic import BaseModel, Field

from backend.core.config import settings


class ExecutionStatus(str, Enum):
    """执行状态"""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    STOPPED = "stopped"


class LogType(str, Enum):
    """日志类型"""
    # 思考过程
    THINKING = "thinking"           # AI 正在分析

    # 执行步骤
    STEP = "step"                  # 一般步骤
    TEAM_CREATING = "team_creating"
    TEAM_CREATED = "team_created"
    TEAM_FAILED = "team_failed"
    WORKER_SPAWNING = "worker_spawning"
    WORKER_SPAWNED = "worker_spawned"
    WORKER_FAILED = "worker_failed"
    TASK_CREATING = "task_creating"
    TASK_CREATED = "task_created"
    TASK_FAILED = "task_failed"
    TASK_ASSIGNING = "task_assigning"
    TASK_ASSIGNED = "task_assigned"

    # 执行状态
    TASK_RUNNING = "task_running"
    TASK_COMPLETED = "task_completed"
    TASK_FAILED_STEP = "task_failed_step"

    # 最终结果
    EXECUTION_STARTED = "execution_started"
    EXECUTION_COMPLETED = "execution_completed"
    EXECUTION_FAILED = "execution_failed"
    EXECUTION_STOPPED = "execution_stopped"

    # 用户交互
    USER_FEEDBACK = "user_feedback"


class ExecutionLog(BaseModel):
    """执行日志条目"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4())[:8])
    log_type: LogType
    step: str           # 步骤名称
    content: str        # 日志内容
    detail: Optional[dict] = None  # 额外数据
    timestamp: datetime = Field(default_factory=datetime.now)

    def to_sse_data(self) -> dict:
        """转换为 SSE 传输格式"""
        return {
            "id": self.id,
            "type": self.log_type.value,
            "step": self.step,
            "content": self.content,
            "detail": self.detail,
            "timestamp": self.timestamp.isoformat(),
        }


class ExecutionRecord(BaseModel):
    """一次完整的执行记录"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4())[:12])
    prompt: str
    team_id: Optional[str] = None
    workdir: Optional[str] = None  # 用户指定的工作目录
    status: ExecutionStatus = ExecutionStatus.PENDING
    logs: list[ExecutionLog] = []
    created_at: datetime = Field(default_factory=datetime.now)
    completed_at: Optional[datetime] = None

    # 任务统计
    total_tasks: int = 0
    completed_tasks: int = 0
    failed_tasks: int = 0

    def add_log(self, log_type: LogType, step: str, content: str, detail: Optional[dict] = None):
        """添加日志"""
        log = ExecutionLog(
            log_type=log_type,
            step=step,
            content=content,
            detail=detail,
        )
        self.logs.append(log)
        return log

    def get_progress(self) -> dict:
        """获取执行进度"""
        return {
            "total_tasks": self.total_tasks,
            "completed_tasks": self.completed_tasks,
            "failed_tasks": self.failed_tasks,
            "progress_percent": (
                int((self.completed_tasks + self.failed_tasks) / self.total_tasks * 100)
                if self.total_tasks > 0 else 0
            ),
        }

    def to_sse_data(self) -> dict:
        """转换为 SSE 传输格式"""
        return {
            "id": self.id,
            "prompt": self.prompt,
            "team_id": self.team_id,
            "status": self.status.value,
            "total_tasks": self.total_tasks,
            "completed_tasks": self.completed_tasks,
            "failed_tasks": self.failed_tasks,
            "progress_percent": self.get_progress()["progress_percent"],
            "timestamp": datetime.now().isoformat(),
        }


class ExecutionStorage:
    """执行记录存储"""

    def __init__(self):
        self.base_dir = settings.clawteam_dir / "executions"
        self.base_dir.mkdir(parents=True, exist_ok=True)

    def _get_execution_dir(self, execution_id: str) -> Path:
        return self.base_dir / execution_id

    def save(self, record: ExecutionRecord) -> None:
        """保存执行记录"""
        exec_dir = self._get_execution_dir(record.id)
        exec_dir.mkdir(parents=True, exist_ok=True)

        meta_path = exec_dir / "meta.json"
        logs_path = exec_dir / "logs.json"

        # 保存元数据（不含 logs）
        meta = record.model_dump()
        meta["logs"] = []  # logs 单独保存
        meta["created_at"] = record.created_at.isoformat()
        meta["completed_at"] = record.completed_at.isoformat() if record.completed_at else None

        with open(meta_path, "w", encoding="utf-8") as f:
            json.dump(meta, f, indent=2, ensure_ascii=False)

        # 保存日志
        logs_data = [
            {
                **log.model_dump(),
                "timestamp": log.timestamp.isoformat(),
            }
            for log in record.logs
        ]
        with open(logs_path, "w", encoding="utf-8") as f:
            json.dump(logs_data, f, indent=2, ensure_ascii=False)

    def load(self, execution_id: str) -> Optional[ExecutionRecord]:
        """加载执行记录"""
        exec_dir = self._get_execution_dir(execution_id)
        meta_path = exec_dir / "meta.json"
        logs_path = exec_dir / "logs.json"

        if not meta_path.exists():
            return None

        # 加载元数据
        with open(meta_path, "r", encoding="utf-8") as f:
            meta = json.load(f)

        # 加载日志
        logs = []
        if logs_path.exists():
            with open(logs_path, "r", encoding="utf-8") as f:
                logs_data = json.load(f)
            for log_data in logs_data:
                log_data["timestamp"] = datetime.fromisoformat(log_data["timestamp"])
                log_data["log_type"] = LogType(log_data["log_type"])
                logs.append(ExecutionLog(**log_data))

        meta["logs"] = logs
        meta["created_at"] = datetime.fromisoformat(meta["created_at"])
        if meta.get("completed_at"):
            meta["completed_at"] = datetime.fromisoformat(meta["completed_at"])
        meta["status"] = ExecutionStatus(meta["status"])

        return ExecutionRecord(**meta)

    def list(self) -> list[ExecutionRecord]:
        """列出所有执行记录（含完整日志）"""
        records = []
        if not self.base_dir.exists():
            return records
        for exec_dir in self.base_dir.iterdir():
            if exec_dir.is_dir():
                record = self.load(exec_dir.name)
                if record:
                    records.append(record)
        return sorted(records, key=lambda r: r.created_at, reverse=True)

    def list_meta_only(self) -> list[ExecutionRecord]:
        """列出所有执行记录（仅元数据，不加载日志，性能更好）"""
        records = []
        if not self.base_dir.exists():
            return records
        for exec_dir in self.base_dir.iterdir():
            if exec_dir.is_dir():
                meta_path = exec_dir / "meta.json"
                if not meta_path.exists():
                    continue
                try:
                    with open(meta_path, "r", encoding="utf-8") as f:
                        meta = json.load(f)
                    meta["logs"] = []
                    meta["created_at"] = datetime.fromisoformat(meta["created_at"])
                    if meta.get("completed_at"):
                        meta["completed_at"] = datetime.fromisoformat(meta["completed_at"])
                    meta["status"] = ExecutionStatus(meta["status"])
                    records.append(ExecutionRecord(**meta))
                except Exception:
                    continue
        return sorted(records, key=lambda r: r.created_at, reverse=True)

    def delete(self, execution_id: str) -> bool:
        """删除执行记录"""
        import shutil
        exec_dir = self._get_execution_dir(execution_id)
        if exec_dir.exists() and exec_dir.is_dir():
            shutil.rmtree(exec_dir)
            return True
        return False

    def cleanup(self, max_age_days: int = 7) -> int:
        """清理过期的执行记录"""
        import shutil
        cleaned = 0
        if not self.base_dir.exists():
            return cleaned
        cutoff = datetime.now().timestamp() - max_age_days * 86400
        for exec_dir in self.base_dir.iterdir():
            if exec_dir.is_dir():
                meta_path = exec_dir / "meta.json"
                if meta_path.exists():
                    try:
                        with open(meta_path, "r", encoding="utf-8") as f:
                            meta = json.load(f)
                        created = datetime.fromisoformat(meta["created_at"]).timestamp()
                        if created < cutoff:
                            shutil.rmtree(exec_dir)
                            cleaned += 1
                    except Exception:
                        continue
        return cleaned


# 全局单例
execution_storage = ExecutionStorage()
