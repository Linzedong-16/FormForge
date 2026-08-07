---
description: "Task list template for feature implementation"
---

# Tasks: 低代码问卷动态表单引擎

**Input**: Design documents from `/specs/008-dynamic-form-engine/`
**Prerequisites**: [plan.md](./plan.md)、[spec.md](./spec.md)、[research.md](./research.md)、[data-model.md](./data-model.md)、[contracts/](./contracts/)、[quickstart.md](./quickstart.md)

**Tests**: 本功能包含测试任务。`plan.md` 的 Constitution Check（Principle V）已明确承诺"`packages/survey-engine/src/logic/` 的求值/校验/规范化纯函数须在同 PR 内提供 Vitest 单测"，属于项目治理文档（`.specify/memory/constitution.md`）对含分支逻辑业务代码的强制要求，因此纯逻辑函数均配套单测任务；`app/q-editor`/`app/q-server` 的集成层改动通过 quickstart.md 场景做端到端验证（Polish 阶段落地为 Playwright e2e + 手动执行）。

**Organization**: 任务按 User Story（对应 spec.md 的 P1-P5）分组，以支持独立实现与独立验证。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可并行执行（不同文件、无未完成依赖）
- **[Story]**: 归属的用户故事（US1-US5）
- 每个任务包含明确文件路径

## Path Conventions

沿用 `plan.md` Project Structure：

- `packages/survey-engine/src/logic/` — 低代码核心规则子模块（本功能的权威实现）
- `app/q-editor/src/` — 问卷编辑器与唯一的公开填写页
- `app/q-server/src/` 、`app/q-server/prisma/` — 后端服务与数据库 schema
- `packages/common/src/survey/` — 前后端共用请求/响应接口

---

## Phase 1: Setup（共享基础骨架）

**Purpose**：搭建本功能新增模块的目录/依赖骨架，不含业务逻辑

- [x] T001 [P] 创建 `packages/survey-engine/src/logic/` 目录骨架：`types.ts`/`normalize.ts`/`evaluator.ts`/`validator.ts`/`useRuleRuntime.ts`/`index.ts`（空文件 + 占位导出）
- [x] T002 [P] 在 `app/q-editor/package.json` 新增对 `monorepo-survey-engine` 的 workspace 依赖，执行 `pnpm install` 完成 workspace 链接
- [x] T003 [P] 创建 `app/q-server/src/modules/survey/survey-rule/` 目录骨架：`survey-rule.schemas.ts`/`survey-rule.service.ts`/`survey-rule.routes.ts`（空文件 + 占位导出）

---

## Phase 2: Foundational（阻塞性前置基础设施）

**Purpose**：全部用户故事共同依赖的类型系统、持久化列、序列化路径与响应式基础设施

**⚠️ CRITICAL**：本阶段完成前，任何用户故事均不可开始实现

- [x] T004 在 `packages/survey-engine/src/logic/types.ts` 定义全部规则类型（`ClientKey`/`ComparisonOperator`/`LogicCombinator`/`RawAnswerValue`/`NormalizedValue`/`Condition`/`ConditionGroup`/`VisibilityAction`/`VisibilityRule`/`QuestionVisibilityConfig`/`JumpTargetType`/`JumpTarget`/`JumpRule`/`QuestionJumpConfig`/`OptionDependencyMapping`/`ComputedFieldFormula`/`ComputedFieldConfig`/`QuestionLogicConfig`/`RuleViolationType`/`RuleViolation`/`RuleValidationResult`）及对应函数签名（`declare function`），严格对应 [data-model.md](./data-model.md) §1
- [x] T005 [P] 在 `packages/survey-engine/src/logic/normalize.ts` 实现 `normalizeAnswerValue()`，覆盖 14 种题型分支（含 `single-select` 索引转文本值语义），对应 [data-model.md](./data-model.md) §1.2 与 [research.md](./research.md) §3
- [x] T006 [P] 在 `packages/survey-engine/src/logic/__tests__/normalize.spec.ts` 编写 `normalizeAnswerValue` 的 Vitest 单测（覆盖 14 种题型分支与空值/边界值），先于 T005 实现落地前编写并确认失败
- [x] T007 在 `packages/survey-engine/src/index.ts` 导出 `logic` 子模块；在 `packages/survey-engine/src/types/material.ts` 新增 `Material.ComputedField` 伪题型枚举值
- [x] T008 [P] 在 `app/q-server/prisma/schema.prisma` 为 `SurveyComponent` 新增可空列 `client_key VARCHAR(64)`/`logic Json` 及索引 `@@index([survey_id, client_key])`，为 `Answer` 新增可空列 `answer_status SMALLINT`，对应 [data-model.md](./data-model.md) §2；生成对应迁移文件至 `app/q-server/prisma/migrations/`
- [x] T009 [P] 在 `packages/common/src/survey/survey.interface.ts` 为 `SurveyComponentPayload` 新增 `client_key?`/`logic?`，为 `AnswerItem` 新增 `answer_status?`，并从 `packages/survey-engine` 导入重导出 `QuestionLogicConfig`（不重复定义），对应 [data-model.md](./data-model.md) §3
- [x] T010 在 `app/q-server/src/modules/survey/survey-rule/survey-rule.schemas.ts` 实现 `QuestionLogicConfig` 的完整 Zod Schema，与 T004 的 TypeScript 类型定义严格镜像
- [x] T011 在 `app/q-server/src/modules/survey/survey-crud/survey-crud.schemas.ts` 新增 `client_key`/`logic` 字段的 Zod 校验（`logic` 复用 T010 产出的 Schema），对应 [survey-components.contract.md](./contracts/survey-components.contract.md)
- [x] T012 在 `app/q-editor/src/stores/useEditor.ts` 新增题目 `client_key` 生成（新增题目时生成 UUID v4，既有题目原样透传）与按 `client_key` 索引的 get/set actions
- [x] T013 在 `app/q-editor/src/api/modules/survey/index.ts` 的 `serializeComponents`/`deserializeSurveyDetail` 新增 `client_key`、`logic` 字段透传
- [x] T014 在 `app/q-server/src/modules/survey/survey-crud/survey-crud.service.ts` 的 `replaceComponents()` 中：若请求携带 `client_key` 原样写入新行，若未携带则生成新 UUID；`logic` 字段按请求原样写入，对应 [survey-components.contract.md](./contracts/survey-components.contract.md)
- [x] T015 将 `app/q-editor/src/views/online/SurveyView.vue` 的答案模型改造为集中式响应式 `ref<Record<ClientKey, AnswerValue>>`，替换现有互不感知的本地 `answers` ref，所有题目组件输入统一双向绑定该 store，对应 [research.md](./research.md) §4（本任务是后续全部用户故事规则求值 UI 集成的前提）
- [x] T016 在 `packages/survey-engine/src/logic/useRuleRuntime.ts` 实现薄 Vue composable 骨架（`computed` 包装求值函数入口，供后续用户故事各自接入具体求值函数）

