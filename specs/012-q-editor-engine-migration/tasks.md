---
description: "Task list for feature implementation"
---

# Tasks: q-editor 问卷引擎无缝迁移

**Input**: Design documents from `/specs/012-q-editor-engine-migration/`

**Prerequisites**: [plan.md](./plan.md)、[spec.md](./spec.md)、[research.md](./research.md)、[data-model.md](./data-model.md)、[contracts/survey-engine-exports.md](./contracts/survey-engine-exports.md)、[quickstart.md](./quickstart.md)

**Tests**: spec.md FR-006 与 Assumptions 已明确要求——FR-010 列出的 5 项高风险分歧点必须补充 Vitest 组件级/Store 级用例（例外条款，不视为引入新测试基础设施）；其余题型以手动回归为主。因此下方任务中，仅这 5 项分歧点 + client_key Store 方法附带测试任务，其余任务不强制新增自动化测试。

**Organization**: 任务按用户故事分组，对应 plan.md 的"先补齐共享引擎能力 → 再切换 q-editor 依赖 → 最后清理本地重复代码"三阶段迁移路线。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可并行执行（不同文件、无依赖关系）
- **[Story]**: 任务所属用户故事（US1/US2/US3）；Setup/Foundational/Polish 阶段任务不带此标签
- 每个任务均包含明确文件路径

## Path Conventions

Monorepo 结构，本次迁移涉及两处代码：

- 共享引擎：`packages/survey-engine/src/`
- 消费方（本次迁移对象）：`app/q-editor/src/`

---

## Phase 1: Setup（基线记录）

**Purpose**: 在改动任何代码前，记录迁移前的既有缺陷基线，作为 SC-001"零功能回退"判定时的排除范围依据（spec.md Edge Cases：4 项既有失败单测、`TemplateMarket.vue` 与 `packages/sse-client/src/ai.ts` 的既有 TS 错误不计入本次回退判定；仅 `Signature.vue` 的 `TS2345` 因与本次改造同文件须一并修复）。

- [x] T001 运行 `pnpm --filter monorepo-survey-engine test`、`pnpm --filter q-editor test`、`pnpm --filter monorepo-survey-engine exec vue-tsc --build`、`pnpm --filter q-editor exec vue-tsc --build`、`pnpm exec tsc --noEmit -p tsconfig.json`（仓库根级 tsconfig，覆盖 `packages/**/*`，是唯一能实测复现 `packages/sse-client/src/ai.ts` 既有 TS 错误的命令；注意该根级配置未配置 `lib: dom`，会连带报出与本次迁移无关的 `packages/components`、`packages/tracking-sdk` 及 `packages/survey-engine` 既有 DOM 类型缺失错误——仅摘录 `packages/sse-client/src/ai.ts` 的错误行计入基线，其余包的噪音在 `baseline.md` 中单独归类为"根级 tsconfig 已知噪音、与本次迁移无关"，不逐条列出）、`pnpm --filter q-editor build`（迁移前生产构建，仅用于捕获 T041 所需的分包体积基线——本任务执行时代码尚未迁移，是唯一能拿到"迁移前"产物的时机，Phase 6 阶段已无法回溯）六条命令，将现有失败用例与既有 TS 错误清单（含 `app/q-editor/src/components/SurveyComs/Materials/AdvancedComs/Signature.vue(72,64)` 的 `TS2345`、`packages/sse-client/src/ai.ts(185,20)` 的 `TS2379` 与 `(323,13)` 的 `TS2322`）、以及 `pnpm --filter q-editor build` 产物 `app/q-editor/dist/assets/js/` 目录下各 chunk 文件名与体积（`ls -la` 或等效命令输出即可，无需逐个分析归属）整理写入新建文件 `specs/012-q-editor-engine-migration/baseline.md`，标注哪些属于"与本次迁移无关、不计入零回退判定"、哪些属于"须随本次改造修复"（仅 `Signature.vue` 的 `TS2345`）。

**Checkpoint**：迁移前基线已留档，可追溯（支撑 FR-006、SC-001 判定边界）。

---

## Phase 2: Foundational（共享引擎能力回补 — 阻塞所有用户故事）

