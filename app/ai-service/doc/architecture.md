# 问卷分析 Agent — 架构与实现说明

> 本文档取代已删除的 `feasibility-assessment.md`（可行性评估）与 `implementation-checklist.md`（实施清单）。
> 二者是立项阶段的方案设计稿，描述的是"确定性数据注入"技术路线；实际落地时该路线被证明在数据量较大时统计抽样不足以支撑可靠结论，
> 已重构为本文档描述的"自主 Function Calling 循环"方案。设计过程详见 [specs/006-survey-analysis-agent-loop/](../../../specs/006-survey-analysis-agent-loop/)（spec.md / plan.md / data-model.md / contracts/ / quickstart.md）。

## 1. 技术路线

Agent 编排**不使用** LangGraph、`AgentExecutor` 或 `create_agent`，而是显式的 `model.bind_tools()` + `while` 循环：

```
model = get_default_model().bind_tools(ANALYSIS_TOOLS)

while step_count < settings.agent_max_steps and elapsed < settings.agent_timeout_seconds:
    # 1. 流式调用模型，累加 chunk 得到完整 AIMessage
    # 2. 无 tool_calls → 拿到最终结论，跳出循环
    # 3. 有 tool_calls → 逐个执行工具，回填 ToolMessage，进入下一轮
```

选择该路线而非现成的 Agent 框架，是因为业务场景足够简单（4 个工具、单一职责），显式循环便于精确控制 SSE 事件时序、双重终止条件与降级逻辑，避免引入框架的黑盒行为。

核心实现：[src/agents/analysis_agent.py](../src/agents/analysis_agent.py) 的 `AnalysisAgent._run_loop()`。

## 2. 4 个 Function Calling 工具

定义于 [src/tools/analysis_tools.py](../src/tools/analysis_tools.py)，均为 `StructuredTool.from_function(coroutine=..., args_schema=<Pydantic BaseModel>)`：

| 工具名                  | 用途                                                                | 关键入参                                                         | 数据来源                                        |
| ----------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------- |
| `get_survey_structure`  | 获取问卷标题/描述/题目/选项结构                                     | `survey_id`                                                      | q-server `GET /api/admin/surveys/:id`           |
| `get_survey_stats`      | 获取统计概况（各题分布、抽样答案，每题最多 10 条）                  | `survey_id`                                                      | q-server `GET /api/admin/surveys/:id/stats`     |
| `list_survey_responses` | 分页拉取原始答卷，用于统计抽样不足时补充查询                        | `survey_id`, `page`, `page_size≤100`, `question_id?`, `keyword?` | q-server `GET /api/admin/surveys/:id/responses` |
| `analyze_text_batch`    | 对一批开放题文本做分词/关键词/词频/主题聚类，纯本地计算，无网络调用 | `texts`, `top_k=20`                                              | 无（本地 jieba + TF-IDF）                       |

**统一错误契约**：4 个工具内部 `try/except` 吸收全部异常，返回 `{"error": true, "message": "..."}`，绝不向外抛出未捕获异常，使模型能感知失败并自主决策下一步（例如换一种参数重试，或直接基于已有信息生成降级结论）。

`analyze_text_batch` 的本地计算实现：

- [src/analysis/text_processor.py](../src/analysis/text_processor.py)：jieba 分词 + 停用词过滤 + TF-IDF 关键词提取 + 词频统计
- [src/analysis/topic_grouping.py](../src/analysis/topic_grouping.py)：基于关键词共现的轻量主题聚类（无 embedding、无网络调用）

## 3. 双重终止条件与降级逻辑（FR-004）

| 条件       | 配置项                           | 默认值 |
| ---------- | -------------------------------- | ------ |
| 步数上限   | `settings.agent_max_steps`       | 10     |
| 总耗时兜底 | `settings.agent_timeout_seconds` | 60 秒  |

任一条件达到即退出主循环，进入降级路径：

1. 追加一条 `HumanMessage`，明确告知模型"不能再调用工具，请基于已获取的信息直接给出结论"
2. 用 `model.bind(tool_choice="none")` 强制模型只输出文本，不再产生 `tool_calls`
3. 若模型输出未包含"可能不完整"关键字，则确定性拼接一段局限性说明，保证降级结论对用户可见、不误导

最终 `done` 事件的 `degraded: true` 字段标识本次结论是否经过降级路径产出。

## 4. 拉取量软上限（R4，US2）

单次分析全生命周期内，通过 `list_survey_responses` 累计拉取的答卷条数存在软上限：

```python
LIST_RESPONSES_SOFT_CAP = 500  # src/agents/analysis_agent.py
```

一旦 `fetched_responses_count >= LIST_RESPONSES_SOFT_CAP`，强制 `bind(tool_choice="none")`，逼迫模型停止继续拉取原始数据、转入结论生成，避免无限制拉取拖慢响应或超出 Token 预算。

## 5. SSE 事件协议

事件格式：`event: {name}\ndata: {json}\n\n`（`text/event-stream`）。事件词表定义于 [specs/006-survey-analysis-agent-loop/contracts/sse-events.md](../../../specs/006-survey-analysis-agent-loop/contracts/sse-events.md)，Pydantic 结构见 `AgentStreamEvent`（[src/models/schemas.py](../src/models/schemas.py)）：

