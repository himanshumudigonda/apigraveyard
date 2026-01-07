"""
API Key patterns and scanner for detecting exposed credentials.
"""

import re
from pathlib import Path
from dataclasses import dataclass
from typing import AsyncIterator
import aiofiles
import aiofiles.os

# API Key patterns with service detection
API_PATTERNS: dict[str, re.Pattern] = {
    "OpenAI": re.compile(r'sk-[a-zA-Z0-9]{20}T3BlbkFJ[a-zA-Z0-9]{20}'),
    "OpenAI (Project)": re.compile(r'sk-proj-[a-zA-Z0-9_-]{80,}'),
    "Anthropic": re.compile(r'sk-ant-api03-[a-zA-Z0-9_-]{93}'),
    "Groq": re.compile(r'gsk_[a-zA-Z0-9]{52}'),
    "GitHub (PAT)": re.compile(r'ghp_[a-zA-Z0-9]{36}'),
    "GitHub (OAuth)": re.compile(r'gho_[a-zA-Z0-9]{36}'),
    "GitHub (App)": re.compile(r'ghs_[a-zA-Z0-9]{36}'),
    "Stripe (Live)": re.compile(r'sk_live_[a-zA-Z0-9]{24,}'),
    "Stripe (Test)": re.compile(r'sk_test_[a-zA-Z0-9]{24,}'),
    "Google/Firebase": re.compile(r'AIza[a-zA-Z0-9_-]{35}'),
    "AWS Access Key": re.compile(r'AKIA[A-Z0-9]{16}'),
    "Hugging Face": re.compile(r'hf_[a-zA-Z0-9]{34}'),
    "Slack Bot": re.compile(r'xoxb-[0-9]{10,}-[0-9]{10,}-[a-zA-Z0-9]{24}'),
    "Slack User": re.compile(r'xoxp-[0-9]{10,}-[0-9]{10,}-[a-zA-Z0-9]{24}'),
    "Discord Bot": re.compile(r'[MN][a-zA-Z0-9]{23,}\.[a-zA-Z0-9_-]{6}\.[a-zA-Z0-9_-]{27,}'),
    "Twilio": re.compile(r'SK[a-f0-9]{32}'),
    "SendGrid": re.compile(r'SG\.[a-zA-Z0-9_-]{22}\.[a-zA-Z0-9_-]{43}'),
    "Mailgun": re.compile(r'key-[a-f0-9]{32}'),
    "Cloudflare": re.compile(r'[a-f0-9]{37}'),
    "Vercel": re.compile(r'[a-zA-Z0-9]{24}'),
}

# File patterns to ignore
IGNORE_PATTERNS = {
    "node_modules",
    ".git",
    "__pycache__",
    ".venv",
    "venv",
    ".env.example",
    ".env.template",
    "*.min.js",
    "*.min.css",
    "package-lock.json",
    "yarn.lock",
    "pnpm-lock.yaml",
    "Cargo.lock",
    "poetry.lock",
    ".next",
    "dist",
    "build",
    "target",
    ".idea",
    ".vscode",
}

# File extensions to scan
SCAN_EXTENSIONS = {
    ".py", ".js", ".ts", ".jsx", ".tsx", ".mjs", ".cjs",
    ".json", ".yaml", ".yml", ".toml", ".ini", ".cfg",
    ".env", ".sh", ".bash", ".zsh", ".fish",
    ".go", ".rs", ".rb", ".php", ".java", ".kt", ".scala",
    ".cs", ".fs", ".vb", ".swift", ".m", ".h",
    ".c", ".cpp", ".cc", ".cxx", ".hpp",
    ".html", ".htm", ".xml", ".md", ".txt",
    ".dockerfile", ".conf", ".properties",
}


@dataclass
class APIKeyMatch:
    """Represents a found API key."""
    service: str
    key: str
    masked_key: str
    file_path: str
    line_number: int
    column: int
    line_content: str
    status: str = "UNTESTED"
    details: str = ""


def mask_key(key: str) -> str:
    """Mask an API key for safe display."""
    if len(key) <= 12:
        return key[:4] + "***" + key[-4:]
    return key[:6] + "***..." + "***" + key[-6:]


def should_ignore(path: Path) -> bool:
    """Check if a path should be ignored."""
    path_str = str(path)
    for pattern in IGNORE_PATTERNS:
        if pattern in path_str:
            return True
    return False


def should_scan(path: Path) -> bool:
    """Check if a file should be scanned."""
    if path.suffix.lower() in SCAN_EXTENSIONS:
        return True
    # Also scan files without extension if they look like config files
    if path.suffix == "" and path.name.startswith("."):
        return True
    return False


async def scan_file(file_path: Path) -> list[APIKeyMatch]:
    """Scan a single file for API keys."""
    matches: list[APIKeyMatch] = []
    
    try:
        async with aiofiles.open(file_path, "r", encoding="utf-8", errors="ignore") as f:
            line_number = 0
            async for line in f:
                line_number += 1
                for service, pattern in API_PATTERNS.items():
                    for match in pattern.finditer(line):
                        key = match.group()
                        matches.append(APIKeyMatch(
                            service=service,
                            key=key,
                            masked_key=mask_key(key),
                            file_path=str(file_path),
                            line_number=line_number,
                            column=match.start() + 1,
                            line_content=line.strip()[:100],
                        ))
    except Exception:
        pass  # Skip files that can't be read
    
    return matches


async def scan_directory(
    directory: Path,
    progress_callback=None,
) -> AsyncIterator[APIKeyMatch]:
    """
    Scan a directory recursively for API keys.
    Yields matches as they are found.
    """
    files_scanned = 0
    
    for path in directory.rglob("*"):
        if not path.is_file():
            continue
        if should_ignore(path):
            continue
        if not should_scan(path):
            continue
        
        files_scanned += 1
        if progress_callback:
            await progress_callback(files_scanned, str(path.name))
        
        for match in await scan_file(path):
            yield match


async def quick_scan(directory: str | Path) -> list[APIKeyMatch]:
    """Quick scan that returns all matches at once."""
    directory = Path(directory)
    matches: list[APIKeyMatch] = []
    
    async for match in scan_directory(directory):
        matches.append(match)
    
    return matches


def get_service_emoji(service: str) -> str:
    """Get an emoji for a service."""
    emojis = {
        "OpenAI": "🤖",
        "OpenAI (Project)": "🤖",
        "Anthropic": "🧠",
        "Groq": "⚡",
        "GitHub": "🐙",
        "Stripe": "💳",
        "Google": "🔵",
        "Firebase": "🔥",
        "AWS": "☁️",
        "Hugging Face": "🤗",
        "Slack": "💬",
        "Discord": "🎮",
        "Twilio": "📱",
        "SendGrid": "📧",
        "Mailgun": "📬",
        "Cloudflare": "🌐",
        "Vercel": "▲",
    }
    for key, emoji in emojis.items():
        if key in service:
            return emoji
    return "🔑"
