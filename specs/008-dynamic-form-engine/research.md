# Phase 0 研究：低代码问卷动态表单引擎

**输入**：[spec.md](./spec.md) · **对齐**：[.specify/memory/constitution.md](../../.specify/memory/constitution.md)

本文档解决 `plan.md` Technical Context 中的全部未知项，并对四个存在多种可行方案的关键架构决策给出结论、理由与被否决的替代方案。所有决策均基于对代码库现状的直接研究（见下文各节引用的具体文件路径），而非假设。

---

## 1. 核心架构决策：规则引擎归属与 q-editor 的依赖关系

### 背景（现状事实）

- `packages/survey-engine`（包名 `monorepo-survey-engine`）是仓库里唯一名义上的"低代码核心"，但目前**只被 `app/frontend` 消费**，且仅用于一个只读审核页 `app/frontend/src/views/survey-preview/detail/SurveyPreviewDetail.vue`。
- 真正的问卷编辑器与**唯一的公开填写页**（`app/q-editor/src/views/online/SurveyView.vue`）都在 `app/q-editor` 中，而 `app/q-editor/package.json` **并未依赖** `monorepo-survey-engine`——其 `src/{types,stores,utils,components,configs,db}` 是独立分叉出来的一套平行实现（题目类型枚举、`Status`/`*Props` 类型、`useEditorStore`、序列化工具等均自成一套，与 `packages/survey-engine` 已产生结构性差异）。
- 用户原始需求明确要求"动态表单前端应该从低代码核心部分设计"，但动态表单的**填写体验唯一发生在 q-editor**，这与"核心只被 frontend 消费"的现状直接冲突。

### Decision

**在 `packages/survey-engine` 内新增一个与 Vue 渲染层解耦的纯逻辑子模块（`src/logic/`），作为本功能全部动态规则类型与求值算法的唯一权威来源（"低代码核心"落地为这个子模块）；`app/q-editor` 新增对 `monorepo-survey-engine` 的工作区依赖，但仅导入 `src/logic/` 子模块（类型 + 纯函数 + 一个薄 Vue composable），不迁移、不复用其现有的 `Status`/组件/`store` 体系。**

具体分工：

| 层                                                                                                                     | 归属                                                                                  | 内容                                                                                                                                                                       |
| ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 规则类型系统（`LogicRule`/`ConditionGroup`/`ComputedFieldConfig`/`OptionDependencyMapping`/`RuleValidationResult` 等） | `packages/survey-engine/src/logic/types.ts`                                           | 纯 TypeScript 类型，`strict: true`，无框架依赖                                                                                                                             |
| 求值算法（可见性判定/跳转解析/选项联动/派生计算/答案值规范化/循环依赖与引用校验）                                      | `packages/survey-engine/src/logic/evaluator.ts`、`validator.ts`                       | 纯函数，输入输出均为 plain data，不依赖 Vue/Pinia，可在 q-server（Node）与 q-editor（浏览器）两侧复用同一份实现（发布时校验在 q-server 侧也需要跑一遍相同算法，见第 7 节） |
| Vue 集成                                                                                                               | `packages/survey-engine/src/logic/useRuleRuntime.ts`                                  | 薄 composable：`computed` 包装求值函数，供 q-editor 的填写页直接消费                                                                                                       |
| 题目类型/组件/store/编辑器 UI                                                                                          | 仍各自维护（`packages/survey-engine` 的既有部分与 `app/q-editor` 的本地分叉互不影响） | 不做迁移                                                                                                                                                                   |

### Rationale

