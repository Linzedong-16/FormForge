# Implementation Plan: 低代码引擎核心解耦（纯 TS Schema + 组件工厂）

**Branch**: `011-lowcode-engine-core` | **Date**: 2026-08-18 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/011-lowcode-engine-core/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

`packages/survey-engine` 当前把问卷 Schema（`Status`）与 Vue 组件运行时引用（`Status.type`、`BaseProps.editCom`）绑死在一起，必须靠 `restoreComponentStatus()` 做"引用还原"才能反序列化。本次改造在同一个包内新增 `src/core/`（纯 TypeScript，零框架依赖：Schema 类型、Schema 校验、旧格式兼容转换、通用组件工厂注册接口、既有规则引擎、编排纯逻辑）与 `src/adapters/vue3/`（Vue3 组件工厂实现 + 现有 Vue 组件/Store），将题目与组件的关联从"运行时引用"改为"字符串标识 + 工厂查找"。包对外的统一入口 `src/index.ts` 保持导出的名称与行为不变，`app/q-editor` 仅通过包根导入 `src/logic` 里的规则引擎符号，因此可以安全地把这些文件物理迁移到 `core/` 内部而不产生破坏性变化。`app/frontend` 的问卷预览页面切换到新的 Vue3 工厂渲染方式；旧格式数据通过运行时自动兼容转换处理，不做批量迁移。

## Technical Context

**Language/Version**: TypeScript 5.9（strict 模式，`packages/survey-engine/tsconfig.json` 已启用），Node.js ≥ 22.17.0（仓库 `package.json engines` 约束）

**Primary Dependencies**: 新增 `src/core/` 子模块零运行时依赖（仅使用 TS 类型与标准库）；`src/adapters/vue3/` 沿用现有 peerDependencies（`vue ^3.5.0`、`pinia ^3.0.0`、`element-plus ^2.13.0`、`vue-i18n ^9.14.0`）；不引入任何新的第三方包

**Storage**: N/A —— 本次改造不涉及数据库结构变更（FR-006 明确不需要批量迁移脚本或 schema 变更），问卷数据持久化仍由 `app/q-server` + PostgreSQL 负责，超出本次范围

**Testing**: Vitest 4（现有 `packages/survey-engine/vitest.config.ts`），需扩展 `include`/新增一个不加载 `jsdom`/`@vitejs/plugin-vue` 的测试环境，以验证 `src/core/` 在不安装 Vue 的条件下可独立跑通全部单测（对应 SC-003）

**Target Platform**: 浏览器端 Vue3 SPA（`app/frontend`，经 qiankun 接入主应用）；`src/core/` 的目标运行时是"任意 JS 环境"（浏览器或 Node），不假定具体渲染框架

**Project Type**: Monorepo 内部共享库（`packages/survey-engine`），当前唯一消费方为 web 前端应用 `app/frontend`

**Performance Goals**: 沿用 008 阶段既定的规则引擎性能架构（单次求值 P95 < 200ms），本次改造不改变规则算法本身，不新增性能指标

**Constraints**: `src/core/` 内代码不得 `import` Vue/React/Angular 等框架运行时或框架专属类型（FR-001）；`src/index.ts` 对外导出的符号名称与行为必须保持稳定，不能破坏 `app/q-editor` 现有的包根导入（Edge Case 4）；旧格式问卷数据必须运行时自动兼容，不安排数据库变更或批量迁移（FR-006）

