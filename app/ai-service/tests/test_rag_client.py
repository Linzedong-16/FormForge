"""rag_client.py 单元测试 —— 检索正常返回与调用失败降级为空结果（不抛异常）"""

from __future__ import annotations

import httpx
import pytest

from src.models.schemas import RagSearchResponse
from src.tools.rag_client import RagClient


@pytest.mark.asyncio
async def test_search_knowledge_normal_path_parses_response(monkeypatch):
    """正常路径：q-server 返回命中结果时应原样解析为 RagSearchResponse"""
    client = RagClient()

    async def _fake_post(path, payload):
        assert path == "/api/ai/rag/knowledge/search"
        assert payload == {"query": "如何设计量表题", "topK": 5, "alpha": 0.7}
        return {
            "code": 0,
            "msg": "ok",
            "data": {
                "items": [
                    {
                        "id": "1042",
                        "score": 0.91,
                        "vectorScore": 0.88,
                        "keywordScore": 0.95,
                        "snippet": "建议采用 5 点或 7 点 Likert 量表……",
                        "source": {
                            "type": "knowledge",
                            "refId": "doc_1",
                            "title": "问卷设计方法论手册 v2",
                        },
                    }
                ],
                "degraded": None,
            },
        }

    monkeypatch.setattr(client, "_post", _fake_post)

    result = await client.search_knowledge("如何设计量表题")

    assert isinstance(result, RagSearchResponse)
    assert result.degraded is None
    assert len(result.items) == 1
    item = result.items[0]
    assert item.id == "1042"
    assert item.snippet == "建议采用 5 点或 7 点 Likert 量表……"
    assert item.source.title == "问卷设计方法论手册 v2"


@pytest.mark.asyncio
async def test_search_knowledge_forwards_top_k_and_alpha(monkeypatch):
    """top_k/alpha 应原样转发给 q-server，不做隐式篡改"""
    client = RagClient()
    captured = {}

    async def _fake_post(path, payload):
        captured.update(payload)
        return {"data": {"items": [], "degraded": None}}

    monkeypatch.setattr(client, "_post", _fake_post)

    await client.search_knowledge("问题", top_k=10, alpha=0.3)

    assert captured == {"query": "问题", "topK": 10, "alpha": 0.3}


@pytest.mark.asyncio
async def test_search_knowledge_degrades_to_empty_on_request_error(monkeypatch):
    """调用失败（网络错误）时应返回空结果并标记降级，不向上抛出异常"""
    client = RagClient()

    async def _raise(path, payload):
        raise httpx.RequestError("connection refused")

    monkeypatch.setattr(client, "_post", _raise)

    result = await client.search_knowledge("如何设计量表题")

    assert result == RagSearchResponse(items=[], degraded="request_failed")


@pytest.mark.asyncio
async def test_search_knowledge_degrades_to_empty_on_timeout(monkeypatch):
    """调用超时时应返回空结果并标记降级，不向上抛出异常"""
    client = RagClient()

    async def _raise(path, payload):
        raise httpx.TimeoutException("timed out")

    monkeypatch.setattr(client, "_post", _raise)

    result = await client.search_knowledge("如何设计量表题")

    assert result == RagSearchResponse(items=[], degraded="request_failed")


@pytest.mark.asyncio
async def test_search_knowledge_degrades_to_empty_on_5xx(monkeypatch):
    """q-server 返回 5xx 时（重试耗尽后）应降级为空结果，不向上抛出异常"""
    client = RagClient()

    async def _raise(path, payload):
        request = httpx.Request("POST", "http://q-server/api/ai/rag/knowledge/search")
        response = httpx.Response(500, request=request)
        raise httpx.HTTPStatusError("server error", request=request, response=response)

    monkeypatch.setattr(client, "_post", _raise)

    result = await client.search_knowledge("如何设计量表题")

    assert result == RagSearchResponse(items=[], degraded="request_failed")


@pytest.mark.asyncio
async def test_search_knowledge_propagates_upstream_degraded_flag(monkeypatch):
    """q-server 自身标记 degraded（如 vector_unavailable）时应原样透传，不覆盖为 request_failed"""
    client = RagClient()

    async def _fake_post(path, payload):
        return {"data": {"items": [], "degraded": "vector_unavailable"}}

    monkeypatch.setattr(client, "_post", _fake_post)

    result = await client.search_knowledge("如何设计量表题")

    assert result == RagSearchResponse(items=[], degraded="vector_unavailable")


@pytest.mark.asyncio
async def test_search_templates_calls_correct_path_and_degrades_on_failure(monkeypatch):
    """search_templates 应调用 templates/search 端点，且共享同一套降级契约"""
    client = RagClient()
    captured_path = {}

    async def _fake_post(path, payload):
        captured_path["path"] = path
        raise httpx.RequestError("connection refused")

    monkeypatch.setattr(client, "_post", _fake_post)

    result = await client.search_templates("客户满意度模板")

    assert captured_path["path"] == "/api/ai/rag/templates/search"
    assert result == RagSearchResponse(items=[], degraded="request_failed")
