"""CLI detection API endpoint."""

from fastapi import APIRouter

from backend.models.schemas import CLIListResponse
from backend.services.cli_service import cli_service

router = APIRouter(prefix="/clis", tags=["clis"])


@router.get("", response_model=CLIListResponse)
async def list_clis():
    """List all supported CLIs with their installation status."""
    return cli_service.list_clis()
