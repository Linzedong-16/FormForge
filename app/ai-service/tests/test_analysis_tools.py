"""analysis_tools.py 单元测试 —— 5 个工具的入参 Schema 校验与异常降级为结构化错误"""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from src.models.schemas import SemanticClusterItem, SemanticClusterResult
from src.tools.analysis_tools import (
    ANALYSIS_TOOLS,
    ListSurveyResponsesInput,
    analyze_text_batch_tool,
    get_survey_stats_tool,
    get_survey_structure_tool,
    list_survey_responses_tool,
    semantic_cluster_tool,
)


def test_analysis_tools_registers_all_five_tools():
    """ANALYSIS_TOOLS 应恰好包含 5 个工具，供 model.bind_tools() 绑定"""
    names = {tool.name for tool in ANALYSIS_TOOLS}
    assert names == {
        "get_survey_structure",
        "get_survey_stats",
        "list_survey_responses",
        "analyze_text_batch",
        "semantic_cluster",
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


@pytest.mark.asyncio
async def test_semantic_cluster_tool_normal_path_forwards_to_embedder_and_clusterer(monkeypatch):
    """正常路径：分页收集目标题目答案原文，依次调用 embed_texts/cluster_texts，原样返回聚类结果"""
    matching_texts = ["很好用", "体验不错", "有点卡顿", "整体满意", "希望优化"]

    async def _fake_list_survey_responses(survey_id, page, page_size):
        if page > 1:
            return {"data": {"responses": []}}
        responses = [
            {
                "answers": [
                    {"component_id": "q_target", "value": text},
                    {"component_id": "q_other", "value": "无关答案"},
                ]
            }
            for text in matching_texts
        ]
        return {"data": {"responses": responses}}

    captured_embed_texts = {}

    async def _fake_embed_texts(texts):
        captured_embed_texts["texts"] = texts
        return [[0.1, 0.2, 0.3] for _ in texts]

    preset_result = SemanticClusterResult(
        clusters=[
            SemanticClusterItem(
                label="体验反馈", representative_text="体验不错", sample_count=5, sentiment_score=0.6
            )
        ],
        noise_count=0,
        insufficient_data=False,
    )

    async def _fake_cluster_texts(texts, vectors):
        assert texts == matching_texts
        assert len(vectors) == len(texts)
        return preset_result

    monkeypatch.setattr(
        "src.tools.analysis_tools.survey_client.list_survey_responses",
        _fake_list_survey_responses,
    )
    monkeypatch.setattr("src.tools.analysis_tools.embed_texts", _fake_embed_texts)
    monkeypatch.setattr("src.tools.analysis_tools.cluster_texts", _fake_cluster_texts)

    result = await semantic_cluster_tool.ainvoke(
        {"survey_id": "s1", "question_component_id": "q_target"}
    )

    assert captured_embed_texts["texts"] == matching_texts
    assert result == preset_result.model_dump()


@pytest.mark.asyncio
async def test_semantic_cluster_tool_insufficient_data_when_no_matching_answers(monkeypatch):
    """目标题目无任何文本答案时应直接返回 insufficient_data=True，不发起 Embedding/聚类调用"""

    async def _fake_list_survey_responses(survey_id, page, page_size):
        if page > 1:
            return {"data": {"responses": []}}
        return {
            "data": {
                "responses": [
                    {"answers": [{"component_id": "q_other", "value": "无关答案"}]},
                ]
            }
        }

    async def _fail_if_called(*args, **kwargs):
        raise AssertionError("无匹配文本时不应调用 embed_texts")

    monkeypatch.setattr(
        "src.tools.analysis_tools.survey_client.list_survey_responses",
        _fake_list_survey_responses,
    )
    monkeypatch.setattr("src.tools.analysis_tools.embed_texts", _fail_if_called)

    result = await semantic_cluster_tool.ainvoke(
        {"survey_id": "s1", "question_component_id": "q_target"}
    )

    assert result == SemanticClusterResult(
        clusters=[], noise_count=0, insufficient_data=True
    ).model_dump()


@pytest.mark.asyncio
async def test_semantic_cluster_tool_embedding_failure_degrades_to_insufficient_data(monkeypatch):
    """Embedding Provider 调用失败（embed_texts 返回 None）时应降级为 insufficient_data=True，不中断流程"""

    async def _fake_list_survey_responses(survey_id, page, page_size):
        if page > 1:
            return {"data": {"responses": []}}
        return {
            "data": {
                "responses": [
                    {"answers": [{"component_id": "q_target", "value": "很好用"}]},
                    {"answers": [{"component_id": "q_target", "value": "体验不错"}]},
                ]
            }
        }

    async def _fake_embed_texts(texts):
        return None

    async def _fail_if_called(*args, **kwargs):
        raise AssertionError("Embedding 失败时不应继续调用 cluster_texts")

    monkeypatch.setattr(
        "src.tools.analysis_tools.survey_client.list_survey_responses",
        _fake_list_survey_responses,
    )
    monkeypatch.setattr("src.tools.analysis_tools.embed_texts", _fake_embed_texts)
    monkeypatch.setattr("src.tools.analysis_tools.cluster_texts", _fail_if_called)

    result = await semantic_cluster_tool.ainvoke(
        {"survey_id": "s1", "question_component_id": "q_target"}
    )

    assert result == SemanticClusterResult(
        clusters=[], noise_count=0, insufficient_data=True
    ).model_dump()
