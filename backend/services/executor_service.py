"""Executor Service - Worker 执行器，处理任务依赖和 Claude Code 调用"""

import asyncio
import json
import os
import subprocess
from datetime import datetime
from pathlib import Path
from typing import Optional

from backend.core.config import settings
from backend.models.schemas import TaskStatus
from backend.services.task_service import task_service


class ExecutorService:
    """处理 Worker 执行任务的核心服务"""

    def __init__(self):
        self.clawteam_dir = settings.clawteam_dir

    def _get_task_status(self, task) -> Optional[str]:
        """安全获取任务状态"""
        if task is None:
            return None
        if isinstance(task, dict):
            return task.get("status")
        if hasattr(task, "status"):
            return task.status.value if hasattr(task.status, "value") else str(task.status)
        return None

    def _get_task_blocked_by(self, task) -> list:
        """安全获取任务 blocked_by"""
        if task is None:
            return []
        if isinstance(task, dict):
            return task.get("blocked_by") or []
        if hasattr(task, "blocked_by"):
            return task.blocked_by or []
        return []

    def _get_task_description(self, task) -> str:
        """安全获取任务描述"""
        if task is None:
            return ""
        if isinstance(task, dict):
            return task.get("description") or task.get("subject", "")
        if hasattr(task, "description"):
            return task.description or getattr(task, "subject", "")
        return ""

    def _get_task_subject(self, task) -> str:
        """安全获取任务标题"""
        if task is None:
            return ""
        if isinstance(task, dict):
            return task.get("subject", "")
        if hasattr(task, "subject"):
            return task.subject or ""
        return ""

    def check_dependencies_met(self, team_name: str, blocked_by: list[str]) -> tuple[bool, list[str]]:
        """检查所有依赖任务是否已完成"""
        pending_deps = []
        for dep_task_id in blocked_by:
            task = task_service.get_task(team_name, dep_task_id)
            status = self._get_task_status(task)
            if not status:
                pending_deps.append(dep_task_id)
            elif str(status).lower() != "completed":
                pending_deps.append(dep_task_id)

        return len(pending_deps) == 0, pending_deps

    async def execute_task(
        self,
        team_name: str,
        task_id: str,
        workdir: Optional[str] = None,
        cli: Optional[str] = None,
        skip_dep_check: bool = False,
    ) -> dict:
        """执行单个任务"""
        task = task_service.get_task(team_name, task_id)
        if not task:
            return {"success": False, "error": f"Task {task_id} not found"}

        # 检查依赖（orchestrator 已经处理过依赖等待，可以跳过）
        if not skip_dep_check:
            blocked_by = self._get_task_blocked_by(task)
            if blocked_by:
                deps_met, pending_deps = self.check_dependencies_met(team_name, blocked_by)
                if not deps_met:
                    return {
                        "success": False,
                        "error": f"Dependencies not met: {pending_deps}",
                        "waiting_for": pending_deps,
                    }

        # 确定工作目录
        if not workdir:
            workdir = str(self.clawteam_dir / "workspaces" / team_name)

        # 获取任务描述
        task_desc = self._get_task_description(task) or self._get_task_subject(task)

        # 确定使用的 CLI
        cli = cli or "codeflicker"

        # 执行任务
        result = await self._run_cli_task(task_desc, workdir, cli)

        if result["success"]:
            # 更新任务状态为完成
            task_service.update_task(
                team_name,
                task_id,
                {"status": "completed"}
            )
        else:
            # 更新任务状态为失败
            task_service.update_task(
                team_name,
                task_id,
                {"status": "failed"}
            )

        return result

    async def _run_cli_task(self, prompt: str, workdir: str, cli: str = "codeflicker") -> dict:
        """运行 CLI 工具执行任务"""
        # CLI 命令映射
        CLI_MAP = {
            "codeflicker": ["codeflicker", "--quiet", "--output-format", "json"],
            "claude": ["claude", "--print"],
            "codex": ["codex", "--quiet"],
            "gemini": ["gemini"],
            "nanobot": ["nanobot"],
        }

        try:
            # 确保工作目录存在
            Path(workdir).mkdir(parents=True, exist_ok=True)

            task_prompt = (
                f'请完成以下任务：\n\n{prompt}\n\n'
                f'要求：\n'
                f'1. 在当前目录 {workdir} 下工作\n'
                f'2. 如果需要创建新文件，请创建\n'
                f'3. 如果需要修改现有文件，请直接修改\n'
                f'4. 完成后确保代码可以正常运行\n'
                f'5. 不要创建 README 或文档文件\n\n'
                f'请开始执行任务。'
            )

            # 获取 CLI 基础命令
            base_cmd = CLI_MAP.get(cli, CLI_MAP["codeflicker"])
            cmd = base_cmd + [task_prompt]

            process = await asyncio.create_subprocess_exec(
                *cmd,
                cwd=workdir,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env={**os.environ, "HOME": str(Path.home())}
            )

            stdout, stderr = await asyncio.wait_for(
                process.communicate(),
                timeout=600  # 10 分钟超时
            )

            if process.returncode == 0:
                return {
                    "success": True,
                    "output": stdout.decode("utf-8", errors="replace"),
                }
            else:
                return {
                    "success": False,
                    "error": stderr.decode("utf-8", errors="replace") or "Unknown error",
                    "returncode": process.returncode,
                }

        except asyncio.TimeoutError:
            return {
                "success": False,
                "error": "Task execution timed out (10 minutes)",
            }
        except FileNotFoundError:
            return {
                "success": False,
                "error": f"{cli} CLI not found. Please install {cli}.",
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
            }

    async def wait_for_dependencies(
        self,
        team_name: str,
        task_id: str,
        blocked_by: list[str],
        timeout: int = 3600,
    ) -> bool:
        """等待依赖任务完成"""
        start_time = asyncio.get_event_loop().time()
        check_interval = 5  # 每 5 秒检查一次

        while asyncio.get_event_loop().time() - start_time < timeout:
            deps_met, _ = self.check_dependencies_met(team_name, blocked_by)
            if deps_met:
                return True
            await asyncio.sleep(check_interval)

        return False


# 全局单例
executor_service = ExecutorService()
