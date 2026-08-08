# Implementation Plan: 低代码问卷动态表单引擎

**Branch**: `008-dynamic-form-engine` | **Date**: 2026-08-06 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/008-dynamic-form-engine/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

为问卷系统的低代码引擎新增"动态表单"能力：题目级显示/隐藏条件、跳题/提前结束、选项联动（级联）、派生计算字段，以及发布前的规则完整性校验与填写者视角预览。核心技术路径（详见 [research.md](./research.md)）：在 `packages/survey-engine` 新增与 Vue 渲染层解耦的纯逻辑子模块 `src/logic/`，承载规则类型系统与求值/校验算法，作为"低代码核心"向 `app/q-editor`（真正的编辑器与唯一公开填写页所在应用）与 `app/q-server`（发布前二次校验）双向复用的唯一权威实现；`SurveyComponent` 新增可空列 `client_key`（稳定引用键，解决"先删后建"导致的引用漂移）与 `logic`（规则配置 JSON）；`Answer` 新增可空列 `answer_status` 区分"主动留空"与"被规则隐藏跳过"；`app/q-editor` 的填写页答案模型改造为集中式响应式 store，规则通过 Vue `computed` 派生可见题目集合，天然满足 ≤200ms 的实时性要求。全部改动均为新增可空字段与新增模块，不改造任何现有列或既有序列化路径，满足"存量问卷零行为回归"的强约束。

## Technical Context

**Language/Version**: TypeScript 5.9（`strict: true`），`packages/survey-engine`/`app/q-editor`/`app/q-server` 三包一致

**Primary Dependencies**: `packages/survey-engine`（新增 `src/logic/` 纯逻辑子模块，零新增第三方依赖）；`app/q-editor`（新增对 `monorepo-survey-engine` 的 workspace 依赖，仅引入 `logic` 子模块）；`app/q-server`（Fastify 5 + Zod v4 新增 `survey-rule.schemas.ts`，Prisma 7 新增迁移）

**Storage**: PostgreSQL（`app/q-server/prisma/schema.prisma`）；新增 `survey_components.client_key`（`VARCHAR(64)`，可空）、`survey_components.logic`（`JSON`，可空）、`answers.answer_status`（`SMALLINT`，可空）三个新增可空列，均不改造现有列

**Testing**: `packages/survey-engine`（Vitest，规则求值/校验纯函数单测覆盖分支与边界值）；`app/q-editor`（Vitest 单测 + Playwright e2e 补充填写页关键路径）；`app/q-server`（Vitest，`survey-rule` 校验模块与 `submitResponse`/`publish` 新分支的单测）

**Target Platform**: 浏览器（`app/q-editor` 编辑器与填写页，qiankun 子应用 + standalone 双模式）、Node.js ≥22.17 服务端（`app/q-server`）

**Project Type**: Web 应用（monorepo 既有多包/多应用结构内的横切能力，不新增部署单元）

**Performance Goals**: 触发条件变化到界面完成对应更新（显示/隐藏切换、跳转、选项刷新、计算结果更新）≤200ms（FR-008/SC-005）

**Constraints**: 存量问卷（未配置任何动态规则）在填写/编辑/统计/导出方面的行为必须与上线前完全一致，零可感知回归（FR-010/SC-004）；发布环节必须 100% 拦截循环依赖与无效题目引用（FR-006/SC-003）；跳转仅支持向后跳转，不支持跳回已作答题目（Assumptions）；派生计算限于数值汇总/加权场景，不引入自定义公式脚本引擎（Assumptions）

