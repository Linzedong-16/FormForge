"""
问卷答题结果分析 Agent

确定性数据注入模式：先拉取统计数据，注入 Prompt，再 LLM 推理。
不依赖 LangChain Tool Calling，避免 LLM 自主决策带来的额外延迟和失败概率。
"""
from __future__ import annotations

import json
from collections.abc import AsyncGenerator

from langchain_core.messages import HumanMessage, SystemMessage

from ..llm.factory import get_default_model
from ..llm.prompts.analysis import ANALYSIS_SYSTEM_PROMPT
from ..tools.survey_client import survey_client
from .base import BaseAgent


class AnalysisAgent(BaseAgent):
    """问卷答题结果分析 Agent"""

    name = "analysis"
    description = "基于统计数据的问卷答题结果分析 Agent"

    def __init__(self) -> None:
        self.model = get_default_model()

    async def chat(
        self, message: str, session_id: str | None = None
    ) -> dict:
        """同步分析（非流式）

        message 格式为 JSON: {"survey_id": "123", "question": "满意度如何？"}
        """
        survey_id, question = self._parse_message(message)
        stats = await self._fetch_data(survey_id)
        messages = self._build_messages(stats, question)

        response = await self.model.ainvoke(messages)
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
        """流式分析（SSE）"""
        survey_id, question = self._parse_message(message)
        session_id = session_id or self._generate_session_id()

        # 通知前端正在拉取数据
        yield {"event": "status", "data": {"text": "正在获取问卷数据..."}}

        stats = await self._fetch_data(survey_id)

        yield {"event": "status", "data": {"text": "正在分析..."}}

        messages = self._build_messages(stats, question)
        full_content: list[str] = []

        async for chunk in self.model.astream(messages):
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

    # ─── 私有方法 ──────────────────────────────────────────

    @staticmethod
    def _parse_message(message: str) -> tuple[str, str]:
        """解析用户消息，提取 survey_id 和问题文本"""
        try:
            data = json.loads(message)
            return data.get("survey_id", ""), data.get("question", message)
        except (json.JSONDecodeError, TypeError):
            # 纯文本消息：尝试解析 survey_id:xxx 格式
            if message.startswith("survey_id:"):
                parts = message.split("\n", 1)
                sid = parts[0].replace("survey_id:", "").strip()
                question = parts[1].strip() if len(parts) > 1 else "请分析这份问卷"
                return sid, question
            return "", message

    @staticmethod
    async def _fetch_data(survey_id: str) -> dict:
        """从 q-server 获取问卷结构和统计数据"""
        detail = await survey_client.get_survey_detail(survey_id)
        stats = await survey_client.get_survey_stats(survey_id)

        return {
            "survey_structure": detail.get("data", detail),
            "stats_summary": stats.get("data", stats),
        }

    @staticmethod
    def _build_messages(data: dict, question: str) -> list:
        """组装消息列表"""
        system_content = ANALYSIS_SYSTEM_PROMPT.format(
            survey_structure=json.dumps(
                data["survey_structure"], ensure_ascii=False, indent=2
            ),
            stats_summary=json.dumps(
                data["stats_summary"], ensure_ascii=False, indent=2
            ),
        )
        return [
            SystemMessage(content=system_content),
            HumanMessage(content=question),
        ]

    @staticmethod
    def _generate_session_id() -> str:
        import uuid

        return f"sess_{uuid.uuid4().hex[:12]}"
