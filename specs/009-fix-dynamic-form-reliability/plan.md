# Implementation Plan: 动态表单数据完整性与交付可靠性修复

**Branch**: `009-fix-dynamic-form-reliability` | **Date**: 2026-08-07 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/009-fix-dynamic-form-reliability/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

本功能修复 `008-dynamic-form-engine` 落地后暴露的两个已确认数据完整性缺陷（首次创建问卷时 `client_key`/`logic` 规则配置整体丢失；填写端提交时隐藏/跳过/可见留空题目的 `AnswerItem` 被静默丢弃，导致 `answer_status` 从未落地），并补齐由此牵出的三处一致性/可维护性缺口（发布时规则校验读取脱离事务导致的快照不一致、Zod 校验 `client_key` 与 `logic` 的 `nullable` 语义不对称、E2E 用例对四项动态能力的覆盖不均）。所有修复均限定在已有代码路径内进行行为纠正，不引入新的动态表单能力、不新增数据库列、不引入运行时监控体系（详见 spec.md Assumptions）。技术方案见 [research.md](./research.md)：Bug 1 通过让 `create()` 复用已验证正确的 `replaceComponents()` 消除双路径实现漂移；Bug 2 通过在 `app/q-editor` 侧于提交前依据 `visibleComs` 差集补全隐藏/留空题目的 `answer_status`，复用后端已正确实现的 `isUpgradedClient` 兼容分支；FR-005 通过为 `SurveyRuleService.validateSurveyRules` 增加可选事务客户端参数并由 `publish()` 显式传入自身 `tx` 来消除快照不一致。

## Technical Context

**Language/Version**: TypeScript 5.9（`strict: true`，NodeNext ESM）；Node.js ≥ 22.17（`app/q-server`）；Vue 3.5 + `<script setup>`（`app/q-editor`）

**Primary Dependencies**: Fastify 5、Prisma 7 + PostgreSQL（`app/q-server`）；Vue 3 + Pinia 3 + Element Plus + vue-i18n（`app/q-editor`）；Zod v4（跨端共用的 schema 校验）；`packages/survey-engine`（纯函数规则求值/校验引擎，`evaluator.ts`/`validator.ts`）

**Storage**: PostgreSQL（沿用既有 `survey_component.client_key`/`logic`/`answer_status` 三列，本功能**不新增、不变更**任何数据库列或迁移，详见 spec.md Assumptions）

**Testing**: Vitest（`packages/survey-engine` 纯函数单元测试、`app/q-server` 服务层单元/集成测试）；Playwright（`app/q-editor/e2e` 端到端场景测试，回归测试须遵循 Constitution Principle V「先失败后通过」）

**Target Platform**: Linux 容器化部署的 Node.js 后端服务 + 现代浏览器（微前端 `q-editor` 子应用运行于 `q-shell` qiankun 主应用内，及独立填写端路由）

**Project Type**: Web 应用（monorepo：后端服务 `app/q-server` + 前端编辑器/填写端 `app/q-editor` + 共享逻辑包 `packages/survey-engine` + 共享类型包 `packages/common`）

**Performance Goals**: 延续 008 已确立的基线，不因本次修复引入新的性能开销（SC-006：规则校验响应时间维持 200ms 基线不劣化；`create()` 复用 `replaceComponents()` 不增加额外查询；前端补全 `answer_status` 仅为题目数量级的数组差集运算，可忽略不计）

**Constraints**: 零回归约束（FR-010：不改变已发布问卷、不含任何动态规则的问卷、旧版本填写端客户端的既有行为）；不引入乐观锁/版本号等新并发控制机制（已在 `/speckit-clarify` Q1 澄清中明确否决，仅复用 `publish()` 现有事务的一次性读取一致性）；不新增生产环境运行时监控/告警能力（仅通过自动化回归测试保障）