**Purpose**: 按 FR-003"先补齐共享引擎能力，使其成为功能超集，再切换消费方依赖"的强制顺序，本阶段完成前不得开始 Phase 3 的依赖切换。覆盖 FR-010 列出的全部 5 项已知分歧点，以及 FR-002 要求的 `client_key` 动态规则管理 Store 方法。

**⚠️ CRITICAL**: 本阶段完成前，US1/US2/US3 均不能开始。

### 2.0 全量差异审计（FR-009：发现新分歧点必须记录，不得默默掩盖）

- [x] T002 逐一比对 `app/q-editor/src/components/SurveyComs/` 与 `packages/survey-engine/src/components/SurveyComs/` 下除 FR-010 已列出 5 项（`SingleSelect.vue`、`OptionSelect.vue`、`SinglePicSelect.vue`、`Signature.vue`、`PicItem.vue`）外的其余全部同名文件（`Common/MaterialsHeader.vue`、`EditItems/*.vue` 共 17 个、`Materials/AdvancedComs/{Cascader,DateTime,RateScore,Slider,Transfer}.vue`、`Materials/ComputedComs/ComputedField.vue`、`Materials/InputComs/TextInput.vue`、`Materials/MatrixComs/MatrixSingle.vue`、`Materials/NoteComs/TextNote.vue`、`Materials/SelectComs/{MultiPicSelect,MultiSelect}.vue`），将比对结论写入新建文件 `specs/012-q-editor-engine-migration/divergence-log.md`；对发现的每一处新分歧点，依据 FR-009 记录"分歧描述、能否取两者能力并集、若不能则待人工决策"，能够简单并集处理的分歧点在本阶段追加对应回补任务后处理，不能简单归并的记录为待决议事项而非默默采用任一方行为。

### 2.1 `client_key` 动态规则管理（FR-002、FR-010 第 2 项）

- [x] T003 在 `packages/survey-engine/src/stores/useEditor.ts` 顶部补充 `import { v4 as uuidv4 } from "uuid";` 导入（`uuid` 已在该包 `package.json` dependencies 中声明为 `^13.0.0`，与 q-editor 版本一致，无需新增依赖）。
- [x] T004 在 `packages/survey-engine/src/stores/useEditor.ts` 的 actions 中新增 `getComByClientKey(clientKey: string)` 方法，原样迁移自 `app/q-editor/src/stores/useEditor.ts` 第 208-211 行（在 `this.coms` 中按 `client_key` 查找对应题目组件）。
- [x] T005 在 `packages/survey-engine/src/stores/useEditor.ts` 中新增 `ensureComClientKey(index: number): string` 方法，原样迁移自 `app/q-editor/src/stores/useEditor.ts` 第 213-222 行（若 `this.coms[index]` 缺少 `client_key` 则生成 UUID v4 并写回、标记 `dirty = true`；重复调用同一题目须幂等，不二次生成）。
- [x] T006 在 `packages/survey-engine/src/stores/useEditor.ts` 中新增 `setComLogicByClientKey(clientKey: string, logic: QuestionLogicConfig | null): void` 方法，原样迁移自 `app/q-editor/src/stores/useEditor.ts` 第 224-232 行（按 `client_key` 查找题目并更新 `logic` 字段；找不到对应题目时 `console.warn` 告警而非抛异常；写入前调用已有的 `this._recordSnapshot()` 以支持撤销/重做）。
- [x] T007 在 `packages/survey-engine/src/stores/useEditor.ts` 中新增 `findRuleReferencesTo(clientKey: string): RuleViolation[]` 方法，原样迁移自 `app/q-editor/src/stores/useEditor.ts` 第 241-256 行（将目标 `client_key` 从题目全集中排除后调用已导入的 `validateRuleSet`，过滤出 `type === "danglingReference"` 且 `involvedKeys` 包含目标 key 的违规项，用于删除题目前提示引用方）。
- [x] T008 在 `packages/survey-engine/src/stores/useEditor.ts` 中新增 `getDanglingReferencesFrom(clientKey: string): RuleViolation[]` 方法，原样迁移自 `app/q-editor/src/stores/useEditor.ts` 第 263-277 行（对当前题目全集调用 `validateRuleSet`，过滤出 `involvedKeys[0] === clientKey` 的悬空引用违规项，用于体检指定题目自身规则中的失效引用）。
- [x] T009 [P] 在 `packages/survey-engine/src/__tests__/store.spec.ts` 中为 T004-T008 新增的 5 个方法补充单测（参照 `app/q-editor/src/stores/__tests__/useEditor.test.ts` 中对应断言迁移改写），覆盖：按存在/不存在的 `client_key` 查找题目、`ensureComClientKey` 的幂等性（重复调用不二次生成）、`setComLogicByClientKey` 在找不到题目时仅告警不抛异常、`findRuleReferencesTo`/`getDanglingReferencesFrom` 两个方向的规则引用查找结果正确性。

