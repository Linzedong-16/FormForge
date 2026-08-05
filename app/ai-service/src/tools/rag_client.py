"""
q-server AI RAG 检索接口 HTTP 客户端

封装对 q-server ai-rag 模块（POST /api/ai/rag/knowledge/search、
POST /api/ai/rag/templates/search）的调用，供 ChatAgent 检索知识库/历史模板片段。

复用 survey_client.py（SurveyAPIClient）的 httpx 异步客户端 + X-Internal-Api-Key
鉴权 + 有限次数重试模式；但与 survey_client 不同：本客户端调用失败（超时/5xx/
网络错误）时必须在内部吸收异常，返回空结果并标记降级，不向上抛出（对应 FR-020，
契约 contracts/ai-service-rag-tools.md §2）——因为检索是问答的辅助增强环节，
失败时应等同于"未检索到"，不能因检索异常中断整个问答流程。
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

import httpx

from ..config import settings
from ..models.schemas import RagSearchResponse

logger = logging.getLogger(__name__)

# 有限次数重试配置，与 survey_client.py 保持一致：吸收瞬时网络抖动
_RETRY_MAX_ATTEMPTS = 3
_RETRY_BASE_DELAY_SECONDS = 0.5


class RagClient:
    """q-server AI RAG 检索接口客户端"""

    def __init__(self, base_url: str | None = None):
        self.base_url = (base_url or settings.q_server_base_url).rstrip("/")
        self.headers = {
            "Content-Type": "application/json",
            "X-Internal-Api-Key": settings.q_server_api_key,
        }
        self.timeout = settings.q_server_timeout

    async def _post(self, path: str, payload: dict[str, Any]) -> dict[str, Any]:
        """统一 POST 请求，内置有限次数重试；重试耗尽后向上抛出，由调用方统一降级

        仅对网络层异常与 5xx 服务端错误重试；4xx 客户端错误是确定性失败，直接抛出
        """
        url = f"{self.base_url}{path}"
        last_exc: Exception | None = None

        for attempt in range(_RETRY_MAX_ATTEMPTS):
            try:
                async with httpx.AsyncClient(timeout=self.timeout) as client:
                    resp = await client.post(url, headers=self.headers, json=payload)
                    resp.raise_for_status()
                    return resp.json()
            except httpx.HTTPStatusError as exc:
                if exc.response.status_code < 500:
                    raise
                last_exc = exc
            except httpx.RequestError as exc:
                last_exc = exc

            if attempt < _RETRY_MAX_ATTEMPTS - 1:
                await asyncio.sleep(_RETRY_BASE_DELAY_SECONDS * (attempt + 1))

        raise last_exc

    async def _search(
        self, path: str, query: str, top_k: int, alpha: float
    ) -> RagSearchResponse:
        """统一检索调用：调用失败时降级为空结果，不抛出异常（对应 FR-020）"""
        try:
            body = await self._post(path, {"query": query, "topK": top_k, "alpha": alpha})
        except Exception as exc:  # noqa: BLE001 — 检索失败必须降级而非中断问答流程
            logger.warning("RAG 检索调用失败，降级为空结果: path=%s error=%s", path, exc)
            return RagSearchResponse(items=[], degraded="request_failed")

        data = body.get("data") or {}
        return RagSearchResponse.model_validate(data)

    async def search_knowledge(
        self, query: str, top_k: int = 5, alpha: float = 0.7
    ) -> RagSearchResponse:
        """检索知识库片段，调用 POST /api/ai/rag/knowledge/search"""
        return await self._search("/api/ai/rag/knowledge/search", query, top_k, alpha)

    async def search_templates(
        self, query: str, top_k: int = 5, alpha: float = 0.7
    ) -> RagSearchResponse:
        """检索历史模板片段，调用 POST /api/ai/rag/templates/search"""
        return await self._search("/api/ai/rag/templates/search", query, top_k, alpha)


# 模块级单例
rag_client = RagClient()
