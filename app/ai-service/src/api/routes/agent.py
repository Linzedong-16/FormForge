"""
Agent 对话路由

POST /api/v1/agent/chat       — 同步对话
POST /api/v1/agent/chat/stream — SSE 流式对话
"""
from __future__ import annotations

import json

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from ...agents.base import PlaceholderAgent
from ...models.schemas import AgentChatRequest, AgentChatResponse

router = APIRouter(prefix="/agent", tags=["agent"])

# 阶段 1：使用 Placeholder Agent（阶段 2 替换为 LLM Agent）
_agent = PlaceholderAgent()


@router.post("/chat", response_model=AgentChatResponse)
async def agent_chat(req: AgentChatRequest):
    """Agent 同步对话"""
    result = await _agent.chat(req.message, req.session_id)
    return AgentChatResponse(**result)


@router.post("/chat/stream")
async def agent_chat_stream(req: AgentChatRequest):
    """Agent SSE 流式对话"""
    async def event_stream():
        async for event in _agent.chat_stream(req.message, req.session_id):
            line = f"event: {event['event']}\ndata: {json.dumps(event['data'], ensure_ascii=False)}\n\n"
            yield line

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