1. **满足用户显式要求**：新的规则类型与求值逻辑确实"从低代码核心部分设计"并对外导出，`app/q-editor` 作为消费方引入，符合"核心→消费"的方向。
2. **符合 Constitution Principle I**（"任何被两个以上包使用的类型/工具函数 MUST 提取到 `packages/*`"）：本功能的规则类型天然会被 `q-editor`（编辑与填写）和 `q-server`（发布校验）两侧共用，必须提取到共享包；`packages/survey-engine` 已经是"问卷相关共享逻辑"的既定归属包，比新建一个包或塞进 `packages/common` 更贴合领域边界。
3. **控制爆炸半径**：q-editor 的现有 `Status`/组件体系已经稳定运行在生产问卷上，将其整体迁移到 `packages/survey-engine` 是一次高风险、大范围的重构，且不是本功能的目标（spec 明确要求"保证目前的功能实现不能出问题，不引入新的问题"）。仅引入无副作用的纯逻辑子模块，不触碰 q-editor 现有的题目渲染/store/序列化代码路径，是把新增风险降到最小的方式。
4. **q-server 侧同样可用**：由于求值/校验算法是纯函数、无浏览器 API 依赖，`app/q-server` 也可以直接 `import` 同一份 `packages/survey-engine` 逻辑做发布前的服务端二次校验（见第 7 节），避免"前端一套规则语义、后端另一套"的双实现风险——这是 Constitution Principle I 严格要求的"跨包复用必须通过 `packages/*`"在 q-server 侧同样成立的直接体现。

### Alternatives considered

- **方案 B：把 q-editor 现有组件/store 整体迁移到 `packages/survey-engine`，实现真正统一**——技术上最"干净"，但改动面覆盖 q-editor 几乎全部题目渲染代码，回归风险与本功能范围严重不匹配，被否决；作为已知技术债记录在 `plan.md` 的 Complexity Tracking 中，不在本功能范围内处理。
- **方案 C：规则逻辑短期直接写在 q-editor 本地，`packages/survey-engine` 不参与**——最省事，但直接违反用户"动态表单前端应该从低代码核心部分设计"的明确要求，也违反 Constitution Principle I 的共享代码提取规则，被否决。
- **方案 D：新建独立包 `packages/rule-engine`**——规则逻辑与"问卷"领域强耦合（依赖题目类型枚举、答案值语义），拆成独立通用包会引入不必要的包间依赖跳转，且不符合"低代码核心"这一用户措辞的直接指向，被否决。

---

## 2. 规则数据的持久化位置与题目稳定引用键

### 背景（现状事实）

- `app/q-server/prisma/schema.prisma` 的 `SurveyComponent`（`app/q-server/prisma/schema.prisma:107-124`）没有任何规则/条件/跳转/派生字段相关列。
- `survey-crud.service.ts` 的 `replaceComponents()`（约 112-130 行）在每次保存问卷时对该问卷的全部组件执行"先删后建"，导致 `SurveyComponent.id`（自增主键）在编辑过程中并不稳定——今天的题目 3 的 `id`，下一次保存后可能变成一个全新的自增值。任何"规则引用另一道题目"的设计，如果直接以 `component_id` 作为跳转/条件目标，会在下一次保存后失效或指向错误的题目。
- `order_index` 同样会因为设计者插入/删除/拖拽排序题目而漂移，不能作为长期稳定的引用键。

### Decision

1. **`SurveyComponent` 新增两个可空列**：
   - `client_key VARCHAR(64)`：题目在前端创建时生成的稳定 UUID（编辑器本地 `Status.id` 的镶入值），同一问卷内唯一，**在整个编辑生命周期内不随保存/排序/重建而改变**；规则中的"触发来源题目""跳转目标题目""联动依赖题目""派生字段引用的题目"全部以 `client_key` 表达，而不是 `component_id` 或 `order_index`。
   - `logic JSON NULL`：该题目自身携带的规则配置（显示条件、跳转规则、选项联动映射、派生计算公式），序列化自 `packages/survey-engine` 定义的 `LogicConfig` 类型；`NULL` 表示该题目未启用任何动态规则。
2. `replaceComponents()` 在重建组件时，将前端传入的 `client_key` 原样写入新行（前端始终传入既有 `client_key`，仅新增题目时生成新的），使规则引用在"先删后建"的重建过程中保持指向正确。
3. 两列均可空、新增而非改造现有列，对存量数据零影响，天然满足 FR-010（存量问卷零行为回归）。

### Rationale

