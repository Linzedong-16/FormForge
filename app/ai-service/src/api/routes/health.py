"""健康检查路由"""
from __future__ import annotations

import time

from fastapi import APIRouter

from ...config import settings
from ...models.schemas import HealthResponse, HealthStatus, ServiceCheck
from ...tools.survey_client import survey_client

router = APIRouter(tags=["health"])

_START_TIME = time.time()


@router.get("/health", response_model=HealthResponse)
async def health_check():
    """服务健康检查 + 下游依赖探测"""
    checks: dict[str, ServiceCheck] = {}

    # 自身的响应就是一个健康信号
    checks["self"] = ServiceCheck(ok=True)

    # 探测 q-server 连通性
    try:
        t0 = time.monotonic()
        await survey_client.health_check()
        elapsed = (time.monotonic() - t0) * 1000
        checks["q-server"] = ServiceCheck(ok=True, latency_ms=round(elapsed, 1))
    except Exception as e:
        checks["q-server"] = ServiceCheck(ok=False, error=str(e)[:200])

    all_ok = all(c.ok for c in checks.values())
    return HealthResponse(
        status=HealthStatus.healthy if all_ok else HealthStatus.degraded,
        version=settings.app_version,
        uptime=time.time() - _START_TIME,
        checks=checks,
    )
