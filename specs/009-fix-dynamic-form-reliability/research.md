# Phase 0 研究：根因定位与修复方案决策

本文档记录 spec.md 每条 Functional Requirement 对应的根因定位（已通过代码核查确认，非推测）与修复方案的 Decision / Rationale / Alternatives considered，供 Phase 1 设计与 tasks 拆解直接引用。

## D1（对应 FR-001、FR-002）：创建路径丢失 client_key / logic

**根因**：`app/q-server/src/modules/survey/survey-crud/survey-crud.service.ts` 中，`update()`/`submitReview()`/`applyTemplate()` 三处均通过私有方法 `replaceComponents(tx, surveyId, components)` 写入题目，该方法正确地对每个组件做了 `client_key: c.client_key ?? randomUUID()` 与 `logic: c.logic ?? Prisma.DbNull` 的兜底映射。但 `create()` 内部并未复用该方法，而是内联了一段独立的 `tx.surveyComponent.createMany(...)`，其映射字段列表遗漏了 `client_key` 与 `logic` 两项，导致问卷首次创建时这两个字段永远写入数据库默认值（`NULL`），规则配置随即"看似保存成功、实际整体丢失"。

**Decision**：将 `create()` 内联的 `createMany` 调用替换为对已验证正确的 `this.replaceComponents(tx, created.id, components ?? [])` 的调用。

**Rationale**：`replaceComponents` 已是三条既有保存路径共同验证过的唯一权威映射实现，复用而非重新编写可以从结构上保证"创建"与"更新"两条路径行为永久一致，直接满足 FR-001 的"两种保存路径行为必须一致"要求，且不引入任何新增字段映射逻辑需要单独测试。

**Alternatives considered**：在 `create()` 内联补全缺失的字段映射（复制一份等价逻辑）。**拒绝原因**：会重新造成"同一映射逻辑维护在两处、未来一方修改另一方遗漏"的同类回归风险，与本次修复的根本诉求（消除双路径实现漂移）相悖。

## D2（对应 FR-003、FR-004）：提交路径丢失隐藏/留空题目的 answer_status

**根因**：`app/q-server` 侧 `submitResponse()` 事务体（`survey-crud.service.ts` 约 1060-1104 行）已正确实现 `isUpgradedClient` 分支——只要提交负载中任意一项携带 `answer_status`，即按新客户端语义原样落库全部条目，未升级客户端则保持原有的"仅落库有值项、`answer_status` 全部为 0"的向后兼容行为。**问题完全在前端**：`app/q-editor/src/views/online/SurveyView.vue` 的 `submitAnswers()` 在构建 `indexedAnswers` 时，对 `answers.value[c.key]` 为 `undefined`/`null` 的题目直接 `continue` 跳过，导致隐藏题目、被跳转跳过的题目、以及可见但用户未填写的题目，其对应的 `AnswerItem` 从未被 `serializeAnswers()` 序列化进提交负载——不是"字段值错误"，而是"这些题目在提交负载里完全不存在"，因此 `answer_status` 无从谈起。

**Decision**：修复限定在 `app/q-editor`。在 `submitAnswers()` 序列化之前，基于已存在的 `visibleComs`（已实现隐藏过滤 + 跳转跳过的完整可见性计算结果）与全量 `componentMap` 做差集，得到"本次填写会话中实际不可见"的题目集合，为其构造 `answer_status: 1` 的空值 `AnswerItem`；对 `visibleComs` 内但用户未填写的题目构造 `answer_status: 2` 的空值 `AnswerItem`；正常填写的题目沿用现状（`answer_status` 省略或显式 0，后端两种写法行为一致）。仅当该问卷至少一个题目配置了 `logic`（即存在动态规则）时才启用这一补全路径；纯静态问卷维持现状字节级不变的提交负载，双重保障 FR-010 零回归。

**Rationale**：`visibleComs` 是填写时刻交互状态（用户已填的答案 + 跳转轨迹）与规则求值结果的乘积，只有持有完整会话状态的前端才能产出；这与 008 research.md 确立的既有架构分工一致——`packages/survey-engine` 提供权威纯函数求值实现，各消费方在真正发生求值的场景调用它，而不是让某一方"凭空重算"另一方已经算过的结果。

