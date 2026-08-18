---
description: "Task list template for feature implementation"
---

# Tasks: 低代码引擎核心解耦（纯 TS Schema + 组件工厂）

**Input**: Design documents from `specs/011-lowcode-engine-core/`

**Prerequisites**: [plan.md](./plan.md)、[spec.md](./spec.md)（必需）；[research.md](./research.md)、[data-model.md](./data-model.md)、[contracts/](./contracts/)、[quickstart.md](./quickstart.md)（已生成，均已参考）

**Tests**: 本次改造包含测试任务——项目宪法 Principle V（测试优先/充分测试）要求先写测试；下述测试任务须先落地并确认失败，再实现对应功能使其通过。

**Organization**: 任务按 spec.md 中的 User Story 优先级（P1/P2/P3）分组，每个 Story 可独立验收；所有路径均相对于仓库根目录。

## Path Conventions

单一共享包 `packages/survey-engine/`（monorepo 内部库），唯一现有消费方 `app/frontend/`；不涉及 `app/q-editor` 的代码修改，仅做回归核查。具体目录布局见 [plan.md](./plan.md) Project Structure 一节。

---

## Phase 1: Setup（目录骨架与测试工具链）

**Purpose**: 为后续所有 Story 准备好新目录骨架与"核心可独立测试"的工具链配置

- [x] T001 创建目录骨架：`packages/survey-engine/src/core/schema/`、`packages/survey-engine/src/core/factory/`、`packages/survey-engine/src/core/orchestration/`、`packages/survey-engine/src/core/logic/`、`packages/survey-engine/src/adapters/vue3/`（均为空目录，各自的实现文件由后续任务创建）
- [x] T002 [P] 创建 `packages/survey-engine/vitest.core.config.ts`：`environment: "node"`，不加载 `@vitejs/plugin-vue` 插件，`test.include` 指向 `src/core/**/__tests__/**/*.spec.ts`（research.md R6）
- [x] T003 [P] 在 `packages/survey-engine/package.json` 的 `scripts` 中新增 `"test:core": "vitest run --config vitest.core.config.ts"`

**Checkpoint**: 目录骨架与独立测试命令就位，可以开始 Foundational 阶段

---

## Phase 2: Foundational（阻塞性前置条件）

**Purpose**: 三个 User Story 共同依赖的纯类型定义与组件工厂契约，必须先完成

**⚠️ CRITICAL**: 本阶段完成前，任何 User Story 的实现任务不得开始

- [x] T004 [P] 创建 `packages/survey-engine/src/core/schema/types.ts`：定义 `LowCodeSchema`/`SchemaComponent`/`BaseFieldConfig`/`TextFieldConfig`/`OptionsFieldConfig`/`FieldConfig`（data-model.md §1-3），并从 `src/types/material.ts` 迁移 `Material`/`SurveyComName`/`EditComName`/`componentName`/`isSurveyComName`/`isUseForPDF`（不依赖 `VueComType` 的部分，research.md R1）
- [x] T005 [P] 创建 `packages/survey-engine/src/core/factory/index.ts`：实现框架无关的 `ComponentFactory<TComponent>` 接口与 `createComponentFactory<TComponent>()`（contracts/component-factory.md 核心契约部分）
- [x] T006 更新 `packages/survey-engine/src/types/material.ts`：移除已迁移到 T004 的类型/函数定义，改为 `export * from "../core/schema/types"` 重新导出以保持现有内部 import 路径不破坏；仅保留依赖 `VueComType` 的 `TabInfo`/`ComponentMap`（依赖 T004）

**Checkpoint**: Foundation 就绪，三个 User Story 可以开始实现

---

## Phase 3: User Story 1 - 去除组件引用耦合，核心引擎回归纯 JSON Schema (Priority: P1) 🎯 MVP

**Goal**: 问卷 Schema 只保存字符串标识与配置，不含组件运行时引用；渲染时通过组件工厂按标识查找 Vue3 组件；旧格式数据运行时自动兼容转换

**Independent Test**: 用新引擎生成 Schema 后直接 `JSON.stringify`/`JSON.parse`，不经任何"引用还原"步骤即可在 `app/frontend` 问卷预览页面正常渲染全部题型

### Tests for User Story 1 ⚠️

> **先写以下测试，确认其失败，再进行下方实现任务**

