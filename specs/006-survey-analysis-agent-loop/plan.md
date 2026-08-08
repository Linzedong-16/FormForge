# Implementation Plan: 问卷分析 Agent 自主循环方案设计

**Branch**: N/A（方案设计文档，不创建独立分支，不生成业务代码） | **Date**: 2026-08-03 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/006-survey-analysis-agent-loop/spec.md`

**Note**: 本 `/speckit-plan` 产出物同样为**设计文档**，不生成任何业务代码；用于把 spec.md 中的架构决策（确定性注入 → 自主 Function Calling 循环）转化为可执行的技术方案（研究结论、数据模型、接口契约、验证指引），供后续 `/speckit-tasks` → `/speckit-implement` 阶段消费。

## Summary

核心需求：单次用户请求触发 `AnalysisAgent` 的自主"思考 → 工具调用 → 再思考"闭环，无需多轮交互，自主完成问卷结构理解、统计判断、按需补充数据、本地文本分析、结论生成，并以 SSE 流式返回。

技术方案：将现有 `src/agents/analysis_agent.py` 由"确定性单轮注入"重构为基于 LangChain `bind_tools` 的显式 `while step < agent_max_steps` 循环编排器；新增 4 个 Function Calling 工具（`get_survey_structure`/`get_survey_stats`/`list_survey_responses`/`analyze_text_batch`），其中前三者通过 `survey_client.py`（`X-Internal-Api-Key`）转发至 q-server，第四者为本地 jieba/TF-IDF 计算；在 q-server 侧新增 `GET /api/admin/surveys/:id`（复用 `requireSuperAdminOrInternal` 中间件）以修复附录 A 卡点 2；扩展 `AgentStreamEvent` 的 `status`/`tool_call`/`tool_result` 事件语义，复用现有 `ai-proxy` 字节透传层，无需改动 q-server 转发逻辑。

## Technical Context

**Language/Version**: Python ≥3.11（ai-service，`pyproject.toml` 已锁定）；q-server 新增接口部分为既有 TypeScript/Fastify 技术栈（无版本变更）

**Primary Dependencies**:

- ai-service：FastAPI ≥0.115、langchain ≥1.3（`bind_tools` Function Calling）、langchain-openai ≥1.4（DeepSeek 走 OpenAI 兼容协议）、httpx ≥0.28（q-server 内部调用）、pydantic ≥2.10、jieba ≥0.42（analysis 可选依赖组，需在部署时启用）
- q-server（仅新增一个只读接口，无新依赖）：复用现有 Fastify 路由 + `requireSuperAdminOrInternal` 中间件 + Zod 校验模式

**Storage**: N/A — ai-service 不直接访问任何数据存储；全部问卷/答卷数据经 `survey_client.py` 的 HTTP 调用从 q-server 获取（Constitution Principle I 边界约束）

**Testing**: pytest + pytest-asyncio（ai-service，`pyproject.toml` 已配置 `testpaths=["tests"]`）；q-server 新增接口沿用其既有测试框架（与现有 `survey-stats` 模块测试模式一致）

**Target Platform**: 容器化 Linux 微服务（ai-service 独立部署于 `:8090`，由 q-server `ai-proxy` 转发访问，不直接对外暴露）

**Project Type**: web-service（多服务协作的 agentic 微服务扩展——ai-service 为独立 FastAPI 服务，q-server 为既有 Fastify 服务，本次仅新增一个只读接口）

**Performance Goals**:

- SC-001：首个 `status` 事件应在请求发起后 ≤5 秒内返回
- SC-002：典型规模问卷（≤20 题、≤200 份答卷）完整闭环 ≤60 秒
- SC-003：工具调用次数严格受 `agent_max_steps`（默认 10）约束，杜绝无限循环

**Constraints**:

- FR-009：本功能范围内不引入多轮会话持久化，`session_id` 仅用于日志/追踪关联
- FR-005：ai-service 所有数据访问必须经 `X-Internal-Api-Key` 鉴权的内部 HTTP 接口，不允许直连数据库
- FR-006：文本类答案必须先经本地预处理压缩为结构化摘要，禁止将大段原始文本直接注入 LLM 上下文
- 附录 A 卡点 1/2 为阻断级前置修复项，必须在核心循环开发之前完成，否则新架构第一步即失败

**Scale/Scope**: 典型问卷 ≤20 题、≤200 份答卷（SC-002 基准）；单开放题原始文本量可达上千条，需靠分页 + 软上限（建议 500 条）兜底，超出后强制转入降级结论生成

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| 原则                                  | 评估                                                                                                                                                                                                                                                                                                                                            | 结论                       |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| I. Monorepo Module Boundary Integrity | ai-service 新增/修正的三个数据类工具全部经 `survey_client.py` 走 `X-Internal-Api-Key` HTTP 调用，无直连数据库；agentic 自主循环编排属于 ai-service 职责范围内的允许模式                                                                                                                                                                         | **通过**                   |
| III. Unified API Envelope             | q-server 新增 `GET /api/admin/surveys/:id` 复用 `reply.sendSuccess()`，与既有 `{code,msg,data}` 包装一致；ai-service 现有 `APIResponse` 模型同样遵循该结构，本次不改变非流式响应包装                                                                                                                                                            | **通过**                   |
| V. Test-First/Test-Adequate           | 本阶段为方案设计（plan/research/data-model/contracts/quickstart），不产出实现代码；`quickstart.md` 给出可运行的验证场景，测试用例的具体实现留给 `/speckit-tasks` 与 `/speckit-implement` 阶段（pytest + pytest-asyncio）                                                                                                                        | **通过（设计阶段范围内）** |
| VI. Observability                     | 沿用现有 `X-Trace-Id` 透传机制；`ToolCallRecord`/`tool_call`/`tool_result` 事件天然提供每步工具调用的结构化日志锚点                                                                                                                                                                                                                             | **通过**                   |
| VII. Lint/Format (ruff)               | 本阶段不产出代码，无需评估；后续实现阶段需遵循 `pyproject.toml` 中已配置的 ruff 规则（`select=["E","F","I","N","W","UP","B","C4"]`）                                                                                                                                                                                                            | **N/A（设计阶段）**        |
| IX. AI/LLM Integration Governance     | 工具绑定层与 `AI_PROVIDER` 解耦（`llm/factory.py` 统一通过 `bind_tools()` 接入，满足 FR-008 的模型可插拔要求）；SSE 事件词表扩展后仍完整覆盖 `token`/`tool_call`/`done`/`error` 强制词表（新增 `status`/`tool_result` 为兼容性扩展，不破坏现有词表）；数据留存方面，`AnalysisRunContext` 明确不做跨请求持久化（FR-009），无新增数据留存合规风险 | **通过**                   |

**结论**：无宪法原则违反，**Complexity Tracking 表无需填写**。

**Post-Design 复核**（Phase 1 产出 `data-model.md`/`contracts/`/`quickstart.md` 后）：新增的 q-server 接口契约（`GET /api/admin/surveys/:id`）复用既有 `requireSuperAdminOrInternal` 中间件与统一响应包装，未引入新鉴权分支；SSE 事件契约在保留 `token`/`tool_call`/`done`/`error` 强制词表基础上做兼容性扩展；四个工具的入参/出参均为结构化 JSON，无原始超长文本直传。设计阶段未发现新增违反上述任一原则的情形，**Constitution Check 复核结果保持"通过"**。

## Project Structure

### Documentation (this feature)

```text
specs/006-survey-analysis-agent-loop/
├── spec.md              # 已完成：功能规格（用户故事、FR、附录 A-G）
├── plan.md              # 本文件（/speckit-plan 命令输出）
├── research.md          # Phase 0 输出
├── data-model.md         # Phase 1 输出
├── quickstart.md         # Phase 1 输出
├── contracts/             # Phase 1 输出：工具接口 + SSE 事件 + q-server 新增接口契约
│   ├── survey-structure-endpoint.md
│   ├── function-calling-tools.md
│   └── sse-events.md
└── checklists/
    └── requirements.md   # 已完成：spec 质量检查清单