**Checkpoint**：基础设施就位，各用户故事可以开始实现（可并行开展）

---

## Phase 3: User Story 1 - 配置题目显示/隐藏条件逻辑 (Priority: P1) 🎯 MVP

**Goal**：设计者可为题目配置显示/隐藏条件，填写者作答时题目按条件实时显示或隐藏，隐藏题目不参与必答校验且已填内容会被清理

**Independent Test**：为题目B配置"题目A选选项1时显示"规则并发布，分别以三种作答路径验证题目B的显示/隐藏与提交行为（quickstart.md 场景1）

### Tests for User Story 1 ⚠️

- [x] T017 [P] [US1] 在 `packages/survey-engine/src/logic/__tests__/evaluator.spec.ts` 编写 `resolveVisibility` 的 Vitest 单测（覆盖隐藏优先裁决、AND/OR 组合、`baseVisibility` 两种默认态），先于实现落地前编写并确认失败

### Implementation for User Story 1

- [x] T018 [US1] 在 `packages/survey-engine/src/logic/evaluator.ts` 实现 `resolveVisibility()`（含内部 `ConditionGroup` 求值辅助函数），隐藏优先胜出裁决逻辑对应 [data-model.md](./data-model.md) §1.4 / FR-002
- [x] T019 [US1] 在 `app/q-editor/src/components/Logic/ConditionGroupEditor.vue` 新增条件组编辑器组件（供显示规则与跳转规则复用）
- [x] T020 [US1] 在 `app/q-editor/src/components/Logic/VisibilityRuleEditor.vue` 新增显示/隐藏规则编辑器组件（`baseVisibility` + 多条带方向规则配置）
- [x] T021 [US1] 在 `app/q-editor/src/views/EditorView/RightSide.vue` 新增"动态规则"属性面板入口，接入显示条件配置
- [x] T022 [US1] 在 `app/q-editor/src/views/online/SurveyView.vue` 新增 `visibleComs = computed(...)`（调用 T016 的 `useRuleRuntime` + T018 的 `resolveVisibility`），题目渲染、必答校验、进度指示统一改为读取 `visibleComs`
- [x] T023 [US1] 在 `app/q-editor/src/views/online/SurveyView.vue` 实现答案改回不满足条件时的清理逻辑：题目被重新隐藏时清除其已填内容，不随问卷一起提交（FR-009 / acceptance scenario 4）
- [x] T024 [US1] 在 `app/q-server/src/modules/survey/survey-crud/survey-crud.service.ts` 的 `submitResponse()` 中，按请求携带的 `answer_status`（对应前端 `visibleComs` 计算结果）为问卷全部题目产出 `Answer` 行（0=正常作答/1=隐藏跳过/2=可见留空），历史客户端（不携带 `answer_status`）保持现状仅为有值题目插入行，对应 [survey-responses.contract.md](./contracts/survey-responses.contract.md)
- [x] T025 [US1] 在 `app/q-server/src/modules/survey/survey-crud/survey-crud.schemas.ts` 新增 `AnswerItem.answer_status`（可选 `0|1|2`）的 Zod 校验

**Checkpoint**：User Story 1 应可独立完整验证（quickstart.md 场景1）

---

## Phase 4: User Story 2 - 配置跳题/跳转与提前结束逻辑 (Priority: P2)

**Goal**：设计者可为题目配置跳转规则，填写者作答后按规则跳转到指定题目或提前结束，跳转目标若被隐藏可自动顺延

**Independent Test**：为题目A配置"选'不符合资格'跳转至问卷结尾"规则，验证两条路径下实际题目序列与提交结果（quickstart.md 场景2）

### Tests for User Story 2 ⚠️

- [x] T026 [P] [US2] 在 `packages/survey-engine/src/logic/__tests__/evaluator.spec.ts` 编写 `resolveJump` 的 Vitest 单测（覆盖多规则同时命中取第一条生效、`endSurvey` 目标、无命中场景），先于实现落地前编写并确认失败

