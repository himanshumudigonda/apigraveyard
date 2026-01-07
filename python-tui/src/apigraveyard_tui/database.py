"""
Local JSON database for storing API keys and projects.
"""

import json
import aiofiles
import aiofiles.os
from pathlib import Path
from datetime import datetime
from dataclasses import dataclass, asdict, field
from typing import Any

from .scanner import APIKeyMatch


# Database file location
DB_PATH = Path.home() / ".apigraveyard_tui.json"


@dataclass
class StoredKey:
    """A stored API key with metadata."""
    service: str
    key: str
    masked_key: str
    file_path: str
    line_number: int
    column: int
    status: str = "UNTESTED"
    details: str = ""
    last_tested: str | None = None
    added_at: str = field(default_factory=lambda: datetime.now().isoformat())


@dataclass
class Project:
    """A scanned project."""
    name: str
    path: str
    keys: list[StoredKey] = field(default_factory=list)
    total_files: int = 0
    last_scanned: str = field(default_factory=lambda: datetime.now().isoformat())


@dataclass
class Database:
    """The complete database."""
    projects: list[Project] = field(default_factory=list)
    banned_keys: list[str] = field(default_factory=list)
    groq_api_key: str | None = None
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())
    version: str = "1.0.0"


def _serialize(obj: Any) -> Any:
    """Serialize dataclass objects to dicts."""
    if hasattr(obj, "__dataclass_fields__"):
        return asdict(obj)
    return obj


def _deserialize_key(data: dict) -> StoredKey:
    """Deserialize a stored key."""
    return StoredKey(
        service=data.get("service", "Unknown"),
        key=data.get("key", ""),
        masked_key=data.get("masked_key", "***"),
        file_path=data.get("file_path", ""),
        line_number=data.get("line_number", 0),
        column=data.get("column", 0),
        status=data.get("status", "UNTESTED"),
        details=data.get("details", ""),
        last_tested=data.get("last_tested"),
        added_at=data.get("added_at", datetime.now().isoformat()),
    )


def _deserialize_project(data: dict) -> Project:
    """Deserialize a project."""
    return Project(
        name=data.get("name", "Unknown"),
        path=data.get("path", ""),
        keys=[_deserialize_key(k) for k in data.get("keys", [])],
        total_files=data.get("total_files", 0),
        last_scanned=data.get("last_scanned", datetime.now().isoformat()),
    )


def _deserialize_database(data: dict) -> Database:
    """Deserialize the database."""
    return Database(
        projects=[_deserialize_project(p) for p in data.get("projects", [])],
        banned_keys=data.get("banned_keys", []),
        groq_api_key=data.get("groq_api_key"),
        created_at=data.get("created_at", datetime.now().isoformat()),
        version=data.get("version", "1.0.0"),
    )


async def load_database() -> Database:
    """Load the database from disk."""
    try:
        if await aiofiles.os.path.exists(DB_PATH):
            async with aiofiles.open(DB_PATH, "r", encoding="utf-8") as f:
                content = await f.read()
                data = json.loads(content)
                return _deserialize_database(data)
    except Exception:
        pass
    
    return Database()


async def save_database(db: Database) -> None:
    """Save the database to disk."""
    try:
        content = json.dumps(_serialize(db), indent=2, default=str)
        async with aiofiles.open(DB_PATH, "w", encoding="utf-8") as f:
            await f.write(content)
    except Exception as e:
        raise RuntimeError(f"Failed to save database: {e}")


async def add_project(project: Project) -> None:
    """Add or update a project in the database."""
    db = await load_database()
    
    # Find existing project by path
    for i, p in enumerate(db.projects):
        if p.path == project.path:
            db.projects[i] = project
            await save_database(db)
            return
    
    # Add new project
    db.projects.append(project)
    await save_database(db)


async def get_project(path: str) -> Project | None:
    """Get a project by path."""
    db = await load_database()
    for project in db.projects:
        if project.path == path:
            return project
    return None


async def get_all_projects() -> list[Project]:
    """Get all projects."""
    db = await load_database()
    return db.projects


async def delete_project(path: str) -> bool:
    """Delete a project by path."""
    db = await load_database()
    original_len = len(db.projects)
    db.projects = [p for p in db.projects if p.path != path]
    
    if len(db.projects) < original_len:
        await save_database(db)
        return True
    return False


async def update_key_status(
    project_path: str,
    key: str,
    status: str,
    details: str = "",
) -> None:
    """Update the status of a key."""
    db = await load_database()
    
    for project in db.projects:
        if project.path == project_path:
            for stored_key in project.keys:
                if stored_key.key == key:
                    stored_key.status = status
                    stored_key.details = details
                    stored_key.last_tested = datetime.now().isoformat()
                    await save_database(db)
                    return


async def add_banned_key(key: str) -> bool:
    """Add a key to the banned list."""
    db = await load_database()
    if key not in db.banned_keys:
        db.banned_keys.append(key)
        await save_database(db)
        return True
    return False


async def get_banned_keys() -> list[str]:
    """Get all banned keys."""
    db = await load_database()
    return db.banned_keys


async def set_groq_api_key(key: str | None) -> None:
    """Set the Groq API key."""
    db = await load_database()
    db.groq_api_key = key
    await save_database(db)


async def get_groq_api_key() -> str | None:
    """Get the stored Groq API key."""
    db = await load_database()
    return db.groq_api_key


async def get_stats() -> dict:
    """Get database statistics."""
    db = await load_database()
    
    total_keys = 0
    valid_keys = 0
    invalid_keys = 0
    
    services: dict[str, int] = {}
    
    for project in db.projects:
        for key in project.keys:
            total_keys += 1
            if key.status == "VALID":
                valid_keys += 1
            elif key.status == "INVALID":
                invalid_keys += 1
            
            services[key.service] = services.get(key.service, 0) + 1
    
    return {
        "total_projects": len(db.projects),
        "total_keys": total_keys,
        "valid_keys": valid_keys,
        "invalid_keys": invalid_keys,
        "untested_keys": total_keys - valid_keys - invalid_keys,
        "banned_keys": len(db.banned_keys),
        "services": services,
        "has_groq_key": db.groq_api_key is not None,
    }


def match_to_stored(match: APIKeyMatch) -> StoredKey:
    """Convert an APIKeyMatch to a StoredKey."""
    return StoredKey(
        service=match.service,
        key=match.key,
        masked_key=match.masked_key,
        file_path=match.file_path,
        line_number=match.line_number,
        column=match.column,
        status=match.status,
        details=match.details,
    )