- 用**独立于数据库自增 ID 生命周期的稳定键**解决"先删后建"带来的引用漂移问题，是成本最低、侵入性最小的修复方式——不需要把 `replaceComponents()` 改造成 diff 式更新（那是更大范围的重构，超出本功能范围）。
- 把 `logic` 作为 `SurveyComponent` 的旁支列（而不是塞进现有 `config` JSON 内部），避免了触碰 `config` 现有结构（`serializeComponents`/`cleanConfig`/`deserializeSurveyDetail` 等既有序列化路径完全不受影响），是保证 FR-010 的关键设计选择。
- 结构化校验（循环依赖检测、无效引用检测）需要"某题目引用了谁"的显式图结构；把引用信息放在独立 JSON 列而不是嵌进不透明的 `config` 里，能让服务端校验逻辑（第 7 节）直接读取 `logic` 列做图遍历，无需理解每种题型 `config` 内部结构。

### Alternatives considered

- **直接用 `order_index` 作为引用键**：设计者调整题目顺序是高频操作，一旦发生，历史规则会静默指向错误题目——不可接受，被否决。
- **新建独立关系表 `SurveyRule`（`id`/`survey_id`/`source_component_id`/`target_component_id`/`condition_json`/...）**：能获得数据库级外键约束，但 `source/target` 依然要面对同样的"先删后建"引用漂移问题（需要额外一层 `component_id` 重映射），且大幅增加本次改动的 schema 面积与迁移风险；在"先删后建"这个既有事实不变的前提下，关系表相对 JSON 列没有带来实质性的额外完整性收益。保留为未来"如果 `replaceComponents` 改造为 diff 式更新"时的后续优化方向，本次不采用。

---

## 3. 答案值类型规范化

### 背景（现状事实）

14 种题型的运行时答案值类型互不相同（索引 `number`、文本 `string`、数组 `string[]`、`Date`、矩阵 `Record<number, number>` 等），且 `single-select` 现有实现存储的是**选项索引**，而 `option-select`/`multi-select` 存储的是**选项文本值**——这是题型体系里已经存在的不一致（技术债），条件比较逻辑必须在不修复这个不一致本身的前提下正确工作。

### Decision

在 `packages/survey-engine/src/logic/` 内定义统一的规范化函数 `normalizeAnswerValue(material: Material, rawValue: unknown, comConfig): NormalizedValue`，按题型分支将原始运行时值转换为一个统一的比较友好形态：

```ts
type NormalizedValue =
  | { kind: "text"; value: string }
  | { kind: "number"; value: number }
  | { kind: "text-list"; value: string[] }
  | { kind: "matrix"; value: Record<string, number> };
```

`single-select` 分支显式将存储的选项索引转换为该索引对应的选项文本值（与 `option-select`/`multi-select` 保持一致的 `"text"`/`"text-list"` 语义），条件比较运算符（等于/不等于/包含/大于/小于等）只对规范化后的值操作，不感知各题型原始存储差异。

### Rationale

- 不在本功能内"修复" `single-select` 的索引存储方式本身（那是独立的题型体系技术债，修复它会影响既有答卷数据解读，超出本功能范围且违反 FR-010），而是在规则求值这一层做一次性、局部的规范化，把技术债的影响面封闭在新增代码内部。
- 统一规范化形态使条件比较运算符的实现与"具体是哪种题型"解耦，新增题型只需要新增一条 `normalizeAnswerValue` 分支，不需要改动比较运算符逻辑本身，符合 Constitution Principle II 对类型设计完整性的要求。

### Alternatives considered

- **直接在比较运算符内部对每种题型特判**：会让比较逻辑与题型体系强耦合、分支膨胀且难以测试，被否决。
- **借此机会统一修复 `single-select` 底层存储为文本值**：影响面扩大到所有既有题型渲染/序列化/统计代码路径与历史答卷解读，与 FR-010"零行为回归"的强约束冲突，被否决（记录为独立技术债，不在本次处理）。

---

## 4. 填写端实时规则评估架构与 200ms 性能目标

### 背景（现状事实）

