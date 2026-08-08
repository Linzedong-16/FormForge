"""
Agent 模块初始化 — 注册所有可用 Agent 类型
"""
from .analysis_agent import AnalysisAgent
from .chat_agent import ChatAgent
from .registry import list_agents, register_agent

# 注册已知 Agent 类型（延迟实例化）
register_agent("chat", lambda: ChatAgent())
register_agent("design", lambda: ChatAgent())  # 暂用 ChatAgent
register_agent("review", lambda: ChatAgent())  # 暂用 ChatAgent
register_agent("analysis", lambda: AnalysisAgent())
