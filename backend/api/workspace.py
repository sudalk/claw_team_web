from typing import List, Dict, Any, Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from backend.services.workspace_service import workspace_service

router = APIRouter(prefix="/workspace", tags=["workspace"])

class FileInfo(BaseModel):
    name: str
    path: str
    type: str  # "file" | "directory"
    size: int
    mtime: str
    is_hidden: bool

class DirectoryListing(BaseModel):
    items: List[FileInfo]
    path: str

class FileContent(BaseModel):
    name: str
    path: str
    type: str
    size: int
    content: str
    mtime: Optional[str] = None
    truncated: bool

@router.get("/list", response_model=DirectoryListing)
async def list_directory(path: str = Query(None, description="Absolute path or relative to clawteam directory")):
    """List contents of a directory."""
    try:
        items = workspace_service.list_directory(path)
        return DirectoryListing(items=[FileInfo(**item) for item in items], path=path or "/")
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/file", response_model=FileContent)
async def read_file(path: str = Query(..., description="Path to the file to read")):
    """Read content of a file."""
    try:
        result = workspace_service.read_file(path)
        return FileContent(**result)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