### 2.2 选项联动候选池组件接线（FR-001、FR-010 第 1 项）

- [x] T010 [P] 在 `packages/survey-engine/src/components/SurveyComs/Materials/SelectComs/SingleSelect.vue` 中补齐接线：新增 `optionPool?: string[] | { prompt: true }` prop、`isPoolPrompting` 计算属性、`isOptionAvailable(index: number): boolean` 过滤函数（原样迁移自 `app/q-editor` 同名文件第 44-83 行逻辑），并将模板中选项渲染由直接展示 `computedState.options` 改为配合 `v-show="isOptionAvailable(index)"` 逐项判断展示，`isPoolPrompting` 为真时展示"需先完成依赖题"提示态（选项下标/顺序不因收窄而改变，禁止使用 `v-if` 移除选项节点）。
- [x] T011 [P] 在 `packages/survey-engine/src/components/SurveyComs/Materials/SelectComs/OptionSelect.vue` 中补齐同等接线：新增同名 `optionPool` prop 与 `displayOptions` 过滤计算属性（原样迁移自 `app/q-editor` 同名文件第 48-89 行逻辑），模板中的 `el-select` 改为渲染过滤后的 `displayOptions` 而非全量 `computedState.options`。
- [x] T012 [P] 新建 `packages/survey-engine/src/components/SurveyComs/Materials/SelectComs/__tests__/SingleSelect.spec.ts`（该组件目录当前无组件级测试，参照 `packages/survey-engine/src/__tests__/store.spec.ts` 的 Vue Test Utils 写法新建），覆盖：`optionPool` 为 `{ prompt: true }` 时渲染提示态、`optionPool` 为收窄后数组时候选项按 `v-show` 正确显隐且 DOM 顺序不变。
- [x] T013 [P] 新建 `packages/survey-engine/src/components/SurveyComs/Materials/SelectComs/__tests__/OptionSelect.spec.ts`，覆盖同等场景（提示态展示、`displayOptions` 收窄结果正确）。

### 2.3 Signature 签名题型 MinIO 上传回补（FR-010 第 3 项）