### Implementation for User Story 2

- [x] T027 [US2] 在 `packages/survey-engine/src/logic/evaluator.ts` 实现 `resolveJump()`（first-match-wins），对应 [data-model.md](./data-model.md) §1.5 / FR-003
- [x] T028 [US2] 在 `app/q-editor/src/components/Logic/JumpRuleEditor.vue` 新增跳转规则编辑器组件（复用 T019 的 `ConditionGroupEditor`，新增跳转目标选择：题目 / 结束问卷）
- [x] T029 [US2] 在 `app/q-editor/src/views/EditorView/RightSide.vue` 的动态规则面板新增"跳转"配置入口
- [x] T030 [US2] 在 `app/q-editor/src/views/online/SurveyView.vue` 集成跳转解析：下一题定位改为 T027 的 `resolveJump` 结果，且目标题目若被隐藏时自动顺延到下一个实际可见题目（FR-003 acceptance scenario 4）
- [x] T031 [US2] 更新填写进度指示器（`SurveyPagination`/`useSurveyNo` 相关逻辑）为基于 `visibleComs` 实际经历路径计算，而非问卷题目总数（FR-008）

**Checkpoint**：User Story 1 与 2 均可独立验证（quickstart.md 场景1-2）

---

## Phase 5: User Story 3 - 配置选项联动（级联/依赖选项池） (Priority: P3)

**Goal**：设计者可配置某选择题的候选项依赖另一题目答案，依赖答案变化时候选项自动刷新并清空失效已选值

**Independent Test**：题目B选项依赖题目A，分别选择题目A不同选项验证题目B候选项刷新（quickstart.md 场景3）

### Tests for User Story 3 ⚠️

- [x] T032 [P] [US3] 在 `packages/survey-engine/src/logic/__tests__/evaluator.spec.ts` 编写 `resolveOptionPool` 的 Vitest 单测（覆盖候选集合刷新、依赖题未作答的两种 `emptyStrategy`），先于实现落地前编写并确认失败

### Implementation for User Story 3

- [x] T033 [US3] 在 `packages/survey-engine/src/logic/evaluator.ts` 实现 `resolveOptionPool()`，对应 [data-model.md](./data-model.md) §1.6 / FR-004
- [x] T034 [US3] 在 `app/q-editor/src/components/Logic/OptionDependencyEditor.vue` 新增选项依赖映射编辑器组件（依赖题目选择 + `optionsByAnswer` 映射表 + `emptyStrategy` 配置）
- [x] T035 [US3] 在 `app/q-editor/src/views/EditorView/RightSide.vue` 的动态规则面板新增"选项联动"配置入口（仅选择类题型可用，通过 `LogicPanel.vue` 接入）
- [x] T036 [US3] 在 `app/q-editor/src/components/SurveyComs/` 下选择类题目组件接入 T033 的 `resolveOptionPool`：依赖题答案变化时刷新候选项，并清空不再属于新候选集合的已选值（FR-004 acceptance scenario 2）

**Checkpoint**：User Story 1-3 均可独立验证（quickstart.md 场景1-3）

---

## Phase 6: User Story 4 - 配置计算/派生字段逻辑 (Priority: P4)

**Goal**：设计者可配置基于多个数值题目的派生计算字段，结果实时更新、可选对填写者可见、可被其他显示条件引用，且随答卷持久化

**Independent Test**：配置"派生字段=题目A+题目B"并作为另一题目显示条件，验证计算与联动效果（quickstart.md 场景4）

### Tests for User Story 4 ⚠️

- [x] T037 [P] [US4] 在 `packages/survey-engine/src/logic/__tests__/evaluator.spec.ts` 编写 `computeDerivedField` 的 Vitest 单测（覆盖 `sum`/`weightedSum` 两种公式、`incompleteStrategy` 两种降级策略），先于实现落地前编写并确认失败

### Implementation for User Story 4

