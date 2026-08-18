# 契约：Schema 校验与旧格式兼容转换

**范围**：`packages/survey-engine/src/core/schema/validator.ts` 与 `core/schema/compat.ts`。这两个函数是 `app/frontend`（及未来 `app/q-editor`）在加载问卷数据时必须经过的入口，直接决定 FR-006/SC-002/SC-005 是否达标。

## `validateSchema`

```ts
export interface SchemaValidationIssue {
  path: string; // 例如 "components[2].id"
  message: string;
}

export interface SchemaValidationResult {
  valid: boolean;
  issues: SchemaValidationIssue[];
}

export function validateSchema(schema: LowCodeSchema): SchemaValidationResult;
```

**契约约束**：

- 纯函数，不抛异常，任何校验失败都通过返回值的 `issues` 表达。
- 只校验 `LowCodeSchema`/`SchemaComponent` 结构层面的完整性（`id`/`clientKey` 唯一性、`name` 是否为已知题型），不校验 `FieldConfig.status` 内部的业务取值范围（如选项文案是否为空），后者属于各题型组件自身的编辑态校验，不属于本次改造范围。
- 不依赖任何渲染框架，可在 `core/` 独立测试环境中直接调用。

## `isLegacyComponent` / `toSchemaComponent`

```ts
export function isLegacyComponent(raw: unknown): boolean;
export function toSchemaComponent(raw: LegacySchemaComponent | SchemaComponent): SchemaComponent;
```

**判定规则**（详见 research.md R4）：

- `raw.type` 存在且不是 `string` 类型 → 判定为旧格式。
- `raw.status` 中任一字段配置对象存在 `editCom` 属性 → 判定为旧格式。
- `raw.schemaVersion` 不等于 `2`（包括缺失该字段）→ 判定为旧格式。

**转换行为**：

- 剥离 `type`/`status[*].editCom` 等运行时引用属性。
- 补齐 `schemaVersion: 2`。
- 其余字段（`id`/`name`/`clientKey`/`status` 内的配置值/`logic`）原样保留，不做值转换。
- 转换过程是纯函数、同步、无副作用，不写回任何持久化存储（FR-006"不需要专门的批量数据迁移脚本或数据库结构变更"）。

## 消费方调用顺序（契约级流程，对应 quickstart.md 场景 1）

```text
原始数据（可能新可能旧）
  → isLegacyComponent(raw) 逐题检测
    → 若旧格式：toSchemaComponent(raw) 转换
    → 若新格式：原样通过
  → 汇总为 LowCodeSchema
  → validateSchema(schema) 校验结构完整性
  → 校验通过后交给 adapters/vue3 渐染层（resolveVue3Component 按 name/editComName 查找组件）
```

## 验证方式（对应 FR-006、SC-002、SC-005）

1. 构造一份包含 `type`/`editCom` 属性的旧格式题目对象，经 `isLegacyComponent` 判定为 `true`，经 `toSchemaComponent` 转换后不再含任何函数/组件引用属性，可被 `JSON.stringify` 无损序列化。
2. 构造一份已经是新格式（`schemaVersion: 2`，无组件引用）的题目对象，经 `isLegacyComponent` 判定为 `false`，`toSchemaComponent` 返回值与输入在结构上等价（幂等）。
3. 对同一份问卷数据，转换前后分别喂给规则引擎（`resolveVisibility`/`resolveJump`/`resolveOptionPool`/`computeDerivedField`），求值结果必须完全一致（SC-005）。