- [x] T014 检查 `packages/survey-engine/src/api/clients/server.ts`（当前仅 `axios.create({ baseURL: "/api", timeout: 15000 })`，无 response 拦截器），补充与 `app/q-editor/src/api/clients/server.ts` 第 35-36 行等效的 `response => response.data` 拦截器，使 `serverClient.post(...)` 的返回值直接是后端 `{code, msg, data}` 业务信封而非裸 `AxiosResponse`（对应 Constitution Principle III 统一响应信封要求）；补充前先确认包内其余调用 `serverClient` 的位置（如 `uploadImage`）不会因拦截器生效而产生二次 `.data` 解包错误，需同步核对调整。
- [x] T015 在 `packages/survey-engine/src/api/upload.ts` 中修正 `uploadSurveyFile`/`uploadImage` 的返回类型声明，使其反映 T014 拦截器生效后的真实返回值形状（业务信封而非 `AxiosResponse`），并新增导出 `uploadSignature(file: Blob, surveyId: string): Promise<...>` 函数，原样迁移自 `app/q-editor/src/api/upload.ts` 第 42-95 行区块中对应的 `uploadSignature` 实现（签名与返回结构对齐 `uploadSurveyFile`）。
- [x] T016 在 `packages/survey-engine/src/index.ts` 中新增导出 `export { uploadSurveyFile, uploadSignature } from "./api/upload";`（当前该文件第 128 行仅导出 `uploadImage`），使 `Signature.vue` 与后续消费方可从包顶层导入这两个函数（对应 contracts/survey-engine-exports.md 第 3 节要求复用同一上传封装）。
- [x] T017 在 `packages/survey-engine/src/components/SurveyComs/Materials/AdvancedComs/Signature.vue` 中补齐 MinIO 异步上传流程：新增 `uploading` ref；通过 `inject<(() => string | null) | undefined>("getSurveyId", undefined)` 注入 surveyId 获取器并在未提供时回退到 `useEditorStore().remoteSurveyId`（注意修正 `app/q-editor` 同名文件第 72 行原有的 `TS2345` 缺陷——不可将字面量 `null` 作为 `inject` 第二参数传给函数类型形参，改为 `undefined` 默认值 + 回退表达式的组合）；将 `endDraw` 改为 `async` 函数，原样迁移自 `app/q-editor` 同名文件第 178-219 行逻辑：有 `surveyId` 时 `canvas.toBlob` → 调 T015 新增的 `uploadSignature` → 成功用远程 URL 作答、失败降级为 `canvas.toDataURL("image/png")`；无 `surveyId` 时直接降级为 base64；上传期间 `uploading.value` 为真。
- [x] T018 在 `packages/survey-engine/src/components/SurveyComs/Materials/AdvancedComs/Signature.vue` 的模板与样式中补齐上传中提示：新增 `<span v-if="uploading" class="signed-hint is-uploading">`（原样迁移自 `app/q-editor` 同名文件第 40-42 行模板）及对应 `.is-uploading` CSS 规则（原样迁移自第 313-315 行样式）。
- [x] T019 [P] 新建 `packages/survey-engine/src/components/SurveyComs/Materials/AdvancedComs/__tests__/Signature.spec.ts`，覆盖：有 `surveyId` 且上传成功走远程 URL 作答、无 `surveyId` 时降级为 base64、上传失败时降级为 base64 并提示、上传期间 `uploading` 为 `true`。

### 2.4 PicItem 图片上传响应体解析统一（FR-010 第 4 项）

- [x] T020 在 `packages/survey-engine/src/components/SurveyComs/Common/PicItem.vue` 的 `handleAvatarSuccess` 回调中，将读取方式由当前的扁平 `response.file_url` 改为嵌套 `response.data.file_url`（依赖 T014 的拦截器修复生效后 `response` 的实际形状才与此读取方式匹配），移除对扁平结构的兼容分支（research.md 第 2 节裁决：后端接口已统一为标准信封，不保留双重兼容），错误路径保持通过 `options.onError` 向上抛出、不静默吞错。
- [x] T021 [P] 新建 `packages/survey-engine/src/components/SurveyComs/Common/__tests__/PicItem.spec.ts`，模拟标准信封 `{code: 0, msg: "", data: {file_url: "..."}}` 断言图片链接正确解析展示；模拟上传失败断言 `onError` 被正确调用而非静默失败。

### 2.5 SinglePicSelect 答案发射修复（FR-010 第 5 项）

- [x] T022 在 `packages/survey-engine/src/components/SurveyComs/Materials/SelectComs/SinglePicSelect.vue` 中新增 `const emits = defineEmits(["updateAnswer"]);` 与 `emitAnswer` 处理函数，并在模板 `el-radio-group` 上补充 `@change="emitAnswer"` 绑定，原样迁移自 `app/q-editor` 同名文件第 45、61-64 行脚本逻辑与第 21 行模板绑定。
- [x] T023 [P] 新建 `packages/survey-engine/src/components/SurveyComs/Materials/SelectComs/__tests__/SinglePicSelect.spec.ts`，断言选中选项触发 `@change` 后组件正确 emit `updateAnswer` 且携带值与选中项一致。

### 2.6 阶段收尾核对

- [x] T024 运行 `pnpm --filter monorepo-survey-engine exec vue-tsc --build` 与 `pnpm --filter monorepo-survey-engine test`，确认 T003-T023 新增/修改代码零新增类型错误（`strict: true` 下不得引入 `any` 掩盖类型不匹配，对应 Constitution Principle II）、全部新增 Vitest 用例通过，且未破坏 `core/logic`、`adapters/vue3` 等既有测试；若发现 T002 记录的其他分歧点已在本阶段一并回补，同步在 `divergence-log.md` 中标注处理结果。

