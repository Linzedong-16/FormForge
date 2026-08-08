# 契约：发布前规则校验的事务一致性纠正（及 best-effort 新增校验类别）

## `POST /api/surveys/:id/publish`（行为变更，请求/响应形状不变）

### 请求 / 响应 JSON 形状

不变。校验不通过时仍返回既有的：

```ts
{
  code: BizCode.RULE_CIRCULAR_DEPENDENCY /* 或其他 6xxx 码 */,
  msg: "问卷动态规则校验未通过，无法发布",
  data: { violations: RuleViolation[] }
}
```

### 内部行为变更

修复前：`publish()` 在自身事务 `tx` 内部，调用 `new SurveyRuleService(this.fastify).validateSurveyRules(userId, surveyId)`——该调用固定使用 `this.fastify.prisma` 发起查询，脱离了 `publish()` 所在事务的一致性快照。

修复后：

```ts
// SurveyRuleService.validateSurveyRules 签名变更（新增可选第三参数，向后兼容）
async validateSurveyRules(
  userId: bigint,
  surveyId: bigint,
  tx: Prisma.TransactionClient | PrismaClient = this.fastify.prisma
): Promise<RuleValidationResult>

// publish() 内部调用处显式传入当前事务
const ruleValidation = await new SurveyRuleService(this.fastify)
  .validateSurveyRules(userId, surveyId, tx);
```

### `POST /api/surveys/:id/validate-rules`（规则预检接口，不变）

该接口本身不在任何外部事务内运行，调用 `validateSurveyRules(userId, surveyId)` 时不传第三参数，沿用默认值 `this.fastify.prisma`，行为与修复前完全一致。

### 验证方式（对应 quickstart.md 场景三）

1. 构造一份规则合法的问卷，并发触发多次发布前校验（或校验 + 并发保存的时序模拟），确认结论稳定一致。
2. 构造一份存在循环依赖/悬空引用的问卷，触发发布，确认被正确拦截，且校验所读取的题目/规则数据与发布事务后续写入所依据的数据是同一份快照。

### 回归约束

不含任何动态规则的问卷发布流程不受影响；`validate-rules` 预检接口的独立调用行为不变。

---

## `packages/survey-engine` 的 `validateRuleSet()`（best-effort，仅当 FR-008 在本轮实施时生效）

### 契约变更

新增一个**可选**入参，用于携带各题目当前有效的选项值集合；未传入该参数时，函数行为、返回结构、既有三类 `RuleViolationType`（`circularDependency`/`danglingReference`/`invalidJumpTarget`）的判定逻辑与修复前完全一致——纯粹的向后兼容扩展，不要求 `app/q-server`/`app/q-editor` 两个消费方同步升级调用点。

传入该参数后，新增第四类违规判定 `staleOptionReference`：当某题目 `optionDependency.optionsByAnswer` 的 key 或映射目标值越出其依赖题目/自身当前有效选项集合时命中。

### 新增 BizCode

| 常量                          | 值   | 触发条件                                       |
| ----------------------------- | ---- | ---------------------------------------------- |
| `RULE_STALE_OPTION_REFERENCE` | 6004 | 选项联动映射引用了依赖题目当前已不存在的选项值 |

`mapViolationTypeToBizCode()` 补充对应分支，命名与既有 6001-6003 的风格保持一致。
