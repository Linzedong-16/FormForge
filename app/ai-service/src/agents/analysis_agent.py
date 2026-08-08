"""
问卷答题结果分析 Agent — 自主循环编排器

以 model.bind_tools() + 显式 while step_count < agent_max_steps 循环替代旧版
"确定性单轮注入"模式：模型自主决定何时调用哪个工具、调用几次，直至信息充分后
生成最终结论；循环全过程通过 SSE status/tool_call/tool_result/token/done 事件对外可见
（对应 research.md R1、data-model.md、contracts/sse-events.md）。
"""

from __future__ import annotations

import json
import time
import uuid
from collections.abc import AsyncGenerator
from typing import Any

from langchain_core.messages import AIMessage, HumanMessage, ToolMessage

from ..config import settings
from ..llm.factory import get_default_model
from ..llm.prompts.analysis import build_initial_messages
from ..models.schemas import ToolCallRecord
from ..tools.analysis_tools import ANALYSIS_TOOLS
from .base import BaseAgent

# 工具名 -> StructuredTool 实例映射，供每步分发模型产出的 tool_calls
_TOOLS_BY_NAME = {tool.name: tool for tool in ANALYSIS_TOOLS}

# 单次分析全生命周期内，通过 list_survey_responses 累计拉取的答卷总数软上限
# （R4，与 list_survey_responses 单页 page_size≤100 对齐，见 spec.md 附录 A.4 卡点 6）
LIST_RESPONSES_SOFT_CAP = 500