**Checkpoint**：共享引擎已成为功能超集（FR-003 达成），Phase 3 可以开始切换 `q-editor` 依赖。

---

## Phase 3: User Story 1 - 编辑器用户功能零回退迁移 (Priority: P1) 🎯 MVP

**Goal**: 将 `app/q-editor` 的题型组件/编辑器 Store 依赖切换为消费 Phase 2 已补齐为功能超集的共享引擎，且切换后编辑器全部题型渲染、编辑面板、选项联动候选池提示、动态规则配置与撤销/重做行为与迁移前完全一致。

**Independent Test**: 对编辑器全部题型（选择类 5 种、输入类 1 种、备注类 1 种、高级类 6 种、矩阵类 1 种，共 14 种业务组件 + 计算字段伪题型）及动态规则配置面板逐一按迁移前基线回归比对，全部一致即通过。

### 依赖切换

- [x] T025 [US1] 将 `app/q-editor` 中所有引用本地 `@/stores/useEditor` 的调用点（含 `app/q-editor/src/components/Logic/*.vue`、`app/q-editor/src/views/online/SurveyView.vue`、`app/q-editor/src/views/EditorView/*.vue` 等）改为从 `monorepo-survey-engine` 导入 `useEditorStore`，并确认对 `getComByClientKey`/`ensureComClientKey`/`setComLogicByClientKey`/`findRuleReferencesTo`/`getDanglingReferencesFrom` 的调用签名与 Phase 2 回补后的共享包实现一致；暂不物理删除 `app/q-editor/src/stores/useEditor.ts` 本地文件（删除留给 Phase 4）。
- [x] T026 [US1] 将 `app/q-editor/src/utils/index.ts`、`app/q-editor/src/utils/aiToStatus.ts`、`app/q-editor/src/test-setup.ts`、`app/q-editor/src/views/online/__tests__/SurveyView.spec.ts`、`app/q-editor/src/utils/__tests__/aiToStatus.test.ts` 中的 `import { componentMap } from "@/configs/componentMap"` 改为 `import { componentMap } from "monorepo-survey-engine"`，切换题型组件注册表来源为共享包（对应 contracts/survey-engine-exports.md 第 5 节）；核对共享包 `componentMap.ts` 模块加载时的 `registerVue3Component` 副作用（组件工厂自动注册）与 `q-editor` 现有的 `component :is="com.type"` 渲染方式无冲突。
- [x] T027 [US1] 运行 `pnpm --filter q-editor exec vue-tsc --build` 与 `pnpm --filter q-editor test`，修复因 T025/T026 切换导入源产生的新增类型错误与测试失败（不包括 T001 基线记录中列为"与本次迁移无关"的既有缺陷），确认无新增失败项。

### 行为对等验证（User Story 1 Acceptance Scenarios）

- [x] T028 [US1] 按 quickstart.md 场景 1 验证选项联动候选池：打开含"单选题依赖另一题作答结果收窄候选池"配置的问卷，依赖题未作答时确认展示"需先完成依赖题"提示态，完成依赖题作答后确认候选池按结果正确收窄且候选项 DOM 下标/顺序与迁移前一致。
- [x] T029 [US1] 按 quickstart.md 场景 2 与 SC-004 准备并验证 3 份存量问卷（无 `client_key`、有 `client_key` 无规则、有 `client_key` 且含跳转/联动规则）：确认无 `client_key` 的问卷打开后自动惰性补齐且保存不产生破坏性变更，有规则的问卷跳转/显隐规则正确加载并可编辑、保存、发布。
- [x] T030 [US1] 按 quickstart.md 场景 3 验证规则引用查找：新增一道题目并为其配置引用其他题目 `client_key` 的动态规则，尝试删除被引用的题目，确认系统通过 `findRuleReferencesTo` 正确识别并提示所有引用方，不允许静默删除。
- [x] T031 [US1] 按 quickstart.md 场景 4 验证撤销/重做：对编辑器执行任意一组编辑操作（增删题、改规则、调顺序）后执行撤销/重做，确认状态回退/前进行为与迁移前完全一致。
- [x] T032 [US1] 对编辑器剩余全部题型（`Common/MaterialsHeader.vue` 及 T002 审计范围内的其余组件、`Materials/AdvancedComs/{Cascader,DateTime,RateScore,Slider,Transfer}.vue`、`Materials/ComputedComs/ComputedField.vue`、`Materials/InputComs/TextInput.vue`、`Materials/MatrixComs/MatrixSingle.vue`、`Materials/NoteComs/TextNote.vue`、`Materials/SelectComs/{MultiPicSelect,MultiSelect}.vue`）逐一手动回归渲染与编辑面板行为，确认与迁移前一致；将 T028-T032 的逐项通过/失败结论记录进新建文件 `specs/012-q-editor-engine-migration/verification-log.md`。

