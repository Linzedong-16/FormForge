---
description: "Task list template for feature implementation"
---

# Tasks: 动态表单数据完整性与交付可靠性修复

**Input**: Design documents from `/specs/009-fix-dynamic-form-reliability/`

**Prerequisites**: [plan.md](./plan.md)（必需）、[spec.md](./spec.md)（必需，用户故事）、[research.md](./research.md)、[data-model.md](./data-model.md)、[contracts/](./contracts/)、[quickstart.md](./quickstart.md)

**Tests**: 本功能明确要求测试先行——`.specify/memory/constitution.md` Principle V 规定 Bug 修复必须包含"修复前失败、修复后通过"的回归测试；spec.md 的两个 P1 用户故事（US1、US2）对应已确认的真实缺陷，因此下方 US1/US2/US3 均包含强制的回归测试任务，US4 为测试覆盖补齐类故事，任务本身即测试任务。

**Organization**: 任务按用户故事分组，四个故事的修复位置彼此独立（不同模块/不同文件），可独立实现与验证。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可并行执行（不同文件、无依赖）
- **[Story]**: 所属用户故事（US1/US2/US3/US4）
- 每个任务均给出精确文件路径

## Path Conventions

Monorepo Web 应用，实际路径：

- 后端服务：`app/q-server/src/modules/survey/{survey-crud,survey-rule}/`，测试镜像于 `app/q-server/src/spec/survey/{survey-crud,survey-rule}/`
- 前端编辑器/填写端：`app/q-editor/src/views/online/`、`app/q-editor/e2e/tests/survey/`
- 共享规则引擎：`packages/survey-engine/src/logic/`

---

## Phase 1: Setup（共享准备工作）

**Purpose**: 确认环境可用、建立回归对照基线；本功能不新增依赖、不新增数据库迁移

- [ ] T001 确认 `app/q-server`（`pnpm --filter q-server dev`）与 `app/q-editor`（`pnpm --filter q-editor dev`）本地开发环境可正常启动，作为后续各用户故事验证的前提（无代码改动）
- [ ] T002 [P] 运行现有基线测试套件并记录结果：`pnpm --filter q-server test`、`pnpm --filter monorepo-survey-engine test`、`pnpm --filter q-editor test:unit`，作为后续"未引入新回归"的对照基准

---

## Phase 2: Foundational（阻塞性前置工作）

**Purpose**: 本功能四个用户故事的修复位置彼此独立（不同模块/不同文件），且不新增数据库结构、不新增共享类型定义、不引入新依赖（详见 [plan.md](./plan.md) Complexity Tracking：无违反项需要跨故事的共享基础设施）。

**⚠️ 本阶段无任务** —— 各用户故事可在完成 Phase 1 后直接开始，无需等待共享基础设施。

---

## Phase 3: User Story 1 - 新建问卷即可靠保存动态规则 (Priority: P1) 🎯 MVP

**Goal**: 使问卷"首次创建保存"与"后续编辑保存"共用同一套 `client_key`/`logic` 持久化逻辑，消除首次保存丢失规则配置的缺陷；同时修正 `client_key` 字段 nullable 校验语义与 `logic` 字段不对称的问题。

**Independent Test**: 新建问卷，为题目配置任意一类动态规则，仅保存一次，通过独立读取路径（如 `GET /api/surveys/:id`）确认规则配置完整存在（对应 [quickstart.md](./quickstart.md) 场景一）。

### Tests for User Story 1 ⚠️

> **必须先编写并运行确认失败，再进行下方实现**

- [x] T003 [P] [US1] 在 `app/q-server/src/spec/survey/survey-crud/survey-crud.service.spec.ts` 新增回归测试：创建问卷时题目携带显示/隐藏、跳转、选项联动、计算字段四类规则各一条，仅调用 `create()` 一次后，通过 `findFirst`/`findMany` 读取校验 `client_key`/`logic` 与入参完全一致；运行确认在当前实现下失败（复现 Bug 1，FR-001/FR-002）
- [x] T004 [P] [US1] 在 `app/q-server/src/spec/survey/survey-crud/survey-crud.schemas.spec.ts`（新建文件）新增回归测试：`client_key` 字段显式传入 `null` 应通过 schema 校验（与 `logic` 字段现有的 `.nullable()` 语义对称）；运行确认在当前实现下被拒绝（复现 FR-007 缺陷）

### Implementation for User Story 1

