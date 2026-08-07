# Phase 1 数据模型：低代码问卷动态表单引擎

**输入**：[spec.md](./spec.md) · [research.md](./research.md)

本文档形式化本功能涉及的全部数据结构：`packages/survey-engine/src/logic/types.ts` 的 TypeScript 类型定义、`app/q-server/prisma/schema.prisma` 的字段级 diff、`packages/common/src/survey/survey.interface.ts` 的接口级 diff。所有类型均为判别式联合（discriminated union）+ `strict: true`，不含 `any`，对应 Constitution Principle II。

---

## 1. `packages/survey-engine/src/logic/types.ts`（新增文件）

### 1.1 基础引用与比较运算符

```ts
/** 稳定题目引用键，对应 SurveyComponent.client_key，规则内一律用它引用题目，不用 component_id/order_index */
export type ClientKey = string;

/** 比较运算符：覆盖 FR-001 要求的等于/不等于/包含/大于/小于等场景 */
export type ComparisonOperator =
  | "eq" // 等于
  | "neq" // 不等于
  | "contains" // 包含（text-list 语义：数组包含某文本；text 语义：子串包含）
  | "notContains"
  | "gt" // 大于（number 语义）
  | "gte"
  | "lt"
  | "lte"
  | "isEmpty" // 未作答/空值
  | "isNotEmpty";

/** 条件组的组合方式 */
export type LogicCombinator = "AND" | "OR";
```

### 1.2 答案值规范化（research.md §3）

```ts
/** 原始运行时答案值：14 种题型的异构存储形态，仅用于 normalizeAnswerValue 的输入 */
export type RawAnswerValue =
  | string
  | number
  | string[]
  | Date
  | Record<number, number> // 矩阵题：行索引 → 列索引
  | null
  | undefined;

/** 规范化后的答案值：条件比较运算符只对这个联合类型操作，不感知具体题型 */
export type NormalizedValue =
  | { kind: "text"; value: string }
  | { kind: "number"; value: number }
  | { kind: "text-list"; value: string[] }
  | { kind: "matrix"; value: Record<string, number> }
  | { kind: "empty" }; // 未作答，区别于空字符串/空数组，用于 isEmpty/isNotEmpty 判定

/**
 * 将某题目的原始答案值规范化为统一比较形态。
 * single-select 分支显式将存储的选项索引转换为对应选项的文本值，
 * 与 option-select/multi-select 保持一致语义（不修复底层存储，只在此层规范化）。
 */
export declare function normalizeAnswerValue(
  material: MaterialType,
  rawValue: RawAnswerValue,
  comConfig: unknown
): NormalizedValue;
```

### 1.3 单条条件与条件组（Condition Group）

```ts
/** 单条比较条件：以某题目当前答案与给定值比较 */
export interface Condition {
  /** 条件依据的题目（必须是同一问卷内、先于当前作用目标出现的题目） */
  sourceKey: ClientKey;
  operator: ComparisonOperator;
  /** 比较值；isEmpty/isNotEmpty 时忽略该字段 */
  value?: string | number | string[];
}

/** 条件组：一组 Condition 以 AND/OR 组合，对应 Key Entities 的"条件组" */
export interface ConditionGroup {
  combinator: LogicCombinator;
  conditions: Condition[];
}
```

### 1.4 显示/隐藏规则（User Story 1，含 baseVisibility 冲突裁决模型）

> 设计说明：为同时表达"默认隐藏，满足条件才显示"与"默认显示，满足条件才隐藏"两种主流问卷工具的常见配置模式，并直接实现 Clarification Q2"隐藏优先胜出"的裁决语义，`QuestionVisibilityConfig` 引入 `baseVisibility` 字段作为无规则命中时的默认态，再叠加一组带方向（`show`/`hide`）的规则；最终可见性按下述固定顺序解析：**任一 `hide` 规则命中 → 隐藏；否则任一 `show` 规则命中 → 显示；否则 → `baseVisibility`**。

```ts
export type VisibilityAction = "show" | "hide";

export interface VisibilityRule {
  action: VisibilityAction;
  condition: ConditionGroup;
}

export interface QuestionVisibilityConfig {
  /** 无规则命中时的默认可见性；默认 "visible" */
  baseVisibility: "visible" | "hidden";
  /** 按 action 分别可配置多条规则；裁决顺序见上方类型说明 */
  rules: VisibilityRule[];
}

/**
 * 解析题目最终可见性。
 * 隐藏优先胜出（FR-002 / Clarification Q2）：只要有一条 hide 规则命中即隐藏。
 */
export declare function resolveVisibility(
  config: QuestionVisibilityConfig | undefined,
  answers: Record<ClientKey, NormalizedValue>
): "visible" | "hidden";
```

