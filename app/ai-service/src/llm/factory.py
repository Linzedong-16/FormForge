"""
LLM 工厂模块

根据配置创建 ChatModel 实例，支持 deepseek / openai / anthropic 三种 Provider。
LangChain v1 API：使用 ChatOpenAI / ChatAnthropic 统一接口。
"""
from __future__ import annotations

from langchain_openai import ChatOpenAI

from ..config import settings


def create_chat_model(
    temperature: float | None = None,
    max_tokens: int | None = None,
) -> ChatOpenAI:
    """创建 ChatModel 实例（DeepSeek / OpenAI 均兼容 OpenAI API 格式）。

    若 Provider 为 anthropic，需 langchain-anthropic 依赖，届时替换为 ChatAnthropic。
    """
    return ChatOpenAI(
        model=settings.ai_model,
        api_key=settings.ai_api_key,
        base_url=settings.ai_base_url,
        temperature=temperature if temperature is not None else settings.ai_temperature,
        max_tokens=max_tokens or settings.ai_max_tokens,
    )


# 模块级单例，避免每次请求重新创建连接
_default_model: ChatOpenAI | None = None


def get_default_model() -> ChatOpenAI:
    """获取默认 ChatModel 单例"""
    global _default_model
    if _default_model is None:
        _default_model = create_chat_model()
    return _default_model
