"""
Embedding 计算模块（场景 B 语义主题聚类专用）

职责：对一批开放题答卷原文做**一次性、不持久化**的向量化计算（research.md §1/§2/§10），
供 clusterer.py 的 HDBSCAN 聚类使用；计算完成后向量数组随请求生命周期结束即释放，
不写入任何数据库或缓存（对应 FR-021/FR-022）。

降级约定：Provider 调用失败/超时/未配置 API Key 时，捕获异常并返回 None（可识别的失败标记），
不向上抛出，由调用方（clusterer.py/semantic_cluster_tool）决定降级为 insufficient_data。
"""

from __future__ import annotations

import logging

from langchain_openai import OpenAIEmbeddings

from ..config import settings

logger = logging.getLogger(__name__)

# 模块级单例，避免每次调用重新创建连接（与 llm/factory.py 的单例模式一致）
_embeddings_client: OpenAIEmbeddings | None = None


def _get_embeddings_client() -> OpenAIEmbeddings:
    """获取 Embedding 客户端单例（环境驱动配置，对应 constitution Principle IX）"""
    global _embeddings_client
    if _embeddings_client is None:
        _embeddings_client = OpenAIEmbeddings(
            model=settings.embedding_model,
            api_key=settings.embedding_api_key,
            base_url=settings.embedding_base_url,
        )
    return _embeddings_client


async def embed_texts(texts: list[str]) -> list[list[float]] | None:
    """对一批文本做批量向量化，返回与 texts 一一对应的向量数组

    调用失败/超时时返回 None（可识别的失败标记），不抛出异常中断上层聚类流程
    """
    if not texts:
        return []

    try:
        client = _get_embeddings_client()
        return await client.aembed_documents(texts)
    except Exception as exc:  # noqa: BLE001 — Provider 调用统一降级，交给调用方感知
        logger.warning("Embedding Provider 调用失败，语义聚类将降级为数据不足：%s", exc)
        return None
