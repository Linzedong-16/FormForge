"""
Function Calling 工具声明层（对应 contracts/function-calling-tools.md）

将 4 个工具声明为 LangChain StructuredTool，供 AnalysisAgent 通过 model.bind_tools() 绑定：
  - get_survey_structure   数据类，转发至 survey_client
  - get_survey_stats       数据类，转发至 survey_client
  - list_survey_responses  数据类，转发至 survey_client
  - analyze_text_batch     本地计算类，无网络调用（占位实现，具体逻辑由 T011 补全）

通用契约：
  - 出参必须是可 JSON 序列化的结构化数据
  - 任何异常都不向外抛出，统一捕获后返回 {"error": True, "message": "..."} 结构化错误，
    使模型能够感知失败并自主决策（FR-010），而不是让整个循环因未捕获异常而中断
"""

from __future__ import annotations

from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field

from ..analysis.text_processor import extract_keywords, word_frequency
from ..analysis.topic_grouping import group_by_keyword_cooccurrence
from .survey_client import survey_client

# ─── 输入 Schema（对应 contracts/function-calling-tools.md 各工具入参定义）───


class GetSurveyStructureInput(BaseModel):
    survey_id: str = Field(..., description="问卷唯一标识")


class GetSurveyStatsInput(BaseModel):
    survey_id: str = Field(..., description="问卷唯一标识")


class ListSurveyResponsesInput(BaseModel):
    survey_id: str = Field(..., description="问卷唯一标识")
    page: int = Field(1, description="页码")
    page_size: int = Field(50, le=100, description="单页数量，上限 100")
    question_id: str | None = Field(None, description="按题目筛选（可选）")
    keyword: str | None = Field(None, description="文本内容搜索（可选）")


class AnalyzeTextBatchInput(BaseModel):
    texts: list[str] = Field(..., description="待分析的原始文本列表")
    top_k: int = Field(20, description="返回的关键词/词频条目数上限")


# ─── 工具实现 ─────────────────────────────────────────────────


async def _get_survey_structure(survey_id: str) -> dict:
    """获取问卷结构，失败时降级为结构化错误而非抛出异常"""
    try:
        return await survey_client.get_survey_structure(survey_id)
    except Exception as exc:  # noqa: BLE001 — 工具层统一吸收异常，交给模型感知
        return {"error": True, "message": f"获取问卷结构失败：{exc}"}


async def _get_survey_stats(survey_id: str) -> dict:
    """获取逐题聚合统计，失败时降级为结构化错误"""
    try:
        return await survey_client.get_survey_stats(survey_id)
    except Exception as exc:
        return {"error": True, "message": f"获取问卷统计失败：{exc}"}


async def _list_survey_responses(
    survey_id: str,
    page: int = 1,
    page_size: int = 50,
    question_id: str | None = None,
    keyword: str | None = None,
) -> dict:
    """分页拉取原始答卷明细，失败时降级为结构化错误"""
    try:
        return await survey_client.list_survey_responses(
            survey_id,
            page=page,
            page_size=page_size,
            question_id=question_id,
            keyword=keyword,
        )
    except Exception as exc:
        return {"error": True, "message": f"获取答卷明细失败：{exc}"}


async def _analyze_text_batch(texts: list[str], top_k: int = 20) -> dict:
    """本地文本分析：分词/TF-IDF 关键词/词频统计（T009）+ 轻量主题聚类（T010）

    纯本地计算，无网络调用；空输入直接返回空结构，不视为错误
    """
    try:
        valid_texts = [t for t in texts if t and t.strip()]
        if not valid_texts:
            return {"keywords": [], "word_freq": [], "clusters": []}

        return {
            "keywords": extract_keywords(valid_texts, top_k=top_k),
            "word_freq": word_frequency(valid_texts, top_k=top_k),
            "clusters": group_by_keyword_cooccurrence(valid_texts),
        }
    except Exception as exc:
        return {"error": True, "message": f"文本分析失败：{exc}"}


# ─── LangChain StructuredTool 声明（供 model.bind_tools() 绑定）───

get_survey_structure_tool = StructuredTool.from_function(
    coroutine=_get_survey_structure,
    name="get_survey_structure",
    description="获取问卷元信息与题目结构（标题/描述/题目/选项），几乎每次分析的第一步都应调用",
    args_schema=GetSurveyStructureInput,
)

get_survey_stats_tool = StructuredTool.from_function(
    coroutine=_get_survey_stats,
    name="get_survey_stats",
    description="获取逐题聚合统计（选项分布/均值极值/每题最多 10 条文本抽样），是判断是否需要更深入查询的主要依据",
    args_schema=GetSurveyStatsInput,
)

list_survey_responses_tool = StructuredTool.from_function(
    coroutine=_list_survey_responses,
    name="list_survey_responses",
    description=(
        "当 get_survey_stats 的抽样不足以支撑可靠结论时，分页拉取更多原始答卷明细；"
        "仅在必要时调用，避免无条件全量拉取，单次分析全生命周期总拉取量建议不超过 500 条"
    ),
    args_schema=ListSurveyResponsesInput,
)

analyze_text_batch_tool = StructuredTool.from_function(
    coroutine=_analyze_text_batch,
    name="analyze_text_batch",
    description="对一批开放题文本做分词/TF-IDF 关键词提取/词频统计/轻量主题分组，将原始文本压缩为结构化摘要",
    args_schema=AnalyzeTextBatchInput,
)

# 供 AnalysisAgent 统一绑定的工具列表
ANALYSIS_TOOLS = [
    get_survey_structure_tool,
    get_survey_stats_tool,
    list_survey_responses_tool,
    analyze_text_batch_tool,
]