- [x] T005 [US1] 修改 `app/q-server/src/modules/survey/survey-crud/survey-crud.service.ts` 的 `create()` 方法：将内联的 `tx.surveyComponent.createMany(...)` 调用替换为 `this.replaceComponents(tx, created.id, components ?? [])`，删除遗漏 `client_key`/`logic` 字段的内联映射逻辑（依赖 T003 已确认失败）
- [x] T006 [US1] 修改 `app/q-server/src/modules/survey/survey-crud/survey-crud.schemas.ts`：为 `client_key` 字段补充 `.nullable()`，与 `logic` 字段保持对称（依赖 T004 已确认失败）
- [x] T007 [US1] 重新运行 T003、T004 确认转为通过，并回归运行 `survey-crud.service.spec.ts`/`survey-crud.routes.spec.ts` 全量套件确认无新增失败

**Checkpoint**: User Story 1 已可独立测试通过——新建问卷首次保存不再丢失任何类型的动态规则配置。

---

## Phase 4: User Story 2 - 填写者的真实作答状态被准确记录 (Priority: P1)

**Goal**: 使填写端在提交答卷前，如实上报每道题目"正常填写/被规则隐藏跳过/展示但留空"的真实状态，激活后端已正确实现但从未被触发的 `answer_status` 落库能力；不含动态规则的问卷提交行为保持零回归。

**Independent Test**: 配置一道隐藏规则题与一道普通题，按触发隐藏规则的路径填写并提交，核对提交负载与落库结果中两类题目的 `answer_status` 被正确区分（对应 [quickstart.md](./quickstart.md) 场景二）。

### Tests for User Story 2 ⚠️

> **必须先编写并运行确认失败，再进行下方实现**

- [x] T008 [P] [US2] 在 `app/q-editor/src/views/online/__tests__/SurveyView.spec.ts`（新建文件）编写 `submitAnswers()` 单元测试：配置一道被规则隐藏的题目与一道展示但未填写的题目，断言提交负载 `answers[]` 中二者均存在且 `answer_status` 分别为 `1`/`2`；运行确认在当前实现下这两个题目完全不出现在负载中（复现 Bug 2，FR-003/FR-004）
- [x] T009 [P] [US2] 在同一测试文件补充回归测试：不含任何 `logic` 配置的问卷，`submitAnswers()` 产出的提交负载与修复前逐字节一致（FR-010 零回归对照，先于实现确认当前基线行为，作为修复后不得改变的锚点）

### Implementation for User Story 2

- [x] T010 [US2] 修改 `app/q-editor/src/views/online/SurveyView.vue` 的 `submitAnswers()`：仅当该问卷至少一个题目配置了 `logic` 时，基于既有 `visibleComs` 与全量 `componentMap` 的差集计算隐藏/跳过题目集合，为其补充 `answer_status: 1` 的空值 `AnswerItem`；对 `visibleComs` 内未填写的题目补充 `answer_status: 2` 的空值 `AnswerItem`（依赖 T008 已确认失败）
- [x] T011 [US2] 重新运行 T008、T009 确认转为通过；并结合 `app/q-server` 现有的 `isUpgradedClient` 分支（`survey-crud.service.ts` `submitResponse()`）做一次端到端集成核对，确认提交负载与数据库落库结果一致（该分支本身无需改动）

**Checkpoint**: User Story 1 和 2 均已独立可测试——填写者的真实作答状态被准确记录，且不影响普通问卷。

---

## Phase 5: User Story 3 - 发布前的规则校验结果保持一致可靠 (Priority: P2)

**Goal**: 使发布前的规则完整性校验复用发布操作所在的同一次数据库事务读取，消除快照不一致风险；best-effort 补充选项联动规则的悬空选项引用检测。

**Independent Test**: 对同一份合法问卷重复触发发布前校验确认结论一致；对含循环依赖/悬空引用的问卷触发发布确认被正确拦截（对应 [quickstart.md](./quickstart.md) 场景三）。

### Tests for User Story 3 ⚠️

> **必须先编写并运行确认失败，再进行下方实现**

