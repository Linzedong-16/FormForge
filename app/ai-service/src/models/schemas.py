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
      - citation     { document_title, section, chunk_id, snippet }        增量扩展（RAG 知识库问答，US3）
      - done         { session_id, reply, tool_calls, steps, degraded }    宪法强制词表
      - error        { message }                                          宪法强制词表

    citation 事件顺序约束：出现在其对应内容的 token 事件之后、done 事件之前；
    检索未命中或调用失败时直接跳过，不发出该事件（对应 contracts/ai-service-rag-tools.md §3）
    """
    event: str  # status / tool_call / tool_result / token / citation / done / error
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


# ─── 语义主题聚类（场景 B，一次性计算、不持久化，对应 data-model.md 第 4 节）───

class SemanticClusterItem(BaseModel):
    """单个语义簇的聚合结果"""
    label: str = Field(..., description="主题标签（或代表性描述）")
    representative_text: str = Field(..., description="代表性原文")
    sample_count: int = Field(..., description="簇内样本数")
    sentiment_score: float = Field(..., ge=-1.0, le=1.0, description="情感倾向评分，范围 [-1, 1]")


class SemanticClusterResult(BaseModel):
    """semantic_cluster_tool 工具出参结构"""
    clusters: list[SemanticClusterItem] = Field(default_factory=list)
    noise_count: int = Field(0, description="未能归类的噪声样本数（对应 FR-011）")
    insufficient_data: bool = Field(False, description="样本量不足时为 True（对应 FR-010），此时 clusters 为空")


# ─── RAG 检索问答（场景 C，对应 contracts/q-server-ai-rag.openapi.yaml）───

class RagSource(BaseModel):
    """检索结果来源标识（对应 q-server SearchResultItem.source）"""
    type: str = Field(..., description="来源类型：template / knowledge")
    ref_id: str = Field(..., alias="refId", description="来源对象 ID（模板 ID 或知识文档 ID）")
    title: str = Field(..., description="来源标题")

    model_config = {"populate_by_name": True}


class RagSearchResultItem(BaseModel):
    """单条检索结果（对应 q-server SearchResultItem）"""
    id: str
    score: float
    vector_score: float = Field(..., alias="vectorScore")
    keyword_score: float = Field(..., alias="keywordScore")
    snippet: str
    source: RagSource

    model_config = {"populate_by_name": True}


class RagSearchResponse(BaseModel):
    """RagClient.search_knowledge/search_templates 出参结构

    degraded 语义（对应 FR-020）：
      - q-server 侧检索部分失效：透传其 vector_unavailable / keyword_unavailable
      - 本客户端调用失败（超时/5xx/网络错误）：标记为 request_failed，不向上抛出异常
      - 正常命中：None
    """
    items: list[RagSearchResultItem] = Field(default_factory=list)
    degraded: str | None = None


class Citation(BaseModel):
    """知识库问答引用来源（对应 contracts/ai-service-rag-tools.md §3，citation SSE 事件负载）"""
    document_title: str = Field(..., description="来源文档标题")
    section: str | None = Field(None, description="来源章节，无章节信息时为 None")
    chunk_id: str = Field(..., description="来源片段 ID")
    snippet: str = Field(..., description="引用片段原文摘要")


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
