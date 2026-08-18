# Phase 1 数据模型：低代码引擎核心解耦

本文档定义解耦后 `packages/survey-engine` 核心包（`src/core/`）对外暴露的数据实体。均为纯 TypeScript 类型/接口，不含任何框架专属类型。字段命名尽量沿用现有代码中已使用的名称，降低迁移改动面。

## 1. LowCodeSchema（问卷 Schema）

对应 spec.md Key Entities 中的 `LowCodeSchema`，是一份问卷的顶层容器。

```ts
export interface LowCodeSchema {
  /** Schema 结构版本号，新格式恒为 2；缺失时按旧格式（1）处理，见 R4 兼容转换规则 */
  schemaVersion: 2;
  /** 题目列表，顺序即问卷展示顺序 */
  components: SchemaComponent[];
}
```

**校验规则**（`core/schema/validator.ts`）：

- `components` 必须是数组（可为空数组，代表尚未添加任何题目）。
- 每个 `SchemaComponent.id` 在 `components` 内必须唯一。
- 每个 `SchemaComponent.clientKey`（若存在）在 `components` 内必须唯一（对应现有 `client_key` 稳定引用键，FR-009）。
- 每个 `SchemaComponent.name` 必须是已知的 `Material` 字符串字面量之一（新增题型时同步扩展该联合类型）。

## 2. SchemaComponent（题目/组件描述）

对应现有 `Status`，是 `LowCodeSchema.components` 的元素类型，去除了组件运行时引用。

```ts
export interface SchemaComponent {
  /** 题型字符串标识，替代现有 Status.type 承担的"选哪个组件渲染"职责 */
  name: Material;
  /** 题目唯一 id（现有字段，语义不变） */
  id: string;
  /** 稳定引用键，供规则引擎 client_key 语义使用（现有字段，语义不变，FR-009） */
  clientKey?: ClientKey;
  /** 题目的字段级配置集合，key 为字段名（title/desc/position/...），value 为 FieldConfig */
  status: Record<string, FieldConfig>;
  /** 可选的规则配置（可见性/跳转/选项联动/派生字段），现有 QuestionLogicConfig 类型不变 */
  logic?: QuestionLogicConfig;
}
```

**与现有 `Status` 的差异**：移除 `type: VueComType` 字段；`status` 的值类型从 `TextProps | OptionsProps`（内含 `editCom: VueComType`）改为下方的 `FieldConfig`（内含 `editComName: EditComName` 字符串）。

## 3. FieldConfig（字段级配置）

对应现有 `BaseProps`/`TextProps`/`OptionsProps`，去除组件引用后的纯数据形态。

```ts
export interface BaseFieldConfig {
  id: string;
  isShow: boolean;
  name: string;
  /** 替代现有 BaseProps.editCom: VueComType，字符串标识该字段使用哪个编辑器组件 */
  editComName: EditComName;
  isUse?: boolean;
}

export interface TextFieldConfig extends BaseFieldConfig {
  status: string;
}

export interface OptionsFieldConfig extends BaseFieldConfig {
  status: OptionsStatusArr; // 类型不变：StringStatusArr | ValueStatusArr | PicTitleDescStatusArr | CascaderStatusArr
  currentStatus: number;
}

export type FieldConfig = TextFieldConfig | OptionsFieldConfig;
```

`OptionsStatusArr`、`ValueStatusArr`、`PicTitleDescStatusArr`、`CascaderStatusArr` 等类型原样从 `types/editProps.ts` 迁移到 `core/schema/types.ts`，字段结构不变，仅去除对 `VueComType` 的依赖（这些类型本身从未依赖过 Vue，属于随 `editProps.ts` 整体迁移的"顺带"部分）。

## 4. ComponentFactory（组件工厂）

对应 spec.md Key Entities 中的 `ComponentFactory`，框架无关契约 + Vue3 具体实现（详见 research.md R3）。

```ts
// core/factory/index.ts —— 框架无关契约
export interface ComponentFactory<TComponent> {
  register(name: string, component: TComponent): void;
  resolve(name: string): TComponent | undefined;
  has(name: string): boolean;
}

// adapters/vue3/componentFactory.ts —— Vue3 具体实现（示意，不代表最终实现细节）
export const vue3ComponentFactory: ComponentFactory<VueComType>;
export function resolveVue3Component(name: string): VueComType | undefined;
```

**状态转移**：无——工厂内部是一个简单的 key-value 注册表，模块加载时一次性注册全部现有 `componentMap` 条目，运行期只读查找，不存在动态增删场景（新增题型属于代码变更，不属于运行时状态转移）。

## 5. RuleEngine（规则引擎）

沿用现有 `src/logic/` 导出的全部类型与函数，物理位置迁移至 `core/logic/`，符号名称、函数签名、算法逻辑均不变（`normalizeAnswerValue`、`resolveVisibility`、`resolveJump`、`resolveOptionPool`、`computeDerivedField`、`validateRuleSet` 及其类型 `ClientKey`/`ComparisonOperator`/`Condition`/`ConditionGroup`/`VisibilityRule`/`JumpRule`/`OptionDependencyMapping`/`ComputedFieldConfig`/`QuestionLogicConfig`/`RuleViolation` 等）。`useRuleRuntime`（依赖 Vue 的 composable 包装）迁移至 `adapters/vue3/`，其对外的组合式 API 形态不变，仅物理位置调整。

`QuestionLogicConfig` 作为 `SchemaComponent.logic` 字段的类型，随 `core/logic/types.ts` 一并迁移，不需要单独重新定义。

## 6. OrchestrationState（编排状态）

对应 spec.md Key Entities 中的 `OrchestrationState`。数据本身继续由宿主项目持有，`core/orchestration/undoManager.ts` 仅提供无框架依赖的纯逻辑管理器：

```ts
// core/orchestration/undoManager.ts —— 物理迁移自 src/utils/undoManager.ts，实现不变
export class UndoManager {
  push(snapshot: Snapshot): void;
  undo(currentSnapshot: Snapshot): Snapshot | null;
  redo(currentSnapshot: Snapshot): Snapshot | null;
  clear(): void;
  get canUndo(): boolean;
  get canRedo(): boolean;
}
export interface Snapshot {
  /* 现有字段不变，历史层数上限行为不变（FR-005 Acceptance Scenario 1） */
}
```

`stores/useEditor.ts` 中的其余编排状态（`dirty`、`currentPage`、`pageSize`、`surveyCount`、`canUndo`/`canRedo` 的响应式镜像）继续留在 Pinia store 内，属于"宿主项目选用 Pinia 时的具体持有方式"，不下沉进 `core/`（与 FR-005"数据本身仍由宿主项目状态管理持有"一致）。

## 实体关系图（概念级）

```text
LowCodeSchema
 └─ components: SchemaComponent[]
     ├─ name: Material  ────────────► ComponentFactory.resolve(name) → 渲染层组件（Vue3 工厂查找结果）
     ├─ clientKey: ClientKey  ──────► RuleEngine（可见性/跳转/联动/派生字段求值以 clientKey 为引用键）
     ├─ status: Record<string, FieldConfig>
     │   └─ editComName: EditComName ► ComponentFactory.resolve(editComName) → 字段编辑器组件（宿主编辑场景使用）
     └─ logic?: QuestionLogicConfig ─► RuleEngine（校验/求值输入）

OrchestrationState（宿主持有，如 Pinia store）
 └─ 调用 core/orchestration/UndoManager 完成 push/undo/redo，快照内容通常是 LowCodeSchema.components 的序列化片段
```