**Scale/Scope**: 影响 4 个源码位置（`app/q-server` 2 处服务层方法 + 1 处 schema、`app/q-editor` 1 处提交逻辑）+ 1 处测试覆盖补齐（Playwright E2E 新增 1 个场景）+（best-effort）`packages/survey-engine` 规则校验新增 1 类违规检测；不涉及新页面、新路由、新对外契约字段

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                                               | 评估结论                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I. Monorepo Module Boundary Integrity                   | **PASS**。所有修复均落在既有模块边界内：`app/q-server/src/modules/survey/{survey-crud,survey-rule}/`、`app/q-editor/src/views/online/SurveyView.vue`、`packages/survey-engine/src/logic/`。不新增跨包直接导入，`survey-rule.service.ts` 继续通过 `monorepo-survey-engine/logic/validator.js` 子路径导入（避免引入 Vue 依赖，见该文件现有注释），本次不改变这一约束。 |
| II. Strict Type Safety & Schema-First Validation        | **PASS**。FR-007 的修复本身就是消除一处 Zod schema 的类型不对称（`client_key` 补齐 `.nullable()`）；FR-008（若实施）为 `validateRuleSet()` 扩展输入类型而非放宽校验。所有改动保持 `strict: true` 下可编译。                                                                                                                                                          |
| III. Unified API Contract & Response Envelope           | **PASS**。本次修复不改变任何接口的请求/响应 JSON 形状，仅纠正内部行为（见 [contracts/](./contracts/)）；`{code, msg, data}` 信封与既有 BizCode 体系保持不变，FR-008 若实施仅在 6xxx 段新增一个错误码常量，不破坏既有客户端解析逻辑。                                                                                                                                 |
| IV. Security-by-Default                                 | **PASS**。修复不新增用户输入面；`survey-rule.service.ts` 的归属校验（`user_id: userId`）在改造为接受 `tx` 参数后原样保留，不降低鉴权强度。                                                                                                                                                                                                                           |
| V. Test-First / Test-Adequate Delivery                  | **PASS（强制约束）**。spec.md 明确要求两个已确认 Bug 必须先补充"修复前失败、修复后通过"的回归测试；本计划的 [quickstart.md](./quickstart.md) 与后续 tasks.md 将据此安排测试先行的任务顺序。                                                                                                                                                                          |
| VI. Observability & Structured Logging                  | **N/A**。spec Assumptions 明确本次不新增运行时监控/告警能力，仅要求现有 Pino 日志行为不退化（例如 `survey-rule.service.ts` 现有的 `fastify.log.warn` 兜底日志保持不变）。                                                                                                                                                                                            |
| VII. Code Style & Static Analysis Compliance            | **PASS**。改动遵循现有 ESLint/TS 配置与既有代码风格（如 `replaceComponents` 现有的字段映射惯例、`SurveyView.vue` 现有的 computed/watch 组织方式），不引入新工具链配置。                                                                                                                                                                                              |
| VIII. Micro-Frontend & Cross-App Integration Discipline | **PASS**。`SurveyView.vue` 的改动仅限填写端提交逻辑内部，不改变其作为 qiankun 子应用/独立路由暴露的对外接口与生命周期钩子。                                                                                                                                                                                                                                          |
| IX. AI/LLM Integration Governance                       | **N/A**。本功能不涉及任何 AI/LLM 集成面。                                                                                                                                                                                                                                                                                                                            |
| X. Performance & Data Pipeline Integrity                | **PASS**。SC-006 明确延续既有性能基线；`create()` 复用 `replaceComponents()`、`validateSurveyRules` 改用 `tx` 客户端均不增加查询次数或数据量级，属同等复杂度的等价改写。                                                                                                                                                                                             |

**结论**：无违反项，Complexity Tracking 无需填写（详见下方该节说明）。

## Project Structure

### Documentation (this feature)

```text
specs/009-fix-dynamic-form-reliability/
├── plan.md              # 本文件（/speckit-plan 命令输出）
├── research.md          # Phase 0 输出：逐条 FR 的根因定位与修复方案决策
├── data-model.md        # Phase 1 输出：受影响实体的行为约束变化（无新增字段/表）
├── quickstart.md        # Phase 1 输出：验收场景与运行步骤
├── contracts/           # Phase 1 输出：受影响接口的行为契约变更说明
│   ├── survey-components-create.contract.md
│   ├── survey-submit-response.contract.md
│   └── survey-rule-validation.contract.md
└── tasks.md             # Phase 2 输出（由 /speckit-tasks 命令生成，本命令不创建）
```

