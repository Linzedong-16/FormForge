"""
问卷分析路由

POST /api/v1/agent/analysis        — 同步分析
POST /api/v1/agent/analysis/stream — SSE 流式分析
"""
from __future__ import annotations

import json

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from ...agents.registry import get_agent
from ...models.schemas import AgentChatRequest, AgentChatResponse

router = APIRouter(prefix="/agent", tags=["analysis"])


@router.post("/analysis", response_model=AgentChatResponse)
async def agent_analysis(req: AgentChatRequest):
    """问卷分析（同步）"""
    try:
        agent = get_agent("analysis")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    result = await agent.chat(req.message, req.session_id)
    return AgentChatResponse(**result)


@router.post("/analysis/stream")
async def agent_analysis_stream(req: AgentChatRequest):
    """问卷分析（SSE 流式）"""
    try:
        agent = get_agent("analysis")
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
