"""
通用对话 Agent（RAG 增强版）

接入 LangChain v1 ChatModel；回答前调用 rag_client 检索知识库相关片段作为上下文依据，
回答后通过 citation SSE 事件透出可追溯的引用来源（对应 FR-013/FR-014/FR-015）。
检索为空或调用失败时（两者视为等同）跳过 citation 事件，并要求模型如实说明未找到
相关依据，禁止编造引用来源（对应 FR-020）。
"""
from __future__ import annotations

import logging
from collections.abc import AsyncGenerator

from langchain_core.messages import HumanMessage, SystemMessage

from ..llm.factory import get_default_model
from ..models.schemas import Citation, RagSearchResultItem
from ..tools.rag_client import rag_client
from .base import BaseAgent

logger = logging.getLogger(__name__)

# 命中知识片段时：要求模型优先依据检索内容回答，且不得编造检索结果之外的引用来源
_SYSTEM_PROMPT_WITH_CONTEXT = (
    "以下是知识库中检索到的相关内容，请优先依据这些内容回答用户问题；"
    "内容与问题无关时可忽略，禁止编造知识库之外的引用来源。\n\n{context}"
)
# 未命中（或检索失败，两者等同处理）：要求模型如实说明未找到依据，不得编造答案
_SYSTEM_PROMPT_WITHOUT_CONTEXT = (
    "知识库中未检索到与用户问题相关的内容，请如实告知用户未找到相关依据，"
    "不得编造答案或引用来源。"
)


class ChatAgent(BaseAgent):
    """通用 LLM 对话 Agent（RAG 增强：知识库检索 + 可追溯引用）"""

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
        """流式对话（SSE）：检索知识库 → 流式输出回答 → 命中时追加 citation 事件 → done"""
        full_content: list[str] = []
        session_id = session_id or self._generate_session_id()

        rag_result = await rag_client.search_knowledge(message)
        if rag_result.degraded:
            # 检索失败与未命中对调用方等同（均跳过 citation），但失败情形额外记录 warn 日志便于排查
            logger.warning(
                "RAG 检索降级，本次回答不注入知识库上下文: degraded=%s", rag_result.degraded
            )

        messages = self._build_messages(message, rag_result.items)

        async for chunk in self.model.astream(messages):
            if chunk.content:
                text = (
                    chunk.content
                    if isinstance(chunk.content, str)
                    else str(chunk.content)
                )
                full_content.append(text)
                yield {"event": "token", "data": {"text": text}}

        for citation in self._build_citations(rag_result.items):
            yield {"event": "citation", "data": citation.model_dump()}

        yield {
            "event": "done",
            "data": {
                "session_id": session_id,
                "reply": "".join(full_content),
            },
        }

    @staticmethod
    def _build_messages(message: str, items: list[RagSearchResultItem]) -> list:
        """按检索结果拼装系统提示词：命中则注入上下文，未命中/失败则要求如实说明未找到依据"""
        if items:
            context = "\n\n".join(f"[{item.source.title}] {item.snippet}" for item in items)
            system_prompt = _SYSTEM_PROMPT_WITH_CONTEXT.format(context=context)
        else:
            system_prompt = _SYSTEM_PROMPT_WITHOUT_CONTEXT
        return [SystemMessage(content=system_prompt), HumanMessage(content=message)]

    @staticmethod
    def _build_citations(items: list[RagSearchResultItem]) -> list[Citation]:
        """检索为空时返回空列表，对应「未命中/失败不发出 citation 事件」的约束"""
        return [
            Citation(
                document_title=item.source.title,
                section=None,
                chunk_id=item.id,
                snippet=item.snippet,
            )
            for item in items
        ]

    def _generate_session_id(self) -> str:
        import uuid

        return f"sess_{uuid.uuid4().hex[:12]}"