### 1.5 跳转规则（User Story 2）

```ts
export type JumpTargetType = "question" | "endSurvey";

export interface JumpTarget {
  type: JumpTargetType;
  /** type === "question" 时必填，指向跳转目标题目 */
  targetKey?: ClientKey;
}

export interface JumpRule {
  condition: ConditionGroup;
  target: JumpTarget;
}

export interface QuestionJumpConfig {
  /**
   * 按配置顺序排列；同时满足触发条件时取第一条命中规则生效
   * （FR-003 / Clarification Q2 跳转裁决语义）
   */
  rules: JumpRule[];
}

/** 返回第一条条件命中的跳转规则，无命中时返回 null（表示不跳转，走顺序下一题） */
export declare function resolveJump(
  config: QuestionJumpConfig | undefined,
  answers: Record<ClientKey, NormalizedValue>
): JumpRule | null;
```

### 1.6 选项依赖映射（User Story 3）

```ts
/** 某题目的候选选项集合依赖另一题目的具体答案值 */
export interface OptionDependencyMapping {
  /** 被依赖的题目（联动的答案来源） */
  dependsOnKey: ClientKey;
  /** 依赖题目的答案值 → 本题目候选选项值集合 */
  optionsByAnswer: Record<string, string[]>;
  /** dependsOnKey 尚未作答时，本题目候选集合的展示策略 */
  emptyStrategy: "empty" | "promptFillDependency";
}

/**
 * 求解某题目当前应展示的候选选项集合。
 * 若依赖题目答案变化导致已选值不再属于新候选集合，调用方须清空该题已选值（FR-004）。
 */
export declare function resolveOptionPool(
  mapping: OptionDependencyMapping,
  answers: Record<ClientKey, NormalizedValue>
): string[] | { prompt: true };
```

### 1.7 派生计算字段（User Story 4，research.md §5）

```ts
export type ComputedFieldFormula =
  | { kind: "sum"; sourceKeys: ClientKey[] }
  | { kind: "weightedSum"; sources: Array<{ key: ClientKey; weight: number }> };

export interface ComputedFieldConfig {
  formula: ComputedFieldFormula;
  /** 参与计算的题目未全部作答时的降级策略；默认 "treatAsZero"（对应 spec User Story 4 场景 4） */
  incompleteStrategy: "treatAsZero" | "skipCalculation";
  /** 计算结果是否对填写者可见展示（只读） */
  visibleToFiller: boolean;
}

/** 计算结果为 null 表示因 incompleteStrategy === "skipCalculation" 而未产出值 */
export declare function computeDerivedField(
  config: ComputedFieldConfig,
  answers: Record<ClientKey, NormalizedValue>
): number | null;
```

### 1.8 单题目的完整逻辑配置容器

```ts
/**
 * SurveyComponent.logic 列反序列化后的类型；对应"逻辑规则"顶层容器。
 * 四种能力互相独立、均可选，一个题目可以同时配置多种（如既是跳转来源又是联动目标）。
 */
export interface QuestionLogicConfig {
  visibility?: QuestionVisibilityConfig;
  jump?: QuestionJumpConfig;
  optionDependency?: OptionDependencyMapping;
  /** 仅当该题目本身是 Material.ComputedField 伪题型时存在 */
  computedField?: ComputedFieldConfig;
}
```

### 1.9 发布时规则校验结果（User Story 5，research.md §6）

```ts
export type RuleViolationType = "circularDependency" | "danglingReference" | "invalidJumpTarget";

export interface RuleViolation {
  type: RuleViolationType;
  /** 涉及的题目 client_key，circularDependency 时为环上全部题目 */
  involvedKeys: ClientKey[];
  message: string;
}

export interface RuleValidationResult {
  valid: boolean;
  violations: RuleViolation[];
}

/**
 * 对整份问卷的全部题目 logic 配置做完整性校验：
 * - circularDependency：以"规则来源题目 → 目标题目"为有向边，DFS 三色标记法检测环
 * - danglingReference：sourceKey/targetKey 不在当前题目集合（client_key 全集）中
 * - invalidJumpTarget：跳转目标为自身，或目标 order_index 不晚于来源（仅支持向后跳转）
 */
export declare function validateRuleSet(
  components: Array<{ clientKey: ClientKey; orderIndex: number; logic: QuestionLogicConfig | null }>
): RuleValidationResult;
```

