# Quickstart: 问卷分析 Agent 自主循环验证指引

**目的**：本文档给出方案落地后可运行的端到端验证场景，用于证明 User Story 1-3 的验收标准已满足。不包含具体实现代码/模型层/控制器完整实现，实现细节由 `/speckit-tasks` 与 `/speckit-implement` 阶段产出。

## 前置条件

1. q-server 已完成 Phase 0 修复：新增 `GET /api/admin/surveys/:id`（见 [contracts/survey-structure-endpoint.md](./contracts/survey-structure-endpoint.md)），且 `X-Internal-Api-Key` 已在 q-server 的 `system_configs` 中配置为与 ai-service `.env` 的 `Q_SERVER_API_KEY` 一致。
2. ai-service 已完成 Phase 1 重构：`analysis_agent.py` 已切换为 `bind_tools` 自主循环编排器，四个工具（`get_survey_structure`/`get_survey_stats`/`list_survey_responses`/`analyze_text_batch`）已在 `analysis_tools.py` 中声明并绑定。
3. ai-service `.env` 已配置有效的 `AI_API_KEY`（DeepSeek）与 `Q_SERVER_BASE_URL`（指向本地或测试环境的 q-server）。
4. 数据库中存在至少一份满足以下条件的测试问卷：包含单选题、多选题、开放题，且已有 ≥1 份答卷（用于验证 User Story 1）。

## 场景 1：单次请求触发完整自主闭环（对应 User Story 1 / SC-001 / SC-002）

**步骤**：

```bash
curl -N -X POST http://localhost:8080/api/ai/agent/analysis/stream \
  -H "Authorization: Bearer <超级管理员 JWT>" \
  -H "Content-Type: application/json" \
  -d '{"survey_id": "<测试问卷 ID>", "focus": ""}'
```

**预期结果**：

- 请求发起后 ≤5 秒内收到首个 `event: status` 事件（SC-001）。
- 随后依次出现若干 `tool_call`/`tool_result` 事件对（数量应 ≥2，至少覆盖 `get_survey_structure` 与 `get_survey_stats` 两类调用）。
- 最终出现连续的 `token` 事件流，拼接后形成一段引用了具体统计数字与关键词、且与问卷实际内容相关的文字结论。
- 以 `event: done` 结束，`data.reply` 非空，`data.degraded` 为 `false`。
- 整个请求从发起到 `done` 事件的总耗时 ≤60 秒（SC-002，典型规模问卷 ≤20 题、≤200 份答卷）。

**验证要点（对应 SC-004）**：抽取 `done.reply` 中出现的任意具体数字（如某选项占比、某关键词出现次数），应能在同一响应流中先前出现的某个 `tool_result.data.summary` 中找到对应依据。

## 场景 2：两次独立请求互不共享状态（对应 User Story 1 验收场景 2 / FR-009）

**步骤**：对同一 `survey_id` 相隔发起两次场景 1 中的请求，比较两次响应。

**预期结果**：两次响应的 `session_id` 不同；两次 `tool_call` 序列各自独立（不依赖前一次的工具调用结果或消息历史）；两次结论文本可以不同措辞但均独立成文，不出现"如前所述"一类跨请求引用的表述。

## 场景 3：统计抽样不足时的自主补充查询（对应 User Story 2）

**前置**：准备一份开放题实际答案数量远超统计抽样上限（当前每题仅抽样 10 条）的测试问卷（如某开放题有 ≥100 份文本答案）。

**步骤**：对该问卷重复场景 1 的请求。

**预期结果**：响应事件流中出现 `tool_call.data.name == "list_survey_responses"` 的调用（说明 Agent 判断统计抽样不足并自主发起分页查询）；最终 `done.reply` 中对该开放题的分析应体现出对更大样本的归纳（而非仅基于 10 条抽样的粗略描述）。当已获取数据足以支撑结论时，不应再产生多余的工具调用（避免不必要延迟）。

## 场景 4：不存在的问卷 ID（对应 Edge Case / spec.md 附录 F 异常场景契约）

**步骤**：将 `survey_id` 替换为一个不存在或已被软删除的 ID，重复场景 1 的请求。

**预期结果**：`get_survey_structure` 工具返回结构化错误；Agent 在合理步数内（不应触发 `agent_max_steps` 上限）直接产出 `done` 事件，`reply` 明确说明"问卷不存在"，不得编造分析内容；不应出现 `error` 事件（这是可预期的业务结果，非系统异常）。

## 场景 5：步数上限降级输出（对应 User Story 3 / FR-004）

**步骤**：临时将 `.env` 中 `agent_max_steps` 调整为一个极小值（如 `1`），针对一份正常问卷重复场景 1 的请求。

**预期结果**：循环在达到上限后强制进入结论生成，`done.data.degraded == true`，`reply` 正文中包含"分析基于当前已获取的数据，可能不完整"一类的局限性说明；不出现无响应挂起或无提示的请求中断。测试完成后需将 `agent_max_steps` 还原为默认值（10）。

## 场景 6：上游故障时的错误反馈（对应 SC-005）

**步骤**：临时停止本地 q-server 服务（或将 `Q_SERVER_BASE_URL` 指向一个不可达地址），重复场景 1 的请求。

**预期结果**：工具调用在有限重试（research.md R3，建议 2 次）后仍失败，产生结构化错误反馈给模型；若模型判断无法继续（数据完全不可获取），应产生 `error` 事件并终止流，而非无限等待；请求发起方能在合理时间内收到明确的错误反馈。

## 非流式对等接口验证（可选）

对 `POST /api/ai/agent/analysis`（非 `/stream`）重复场景 1 的请求，预期一次性收到完整 JSON 响应 `{ session_id, reply, tool_calls, steps }`，内容语义与流式接口的 `done` 事件一致，仅传输方式不同。

## 已知限制（需在验证报告中同步说明）

- 主题归类（`clusters`）为 MVP 关键词共现聚类，非语义向量聚类，对措辞差异较大但语义相近的文本可能归类效果有限（见 research.md R5，已记录为附录 G Phase 5 后续增强项）。
- 当前仅验证 DeepSeek Provider；`AI_PROVIDER` 切换至其他厂商的验证需在对应 Provider 的 API Key 配置完成后单独执行，本轮不覆盖。
