"""
Groq AI Chat Client with automatic model fallback.
"""

import httpx
from dataclasses import dataclass
from typing import AsyncIterator

# Hand-picked Groq models with fallback order
# Ordered by capability and reliability
GROQ_MODELS = [
    "llama-3.3-70b-versatile",      # Best overall
    "llama-3.1-70b-versatile",       # Solid fallback
    "llama-3.1-8b-instant",          # Fast, lightweight
    "mixtral-8x7b-32768",            # Good context window
    "gemma2-9b-it",                  # Alternative architecture
]

SYSTEM_PROMPT = """You are a helpful AI assistant embedded in APIgraveyard, a tool for finding and managing exposed API keys in codebases.

You help users with:
- Understanding API key security best practices
- Explaining what different API keys do (OpenAI, GitHub, Stripe, etc.)
- Advising on key rotation and security procedures
- Answering questions about the APIgraveyard tool
- General programming and security questions

Keep responses concise but helpful. Use emojis sparingly for friendliness.
When discussing API keys, emphasize security - never ask users to share actual keys."""


@dataclass
class ChatMessage:
    """A chat message."""
    role: str  # "user", "assistant", or "system"
    content: str


@dataclass 
class ChatResponse:
    """Response from the AI."""
    content: str
    model_used: str
    tokens_used: int


class GroqChatClient:
    """Groq chat client with automatic model fallback."""
    
    def __init__(self, api_key: str | None = None):
        self.api_key = api_key
        self.conversation: list[ChatMessage] = []
        self.current_model_index = 0
        self.base_url = "https://api.groq.com/openai/v1"
    
    def set_api_key(self, api_key: str):
        """Set or update the API key."""
        self.api_key = api_key
        self.current_model_index = 0  # Reset fallback on key change
    
    def clear_conversation(self):
        """Clear the conversation history."""
        self.conversation = []
    
    @property
    def current_model(self) -> str:
        """Get the current model being used."""
        return GROQ_MODELS[self.current_model_index]
    
    async def send_message(self, message: str) -> ChatResponse:
        """
        Send a message and get a response.
        Automatically falls back to other models if one fails.
        """
        if not self.api_key:
            return ChatResponse(
                content="⚠️ No Groq API key configured. Add a key to enable AI chat.",
                model_used="none",
                tokens_used=0,
            )
        
        # Add user message to history
        self.conversation.append(ChatMessage(role="user", content=message))
        
        # Build messages for API
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            *[{"role": m.role, "content": m.content} for m in self.conversation[-10:]],  # Last 10 messages
        ]
        
        # Try each model with fallback
        last_error = None
        for attempt in range(len(GROQ_MODELS)):
            model_index = (self.current_model_index + attempt) % len(GROQ_MODELS)
            model = GROQ_MODELS[model_index]
            
            try:
                async with httpx.AsyncClient() as client:
                    response = await client.post(
                        f"{self.base_url}/chat/completions",
                        headers={
                            "Authorization": f"Bearer {self.api_key}",
                            "Content-Type": "application/json",
                        },
                        json={
                            "model": model,
                            "messages": messages,
                            "temperature": 0.7,
                            "max_tokens": 1024,
                        },
                        timeout=30.0,
                    )
                    
                    if response.status_code == 200:
                        data = response.json()
                        content = data["choices"][0]["message"]["content"]
                        tokens = data.get("usage", {}).get("total_tokens", 0)
                        
                        # Add assistant response to history
                        self.conversation.append(ChatMessage(role="assistant", content=content))
                        
                        # Update current model if we had to fallback
                        self.current_model_index = model_index
                        
                        return ChatResponse(
                            content=content,
                            model_used=model,
                            tokens_used=tokens,
                        )
                    
                    elif response.status_code == 401:
                        return ChatResponse(
                            content="❌ Invalid Groq API key. Please check your key.",
                            model_used=model,
                            tokens_used=0,
                        )
                    
                    elif response.status_code == 429:
                        # Rate limited, try next model
                        last_error = "Rate limited"
                        continue
                    
                    else:
                        last_error = f"HTTP {response.status_code}"
                        continue
                        
            except httpx.TimeoutException:
                last_error = "Request timed out"
                continue
            except Exception as e:
                last_error = str(e)
                continue
        
        # All models failed
        # Remove the failed user message
        self.conversation.pop()
        
        return ChatResponse(
            content=f"⚠️ All models failed. Last error: {last_error}",
            model_used="none",
            tokens_used=0,
        )
    
    async def stream_message(self, message: str) -> AsyncIterator[str]:
        """
        Stream a message response token by token.
        Yields content chunks as they arrive.
        """
        if not self.api_key:
            yield "⚠️ No Groq API key configured. Add a key to enable AI chat."
            return
        
        # Add user message to history
        self.conversation.append(ChatMessage(role="user", content=message))
        
        # Build messages for API
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            *[{"role": m.role, "content": m.content} for m in self.conversation[-10:]],
        ]
        
        full_response = ""
        
        async with httpx.AsyncClient() as client:
            model = self.current_model
            
            try:
                async with client.stream(
                    "POST",
                    f"{self.base_url}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": model,
                        "messages": messages,
                        "temperature": 0.7,
                        "max_tokens": 1024,
                        "stream": True,
                    },
                    timeout=30.0,
                ) as response:
                    if response.status_code != 200:
                        yield f"⚠️ Error: HTTP {response.status_code}"
                        self.conversation.pop()
                        return
                    
                    async for line in response.aiter_lines():
                        if line.startswith("data: "):
                            data = line[6:]
                            if data == "[DONE]":
                                break
                            try:
                                import json
                                chunk = json.loads(data)
                                delta = chunk["choices"][0].get("delta", {})
                                content = delta.get("content", "")
                                if content:
                                    full_response += content
                                    yield content
                            except:
                                continue
                    
                    # Add full response to history
                    self.conversation.append(ChatMessage(role="assistant", content=full_response))
                    
            except Exception as e:
                yield f"⚠️ Error: {str(e)}"
                self.conversation.pop()


# Global chat client instance
_chat_client: GroqChatClient | None = None


def get_chat_client() -> GroqChatClient:
    """Get or create the global chat client."""
    global _chat_client
    if _chat_client is None:
        _chat_client = GroqChatClient()
    return _chat_client