**Scale/Scope**: 规则粒度统一为单个题目，不引入"逻辑页面/分节"实体；覆盖问卷当前已支持的全部题型作为规则触发来源或作用目标（Assumptions）

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                                               | 评估结论                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| I. Monorepo Module Boundary Integrity                   | **PASS** — 规则类型系统与求值/校验算法提取到 `packages/survey-engine/src/logic/`，被 `app/q-editor`（编辑+填写）与 `app/q-server`（发布校验）两个以上使用方共用，满足"两个以上包共用的类型/工具函数 MUST 提取到 `packages/*`"的强制要求（research.md §1）；`app/q-editor` 通过新增 workspace 依赖引入，`app/q-server` 侧通过直接 `import` 同一份纯函数完成校验，不经由 HTTP 反向调用前端，未引入新的跨应用耦合方式。**已知既存边界张力**（`app/q-editor` 现有题目渲染/`store`/序列化体系与 `packages/survey-engine` 已分叉未收敛为单一实现）不在本功能范围内收敛，见 Complexity Tracking。 |
| II. Strict Type Safety & Schema-First Validation        | **PASS** — 新增全部规则类型（`LogicRule`/`ConditionGroup`/`ComputedFieldConfig`/`OptionDependencyMapping`/`RuleValidationResult`/`NormalizedValue` 等，见 [data-model.md](./data-model.md)）以判别式联合 + `strict: true` 定义，不含 `any`；`app/q-server` 新增 `survey-rule.schemas.ts` 用 Zod 在信任边界（问卷保存/发布/提交答卷入参）处校验 `logic` JSON 结构；`packages/common` 的 `SurveyComponentPayload`/`AnswerItem` 同步新增可选字段，前端响应类型与后端响应封装保持镜像。                                                                                                        |
| III. Unified API Contract & Response Envelope           | **PASS（需在实现 PR 中落实文档同步）** — 所有新增/变更端点沿用既有 `{code, msg, data}` 响应封装（`reply.sendSuccess`/`sendFail`），新增业务错误码在 `BizCode` 追加独立的 6xxx 段（`RULE_CIRCULAR_DEPENDENCY`/`RULE_DANGLING_REFERENCE`/`RULE_INVALID_JUMP_TARGET`），不引入 ad hoc 数字字面量；`docs/API接口文档.md` 的更新按用户故事拆分到各自阶段末尾同步进行（参考 003/007 已确立的先例），不集中推迟到收尾阶段。                                                                                                                                                                       |
| IV. Security-by-Default                                 | **PASS** — 不新增脱离既有 `authenticate` 前置处理器的端点；问卷发布/规则保存复用现有"仅问卷所属用户可编辑"归属校验；C 端提交答卷接口已有的 token/fingerprint 校验与 `@fastify/rate-limit` 频率限制不变，规则相关的新增入参同样纳入现有限流范围。                                                                                                                                                                                                                                                                                                                                           |
| V. Test-First / Test-Adequate Delivery                  | **PASS（约束落实到 tasks 阶段）** — `packages/survey-engine/src/logic/` 的求值/校验/规范化纯函数、`app/q-server` 新增的 `survey-rule` 校验模块与 `submitResponse` 新增分支，均属含分支逻辑的业务代码，须在同 PR 内提供 Vitest 单测（含循环依赖/无效引用/规则冲突裁决/边界值）；`app/q-editor` 填写页响应式改造需人工走查三种路径（显示/跳转/联动）并补充 Playwright e2e 覆盖关键场景。                                                                                                                                                                                                     |
| VI. Observability & Structured Logging                  | **PASS** — 新增 `survey-rule` 模块沿用既有 Pino 结构化日志与 request-id 传播；规则求值时遇到异常规则（引用已删除题目、类型不兼容比较）按 FR-012 优雅降级并记录 warn 级日志，供设计者事后排查。                                                                                                                                                                                                                                                                                                                                                                                             |
| VII. Code Style & Static Analysis                       | **PASS** — 无豁免，全部新增/改动文件需通过既有 ESLint/Prettier/cspell 检查，pre-commit 钩子不绕过。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| VIII. Micro-Frontend & Cross-App Integration Discipline | **PASS** — 不改变 qiankun 生命周期（`bootstrap`/`mount`/`unmount`/`update`）与 standalone fallback；`app/q-editor` 新增依赖不影响其子应用挂载方式；本功能不涉及视觉设计令牌，`frontend`/`q-editor` 的样式令牌不因此分叉。                                                                                                                                                                                                                                                                                                                                                                  |
| IX. AI/LLM Integration Governance                       | **N/A** — 本功能不涉及 AI/LLM 集成。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| X. Performance & Data Pipeline Integrity                | **PASS** — 新增 Prisma 列均为可空新增列，不改变现有查询的索引使用模式；规则求值发生在浏览器端内存计算（无网络往返），发布校验为一次性同步图遍历（复杂度随题目/规则数量线性增长），均非服务端热路径，不引入 N+1 查询风险。                                                                                                                                                                                                                                                                                                                                                                  |

