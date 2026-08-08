# Phase 1 数据模型：受影响实体与行为约束变化

本功能**不新增、不修改任何数据库表或列**（详见 spec.md Assumptions），也不改变 `packages/survey-engine/src/logic/types.ts` 中已有类型的字段结构。本文档记录 spec.md 「Key Entities」中 4 个实体在本次修复中涉及的**行为约束变化**（谁来产生、谁来读取、在什么条件下有效），作为 tasks 拆解与测试断言的依据；完整字段定义参见 [008-dynamic-form-engine/data-model.md](../008-dynamic-form-engine/data-model.md)。

## 1. 题目动态规则配置（Question Logic Config）

- **载体**：`survey_component.logic`（JSONB，可空），类型对应 `packages/survey-engine/src/logic/types.ts` 的 `QuestionLogicConfig`。
- **行为约束变化（FR-001/002）**：新建问卷时的首次保存必须与后续编辑保存共用同一份写入路径（`replaceComponents()`），确保 `logic` 字段在两条路径下遵循相同的兜底规则——未提供时写入 `Prisma.DbNull`，提供时原样写入。修复前，创建路径会无条件丢弃该字段；修复后，创建路径与更新路径的持久化结果对同一份输入必须逐字节一致。
- **不变量**：`logic` 字段本身的 JSON Schema（`questionLogicConfigSchema`）不变，仍在 T011 既有校验路径生效。

## 2. 题目稳定引用标识（Client Key）

- **载体**：`survey_component.client_key`（`varchar(64)`，可空，实际业务上问卷题目均应有值）。
- **行为约束变化（FR-001/002）**：与 `logic` 同理，创建路径必须复用 `replaceComponents()` 的 `client_key: c.client_key ?? randomUUID()` 兜底逻辑，不能遗漏该字段的写入。
- **行为约束变化（FR-007）**：`survey-crud.schemas.ts` 中对应的入参校验 `client_key` 字段补充 `.nullable()`，使其可空语义与 `logic` 字段对称——服务端接受调用方显式传 `null`（等价于未提供，触发兜底生成）。这不改变 `client_key` 本身"题目生命周期内保持不变"的语义，只放宽了输入层的接受范围。

## 3. 作答记录状态（Answer Status）

- **载体**：`survey_response_item.answer_status`（`smallint`，可空，0=正常填写/1=被规则隐藏跳过/2=展示但留空），后端 `submitResponse()` 已正确实现按 `isUpgradedClient` 区分新旧客户端的落库逻辑。
- **行为约束变化（FR-003/004）**：本次修复的产出方从"从未产生"变为"由 `app/q-editor` 的 `SurveyView.vue` 在提交前如实产生"。具体规则：
  - 题目 ∈（全量题目集合 − `visibleComs`）→ `answer_status = 1`（被规则隐藏跳过），值为空。
  - 题目 ∈ `visibleComs` 且用户未填写 → `answer_status = 2`（展示但留空），值为空。
  - 题目 ∈ `visibleComs` 且用户已填写 → `answer_status = 0`（正常填写，可省略该字段，后端默认即 0），值为用户实际输入。
  - **生效条件**：仅当该问卷至少一个题目配置了 `logic`（存在动态规则）时才启用上述补全；否则维持修复前的提交负载构造方式，保证 FR-010 对纯静态问卷的零回归。
- **不变量**：该字段的类型定义、取值范围、后端落库分支逻辑本身不变。

## 4. 规则完整性校验结果（Rule Validation Result）

- **载体**：`packages/survey-engine/src/logic/types.ts` 的 `RuleValidationResult` / `RuleViolation`（内存态返回值，不持久化）。
- **行为约束变化（FR-005）**：`validateRuleSet()` 本身的校验算法不变；变化点在于**输入数据的读取时机**——`SurveyRuleService.validateSurveyRules()` 新增可选的事务客户端参数，`publish()` 调用时显式传入自身事务的 `tx`，使本次校验读取的题目/规则数据与后续状态写入落在同一事务一致性快照内。独立的规则预检接口（非事务场景）不受影响，继续使用 `this.fastify.prisma`。
- **行为约束变化（FR-008，best-effort）**：`RuleViolationType` 新增一个枚举成员（对应 spec.md Key Entities 中已提及的"失效的选项联动映射"类别），暂定命名 `staleOptionReference`；`validateRuleSet()` 新增可选入参，使题目描述符可携带其当前有效选项值集合，用于检测 `optionDependency.optionsByAnswer` 中越出该集合的映射条目。默认不传入该新参数时，校验行为与修复前完全一致（向后兼容）。
- **对应 BizCode**：`app/q-server/src/utils/response.ts` 的 6xxx 段新增 `RULE_STALE_OPTION_REFERENCE = 6004`（若 FR-008 在本轮实施）。

## 状态转换 / 一致性图示

```text
题目集合 componentMap（设计者保存时确定）
   │
   ├─ 保存（create 或 update）──▶ replaceComponents() ──▶ client_key / logic 一致落库（D1）
   │
   ├─ 发布前 ──▶ validateSurveyRules(tx) ──▶ 与发布写入同一事务快照（D3）
   │
   └─ 填写者提交 ──▶ visibleComs 差集 ──▶ answer_status 0/1/2 如实上报（D2）
```

无新增实体、无新增关系、无新增索引；所有变化均是"既有实体在既有生命周期节点上，行为从错误/缺失纠正为正确"。
