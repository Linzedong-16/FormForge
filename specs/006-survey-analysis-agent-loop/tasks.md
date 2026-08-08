---
description: "问卷分析 Agent 自主循环方案设计 — 任务分解"
---

# Tasks: 问卷分析 Agent 自主循环方案设计

**Input**: Design documents from `specs/006-survey-analysis-agent-loop/`
**Prerequisites**: [plan.md](./plan.md)（必需）、[spec.md](./spec.md)（必需，3 个用户故事）、[data-model.md](./data-model.md)、[contracts/](./contracts/)、[research.md](./research.md)、[quickstart.md](./quickstart.md)（均已就位）

**Tests**: spec.md 未显式要求 TDD/按用户故事编写测试，故不生成按故事划分的强制测试任务；仅在 Polish 阶段按企业级编码规范补充必要的单元测试与端到端验证，符合 tasks-template 的"测试可选"规则。

**Organization**: 任务按用户故事分组，确保每个故事可独立实现、独立验证、独立交付增量价值。

## Format: `[ID] [P?] [Story] Description`

- **[P]**：可并行执行（不同文件、无未完成依赖）
- **[Story]**：所属用户故事（US1/US2/US3），Setup/Foundational/Polish 阶段无此标签
- 每个任务均给出精确文件路径

## Path Conventions（本仓库为既有 monorepo，非新建项目）

- ai-service（Python/FastAPI）：`app/ai-service/src/`、`app/ai-service/tests/`
- q-server（TypeScript/Fastify）：`app/q-server/src/modules/survey/survey-stats/`
- 前后端共用类型：`packages/common/src/survey/`

---

## Phase 1: Setup

**目的**：为后续文本分析任务准备运行依赖（本次为既有项目扩展，无需初始化新项目/新脚手架）

- [x] T001 在 `app/ai-service` 下确认并启用 `pyproject.toml` 中已声明的 `analysis` 可选依赖组（`jieba`/`pandas`/`numpy`/`wordcloud`），执行等价于 `uv sync --extra analysis` 的依赖安装，确保后续 jieba 分词/TF-IDF 相关任务可运行

---

## Phase 2: Foundational（阻断级前置修复，所有用户故事共同依赖）

**目的**：修复 spec.md 附录 A 记录的 2 个阻断级卡点（`get_survey_responses()` 死代码、`get_survey_detail()` 鉴权不兼容），并搭建 3 个用户故事共同依赖的数据模型/工具声明层/配置项

**⚠️ CRITICAL**：本阶段完成前，任何用户故事均无法开工——现状代码在这两个卡点上会直接 404/鉴权失败，新架构第一步即失败

- [x] T002 [P] 在 `app/q-server/src/modules/survey/survey-stats/survey-stats.service.ts` 新增 `getSurveyStructure(surveyId: bigint)` 方法：查询问卷标题/描述/题目/选项，**不做** `userId` 所有权过滤（区别于 `survey-crud` 模块），问卷不存在或已软删除时抛出 `AppError("问卷不存在", 404)`，与既有 `getSurveyStats()` 的查询与异常处理模式保持一致
- [x] T003 在 `app/q-server/src/modules/survey/survey-stats/survey-stats.routes.ts` 新增 `fastify.get("/surveys/:id", ...)` 路由：复用模块级已挂载的 `requireSuperAdminOrInternal` 前置钩子（无需单独声明鉴权）与既有 `parseStatsSurveyId()` 辅助函数校验路径参数，调用 T002 新增方法并 `reply.sendSuccess(result)`，限流配置对齐同模块其他只读接口 `{ max: 30, timeWindow: "1 minute" }`（依赖 T002）
- [x] T004 [P] 在 `packages/common/src/survey/survey-stats.interface.ts` 新增 `SurveyStructureResponse`（`survey_id`/`title`/`description`/`questions`）与 `QuestionStructureItem`（`id`/`type`/`title`/`required`/`options`）共享类型定义，对应 `GET /api/admin/surveys/:id` 响应结构，供前后端共用
- [x] T005 [P] 在 `app/ai-service/src/tools/survey_client.py` 的 `SurveyAPIClient` 中新增 `get_survey_structure(survey_id)`（调用 q-server 新接口 `GET /api/admin/surveys/:id`，修复附录 A 卡点 2）与 `list_survey_responses(survey_id, page=1, page_size=50, question_id=None, keyword=None)`（调用既有 `GET /api/admin/surveys/:id/responses`）两个方法，并删除失效的 `get_survey_responses()` 死代码（其调用的路由在 q-server 中不存在，恒 404，修复附录 A 卡点 1）
- [x] T006 [P] 在 `app/ai-service/src/models/schemas.py` 中新增 `AnalysisRunContext`（`session_id`/`survey_id`/`focus`/`step_count`/`tool_call_history`/`messages`）、`ToolCallRecord`（`tool_name`/`arguments`/`result_summary`/`step_index`/`status`）、`SurveyStructureSnapshot`（含 `Question` 子结构）、`TextAnalysisSummary`（含 `KeywordItem`/`WordFreqItem`/`ClusterItem`）、`AnalysisConclusion`（`session_id`/`reply`/`tool_calls`/`steps`/`degraded`）五组 Pydantic 模型（`SurveyStatsSnapshot` 直接复用现有 `SurveyStatsService` 输出结构，不新增字段），并扩展现有 `AgentStreamEvent` 使 `status`/`tool_call`/`tool_result` 事件具备结构化 `data`（按 data-model.md 与 contracts/sse-events.md 定义）
- [x] T007 [P] 在 `app/ai-service/src/config.py` 的 `Settings` 中新增 `agent_timeout_seconds: int = 60` 字段，作为循环总耗时兜底（配合已有 `agent_max_steps: int = 10` 共同构成 FR-004 的双重终止条件）
- [x] T008 新建 `app/ai-service/src/tools/analysis_tools.py`：按 [contracts/function-calling-tools.md](./contracts/function-calling-tools.md) 的入参 JSON Schema 声明 4 个 Function Calling 工具（`get_survey_structure`/`get_survey_stats`/`list_survey_responses`/`analyze_text_batch`），前三者包装 T005 新增方法与既有 `get_survey_stats()`，统一捕获 HTTP 异常并返回 `{error: true, message: "..."}` 结构化错误（不抛出未捕获异常）；`analyze_text_batch` 先声明输入/输出 Schema 占位，具体计算逻辑留给 Phase 3（依赖 T005、T006）