### Source Code (repository root)

```text
app/q-server/src/modules/survey/
├── survey-crud/
│   ├── survey-crud.service.ts        # FR-001/002 修复点：create() 改为复用 replaceComponents()；
│   │                                  # FR-005 修复点：publish() 内调用 validateSurveyRules 时显式传入 tx
│   └── survey-crud.schemas.ts        # FR-007 修复点：client_key 字段补齐 .nullable()
└── survey-rule/
    └── survey-rule.service.ts        # FR-005 修复点：validateSurveyRules() 新增可选 tx 参数

app/q-editor/src/
├── views/online/SurveyView.vue       # FR-003/004 修复点：submitAnswers() 提交前补全隐藏/可见留空题目的 answer_status
└── api/modules/survey/index.ts       # 视 research.md 决策，可能需要 serializeAnswers() 接受携带 answer_status 的完整输入

app/q-editor/e2e/tests/survey/
└── survey-dynamic-logic.spec.ts      # FR-006 修复点：新增"场景4：派生计算字段"E2E 用例

packages/survey-engine/src/logic/
├── types.ts                          # FR-008（best-effort）：RuleViolationType 新增枚举成员
└── validator.ts                      # FR-008（best-effort）：新增选项引用有效性校验分支
```

**Structure Decision**：延续 `008-dynamic-form-engine` 已确立的模块划分——`packages/survey-engine` 承载与框架无关的纯函数规则引擎，`app/q-server` 承载持久化与事务边界内的业务规则执行，`app/q-editor` 承载填写时刻的交互状态到提交负载的转换。本次修复不改变这一分工，只在既有分工内纠正实现缺陷；无需新增模块或调整包依赖关系。

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

无违反项，本节不填写。（区别于 008 计划中记录的"q-editor/survey-engine 双实现分叉"这一已接受的架构张力：本次修复不新增架构复杂度，FR-003/004 的方案明确选择让前端复用既有 `visibleComs` 计算结果如实上报，而非在后端重新实现一份规则求值逻辑，从而避免产生新的双实现分叉，见 [research.md](./research.md) D2。）

## Post-Design Constitution Re-check

_完成 Phase 1（data-model.md / contracts/ / quickstart.md）设计后重新核对：_

| Principle                                               | 复核结论                                                                                                                                         |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| I. Monorepo Module Boundary Integrity                   | **PASS**，未变化。                                                                                                                               |
| II. Strict Type Safety & Schema-First Validation        | **PASS**。data-model.md 确认 FR-008（若实施）通过新增可选参数扩展 `validateRuleSet()` 签名，向后兼容，不放宽既有类型约束。                       |
| III. Unified API Contract & Response Envelope           | **PASS**。contracts/ 三份文档确认三个受影响接口均无请求/响应形状变化，仅内部行为纠正；FR-008 新增的 6004 错误码遵循既有 BizCode 命名与分段惯例。 |
| IV. Security-by-Default                                 | **PASS**，未变化。                                                                                                                               |
| V. Test-First / Test-Adequate Delivery                  | **PASS**。quickstart.md 已将两个 P1 Bug 的验证场景对应到"修复前失败、修复后通过"的具体运行步骤。                                                 |
| VI. Observability & Structured Logging                  | **N/A**，未变化。                                                                                                                                |
| VII. Code Style & Static Analysis Compliance            | **PASS**，未变化。                                                                                                                               |
| VIII. Micro-Frontend & Cross-App Integration Discipline | **PASS**，未变化。                                                                                                                               |
| IX. AI/LLM Integration Governance                       | **N/A**，未变化。                                                                                                                                |
| X. Performance & Data Pipeline Integrity                | **PASS**。data-model.md 确认无新增查询/索引/数据量级变化。                                                                                       |

**结论**：Phase 1 设计未引入新的宪法冲突，可进入 `/speckit-tasks` 阶段。
