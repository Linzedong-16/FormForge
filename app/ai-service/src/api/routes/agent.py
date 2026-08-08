"""
Agent 对话路由

POST /api/v1/agent/chat        — 同步对话
POST /api/v1/agent/chat/stream — SSE 流式对话

使用 Agent 注册表获取实例，支持多 Agent 类型动态路由。
"""
from __future__ import annotations

import json

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from ...agents.registry import get_agent, list_agents
from ...models.schemas import AgentChatRequest, AgentChatResponse

router = APIRouter(prefix="/agent", tags=["agent"])


@router.get("/types")
async def agent_types():
    """获取可用 Agent 类型列表"""
    return {
        "code": 0,
        "msg": "ok",
        "data": {"types": list_agents()},
    }


@router.post("/chat", response_model=AgentChatResponse)
async def agent_chat(req: AgentChatRequest):
    """Agent 同步对话"""
    try:
        agent = get_agent(req.agent_type)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    result = await agent.chat(req.message, req.session_id)
    return AgentChatResponse(**result)


@router.post("/chat/stream")
async def agent_chat_stream(req: AgentChatRequest):
    """Agent SSE 流式对话"""
    try:
        agent = get_agent(req.agent_type)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    async def event_stream():
        async for event in agent.chat_stream(req.message, req.session_id):
            line = (
                f"event: {event['event']}\n"
                f"data: {json.dumps(event['data'], ensure_ascii=False)}\n\n"
            )
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
