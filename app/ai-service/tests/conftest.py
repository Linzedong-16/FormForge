"""测试全局配置 — fixtures 和 mock 工具"""
from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from src.main import app


@pytest.fixture
async def async_client():
    """带 ASGITransport 的 httpx 异步客户端（不经过网络）"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