- [x] T007 [P] [US1] 编写 `packages/survey-engine/src/core/schema/__tests__/compat.spec.ts`：覆盖 `isLegacyComponent`/`toSchemaComponent` 对含 `type`/`editCom` 属性的旧格式数据的判定与转换（contracts/schema-validation.md 验证方式 1-2）
- [x] T008 [P] [US1] 编写 `packages/survey-engine/src/core/schema/__tests__/validator.spec.ts`：覆盖 `validateSchema` 的 `id`/`clientKey` 唯一性校验与未知 `name` 校验
- [x] T009 [P] [US1] 编写 `packages/survey-engine/src/adapters/vue3/__tests__/serialization.spec.ts`：覆盖"生成 Schema → JSON 序列化/反序列化 → 渲染结果一致"（quickstart.md 场景 1）

### Implementation for User Story 1

- [x] T010 [US1] 实现 `packages/survey-engine/src/core/schema/compat.ts`：`isLegacyComponent`/`toSchemaComponent`（research.md R4），使 T007 通过
- [x] T011 [US1] 实现 `packages/survey-engine/src/core/schema/validator.ts`：`validateSchema`（依赖 T004 类型），使 T008 通过
- [x] T012 [P] [US1] 创建 `packages/survey-engine/src/adapters/vue3/componentFactory.ts`：基于 T005 的 `createComponentFactory` 实例化 `vue3ComponentFactory`，导出 `resolveVue3Component`/`registerVue3Component`（内部封装 `markRaw`，contracts/component-factory.md Vue3 适配层实现）
- [x] T013 [US1] 迁移 `packages/survey-engine/src/configs/componentMap.ts` → `packages/survey-engine/src/adapters/vue3/componentMap.ts`：改为在模块加载时逐条调用 `registerVue3Component()` 完成注册，替代现状直接导出映射表对象（依赖 T012）
- [x] T014 [US1] 创建 `packages/survey-engine/src/adapters/vue3/restoreComponentStatus.ts`：整合 T010 的旧格式检测转换 + T012 的工厂查找，实现与现状 `src/utils/index.ts` 中 `restoreComponentStatus` 等价的对外行为（依赖 T010、T012、T013），使 T009 通过
- [x] T015 [US1] 更新 `packages/survey-engine/src/index.ts`：`componentMap`/`restoreComponentStatus` 的导出来源改为指向 T013/T014 的新路径，对外导出符号名称与签名保持不变（依赖 T013、T014）
- [x] T016 [US1] 核对并按需调整 `app/frontend/src/views/survey-preview/detail/SurveyPreviewDetail.vue` 中对 `componentMap`/`restoreComponentStatus`/`defaultStatusMap` 的调用方式，确认与新实现兼容（依赖 T015）
- [x] T017 [US1] 在 `packages/survey-engine/src/adapters/vue3/restoreComponentStatus.ts`（及 T016 涉及的调用处）补充"组件工厂查找不到对应组件时"的降级处理：跳过该题渲染并 `console.warn` 记录题型标识（FR-008，quickstart.md 场景 5）

**Checkpoint**: User Story 1 完整可用——`app/frontend` 问卷预览页面可用新引擎独立渲染与验收，此时已构成可交付的 MVP

---

## Phase 4: User Story 2 - 核心引擎与渲染框架完全解耦，可独立测试 (Priority: P2)

**Goal**: `src/core/` 内代码不出现任何框架 import（含 type-only import），可在不安装 Vue 的环境下独立完成全部核心单测

**Independent Test**: `pnpm test:core` 在不加载 `vue`/`jsdom`/`@vitejs/plugin-vue` 的配置下跑通全部 `core/` 测试

### Tests for User Story 2 ⚠️

> **先写/迁移以下测试，确认其在新配置下可运行，再进行下方迁移任务**

- [x] T018 [P] [US2] 编写 `packages/survey-engine/src/core/factory/__tests__/index.spec.ts`：使用测试替身对象（非 Vue 组件）验证 `register`/`resolve`/`has` 行为（quickstart.md 场景 3 验证步骤 3）
- [x] T019 [P] [US2] 迁移 `packages/survey-engine/src/logic/__tests__/{evaluator,normalize,validator}.spec.ts` → `packages/survey-engine/src/core/logic/__tests__/`，仅调整 import 路径，断言内容不变

### Implementation for User Story 2

