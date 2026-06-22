"""
Agent 基类

所有 Agent 使用 LangChain ChatModel + Tool Calling 模式。
当前阶段为 Placeholder，阶段 2 接入真正的 LLM 调用。
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import AsyncGenerator


class BaseAgent(ABC):
    """Agent 抽象基类"""

    name: str = "base"
    description: str = "基础 Agent"

    @abstractmethod
    async def chat(
        self, message: str, session_id: str | None = None
    ) -> dict:
        """同步对话（非流式）"""
        ...

    @abstractmethod
    async def chat_stream(
        self, message: str, session_id: str | None = None
    ) -> AsyncGenerator[dict, None]:
        """流式对话（SSE）"""
        ...


class PlaceholderAgent(BaseAgent):
    """占位 Agent（阶段 2 替换为真正的 LLM 驱动 Agent）"""

    name = "placeholder"
    description = "占位 Agent — 阶段 2 将接入 LLM"

    async def chat(self, message: str, session_id: str | None = None) -> dict:
        return {
            "session_id": session_id or f"sess_{id(self)}",
            "reply": (
                f"[Placeholder] 收到消息: '{message[:50]}...'\n"
                "Agent 功能将在阶段 2 接入 LLM 后启用。\n"
                "当前阶段：API 框架可用，Agent 编排待接入。"
            ),
            "tool_calls": [],
            "steps": 0,
        }

    async def chat_stream(self, message: str, session_id: str | None = None):
        yield {
            "event": "token",
            "data": {"text": "[Placeholder] Agent 尚未接入 LLM，请等待阶段 2 实现。"},
        }
        yield {"event": "done", "data": {}}
