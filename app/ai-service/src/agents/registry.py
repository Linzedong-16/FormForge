"""
Agent 注册表

维护 agent_type → Agent 工厂函数的映射，支持延迟实例化。
"""
from __future__ import annotations

from collections.abc import Callable

from .base import BaseAgent

_registry: dict[str, Callable[[], BaseAgent]] = {}


def register_agent(agent_type: str, factory: Callable[[], BaseAgent]) -> None:
    """注册 Agent 类型。通常在模块加载时调用。"""
    _registry[agent_type] = factory


def get_agent(agent_type: str) -> BaseAgent:
    """获取 Agent 实例（延迟创建）。"""
    factory = _registry.get(agent_type)
    if not factory:
        available = ", ".join(_registry.keys())
        raise ValueError(f"未知的 Agent 类型: {agent_type}，可用类型: {available}")
    return factory()


def list_agents() -> list[str]:
    """列出所有已注册的 Agent 类型。"""
    return list(_registry.keys())
