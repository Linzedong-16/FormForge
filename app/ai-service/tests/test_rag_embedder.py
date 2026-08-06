"""embedder.py 单元测试（对应 tasks.md T023）

覆盖范围：
  - 正常 Embedding 调用，返回与输入文本一一对应的向量数组
  - 空输入直接返回空数组，不发起 Provider 调用
  - Provider 调用失败/超时时捕获异常，返回 None（可识别的失败标记）而非抛出
"""

from __future__ import annotations

import pytest

from src.rag import embedder


@pytest.fixture(autouse=True)
def _reset_embeddings_client_singleton():
    """每个用例前重置模块级单例，避免不同用例间的 mock 相互污染"""
    embedder._embeddings_client = None
    yield
    embedder._embeddings_client = None


@pytest.mark.asyncio
async def test_embed_texts_empty_input_returns_empty_list_without_calling_provider(monkeypatch):
    """空文本列表应直接返回空数组，不创建/调用 Embedding 客户端"""
    called = False

    def _fake_get_client():
        nonlocal called
        called = True
        raise AssertionError("空输入不应触发 Provider 调用")

    monkeypatch.setattr(embedder, "_get_embeddings_client", _fake_get_client)

    result = await embedder.embed_texts([])
    assert result == []
    assert called is False


@pytest.mark.asyncio
async def test_embed_texts_returns_vectors_on_success(monkeypatch):
    """正常调用时应返回与输入文本数量一致的向量数组"""

    class _FakeClient:
        async def aembed_documents(self, texts: list[str]) -> list[list[float]]:
            return [[0.1, 0.2, 0.3] for _ in texts]

    monkeypatch.setattr(embedder, "_get_embeddings_client", lambda: _FakeClient())

    texts = ["服务态度很好", "客服很耐心"]
    result = await embedder.embed_texts(texts)

    assert result == [[0.1, 0.2, 0.3], [0.1, 0.2, 0.3]]


@pytest.mark.asyncio
async def test_embed_texts_provider_failure_returns_none(monkeypatch):
    """Provider 调用异常时应捕获并返回 None，不向外抛出"""

    class _FailingClient:
        async def aembed_documents(self, texts: list[str]) -> list[list[float]]:
            raise ConnectionError("Embedding 接口暂时不可用")

    monkeypatch.setattr(embedder, "_get_embeddings_client", lambda: _FailingClient())

    result = await embedder.embed_texts(["测试文本"])
    assert result is None


@pytest.mark.asyncio
async def test_embed_texts_provider_timeout_returns_none(monkeypatch):
    """Provider 调用超时（TimeoutError）时同样应降级返回 None"""

    class _TimeoutClient:
        async def aembed_documents(self, texts: list[str]) -> list[list[float]]:
            raise TimeoutError("Embedding 请求超时")

    monkeypatch.setattr(embedder, "_get_embeddings_client", lambda: _TimeoutClient())

    result = await embedder.embed_texts(["测试文本"])
    assert result is None


def test_get_embeddings_client_is_singleton(monkeypatch):
    """连续两次获取客户端应返回同一实例，避免重复创建连接"""
    # 提供假 API Key，避免真实 OpenAIEmbeddings 构造时因缺少凭证而报错
    monkeypatch.setattr(embedder.settings, "embedding_api_key", "sk-fake-key-for-test")

    client1 = embedder._get_embeddings_client()
    client2 = embedder._get_embeddings_client()
    assert client1 is client2