| 事件          | 数据结构                                             | 说明                                            | 类别       |
| ------------- | ---------------------------------------------------- | ----------------------------------------------- | ---------- |
| `status`      | `{ text }`                                           | 阶段性提示（如"正在理解问卷结构与统计概况..."） | 兼容性扩展 |
| `tool_call`   | `{ name, args, step }`                               | 模型发起一次工具调用                            | 宪法强制   |
| `tool_result` | `{ name, step, summary }`                            | 工具执行结果摘要（超 200 字截断）               | 兼容性扩展 |
| `token`       | `{ text }`                                           | 模型输出的文本片段（流式打字机效果）            | 宪法强制   |
| `done`        | `{ session_id, reply, tool_calls, steps, degraded }` | 分析结束，`reply` 为完整结论                    | 宪法强制   |
| `error`       | `{ message }`                                        | 请求级错误（如缺少 `survey_id`）                | 宪法强制   |

## 6. HTTP 端点

### ai-service（内部服务，不直接暴露给前端）

定义于 [src/api/routes/analysis.py](../src/api/routes/analysis.py)：

| 方法   | 路径                            | 说明                                                        |
| ------ | ------------------------------- | ----------------------------------------------------------- |
| `POST` | `/api/v1/agent/analysis`        | 同步分析，等待循环全部结束后一次性返回 `AnalysisConclusion` |
| `POST` | `/api/v1/agent/analysis/stream` | SSE 流式分析，实时推送上述 6 类事件                         |

请求体 `AnalysisRequest`：`{ survey_id: string, focus?: string, session_id?: string }`。路由层 `_to_internal_message()` 将其编码为 JSON 字符串传给 `AnalysisAgent.chat()` / `chat_stream()`，Agent 内 `_parse_message()` 解析回结构化字段。

### q-server 代理（前端实际调用的入口）

定义于 [app/q-server/src/modules/ai-proxy/ai-proxy.routes.ts](../../q-server/src/modules/ai-proxy/ai-proxy.routes.ts)，挂载前缀 `/api/ai`：

| 方法   | 路径                            | 鉴权                       | 转发至                                                                  |
| ------ | ------------------------------- | -------------------------- | ----------------------------------------------------------------------- |
| `POST` | `/api/ai/agent/analysis`        | 登录 + `requireSuperAdmin` | ai-service `POST /api/v1/agent/analysis`                                |
| `POST` | `/api/ai/agent/analysis/stream` | 登录 + `requireSuperAdmin` | ai-service `POST /api/v1/agent/analysis/stream`（SSE 逐块透传，不缓冲） |

分析接口涉及问卷统计数据，鉴权级别高于通用对话接口（`/api/ai/agent/chat*`，仅需登录）。

## 7. q-server 协作接口（Agent 回调用）

Agent 执行工具调用时，通过 [src/tools/survey_client.py](../src/tools/survey_client.py) 的 `SurveyAPIClient` 回调 q-server，使用 `X-Internal-Api-Key` 内部凭证认证。定义于 [app/q-server/src/modules/survey/survey-stats/survey-stats.routes.ts](../../q-server/src/modules/survey/survey-stats/survey-stats.routes.ts)，前缀 `/api/admin`，统一受 `requireSuperAdminOrInternal` 钩子保护（同时接受超级管理员会话或内部服务凭证）：

| 方法  | 路径                               | 说明                                                               | 限流    |
| ----- | ---------------------------------- | ------------------------------------------------------------------ | ------- |
| `GET` | `/api/admin/surveys/:id`           | 问卷结构（**专为 ai-service Agent 新增**，无 `userId` 所有权过滤） | 30/分钟 |
| `GET` | `/api/admin/surveys/:id/stats`     | 单问卷统计概况                                                     | 30/分钟 |
| `GET` | `/api/admin/surveys/:id/responses` | 分页答卷列表（供 `list_survey_responses` 工具用）                  | 30/分钟 |

`SurveyAPIClient` 内部请求方法带有限次重试（2 次，间隔递增），吸收瞬时网络抖动；重试耗尽后返回结构化错误，不无限重试、不静默吞错（R3）。

## 8. 关键配置项

定义于 [src/config.py](../src/config.py) 的 `Settings`：

| 配置项                  | 默认值 | 说明                     |
| ----------------------- | ------ | ------------------------ |
| `agent_max_steps`       | 10     | 自主循环步数上限         |
| `agent_timeout_seconds` | 60     | 自主循环总耗时兜底（秒） |
| `agent_session_ttl`     | 3600   | 会话保留时长（秒）       |

## 9. 尚未实现的能力

以下能力在早期方案设计中出现过，但当前实现范围不包含，如需评估是否补齐，请查看 [todo-list.md](./todo-list.md) 的 P1/P2 backlog：

- JWT 鉴权 / 请求限流（ai-service 侧，目前由 q-server 代理层的登录鉴权 + 限流统一承担）
- Redis 会话缓存、会话历史压缩
- 审核 Agent（问卷质量审核）、设计辅助 Agent
- RAG 知识库、情感分析、PDF 报告导出
- 前端可视化界面（详见 [todo-list.md](./todo-list.md) 末尾"前端实现需求"章节）
