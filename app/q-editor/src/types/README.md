# Types 目录说明

## 目录概述

`types` 目录存放项目所有的 TypeScript 类型定义文件。这些类型定义提供了完整的类型检查支持，确保代码的类型安全，提高开发效率和代码质量。

## 文件结构

```
types/
├── index.ts           # 类型定义入口，导出所有类型
├── common.ts          # 通用类型定义
├── db.ts              # 数据库相关类型
├── editProps.ts       # 编辑属性类型
├── editor.ts          # 编辑器相关类型
├── eventBus.ts        # 事件总线类型
├── material.ts        # 素材组件类型
└── store.ts           # 状态管理类型
```

## 核心文件详解

### 1. index.ts（类型定义入口）

**功能**：集中导出所有类型定义，作为类型模块的统一入口。

**导出内容**：

- 重导出其他文件的所有类型
- 定义全局通用的类型别名
- 提供类型守卫函数

**主要类型守卫函数**：

#### isStringArray（字符串数组类型守卫）

```typescript
export function isStringArray(value: any): value is string[];
```

**功能**：检查值是否为字符串数组。

**使用场景**：

```typescript
if (isStringArray(optionsProps.status)) {
  // TypeScript 知道这里是 string[]
  optionsProps.status.push("新选项");
}
```

#### isPicTitleDescArray（图片描述数组类型守卫）

```typescript
export function isPicTitleDescArray(value: any): value is PicTitleDesc[];
```

**功能**：检查值是否为图片描述对象数组。

#### isSurveyComName（问卷组件名称守卫）

```typescript
export function isSurveyComName(name: string): name is SurveyComName;
```

**功能**：检查字符串是否为有效的问卷组件名称。

### 2. common.ts（通用类型定义）

**功能**：定义项目中通用的基础类型。

**主要类型**：

#### Material（素材类型）

```typescript
export type Material =
  | "single-select"
  | "multi-select"
  | "option-select"
  | "single-pic-select"
  | "multi-pic-select"
  | "text-input"
  | "rate-score"
  | "date-time"
  | "text-note"
  | "personal-info-name"
  | "personal-info-id";
// ... 更多素材类型
```

**说明**：定义了所有可用的素材组件类型，用于类型约束和代码提示。

#### SurveyComName（问卷组件名称）

```typescript
export type SurveyComName =
  | "single-select"
  | "multi-select"
  | "option-select"
  | "single-pic-select"
  | "multi-pic-select"
  | "text-input"
  | "rate-score"
  | "date-time"
  | "text-note";
```

**说明**：定义了可以在问卷中使用的组件名称。

#### PicTitleDesc（图片描述对象）

```typescript
export interface PicTitleDesc {
  value: string; // 图片链接
  picTitle: string; // 图片标题
  picDesc: string; // 图片描述
}
```

**说明**：用于图片选择类组件的选项数据结构。

### 3. db.ts（数据库相关类型）

**功能**：定义 IndexedDB 数据库操作相关的类型。

**主要类型**：

#### SurveyDBData（问卷数据库数据）

```typescript
export interface SurveyDBData {
  id?: number; // 问卷ID（可选，新增时自动生成）
  title: string; // 问卷标题
  coms: Status[]; // 组件列表
  surveyCount: number; // 题目数量
  createDate: string; // 创建日期
  updateDate: string; // 更新日期
}
```

**说明**：定义了保存到数据库的问卷数据结构。

#### SurveyDBReturnData（问卷返回数据）

```typescript
export interface SurveyDBReturnData extends SurveyDBData {
  id: number; // ID 必存在
}
```

**说明**：从数据库查询返回的问卷数据，ID 一定存在。

### 4. editProps.ts（编辑属性类型）

**功能**：定义组件编辑属性的类型。

**主要类型**：

#### TextProps（文本属性）

```typescript
export interface TextProps {
  id: string; // 属性ID
  status: string; // 文本内容
  isShow: boolean; // 是否显示
  editCom: Component; // 编辑组件
  name: string; // 属性名称
}
```

**说明**：用于文本类编辑属性（如标题、描述）。

#### OptionsProps（选项属性）

```typescript
export interface OptionsProps {
  id: string; // 属性ID
  currentStatus: number; // 当前选中索引
  status: string[] | PicTitleDesc[]; // 选项列表
  isShow: boolean; // 是否显示
  isUse?: boolean; // 是否使用
  editCom: Component; // 编辑组件
  name: string; // 属性名称
}
```

**说明**：用于选项类编辑属性（如单选、多选的选项）。

#### TypeStatus（类型状态）

```typescript
export interface TypeStatus {
  type: OptionsProps; // 类型选择
  title: TextProps; // 标题
  desc: TextProps; // 描述
  position: OptionsProps; // 位置
  titleSize: OptionsProps; // 标题大小
  descSize: OptionsProps; // 描述大小
  // ... 更多属性
}
```

**说明**：文本说明类组件的完整状态结构。

### 5. editor.ts（编辑器相关类型）

**功能**：定义编辑器相关的类型。

**主要类型**：

#### Status（组件状态）

```typescript
export interface Status {
  name: SurveyComName | "text-note"; // 组件名称
  status: TypeStatus | OptionsStatus; // 组件状态
}
```