- [x] T038 [US4] 在 `packages/survey-engine/src/logic/evaluator.ts` 实现 `computeDerivedField()`，对应 [data-model.md](./data-model.md) §1.7 / FR-005
- [x] T039 [US4] 新增派生字段只读展示组件（编辑器画布与填写页复用）：实际路径为 `Materials/ComputedComs/ComputedField.vue`（与 `NoteComs`/`InputComs`/`SelectComs`/`AdvancedComs`/`MatrixComs` 目录分类规范保持一致，偏离原任务描述中的 `ComputedField/index.vue` 路径），并在 `packages/survey-engine` 与 `app/q-editor` 两套组件/工具/类型树中各建一份；同步新增默认状态工厂函数 `configs/defaultStatus/computed/ComputedField.ts`，并在两套 `componentMap.ts`/`defaultStatusMap.ts` 中注册 `computed-field`
- [x] T040 [US4] 在 `app/q-editor/src/components/Logic/ComputedFieldEditor.vue` 新增计算公式配置面板（`sum`/`weightedSum` 选择、参与题目选择、`incompleteStrategy`/`visibleToFiller` 配置）；实际"新增计算字段题目类型入口"落地于 `app/q-editor/src/configs/SurveyGroupConfig.ts`（题型面板配置文件，偏离原任务描述中的 `RightSide.vue`，真实入口链路为 `SurveyGroupConfig.ts` → `SurveyType.vue` → `SurveyComGroup.vue` → `SurveyComItem.vue` → `store.addCom()`，与 T039 记录的路径偏离先例一致）；`ComputedFieldEditor.vue` 已接入 `LogicPanel.vue`（`com.name === 'computed-field'` 时展示），并同步补齐三语言 `components.ts`（`surveyGroup.computedField`）与 `logic.ts`（`computedField*` 系列词条）
- [x] T041 [US4] 在 `app/q-editor/src/views/online/SurveyView.vue` 集成 T038 的 `computeDerivedField` 实时计算：新增 `computedFieldValues` computed（对 `visibleComs` 中配置了 `logic.computedField` 的计算字段题目调用 `computeDerivedField(config, normalizedAnswers.value)`），配套 `immediate` 收敛式 `watch` 将计算结果写回集中式 `answers` store（`useRuleRuntime` 据此自动重新规范化为 `NormalizedValue(kind: "number")`，故计算结果可被其他题目的 `resolveVisibility`/`resolveOptionPool` 条件引用，亦支持链式计算字段）；新增 `getComputedValueProp()` 辅助函数（仿照既有 `getOptionPoolProp` 模式）通过 `v-bind` 将结果作为 `computedValue` prop 注入 `ComputedField.vue`（T039 已声明该 prop）；`packages/survey-engine/src/logic/normalize.ts` 与 `app/q-editor/src/components/Logic/logicSources.ts` 同步补齐 `"computed-field"` → `"number"` 的规范化/取值类型映射分支，避免"配置成功但引擎运行时永不命中"的隐蔽 bug；`pnpm --filter q-editor run type-check` 验证除 4 条预先存在、与本功能无关的错误外无新增类型错误
- [x] T042 [US4] 确认 `Material.ComputedField` 类型题目的计算结果值随答卷正常写入 `Answer` 行（复用 T024 已实现的通用写入路径），补充针对性验证（FR-005 / SC-006 持久化与可追溯性要求）：代码审查确认持久化路径无需新增代码——`getAnswerKey(com)` 回退来源 `_componentId` 在 `deserializeSurveyDetail()` 中被赋值为 `c.id`，与 `componentMap.value` 的 `key: c.client_key || c.id` 格式完全一致，故 T041 写入 `answers.value[key]` 的计算结果能被 `submitAnswers()` 现有的 `indexedAnswers` 构建逻辑（遍历 `componentMap.value` 读取 `answers.value[c.key]`）自动正确捕获；`serializeAnswers()` 对 number 类型走既有"标量转字符串"分支（与 rate-score/slider 完全一致），无需改动即可正确提交给 `submitResponse()` → 后端 `submitResponse()` service（复用 T024 的通用 `Answer` 行写入路径，`answer_status` 按已作答语义写 0）。**同步修复 T041 遗留缺口**：`ComputedFieldConfig.visibleToFiller`（FR-005"计算结果可选择性地展示给填写者"）此前在填写页侧完全未被消费——`ComputedFieldEditor.vue` 已提供完整配置 UI（`el-switch` + i18n"对填写者可见"词条），但无论设为 `true`/`false`，填写页均无条件展示计算结果。现于 `SurveyView.vue` 新增 `isVisibleToFiller(com)` 辅助函数（读取 `com.logic?.computedField?.visibleToFiller`，默认 `true` 兼容存量数据），并将其接入题目渲染区块的 `v-show` 条件；`visibleToFiller: false` 时该计算字段的内容区块不出现在填写者可见 UI 中，但仍完整参与 `computedFieldValues` 计算、`answers` 写回与规则引用/提交持久化（与"隐藏但后台计算"的低代码问卷设计一致），不影响分页 `total`/`useSurveyNo` 序号占位（`computed-field` 本就不计入 `isSurveyComName` 序号统计，见 `material.ts` 第45-46行注释）。`pnpm --filter q-editor run type-check` 验证除 4 条预先存在、与本功能无关的错误外无新增类型错误

**Checkpoint**：User Story 1-4 均可独立验证（quickstart.md 场景1-4）

---

## Phase 7: User Story 5 - 设计时规则校验与填写者视角预览 (Priority: P5)

**Goal**：发布前 100% 拦截循环依赖/无效引用/非法跳转配置错误，提供不产生真实提交数据的填写者视角预览，删除被引用题目时立即提示

**Independent Test**：构造循环依赖规则尝试发布，验证被拦截并给出明确提示；随后预览一份配置正确的问卷验证效果（quickstart.md 场景5）

### Tests for User Story 5 ⚠️

- [x] T043 [P] [US5] 在 `packages/survey-engine/src/logic/__tests__/validator.spec.ts` 编写 `validateRuleSet` 的 Vitest 单测（覆盖循环依赖 DFS 三色标记检测、无效引用检测、非法跳转目标检测三类场景及多违规并存场景），先于实现落地前编写并确认失败

### Implementation for User Story 5