---

## 2. Prisma Schema Diff（`app/q-server/prisma/schema.prisma`）

### 2.1 `SurveyComponent`（现有 107-124 行，新增两个可空列）

```prisma
model SurveyComponent {
  id           BigInt   @id @default(autoincrement())
  survey_id    BigInt
  type         String
  config       Json
  order_index  Int      @default(0)
  required     Int      @default(0)
  created_at   DateTime @default(now())
  updated_at   DateTime @updatedAt

  // 新增：稳定题目引用键，替换/补充 id 在"先删后建"场景下的不稳定性（research.md §2）
  client_key   String?  @db.VarChar(64)
  // 新增：该题目自身的动态规则配置，序列化自 QuestionLogicConfig；NULL = 未启用任何规则
  logic        Json?

  survey       Survey   @relation(fields: [survey_id], references: [id])
  answers      Answer[]

  @@index([survey_id, client_key])
}
```

- 两列均 `NULL` 默认，不需要为存量行回填。
- 新增复合索引 `(survey_id, client_key)`：`survey-rule` 校验与规则求值均按 `survey_id` 批量读取全部题目并按 `client_key` 查找，避免全表扫描。

### 2.2 `Answer`（现有 207-222 行，新增一个可空列）

```prisma
model Answer {
  id            BigInt    @id @default(autoincrement())
  response_id   BigInt
  component_id  BigInt
  value         String?
  values        Json?
  created_at    DateTime  @default(now())

  // 新增：区分"正常作答/因规则隐藏跳过/展示但主动留空"（research.md §7）
  // 0 = 正常作答（历史行未设置该列时隐含此值，向后兼容）
  // 1 = 因规则被隐藏/跳过
  // 2 = 展示但主动留空
  answer_status SMALLINT?

  response      Response  @relation(fields: [response_id], references: [id])
  component     SurveyComponent @relation(fields: [component_id], references: [id])
}
```

- 不改变现有列语义；历史行 `answer_status IS NULL` 在读取侧统一按"0/正常作答"解释（FR-013 零重解释保证）。

---

## 3. `packages/common/src/survey/survey.interface.ts` Diff

```ts
// SurveyComponentPayload：问卷保存/详情接口的组件负载，新增两个可选字段
export interface SurveyComponentPayload {
  // ...既有字段（id/type/config/order_index/required 等）保持不变
  /** 稳定题目引用键；新增题目时由前端生成 UUID，已存在题目透传原值 */
  client_key?: string;
  /** 该题目的动态规则配置；未启用规则时为 null/undefined */
  logic?: QuestionLogicConfig | null;
}

// AnswerItem：提交答卷/查询答卷接口的答案负载，新增一个可选字段
export interface AnswerItem {
  // ...既有字段（component_id/value/values 等）保持不变
  /** 0=正常作答 1=因规则隐藏跳过 2=展示但主动留空；未传时后端按 0 处理 */
  answer_status?: 0 | 1 | 2;
}
```

- `QuestionLogicConfig` 从 `packages/survey-engine` 的 `src/logic/types.ts` 导入并在 `packages/common` 内重导出（`packages/common` 不重复定义规则类型，避免双份定义漂移）。
- BigInt 字段序列化规则、枚举镜像 Prisma schema 的既有约定不变（本次新增字段均为原生 JSON 可序列化类型，无 BigInt 序列化新增关注点）。

---

## 4. 实体关系小结

```
Survey 1───N SurveyComponent（新增 client_key/logic）
                  │ client_key 被规则引用（同问卷内）
                  │
              QuestionLogicConfig
                  ├─ visibility: QuestionVisibilityConfig ─ VisibilityRule[] ─ ConditionGroup ─ Condition[]
                  ├─ jump: QuestionJumpConfig ─ JumpRule[] ─ ConditionGroup + JumpTarget
                  ├─ optionDependency: OptionDependencyMapping
                  └─ computedField: ComputedFieldConfig（仅 Material.ComputedField 伪题型持有）

Response 1───N Answer（新增 answer_status，按 component_id 关联 SurveyComponent）

发布校验：Survey → 全部 SurveyComponent.logic → validateRuleSet() → RuleValidationResult
```

所有实体与字段均已覆盖 spec.md 的 Key Entities（逻辑规则/条件组/派生字段/选项依赖映射/问卷动态规则校验结果）。