**说明**：编辑器中组件的完整状态定义。

#### UpdateStatus（更新状态函数类型）

```typescript
export type UpdateStatus = (
  configKey: string,
  payload?: number | string | boolean | object,
  isShowChange?: boolean
) => void;
```

**说明**：定义了更新组件状态的函数签名。

#### GetLink（获取链接函数类型）

```typescript
export type GetLink = (link: PicLink) => void;
```

**说明**：定义了获取图片链接的函数签名。

### 6. eventBus.ts（事件总线类型）

**功能**：定义事件总线的事件类型。

**主要类型**：

#### EventBusType（事件总线类型）

```typescript
export interface EventBusType {
  "survey-saved": { id: number };
  "component-added": { type: string; index: number };
  "component-removed": { index: number };
  "component-updated": { index: number; key: string };
}
```

**说明**：定义了所有可用的事件名称和对应的参数类型。

### 7. material.ts（素材组件类型）

**功能**：定义素材库相关的类型。

**主要类型**：

#### MaterialConfig（素材配置）

```typescript
export interface MaterialConfig {
  type: Material; // 素材类型
  title: string; // 素材标题
  icon: string; // 素材图标
  description: string; // 素材描述
  component: Component; // 组件引用
}
```

**说明**：素材库中每个素材的配置信息。

### 8. store.ts（状态管理类型）

**功能**：定义 Pinia 状态管理相关的类型。

**主要类型**：

#### EditorStore（编辑器状态库）

```typescript
export interface EditorStore {
  currentComponentIndex: number; // 当前选中组件索引
  surveyCount: number; // 题目数量
  coms: Status[]; // 组件列表

  // Actions
  setCurrentComponentIndex(index: number): void;
  addCom(coms: Status[], newCom: Status): void;
  removeCom(index: number): void;
  resetComs(): void;
  setStore(storeStatus: SurveyDBData): void;
  initStore(): void;
}
```

**说明**：编辑器状态库的完整类型定义。

#### MaterialStore（素材状态库）

```typescript
export interface MaterialStore {
  currentMaterialCom: Material; // 当前选中的素材
  coms: Record<Material, Status>; // 素材配置映射

  // Actions
  setCurrentSurveyCom(com: Material): void;
  addOption(optionProps: OptionsProps): void;
  removeOption(optionProps: OptionsProps, index: number): boolean;
  // ... 更多操作
}
```

**说明**：素材状态库的完整类型定义。

## 使用规范

### 1. 类型导入方式

```typescript
// 方式一：从入口文件导入（推荐）
import type { Status, Material, UpdateStatus } from "@/types";

// 方式二：从具体文件导入
import type { SurveyDBData } from "@/types/db";
import type { TextProps } from "@/types/editProps";
```

### 2. 类型定义原则

1. **语义化命名**：类型名称应该清晰表达其含义
2. **单一职责**：每个类型应该只描述一种数据结构
3. **可扩展性**：使用接口（interface）而非类型别名（type）定义对象类型，便于扩展
4. **文档注释**：复杂类型需要添加 JSDoc 注释

### 3. 类型守卫使用

```typescript
import { isStringArray, isPicTitleDescArray } from "@/types";

function handleOptions(options: OptionsProps) {
  if (isStringArray(options.status)) {
    // 处理字符串选项
    options.status.forEach(option => {
      console.log(option);
    });
  } else if (isPicTitleDescArray(options.status)) {
    // 处理图片描述选项
    options.status.forEach(option => {
      console.log(option.picTitle);
    });
  }
}
```

## 开发建议

1. **类型文件组织**：
   - 按功能模块划分类型文件
   - 在 `index.ts` 中统一导出
   - 避免循环依赖

2. **类型定义最佳实践**：
   - 优先使用 `interface` 定义对象类型
   - 使用 `type` 定义联合类型和工具类型
   - 为函数参数和返回值添加类型注解
   - 使用泛型提高类型复用性

3. **类型安全**：
   - 启用 TypeScript 严格模式
   - 避免使用 `any` 类型
   - 使用类型守卫进行类型收窄
   - 为第三方库添加类型声明

## 示例代码

### 定义新的类型

```typescript
// types/survey.ts

/**
 * 问卷提交数据
 */
export interface SurveySubmitData {
  surveyId: number; // 问卷ID
  answers: Answer[]; // 答案列表
  submitTime: string; // 提交时间
  respondent?: RespondentInfo; // 受访者信息（可选）
}

/**
 * 单个答案
 */
export interface Answer {
  questionId: string; // 问题ID
  questionType: SurveyComName; // 问题类型
  value: string | string[]; // 答案值
}

/**
 * 受访者信息
 */
export interface RespondentInfo {
  name?: string;
  phone?: string;
  email?: string;
}
```

### 在组件中使用类型

```vue
<script setup lang="ts">
import type { SurveySubmitData, Answer } from "@/types/survey";

const submitData = ref<SurveySubmitData>({
  surveyId: 0,
  answers: [],
  submitTime: new Date().toISOString()
});

const addAnswer = (answer: Answer) => {
  submitData.value.answers.push(answer);
};
</script>
```
