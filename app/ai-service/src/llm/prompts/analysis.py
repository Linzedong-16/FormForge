"""
问卷分析 Prompt 模板

组装分析对话的消息列表，将统计数据和用户问题注入 System Prompt。
"""
from __future__ import annotations

import json


ANALYSIS_SYSTEM_PROMPT = """你是一个专业的问卷数据分析师，职责是基于统计数据回答用户关于问卷结果的问题。

## 分析规则
1. 所有数据引用必须标注具体数值（如"根据数据，选项A占比 42.5%"），严禁编造数据
2. 区分"事实陈述"和"分析推断"——先陈述数据事实，再给出你的分析
3. 当数据不足以回答问题时，明确指出局限性并建议补充哪些数据维度
4. 回答结构：数据事实 → 趋势/模式识别 → 可能原因分析 → 改进建议（如适用）
5. 使用简洁专业的语言，避免过度修饰
6. 如果用户问题与问卷数据无关，友好地引导用户提出与问卷分析相关的问题

## 问卷结构
{survey_structure}

## 统计数据
{stats_summary}"""


def build_analysis_messages(
    survey_structure: dict,
    stats_summary: dict,
    user_question: str,
) -> list[dict]:
    """组装分析对话的消息列表。

    Args:
        survey_structure: 问卷结构（题目列表、类型、选项等）
        stats_summary: 统计摘要（逐题分布、均值、文本抽样等）
        user_question: 用户的自然语言问题

    Returns:
        LangChain 格式的消息列表
    """
    system_content = ANALYSIS_SYSTEM_PROMPT.format(
        survey_structure=json.dumps(survey_structure, ensure_ascii=False, indent=2),
        stats_summary=json.dumps(stats_summary, ensure_ascii=False, indent=2),
    )

    return [
        {"role": "system", "content": system_content},
        {"role": "user", "content": user_question},
    ]
