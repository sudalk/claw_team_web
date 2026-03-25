"""Core configuration for ClawTeam Web API."""

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

    class Config:
        env_prefix = "CLAWTEAM_WEB_"


settings = Settings()