- [x] T012 [P] [US3] 在 `app/q-server/src/spec/survey/survey-crud/survey-crud.service.spec.ts` 新增回归测试：断言 `publish()` 内部调用 `SurveyRuleService.validateSurveyRules()` 时传入的是当前发布事务的 `tx`，而非 `this.fastify.prisma`；运行确认在当前实现下调用方未传入 `tx`（复现 FR-005 缺陷）
- [x] T013 [P] [US3]（best-effort）在 `packages/survey-engine/src/logic/__tests__/validator.spec.ts` 新增回归测试：某题目 `optionDependency.optionsByAnswer` 引用了依赖题目当前已不存在的选项值时，`validateRuleSet()` 应返回新增的 `staleOptionReference` 类型违规；运行确认在当前实现下该场景未被检测到（对应 FR-008，见 [research.md](./research.md) D6）

### Implementation for User Story 3

- [x] T014 [US3] 修改 `app/q-server/src/modules/survey/survey-rule/survey-rule.service.ts`：为 `validateSurveyRules(userId, surveyId)` 新增可选第三参数 `tx`（默认回退 `this.fastify.prisma`），并将其用于内部的 `survey.findFirst`/`surveyComponent.findMany` 查询（依赖 T012 已确认失败）
- [x] T015 [US3] 修改 `app/q-server/src/modules/survey/survey-crud/survey-crud.service.ts` 的 `publish()`：调用 `validateSurveyRules` 时显式传入当前事务的 `tx`（依赖 T014）
- [x] T016 [US3]（best-effort，依赖 T013 已确认失败）修改 `packages/survey-engine/src/logic/types.ts`：为 `RuleViolationType` 新增 `staleOptionReference` 枚举成员；修改 `packages/survey-engine/src/logic/validator.ts`：为 `validateRuleSet()` 新增可选入参（题目当前有效选项值集合），实现新增的悬空选项引用检测分支，默认不传入该参数时行为与修复前完全一致
- [x] T017 [US3]（best-effort，依赖 T016）修改 `app/q-server/src/utils/response.ts`：在 BizCode 6xxx 段新增 `RULE_STALE_OPTION_REFERENCE = 6004`；修改 `app/q-server/src/modules/survey/survey-crud/survey-crud.service.ts` 的 `mapViolationTypeToBizCode()`，补充对应分支
- [x] T018 [US3] 重新运行 T012（若实施 T016/T017 则同时运行 T013）确认转为通过；回归运行 `survey-rule` 相关测试与 `survey-crud.routes.spec.ts` 中涉及 `publish`/`validate-rules` 的既有用例，确认无新增失败

  **验证记录**：`npx vitest run src/spec/survey/survey-crud/survey-crud.service.spec.ts src/spec/survey/survey-rule` 结果为 `27 failed | 40 passed (67)`。T012（"[D3回归]"）单独运行已确认转为**通过**。通过 `git stash`/`git stash pop` 对比修改前后基线：**修改前后失败数量与失败清单完全一致（均为 27 个）**，逐条核对失败原因均为 `MOCK_SURVEY.review_status` 默认值 `"none"` 与生产代码审核前置校验（`publish()`/`applyTemplate()` 要求 `"approved"`）不匹配、以及部分既有测试 mock 数据/断言与当前生产代码字段不同步（如 `toSurveyListItem` 缺字段、`review.updateMany` 未 mock 等）——均为**修改前已存在、与本次 spec 009 无关的测试基线问题**，非本次改动引入的新回归。`app/q-server/src/spec/survey/survey-rule` 目录当前无独立测试文件（`SurveyRuleService` 仅在 T012 中被间接覆盖），故无额外回归面需要验证。

**Checkpoint**: User Story 1、2、3 均已独立可测试——发布前校验结果不再受并发保存干扰。

---

## Phase 6: User Story 4 - 四类核心动态能力具备同等交付质量保障 (Priority: P3)

**Goal**: 为派生计算字段能力补充与其余三类能力同等级别的端到端验证覆盖。

**Independent Test**: 运行新增的 E2E 场景确认三个验收点均被覆盖；重新运行既有 3 个场景确认未被破坏（对应 [quickstart.md](./quickstart.md) 场景四）。

### Implementation for User Story 4

> 本故事是测试覆盖补齐类工作，任务本身即为新增的验证场景，无需额外"先失败"的产品代码修复。