**Alternatives considered**：让后端依据自己保存的 `logic` 配置重新计算可见性以推导 `answer_status`。**拒绝原因**：(a) 会在 `app/q-server` 重复实现一份 `packages/survey-engine` 已有的求值逻辑，造成新的双实现分叉，与本次修复"消除实现漂移"的目标相悖；(b) 后端重算需要访问填写者提交时刻的完整交互上下文（包括跳转发生的具体路径），而当前 `submitResponse` 输入结构并不携带这类"会话快照"，引入它意味着要求前端把已经算好的东西再上传一份供后端验证，复杂度和潜在不一致面均高于"前端一次算好、如实上报"的方案。

## D3（对应 FR-005）：发布时规则校验读取脱离事务

**根因**：`survey-crud.service.ts` 的 `publish()`（约 545-586 行）在 `this.fastify.prisma.$transaction(async tx => {...})` 事务体内部，调用 `new SurveyRuleService(this.fastify).validateSurveyRules(userId, surveyId)` 时传入的是 `this.fastify`，而不是事务闭包提供的 `tx`；`SurveyRuleService.validateSurveyRules()` 内部固定使用 `this.fastify.prisma` 发起查询，导致规则校验读取的数据快照与本次发布事务后续写入所依据的快照可能不是同一份（若在此期间发生并发修改）。

**Decision**：为 `SurveyRuleService.validateSurveyRules(userId, surveyId, tx?)` 增加第三个可选参数，类型对齐 `replaceComponents` 已有的事务客户端用法；未传入时默认回退到 `this.fastify.prisma`（供独立的规则预检接口场景使用，该场景本身不在任何事务内，行为不变）。`publish()` 内部调用处改为显式传入当前事务的 `tx`，使规则校验读取与后续状态写入落在同一次事务的一致性快照内。

**Rationale**：与 `/speckit-clarify` 已确认的 Q1 决策一致——仅要求"复用发布事务的同一次读取"，不要求引入乐观锁/版本号或显式行锁等更强的并发控制机制。PostgreSQL 默认 Read Committed 隔离级别下，让读取与写入共享同一事务连接，已足以保证"发布决策所依据的规则数据"与"实际发布时刻的规则数据"一致，满足 FR-005 的字面要求。

**Alternatives considered**：(a) 引入版本号/乐观锁——已在 `/speckit-clarify` 中被用户明确否决，超出本次修复范围；(b) 显式 `SELECT ... FOR UPDATE` 行锁——**拒绝原因**：FR-005 的诉求是消除"读取脱离事务"这一实现缺陷，而非提升隔离级别；复用同一 `tx` 已经是最小、风险最低的修复面，额外加锁属于超出必要范围的过度设计。

## D4（对应 FR-006）：四项动态能力的自动化测试覆盖不均

**根因**：`app/q-editor/e2e/tests/survey/survey-dynamic-logic.spec.ts` 目前仅包含 3 个 `test.describe` 场景（题目显示/隐藏、跳题结束、选项联动），缺少针对"派生计算字段"（User Story 4）的端到端场景；而 `packages/survey-engine/src/logic/__tests__/{evaluator,normalize,validator}.spec.ts` 在纯函数单元测试层面已完整覆盖 `computeDerivedField` 的 `sum`/`weightedSum`/不完整数据降级策略，以及 computed-field 的循环依赖/悬空引用检测——即覆盖缺口只存在于 E2E 层，不存在于底层纯函数校验层。

**Decision**：仅在 `survey-dynamic-logic.spec.ts` 新增一个"场景4：派生计算字段"，覆盖三个验收点：计算结果随依赖题目答案变化实时更新；参与计算的题目留空时按其 `emptyStrategy`（`treatAsZero`/`skipCalculation`）正确降级；`visibleToFiller: false` 的计算字段不渲染但仍参与计算。不重复补充底层单元测试。

**Rationale**：精确定位到唯一真实存在的覆盖缺口，避免为已经覆盖过的能力重复编写测试（与 Constitution Principle V「测试对等而非过度测试」的精神一致）。

**Alternatives considered**：为四项能力统一重写一套新的 E2E 套件。**拒绝原因**：现有 3 个场景已稳定运行且未发现缺陷，重写会引入不必要的变更面与回归风险，与本次修复"最小必要改动"的原则相悖。