**Checkpoint**：User Story 1 独立可测试完成——`q-editor` 已消费共享引擎且行为零回退（MVP 达成）。

---

## Phase 4: User Story 2 - 共享引擎成为单一事实来源 (Priority: P2)

**Goal**: 移除 `q-editor` 本地与共享引擎重复的实现，验证后续对共享引擎的一次修改即可同时惠及两个消费方。

**Independent Test**: 检查 `q-editor` 本地目录不再存在重复实现文件；在共享引擎中做一次可观察的小幅调整，无需修改 `q-editor` 代码即可在其中生效。

- [x] T033 [US2] 确认 Phase 3 的依赖切换（T025-T027）已在生产渲染路径与全部测试中验证通过后，删除 `app/q-editor/src/stores/useEditor.ts` 及其测试 `app/q-editor/src/stores/__tests__/useEditor.test.ts`（方法与断言已在 Phase 2 的 T004-T009 迁移进共享包）。
- [x] T034 [US2] 删除 `app/q-editor/src/components/SurveyComs/` 目录下与 `packages/survey-engine/src/components/SurveyComs/` 重复的全部组件文件（T002 审计确认的 35 个同名文件，实际执行时校正为 37 个，详见 `divergence-log.md`），删除 `app/q-editor/src/configs/componentMap.ts`（已在 T026 中被 `monorepo-survey-engine` 导出的 `componentMap` 替代）。同时删除 `app/q-editor/src/configs/defaultStatus/` 整个目录（17 个文件）——该目录未被原始任务描述提及，但技术上必须与 `SurveyComs/` 一并删除，详见 `divergence-log.md` 补充记录。
- [x] T035 [US2] 运行 `pnpm --filter q-editor exec vue-tsc --build` 与 `pnpm --filter q-editor test`，确认删除本地文件后无残留的死引用/类型错误，且 T028-T032 的验证场景重新走一遍仍全部通过（对应 SC-002：重复实现数量为零）。
- [x] T036 [US2] 验证 SC-003"单一修改点覆盖全部消费方"：在 `packages/survey-engine` 的任一题型组件中做一次可观察的小幅调整（如修改某个提示文案的展示条件），不修改 `app/q-editor` 本地代码，确认调整效果在 `q-editor` 中同步生效；验证完成后撤销该调整（此步骤仅为验证，不作为正式功能改动提交）。将结论记录进 `specs/012-q-editor-engine-migration/verification-log.md`。

**Checkpoint**：User Story 1、2 均已独立验证通过——重复代码清零，单一修改点生效。

---

## Phase 5: User Story 3 - 迁移风险可验证、可回退 (Priority: P3)

**Goal**: 提供可追溯、无歧义的迁移前后行为对照验证清单，覆盖双运行模式与 FR-010 高风险分歧点，供评审者独立完成验收。

**Independent Test**: 评审者按验证清单逐项核对，每一项均有明确通过/失败结论，不存在"无法判断"的模糊项。