- [x] T044 [US5] 在 `packages/survey-engine/src/logic/validator.ts` 实现 `validateRuleSet()`，对应 [data-model.md](./data-model.md) §1.9 / [research.md](./research.md) §6 / FR-006
- [x] T045 [P] [US5] 在 `app/q-server/src/utils/response.ts` 的 `BizCode` 枚举新增 6xxx 段常量：`RULE_CIRCULAR_DEPENDENCY = 6001`/`RULE_DANGLING_REFERENCE = 6002`/`RULE_INVALID_JUMP_TARGET = 6003`
- [x] T046 [US5] 在 `app/q-server/src/modules/survey/survey-rule/survey-rule.service.ts` 实现服务：读取问卷全部组件的 `client_key`/`order_index`/`logic`，调用 T044 的 `validateRuleSet()`
- [x] T047 [US5] 在 `app/q-server/src/modules/survey/survey-rule/survey-rule.routes.ts` 注册 `POST /api/surveys/:id/validate-rules`（复用发布接口既有鉴权/归属校验中间件），对应 [survey-publish.contract.md](./contracts/survey-publish.contract.md)
- [x] T048 [US5] 在 `app/q-server/src/modules/survey/survey-crud/survey-crud.service.ts` 的 `publish()` 中，状态检查通过后、写入 `status=1` 前调用 T046 的校验服务；校验失败时 `throw new AppError(message, 400, BizCode.RULE_*)` 并携带 `violations`，不触及数据库写操作，对应 [survey-publish.contract.md](./contracts/survey-publish.contract.md)
- [x] T049 [US5] 在 `app/q-editor` 新增"填写者视角预览"模式（复用 `SurveyView.vue`，禁用真实提交请求，不产生 `Response`/`Answer` 记录）：不新增路由，复用现有 `/survey/:id`（该路由已在 `publicRoutes` 中豁免登录鉴权、`id` 无正则约束），改为通过 query 参数 `preview=1` 区分；`SurveyView.vue` 新增 `isPreviewMode` 计算属性与 `loadPreviewSurvey()`——依据同页面 SPA 路由导航（`router.push`）不会销毁 Vue 应用实例、Pinia store 实例在导航前后保持不变这一特性，直接 `useEditorStore()` 读取编辑器内存中最新的 `store.coms`（无需 sessionStorage 或反序列化），标题/描述通过已有 `getSurveyMetadata(store)` 装配；`submitAnswers()`/`onMounted()`/重试入口在预览模式下短路真实网络请求（提交/指纹采集/token 获取），仅保留规则引擎求值与题目渲染路径；同步修复 `getAnswerKey()` 缺失的 `.id` 兜底（编辑器原生 `Status` 对象无 `_componentId` 字段，此前会导致预览模式下多题答案键冲突覆盖）；`Header.vue` 新增独立"填写视角预览"按钮（`isEditor` 时即可用，无需先保存），与原有"预览"（分页/打印）按钮并存不冲突；三语言 `editor.ts` 同步新增 `previewAsFiller` 词条；`pnpm --filter q-editor run type-check` 验证除 4 条预先存在、与本功能无关的错误外无新增类型错误
- [x] T050 [US5] 在 `app/q-editor` 编辑器画布/属性面板中，题目删除操作前检查是否被其他规则引用（调用 T044 的校验逻辑或等价的引用检查），若是则立即提示受影响的规则，而非等到发布才发现（FR-012 acceptance scenario 4）：`useEditor.ts` 新增 `findRuleReferencesTo(clientKey)` action，复用 T044 的 `validateRuleSet()`——将目标题目从传入的题目全集中排除（使其 client_key 不再存在于 `fullKeys` 中），任何仍引用该 key 的规则会被现有的 `danglingReference` 检测自动捕获，无需新增独立引用图遍历逻辑；同步遵循 T046 已确立的"过滤无 client_key 存量题目"先例。`Center.vue` 的 `removeCom(index)` 在弹出确认框前调用该 action，若有受影响规则则在确认文案中追加提示（仅提示不阻断，设计者仍可继续删除），三语言 `editor.ts` 同步新增 `deleteRuleWarning` 词条。`pnpm --filter q-editor run type-check` 验证除 4 条预先存在、与本功能无关的错误外无新增类型错误
- [x] T051 [US5] 在 `app/q-editor` 填写页规则求值遇到异常规则（引用已删除题目、类型不兼容比较）时优雅降级：忽略该条规则、相关题目按默认状态展示，不导致页面崩溃/白屏，并记录 warn 级提示供设计者事后排查（FR-012）：代码审查确认 `packages/survey-engine/src/logic/evaluator.ts` 的四个核心求值函数（`resolveVisibility`/`resolveJump`/`resolveOptionPool`/`computeDerivedField`）已对 FR-012 列举的两个典型异常场景（`sourceKey` 引用已删除题目 → 安全兜底为 `{kind:"empty"}`；运算符与答案类型不兼容比较 → `typeof` 检查失败安全兜底为 `false`）做了完善的防御性处理，不会抛出异常，故本任务在应用层（而非 evaluator.ts 本身）补充防御纵深，防御 evaluator.ts 未预见的更结构性异常（如 `logic` 字段被历史脏数据破坏导致缺失 TS 类型要求的必需字段）。在 `app/q-editor/src/views/online/SurveyView.vue` 新增 `safeEvaluateRule<T>(clientKey, ruleLabel, defaultValue, evaluate)` 通用异常安全包装函数，并接入三处规则引擎调用点：`visibleComs` computed 中 `resolveVisibility()`/`resolveJump()` 调用异常时分别降级为 `"visible"`/`null`（对应默认可见、不跳转）；`optionPools` computed 中 `resolveOptionPool()` 调用异常时不写入该题目的候选池映射（使 `getOptionPoolProp()` 回退为不附带 `optionPool` prop，退化为"未配置选项联动"的默认展示全量选项行为，比强行返回空数组更贴合"按默认状态展示"）；`computedFieldValues` computed 中 `computeDerivedField()` 调用异常时降级为 `null`（与既有 `incompleteStrategy: "skipCalculation"` 语义一致，复用 `ComputedField.vue` 既有渲染为 "--" 的兜底）。三处异常均以 `console.warn("[SurveyView] 题目 ${clientKey} 的${ruleLabel}求值异常...")` 记录，遵循项目既有的方括号模块名前缀日志风格（与 `initFingerprint()`/`loadSurvey()`/`submitAnswers()` 一致），供设计者事后排查。同步从顶层包 `monorepo-survey-engine` 新增 `JumpRule` 类型导入用于 `jumpRule` 局部变量标注。本次改动属于 `app/q-editor` 集成层的防御性包装，未触及 `packages/survey-engine/src/logic/` 纯函数本身，故不新增 Vitest 单测，端到端验证归入 T053（Playwright e2e）与 T055（quickstart 场景验证）。`pnpm --filter q-editor run type-check` 验证除 4 条预先存在、与本功能无关的错误外无新增类型错误