- [x] T020 [US2] 迁移 `packages/survey-engine/src/logic/types.ts` → `packages/survey-engine/src/core/logic/types.ts`：将 `import type { Material } from "../types/material.js"` 改为 `import type { Material } from "../schema/types"`，切断到 `vue` 的 type-only 依赖链（依赖 T004，research.md R1）
- [x] T021 [P] [US2] 迁移 `packages/survey-engine/src/logic/evaluator.ts` → `packages/survey-engine/src/core/logic/evaluator.ts`（仅调整相对 import 路径，算法不变，依赖 T020）
- [x] T022 [P] [US2] 迁移 `packages/survey-engine/src/logic/normalize.ts` → `packages/survey-engine/src/core/logic/normalize.ts`（仅调整相对 import 路径，算法不变，依赖 T020）
- [x] T023 [P] [US2] 迁移 `packages/survey-engine/src/logic/validator.ts` → `packages/survey-engine/src/core/logic/validator.ts`（仅调整相对 import 路径，算法不变，依赖 T020）
- [x] T024 [US2] 迁移 `packages/survey-engine/src/logic/useRuleRuntime.ts` → `packages/survey-engine/src/adapters/vue3/useRuleRuntime.ts`：内部 `normalizeAnswerValue` 等纯函数改为从 `../../core/logic` 导入，`computed`/`Ref`/`ComputedRef` 等 Vue 依赖保留（依赖 T021、T022，research.md R1）
- [x] T025 [US2] 更新 `packages/survey-engine/src/index.ts`：`./logic` 相关导出的来源路径改为 `./core/logic`（规则引擎符号）与 `./adapters/vue3/useRuleRuntime`（`useRuleRuntime` 符号），对外导出符号名称保持不变（依赖 T020-T024）
- [x] T026 [US2] 核对 `app/q-editor` 内全部 `from "monorepo-survey-engine"` 的导入（`src/stores/useEditor.ts`、`src/components/Logic/*.vue`、`src/views/online/SurveyView.vue` 等）在迁移后仍能正确解析到相同符号（回归检查，不修改 q-editor 代码，依赖 T025）
- [x] T027 [P] [US2] 更新 `packages/survey-engine/vitest.config.ts` 的 `test.include`：移除已迁移到 `core/logic/__tests__` 的路径，确认覆盖范围调整为适配层测试（依赖 T019）
- [x] T028 [US2] 运行 `pnpm test:core`，确认 T018、T019（迁移后）在不加载 `vue`/`jsdom` 的配置下全部通过（验证 SC-003，依赖 T018、T019、T020-T023、T027）

**Checkpoint**: User Story 1 与 2 均独立可用；核心逻辑边界可被自动化验证，不再依赖口头约定

---

## Phase 5: User Story 3 - 编排状态交还宿主项目管理 (Priority: P3)

**Goal**: 撤销/重做等编排纯逻辑下沉到 `core/orchestration/`，不依赖 Pinia；宿主项目（现状 `app/frontend` 经由 `stores/useEditor.ts`）继续按需调用

**Independent Test**: `core/orchestration/undoManager.ts` 在宿主状态管理中被调用时，撤销/重做行为与历史层数上限与现状一致

### Tests for User Story 3 ⚠️

- [x] T029 [P] [US3] 迁移 `packages/survey-engine/src/utils/__tests__/undoManager.spec.ts`（如存在，否则新建）→ `packages/survey-engine/src/core/orchestration/__tests__/undoManager.spec.ts`：覆盖 `push`/`undo`/`redo` 与历史层数上限行为（FR-005 Acceptance Scenario 1）

### Implementation for User Story 3

- [x] T030 [US3] 迁移 `packages/survey-engine/src/utils/undoManager.ts` → `packages/survey-engine/src/core/orchestration/undoManager.ts`（实现不变，research.md R5），使 T029 通过
- [x] T031 [US3] 更新 `packages/survey-engine/src/stores/useEditor.ts` 中的 `import { UndoManager, type Snapshot } from "../utils/undoManager"` 为指向 `../core/orchestration/undoManager`（依赖 T030）
- [x] T032 [US3] 更新 `packages/survey-engine/src/index.ts` 中 `UndoManager`/`Snapshot` 的导出来源路径为 `./core/orchestration/undoManager`，对外导出符号名称保持不变（依赖 T030）

**Checkpoint**: 全部三个 User Story 均独立可用

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: 端到端验收与收尾

- [x] T033 [P] 依次执行 `quickstart.md` 全部 5 个验证场景，逐条比对预期结果，记录结果
- [x] T034 [P] 为本次迁移涉及的文件（`core/logic/*.ts`、`adapters/vue3/useRuleRuntime.ts`、`core/orchestration/undoManager.ts`）补充文件头部中文注释，说明原路径与迁移动机（依赖 T020-T024、T030）
- [x] T035 在 `app/frontend` 本地环境人工走一遍问卷预览页面（含含规则联动的历史审核记录），完成 SC-001 验收，确认无功能回归（依赖 T016、T017）

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: 无依赖，可立即开始
- **Foundational (Phase 2)**: 依赖 Setup 完成——阻塞全部三个 User Story
- **User Story 1 (Phase 3)**: 依赖 Foundational 完成；与 US2/US3 相互独立，是唯一构成可交付 MVP 的 Story
- **User Story 2 (Phase 4)**: 依赖 Foundational 完成；不依赖 US1 的实现产物（componentFactory/componentMap 等），但会与 US1 触碰同一个 `src/index.ts` 文件（T015 与 T025），建议在 T015 落地后再做 T025，避免同文件冲突
- **User Story 3 (Phase 5)**: 依赖 Foundational 完成；同样会触碰 `src/index.ts`（T032），建议在 T025 落地后再做
- **Polish (Phase 6)**: 依赖期望完成的全部 User Story