初始 Constitution Check：**全部通过，无阻断性违规**，进入 Phase 0。

## Project Structure

### Documentation (this feature)

```text
specs/[###-feature]/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
packages/survey-engine/src/
├── logic/                          # 新增：低代码核心的动态规则子模块（本功能的权威实现）
│   ├── types.ts                    # LogicRule/ConditionGroup/ComputedFieldConfig/
│   │                                #   OptionDependencyMapping/RuleValidationResult/NormalizedValue
│   ├── normalize.ts                # normalizeAnswerValue()：14 种题型答案值规范化
│   ├── evaluator.ts                # evaluateVisibility()/resolveJump()/
│   │                                #   evaluateOptionDependency()/computeDerivedField()
│   ├── validator.ts                # validateRuleSet()：循环依赖/无效引用/非法跳转目标检测
│   ├── useRuleRuntime.ts            # 供 Vue 侧使用的薄 composable（computed 包装）
│   └── index.ts                    # 子模块导出
├── types/material.ts               # 修改：新增 Material.ComputedField 伪题型枚举值
└── index.ts                        # 修改：导出 logic 子模块

app/q-editor/
├── package.json                    # 修改：新增 monorepo-survey-engine workspace 依赖
├── src/types/                      # 修改：Status 新增可选 logic 字段（引用 survey-engine 类型）
├── src/components/SurveyComs/
│   └── ComputedField/               # 新增：派生字段只读展示组件（编辑器画布 + 填写页复用）
├── src/views/EditorView/
│   └── RightSide.vue               # 修改：新增"动态规则"属性面板入口（显示条件/跳转/联动/计算）
├── src/components/Logic/            # 新增：规则配置 UI（条件组编辑器、跳转规则编辑器等）
├── src/stores/useEditor.ts          # 修改：新增规则相关 get/set actions（按 client_key 索引）
├── src/api/modules/survey/index.ts # 修改：serializeComponents/deserializeSurveyDetail 新增
│                                    #   client_key、logic 字段透传
└── src/views/online/SurveyView.vue # 修改：答案模型改为集中式响应式 store，
                                     #   派生 visibleComs，接入 useRuleRuntime

app/q-server/
├── prisma/
│   ├── schema.prisma                # 修改：SurveyComponent 新增 client_key/logic；
│   │                                #   Answer 新增 answer_status
│   └── migrations/                  # 新增：一条新增可空列的迁移
└── src/modules/survey/
    ├── survey-rule/                 # 新增：发布前规则完整性校验子模块
    │   ├── survey-rule.schemas.ts   # Zod：logic JSON 结构校验
    │   ├── survey-rule.service.ts   # 调用 packages/survey-engine 的 validateRuleSet()
    │   └── survey-rule.routes.ts    # POST /api/surveys/:id/validate-rules（预检）
    ├── survey-crud/
    │   ├── survey-crud.service.ts   # 修改：publish() 前置调用规则校验；
    │   │                            #   replaceComponents() 透传 client_key/logic；
    │   │                            #   submitResponse() 按 visibleComs 写入 answer_status
    │   └── survey-crud.schemas.ts   # 修改：新增字段的 Zod schema
    └── survey-stats/
        └── survey-stats.service.ts # 修改：统计口径改为读取 answer_status

packages/common/src/survey/
└── survey.interface.ts             # 修改：SurveyComponentPayload 新增 client_key?/logic?；
                                     #   AnswerItem 新增 answer_status?
```