**Checkpoint**：全部用户故事应可独立验证（quickstart.md 场景1-5）

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**：跨用户故事的文档同步、端到端测试与零回归基线验证

- [x] T052 [P] 按 Constitution Principle III 的既定先例，同步更新 `docs/API接口文档.md`，补充 `PUT /api/surveys/:id`、`POST /api/surveys/:id/publish`、`POST /api/surveys/:id/validate-rules`、`POST /api/surveys/:surveyId/responses` 的新增字段与新增接口说明：**已跳过**——`docs/` 整个目录已在提交 `7b9cc9c`（"chore: 清理 docs 目录下全部文档"）中被完整删除，该清理发生在本 tasks.md 生成之后，是明确的项目决策（不再于代码库内维护该类文档）。经与用户确认，不重建该目录/文件；新增接口的字段与行为说明已完整记录于 `specs/008-dynamic-form-engine/contracts/`（`survey-components.contract.md`/`survey-publish.contract.md`/`survey-responses.contract.md`）与本文件各任务的实现说明中，视为等价覆盖
- [x] T053 [P] 编写 Playwright e2e 测试覆盖填写页显示/跳转/联动关键路径（`app/q-editor` e2e 测试目录），对应 [quickstart.md](./quickstart.md) 场景1-3 核心断言：新增 `app/q-editor/e2e/tests/survey/survey-dynamic-logic.spec.ts`，基于独立的 `DYNAMIC_SURVEY`（`/survey/10002`，mock 数据见 `app/q-editor/src/mock/modules/survey.ts` 的 `dynamicLogicComponents`）覆盖三类核心能力：①显示/隐藏规则——验证依赖题默认隐藏（完全不挂载而非仅 `v-show`）、命中 `show` 规则后立即出现、条件回退后从题目路径彻底消失、重新命中后组件重新挂载导致此前填写内容被清空（对应 `SurveyView.vue` 的 `visibleComs` 计算属性对隐藏题目做 `continue` 跳过而非隐藏渲染的语义）；②跳题结束规则——验证命中 `target.type==="endSurvey"` 后该题目之后的所有题目从可见路径整体消失（对应 `visibleComs` 计算中 `break` 语义，而非仅隐藏跳转目标本身），且可直接提交，并补充"未命中跳转时后续题目保持可见"的对照用例；③选项联动规则——验证依赖题未作答时展示 `optionDependencyPrompt` 引导文案而非选项列表（`emptyStrategy: "promptFillDependency"`），作答后候选池按 `optionsByAnswer` 收窄（候选池外选项通过 `v-show` 隐藏但仍在 DOM 中，与隐藏规则的彻底移除语义不同）。**过程中发现并修复一个真实存在、此前任务（T033/T041 引入）遗留的编译期缺陷**：`app/q-editor/src/views/online/SurveyView.vue` 第26-27行的 `<component>` 标签上同时存在两个无参数裸 `v-bind`（`v-bind="getOptionPoolProp(com)"` 与 `v-bind="getComputedValueProp(com)"`），Vue 3 编译器不允许同一元素出现两个裸 `v-bind`，判定为 "Duplicate attribute" 编译错误，导致 Vite dev server 用 HMR 报错浮层覆盖全部在线问卷填写页（无论新旧问卷），是本次及既有 e2e 测试大面积失败的根本原因，与本任务新增的 mock 数据或测试断言无关。修复方式：将两处调用合并为单个对象展开 `v-bind="{ ...getOptionPoolProp(com), ...getComputedValueProp(com) }"`，不改变 `getOptionPoolProp`（T036 选项联动候选池 prop）与 `getComputedValueProp`（T041 计算字段实时结果 prop）各自原有的返回语义。修复后运行 `survey-dynamic-logic.spec.ts`（新增4项）与既有 `survey-submit.spec.ts`（12项）共16项测试全部通过，确认零回归。测试编写过程中另修正一处测试选择器缺陷（`filter({hasText: "符合资格"})` 会子串误中"不符合资格"），改为正则锚定 `^...$` 全词匹配
- [x] T054 执行 [quickstart.md](./quickstart.md) 场景6：选取一份存量问卷（`client_key`/`logic` 均为 `NULL`）完整走通编辑保存/发布/填写提交/统计/导出既有验证用例，确认零行为差异（FR-010/SC-004）：确认 `app/q-editor/src/mock/modules/survey.ts` 中的 `DEMO_SURVEY`（id=`10001`，`demoComponents`）全部题目均未携带 `client_key`/`logic` 字段（即后端语义等价于列值 `NULL`），完全符合本场景"存量问卷"的前置条件，且该问卷已被项目现有全部自动化用例复用，无需新造数据。依次执行既有验证用例：①**编辑保存**——`editor-save-flow.spec.ts` + `editor-full-flow.spec.ts`（新建/更新问卷保存、Ctrl+S 快捷键、撤销重做、未保存离开拦截、分页与响应式），单 worker 串行运行 32/32 全部通过；②**发布/预览**——`preview.spec.ts`、`e2e-flow.spec.ts`（登录→编辑器→素材库→预览→设置完整链路，含 `ROUTES.preview(DEMO_SURVEY.id)`）全部通过；③**填写提交**——`survey-submit.spec.ts`（页面渲染/问卷填写/提交功能/异常处理/分页/完整填写流程共12项）全部通过，验证 T053 修复的 `SurveyView.vue` 重复 `v-bind` 缺陷修复后该存量问卷填写页恢复正常渲染，且 `resolveVisibility`/`resolveJump`/`resolveOptionPool` 在 `logic` 为 `undefined` 时直接走函数入参默认分支返回默认可见/不跳转/不联动状态，不产生任何隐藏或跳转副作用。**统计报表查看/数据导出**：经代码库全文检索确认这两项功能当前均**未实现**（`app/q-server` 仅有半成品 `survey-stats` service 且无对应测试，`app/q-editor` 无任何统计/导出相关页面、路由或 e2e 用例；`survey-export` 模块不存在），故不在本功能的回归验证范围内，如实记录为"无可用基线、非本任务引入的缺口"而非验证失败。运行过程中发现 `editor-full-flow.spec.ts` 在4-worker 并行下有2个用例因登录页 `input[type="email"]` 短暂不可见而超时失败，改用 `--workers=1` 串行重跑后 32/32 全部通过，确认是既有测试基础设施在并发登录场景下的资源竞争型偶发抖动（与本功能改动无关，不属于回归），未做额外修改
- [x] T055 执行 [quickstart.md](./quickstart.md) 场景1-5 全量端到端验证，逐条核对 spec.md 的 acceptance scenarios 与 Success Criteria（SC-001~SC-006）：**场景1-3**（显示/隐藏、跳题结束、选项联动）——实际运行 T053 编写的 `app/q-editor/e2e/tests/survey/survey-dynamic-logic.spec.ts`，4 个用例全部通过（chromium，单 worker），覆盖隐藏依赖题清空重挂载、跳转 break 语义、选项池收窄与引导文案三类核心断言。**场景4**（派生计算字段）——代码审查确认 `SurveyView.vue` 的 `computedFieldValues` 计算属性求值后通过 watch 回写集中式答案 store，使计算结果可被下游题目的显示条件/选项联动/链式计算字段引用；核心求值算法（`sum`/`weightedSum` 公式、`treatAsZero`/`skipCalculation` 两种降级策略）已由 `packages/survey-engine/src/logic/__tests__/evaluator.spec.ts` 完整单测覆盖。**场景5**（发布时规则校验与填写者视角预览）——代码审查确认 `survey-crud.service.ts` 的 `publish()` 在 Prisma 事务内于状态变更前调用 `SurveyRuleService.validateSurveyRules()`，校验失败直接 throw 触发事务回滚；`Header.vue` 的 `previewAsFiller()` 通过 `query.preview=1` 复用 `SurveyView.vue` 实现免保存预览，`submitAnswers()`/`onMounted()` 均已接入预览模式短路逻辑；`Center.vue` 的 `removeCom()` 复用 `findRuleReferencesTo()` 在删除题目前给出规则引用警告（只提示不阻断）；核心校验算法（循环依赖/悬空引用/非法跳转目标）已由 `packages/survey-engine/src/logic/__tests__/validator.spec.ts` 完整单测覆盖。**单测执行结果**：`packages/survey-engine` 全部 7 个测试文件 227 个用例 100% 通过（含 validator.spec.ts / evaluator.spec.ts）。**全量回归验证（零回归确认）**：`pnpm --filter q-server run test:dev` 完整套件为 5 个文件 89 个用例失败 / 22 个文件 372 个用例通过（461 总计），失败集中在 `auth.middleware.spec.ts`、`auth.service.spec.ts`、`review.service.spec.ts`、`survey-crud.routes.spec.ts`、`survey-crud.service.spec.ts` 五个文件；经 `git stash push -u -- app/q-server` 临时移除本功能全部 q-server 改动后在纯净基线上重跑，结果同样是 5 个文件 89 个用例失败 / 22 个文件 372 个用例通过——文件清单、失败数、通过数三项指标与带改动时逐一比对完全一致，确凿证明这 89 个失败（含 `survey-crud.service.spec.ts` 内 27 个因 `review_status` 审核门禁与 `toSurveyListItem` mock 字段缺失导致的失败）全部是独立于本次动态表单功能的既有基线缺陷，验证完成后已 `git stash pop` 恢复全部改动。**遗留观察**（非本任务范围，如实记录不擅自修复）：`app/q-server/src/modules/survey/survey-rule/` 模块目前没有独立的 `survey-rule.service.spec.ts` 单测文件，`validateSurveyRules()` 自身（Prisma 查询 + logic 字段防御性解析部分）未被直接单测覆盖，仅其委托的核心算法 `validateRuleSet()` 在 survey-engine 侧有完整覆盖；建议后续补充。

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup（Phase 1）**：无依赖，可立即开始
- **Foundational（Phase 2）**：依赖 Setup 完成 — 阻塞全部用户故事
- **User Stories（Phase 3-7）**：均依赖 Foundational 完成
  - 可按优先级顺序（P1→P2→P3→P4→P5）串行推进，也可在团队人力允许时并行开展
  - US2-US5 均复用 US1 建立的 `visibleComs`/`ConditionGroupEditor`/`answer_status` 写入路径，但不改变各自的独立可测试性（各自 quickstart 场景不依赖其他故事的 UI 完成度，只依赖 Foundational 的求值/持久化骨架）