class AnalysisAgent(BaseAgent):
    """问卷答题结果分析 Agent（自主循环模式）"""

    name = "analysis"
    description = "基于 Function Calling 自主循环的问卷答题结果分析 Agent"

    def __init__(self) -> None:
        self.model = get_default_model().bind_tools(ANALYSIS_TOOLS)

    async def chat(self, message: str, session_id: str | None = None) -> dict:
        """同步分析（非流式）：复用自主循环，仅取最终 done/error 事件的数据"""
        session_id = session_id or self._generate_session_id()
        result: dict = {
            "session_id": session_id,
            "reply": "",
            "tool_calls": [],
            "steps": 0,
            "degraded": False,
        }

        async for event in self._run_loop(session_id, message):
            if event["event"] == "done":
                data = event["data"]
                result = {
                    "session_id": data["session_id"],
                    "reply": data["reply"],
                    "tool_calls": data["tool_calls"],
                    "steps": data["steps"],
                    "degraded": data["degraded"],
                }
            elif event["event"] == "error":
                result["reply"] = event["data"]["message"]

        return result

    async def chat_stream(
        self, message: str, session_id: str | None = None
    ) -> AsyncGenerator[dict, None]:
        """流式分析（SSE）：直接转发自主循环产出的事件"""
        session_id = session_id or self._generate_session_id()
        async for event in self._run_loop(session_id, message):
            yield event

    # ─── 自主循环核心 ──────────────────────────────────────────

    async def _run_loop(self, session_id: str, message: str) -> AsyncGenerator[dict, None]:
        """自主循环编排：维护 messages/tool_call_history/step_count；

        每步以流式方式调用模型——若该步产出 tool_calls 则分发给对应工具执行并追加
        ToolMessage 进入下一步推理；若无 tool_calls 说明模型已生成最终回复，
        其间产出的正文片段已通过 token 事件实时推送，循环随即以 done 收尾。
        """
        survey_id, focus = self._parse_message(message)
        if not survey_id:
            yield {"event": "error", "data": {"message": "缺少有效的 survey_id"}}
            return

        yield {"event": "status", "data": {"text": "正在理解问卷结构与统计概况..."}}

        # focus 留空表示"全面分析"（对应 quickstart.md/data-model.md 对 focus 字段的约定）
        question = focus or "请对本问卷进行一次全面的分析总结"
        messages = build_initial_messages(survey_id, question)
        tool_call_history: list[ToolCallRecord] = []
        step_count = 0
        final_content: str | None = None
        fetched_responses_count = 0
        start_time = time.monotonic()

        # FR-004 双重终止条件：步数上限（agent_max_steps）与总耗时上限（agent_timeout_seconds）
        # 任一达到即退出循环，进入下方统一的降级结论生成路径（T017/T018）
        while (
            step_count < settings.agent_max_steps
            and (time.monotonic() - start_time) < settings.agent_timeout_seconds
        ):
            full_response: AIMessage | None = None
            async for chunk in self.model.astream(messages):
                full_response = chunk if full_response is None else full_response + chunk
                if chunk.content:
                    yield {"event": "token", "data": {"text": self._extract_text(chunk)}}

            messages.append(full_response)

            if not full_response.tool_calls:
                final_content = self._extract_text(full_response)
                break

            for tool_call in full_response.tool_calls:
                yield {
                    "event": "tool_call",
                    "data": {
                        "name": tool_call["name"],
                        "args": tool_call["args"],
                        "step": step_count,
                    },
                }

                result = await self._invoke_tool(tool_call)
                status = "error" if isinstance(result, dict) and result.get("error") else "success"

                if tool_call["name"] == "list_survey_responses" and status == "success":
                    fetched_responses_count += self._extract_response_count(result)

                tool_call_history.append(
                    ToolCallRecord(
                        tool_name=tool_call["name"],
                        arguments=tool_call["args"],
                        result_summary=result,
                        step_index=step_count,
                        status=status,
                    )
                )
                yield {
                    "event": "tool_result",
                    "data": {
                        "name": tool_call["name"],
                        "step": step_count,
                        "summary": self._summarize_result(result),
                    },
                }

                messages.append(
                    ToolMessage(
                        content=json.dumps(result, ensure_ascii=False),
                        tool_call_id=tool_call["id"],
                    )
                )

            step_count += 1

            # R4 软上限：累计拉取的答卷总数超过阈值后，强制跳过后续工具调用，
            # 直接以 tool_choice="none" 逼迫模型仅生成文本结论，不再产出新的 tool_calls
            if fetched_responses_count >= LIST_RESPONSES_SOFT_CAP:
                yield {
                    "event": "status",
                    "data": {
                        "text": f"已达到答卷拉取量软上限（{LIST_RESPONSES_SOFT_CAP} 条），"
                        "停止继续拉取原始答卷，基于当前数据生成结论..."
                    },
                }
                final_response: AIMessage | None = None
                async for chunk in self.model.bind(tool_choice="none").astream(messages):
                    final_response = chunk if final_response is None else final_response + chunk
                    if chunk.content:
                        yield {"event": "token", "data": {"text": self._extract_text(chunk)}}
                final_content = self._extract_text(final_response)
                break

        # FR-004：步数上限/总耗时上限降级兜底——任一硬性上限耗尽仍未产出最终结论时，
        # 强制以 tool_choice="none" 逼迫模型停止调用工具，基于已获得数据生成"最佳努力"结论
        degraded = final_content is None
        if degraded:
            timed_out = (time.monotonic() - start_time) >= settings.agent_timeout_seconds
            limit_desc = (
                f"总耗时上限（{settings.agent_timeout_seconds} 秒）"
                if timed_out
                else f"最大推理步数上限（{settings.agent_max_steps}）"
            )
            yield {
                "event": "status",
                "data": {"text": f"已达到{limit_desc}，基于当前已获取的数据生成最终结论..."},
            }
            messages.append(
                HumanMessage(
                    content=(
                        f"已达到{limit_desc}，不能再调用任何工具。"
                        "请基于以上已获取的全部数据，直接给出一份最佳努力的分析结论。"
                    )
                )
            )
            final_response: AIMessage | None = None
            async for chunk in self.model.bind(tool_choice="none").astream(messages):
                final_response = chunk if final_response is None else final_response + chunk
                if chunk.content:
                    yield {"event": "token", "data": {"text": self._extract_text(chunk)}}
            final_content = self._extract_text(final_response)

            # 局限性说明是 FR-004 的硬性要求，不完全依赖模型自觉遵循 Prompt 约束，
            # 模型输出未包含该说明时确定性补全，确保降级结论始终满足要求
            if "可能不完整" not in final_content:
                final_content = (
                    f"{final_content}\n\n（提示：分析基于当前已获取的数据，可能不完整。）"
                )

        yield {
            "event": "done",
            "data": {
                "session_id": session_id,
                "reply": final_content,
                "tool_calls": [record.model_dump() for record in tool_call_history],
                "steps": step_count,
                "degraded": degraded,
            },
        }

    # ─── 私有辅助方法 ──────────────────────────────────────────

    @staticmethod
    async def _invoke_tool(tool_call: dict) -> dict:
        """执行单次工具调用；未知工具名或入参校验失败同样降级为结构化错误，不向外抛出异常"""
        tool = _TOOLS_BY_NAME.get(tool_call["name"])
        if tool is None:
            return {"error": True, "message": f"未知工具：{tool_call['name']}"}
        try:
            return await tool.ainvoke(tool_call["args"])
        except Exception as exc:  # noqa: BLE001 — 编排层兜底，任何工具调用异常都不应中断整个循环
            return {"error": True, "message": f"工具调用异常：{exc}"}

    @staticmethod
    def _extract_text(response: AIMessage) -> str:
        content = response.content
        return content if isinstance(content, str) else str(content)

    @staticmethod
    def _extract_response_count(result: dict) -> int:
        """从 list_survey_responses 工具返回结果中提取本次实际拉取到的答卷条数

        对应 q-server 统一响应结构 {code, msg, data: {responses, total, page, page_size}}，
        非预期结构（如结果被上游截断/异常兜底）时返回 0，不影响累计计数的准确性
        """
        if not isinstance(result, dict):
            return 0
        data = result.get("data")
        if isinstance(data, dict):
            responses = data.get("responses")
            if isinstance(responses, list):
                return len(responses)
        return 0

    @staticmethod
    def _summarize_result(result: Any, max_len: int = 200) -> str:
        """将工具结果压缩为一行摘要，供 tool_result SSE 事件展示"""
        text = json.dumps(result, ensure_ascii=False)
        return text if len(text) <= max_len else f"{text[:max_len]}..."

    @staticmethod
    def _parse_message(message: str) -> tuple[str, str]:
        """解析内部消息，提取 survey_id 和 focus（对应 analysis.py 路由编码的 {survey_id, focus} JSON）"""
        try:
            data = json.loads(message)
            return data.get("survey_id", ""), data.get("focus") or ""
        except (json.JSONDecodeError, TypeError):
            # 纯文本消息：兼容 survey_id:xxx 格式（非当前 HTTP 契约，仅作防御性兜底）
            if message.startswith("survey_id:"):
                parts = message.split("\n", 1)
                sid = parts[0].replace("survey_id:", "").strip()
                focus = parts[1].strip() if len(parts) > 1 else ""
                return sid, focus
            return "", ""

    @staticmethod
    def _generate_session_id() -> str:
        return f"sess_{uuid.uuid4().hex[:12]}"
