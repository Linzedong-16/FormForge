# AnalysisAgent 自主循环优化提示词

> 范围说明：仅针对 `src/agents/analysis_agent.py` 单轮自主 Function-Calling 循环本身的可靠性/性能/可观测性优化。
> **不包含**多轮对话、会话记忆、上下文摘要压缩相关内容（该部分由其他项目负责，本文档明确排除）。
> 标记：`[ ]` 待执行 / `[✓]` 已完成 / `[-]` 跳过（附原因）
> 后续迭代直接在此文件勾选进度，每完成一项在对应条目下补一行简要说明（改了什么、验证方式）。

---

## P0 — 可靠性（改动集中在 `_run_loop` / `_invoke_tool`，风险可控）

- [ ] **LLM 流式调用容错重试**（`analysis_agent.py:110`，`async for chunk in self.model.astream(messages)`）
  - 现状：外层无 `try/except`，网络抖动/限流/5xx 会直接抛出异常，SSE 连接异常中断，前端无有效错误信息
  - 方案：用 `tenacity` 指数退避重试；仅重试"本步尚未产出任何 token"的情况——一旦已经 `yield` 过 token 就不再静默重试，转入降级路径基于已获取数据收尾；重试耗尽后 `yield {"event": "error", ...}` 并 `return`，不让异常向上抛出
  - 验证：mock DeepSeek 客户端间歇抛出 `httpx.ConnectError`/`RateLimitError`，断言最终仍能正常收到 `done` 或 `error` 事件，SSE 连接不中断

- [ ] **工具调用独立超时**（`_invoke_tool`，`analysis_agent.py:232`）
  - 现状：`await tool.ainvoke(...)` 无独立超时，工具内部 HTTP 回调 q-server 卡住时，只能靠整体 `agent_timeout_seconds`（60s）兜底，浪费掉本可用于模型推理的时间预算
  - 方案：`await asyncio.wait_for(tool.ainvoke(args), timeout=settings.tool_timeout_seconds)`，超时转为结构化 `{"error": True, "message": "工具 xxx 调用超时"}`，新增 `TOOL_TIMEOUT_SECONDS` 配置项（建议默认 15s）
  - 验证：mock 一个工具 `ainvoke` 永久 `await asyncio.sleep(999)`，断言在配置的超时秒数内拿到降级错误而非等到 60s 整体超时

- [ ] **同一步内 tool_calls 并发执行**（`analysis_agent.py:121` 的 `for` 循环）
  - 现状：模型一步产出多个 `tool_calls` 时顺序 `await`，天然串行拉长单步耗时
  - 方案：`asyncio.gather(*(self._invoke_tool(tc) for tc in full_response.tool_calls))`
  - 注意：并发后 SSE 事件时序会从"逐个出现"变为"批量到达"（先发完所有 `tool_call` 事件，等全部结果返回后按原顺序发 `tool_result`）——**改动前需与前端确认展示层能否接受**
  - 验证：mock 两个耗时工具（各 sleep 1s），断言并发后该步总耗时接近 1s 而非 2s

- [ ] **会话内工具结果去重缓存**
  - 现状：模型可能对同一 `(tool_name, args)` 组合重复调用，每次都真实打一次下游请求，浪费 step 配额与下游压力
  - 方案：`_run_loop` 内维护 `dict[(tool_name, json.dumps(args, sort_keys=True)), result]`，命中直接复用；因四个工具全部只读幂等，无需考虑缓存失效
  - 验证：构造模型对同一工具+同一参数调用两次的场景，断言下游 mock 只被真实调用一次

---

## P1 — 治理粒度与可观测性

- [ ] **通用化工具调用次数上限**
  - 现状：`LIST_RESPONSES_SOFT_CAP`（`analysis_agent.py:32`）只覆盖 `list_survey_responses` 一个工具，其他工具（如 `analyze_text_batch`）无任何调用次数防护
  - 方案：引入 `Counter[str]` 统计本轮每个工具的调用次数，超过 `settings.max_calls_per_tool` 时强制跳过该工具后续调用、走降级提示，替代"每加一个工具手写一条专属计数逻辑"的模式

- [ ] **Token 用量采集**
  - 现状：`done` 事件仅含 `steps`/`degraded`，无任何 token 消耗数据，无法核算单次分析成本
  - 方案：从累加后的 `AIMessage.usage_metadata`（或 DeepSeek 返回的 `usage` 字段）读取 `input_tokens`/`output_tokens`，累加进 `done` 事件返回结构，为后续计费与异常成本检测（模型重复输出导致 token 暴涨）打基础

- [ ] **降级路径服务端可观测性**
  - 现状：`degraded=True`（`analysis_agent.py:184`）只回传给前端展示，服务端无日志记录
  - 方案：降级分支补一条结构化日志（`survey_id`、触发原因是步数上限还是超时、`fetched_responses_count`），为后续调参（是否提高 `agent_max_steps`、大问卷是否需要单独策略）提供数据依据

---

## P2 — 评测与代码整洁（可选，视迭代节奏排期）

- [ ] **工具选择离线回归测试集**
  - 构造一批 `(survey_id, focus)` 输入 + 预期工具调用序列/结论要点断言，写成 pytest 用例
  - 目的：改 System Prompt 或切换模型时有回归防护网，不必纯靠肉眼看 SSE 输出判断是否变差

- [ ] **清理 `_parse_message` 死分支**（`analysis_agent.py:276-281`）
  - 现状：`survey_id:xxx` 文本兜底分支注释自称"非当前 HTTP 契约，仅作防御性兜底"，真实调用路径永远不会触发，且无测试覆盖
  - 方案：直接删除；若未来真的出现非 JSON 调用方式再加，不为不会发生的场景保留死代码

---

## 已知代价与前置确认项

- P0 第 3 项（tool_calls 并发化）改变 SSE 事件到达节奏，属于对前端有感知影响的改动，实施前需要前端确认
- P1 第 1 项引入新配置项 `max_calls_per_tool`，需要同步更新 `.env.example` 与部署文档
