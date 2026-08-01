"""
Q Survey AI Service — FastAPI 入口

启动：
  uv pip install -e .
  uvicorn src.main:app --host 0.0.0.0 --port 8090 --reload

  # 或使用 conda 环境：
  conda env create -f environment.yml
  conda activate form-agent
  uvicorn src.main:app --host 0.0.0.0 --port 8090 --reload
"""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api.routes import agent, health
from .config import settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    # 启动
    print(f"[{settings.app_name}] v{settings.app_version} 启动中...")
    print(f"  q-server: {settings.q_server_base_url}")
    print(f"  AI Provider: {settings.ai_provider} / {settings.ai_model}")

    # 验证 LLM 连通性
    try:
        from .llm.factory import get_default_model

        model = get_default_model()
        response = await model.ainvoke("ping")
        print(f"  LLM 连通: OK ({settings.ai_provider}/{settings.ai_model})")
    except Exception as e:
        print(f"  LLM 连通: 失败 ({e})")

    yield
    # 关闭
    print(f"[{settings.app_name}] 已关闭")


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# ── CORS（开发环境宽松，生产环境收紧） ────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── 注册路由 ──────────────────────────────────────────────
app.include_router(health.router)
app.include_router(agent.router, prefix="/api/v1")


# 开发模式直接运行
if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "src.main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug,
    )