- [x] T037 [US3] 按 quickstart.md「FR-010 高风险分歧点」验证场景，汇总 T019/T021/T023 的 Vitest 用例执行结果 + 人工二次确认结论（Signature 上传两条路径、PicItem 响应体解析、SinglePicSelect 答案发射），写入 `specs/012-q-editor-engine-migration/verification-log.md`。
- [x] T038 [US3] 按 quickstart.md「双运行模式」验证场景，在 `q-editor` 独立开发服务器模式下完整走一次"新建问卷 → 编辑题目 → 保存"流程（`pnpm --filter q-editor dev`），确认无 qiankun 相关报错；记录结论（对应 FR-007、SC-005）。
- [x] T039 [US3] 按 quickstart.md「双运行模式」验证场景，通过 `main-app` 以 qiankun 子应用方式加载 `q-editor` 并重复上述编辑流程，确认 `bootstrap`/`mount`/`unmount`/`update` 生命周期正常、`routerBase` 路由前缀正确生效、功能与独立模式一致；记录结论（对应 FR-007、SC-005）。
- [x] T040 [US3] 汇总 `specs/012-q-editor-engine-migration/divergence-log.md`（T002 审计产出）中记录的全部分歧点处理结果，对仍标记为"待人工决议"的事项，整理决议所需的上下文供人工决策，不允许保留状态不明的分歧项（对应 FR-009）；确认 `verification-log.md` 中 T028-T039 的每一项结论均为明确的"通过/失败"，不存在模糊结论（对应 User Story 3 Acceptance Scenario 1、FR-006）。

**Checkpoint**：全部用户故事验证完成，验证结论可追溯、无歧义。

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: 覆盖 plan.md Constitution Check 中"附带门禁"事项的收尾核对，不属于任一用户故事但影响交付质量。

- [x] T041 运行 `pnpm --filter q-editor build`，将产物 `app/q-editor/dist/assets/js/` 目录下各 chunk 文件名与体积同 `baseline.md`（T001 记录的迁移前基线）逐一比对：核对 `app/q-editor/vite.config.ts` 第 183-232 行的 `manualChunks` 分包规则——**注意 `getPackageName`（第 23-29 行）仅在模块路径包含 `/node_modules/` 时才返回包名，而 `monorepo-survey-engine` 是 pnpm workspace 包（`workspace:*`），Vite 默认 `preserveSymlinks: false` 会将其解析到 `packages/survey-engine/src/...` 真实路径而非 `node_modules` 路径，`pkgName === "monorepo-survey-engine"` 这类判断永远不会命中，若需新增独立 chunk 必须在 `manualChunks(id)` 内改用路径匹配（如 `id.replace(/\\/g, "/").includes("/packages/survey-engine/")`），不得复用 `getPackageName` 的 node_modules 匹配逻辑**；若 `monorepo-survey-engine` 相关模块体积并入某个 chunk 后，该 chunk 相对基线增幅超过 20%，或该包代码被拆散进多个业务 chunk 而非集中（边界劣化，对应 Constitution Principle X），则视为不达标，需在 `manualChunks(id)` 中按上述路径匹配方式新增 `if (normalized.includes("/packages/survey-engine/")) return "survey-engine";` 分支（需置于 `getPackageName` 调用之前）并重新构建验证；若增幅未超过阈值且边界未被打散，记录"符合预期，无需调整"即可，不允许仅凭主观判断决定是否新增分支。
- [x] T042 对 Phase 2-4 中改动/新增的共享引擎文件运行项目根 Prettier/ESLint 格式化，统一为 LF 行尾（`packages/survey-engine` 现存文件为 CRLF，本次触碰到的文件需统一为项目期望格式，避免 Husky pre-commit → lint-staged 产生与迁移无关的格式噪音，对应 Constitution Principle VII）。
- [x] T043 运行完整回归：`pnpm --filter monorepo-survey-engine test`、`pnpm --filter q-editor test`、两包 `vue-tsc --build`、`pnpm --filter monorepo-survey-engine exec eslint .`、`pnpm --filter q-editor exec eslint .`，对照 T001 基线确认零新增失败/警告，将最终结果补记入 `specs/012-q-editor-engine-migration/verification-log.md` 作为交付前最终确认。

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**：无依赖，可立即开始。
- **Foundational (Phase 2)**：依赖 Setup 完成（需要基线记录先行）；**阻塞**全部用户故事（FR-003 强制要求先补齐能力再切换依赖）。
- **User Story 1 (Phase 3)**：依赖 Foundational 完成；是本次迁移的 MVP，其他用户故事均在其基础上推进。
- **User Story 2 (Phase 4)**：依赖 User Story 1 完成（必须先切换依赖，才能安全删除本地重复代码，否则会造成能力空窗期，违反 FR-003）。
- **User Story 3 (Phase 5)**：依赖 User Story 1、2 均完成（验证清单需要覆盖迁移终态，包括重复代码清零后的状态）。
- **Polish (Phase 6)**：依赖所有用户故事完成。