- **Polish（Phase 8）**：依赖期望交付的全部用户故事完成

### User Story Dependencies

- **User Story 1 (P1)**：Foundational 完成后即可开始，无对其他故事的依赖
- **User Story 2 (P2)**：Foundational 完成后即可开始；复用 US1 的 `ConditionGroupEditor`（T019）与 `visibleComs`（T022）基础设施，但可独立验证（quickstart 场景2 不要求跳转配置依赖显示规则）
- **User Story 3 (P3)**：Foundational 完成后即可开始，与 US1/US2 相互独立
- **User Story 4 (P4)**：Foundational 完成后即可开始；复用 US1 的 `submitResponse()` 写入路径（T024）与显示条件引用能力（T018），可独立验证
- **User Story 5 (P5)**：Foundational 完成后即可开始规则校验算法本身（T043-T044）；发布拦截与预览的完整端到端验证依赖至少 US1 已产出可校验的规则数据，建议在 US1 完成后进行完整验证

### Within Each User Story

- 单测先于实现编写（T017/T026/T032/T037/T043 均先于对应实现任务）
- `packages/survey-engine` 纯函数实现先于 `app/q-editor` UI 集成
- 编辑器配置 UI 先于填写页运行时集成
- 故事内全部任务完成后再进入下一优先级故事

