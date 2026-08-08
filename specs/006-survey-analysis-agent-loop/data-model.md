# Data Model: 问卷分析 Agent 自主循环方案设计

**Input**: [spec.md](./spec.md) Key Entities | **Research**: [research.md](./research.md)

> 本方案范围内所有实体均为**单次请求生命周期内的内存态对象**（Pydantic 模型），不持久化、不引入新的数据库表或缓存结构（FR-009：不引入多轮会话持久化）。以下字段定义供 Phase 2 `/speckit-tasks` 落地为 `src/models/schemas.py` 中的具体 Pydantic 类。

## 1. AnalysisRunContext（分析运行时上下文）

单次分析请求的顶层上下文，贯穿整个自主循环，循环结束后即释放。

| 字段                | 类型                       | 说明                                                                 |
| ------------------- | -------------------------- | -------------------------------------------------------------------- |
| `session_id`        | string                     | 仅用于日志/追踪关联，不用于恢复历史对话（FR-009）                    |
| `survey_id`         | string                     | 目标问卷唯一标识，来自请求入参                                       |
| `focus`             | string \| null             | 分析侧重点，可选；留空表示"全面分析"                                 |
| `step_count`        | int                        | 当前已执行的循环步数，初始为 0，每次工具调用后 +1                    |
| `tool_call_history` | ToolCallRecord[]           | 本次运行中全部工具调用记录，按发生顺序追加                           |
| `messages`          | list（LangChain 消息对象） | 累积的 `HumanMessage`/`AIMessage`/`ToolMessage` 列表，驱动下一轮推理 |

**校验规则**：`step_count` 不得超过配置的 `agent_max_steps`（默认 10）；超出时循环必须强制终止并进入降级结论生成（FR-004）。

**状态转换**：`初始化 → 循环中（推理⇄工具调用）→ 结论生成 → 结束`；一旦进入"结论生成"状态不可再回退到"循环中"（对应 spec.md 附录 C.1 步骤 2 中"达到上限跳过后续推理"的约束）。

## 2. ToolCallRecord（工具调用记录）

| 字段             | 类型                     | 说明                                                                                                       |
| ---------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `tool_name`      | string                   | 四类工具之一：`get_survey_structure` / `get_survey_stats` / `list_survey_responses` / `analyze_text_batch` |
| `arguments`      | dict                     | 模型生成的调用参数（已通过工具入参 Schema 校验）                                                           |
| `result_summary` | string \| dict           | 工具执行结果的摘要（大结果需截断，不完整回显原始数据，见 SSE `tool_result` 事件约束）                      |
| `step_index`     | int                      | 该调用发生时对应的 `AnalysisRunContext.step_count` 值                                                      |
| `status`         | enum(`success`, `error`) | 调用结果状态；`error` 时 `result_summary` 应为结构化错误信息 `{error: true, message: "..."}`（R3）         |

**校验规则**：`status=error` 时 `result_summary` 必须包含 `error: true` 字段，供模型据此感知失败并自主决策（FR-010）。

## 3. SurveyStructureSnapshot（问卷结构快照）

对应工具 `get_survey_structure` 的出参结构（附录 D.1），来自 q-server 新增接口 `GET /api/admin/surveys/:id`。

| 字段          | 类型           | 说明         |
| ------------- | -------------- | ------------ |
| `survey_id`   | string         | 问卷唯一标识 |
| `title`       | string         | 问卷标题     |
| `description` | string \| null | 问卷描述     |
| `questions`   | Question[]     | 题目列表     |

**Question 子结构**：

| 字段       | 类型             | 说明                                                     |
| ---------- | ---------------- | -------------------------------------------------------- |
| `id`       | string           | 题目唯一标识                                             |
| `type`     | string           | 题型（单选/多选/开放题等，与 q-server 现有题型枚举一致） |
| `title`    | string           | 题目文本                                                 |
| `required` | bool             | 是否必填                                                 |
| `options`  | string[] \| null | 选项列表（仅单/多选题存在）                              |

## 4. SurveyStatsSnapshot（问卷统计快照）

对应工具 `get_survey_stats` 的出参结构（附录 D.2），**直接复用**现有 `SurveyStatsService.getSurveyStats()` 的输出结构，不新增字段定义，仅在 ai-service 侧作为工具结果原样传递给模型（逐题分布 + 均值/极值 + 每题最多 10 条文本抽样）。

## 5. TextAnalysisSummary（文本分析摘要）

对应工具 `analyze_text_batch` 的出参结构（附录 D.4）。

| 字段        | 类型           | 说明                           |
| ----------- | -------------- | ------------------------------ |
| `keywords`  | KeywordItem[]  | TF-IDF 关键词列表，默认 top 20 |
| `word_freq` | WordFreqItem[] | 词频统计列表，默认 top 20      |
| `clusters`  | ClusterItem[]  | 轻量主题聚类结果（R5）         |

**KeywordItem**：`{ word: string, weight: float }`
**WordFreqItem**：`{ word: string, count: int }`
**ClusterItem**：`{ label: string, sample_texts: string[], count: int }`

## 6. AnalysisConclusion（最终分析结论）

面向用户的完整文字结论，通过 SSE `token` 事件逐段流式输出，最终在 `done` 事件中以完整字符串呈现。

| 字段         | 类型                         | 说明                                                                                              |
| ------------ | ---------------------------- | ------------------------------------------------------------------------------------------------- |
| `session_id` | string                       | 关联本次运行的追踪 ID                                                                             |
| `reply`      | string                       | 完整结论文本；理论上其中出现的每个具体数字/结论都应可追溯到某次 `ToolCallRecord` 的结果（SC-004） |
| `tool_calls` | ToolCallRecord[]（摘要视图） | 本次分析的工具调用汇总列表                                                                        |
| `steps`      | int                          | 实际执行的循环步数                                                                                |
| `degraded`   | bool                         | 是否因达到 `agent_max_steps` 上限而进入降级结论生成（User Story 3）                               |

**校验规则**：`degraded=true` 时 `reply` 正文必须显式包含"分析基于当前已获取的数据，可能不完整"一类的局限性说明（FR-004 / User Story 3 验收场景 2）。

---

## 实体关系图（概念级，非 ORM）

```text
AnalysisRunContext (1) ──包含多条── ToolCallRecord (0..N)
        │
        └─ 循环结束后 ──产出──> AnalysisConclusion (1)

ToolCallRecord.tool_name = "get_survey_structure" → result_summary 形如 SurveyStructureSnapshot
ToolCallRecord.tool_name = "get_survey_stats"      → result_summary 形如 SurveyStatsSnapshot
ToolCallRecord.tool_name = "list_survey_responses"  → result_summary 形如分页答卷明细（见 contracts/function-calling-tools.md D.3）
ToolCallRecord.tool_name = "analyze_text_batch"     → result_summary 形如 TextAnalysisSummary
```

**关键约束（贯穿全部实体）**：所有实体均无跨请求持久化字段（无 `created_at`/`updated_at`/数据库主键），因为本方案明确不引入会话持久化（FR-009）；`session_id` 是唯一的跨事件关联标识，仅用于单次请求内部的 SSE 事件流关联与追踪日志，请求结束后即失效。