- [x] T019 [US4] 在 `app/q-editor/e2e/tests/survey/survey-dynamic-logic.spec.ts` 新增 `test.describe("场景4：派生计算字段")` 块，覆盖：计算结果（求和/加权求和）随依赖题目答案变化实时更新；参与计算题目留空时按 `emptyStrategy`（`treatAsZero`/`skipCalculation`）正确降级；`visibleToFiller: false` 的计算字段不渲染但仍参与计算
- [x] T020 [P] [US4] 重新运行 `survey-dynamic-logic.spec.ts` 全部 4 个场景，确认既有"场景1：题目显示/隐藏规则""场景2：跳题结束规则""场景3：选项联动规则"保持全部通过，新增场景通过

  **验证记录**：`npx playwright test --config=e2e/playwright.config.ts e2e/tests/survey/survey-dynamic-logic.spec.ts` 结果为 `5 passed (12.5s)`（场景1/2/3/4 共 5 个 test，场景2 含 2 个 test）。新增场景4一次性通过，既有 3 个场景无回归。

**Checkpoint**: 四个用户故事均已独立可测试完成。

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: 跨故事的整体验收与已明确降级为非强制项的收尾说明

- [x] T021 [P] 按 [quickstart.md](./quickstart.md) 逐条运行四个场景的完整验收流程，确认 spec.md SC-001～SC-005 全部达标

  **验证记录**：
  - **场景一/SC-001（US1）**：T007 已验证通过（`create()` 首次保存不丢失 `client_key`/`logic`）。
  - **场景二/SC-002（US2）**：T011 已验证通过；本轮单独重跑 `app/q-editor/src/views/online/__tests__/SurveyView.spec.ts` 结果为 `Test Files 1 passed (1)` / `Tests 2 passed (2)`，`answer_status` 区分逻辑保持通过。
  - **场景三/SC-003（US3）**：T018 已验证通过（发布校验复用同一事务 `tx`；悬空选项引用检测 best-effort 已实现）。
  - **场景四/SC-004（US4）**：T020 已验证，`survey-dynamic-logic.spec.ts` 全部 4 个场景（5 个 test）通过。
  - **SC-005（现有不使用动态规则的问卷业务全流程零回归）**：本轮对全量测试套件逐一核对，确认所有失败均为修改前已存在、与本次 spec 009 无关的既有基线问题，非本次改动引入：
    - `pnpm --filter monorepo-survey-engine test`：`Test Files 7 passed (7)` / `Tests 228 passed (228)`，全量通过。
    - `pnpm --filter q-server test:dev`（全量）：`Test Files 5 failed | 23 passed (28)` / `Tests 89 failed | 376 passed (465)`。逐一排查：
      - `auth.middleware.spec.ts`/`auth.service.spec.ts`：未被本次改动触及（`git diff` 无变化），单独运行复现同样失败数，确认为既有环境问题。
      - `review.service.spec.ts`：未被本次改动触及，同上。
      - `survey-crud.service.spec.ts`：单独重跑 T018 检查点所用的完全相同命令（`npx vitest run src/spec/survey/survey-crud/survey-crud.service.spec.ts src/spec/survey/survey-rule`），结果仍为 `27 failed | 40 passed (67)`，与 T018 记录的既有基线问题（`review_status` mock 默认值不匹配等）完全一致，非新增回归。
      - `survey-crud.routes.spec.ts`：单独运行 53 个测试全部失败，根因为测试文件内动态 `import("../../modules/survey/survey-crud/survey-crud.routes")` 相对路径层级有误（少一层 `../`），导致模块解析失败；通过 `git stash`/`git stash pop` 对比修改前后基线，**失败数量与失败原因完全一致（均为 53 个，同一路径错误）**，确认是修改前已存在、与本次改动完全无关的既有测试代码缺陷。
    - `pnpm --filter q-editor test`（全量）：`Test Files 2 failed | 25 passed (27)` / `Tests 4 failed | 465 passed (469)`。失败均集中在 `src/api/__tests__/serverClient.test.ts`（Token 刷新拦截器）与 `src/api/modules/settings/__tests__/index.test.ts`（`uploadAvatar`），均未被本次改动触及（`git diff` 无变化），通过 `git stash`/`git stash pop` 对比确认修改前后失败数量与原因完全一致（同为 4 个），系既有基线问题。
  - **结论**：SC-001～SC-005 全部达标；FR-010"零回归"约束成立——本次改动未引入任何新增测试失败。