```

### Source Code（涉及改动的既有仓库目录，非本阶段产出物，供 `/speckit-tasks` 引用）

```text
app/ai-service/src/
├── agents/
│   └── analysis_agent.py        # 重构：确定性注入 → bind_tools 自主循环编排器
├── tools/
│   ├── survey_client.py         # 修复：废弃 get_survey_responses()，新增 get_survey_structure()/list_survey_responses()
│   └── analysis_tools.py        # 新增：4 个 Function Calling 工具的 Tool 声明层
├── analysis/
│   ├── text_processor.py        # 新增：jieba 分词 + 停用词过滤 + TF-IDF 关键词 + 词频统计
│   └── topic_grouping.py        # 新增：MVP 关键词聚类
├── llm/
│   ├── factory.py                # 无需改动：bind_tools() 通过既有 ChatOpenAI 实例接入
│   └── prompts/analysis.py       # 改造：面向自主循环的 System Prompt（工具清单/终止条件/禁止编造约束）
├── models/schemas.py              # 扩展：tool_call/tool_result/status 事件 data 结构定义
├── config.py                      # 激活 agent_max_steps；建议新增 agent_timeout_seconds
└── api/routes/analysis.py         # 无需改动：路由层不感知内部编排方式

app/q-server/src/modules/survey/survey-stats/
├── survey-stats.routes.ts         # 新增：GET /surveys/:id（挂载 requireSuperAdminOrInternal，与 /surveys/:id/stats 同模式）
├── survey-stats.service.ts        # 新增：getSurveyStructure() 方法（返回标题+题目+选项，不做所有权过滤）
└── survey-stats.schemas.ts        # 复用：statsSurveyIdSchema 校验 :id 参数
```

**Structure Decision**：采用现有 monorepo 的双服务结构（`app/ai-service` Python 微服务 + `app/q-server` TypeScript 主后端），不引入新服务/新目录层级。q-server 新增接口挂载在**已存在**的 `survey-stats` 模块内（而非新建模块），因为该模块已承载"内部凭证可访问的问卷只读查询"这一职责边界，新增 `GET /surveys/:id` 与已有的 `/surveys/:id/stats`、`/surveys/:id/responses` 保持同一鉴权模式与文件组织方式，符合最小改动原则。

## Complexity Tracking

> 无宪法原则违反，本表为空。
