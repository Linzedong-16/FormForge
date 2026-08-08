# 契约：问卷创建接口的组件持久化行为纠正

## `POST /api/surveys`（行为变更，请求/响应形状不变）

### 请求 / 响应 JSON 形状

不变。请求体 `components[]` 中每一项仍是既有的 `SurveyComponentInput`（含可选 `client_key`、可选 `logic`），响应体仍是 `sendSuccess(survey)` 信封，`survey.components[]` 字段结构不变。

### 内部行为变更

修复前：`create()` 内联调用 `tx.surveyComponent.createMany(...)`，字段映射列表遗漏 `client_key` 与 `logic`，两者无论请求体是否提供，落库结果均为 `NULL`。

修复后：`create()` 改为调用私有方法 `this.replaceComponents(tx, created.id, components ?? [])`，映射规则与既有 `update()`/`submitReview()`/`applyTemplate()` 完全一致：

```ts
{
  client_key: c.client_key ?? randomUUID(),   // 未提供时兜底生成，保证后续规则引用可用
  logic: c.logic ?? Prisma.DbNull,             // 未提供时写入 SQL NULL，而非丢弃字段
  // ...其余既有字段映射不变
}
```

### 验证方式（对应 quickstart.md 场景一）

1. 调用创建接口，`components[]` 中至少一项携带非空 `logic`。
2. 仅创建一次，不触发任何后续更新。
3. 通过 `GET /api/surveys/:id` 或等价读取路径确认返回的 `components[].client_key`/`components[].logic` 与请求体一致。

### 回归约束

`components[]` 中不携带任何 `client_key`/`logic`（即现有普通问卷创建请求）的行为必须与修复前完全一致：`client_key` 仍被兜底生成为新 UUID，`logic` 仍为 `null`，不产生任何新的响应字段或错误。
