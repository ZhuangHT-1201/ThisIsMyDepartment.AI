"""FastAPI service that mimics a Python LLM agent backend.

Run this file to start a local HTTP server that responds to POST /chat.
Replace the canned responses in DemoLLMAgent.handle_message with your actual
agent.run implementation later.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from typing import Dict, List, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel


class ChatRequest(BaseModel):
    agentId: str
    playerId: str
    message: str
    history: Optional[List[Dict[str, str]]] = None


class ChatResponse(BaseModel):
    reply: str
    history: Optional[List[Dict[str, str]]] = None


@dataclass
class DemoLLMAgent:
    canned_replies: List[str] = field(default_factory=lambda: [
        "Hello! I'm DemoBot, your friendly guide.",
        "Use WASD or arrow keys to move; press E to interact.",
        "This FastAPI service returns canned responses for now.",
        "Swap me with your real agent.run implementation!",
    ])
    keyword_hints: Dict[str, str] = field(default_factory=lambda: {
        "hello": "Hi there! Nice to meet you.",
        "controls": "Move with WASD/arrow keys, interact with E.",
        "llm": "This demo shows where the LLM agent integrates.",
        "bye": "Catch you later!",
    })
    _history_index: Dict[str, int] = field(default_factory=dict)

    async def handle_message(self, session_key: str, message: str) -> str:
        normalized = message.strip().lower()
        if not normalized:
            return "Say something and I'll respond!"
        for keyword, reply in self.keyword_hints.items():
            if keyword in normalized:
                return reply
        index = self._history_index.get(session_key, 0) % len(self.canned_replies)
        self._history_index[session_key] = index + 1
        await asyncio.sleep(0.05)  # simulate latency / async call
        return self.canned_replies[index]


def create_app() -> FastAPI:
    app = FastAPI(title="Demo LLM Agent", version="0.1.0")
    agent = DemoLLMAgent()

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.post("/chat", response_model=ChatResponse)
    async def chat(request: ChatRequest) -> ChatResponse:
        session_key = f"{request.agentId}:{request.playerId}"
        try:
            reply = await agent.handle_message(session_key, request.message)
        except Exception as exc:  # pragma: no cover - placeholder error handling
            raise HTTPException(status_code=500, detail=str(exc)) from exc

        history = request.history or []
        history = history + [
            {"role": "user", "content": request.message},
            {"role": "assistant", "content": reply},
        ]
        return ChatResponse(reply=reply, history=history)

    return app


app = create_app()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("demo_llm_agent:app", host="127.0.0.1", port=5050, reload=False)