## D5（对应 FR-007）：`client_key` 与 `logic` 的 nullable 语义不对称

**根因**：`app/q-server/src/modules/survey/survey-crud/survey-crud.schemas.ts` 中，`logic` 字段为 `questionLogicConfigSchema.nullable().optional()`，允许调用方显式传 `null` 表示"清除规则配置"；而 `client_key` 字段仅为 `z.string().max(64, ...).optional()`，缺少 `.nullable()`，使得调用方若尝试显式传 `null`（例如前端某处误将空值序列化为 `null` 而非省略字段）会被 Zod 拒绝，而非按预期兜底生成新 UUID。

**Decision**：为 `client_key` 字段补充 `.nullable()`，使其与 `logic` 字段的可空语义保持对称；`replaceComponents()` 现有的 `c.client_key ?? randomUUID()` 兜底逻辑已经能正确处理 `null`/`undefined` 两种情况，schema 放宽后无需再改动映射代码。

**Rationale**：两个字段在语义上都属于"服务端可接受客户端不提供、由服务端兜底生成/保留原值"的可选引用型字段，理应享有同等的输入容忍度；这是一处纯粹的 schema 定义遗漏，修复成本与风险都最小。

**Alternatives considered**：无需考虑替代方案——这是明确的对称性缺陷，直接修正即可。

## D6（对应 FR-008，best-effort，非强制）：选项联动规则的悬空选项引用未纳入校验

**根因**：`packages/survey-engine/src/logic/types.ts` 中 `RuleViolationType` 目前仅有 `"circularDependency" | "danglingReference" | "invalidJumpTarget"` 三类，`validateRuleSet()` 的文档注释明确只覆盖这三类场景；当设计者修改/删除某题目的选项后，其他题目 `optionDependency.optionsByAnswer` 中引用该选项值的映射条目会成为"引用了当前已不存在的选项值"的悬空引用，但现有三类校验均不覆盖这一场景（`danglingReference` 只覆盖 `client_key` 级别的整题引用，不下钻到题目内部的选项值级别）。

**Decision**：新增 `RuleViolationType` 枚举成员（暂定命名 `"staleOptionReference"`），并为 `validateRuleSet()` 新增一个**可选**入参，使每个题目描述符可携带其"当前有效选项值集合"（从题目 `config` 中已有的选项列表派生，仅对支持选项联动的题型有意义）；新增校验分支检测 `optionsByAnswer` 的 key 或映射目标值是否越出对应题目的当前选项集合。对应在 `app/q-server/src/utils/response.ts` 的 BizCode 6xxx 段新增 `RULE_STALE_OPTION_REFERENCE = 6004`，并在 `mapViolationTypeToBizCode()` 补充一个分支。

**Rationale**：新增可选参数、默认不传时行为与现状完全一致，保证 `validateRuleSet()` 对现有两个消费方（`app/q-server` 与 `app/q-editor` 若有本地预校验）的调用点保持向后兼容，不强制同步升级；BizCode 6004 延续既有分段与命名惯例，不破坏既有客户端对 6xxx 段错误码的处理逻辑。

**Alternatives considered**：将新场景直接归入既有 `danglingReference` 类型（不新增枚举成员）。**拒绝原因**：`danglingReference` 现有语义是"引用了不存在的 `client_key`（整题级）"，与"引用了存在的题目但已不存在的选项值（选项级）"是不同粒度的问题，混用会让前端据 `type` 做的错误提示文案产生歧义；鉴于 FR-008 本身标注为"应当"而非"必须"（spec.md 措辞为软性要求），本决策记录设计方向，具体是否在本轮实施留待 tasks 阶段按剩余工作量评估，不阻塞两个 P1 Bug 的交付。

## D7（对应 FR-009，Nice-to-have，已在 `/speckit-clarify` 中降级为非强制）

**Decision**：暂不在本次修复范围内规划具体交互方案；若后续实施，倾向于在 `app/q-editor` 编辑器右侧属性面板增加持久提示（非一次性弹窗），具体交互设计留待独立评估，不阻塞本功能验收。

**Rationale**：`/speckit-clarify` Q4 已明确将 FR-009 降级为非强制项，与两个 P1 Bug 解耦，避免为其消耗本次修复的核心交付资源。