**Checkpoint**：Foundation ready — 三个用户故事均可在此基础上并行开工

---

## Phase 3: User Story 1 - 管理员对指定问卷发起一次完整的自主分析并获得流式文字结论 (Priority: P1) 🎯 MVP

**Goal**：单次请求触发 Agent 自主完成"了解问卷结构 → 查看统计概况 → 判断信息是否充足 → 文本预处理 → 生成结论"全过程，以流式文字返回完整分析结论

**Independent Test**：调用 `POST /api/ai/agent/analysis/stream`（合法 `survey_id` + 超级管理员身份），应收到 `status → (tool_call/tool_result)×N → token×M → done` 完整事件序列，`done.data.reply` 非空且引用具体统计数字/关键词（对应 quickstart.md 场景 1、2、4）

- [x] T009 [P] [US1] 新建 `app/ai-service/src/analysis/text_processor.py`：实现 jieba 分词 + 停用词过滤 + `jieba.analyse` TF-IDF 关键词提取 + `collections.Counter` 词频统计，输出对应 `TextAnalysisSummary.keywords`/`word_freq`（top_k 默认 20）
- [x] T010 [US1] 新建 `app/ai-service/src/analysis/topic_grouping.py`：基于 T009 提取的关键词做共现重合度轻量聚类（R5，无 embedding/无网络调用），组标签取组内权重最高关键词，输出 `TextAnalysisSummary.clusters`（依赖 T009）
- [x] T011 [US1] 在 `app/ai-service/src/tools/analysis_tools.py` 中补全 `analyze_text_batch` 工具的具体实现，接入 T009 分词统计与 T010 主题聚类，组装为 `TextAnalysisSummary` 返回（依赖 T008、T009、T010）
- [x] T012 [P] [US1] 改造 `app/ai-service/src/llm/prompts/analysis.py`：编写面向自主循环的 System Prompt，包含角色定位、4 个工具的用途与调用时机说明、循环终止条件、"禁止编造未经工具验证的数据"约束、结论生成格式要求
- [x] T013 [US1] 重构 `app/ai-service/src/agents/analysis_agent.py`：将现状"确定性单轮注入"（`_fetch_data` → `_build_messages` → 单次 `ainvoke`/`astream`）替换为 `model.bind_tools([...])` + 显式 `while step_count < settings.agent_max_steps` 自主循环编排器——维护 `AnalysisRunContext`（`messages`/`tool_call_history`/`step_count`），每步将模型的 `tool_calls` 分发给 T008 的工具执行并追加 `ToolMessage`，通过既有 SSE 通道推送 `status`/`tool_call`/`tool_result` 事件，循环正常结束后流式推送 `token` 事件并以 `done` 收尾（依赖 T008、T011、T012）

**Checkpoint**：User Story 1（MVP）功能完整，可独立验证；此时可部署演示最小闭环