- `app/q-editor/src/views/online/SurveyView.vue` 当前用一个非响应式的本地 `answers` ref（`Record<index, value>`），子组件不会反向绑定到彼此的答案，无法支撑"题目 B 的显示依赖题目 A 的答案"这类跨题目响应。
- 所有规则判断依据都是同一份问卷内部、已经加载进浏览器内存的数据（Assumptions 已确认不依赖外部实时数据源），因此规则求值天然是纯本地计算，不涉及网络往返。

### Decision

1. **前置修复（本功能的必要前提，非可选项）**：将 `SurveyView.vue` 的答案模型改造为集中式响应式 `ref<Record<string, AnswerValue>>`（以 `client_key` 为键），所有题目组件的输入统一双向绑定到这个集中 store，取代当前互不感知的本地状态。
2. 新增 `visibleComs = computed(() => evaluateVisibility(rules, answers.value))`（调用 `packages/survey-engine` 的 `useRuleRuntime`），题目渲染、`useSurveyNo` 计数、`SurveyPagination.total`、必答校验、提交前必填检查，全部从原来读取静态 `coms` 数组，改为读取 `visibleComs`。
3. 求值函数内部按"规则的触发来源题目"建立依赖索引（而不是每次答案变化都重新扫描全部规则），保证求值复杂度随"实际相关规则数"而不是"问卷总规则数"增长。
4. Vue 的 `computed` 天然做脏检查与惰性求值，一次答案变更只会触发依赖它的 `computed` 重新计算，配合本地纯函数求值（无网络 I/O），单次求值预期在个位数毫秒级——200ms 的阈值（FR-008/SC-005）在这一架构下是宽松达标而非临界达标，不需要额外的防抖/节流机制（防抖反而会人为增加感知延迟，与"实时"要求相悖）。

### Rationale

- 200ms 的瓶颈从来不是"计算量"，而是"当前架构下答案变化根本不会触发任何跨题目重新渲染"——问题的根源是响应式链路缺失（第 7 项已知问题），不是算法性能问题。修复响应式链路本身就是达标的充分条件。
- 复用 Vue 现有的响应式基础设施（`computed`/依赖追踪）而不是手写一套观察者模式，符合"合理使用项目已有中间件和工具"的编码规范要求。

### Alternatives considered

- **引入 Web Worker 做后台求值**：对于本地内存数据的纯函数计算，Worker 通信本身的序列化/postMessage 开销大于计算本身，得不偿失，被否决。
- **服务端算规则、前端只负责展示结果**：与"无需刷新页面/等待提交"的实时性要求直接冲突（引入网络往返），也不符合"依据仅限于同一份问卷内部已作答题目"的 Assumptions 前提，被否决。

---

## 5. 派生字段（Computed Field）建模方式

### Decision

派生字段建模为 `coms[]` 数组中的一个新增伪题型条目（新增 `Material.ComputedField`），其 `logic` 列携带 `ComputedFieldConfig`（计算公式、参与计算的题目 `client_key` 列表、"参与题目未全部作答时"的降级策略——按 spec User Story 4 场景 4，默认视为 0 参与求和），不渲染为可输入控件，而是渲染为只读结果展示（若设计者将其设置为"对填写者可见"）或完全不渲染（仅供内部规则引用）。

### Rationale

- 复用现有"`coms[]` 平铺数组 + 每项一个 `Status`"架构，不引入新的顶层实体（与 Clarification Q1"不引入独立逻辑页面/分节实体"的精神一致，同理不为派生字段单独开一个顶层列表）。
- 派生字段的计算结果需要随答卷持久化（Clarification Q4），作为 `coms[]` 中的一个正常条目，天然可以复用 `Answer` 表的现有"按 `component_id` 存一行值"的持久化路径，不需要为派生字段设计另一套存储通道。

### Alternatives considered

- **派生字段作为规则的附属属性、不占用 `coms[]` 位置**：无法自然复用 `Answer` 表持久化通道，需要另开一张表或在 `Response` 上加动态列，被否决。

---

## 6. 发布时规则完整性校验

### Decision

