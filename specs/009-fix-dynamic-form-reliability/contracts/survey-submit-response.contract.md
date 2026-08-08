# 契约：答卷提交接口的作答状态如实上报

## `POST /api/surveys/:id/responses`（`submitResponse`，行为变更，请求形状为既有可选字段的实际启用，响应形状不变）

### 请求 JSON 形状

不变（该字段已在 008 中定义，本次修复是"启用其实际传递"，非新增字段）：

```ts
{
  answers: Array<{
    order_index: number;
    value?: string | number | Date;
    values?: string[] | Record<number, number>;
    answer_status?: 0 | 1 | 2; // 0=正常填写 1=被规则隐藏跳过 2=展示但留空；省略时后端按旧客户端语义处理
  }>;
}
```

### 内部行为变更（`app/q-editor` 侧）

修复前：`SurveyView.vue` 的 `submitAnswers()` 在 `answers.value[c.key]` 为空时直接跳过该题目，使其完全不出现在 `answers[]` 中，`answer_status` 无从传递。

修复后：仅当该问卷存在至少一个 `logic` 配置时，`submitAnswers()` 在构建 `answers[]` 前额外计算：

```ts
const hiddenKeys = allComponentKeys - visibleComs 对应的 key 集合;      // 被规则隐藏跳过
const emptyVisibleKeys = visibleComs 中 answers.value[key] 为空的题目;   // 展示但留空
```

并为 `hiddenKeys` 补充 `answer_status: 1` 的空值条目，为 `emptyVisibleKeys` 补充 `answer_status: 2` 的空值条目；正常填写题目的现有序列化逻辑不变。

不含任何 `logic` 配置的问卷（普通问卷）：`submitAnswers()` 不触发上述补全逻辑，提交负载与修复前逐字节一致。

### 后端行为（确认不变，无需修改）

`survey-crud.service.ts` 的 `submitResponse()` 事务体中 `isUpgradedClient` 分支已正确实现：

- 任一 `answers[]` 条目携带 `answer_status` → 视为"已升级客户端"，全部条目原样落库（缺省 `answer_status` 默认 0）。
- 均未携带 → 视为"旧客户端"，仅落库有 `value`/`values` 的条目，`answer_status` 统一为 0，行为与修复前一致。

### 验证方式（对应 quickstart.md 场景二）

1. 配置一道隐藏规则题与一道普通题，均不填写普通题的答案。
2. 按会触发隐藏规则的路径填写并提交。
3. 核对提交负载 `answers[]` 中，被隐藏题目条目的 `answer_status === 1`，普通题目条目的 `answer_status === 2`（或 `0`，取决于是否填写），且均携带 `order_index`。
4. 核对数据库 `survey_response_item.answer_status` 落库结果与提交负载一致。

### 回归约束

不含任何 `logic` 配置的问卷、以及未升级的旧版本填写端客户端（不发送 `answer_status` 字段的场景），提交行为与落库结果必须与修复前完全一致。
