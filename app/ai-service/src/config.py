"""
应用配置管理

配置来源优先级：环境变量 > .env 文件 > 默认值
"""
from __future__ import annotations

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """全局配置"""

    # ── 服务配置 ──────────────────────────────────────────────
    app_name: str = "Q Survey AI Service"
    app_version: str = "0.1.0"
    host: str = "0.0.0.0"
    port: int = 8090
    debug: bool = False

    # ── q-server 内网 API ────────────────────────────────────
    q_server_base_url: str = "http://localhost:8080"
    q_server_api_key: str = ""  # 内部 API Key（system_configs 中配置）
    q_server_timeout: int = 30  # HTTP 超时秒数

    # ── AI 模型配置 ──────────────────────────────────────────
    ai_provider: str = "deepseek"  # deepseek / openai / anthropic
    ai_model: str = "deepseek-v4-pro"
    ai_api_key: str = ""  # 从环境变量注入
    ai_base_url: str = "https://api.deepseek.com"
    ai_temperature: float = 0.7
    ai_max_tokens: int = 4096

    # ── Embedding 配置（语义聚类场景 B 专用：一次性计算、不持久化）──
    # DeepSeek 官方 API 未确认公开 Embedding 端点（research.md §3），
    # 故 Embedding 走独立的环境驱动配置，默认对齐 OpenAI text-embedding-3-small
    embedding_model: str = "text-embedding-3-small"
    embedding_api_key: str = ""  # 从环境变量注入，未配置时 embedder.py 直接降级返回失败标记
    embedding_base_url: str = "https://api.openai.com/v1"

    # ── Agent 配置 ───────────────────────────────────────────
    agent_max_steps: int = 10  # 单次最大推理步数
    agent_timeout_seconds: int = 60  # 单次循环总耗时兜底（秒），与 agent_max_steps 共同构成双重终止条件
    agent_session_ttl: int = 3600  # 会话过期时间（秒）

    # ── JWT 鉴权（与 q-server 保持一致）────────────────────
    jwt_secret: str = "dev-secret-change-in-production"

    # ── Redis 缓存 ──────────────────────────────────────────
    redis_url: str = "redis://localhost:6379/1"

    # ── 日志配置 ─────────────────────────────────────────────
    log_level: str = "INFO"

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        "case_sensitive": False,
    }


# 全局单例
settings = Settings()