### 任务内部依赖要点

- Phase 2.1（T003-T009）全部读写同一文件 `packages/survey-engine/src/stores/useEditor.ts`（除 T009 测试文件外），须按 T003→T008 顺序执行，不可并行。
- Phase 2.3（T014-T019）中 T014（server.ts 拦截器）是 T015（upload.ts 类型修正）与 T020（PicItem.vue 解析方式修正）的前置依赖，必须先完成 T014。
- Phase 2.2/2.4/2.5 中标记 [P] 的任务分别位于不同组件文件，可与同阶段其他 [P] 任务并行。
- T025/T026/T027 存在顺序依赖（先切换导入源，再统一验证类型与测试），不可并行。
- T033（删除本地 Store）必须晚于 T025（依赖切换到共享包 Store）确认通过之后。

### Parallel Opportunities

- Phase 2.1 完成后，T009（Store 方法测试）可与 Phase 2.2/2.3/2.4/2.5 的组件级改造并行开展（不同文件）。
- Phase 2.2、2.4、2.5 三组分歧点回补（SingleSelect/OptionSelect、PicItem、SinglePicSelect）彼此文件互不重叠，可完全并行；Phase 2.3（Signature）因涉及 `api/upload.ts`、`api/clients/server.ts`、`index.ts` 三个共享文件，建议单独串行处理后再与其他组并行的测试任务汇合。
- Phase 5（US3）的 T037-T039 三项验证互不依赖，可并行执行。

---

## Parallel Example: Phase 2 Foundational

```bash
# T003-T009 完成后（client_key Store 方法回补完毕），以下可并行：
Task: "补齐 SingleSelect.vue optionPool 接线"      # T010
Task: "补齐 OptionSelect.vue optionPool 接线"       # T011
Task: "补齐 PicItem.vue 响应体解析（依赖 T014 先完成）" # T020（注意前置依赖）
Task: "补齐 SinglePicSelect.vue 答案发射"           # T022

# 各自的测试任务同样可并行：
Task: "新建 SingleSelect.spec.ts"    # T012
Task: "新建 OptionSelect.spec.ts"    # T013
Task: "新建 PicItem.spec.ts"         # T021
Task: "新建 SinglePicSelect.spec.ts" # T023
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. 完成 Phase 1：Setup（基线记录）
2. 完成 Phase 2：Foundational（**关键阻塞项**——共享引擎补齐为功能超集）
3. 完成 Phase 3：User Story 1（依赖切换 + 行为对等验证）
4. **停止并验证**：独立测试 User Story 1（`q-editor` 消费共享引擎且零功能回退）
5. 若时间/资源有限，可在此停止交付——MVP 已满足"无缝迁移"的核心承诺

### Incremental Delivery

1. Setup + Foundational 完成 → 共享引擎具备功能超集
2. 加入 User Story 1 → 独立验证 → MVP 达成（`q-editor` 零回退消费共享引擎）
3. 加入 User Story 2 → 独立验证 → 本地重复代码清零
4. 加入 User Story 3 → 独立验证 → 验证清单可追溯、双运行模式确认
5. Polish 收尾 → 交付

---

## Notes

- [P] 任务 = 不同文件、无依赖关系
- [Story] 标签将任务映射到具体用户故事，便于追溯
- 每个用户故事均可独立完成并测试
- Phase 2（Foundational）是本次迁移特有的强制阻塞阶段，对应 FR-003"不允许能力空窗期"，不同于常规项目中"基础设施搭建"的含义，此处特指"消费方切换依赖前，被依赖方必须先成为功能超集"
- T002 的全量差异审计可能发现 FR-010 未列出的新分歧点；发现后须先在 Phase 2 中补充对应的回补任务（遵循 T010-T023 的任务模式：实现改动 + 附带 Vitest 用例），再进入 Phase 3，不得跳过
- 避免：模糊任务、同文件冲突、破坏用户故事独立性的跨故事依赖（本次迁移中 US2 依赖 US1、US3 依赖 US1+US2 是迁移性质决定的必要顺序依赖，已在 Dependencies 节明确说明原因）
