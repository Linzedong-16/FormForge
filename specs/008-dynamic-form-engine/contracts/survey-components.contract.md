# 契约：问卷组件保存接口新增规则字段

## `PUT /api/surveys/:id`

既有行为（问卷编辑保存，内部调用 `replaceComponents()` 对该问卷全部组件做删除重建）不变。请求体 `coms[]` 数组中每个组件对象新增两个可选字段：

### Request Body（新增字段，其余既有字段不变）

```ts
interface SurveyComponentPayload {
  // ...既有字段：type/config/order_index/required 等
  /**
   * 稳定题目引用键。前端负责生成与维护：
   * - 新增题目：生成一个新的 UUID v4
   * - 已存在题目：原样透传上一次保存返回的 client_key，不得重新生成
   * 省略该字段等价于传 null（视为未参与任何规则引用，仍可正常保存/渲染）
   */
  client_key?: string;
  /**
   * 该题目的动态规则配置，结构见 packages/survey-engine 的 QuestionLogicConfig。
   * null 或省略 = 该题目未启用任何动态规则。
   */
  logic?: QuestionLogicConfig | null;
}
```

### 服务端处理

1. Zod 校验（`survey-crud.schemas.ts` 新增/扩展 schema）：`client_key` 若存在必须是长度 ≤64 的字符串；`logic` 若存在必须符合 `QuestionLogicConfig` 的 JSON Schema（由 `survey-rule.schemas.ts` 提供，供本接口与 `survey-rule` 模块共用同一份 Zod 定义）。
2. `replaceComponents()` 在重建组件行时：
   - 若请求体携带 `client_key`，原样写入新行的 `client_key` 列；
   - 若请求体未携带（历史存量题目首次经过本功能上线后的保存路径），服务端生成一个新 UUID 写入，保证后续保存起该题目引用键即可稳定。
   - `logic` 字段按请求体原样写入 `logic` 列（`undefined`/`null` 均写为 `NULL`）。
3. 本接口本身**不**执行 `validateRuleSet()` 校验（保存态允许规则临时不完整/存在错误，校验只在发布时强制拦截，见 [survey-publish.contract.md](./survey-publish.contract.md)），保持"保存宽松、发布严格"的既有问卷编辑体验一致性。

### Response

不变（沿用既有 `SurveyDetailResponse` 结构），`data.coms[]` 内每项新增回显 `client_key`/`logic`。

### 兼容性

历史客户端（未升级的前端）若请求体不携带这两个字段，保存行为与上线前完全一致（FR-010）——服务端仅补齐 `client_key` 自动生成，不影响任何既有列的读写路径。
