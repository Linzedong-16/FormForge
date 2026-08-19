# 数据模型：q-editor 问卷引擎无缝迁移

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Research**: [research.md](./research.md)

本文件从 spec.md 的 Key Entities 出发，补充实现所需的字段/类型细节。本次迁移**不改变持久化数据结构**
（Assumptions 已明确），因此以下实体描述的是现有数据在共享引擎内的表示方式，不是新增的数据库/API 契约。

## 1. 共享问卷引擎（Survey Engine）

对应 `packages/survey-engine` 包本身，非单一数据实体，而是承载以下所有子实体的运行时容器。迁移后须
成为 `q-editor`、`app/frontend` 的唯一实现来源（FR-004、FR-005）。

## 2. 动态规则配置（QuestionLogicConfig）

以题目 `client_key` 为索引的规则集合，已在 `packages/survey-engine/src/core/logic/types.ts` 中定义
（迁移前即存在，本次不新增字段，仅新增 Store 层围绕它的读写方法）：

| 字段               | 类型                                                       | 说明                                                                       |
| ------------------ | ---------------------------------------------------------- | -------------------------------------------------------------------------- |
| `clientKey`        | `ClientKey`（`string` 类型别名，非品牌类型，无编译期区分） | 题目的稳定标识，独立于题目在问卷中的排序位置，生成后不再变化。             |
| `visibilityRules`  | `VisibilityRule[]`                                         | 显隐规则集合，决定该题目何时对答题者可见。                                 |
| `jumpRules`        | `JumpRule[]`                                               | 跳转规则集合，决定作答后跳转到哪一题/哪一逻辑分支。                        |
| `optionDependency` | `OptionDependencyMapping \| undefined`                     | 选项联动依赖映射（见下方"选项联动规则"实体），未配置联动的题目该字段为空。 |
| `computedField`    | `ComputedFieldConfig \| undefined`                         | 计算字段伪题型的计算表达式配置，仅计算类题目有值。                         |

**迁移新增的 Store 层能力**（对应 FR-002/FR-010 第 2 项，方法迁移自 q-editor 的 `useEditor.ts`，签名
保持不变以确保调用方零改造）：

- `getComByClientKey(clientKey: ClientKey): Status | undefined` — 按 `client_key` 查询题目实例。
- `ensureComClientKey(com: Status): ClientKey` — 惰性补齐：若题目缺少 `clientKey`（存量问卷），
  生成新 UUID v4 并写回，保证幂等（同一题目重复调用不会二次生成）。
- `setComLogicByClientKey(clientKey: ClientKey, logic: Partial<QuestionLogicConfig>): void` — 按
  `client_key` 更新规则配置；找不到对应题目时记录告警而不抛异常（保持 q-editor 现有的容错行为）。
- `findRuleReferencesTo(clientKey: ClientKey): RuleViolation[]` — 反向查找：返回所有引用了该
  `client_key` 的规则来源题目列表，供删除题目前的引用提示使用（User Story 1 验收场景 3）。
- `getDanglingReferencesFrom(clientKey: ClientKey): RuleViolation[]` — 正向体检：对指定题目自身的
  规则配置，检查其引用的其他题目 `client_key` 是否已失效（悬空引用），不涉及删除操作。

**状态转换**：`clientKey` 一旦生成即视为不可变；`QuestionLogicConfig` 的其余字段可随编辑操作任意次
更新，每次更新需经 `validateRuleSet` 校验后才允许写入（复用 `core/logic`，见下）。

## 3. 选项联动规则（OptionDependencyMapping / 候选池收窄）

由 `packages/survey-engine` 现有的 `core/logic` 层承载纯计算逻辑（本次迁移前已存在，不新增类型定义）：

| 字段                 | 类型                              | 说明                                         |
| -------------------- | --------------------------------- | -------------------------------------------- |
| `dependsOnClientKey` | `ClientKey`                       | 该题目候选池依赖的上游题目。                 |
| `poolResolver`       | 由 `resolveOptionPool` 消费的配置 | 描述如何根据上游题目的作答值收窄本题候选池。 |

**运行时表现**（对应组件 prop，迁移后 `SingleSelect.vue`/`OptionSelect.vue` 等需直接消费
`useRuleRuntime`/`resolveOptionPool` 而非依赖上层预先计算好的 prop）：

- `optionPool: string[] | { prompt: true }` — 依赖题已作答时为收窄后的候选值数组；依赖题未作答时为
  `{ prompt: true }`，驱动"需先完成依赖题"提示态。
- `isPoolPrompting: boolean`（计算属性）— 由 `optionPool` 形状推导，`{ prompt: true }` 时为真。
- `isOptionAvailable(index: number): boolean`（过滤函数）— 用于 `v-show` 而非 `v-if`，保证选项集合
  的下标/顺序不因收窄而错位（Acceptance Scenario 1 的硬性要求）。

## 4. q-editor 本地问卷编辑模块（迁移终态：删除）

迁移前为 `app/q-editor/src/{stores/useEditor.ts, components/SurveyComs/*}`，迁移完成后（FR-004/SC-002）
应被完全移除，不作为长期存在的实体建模，仅在迁移过程的中间态短暂与共享引擎并存用于对照验证
（Assumptions 第 3 条）。

## 5. FR-010 其余 3 项能力涉及的数据形态（非结构性变更，仅为行为补齐）

- **Signature 上传结果**：与 `PicItem` 共用同一后端上传接口的响应信封 `{code, msg, data: {file_url,
...}}`；上传失败或缺少 `surveyId` 时的降级形态是 `string`（base64 data URL），与正常上传成功后的
  `string`（远程 URL）在类型层面保持一致，调用方无需区分。
- **PicItem 响应体**：统一按 `response.data.file_url`（嵌套结构）解析，见 research.md 第 2 节决策。
- **SinglePicSelect 答案值**：`emits(["updateAnswer"], value: string)`，`value` 为选中项对应的原始
  选项值（与其余单选题型的答案值类型一致，无特殊结构）。
