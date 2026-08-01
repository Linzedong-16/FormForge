"""
通用对话 Agent

接入 LanagChain v1 ChatModel，替换 PlaceholderAgent。
"""
from __future__ import annotations

from collections.abc import AsyncGenerator

from langchain_core.messages import HumanMessage, SystemMessage

from ..llm.factory import get_default_model
from .base import BaseAgent


class ChatAgent(BaseAgent):
    """通用 LLM 对话 Agent"""

    name = "chat"
    description = "通用 AI 对话 Agent"

    def __init__(self) -> None:
        self.model = get_default_model()

    async def chat(
        self, message: str, session_id: str | None = None
    ) -> dict:
        """同步对话（非流式）"""
        response = await self.model.ainvoke([HumanMessage(content=message)])

        content = (
            response.content
            if isinstance(response.content, str)
            else str(response.content)
        )

        return {
            "session_id": session_id or self._generate_session_id(),
            "reply": content,
            "tool_calls": [],
            "steps": 1,
        }

    async def chat_stream(
        self, message: str, session_id: str | None = None
    ) -> AsyncGenerator[dict, None]:
        """流式对话（SSE）"""
        full_content: list[str] = []
        session_id = session_id or self._generate_session_id()

        async for chunk in self.model.astream([HumanMessage(content=message)]):
            if chunk.content:
                text = (
                    chunk.content
                    if isinstance(chunk.content, str)
                    else str(chunk.content)
                )
                full_content.append(text)
                yield {"event": "token", "data": {"text": text}}

        yield {
            "event": "done",
            "data": {
                "session_id": session_id,
                "reply": "".join(full_content),
            },
        }

    def _generate_session_id(self) -> str:
        import uuid

        return f"sess_{uuid.uuid4().hex[:12]}"
