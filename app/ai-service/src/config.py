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
    ai_model: str = "deepseek-chat"
    ai_api_key: str = ""  # 从环境变量注入
    ai_base_url: str = "https://api.deepseek.com/v1"
    ai_temperature: float = 0.7
    ai_max_tokens: int = 4096

    # ── Agent 配置 ───────────────────────────────────────────
    agent_max_steps: int = 10  # 单次最大推理步数
    agent_session_ttl: int = 3600  # 会话过期时间（秒）

    # ── 日志配置 ─────────────────────────────────────────────
    log_level: str = "INFO"

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        "case_sensitive": False,
    }


# 全局单例
settings = Settings()
