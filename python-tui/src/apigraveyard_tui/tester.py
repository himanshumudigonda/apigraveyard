"""
API Key tester - Validates keys against their respective services.
"""

import asyncio
import httpx
from dataclasses import dataclass
from typing import Literal

from .scanner import APIKeyMatch

KeyStatus = Literal["VALID", "INVALID", "EXPIRED", "RATE_LIMITED", "ERROR", "UNTESTED"]


@dataclass
class TestResult:
    """Result of testing an API key."""
    key: APIKeyMatch
    status: KeyStatus
    details: str
    response_time_ms: float


# Rate limiting - delay between tests
TEST_DELAY_MS = 500


async def test_openai_key(key: str, client: httpx.AsyncClient) -> tuple[KeyStatus, str]:
    """Test an OpenAI API key."""
    try:
        response = await client.get(
            "https://api.openai.com/v1/models",
            headers={"Authorization": f"Bearer {key}"},
            timeout=10.0,
        )
        if response.status_code == 200:
            data = response.json()
            model_count = len(data.get("data", []))
            return "VALID", f"{model_count} models available"
        elif response.status_code == 401:
            return "INVALID", "Invalid API key"
        elif response.status_code == 429:
            return "RATE_LIMITED", "Rate limited or quota exceeded"
        else:
            return "ERROR", f"HTTP {response.status_code}"
    except Exception as e:
        return "ERROR", str(e)


async def test_anthropic_key(key: str, client: httpx.AsyncClient) -> tuple[KeyStatus, str]:
    """Test an Anthropic API key."""
    try:
        response = await client.get(
            "https://api.anthropic.com/v1/models",
            headers={
                "x-api-key": key,
                "anthropic-version": "2023-06-01",
            },
            timeout=10.0,
        )
        if response.status_code == 200:
            return "VALID", "Key is valid"
        elif response.status_code == 401:
            return "INVALID", "Invalid API key"
        elif response.status_code == 429:
            return "RATE_LIMITED", "Rate limited"
        else:
            return "ERROR", f"HTTP {response.status_code}"
    except Exception as e:
        return "ERROR", str(e)


async def test_groq_key(key: str, client: httpx.AsyncClient) -> tuple[KeyStatus, str]:
    """Test a Groq API key."""
    try:
        response = await client.get(
            "https://api.groq.com/openai/v1/models",
            headers={"Authorization": f"Bearer {key}"},
            timeout=10.0,
        )
        if response.status_code == 200:
            data = response.json()
            model_count = len(data.get("data", []))
            return "VALID", f"{model_count} models available"
        elif response.status_code == 401:
            return "INVALID", "Invalid API key"
        elif response.status_code == 429:
            return "RATE_LIMITED", "Rate limited"
        else:
            return "ERROR", f"HTTP {response.status_code}"
    except Exception as e:
        return "ERROR", str(e)


async def test_github_key(key: str, client: httpx.AsyncClient) -> tuple[KeyStatus, str]:
    """Test a GitHub API key."""
    try:
        response = await client.get(
            "https://api.github.com/user",
            headers={
                "Authorization": f"Bearer {key}",
                "Accept": "application/vnd.github+json",
            },
            timeout=10.0,
        )
        if response.status_code == 200:
            data = response.json()
            username = data.get("login", "unknown")
            return "VALID", f"@{username}"
        elif response.status_code == 401:
            return "INVALID", "Invalid token"
        elif response.status_code == 403:
            return "RATE_LIMITED", "Rate limited"
        else:
            return "ERROR", f"HTTP {response.status_code}"
    except Exception as e:
        return "ERROR", str(e)


async def test_stripe_key(key: str, client: httpx.AsyncClient) -> tuple[KeyStatus, str]:
    """Test a Stripe API key."""
    try:
        response = await client.get(
            "https://api.stripe.com/v1/balance",
            auth=(key, ""),
            timeout=10.0,
        )
        if response.status_code == 200:
            mode = "live" if "sk_live_" in key else "test"
            return "VALID", f"Balance OK ({mode} mode)"
        elif response.status_code == 401:
            return "INVALID", "Invalid API key"
        elif response.status_code == 429:
            return "RATE_LIMITED", "Rate limited"
        else:
            return "ERROR", f"HTTP {response.status_code}"
    except Exception as e:
        return "ERROR", str(e)


async def test_huggingface_key(key: str, client: httpx.AsyncClient) -> tuple[KeyStatus, str]:
    """Test a Hugging Face API key."""
    try:
        response = await client.get(
            "https://huggingface.co/api/whoami-v2",
            headers={"Authorization": f"Bearer {key}"},
            timeout=10.0,
        )
        if response.status_code == 200:
            data = response.json()
            name = data.get("name", "unknown")
            return "VALID", f"User: {name}"
        elif response.status_code == 401:
            return "INVALID", "Invalid token"
        else:
            return "ERROR", f"HTTP {response.status_code}"
    except Exception as e:
        return "ERROR", str(e)


async def test_key(key: APIKeyMatch) -> TestResult:
    """Test a single API key."""
    import time
    start = time.time()
    
    async with httpx.AsyncClient() as client:
        service = key.service.lower()
        
        if "openai" in service:
            status, details = await test_openai_key(key.key, client)
        elif "anthropic" in service:
            status, details = await test_anthropic_key(key.key, client)
        elif "groq" in service:
            status, details = await test_groq_key(key.key, client)
        elif "github" in service:
            status, details = await test_github_key(key.key, client)
        elif "stripe" in service:
            status, details = await test_stripe_key(key.key, client)
        elif "hugging" in service:
            status, details = await test_huggingface_key(key.key, client)
        else:
            # Can't test these keys
            status, details = "UNTESTED", "Validation not supported"
    
    elapsed = (time.time() - start) * 1000
    
    return TestResult(
        key=key,
        status=status,
        details=details,
        response_time_ms=elapsed,
    )


async def test_keys(
    keys: list[APIKeyMatch],
    progress_callback=None,
) -> list[TestResult]:
    """Test multiple API keys with rate limiting."""
    results: list[TestResult] = []
    
    for i, key in enumerate(keys):
        if progress_callback:
            await progress_callback(i + 1, len(keys), key.service)
        
        result = await test_key(key)
        results.append(result)
        
        # Rate limiting delay
        if i < len(keys) - 1:
            await asyncio.sleep(TEST_DELAY_MS / 1000)
    
    return results


def get_status_color(status: KeyStatus) -> str:
    """Get the Rich color for a status."""
    colors = {
        "VALID": "green",
        "INVALID": "red",
        "EXPIRED": "yellow",
        "RATE_LIMITED": "orange3",
        "ERROR": "red3",
        "UNTESTED": "dim",
    }
    return colors.get(status, "white")


def get_status_emoji(status: KeyStatus) -> str:
    """Get emoji for a status."""
    emojis = {
        "VALID": "✅",
        "INVALID": "❌",
        "EXPIRED": "⏰",
        "RATE_LIMITED": "🚫",
        "ERROR": "⚠️",
        "UNTESTED": "❓",
    }
    return emojis.get(status, "❓")