---

## Phase 4: User Story 2 - Agent 在初步统计数据不足时，自主补充拉取更细粒度的原始答卷数据 (Priority: P2)

**Goal**：当 `get_survey_stats` 的抽样（每题最多 10 条）不足以支撑可靠结论时，Agent 自主判断并调用 `list_survey_responses` 分页补充查询，同时不无条件全量拉取

**Independent Test**：针对某开放题实际答案数（≥100 条）远超统计抽样上限的测试问卷重复 US1 请求，事件流中应出现 `tool_call.data.name == "list_survey_responses"`；数据已充足时不应产生多余调用（对应 quickstart.md 场景 3）

- [x] T014 [US2] 在 `app/ai-service/src/llm/prompts/analysis.py` 中补充决策指引：明确"何时判断 `get_survey_stats` 抽样不足需调用 `list_survey_responses`"的启发式规则，并声明单次分析全生命周期总拉取量软上限 500 条（R4，与 `list_survey_responses` 单页 `page_size`≤100 对齐）（依赖 T012，同文件顺序编辑）
- [x] T015 [US2] 在 `app/ai-service/src/agents/analysis_agent.py` 的循环上下文中累计通过 `list_survey_responses` 已拉取的答卷条数，一旦超过 500 条软上限即强制跳过后续工具调用、直接进入结论生成阶段（R4 / 附录 A.4 卡点 6）（依赖 T013）

**Checkpoint**：User Story 1 与 2 均可独立验证；US2 在 US1 基础上增量交付，不破坏 US1 行为

---

## Phase 5: User Story 3 - 循环步数达到上限或工具调用失败时的降级输出 (Priority: P3)

**Goal**：工具调用失败时通过有限重试吸收瞬时抖动，重试耗尽或循环步数/耗时达到上限时强制转入降级结论生成，避免无响应挂起或编造内容

**Independent Test**：将 `agent_max_steps` 临时调至极小值（如 1）重复 US1 请求，应得到 `done.data.degraded == true` 且 `reply` 含局限性说明；停止/断开 q-server 后重复请求，应在有限重试耗尽后收到明确错误反馈而非无限等待（对应 quickstart.md 场景 5、6）

- [x] T016 [P] [US3] 在 `app/ai-service/src/tools/survey_client.py` 的内部 HTTP 请求方法中新增有限次数重试（2 次，间隔递增），用于吸收瞬时网络抖动（R3）；重试耗尽后仍失败时返回结构化错误 `{error: true, message: "..."}`，不静默吞错、不无限重试（依赖 T005）
- [x] T017 [US3] 在 `app/ai-service/src/agents/analysis_agent.py` 中实现步数上限降级逻辑：`step_count` 达到 `settings.agent_max_steps` 时强制跳过后续推理，直接生成 `degraded=true` 的 `AnalysisConclusion`，`reply` 正文显式包含"分析基于当前已获取的数据，可能不完整"局限性说明（FR-004）（依赖 T013）
- [x] T018 [US3] 在 `app/ai-service/src/agents/analysis_agent.py` 中接入 `settings.agent_timeout_seconds` 总耗时兜底（循环总耗时超限时触发与 T017 相同的降级结论生成路径），作为步数上限之外的第二道终止保障（依赖 T007、T017）

**Checkpoint**：三个用户故事均可独立验证且互不破坏

---

## Phase 6: Polish & Cross-Cutting Concerns

**目的**：跨故事的收尾工作——端到端验证、必要的单元测试补充、代码规范检查、既有方案文档同步

- [x] T019 [P] 执行 [quickstart.md](./quickstart.md) 全部 6 个验证场景 + 非流式对等接口检查，记录实际结果并与预期结果逐条核对
- [x] T020 [P] 为 `app/ai-service/src/analysis/text_processor.py`、`app/ai-service/src/tools/analysis_tools.py` 补充 pytest 单元测试（新建于 `app/ai-service/tests/` 目录下，覆盖关键词提取/词频统计的核心路径与 4 个工具入参 Schema 校验、异常返回结构），满足企业级编码规范对核心逻辑的可维护性要求
- [x] T021 [P] 对本次改动的全部 ai-service 文件运行 `ruff check` / `ruff format`，确保符合 `app/ai-service/pyproject.toml` 既有规则（`select=["E","F","I","N","W","UP","B","C4"]`，`line-length=100`）
- [x] T022 [P] 同步更新 `app/ai-service/doc/todo-list.md` 中"LangChain Tool 定义"条目由 `[-] 跳过` 改为 `[x] 已执行`，并在 `app/ai-service/doc/feasibility-assessment.md` §5.1/§5.3 补充技术路线变更说明（确定性注入 → 自主 Function Calling 循环）

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup（Phase 1）**：无依赖，可立即开始
- **Foundational（Phase 2）**：依赖 Setup 完成 —— **阻塞全部用户故事**
- **User Stories（Phase 3-5）**：均依赖 Foundational 完成
  - US1（P1）：Foundational 完成后即可开工，不依赖 US2/US3
  - US2（P2）：Foundational 完成后即可开工；T014/T015 分别顺序编辑 US1 已产出的 `analysis.py`/`analysis_agent.py`，故实际上在 US1 对应任务（T012/T013）完成后开工更顺畅
  - US3（P3）：Foundational 完成后即可开工；T016 仅依赖 Foundational 的 T005，可与 US1 并行；T017/T018 顺序编辑 `analysis_agent.py`，需等待 T013 完成
