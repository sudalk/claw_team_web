"""Core configuration for ClawTeam Web API."""

import os
from pathlib import Path
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings."""

    # ClawTeam data directory
    clawteam_dir: Path = Path.home() / ".clawteam"

    # API settings
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    api_prefix: str = "/api/v1"

    # CORS settings
    cors_origins: list[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]

    # LLM settings
    llm_provider: str = "minimax"  # "anthropic" | "minimax"
    llm_base_url: str = "https://api.minimaxi.com/anthropic/v1"
    llm_api_key: str = ""
    llm_model: str = "application-3.5-sonnet-20250514"
    llm_max_tokens: int = 8192
    llm_temperature: float = 0.7

    # Execution settings
    execution_timeout: int = 3600  # 默认超时 1 小时
    task_poll_interval: int = 5   # 任务状态轮询间隔（秒）

    class Config:
        env_prefix = "CLAWTEAM_WEB_"
        extra = "allow"  # Allow extra fields

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        # 优先从环境变量读取 LLM 配置
        # 支持 ANTHROPIC_* 前缀
        if not self.llm_api_key:
            self.llm_api_key = os.environ.get("ANTHROPIC_API_KEY", "") or os.environ.get("ANTHROPIC_AUTH_TOKEN", "")
        if not self.llm_base_url or self.llm_base_url == "https://api.minimaxi.com/anthropic/v1":
            self.llm_base_url = os.environ.get("ANTHROPIC_BASE_URL", self.llm_base_url)
        if not self.llm_model:
            self.llm_model = os.environ.get("ANTHROPIC_MODEL", self.llm_model)


settings = Settings()