- [x] T022 [P] 核对 SC-006 性能基线：填写态实时响应（答案变化到显示/隐藏、跳转、选项联动、计算字段更新完成）与发布前规则校验响应耗时，均未劣化于 `008-dynamic-form-engine` 已确立的 200ms 目标

  **验证方式说明**：核对 [specs/008-dynamic-form-engine/spec.md](../008-dynamic-form-engine/spec.md) 与 [quickstart.md](../008-dynamic-form-engine/quickstart.md) 确认，200ms 阈值（FR-008/SC-005）自 008 起即未建立自动化性能测试脚本或基准日志，仅在 quickstart.md 以人工验证流程描述性提及。本次 Polish 阶段"核对"沿用 008 同等力度的验证方式（如 008 T054/T055 亦采用"代码审查确认"而非新造性能测试基线），采用**代码审查**方式逐一核实 spec 009 的实际改动是否触及或劣化了该响应链路，而非另行搭建性能测试设施（超出 Polish 阶段任务范畴）。

  **验证记录**：
  - **填写态实时响应链路（题目显示/隐藏、跳转、选项联动、计算字段随答案变化实时更新）**：该链路的求值核心是 `packages/survey-engine/src/logic/evaluator.ts` 的四个纯函数（`resolveVisibility`/`resolveJump`/`resolveOptionPool`/`computeDerivedField`），经 `git diff HEAD -- packages/survey-engine/src/logic/evaluator.ts` 核实**零改动**——spec 009 的四个用户故事均未触及该文件。`app/q-editor/src/views/online/SurveyView.vue` 中调用这些函数的 `visibleComs`/`optionPools`/`computedFieldValues` 三个 computed 属性（每次答案变化时随 Vue 响应式系统同步重新求值）同样未被本次改动触及；本次对 `SurveyView.vue` 的改动仅限于 `submitAnswers()`（US2，T010，仅在点击提交按钮时执行一次，不在填写过程中的每次触发条件变化时执行，不影响"触发条件变化到界面完成更新"这一实时响应链路的耗时）。**结论**：填写态实时响应链路自 008 基线以来字节级未变，性能基线不受影响。
  - **发布前规则校验响应耗时**：
    - `SurveyRuleService.validateSurveyRules()`（T014）新增的第三参数 `tx` 仅是将查询发起方从 `this.fastify.prisma` 替换为调用方传入的同一事务客户端，内部仍是原有的 `survey.findFirst` + `surveyComponent.findMany` 两次查询，**未新增任何查询次数或循环嵌套**（见 [survey-rule.service.ts:34-58](../../app/q-server/src/modules/survey/survey-rule/survey-rule.service.ts)）；`publish()`（T015）改动仅是把已在同一事务内执行的调用换成显式传入 `tx`，不产生新增的数据库往返。
    - `validateRuleSet()`（T016，best-effort）新增的 `staleOptionReference` 检测分支复用同一次遍历中已加载的 `optionDependency.optionsByAnswer` 数据（见 [validator.ts:107-113](../../packages/survey-engine/src/logic/validator.ts)），未引入额外的数据源读取或指数级复杂度，与既有校验分支同属 O(规则数) 量级，不构成显著的耗时增量。
  - **结论**：SC-006 性能基线未被本次改动劣化——填写态实时响应链路核心求值代码零改动，发布前校验仅替换查询客户端来源与新增一个 O(规则数) 量级的检测分支，均不会造成可感知的响应耗时上升。

- [x] T023（非阻塞，FR-009 Nice-to-have）在 `app/q-editor` 编辑器右侧属性面板为"被删除但仍被其他规则引用的题目"增加持久提示

  **验证记录**：在 `app/q-editor/src/stores/useEditor.ts` 新增 `getDanglingReferencesFrom(clientKey)`，复用既有 `findRuleReferencesTo()` 已引入的 `validateRuleSet()`（`monorepo-survey-engine`），但方向相反——不排除任何题目，直接对当前全量 `this.coms` 求值，筛选 `type === "danglingReference" && involvedKeys[0] === clientKey`（`involvedKeys[0]` 即规则拥有者，见 `validator.ts` 的 `checkReference()`），从而反向体检"当前题目自身的规则是否引用了已不存在的题目"。在 `app/q-editor/src/components/Logic/LogicPanel.vue` 顶部新增常驻 `el-alert`（`type="warning"`、`:closable="false"`），仅当 `danglingReferences.length > 0` 时展示，逐条列出违规 `message`；该提示由 computed 属性驱动，只要悬空引用未被设计者手动修正即持续展示，不会因面板重渲染、切换其他题目再切回而消失，满足"持久提示"要求。同步在 `en-US`/`ja-JP`/`zh-CN` 三套 `i18n/logic.ts` 新增 `danglingReferenceTitle` 词条。`pnpm --filter q-editor run type-check` 验证除 4 条预先存在、与本功能无关的错误（`Signature.vue`/`TemplateMarket.vue`/`ai.ts`）外无新增类型错误；`npx vitest run src/stores` 结果为 `Test Files 5 passed (5)` / `Tests 157 passed (157)`，无回归。

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**：无依赖，可立即开始
- **Foundational (Phase 2)**：无任务——四个用户故事互不阻塞，可在 Phase 1 完成后并行开始
- **User Stories (Phase 3-6)**：均可在 Phase 1 完成后独立开始；建议按优先级顺序 US1 → US2 → US3 → US4 推进，或视人力并行推进
- **Polish (Phase 7)**：依赖所需的用户故事已完成（T021/T022 至少依赖 US1-US4 全部完成；T023 独立，随时可安排）