### User Story Dependencies

- **User Story 1 (P1)**: Foundational 完成后即可开始，不依赖 US2/US3
- **User Story 2 (P2)**: Foundational 完成后即可开始，不依赖 US1 的产物，但与 US1 共享 `src/index.ts` 的编辑，建议顺序执行以避免冲突
- **User Story 3 (P3)**: Foundational 完成后即可开始，不依赖 US1/US2 的产物，同样建议在其后编辑 `src/index.ts`

### Within Each User Story

- 先写测试（T007-T009 / T018-T019 / T029），确认失败或按预期迁移
- 再实现功能使测试通过
- Story 内部按任务列出顺序推进，标 [P] 的任务之间可并行

### Parallel Opportunities

- Setup 阶段 T002、T003 可并行
- Foundational 阶段 T004、T005 可并行（T006 依赖 T004）
- US1 测试 T007、T008、T009 可并行；实现阶段 T012 可与 T010/T011 并行
- US2 测试 T018、T019 可并行；实现阶段 T021、T022、T023 可并行（均依赖 T020）；T027 可与 T024-T026 并行
- US3 测试与实现基本串行（同一文件迁移链路）
- 若团队人力允许，Foundational 完成后 US1/US2/US3 三个 Story 可由不同开发者并行推进，仅需在触碰 `src/index.ts` 时协调顺序（建议 US1 → US2 → US3 的 index.ts 编辑顺序）

---

## Parallel Example: User Story 1

```bash
# 并行编写 User Story 1 的三个测试文件：
Task: "编写 core/schema/__tests__/compat.spec.ts"
Task: "编写 core/schema/__tests__/validator.spec.ts"
Task: "编写 adapters/vue3/__tests__/serialization.spec.ts"

# T010/T011（core/schema 实现）与 T012（vue3 工厂）可并行推进：
Task: "实现 core/schema/compat.ts"
Task: "创建 adapters/vue3/componentFactory.ts"
```

---

## Implementation Strategy

### MVP First（仅 User Story 1）

1. 完成 Phase 1: Setup
2. 完成 Phase 2: Foundational（关键阻塞项）
3. 完成 Phase 3: User Story 1
4. **停下验证**：独立验收 `app/frontend` 问卷预览页面（quickstart.md 场景 1、4、5）
5. 此时即可视为 MVP：问卷 Schema 已回归纯 JSON，`app/frontend` 消费方已切换到工厂渲染

### Incremental Delivery

1. Setup + Foundational → 基础就位
2. User Story 1 → 独立验证 → MVP 可交付
3. User Story 2 → 独立验证（`pnpm test:core` 通过）→ 核心/适配边界获得自动化保障
4. User Story 3 → 独立验证（撤销/重做行为不变）→ 编排状态解耦完成
5. 每个 Story 都在不破坏前序 Story 的前提下增量交付价值

### Parallel Team Strategy

多人协作时：

1. 团队共同完成 Setup + Foundational
2. Foundational 完成后：
   - 开发者 A：User Story 1（`core/schema` + `adapters/vue3` 工厂 + `app/frontend` 集成）
   - 开发者 B：User Story 2（`core/logic` 迁移 + `vitest.core.config.ts` 验证）
   - 开发者 C：User Story 3（`core/orchestration` 迁移）
3. 三者仅需在编辑 `src/index.ts` 时协调合并顺序（建议 US1 → US2 → US3）

---

## Notes

- [P] 任务 = 不同文件、无相互依赖
- [Story] 标签用于追溯任务归属的 User Story
- 所有迁移类任务（`git mv` 语义）均"仅移动文件 + 调整 import 路径"，不改变既有算法/行为，降低回归风险（延续 008/009 阶段"最小必要改动"的既定原则）
- `src/index.ts` 是三个 Story 唯一的公共触碰点，务必确认导出符号名称与行为在整个迁移过程中保持稳定，这是 `app/q-editor` 不受影响的唯一保障
- 每完成一个任务或一组逻辑相关任务后建议提交一次
- 可在任意 Checkpoint 处停下独立验证对应 Story
- 避免：跨 Story 的隐性依赖、同文件并发冲突、模糊不带文件路径的任务描述