新增 q-server 模块 `app/q-server/src/modules/survey/survey-rule/`（与现有 `survey-crud`/`survey-stats` 同级），在 `survey-crud.service.ts` 的 `publish()`（约 501-545 行）状态转换检查之后、真正落库之前，调用 `packages/survey-engine` 的 `validateRuleSet(coms)`（第 1 节已确定的同一份纯函数校验算法），执行：

- **循环依赖检测**：把"规则触发来源 → 目标"看作有向图，做环检测（DFS 三色标记）。
- **无效引用检测**：目标/来源 `client_key` 不在当前问卷题目集合中。
- **非法跳转目标检测**：跳转目标为自身，或（依据 Assumptions"仅支持向后跳转"）目标题目的 `order_index` 不晚于来源题目。

校验结果落地为 `RuleValidationResult`（通过/不通过 + 具体违规列表），不通过时 `publish()` 直接返回业务错误码（复用 `schema-validator.ts` 已确立的"validate → collect issues → decide valid/invalid"模式，`app/q-server/src/modules/ai/schema-validator.ts`），不写入任何状态变更。

### Rationale

- 前后端复用同一份 `packages/survey-engine` 校验算法（而不是 q-server 另写一套），从根源上避免"前端预览时判断合法、后端发布时判断不合法"的双实现漂移风险——这是第 1 节架构决策在 q-server 侧的直接收益。
- 独立子模块（`survey-rule/`）而不是塞进 `survey-crud.service.ts` 内部，符合现有 `q-server/src/modules/survey/*` 按子领域拆分子目录（`survey-crud`/`survey-stats`/`file`/`upload`/`public`/`share`）的既有组织惯例。

---

## 7. 答案跳过状态持久化（区分"主动留空"与"被规则隐藏跳过"）

### 背景（现状事实）

`app/q-server/prisma/schema.prisma:207-222` 的 `Answer` 表当前对"未作答的题目"完全不插入任何行——"填写者看到但留空"与"题目从未展示过"在数据库层面是完全相同的"没有这一行"，无法区分（对应 FR-011/SC-006 与 Edge Cases 中的明确要求）。

### Decision

1. `Answer` 新增可空列 `answer_status SMALLINT NULL`（`0` = 正常作答，`1` = 因规则被隐藏/跳过，`2` = 展示但主动留空）；不传值的历史行含义保持"正常作答"（向后兼容，见第 8 节）。
2. `submitResponse()`（约 954-1100 行）在写入答案时，对填写页 `visibleComs` 计算结果中"可见但未作答"的题目显式插入 `answer_status=2` 的空值行，对"不可见（被规则隐藏/跳过）"的题目显式插入 `answer_status=1` 的空值行——不再是"只为有值的答案插入行"（现状约 1031-1046 行按真值过滤），而是为问卷发布时刻的全部题目集合都产出一行，只是值可能为空。
3. `survey-stats.service.ts` 的统计口径（约 191-227 行）从"是否存在 `Answer` 行"改为"读取 `answer_status`"来判定题目的应答情况。

### Rationale

- 新增可空列 + 新增服务端写入逻辑，不改变现有列的语义，对存量问卷（历史答卷本身没有这一列的值，也不需要回填）零影响，满足 FR-013"变更只影响后续新提交数据"。
- 在 `submitResponse()` 这一单点统一决定每道题目的 `answer_status`，避免把"可见性判断"逻辑散落进统计模块重新推导一遍（统计模块只需读取已经落库的状态，不需要在读时重新跑一遍规则引擎）。

### Alternatives considered

- **统计时动态重新计算可见性，不新增列**：要求统计模块保留当时问卷发布的规则快照并重新求值，复杂度与耦合度远高于"提交时一次性落库状态"，且与 FR-013（历史答卷不因规则变更被重新解释）直接冲突，被否决。

---

## 8. Technical Context 汇总（对应 plan.md 的各未知项）

以下均直接引用 `.specify/memory/constitution.md` 的 Technology Stack Constraints 表与本次代码研究结果，非需要进一步调研的未知项：

