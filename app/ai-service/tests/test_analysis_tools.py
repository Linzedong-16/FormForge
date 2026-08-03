"""analysis_tools.py 单元测试 —— 4 个工具的入参 Schema 校验与异常降级为结构化错误"""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from src.tools.analysis_tools import (
    ANALYSIS_TOOLS,
    ListSurveyResponsesInput,
    analyze_text_batch_tool,
    get_survey_stats_tool,
    get_survey_structure_tool,
    list_survey_responses_tool,
)


def test_analysis_tools_registers_all_four_tools():
    """ANALYSIS_TOOLS 应恰好包含 4 个工具，供 model.bind_tools() 绑定"""
    names = {tool.name for tool in ANALYSIS_TOOLS}
    assert names == {
        "get_survey_structure",
        "get_survey_stats",
        "list_survey_responses",
        "analyze_text_batch",
    }


def test_list_survey_responses_input_rejects_page_size_over_limit():
    """page_size 超过 100 上限时应被 Pydantic 校验拒绝（对应契约文档的分页硬上限）"""
    with pytest.raises(ValidationError):
        ListSurveyResponsesInput(survey_id="s1", page_size=101)


def test_list_survey_responses_input_defaults():
    """未显式传入分页参数时应使用契约文档定义的默认值"""
    parsed = ListSurveyResponsesInput(survey_id="s1")
    assert parsed.page == 1
    assert parsed.page_size == 50
    assert parsed.question_id is None
    assert parsed.keyword is None


@pytest.mark.asyncio
async def test_get_survey_structure_tool_wraps_exception_as_structured_error(monkeypatch):
    """survey_client 抛出异常时，工具应捕获并降级为 {error, message} 结构，不向外抛出"""

    async def _raise(*args, **kwargs):
        raise ConnectionError("q-server 不可达")

    monkeypatch.setattr("src.tools.analysis_tools.survey_client.get_survey_structure", _raise)

    result = await get_survey_structure_tool.ainvoke({"survey_id": "s1"})
    assert result["error"] is True
    assert "q-server 不可达" in result["message"]


@pytest.mark.asyncio
async def test_get_survey_stats_tool_returns_upstream_result_on_success(monkeypatch):
    """survey_client 正常返回时，工具应原样转发结果，不做多余包装"""

    async def _fake_get_survey_stats(survey_id):
        return {"code": 0, "msg": "ok", "data": {"survey_id": survey_id}}

    monkeypatch.setattr(
        "src.tools.analysis_tools.survey_client.get_survey_stats", _fake_get_survey_stats
    )

    result = await get_survey_stats_tool.ainvoke({"survey_id": "s1"})
    assert result == {"code": 0, "msg": "ok", "data": {"survey_id": "s1"}}


@pytest.mark.asyncio
async def test_list_survey_responses_tool_forwards_pagination_params(monkeypatch):
    """工具应将分页/筛选参数原样转发给 survey_client，不做隐式篡改"""
    captured = {}

    async def _fake_list_survey_responses(survey_id, page, page_size, question_id, keyword):
        captured.update(
            survey_id=survey_id,
            page=page,
            page_size=page_size,
            question_id=question_id,
            keyword=keyword,
        )
        return {"data": {"responses": [], "total": 0}}

    monkeypatch.setattr(
        "src.tools.analysis_tools.survey_client.list_survey_responses",
        _fake_list_survey_responses,
    )

    await list_survey_responses_tool.ainvoke(
        {"survey_id": "s1", "page": 2, "page_size": 20, "question_id": "q1"}
    )
    assert captured == {
        "survey_id": "s1",
        "page": 2,
        "page_size": 20,
        "question_id": "q1",
        "keyword": None,
    }


@pytest.mark.asyncio
async def test_analyze_text_batch_tool_empty_texts_returns_empty_structure():
    """全空文本输入应直接返回空结构，不视为错误"""
    result = await analyze_text_batch_tool.ainvoke({"texts": ["", "   "], "top_k": 10})
    assert result == {"keywords": [], "word_freq": [], "clusters": []}


@pytest.mark.asyncio
async def test_analyze_text_batch_tool_returns_structured_summary():
    """非空文本应返回包含 keywords/word_freq/clusters 三个字段的结构化摘要"""
    texts = ["界面设计非常美观，操作流程也很流畅", "价格实惠，推荐购买"]
    result = await analyze_text_batch_tool.ainvoke({"texts": texts, "top_k": 5})
    assert set(result.keys()) == {"keywords", "word_freq", "clusters"}
    assert isinstance(result["keywords"], list)
    assert isinstance(result["word_freq"], list)
    assert isinstance(result["clusters"], list)
