"""
Pydantic 数据模型 — API 请求/响应结构
"""

from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, Field

# ─── 通用响应 ─────────────────────────────────────────────────

class APIResponse(BaseModel):
    """统一 API 响应结构（与 q-server 保持一致）"""
    code: int = 0
    msg: str = "ok"
    data: dict | None = None


# ─── 健康检查 ─────────────────────────────────────────────────

class HealthStatus(str, Enum):
    healthy = "healthy"
    degraded = "degraded"


class ServiceCheck(BaseModel):
    ok: bool
    latency_ms: float | None = None
    error: str | None = None


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
    session_id: str | None = Field(
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


class AnalysisRequest(BaseModel):
    """问卷分析请求（对应 quickstart.md 文档的 HTTP 请求体，与通用 AgentChatRequest 区分）"""
    survey_id: str = Field(..., min_length=1, description="问卷 ID")
    focus: str | None = Field(None, description="分析侧重点，留空表示对问卷做全面分析")
    session_id: str | None = Field(None, description="会话 ID（新会话留空）")


class AgentStreamEvent(BaseModel):
    """Agent SSE 流事件

    事件词表（对应 contracts/sse-events.md）：
      - status      { text }                                              兼容性扩展
      - tool_call    { name, args, step }                                  宪法强制词表
      - tool_result  { name, step, summary }                               兼容性扩展
      - token        { text }                                              宪法强制词表
      - done         { session_id, reply, tool_calls, steps, degraded }    宪法强制词表
      - error        { message }                                          宪法强制词表
    """
    event: str  # status / tool_call / tool_result / token / done / error
    data: dict


# ─── 分析 Agent 自主循环（单次请求生命周期内存态对象，不持久化）───

class ToolCallRecord(BaseModel):
    """单次工具调用记录（对应 data-model.md 第 2 节）"""
    tool_name: str = Field(..., description="get_survey_structure / get_survey_stats / list_survey_responses / analyze_text_batch")
    arguments: dict = Field(..., description="模型生成的调用参数")
    result_summary: str | dict = Field(..., description="工具执行结果摘要，失败时为 {error: true, message: ...}")
    step_index: int = Field(..., description="发生时对应的 step_count 值")
    status: str = Field(..., description="success / error")


class AnalysisRunContext(BaseModel):
    """单次分析请求的自主循环运行时上下文（对应 data-model.md 第 1 节）"""
    model_config = {"arbitrary_types_allowed": True}

    session_id: str
    survey_id: str
    focus: str | None = None
    step_count: int = 0
    tool_call_history: list[ToolCallRecord] = Field(default_factory=list)
    # LangChain 消息对象列表（HumanMessage/AIMessage/ToolMessage），驱动下一轮推理
    messages: list = Field(default_factory=list)


class QuestionSnapshot(BaseModel):
    """问卷结构快照中的单题结构（对应 data-model.md 第 3 节 Question 子结构）"""
    id: str
    type: str
    title: str
    required: bool
    options: list[str] | None = None


class SurveyStructureSnapshot(BaseModel):
    """get_survey_structure 工具出参结构（对应 data-model.md 第 3 节）"""
    survey_id: str
    title: str
    description: str | None = None
    questions: list[QuestionSnapshot] = Field(default_factory=list)


class KeywordItem(BaseModel):
    """TF-IDF 关键词条目"""
    word: str
    weight: float


class WordFreqItem(BaseModel):
    """词频统计条目"""
    word: str
    count: int


class ClusterItem(BaseModel):
    """轻量主题聚类结果条目（R5）"""
    label: str
    sample_texts: list[str] = Field(default_factory=list)
    count: int


class TextAnalysisSummary(BaseModel):
    """analyze_text_batch 工具出参结构（对应 data-model.md 第 5 节）"""
    keywords: list[KeywordItem] = Field(default_factory=list)
    word_freq: list[WordFreqItem] = Field(default_factory=list)
    clusters: list[ClusterItem] = Field(default_factory=list)


class AnalysisConclusion(BaseModel):
    """自主循环结束后产出的最终分析结论（对应 data-model.md 第 6 节）"""
    session_id: str
    reply: str
    tool_calls: list[ToolCallRecord] = Field(default_factory=list)
    steps: int = 0
    degraded: bool = False


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
