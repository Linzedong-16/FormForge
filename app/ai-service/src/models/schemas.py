"""
Pydantic 数据模型 — API 请求/响应结构
"""
from __future__ import annotations

from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


# ─── 通用响应 ─────────────────────────────────────────────────

class APIResponse(BaseModel):
    """统一 API 响应结构（与 q-server 保持一致）"""
    code: int = 0
    msg: str = "ok"
    data: Optional[dict] = None


# ─── 健康检查 ─────────────────────────────────────────────────

class HealthStatus(str, Enum):
    healthy = "healthy"
    degraded = "degraded"


class ServiceCheck(BaseModel):
    ok: bool
    latency_ms: Optional[float] = None
    error: Optional[str] = None


class HealthResponse(BaseModel):
    status: HealthStatus
    version: str
    uptime: float
    checks: dict[str, ServiceCheck]


# ─── Agent 交互 ───────────────────────────────────────────────

class AgentChatRequest(BaseModel):
    """Agent 对话请求"""
    message: str = Field(
        ..., min_length=1, max_length=2000,
        description="用户消息"
    )
    session_id: Optional[str] = Field(
        None, description="会话 ID（新会话留空）"
    )
    agent_type: str = Field(
        "design", description="Agent 类型：design / review / analysis"
    )


class AgentChatResponse(BaseModel):
    """Agent 对话响应"""
    session_id: str
    reply: str
    tool_calls: list[dict] = []
    steps: int = 0


class AgentStreamEvent(BaseModel):
    """Agent SSE 流事件"""
    event: str  # token / tool_call / tool_result / done / error
    data: dict


# ─── 问卷相关 ─────────────────────────────────────────────────

class SurveyGenerateRequest(BaseModel):
    """问卷生成请求（透传给 q-server）"""
    prompt: str = Field(..., min_length=5, max_length=2000)
    count: int = Field(10, ge=5, le=20)
    language: str = Field("zh-CN", pattern="^(zh-CN|en-US|ja-JP)$")


class SurveyReviewRequest(BaseModel):
    """问卷审核请求"""
    survey_content: dict = Field(..., description="问卷 JSON 内容")
    check_dimensions: list[str] = Field(
        ["completeness", "bias", "logic", "wording"],
        description="检查维度"
    )
