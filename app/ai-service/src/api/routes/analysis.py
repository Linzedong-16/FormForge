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
from ...models.schemas import AnalysisConclusion, AnalysisRequest

router = APIRouter(prefix="/agent", tags=["analysis"])


def _to_internal_message(req: AnalysisRequest) -> str:
    """将 survey_id/focus 编码为 Agent 内部消息格式（AnalysisAgent._parse_message 的对端）"""
    return json.dumps({"survey_id": req.survey_id, "focus": req.focus}, ensure_ascii=False)


@router.post("/analysis", response_model=AnalysisConclusion)
async def agent_analysis(req: AnalysisRequest):
    """问卷分析（同步）"""
    try:
        agent = get_agent("analysis")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    result = await agent.chat(_to_internal_message(req), req.session_id)
    return AnalysisConclusion(**result)


@router.post("/analysis/stream")
async def agent_analysis_stream(req: AnalysisRequest):
    """问卷分析（SSE 流式）"""
    try:
        agent = get_agent("analysis")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    async def event_stream():
        async for event in agent.chat_stream(_to_internal_message(req), req.session_id):
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
