# 契约：发布接口新增规则完整性校验拦截 + 新增规则预检接口

## 1. `POST /api/surveys/:id/publish`（变更）

既有状态转换检查（问卷归属校验、当前状态是否允许发布等）保持不变，顺序上新增一步：**状态检查通过之后、写入 `status=1`（已发布）之前**，调用 `packages/survey-engine` 的 `validateRuleSet()` 对该问卷全部题目的 `logic` 配置做完整性校验。

### 校验通过

行为与上线前完全一致：`sendSuccess(result, "发布成功")`。

### 校验不通过

抛出 `AppError`，接口返回：

```ts
// HTTP 400，业务错误码见下表
{
  code: BizCode.RULE_CIRCULAR_DEPENDENCY /* 或其他 6xxx 码 */,
  msg: "问卷动态规则校验未通过，无法发布",
  data: {
    violations: RuleViolation[] // 见 data-model.md §1.9，供前端定位具体题目与规则
  }
}
```

不写入任何状态变更（`publish()` 在校验失败时直接短路返回，不触及数据库写操作），符合 FR-006 的"阻止发布"语义与既有 `schema-validator.ts` 建立的"validate → collect issues → decide valid/invalid"模式。

### 新增 BizCode（6xxx 段，`app/q-server/src/utils/response.ts`）

| 常量                       | 值   | 触发条件                                                              |
| -------------------------- | ---- | --------------------------------------------------------------------- |
| `RULE_CIRCULAR_DEPENDENCY` | 6001 | 规则引用图中检测到环                                                  |
| `RULE_DANGLING_REFERENCE`  | 6002 | 规则引用了不存在/已删除的题目 `client_key`                            |
| `RULE_INVALID_JUMP_TARGET` | 6003 | 跳转目标为自身，或目标题目 `order_index` 不晚于来源题目（非向后跳转） |

单次发布请求若同时存在多类违规，`violations` 数组内可包含多种 `type` 的条目；顶层 `code` 取 `violations[0]` 对应的类型码（前端应始终以 `data.violations` 全量列表做展示，`code` 仅用于兼容既有"单一错误码"客户端错误提示习惯）。

---

## 2. `POST /api/surveys/:id/validate-rules`（新增，规则预检）

供编辑器在设计者保存/修改规则后主动触发预检（User Story 5 acceptance scenario 4："设计者删除/修改被引用题目时立即提示"），不改变问卷状态，只读校验。

### Request

无请求体；路径参数 `:id` 为问卷 ID。鉴权与归属校验复用发布接口的既有中间件（仅问卷所属用户可调用）。

### Response

```ts
// 200，无论校验是否通过都返回 200 + sendSuccess，通过/不通过由 data.valid 区分
{
  code: 0,
  msg: "success",
  data: {
    valid: boolean,
    violations: RuleViolation[] // valid=true 时为空数组
  }
}
```

### 服务端实现

新增子模块 `app/q-server/src/modules/survey/survey-rule/`：

- `survey-rule.routes.ts`：注册本接口（GET 语义但读取自身规则配置属于查询操作，为与既有动作型接口风格一致仍用 `POST`，且不缓存）
- `survey-rule.service.ts`：读取问卷全部组件的 `client_key`/`order_index`/`logic`，调用 `validateRuleSet()`
- `survey-rule.schemas.ts`：`logic` JSON 结构的 Zod 校验（与 [survey-components.contract.md](./survey-components.contract.md) 共用）

`publish()` 内部的校验逻辑直接复用 `survey-rule.service.ts` 的同一函数，避免两处校验逻辑漂移。