### Parallel Opportunities

- Setup 阶段 T001-T003 可全部并行
- Foundational 阶段 T005/T006/T008/T009 可并行（不同文件、无相互依赖）；T010 需等待 T004 完成；T012-T014 需等待 T004/T009 完成；T015 可与 T008-T014 并行
- Foundational 完成后，US1-US5 的求值单测任务（T017/T026/T032/T037/T043）可全部并行编写
- 不同用户故事之间，只要不修改同一文件（如均会修改 `RightSide.vue`/`evaluator.ts`），可由不同开发者并行推进；修改同一文件的任务（如各故事均修改 `evaluator.ts`/`RightSide.vue`）建议同一开发者顺序处理以避免合并冲突

---

## Parallel Example: User Story 1

```bash
# Foundational 完成后，US1 的单测与后续 UI 组件可部分并行：
Task: "在 packages/survey-engine/src/logic/__tests__/evaluator.spec.ts 编写 resolveVisibility 单测"
Task: "在 app/q-editor/src/components/Logic/ConditionGroupEditor.vue 新增条件组编辑器组件"
```

---

## Implementation Strategy

### MVP First（仅 User Story 1）

1. 完成 Phase 1: Setup
2. 完成 Phase 2: Foundational（阻塞项，务必完整交付）
3. 完成 Phase 3: User Story 1
4. **停下并验证**：独立执行 quickstart.md 场景1，确认题目显示/隐藏条件按预期生效
5. 视需要交付/演示

### Incremental Delivery（增量交付）

1. Setup + Foundational 完成 → 基础设施就位
2. 交付 User Story 1（P1）→ 独立验证（场景1）→ 演示/上线（MVP）
3. 交付 User Story 2（P2）→ 独立验证（场景2）→ 演示/上线
4. 交付 User Story 3（P3）→ 独立验证（场景3）→ 演示/上线
5. 交付 User Story 4（P4）→ 独立验证（场景4）→ 演示/上线
6. 交付 User Story 5（P5）→ 独立验证（场景5）→ 演示/上线
7. Polish：文档同步、e2e 补充、场景6 零回归基线验证 → 正式发布

### Parallel Team Strategy（多人协作）

1. 团队共同完成 Setup + Foundational
2. Foundational 完成后：
   - 开发者 A：User Story 1（同时是后续故事复用的 `ConditionGroupEditor`/`visibleComs` 基础，建议优先完成）
   - 开发者 B：User Story 2 / 3（跳转与选项联动相互独立）
   - 开发者 C：User Story 4（计算字段）
   - User Story 5（规则校验与预览）建议在 US1 落地后由熟悉整体规则语义的开发者收尾
3. 各故事按各自 quickstart 场景独立验证后再合并集成

---

## Notes

- `[P]` 任务 = 不同文件、无未完成依赖
- `[Story]` 标签用于将任务追溯到具体用户故事
- 每个用户故事应可独立完成并独立验证（对应 quickstart.md 的场景1-5）
- 实现前先确认对应单测处于失败状态
- 每完成一个任务或一组逻辑相关任务后建议提交一次
- 可在任意检查点（Checkpoint）暂停以独立验证该故事
- 避免：模糊任务描述、多任务同改一个文件造成冲突、破坏故事独立性的跨故事强依赖