- **Polish（Phase 6）**：依赖所有期望交付的用户故事完成

### User Story Dependencies

- **US1**：仅依赖 Foundational，是唯一的核心闭环，无对其他故事的依赖
- **US2**：功能上是 US1 循环编排器的增量能力（新增决策规则 + 拉取量兜底），代码层面顺序编辑 US1 产出的两个文件，建议在 US1 完成后开工
- **US3**：功能上是 US1 循环编排器的降级兜底能力，代码层面顺序编辑 US1 产出的 `analysis_agent.py`，建议在 US1 完成后开工；T016（重试逻辑）与 US1/US2 完全独立，可提前并行

### Within Each User Story

- 模型/工具准备 → 编排器整合 → 收尾兜底
- 同一文件的多次增量编辑按任务顺序串行执行，不标记 `[P]`

### Parallel Opportunities

- Foundational 阶段：T002、T004、T005、T006、T007 可并行（不同文件、无未完成依赖）
- US1 阶段：T009、T012 可并行（不同文件）
- US3 的 T016 可与 US1 全部任务并行（不同文件，仅依赖 Foundational 的 T005）
- Polish 阶段：T019、T020、T021、T022 可并行

---

## Parallel Example: Foundational

```bash
# 可同时启动的 Foundational 任务：
Task: "在 survey-stats.service.ts 新增 getSurveyStructure() 方法"
Task: "在 packages/common 新增 SurveyStructureResponse 共享类型"
Task: "在 survey_client.py 新增 get_survey_structure()/list_survey_responses()"
Task: "在 schemas.py 新增 6 个 Pydantic 实体与 SSE 事件结构"
Task: "在 config.py 新增 agent_timeout_seconds 字段"
```

## Parallel Example: User Story 1

```bash
# 可同时启动的 US1 任务：
Task: "新建 text_processor.py 实现分词/关键词/词频统计"
Task: "改造 llm/prompts/analysis.py 编写自主循环 System Prompt"
```

---

## Implementation Strategy

### MVP First（仅 User Story 1）

1. 完成 Phase 1：Setup
2. 完成 Phase 2：Foundational（关键——阻塞全部用户故事）
3. 完成 Phase 3：User Story 1
4. **停下并验证**：按 quickstart.md 场景 1、2、4 独立验证 US1
5. 若验证通过，即可部署/演示最小闭环（spec.md 已明确 US1 单独构成可独立验证的最小闭环）

### Incremental Delivery

1. 完成 Setup + Foundational → 基础就绪
2. 交付 User Story 1 → 独立验证 → 部署/演示（**MVP**）
3. 交付 User Story 2 → 按场景 3 独立验证 → 部署/演示
4. 交付 User Story 3 → 按场景 5、6 独立验证 → 部署/演示
5. 每个故事均在不破坏前序故事的前提下增量交付价值

### Parallel Team Strategy

多人协作时：

1. 团队共同完成 Setup + Foundational
2. Foundational 完成后：
   - 开发者 A：User Story 1（核心闭环，优先级最高）
   - 开发者 B：User Story 3 的 T016（重试逻辑，与 US1 完全独立）
   - US2、US3 的剩余任务（T014/T015/T017/T018）需等待 US1 的 T012/T013 落地后再顺序介入
3. 各故事完成后独立验证、独立集成

---

## Notes

- `[P]` 任务 = 不同文件、无依赖冲突
- `[Story]` 标签用于追踪任务所属用户故事
- 每个用户故事均应可独立完成、独立验证
- 同一文件的连续编辑任务不标记 `[P]`，按任务顺序串行执行
- 每完成一个任务或一组逻辑任务后建议提交一次
- 可在任一 Checkpoint 处停下独立验证对应故事
- 避免：模糊任务描述、同文件并行冲突、破坏故事独立性的跨故事强耦合