**Scale/Scope**: 单包内部重构，覆盖现有 `componentMap` 全部约 30 个业务/编辑组件条目；影响面为 `packages/survey-engine` 包本身 + 其唯一现有消费方 `app/frontend` 的 1 个只读预览视图（`SurveyPreviewDetail.vue`）；`app/q-editor` 不在改造范围内，仅需保证共享的规则引擎导出接口不被破坏

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                          | 评估                                                                                                                                                                                                                                                                                 | 结论                                      |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------- |
| I. 模块边界完整性                  | 本次改造的核心目的就是在 `packages/survey-engine` 内部划出清晰的 `core/`（框架无关）与 `adapters/vue3/`（框架相关）边界，不新建包，延续既有 monorepo 边界方针；`app/q-editor`/`app/frontend` 均只通过包根 `monorepo-survey-engine` 导入，符合"跨包复用必须走 `packages/*`"的既有实践 | PASS                                      |
| II. 严格类型安全与 Schema 优先校验 | `src/core/schema/validator.ts` 新增运行时 Schema 校验能力（对应 FR-002/FR-006），且全程在 TS strict 模式下开发                                                                                                                                                                       | PASS                                      |
| III. 统一 API 响应包               | 本次改造不涉及任何 HTTP 接口，N/A                                                                                                                                                                                                                                                    | N/A                                       |
| IV. 默认安全                       | 不涉及鉴权/敏感数据处理；组件工厂查找失败时的降级处理（FR-008）属于健壮性而非安全边界，N/A                                                                                                                                                                                           | N/A                                       |
| V. 测试优先/充分测试               | Phase 1 起新增单测需覆盖：Schema 校验、旧格式兼容转换、组件工厂注册/查找、降级处理；且需新增"不安装 Vue 环境下运行核心测试"的验证方式（对应 SC-003），落实到 tasks 阶段前必须先写测试                                                                                                | PASS（需在 tasks 阶段落实先写测试的顺序） |
| VI. 可观测性与结构化日志           | FR-008 要求组件工厂查找失败时"记录告警"，沿用现有 `console.warn` 风格（与 `SurveyPreviewDetail.vue:172` 已有的降级告警模式一致），不引入新的日志基础设施                                                                                                                             | PASS                                      |
| VII. 代码风格与静态分析            | 沿用包内现有 ESLint/Prettier/TS 配置，新增目录不改变工具链配置                                                                                                                                                                                                                       | PASS                                      |
| VIII. 微前端与跨应用集成规范       | `app/frontend` 通过 qiankun 接入主应用的方式不受影响，本次改造只涉及 `packages/survey-engine` 内部实现细节与该应用的一个内部视图                                                                                                                                                     | PASS                                      |
| IX. AI/LLM 集成治理                | 不涉及 AI/LLM 能力，N/A                                                                                                                                                                                                                                                              | N/A                                       |
| X. 性能与数据管道完整性            | 规则引擎算法原样保留（Assumptions 已明确），迁移前后求值结果 100% 一致（SC-005）；不改变现有数据管道                                                                                                                                                                                 | PASS                                      |

无违规项，Complexity Tracking 表留空。

## Project Structure

### Documentation (this feature)

```text
specs/011-lowcode-engine-core/
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
├── core/                            # 新增：框架无关的核心逻辑边界（本次改造的执行重点）
│   ├── schema/
│   │   ├── types.ts                 # LowCodeSchema / SchemaComponent / FieldConfig 等纯类型
│   │   │                            #   （从 types/common.ts、types/editProps.ts、types/material.ts 中
│   │   │                            #    剥离出不依赖 VueComType 的部分）
│   │   ├── validator.ts             # Schema 结构校验（新增，FR-002/FR-006）
│   │   └── compat.ts                # 旧格式（含组件引用/缺 schemaVersion）→ 新 Schema 的运行时兼容转换（FR-006）
│   ├── factory/
│   │   └── index.ts                 # 框架无关的组件工厂注册/查找契约（ComponentFactory<T>，FR-003）
│   ├── orchestration/
│   │   └── undoManager.ts           # 从 src/utils/undoManager.ts 原样迁移（已是零 Pinia 依赖的纯类，FR-005）
│   └── logic/                       # 从 src/logic/ 迁移，仅保留已验证为纯 TS 的 4 个文件（算法不变）
│       ├── types.ts
│       ├── evaluator.ts
│       ├── normalize.ts
│       ├── validator.ts
│       └── __tests__/
├── adapters/
│   └── vue3/
│       ├── componentFactory.ts       # 基于 core/factory 实现的 Vue3 工厂：register/resolve + markRaw 封装
│       ├── componentMap.ts           # 从 src/configs/componentMap.ts 迁移，改为向 componentFactory 注册而非直出映射表
│       ├── restoreComponentStatus.ts # 兼容期：调用 core/schema/compat.ts 检测旧格式 + 调用 vue3 工厂挂载组件引用
│       └── useRuleRuntime.ts         # 从 src/logic/useRuleRuntime.ts 迁移（依赖 vue 的 computed，属于适配层而非核心）
├── components/                       # 不变：Vue SFC 组件实现
├── configs/                          # 不变：题型面板配置、地域数据、defaultStatus（保留原位置）
├── stores/                           # 不变：useEditor.ts（Pinia，继续作为宿主可选接入的 Vue 适配层）
├── types/                            # 保留框架相关类型（VueComType、ComponentMap 等），纯类型迁移至 core/schema
├── utils/                            # 保留非编排类工具函数
├── db/ i18n/ api/                    # 不变
└── index.ts                          # 包对外统一导出入口，导出符号名称与行为保持稳定（app/q-editor 依赖此接口）
```

**Structure Decision**: 沿用 `/speckit-clarify` 已确认的方针——不新建独立包，在 `packages/survey-engine` 内部新增 `src/core/`（框架无关）与 `src/adapters/vue3/`（Vue3 适配层）两个顶层子目录完成边界划分；`src/logic/` 中 4 个纯文件物理迁移进 `core/logic/`，唯一依赖 `vue` 的 `useRuleRuntime.ts` 则迁移进 `adapters/vue3/`（Phase 0 research 发现的关键事实：`src/logic/` 并非 100% 框架无关，见 research.md R1）。包根 `index.ts` 的导出符号保持不变，确保 `app/q-editor` 现有导入不受影响。

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

无违规项，本表留空。
