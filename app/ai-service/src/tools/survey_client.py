"""
q-server API HTTP 客户端

封装对 q-server（Fastify/TS）内网 API 的调用，供 Agent Tool 使用。
"""
from __future__ import annotations

from typing import Any, Optional

import httpx

from ..config import settings


class SurveyAPIClient:
    """问卷系统 API 客户端"""

    def __init__(self, base_url: Optional[str] = None):
        self.base_url = (base_url or settings.q_server_base_url).rstrip("/")
        self.headers = {
            "Content-Type": "application/json",
            "X-Internal-Api-Key": settings.q_server_api_key,
        }
        self.timeout = settings.q_server_timeout

    async def _request(
        self, method: str, path: str, **kwargs
    ) -> dict[str, Any]:
        """统一请求方法"""
        url = f"{self.base_url}{path}"
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.request(
                method, url, headers=self.headers, **kwargs
            )
            resp.raise_for_status()
            return resp.json()

    # ─── 问卷相关 ─────────────────────────────────────────────

    async def generate_survey(
        self, prompt: str, count: int = 10, language: str = "zh-CN"
    ) -> dict:
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

    # ─── 数据相关 ─────────────────────────────────────────────

    async def get_survey_responses(self, survey_id: str) -> dict:
        """获取答卷数据"""
        return await self._request(
            "GET", f"/api/responses?survey_id={survey_id}"
        )

    # ─── 系统相关 ─────────────────────────────────────────────

    async def get_system_logs(
        self, level: str = "error", hours: int = 24
    ) -> dict:
        """查询系统日志"""
        return await self._request(
            "GET", "/api/logs", params={"level": level, "hours": hours}
        )

    async def health_check(self) -> dict:
        """q-server 健康检查"""
        return await self._request("GET", "/api/health")


# 模块级单例
survey_client = SurveyAPIClient()