**Structure Decision**：本功能是既有 monorepo 结构内的横切能力，不新增应用或包。核心逻辑新增在 `packages/survey-engine/src/logic/`（低代码核心，纯逻辑无框架依赖），由 `app/q-editor`（编辑+填写，新增 workspace 依赖）与 `app/q-server`（发布前二次校验，直接 import 同一份纯函数）共同消费；`packages/common` 承载跨前后端共用的请求/响应接口新增字段；`app/q-server/prisma` 新增三个可空列并配套一条迁移。`app/frontend` 不在本功能改动范围内（其唯一消费点 `SurveyPreviewDetail.vue` 是只读审核页，不涉及规则求值或填写，详见 research.md §1）。

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation                                                                                            | Why Needed                                                                                                                                                                                                                   | Simpler Alternative Rejected Because                                                                                                                                                                                                           |
| ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app/q-editor` 现有题目渲染/`store`/序列化体系与 `packages/survey-engine` 的既存分叉，本功能不予收敛 | 本功能新增的规则子模块已经落在 `packages/survey-engine`（满足 Principle I 对新增共享代码的强制要求）；但 `app/q-editor` 历史遗留的题目类型/组件/`store`/序列化代码仍是独立分叉，未与 `packages/survey-engine` 收敛为单一实现 | 将 `app/q-editor` 现有代码整体迁移到 `packages/survey-engine` 以彻底消除分叉，改动面覆盖其全部题目渲染路径，回归风险与本功能"保证目前的功能实现不能出问题"的强约束直接冲突，且远超本功能范围；作为已知技术债保留，交由未来独立的重构类功能处理 |

## Post-Design Constitution Re-check

_GATE: Re-check after Phase 1 design（[data-model.md](./data-model.md) / [contracts/](./contracts/) / [quickstart.md](./quickstart.md) 已产出）。_

| Principle                                        | 二次核对结论                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I. Monorepo Module Boundary Integrity            | **PASS** — `data-model.md` 中全部规则类型（§1.1-1.9）均定义在 `packages/survey-engine/src/logic/types.ts`，未在 `app/q-editor`/`app/q-server` 侧重复定义；`packages/common` 的 `SurveyComponentPayload`/`AnswerItem` diff 明确"从 `packages/survey-engine` 导入并重导出，不重复定义"（data-model.md §3）。既存边界张力仍如实记录在上方 Complexity Tracking，设计阶段未扩大也未掩盖该已知问题。 |
| II. Strict Type Safety & Schema-First Validation | **PASS** — data-model.md §1 的全部类型均为判别式联合/精确字面量枚举，无 `any`；`NormalizedValue`/`RuleViolation`/`JumpTarget` 等均以 `kind`/`type` 字段做判别；`contracts/` 中的请求体新增字段与 Prisma 列类型（§2）、`packages/common` 接口（§3）三处保持完全镜像，未出现前后端类型不一致。                                                                                                   |
| III. Unified API Contract & Response Envelope    | **PASS** — 经核对 `app/q-server/src/utils/response.ts` 实际实现（`ApiResponse<T>` + `reply.sendSuccess`/`AppError(message, httpStatus, bizCode)`），contracts/ 三份文件均按此真实约定书写，未使用臆测的 `sendFail` 签名；新增 BizCode 6001-6003 值已在 `survey-publish.contract.md` 中明确列出，不与既有区段冲突。                                                                             |
| IV. Security-by-Default                          | **PASS** — `survey-rule.contract` 新增的 `validate-rules` 端点明确复用发布接口既有鉴权/归属校验中间件，未引入未受保护的新端点。                                                                                                                                                                                                                                                                |
| V. Test-First / Test-Adequate Delivery           | **PASS** — quickstart.md 场景 1-6 覆盖全部 FR-001~FR-013 与 SC-001~SC-006，可直接映射为 tasks 阶段的 Vitest/Playwright 用例清单，覆盖度经核对无遗漏用户故事。                                                                                                                                                                                                                                  |
| VI-X                                             | **PASS**（结论不变） — Phase 1 设计未引入新的日志/样式/AI/性能相关变更，初始 Constitution Check 中对应行的结论在设计细化后仍然成立。                                                                                                                                                                                                                                                           |

**二次 Constitution Check：全部通过，无新增阻断性违规，设计阶段未扩大已记录的既知复杂度（q-editor/survey-engine 边界张力）。进入 Phase 2（`/speckit-tasks`）前提条件已满足。**