| 项                   | 取值                                                                                                                                                                                                                                                 |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Language/Version     | TypeScript 5.9（`strict: true`），跨 `packages/survey-engine`/`app/q-editor`/`app/q-server` 三包一致                                                                                                                                                 |
| Primary Dependencies | `packages/survey-engine`：Vue 3.5（peer）、无新增第三方依赖（规则子模块零依赖，纯 TS）；`app/q-editor`：新增对 `monorepo-survey-engine` 的 workspace 依赖；`app/q-server`：Fastify 5、Prisma 7 + PostgreSQL、Zod v4（新增 `survey-rule.schemas.ts`） |
| Storage              | PostgreSQL（`app/q-server/prisma/schema.prisma`），本功能新增 `survey_components.client_key`/`survey_components.logic`/`answers.answer_status` 三个可空列，均为新增 Prisma migration，不改动现有列                                                   |
| Testing              | `packages/survey-engine`：Vitest（已有 `vitest`/`@vitest/coverage-v8` 依赖，规则求值/校验纯函数适合大量单测覆盖分支）；`app/q-editor`：Vitest + Playwright；`app/q-server`：Vitest（`test:dev`/`test:coverage` 脚本已存在）                          |
| Target Platform      | 浏览器（q-editor 编辑器与填写页，qiankun 子应用 + standalone 双模式）、Node.js ≥22.17 服务端（q-server）                                                                                                                                             |
| Project Type         | Web 应用（monorepo 内既有的多包/多应用结构，本功能是既有结构内的横切能力，不新增部署单元）                                                                                                                                                           |
| Performance Goals    | 触发条件变化到界面完成更新（显示/隐藏、跳转、选项刷新、计算结果）≤200ms（FR-008/SC-005），见第 4 节架构分析——在响应式链路修复后为宽松达标                                                                                                            |
| Constraints          | 存量问卷零行为回归（FR-010/SC-004）；发布时 100% 拦截循环依赖与无效引用（FR-006/SC-003）；跳转仅支持向后跳转（Assumptions）；派生计算限于数值汇总/加权场景，不引入自定义公式脚本引擎（Assumptions）                                                  |
| Scale/Scope          | 单题目级规则粒度（不引入逻辑页面/分节实体）；覆盖问卷当前已支持的全部题型作为规则触发来源或作用目标（Assumptions）                                                                                                                                   |

---

## 决策汇总

| #   | 决策                                                                                                               | 影响范围                                                                                                 |
| --- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| 1   | 规则类型与求值/校验算法落地在 `packages/survey-engine/src/logic/`；`app/q-editor` 新增依赖但仅引入该子模块         | `packages/survey-engine`、`app/q-editor/package.json`                                                    |
| 2   | `SurveyComponent` 新增 `client_key`/`logic` 可空列，规则以 `client_key` 而非 `component_id`/`order_index` 相互引用 | Prisma schema + migration、`survey-crud.service.ts`                                                      |
| 3   | 规则求值前统一调用 `normalizeAnswerValue` 规范化 14 种题型答案值                                                   | `packages/survey-engine/src/logic/`                                                                      |
| 4   | `SurveyView.vue` 答案模型改为集中式响应式 store，规则通过 `computed` 派生 `visibleComs`                            | `app/q-editor/src/views/online/SurveyView.vue` 及其依赖的题目组件                                        |
| 5   | 派生字段建模为 `coms[]` 中的伪题型条目                                                                             | `packages/survey-engine`（新增 `Material.ComputedField`）、`app/q-editor`（镜像新增题型 + 只读渲染组件） |
| 6   | 发布前调用共享校验算法拦截循环依赖/无效引用/非法跳转                                                               | 新增 `app/q-server/src/modules/survey/survey-rule/`、`survey-crud.service.ts` 的 `publish()`             |
| 7   | `Answer` 新增 `answer_status` 列，提交时为可见未答/隐藏跳过分别落库                                                | Prisma schema + migration、`submitResponse()`、`survey-stats.service.ts`                                 |

所有 Technical Context 未知项已解决，无遗留 `NEEDS CLARIFICATION`。
