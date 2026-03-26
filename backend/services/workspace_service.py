import os
from pathlib import Path
from typing import List, Dict, Any, Optional
from datetime import datetime
from backend.core.config import settings

class WorkspaceService:
    """Service for browsing and reading workspace files."""

    def __init__(self):
        self.clawteam_dir = settings.clawteam_dir
        self.home_dir = Path.home().resolve()

    def _safe_path(self, path_str: str) -> Path:
        """
        Validate and return a safe Path object.
        Ensures the path is within the user's home directory.
        """
        # Handle both absolute and relative paths
        p = Path(path_str).expanduser()
        if not p.is_absolute():
            target_path = (self.clawteam_dir / p).resolve()
        else:
            target_path = p.resolve()
        
        # Security: Check if target_path is under home_dir
        try:
            common = os.path.commonpath([str(self.home_dir), str(target_path)])
            if common != str(self.home_dir):
                raise ValueError(f"Access denied: Path {path_str} is outside your home directory boundaries.")
        except Exception as e:
            raise ValueError(f"Invalid path: {str(e)}")

        return target_path

    def list_directory(self, path_str: str) -> List[Dict[str, Any]]:
        """List contents of a directory."""
        target_dir = self._safe_path(path_str)
        
        if not target_dir.exists():
            raise FileNotFoundError(f"Directory not found: {path_str}")
        if not target_dir.is_dir():
            raise ValueError(f"Path is not a directory: {path_str}")

        results = []
        for entry in os.scandir(target_dir):
            stat = entry.stat()
            results.append({
                "name": entry.name,
                "path": str(Path(entry.path).resolve()),
                "type": "directory" if entry.is_dir() else "file",
                "size": stat.st_size,
                "mtime": datetime.fromtimestamp(stat.st_mtime).isoformat(),
                "is_hidden": entry.name.startswith(".")
            })
        
        # Sort: directories first, then by name
        results.sort(key=lambda x: (x["type"] != "directory", x["name"].lower()))
        return results

    def read_file(self, path_str: str, max_size_mb: int = 1) -> Dict[str, Any]:
        """Read content of a file."""
        target_file = self._safe_path(path_str)
        
        if not target_file.exists():
            raise FileNotFoundError(f"File not found: {path_str}")
        if not target_file.is_file():
            raise ValueError(f"Path is not a file: {path_str}")

        stat = target_file.stat()
        if stat.st_size > max_size_mb * 1024 * 1024:
            return {
                "name": target_file.name,
                "path": str(target_file),
                "type": "file",
                "size": stat.st_size,
                "content": f"Error: File is too large to preview ({stat.st_size} bytes). Max limit is {max_size_mb}MB.",
                "truncated": True
            }

        try:
            with open(target_file, "r", encoding="utf-8") as f:
                content = f.read()
            return {
                "name": target_file.name,
                "path": str(target_file),
                "type": "file",
                "size": stat.st_size,
                "content": content,
                "mtime": datetime.fromtimestamp(stat.st_mtime).isoformat(),
                "truncated": False
            }
        except UnicodeDecodeError:
            return {
                "name": target_file.name,
                "path": str(target_file),
                "type": "file",
                "size": stat.st_size,
                "content": "Error: Binary file or unsupported encoding. Cannot preview.",
                "truncated": True
            }
        except Exception as e:
            raise Exception(f"Failed to read file: {str(e)}")

workspace_service = WorkspaceService()
