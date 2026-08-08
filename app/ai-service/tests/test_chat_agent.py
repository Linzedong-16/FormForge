"""chat_agent.py 单元测试 —— citation SSE 事件命中/未命中/失败降级与事件顺序约束"""

from __future__ import annotations

import pytest

from src.models.schemas import RagSearchResponse, RagSearchResultItem, RagSource


def _make_item(item_id: str = "1042") -> RagSearchResultItem:
    return RagSearchResultItem(
        id=item_id,
        score=0.91,
        vectorScore=0.88,
        keywordScore=0.95,
        snippet="建议采用 5 点或 7 点 Likert 量表……",
        source=RagSource(type="knowledge", refId="doc_1", title="问卷设计方法论手册 v2"),
    )


class _FakeChunk:
    """模拟 LangChain astream 返回的消息分片"""

    def __init__(self, content: str):
        self.content = content


class _FakeModel:
    """模拟 ChatModel，按预设分片顺序输出 token，不发起真实网络调用"""

    def __init__(self, chunks: list[str]):
        self._chunks = chunks

    async def astream(self, messages):
        for text in self._chunks:
            yield _FakeChunk(text)


def _patch_model(monkeypatch, chunks: list[str]) -> None:
    monkeypatch.setattr(
        "src.agents.chat_agent.get_default_model", lambda: _FakeModel(chunks)
    )


def _patch_search_knowledge(monkeypatch, result: RagSearchResponse) -> None:
    async def _fake_search_knowledge(query, top_k=5, alpha=0.7):
        return result

    monkeypatch.setattr(
        "src.agents.chat_agent.rag_client.search_knowledge", _fake_search_knowledge
    )


@pytest.mark.asyncio
async def test_citation_event_emitted_when_knowledge_hit(monkeypatch):
    """检索命中知识片段时，应发出与命中片段对应的 citation 事件"""
    _patch_model(monkeypatch, ["你好", "，建议采用 Likert 量表"])
    _patch_search_knowledge(
        monkeypatch, RagSearchResponse(items=[_make_item()], degraded=None)
    )

    from src.agents.chat_agent import ChatAgent

    agent = ChatAgent()
    events = [event async for event in agent.chat_stream("如何设计量表题")]

    citation_events = [e for e in events if e["event"] == "citation"]
    assert len(citation_events) == 1
    assert citation_events[0]["data"] == {
        "document_title": "问卷设计方法论手册 v2",
        "section": None,
        "chunk_id": "1042",
        "snippet": "建议采用 5 点或 7 点 Likert 量表……",
    }


@pytest.mark.asyncio
async def test_citation_skipped_when_no_hit(monkeypatch):
    """检索未命中（空结果，无降级）时，不应发出 citation 事件"""
    _patch_model(monkeypatch, ["未找到相关依据"])
    _patch_search_knowledge(monkeypatch, RagSearchResponse(items=[], degraded=None))

    from src.agents.chat_agent import ChatAgent

    agent = ChatAgent()
    events = [event async for event in agent.chat_stream("一个知识库未覆盖的问题")]

    assert all(e["event"] != "citation" for e in events)


@pytest.mark.asyncio
async def test_citation_skipped_and_warning_logged_when_retrieval_fails(
    monkeypatch, caplog
):
    """检索调用失败（degraded=request_failed）时，等同未命中：跳过 citation 且记录 warn 日志"""
    _patch_model(monkeypatch, ["未找到相关依据"])
    _patch_search_knowledge(
        monkeypatch, RagSearchResponse(items=[], degraded="request_failed")
    )

    from src.agents.chat_agent import ChatAgent

    agent = ChatAgent()
    with caplog.at_level("WARNING"):
        events = [event async for event in agent.chat_stream("如何设计量表题")]

    assert all(e["event"] != "citation" for e in events)
    assert any("request_failed" in record.message for record in caplog.records)


@pytest.mark.asyncio
async def test_citation_event_ordering_between_token_and_done(monkeypatch):
    """citation 事件必须出现在所有 token 事件之后、done 事件之前"""
    _patch_model(monkeypatch, ["第一段", "第二段"])
    _patch_search_knowledge(
        monkeypatch, RagSearchResponse(items=[_make_item()], degraded=None)
    )

    from src.agents.chat_agent import ChatAgent

    agent = ChatAgent()
    events = [event async for event in agent.chat_stream("如何设计量表题")]

    event_types = [e["event"] for e in events]
    last_token_index = max(i for i, t in enumerate(event_types) if t == "token")
    citation_index = event_types.index("citation")
    done_index = event_types.index("done")

    assert last_token_index < citation_index < done_index
