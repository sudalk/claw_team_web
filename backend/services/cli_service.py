"""CLI detection service - detects available AI CLI tools."""

import subprocess
import re
from pathlib import Path
from typing import Optional

from backend.models.schemas import CLIInfo, CLIListResponse, CLIVendor


# CLI metadata
CLI_METADATA = {
    CLIVendor.CLAUDE: {
        "name": "Claude CLI",
        "command": "claude",
        "vendor": "Anthropic",
        "emoji": "🧠",
        "description": "全能型助手，擅长深度思考",
        "use_cases": ["搭建新项目", "学习代码库", "写复杂功能", "代码审查"],
        "install_cmd": "npm install -g @anthropic-ai/claude",
    },
    CLIVendor.CODEX: {
        "name": "Codex CLI",
        "command": "codex",
        "vendor": "OpenAI",
        "emoji": "🤖",
        "description": "代码专家，调试神器",
        "use_cases": ["修复Bug", "代码补全", "写测试用例", "代码转换"],
        "install_cmd": "npm install -g openai-codex",
    },
    CLIVendor.CODEFLICKER: {
        "name": "Codeflicker",
        "command": "f",
        "vendor": "Codeflicker",
        "emoji": "⚡",
        "description": "闪电侠，速度至上",
        "use_cases": ["小改动", "简单脚本", "快速搜索", "批量重命名"],
        "install_cmd": "pip install codeflicker",
    },
    CLIVendor.NANOBOT: {
        "name": "Nanobot",
        "command": "nanobot",
        "vendor": "HKUDS",
        "emoji": "🔬",
        "description": "小巧精悍，精准打击",
        "use_cases": ["精准修改", "单文件任务", "快速原型", "配置调整"],
        "install_cmd": "pip install nanobot",
    },
    CLIVendor.GEMINI: {
        "name": "Gemini CLI",
        "command": "gemini",
        "vendor": "Google",
        "emoji": "✨",
        "description": "多模态全能选手",
        "use_cases": ["分析截图", "解读图表", "长文档处理", "设计稿反馈"],
        "install_cmd": "npm install -g @google/gemini-cli",
    },
}


class CLIService:
    """Service for detecting and managing CLI tools."""

    def _check_command(self, command: str) -> tuple[bool, Optional[str]]:
        """Check if a command is installed and return its version."""
        try:
            # Try --version first
            result = subprocess.run(
                [command, "--version"],
                capture_output=True,
                text=True,
                timeout=5,
            )
            if result.returncode == 0:
                version = result.stdout.strip() or result.stderr.strip()
                # Extract version number
                match = re.search(r"(\d+\.\d+\.\d+|\d+\.\d+)", version)
                if match:
                    return True, match.group(1)
                return True, version[:50] if version else "installed"

            # Try -v as fallback
            result = subprocess.run(
                [command, "-v"],
                capture_output=True,
                text=True,
                timeout=5,
            )
            if result.returncode == 0:
                version = result.stdout.strip() or result.stderr.strip()
                return True, version[:50] if version else "installed"

            return False, None

        except subprocess.TimeoutExpired:
            return False, None
        except FileNotFoundError:
            return False, None
        except Exception:
            return False, None

    def list_clis(self) -> CLIListResponse:
        """List all supported CLIs with their installation status."""
        clis = []

        for vendor, meta in CLI_METADATA.items():
            installed, version = self._check_command(meta["command"])
            clis.append(CLIInfo(
                command=meta["command"],
                name=meta["name"],
                vendor=meta["vendor"],
                installed=installed,
                version=version,
            ))

        return CLIListResponse(clis=clis)

    def get_cli_info(self, command: str) -> Optional[CLIInfo]:
        """Get info for a specific CLI."""
        for vendor, meta in CLI_METADATA.items():
            if meta["command"] == command:
                installed, version = self._check_command(meta["command"])
                return CLIInfo(
                    command=meta["command"],
                    name=meta["name"],
                    vendor=meta["vendor"],
                    installed=installed,
                    version=version,
                )
        return None


cli_service = CLIService()