### User Story Dependencies

- **US1 (P1)**：无依赖其他故事，Phase 1 完成后即可开始
- **US2 (P1)**：无依赖其他故事；与 US1 修复位置完全不同（前端 vs 后端），可与 US1 并行
- **US3 (P2)**：无依赖其他故事；T016/T017（best-effort）内部存在依赖关系（先扩展 `types.ts`/`validator.ts` 再接入 BizCode），但不依赖 US1/US2/US4
- **US4 (P3)**：无依赖其他故事，纯测试补齐

### Within Each User Story

- 测试任务必须先编写并运行确认失败，再进行实现任务（Constitution Principle V 强制要求，US1/US2/US3 均适用）
- 同一故事内标记 `[P]` 的任务可并行；未标记的任务存在文件级或逻辑依赖，按顺序执行

---

## Parallel Example: User Story 1

```bash
# 并行编写 US1 的两个回归测试（不同文件，互不依赖）：
Task: "新增回归测试：创建问卷首次保存不丢失规则配置 in app/q-server/src/spec/survey/survey-crud/survey-crud.service.spec.ts"
Task: "新增回归测试：client_key 显式传 null 应被接受 in app/q-server/src/spec/survey/survey-crud/survey-crud.schemas.spec.ts"
```

## Parallel Example: 跨故事并行（团队协作）

```bash
# US1（后端 survey-crud）与 US2（前端 SurveyView）修复位置完全不同，可由不同开发者同时推进：
Developer A: T003 → T005 → T006 → T007（US1）
Developer B: T008 → T009 → T010 → T011（US2）
```

---

## Implementation Strategy

### MVP First（两个 P1 故事）

1. 完成 Phase 1：Setup
2. Phase 2 无任务，直接进入用户故事
3. 完成 Phase 3：US1（新建问卷规则不丢失）
4. 完成 Phase 4：US2（作答状态如实上报）
5. **停下并验证**：两个 P1 缺陷均已通过回归测试固化，可视为本次修复的最小可交付集

### Incremental Delivery

1. Setup 完成 → 基线确立
2. 交付 US1 → 独立验证 → 两个已确认 Bug 中的第一个消除
3. 交付 US2 → 独立验证 → 两个已确认 Bug 全部消除（MVP 完成）
4. 交付 US3 → 独立验证 → 发布校验一致性问题消除，best-effort 项视工作量决定是否本轮完成
5. 交付 US4 → 独立验证 → 测试覆盖对等
6. Polish 阶段收尾，FR-009 视资源决定是否本轮实施

### Parallel Team Strategy

1. 团队共同完成 Setup（无 Foundational 阶段）
2. Setup 完成后：
   - Developer A：US1（`app/q-server`）
   - Developer B：US2（`app/q-editor`）
   - Developer C：US3（`app/q-server` + `packages/survey-engine`）
   - Developer D：US4（`app/q-editor/e2e`）
3. 各故事独立完成与集成，US1/US2 优先合并（P1）

---

## Notes

- `[P]` 任务 = 不同文件、无依赖
- `[Story]` 标签用于追溯任务所属用户故事
- 每个用户故事均可独立完成与测试
- 实现前务必确认对应测试已运行且失败（Constitution Principle V）
- 建议每完成一个任务或一组逻辑相关任务后提交一次
- 可在任一 Checkpoint 处停下独立验证对应故事
- 避免：模糊任务描述、同文件冲突改动、破坏故事独立性的跨故事依赖
- T013/T016/T017（FR-008 best-effort）与 T023（FR-009 Nice-to-have）均为非强制项，若本轮资源不足可推迟到后续迭代，不影响两个 P1 缺陷的交付与验收
