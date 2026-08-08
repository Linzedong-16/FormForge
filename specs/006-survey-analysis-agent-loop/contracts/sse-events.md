# Contract: SSE 事件契约

**对应**：spec.md 附录 F | FR-002 | FR-007 | Constitution Principle IX（强制 SSE 事件词表）

## 端点

- **流式**：`POST /api/ai/agent/analysis/stream`（q-server，逐块透传至 ai-service `POST /api/v1/agent/analysis/stream`）
- **非流式对等接口**：`POST /api/ai/agent/analysis`（等待循环完整结束后一次性返回 `AnalysisConclusion`，语义不变，仅内部实现从单轮调用变为驱动完整循环后取最终结果）

## 请求体

```json
{ "survey_id": "123", "focus": "" }
```

| 字段        | 类型   | 必填 | 说明                           |
| ----------- | ------ | ---- | ------------------------------ |
| `survey_id` | string | 是   | 目标问卷唯一标识               |
| `focus`     | string | 否   | 分析侧重点；留空表示"全面分析" |

**鉴权**：沿用现状 —— 需登录 + 超级管理员权限（`requireSuperAdmin`），与现有分析类接口一致，无需新增鉴权设计。

## 响应：SSE 事件词表

`Content-Type: text/event-stream`。事件按发生顺序推送，典型序列为：`status` → （`tool_call`/`tool_result`）× N → `token` × M → `done`；任一环节异常时以 `error` 终止流。

| event         | data 结构                                                                                 | 说明                                                            | 词表分类              |
| ------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------- | --------------------- |
| `status`      | `{ text: string }`                                                                        | 阶段性状态提示（如"正在获取问卷结构"）                          | 兼容性扩展            |
| `tool_call`   | `{ name: string, args: object, step: int }`                                               | 工具调用发起，`step` 为当前循环步数                             | Constitution 强制词表 |
| `tool_result` | `{ name: string, step: int, summary: object }`                                            | 工具调用结果摘要（大结果需截断/摘要，不直接回显全部原始数据）   | 兼容性扩展            |
| `token`       | `{ text: string }`                                                                        | 最终结论逐 token 增量输出                                       | Constitution 强制词表 |
| `done`        | `{ session_id: string, reply: string, tool_calls: object[], steps: int, degraded: bool }` | 完整结束，`reply` 为拼接后的完整结论                            | Constitution 强制词表 |
| `error`       | `{ message: string }`                                                                     | 异常终止（模型 API 异常、工具执行异常且无法降级、客户端断开等） | Constitution 强制词表 |

**与既有强制词表的关系**：Constitution Principle IX 要求的最小词表为 `token`/`tool_call`/`done`/`error`，本方案完整保留并新增 `status`/`tool_result` 作为兼容性扩展（不影响既有强制词表的语义与结构）。

## 与现有代理层的兼容性

`app/q-server/src/modules/ai-proxy/ai-proxy.routes.ts` 对 `/stream` 结尾路径采用"逐块透传原始字节，不做任何解析"的转发策略（`reply.raw.write(value)`），因此新增的 `tool_call`/`tool_result`/`status` 事件**天然兼容，q-server 侧无需任何改动**（已在 research.md R7 确认）。

## 前端渲染建议（预留，供未来前端对接）

- `status`/`tool_call`/`tool_result` 汇总为"处理进度提示条"
- `token` 累加渲染为结论正文
- `done` 标记结束，可展示 `tool_calls` 汇总（如"本次分析共查询 3 次数据、处理 2 批文本"）；`degraded=true` 时应有视觉提示告知用户结论可能不完整
- `error` 展示错误提示

## 异常场景契约

| 场景                        | 行为                                                                                                                                                           |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `survey_id` 不存在/已删除   | 首次 `get_survey_structure` 工具调用返回结构化错误 → Agent 应在合理步数内直接产出说明"问卷不存在"的 `done`（非 `error`，因为这是可预期的业务结果而非系统异常） |
| 问卷零答卷                  | 统计/明细工具均返回空数据 → 直接进入结论生成，输出"暂无有效答卷数据"，不做不必要的多轮工具调用                                                                 |
| DeepSeek API 超时/异常      | 产生 `error` 事件并终止流，不允许无声挂起                                                                                                                      |
| q-server 内部接口持续失败   | 工具结果携带结构化错误，Agent 感知后在结论中说明数据缺失；不导致整个请求无提示中断（FR-010）                                                                   |
| 客户端主动断开              | 复用现有 `ai-proxy` 的 `AbortController` 机制，ai-service 感知断开后及时停止后续 LLM/工具调用                                                                  |
| 达到 `agent_max_steps` 上限 | 强制进入结论生成，`done.degraded=true`，`reply` 正文包含局限性说明                                                                                             |
