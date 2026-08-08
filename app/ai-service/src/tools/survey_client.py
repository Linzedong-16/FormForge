"""
q-server API HTTP 客户端

封装对 q-server（Fastify/TS）内网 API 的调用，供 Agent Tool 使用。
"""

from __future__ import annotations

import asyncio
from typing import Any

import httpx

from ..config import settings

# 有限次数重试配置（R3）：吸收瞬时网络抖动，避免单次抖动直接导致整个分析循环失败
_RETRY_MAX_ATTEMPTS = 3  # 首次请求 + 2 次重试
_RETRY_BASE_DELAY_SECONDS = 0.5  # 重试间隔递增：0.5s → 1.0s


class SurveyAPIClient:
    """问卷系统 API 客户端"""

    def __init__(self, base_url: str | None = None):
        self.base_url = (base_url or settings.q_server_base_url).rstrip("/")
        self.headers = {
            "Content-Type": "application/json",
            "X-Internal-Api-Key": settings.q_server_api_key,
        }
        self.timeout = settings.q_server_timeout

    async def _request(self, method: str, path: str, **kwargs) -> dict[str, Any]:
        """统一请求方法，内置有限次数重试（R3）以吸收瞬时网络抖动

        仅对网络层异常（连接失败/超时等 httpx.RequestError）与 5xx 服务端错误重试；
        4xx 客户端错误（参数错误/资源不存在等）是确定性失败，重试无意义，直接向上抛出，
        由调用方（工具层 analysis_tools.py）统一降级为结构化错误 {error: True, message: "..."}，
        不静默吞错、不无限重试
        """
        url = f"{self.base_url}{path}"
        last_exc: Exception | None = None

        for attempt in range(_RETRY_MAX_ATTEMPTS):
            try:
                async with httpx.AsyncClient(timeout=self.timeout) as client:
                    resp = await client.request(method, url, headers=self.headers, **kwargs)
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

    # ─── 问卷相关 ─────────────────────────────────────────────

    async def generate_survey(self, prompt: str, count: int = 10, language: str = "zh-CN") -> dict:
        """调用 POST /api/surveys/generate"""
        return await self._request(
            "POST",
            "/api/surveys/generate",
            json={"prompt": prompt, "count": count, "language": language},
        )

    async def list_surveys(self, page: int = 1, page_size: int = 20) -> dict:
        """调用 GET /api/surveys"""
        return await self._request(
            "GET", "/api/surveys", params={"page": page, "page_size": page_size}
        )

    async def get_survey_detail(self, survey_id: str) -> dict:
        """调用 GET /api/surveys/:id"""
        return await self._request("GET", f"/api/surveys/{survey_id}")

    # ─── 统计分析（q-server SurveyStatsService 提供）───────────

    async def get_survey_structure(self, survey_id: str) -> dict:
        """获取问卷结构（标题/描述/题目/选项）
        对应 GET /api/admin/surveys/:id，供 Agent 工具 get_survey_structure 调用
        """
        return await self._request("GET", f"/api/admin/surveys/{survey_id}")

    async def get_survey_stats(self, survey_id: str) -> dict:
        """获取单问卷统计分析结果（逐题分布、均值、文本抽样）
        对应 GET /api/admin/surveys/:id/stats
        """
        return await self._request("GET", f"/api/admin/surveys/{survey_id}/stats")

    async def list_survey_responses(
        self,
        survey_id: str,
        page: int = 1,
        page_size: int = 50,
        question_id: str | None = None,
        keyword: str | None = None,
    ) -> dict:
        """分页获取原始答卷明细，供 get_survey_stats 抽样不足时补充查询
        对应 GET /api/admin/surveys/:id/responses
        """
        params: dict[str, Any] = {"page": page, "page_size": page_size}
        if question_id is not None:
            params["question_id"] = question_id
        if keyword is not None:
            params["keyword"] = keyword
        return await self._request(
            "GET", f"/api/admin/surveys/{survey_id}/responses", params=params
        )

    async def get_platform_overview(self) -> dict:
        """获取平台统计概览（问卷总数、答卷总数、日趋势）
        对应 GET /api/admin/stats/overview
        """
        return await self._request("GET", "/api/admin/stats/overview")

    # ─── 系统相关 ─────────────────────────────────────────────

    async def get_system_logs(self, level: str = "error", hours: int = 24) -> dict:
        """查询系统日志"""
        return await self._request("GET", "/api/logs", params={"level": level, "hours": hours})

    async def health_check(self) -> dict:
        """q-server 健康检查"""
        return await self._request("GET", "/api/health")


# 模块级单例
survey_client = SurveyAPIClient()
