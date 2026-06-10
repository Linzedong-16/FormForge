# 电子签名组件技术方案

---

## 一、需求分析

### 1.1 业务背景

在问卷场景中，部分业务（如合同签署、审批流程、确认声明等）需要用户进行手写签名。当前系统缺乏电子签名能力，需要新增专门的签名组件。

### 1.2 功能需求

| 需求编号 | 需求描述                     | 优先级 |
| -------- | ---------------------------- | ------ |
| SIG-001  | 支持鼠标手写签名（桌面端）   | 高     |
| SIG-002  | 支持触摸屏手写签名（移动端） | 高     |
| SIG-003  | 支持签名撤销/回退操作        | 高     |
| SIG-004  | 支持签名清空重置             | 高     |
| SIG-005  | 支持签名图片导出（PNG格式）  | 高     |
| SIG-006  | 支持签名颜色选择             | 中     |
| SIG-007  | 支持签名笔粗细调整           | 中     |
| SIG-008  | 签名状态验证（是否已签名）   | 高     |
| SIG-009  | 支持显示/隐藏操作按钮        | 中     |
| SIG-010  | 支持自定义签名区域尺寸       | 中     |

### 1.3 非功能需求

| 需求编号 | 需求描述                                      | 优先级 |
| -------- | --------------------------------------------- | ------ |
| SIG-NF01 | 响应式设计，支持各种屏幕尺寸                  | 高     |
| SIG-NF02 | 流畅的绘制体验（≥60fps）                      | 高     |
| SIG-NF03 | 跨浏览器兼容（Chrome、Firefox、Safari、Edge） | 高     |
| SIG-NF04 | 移动端触摸事件兼容                            | 高     |
| SIG-NF05 | 签名数据可序列化存储                          | 高     |

---

## 二、架构设计

### 2.1 组件定位

```
问卷编辑器组件体系
├── 选择题组件（SingleSelect、MultiSelect...）
├── 输入组件（TextInput...）
├── 高级组件（DateTime、RateScore、Slider...）
├── 备注组件（TextNote）
└── 签名组件（Signature）← 新增，归属高级组件分组
```

### 2.2 组件分类

- **业务组件类型**：`signature`（签名组件）
- **所属分组**：高级组件（Advanced）
- **编辑组件**：需新增 `SignatureConfigEditor.vue`（专用编辑器）
- **问答类型**：是（签名结果作为答案收集，非展示型组件）

### 2.3 核心架构

```
Signature 组件架构
├── Canvas 画布层（签名绘制 + 高DPI适配）
├── 工具栏层（颜色、粗细、撤销、清空）
├── 本地运行时状态（isSigned、signatureData — 不持久化）
└── 答案回传层（emit("updateAnswer", base64) → 答卷系统）
```

### 2.4 状态管理设计（Status 对象结构）

> **重要：** 签名组件的 Status 与所有其他组件一样，所有字段必须遵循 `TextProps`（文本类）或 `OptionsProps`（选项类）的包装结构，而非裸基本类型。这是编辑面板（EditPanel）动态渲染编辑器、以及 `updateStatus` 注入机制正常工作的前提。

#### 2.4.1 公共样式配置（11 项，所有组件必须包含）

| 字段          | 类型         | 说明              | 默认值                   |
| ------------- | ------------ | ----------------- | ------------------------ |
| `title`       | TextProps    | 签名标题文本      | "请在此处签名"           |
| `desc`        | TextProps    | 签名描述/提示文字 | ""                       |
| `position`    | OptionsProps | 对齐方式          | \["左对齐", "居中对齐"\] |
| `titleSize`   | OptionsProps | 标题字号（px）    | \["22", "20", "18"\]     |
| `descSize`    | OptionsProps | 描述字号（px）    | \["16", "14", "12"\]     |
| `titleWeight` | OptionsProps | 标题粗细          | \["加粗", "正常"\]       |
| `descWeight`  | OptionsProps | 描述粗细          | \["加粗", "正常"\]       |
| `titleItalic` | OptionsProps | 标题倾斜          | \["斜体", "正常"\]       |
| `descItalic`  | OptionsProps | 描述倾斜          | \["斜体", "正常"\]       |
| `titleColor`  | TextProps    | 标题颜色（HEX）   | "#303133"                |
| `descColor`   | TextProps    | 描述颜色（HEX）   | "#909399"                |

#### 2.4.2 签名特化配置

| 字段          | 类型         | 说明            | 默认值                                   | 使用的编辑器                |
| ------------- | ------------ | --------------- | ---------------------------------------- | --------------------------- |
| `strokeColor` | TextProps    | 笔画颜色（HEX） | "#000000"                                | ColorEditor                 |
| `strokeWidth` | OptionsProps | 笔画粗细（px）  | \["1","2","3","4","5"\]，currentStatus=2 | SliderConfigEditor 或自定义 |
| `showToolbar` | OptionsProps | 工具栏显隐      | \["显示","隐藏"\]，currentStatus=0       | ButtonGroup                 |

#### 2.4.3 运行时状态（组件内部 ref，不进入 Status，不持久化）

| 字段            | 类型               | 说明                                             |
| --------------- | ------------------ | ------------------------------------------------ |
| `isSigned`      | `ref<boolean>`     | Canvas 是否已有笔迹（本地计算，重置时清空）      |
| `signatureData` | `ref<string>`      | 签名 Base64 数据（用户答题结果，通过 emit 上报） |
| `historyStack`  | `ref<ImageData[]>` | 撤销历史栈（每次落笔保存快照）                   |

> **设计说明：** `signatureData` 是用户答案而非组件配置，不应存入 Status 对象。原因：①Status 会序列化到 IndexedDB，Base64 图片（通常 50–200KB）会造成大量冗余存储；②职责分离原则，Status 只存配置，答案通过 `emit("updateAnswer")` 上报给答卷系统。

---

## 三、实现方案

### 3.1 文件结构

```
src/
├── types/
│   └── material.ts                     # ① 修改：SurveyComName + SurveyComNameArr + EditComName
├── components/
│   └── SurveyComs/
│       ├── Materials/
│       │   └── AdvancedComs/
│       │       └── Signature.vue       # ② 新增：业务组件
│       └── EditItems/
│           └── SignatureConfigEditor.vue  # ③ 新增：签名专用配置编辑器
├── configs/
│   ├── componentMap.ts                 # ④ 修改：注册业务组件 + 编辑器组件
│   ├── SurveyGroupConfig.ts            # ⑤ 修改：高级组件分组添加签名
│   └── defaultStatus/
│       ├── defaultStatusMap.ts         # ⑥ 修改：注册默认状态函数
│       └── advanced/
│           └── Signature.ts            # ⑦ 新增：签名默认状态配置
└── i18n/
    ├── zh-CN/components.ts             # ⑧ 修改：添加中文翻译
    ├── en-US/components.ts             # ⑨ 修改：添加英文翻译
    └── ja-JP/components.ts             # ⑩ 修改：添加日文翻译
```

### 3.2 核心实现思路

#### 3.2.1 Canvas 绘制核心

- 使用 HTML5 Canvas API 实现手写绘制
- 监听 `mousedown`、`mousemove`、`mouseup` 事件（桌面端）
- 监听 `touchstart`、`touchmove`、`touchend` 事件（移动端）
- 使用贝塞尔曲线平滑处理笔画，避免折线感

#### 3.2.2 高 DPI 屏幕适配

Canvas 在高分屏上需要处理 `devicePixelRatio`，否则签名会模糊：

```javascript
// Canvas 初始化标准写法（onMounted 中调用）
const dpr = window.devicePixelRatio || 1;
const displayWidth = canvasContainer.value.clientWidth;
const displayHeight = canvasContainer.value.clientHeight;

canvas.width = displayWidth * dpr;
canvas.height = displayHeight * dpr;
ctx.scale(dpr, dpr);

// 仅设置 CSS 尺寸，不影响绘制分辨率
canvas.style.width = `${displayWidth}px`;
canvas.style.height = `${displayHeight}px`;
```

#### 3.2.3 工具栏功能

| 工具     | 功能           | 实现方式                                                                    |
| -------- | -------------- | --------------------------------------------------------------------------- |
| 撤销     | 回退上一步绘制 | 每次 mousedown/touchstart 时 `ctx.getImageData()` 保存快照到 `historyStack` |
| 清空     | 清除全部签名   | `ctx.clearRect()` + 清空 `historyStack` + `isSigned = false`                |
| 颜色选择 | 切换笔画颜色   | 更新 `ctx.strokeStyle`（来自 status.strokeColor）                           |
| 粗细调整 | 调整笔画宽度   | 更新 `ctx.lineWidth`（来自 status.strokeWidth 的当前选项）                  |

#### 3.2.4 答案数据上报

用户完成签名（鼠标/触摸抬起时）调用：

```typescript
emit("updateAnswer", canvas.toDataURL("image/png"));
// 更新本地状态
isSigned.value = true;
signatureData.value = canvas.toDataURL("image/png");
```

---

## 四、集成步骤

### 4.1 步骤一：更新类型定义

**修改文件**：`src/types/material.ts`

需同时更新三处：

```typescript
// 1. SurveyComName 联合类型（题目组件名）
export type SurveyComName = ... | "signature";

// 2. SurveyComNameArr 数组（类型守卫 isSurveyComName() 依赖此数组）
// ⚠️ 漏掉此处将导致序列化时签名组件被跳过
export const SurveyComNameArr: SurveyComName[] = [..., "signature"];

// 3. EditComName 联合类型（编辑器组件名）
export type EditComName = ... | "signature-config-editor";
```

### 4.2 步骤二：创建默认状态配置

**创建文件**：`src/configs/defaultStatus/advanced/Signature.ts`

```typescript
import SignatureVue from "@/components/SurveyComs/Materials/AdvancedComs/Signature.vue";
import SignatureConfigEditor from "@/components/SurveyComs/EditItems/SignatureConfigEditor.vue";
import type { Status } from "@/types";
// 公共编辑器（复用现有组件）
import TitleEditor from "@/components/SurveyComs/EditItems/TitleEditor.vue";
import DescEditor from "@/components/SurveyComs/EditItems/DescEditor.vue";
import ColorEditor from "@/components/SurveyComs/EditItems/ColorEditor.vue";
import ButtonGroup from "@/components/SurveyComs/EditItems/ButtonGroup.vue";
import PositionEditor from "@/components/SurveyComs/EditItems/PositionEditor.vue";
import SizeEditor from "@/components/SurveyComs/EditItems/SizeEditor.vue";
import WeightEditor from "@/components/SurveyComs/EditItems/WeightEditor.vue";
import ItalicEditor from "@/components/SurveyComs/EditItems/ItalicEditor.vue";
import { markRaw } from "vue";
import { v4 as uuidv4 } from "uuid";

export default function (): Status {
  return {
    type: markRaw(SignatureVue),
    name: "signature",
    id: uuidv4(),
    status: {
      // ── 公共配置（11 项，所有组件必须包含）────────────────
      title: {
        id: uuidv4(),
        status: "请在此处签名",
        isShow: true,
        name: "title-editor",
        editCom: markRaw(TitleEditor)
      },
      desc: {
        id: uuidv4(),
        status: "",
        isShow: true,
        name: "desc-editor",
        editCom: markRaw(DescEditor)
      },
      position: {
        id: uuidv4(),
        currentStatus: 0,
        isShow: true,
        status: ["左对齐", "居中对齐"],
        name: "position-editor",
        editCom: markRaw(PositionEditor)
      },
      titleSize: {
        id: uuidv4(),
        currentStatus: 0,
        isShow: true,
        status: ["22", "20", "18"],
        name: "size-editor",
        editCom: markRaw(SizeEditor)
      },
      descSize: {
        id: uuidv4(),
        currentStatus: 1,
        isShow: true,
        status: ["16", "14", "12"],
        name: "size-editor",
        editCom: markRaw(SizeEditor)
      },
      titleWeight: {
        id: uuidv4(),
        currentStatus: 0,
        isShow: true,
        status: ["加粗", "正常"],
        name: "weight-editor",
        editCom: markRaw(WeightEditor)
      },
      descWeight: {
        id: uuidv4(),
        currentStatus: 1,
        isShow: true,
        status: ["加粗", "正常"],
        name: "weight-editor",
        editCom: markRaw(WeightEditor)
      },
      titleItalic: {
        id: uuidv4(),
        currentStatus: 1,
        isShow: true,
        status: ["斜体", "正常"],
        name: "italic-editor",
        editCom: markRaw(ItalicEditor)
      },
      descItalic: {
        id: uuidv4(),
        currentStatus: 1,
        isShow: true,
        status: ["斜体", "正常"],
        name: "italic-editor",
        editCom: markRaw(ItalicEditor)
      },
      titleColor: {
        id: uuidv4(),
        status: "#303133",
        isShow: true,
        name: "color-editor",
        editCom: markRaw(ColorEditor)
      },
      descColor: {
        id: uuidv4(),
        status: "#909399",
        isShow: true,
        name: "color-editor",
        editCom: markRaw(ColorEditor)
      },
      // ── 签名特化配置 ────────────────────────────────────
      strokeColor: {
        id: uuidv4(),
        status: "#000000",
        isShow: true,
        name: "color-editor",
        editCom: markRaw(ColorEditor) // 复用现有 ColorEditor
      },
      strokeWidth: {
        id: uuidv4(),
        currentStatus: 2,
        isShow: true, // 默认选中 "3"
        status: ["1", "2", "3", "4", "5"],
        name: "signature-config-editor",
        editCom: markRaw(SignatureConfigEditor)
      },
      showToolbar: {
        id: uuidv4(),
        currentStatus: 0,
        isShow: true, // 默认"显示"
        status: ["显示", "隐藏"],
        name: "button-group",
        editCom: markRaw(ButtonGroup) // 复用现有 ButtonGroup
      }
    }
  };
}
```

> **注意：** 所有 `editCom` 必须用 `markRaw()` 包裹（防止 Vue 将组件类型作为响应式对象追踪），所有 `id` 必须用 `uuidv4()` 生成唯一标识。

### 4.3 步骤三：注册组件映射（业务组件 + 编辑器组件）

**修改文件**：`src/configs/componentMap.ts`

```typescript
import Signature from "@/components/SurveyComs/Materials/AdvancedComs/Signature.vue";
import SignatureConfigEditor from "@/components/SurveyComs/EditItems/SignatureConfigEditor.vue";

export const componentMap = {
  // ... 其他现有组件
  signature: markRaw(Signature),
  "signature-config-editor": markRaw(SignatureConfigEditor) // 编辑器也需注册
};
```

### 4.4 步骤四：注册默认状态映射

**修改文件**：`src/configs/defaultStatus/defaultStatusMap.ts`

```typescript
import signatureDefaultStatus from "./advanced/Signature";

export const defaultStatusMap: DefaultStatusMap = {
  // ... 其他现有组件
  signature: signatureDefaultStatus
};
```

### 4.5 步骤五：添加到题型面板（高级组件分组）

**修改文件**：`src/configs/SurveyGroupConfig.ts`

```typescript
{
  title: t("components.surveyGroup.advanced"),
  icon: Files,
  list: [
    // ... 其他高级组件
    { materialName: "signature", comName: t("components.surveyGroup.signature") },
  ]
}
```

### 4.6 步骤六：添加国际化翻译

**修改文件**：`src/i18n/zh-CN/components.ts`、`en-US/components.ts`、`ja-JP/components.ts`

```typescript
// zh-CN/components.ts 新增键值
export default {
  // 题型面板名称
  surveyGroup: {
    // ... 现有键值
    signature: "电子签名",
  },
  // SignatureConfigEditor 编辑器内部文本
  signatureConfigEditor: {
    strokeColor: "笔画颜色",
    strokeWidth: "笔画粗细",
    showToolbar: "工具栏",
  }
};

// en-US/components.ts
surveyGroup: { signature: "Signature" }
signatureConfigEditor: { strokeColor: "Stroke Color", strokeWidth: "Stroke Width", showToolbar: "Toolbar" }

// ja-JP/components.ts
surveyGroup: { signature: "署名" }
signatureConfigEditor: { strokeColor: "ストロークカラー", strokeWidth: "線の太さ", showToolbar: "ツールバー" }
```

### 4.7 步骤七：PDF 导出支持（可选）

Canvas 签名可通过 `canvas.toDataURL()` 转为图片嵌入 PDF，因此签名组件**支持 PDF 导出**。

**修改文件**：`src/types/material.ts`

```typescript
export const useForPDFComNameArr: SurveyComName[] = [
  // ... 现有组件
  "signature" // Canvas 可转图片，支持 PDF
];
```

---

## 五、组件接口设计

### 5.1 业务组件接口（Signature.vue）

与系统内所有其他组件保持一致，接收完整 `status` 对象，通过 `emit("updateAnswer")` 上报签名结果：

```typescript
// Props（遵循系统统一规范）
const props = defineProps<{
  status: SignatureStatus; // 完整的 Status 配置对象（含所有 11 项公共配置 + 3 项特化配置）
  serialNum: number; // 题目序号（用于 MaterialsHeader 渲染）
}>();

// 答案上报（系统统一约定）
const emits = defineEmits(["updateAnswer"]);

// 组件内部运行时状态（不进入 Status，不持久化）
const isSigned = ref(false); // Canvas 是否有笔迹
const historyStack = ref<ImageData[]>([]); // 撤销历史
```

### 5.2 状态提取（通过工具函数）

业务组件通过系统提供的工具函数提取 status 配置值：

```typescript
import { getTextStatus, getCurrentStatus, getStringStatusByCurrentStatus } from "@/utils";

const computedState = computed(() => ({
  title: getTextStatus(props.status.title),
  desc: getTextStatus(props.status.desc),
  position: getCurrentStatus(props.status.position),
  titleSize: getStringStatusByCurrentStatus(props.status.titleSize),
  // ... 其他公共配置
  strokeColor: getTextStatus(props.status.strokeColor), // "#000000"
  strokeWidth: Number(getStringStatusByCurrentStatus(props.status.strokeWidth)), // 3
  showToolbar: getCurrentStatus(props.status.showToolbar) === 0 // true/false
}));
```

### 5.3 编辑器配置（SignatureConfigEditor.vue）

| 字段                       | 使用编辑器                    | 说明            |
| -------------------------- | ----------------------------- | --------------- |
| `title`                    | TitleEditor（现有）           | 签名标题文本    |
| `desc`                     | DescEditor（现有）            | 签名提示文字    |
| `strokeColor`              | ColorEditor（现有）           | 笔画颜色选择    |
| `strokeWidth`              | SignatureConfigEditor（新增） | 笔画粗细滑块    |
| `showToolbar`              | ButtonGroup（现有）           | 显示/隐藏工具栏 |
| `position`/`titleSize`/... | 现有公共编辑器                | 通用样式配置    |

> `SignatureConfigEditor.vue` 主要封装笔画粗细的 UI（滑块 + 预览），`strokeColor` 复用现有 `ColorEditor`，`showToolbar` 复用现有 `ButtonGroup`，无需为每个字段新建编辑器。

---

## 六、兼容性考虑

### 6.1 浏览器兼容性

| 浏览器  | 版本要求 | 状态                  |
| ------- | -------- | --------------------- |
| Chrome  | ≥90      | ✅ 支持               |
| Firefox | ≥88      | ✅ 支持               |
| Safari  | ≥14      | ✅ 支持               |
| Edge    | ≥90      | ✅ 支持               |
| IE11    | -        | ❌ 不支持（Vue3限制） |

### 6.2 移动端兼容性

| 平台           | 支持情况 | 说明                                     |
| -------------- | -------- | ---------------------------------------- |
| iOS Safari     | ✅       | 需设置 `touch-action: none` 防止页面滚动 |
| Android Chrome | ✅       | 触摸事件正常                             |
| 微信内置浏览器 | ✅       | 需处理 `touch-action`                    |

### 6.3 特殊处理

1. **触摸事件冲突**：Canvas 元素设置 `touch-action: none` 防止页面滚动干扰
2. **高 DPI 屏幕**：参照 3.2.2 节使用 `devicePixelRatio` 初始化 Canvas
3. **Canvas 尺寸响应**：使用 `ResizeObserver` 监听容器变化，画布内容自适应重绘
4. **事件冒泡**：Canvas 点击事件需加 `@click.stop` 防止触发编辑器选中逻辑

---

## 七、数据存储格式

### 7.1 答案数据格式（用于提交答卷）

签名结果通过 `emit("updateAnswer", data)` 上报：

```typescript
// 上报格式（传递给 SurveyView 的答案收集层）
interface SignatureAnswer {
  type: "signature";
  data: string; // Base64 编码的 PNG 图片（canvas.toDataURL("image/png")）
  width: number; // 画布显示宽度（CSS px，非 Canvas 像素宽度）
  height: number; // 画布显示高度
  strokeColor: string; // 使用的笔画颜色
  strokeWidth: number; // 使用的笔画粗细
  timestamp: number; // 签名完成时间戳（Date.now()）
}
```

### 7.2 存储建议

- 签名数据以 Base64 字符串形式存储于答卷记录中
- 建议后端限制大小（≤500KB），超出时返回错误提示
- **不** 将签名数据存入编辑器 Status（原因见 2.4.3 节）

---

## 八、安全考虑

### 8.1 数据验证

- 验证签名数据格式（有效 Base64）
- 验证图片类型（仅允许 `image/png`）
- 前后端均限制文件大小

### 8.2 防篡改

- 签名数据可配合时间戳使用
- 如需法律效力，建议结合数字签名机制

---

## 九、测试要点

### 9.1 功能测试

| 测试场景               | 预期结果                                            |
| ---------------------- | --------------------------------------------------- |
| 鼠标绘制签名           | 流畅绘制，无卡顿                                    |
| 触摸绘制签名           | 流畅绘制，无抖动                                    |
| 撤销操作               | 逐步回退绘制步骤                                    |
| 清空操作               | 画布清空，isSigned 重置为 false                     |
| 颜色切换               | 笔画颜色实时更新                                    |
| 粗细调整               | 笔画粗细实时更新                                    |
| 导出PNG                | `emit("updateAnswer")` 触发，数据为有效 Base64      |
| 编辑器修改 strokeColor | 通过 `updateStatus` 更新 status，组件 computed 响应 |

### 9.2 兼容性测试

| 测试场景             | 预期结果                     |
| -------------------- | ---------------------------- |
| Retina 屏（DPR=2）   | 签名线条清晰，无模糊         |
| 桌面端 Chrome/Safari | 鼠标绘制正常                 |
| iOS Safari           | 触摸绘制正常，无页面滚动干扰 |
| Android Chrome       | 触摸绘制正常                 |
| 微信浏览器           | 触摸绘制正常                 |

### 9.3 边界测试

| 测试场景               | 预期结果                               |
| ---------------------- | -------------------------------------- |
| 空签名提交（必填模式） | 提示错误，阻止答卷提交                 |
| 超大签名数据           | 截断或提示大小超限                     |
| 容器尺寸变化           | ResizeObserver 触发，Canvas 自适应调整 |
| 频繁撤销到无笔迹       | `isSigned` 复位为 false                |

---

## 十、实现检查清单

完整实现签名组件需修改/新增以下文件（按顺序执行）：

- [ ] `src/types/material.ts` — 添加 `"signature"` 到 SurveyComName 联合类型
- [ ] `src/types/material.ts` — 添加 `"signature"` 到 SurveyComNameArr 数组（勿遗漏）
- [ ] `src/types/material.ts` — 添加 `"signature-config-editor"` 到 EditComName 联合类型
- [ ] `src/types/material.ts` — 添加 `"signature"` 到 useForPDFComNameArr（支持 PDF）
- [ ] 新建 `src/components/SurveyComs/Materials/AdvancedComs/Signature.vue`
- [ ] 新建 `src/components/SurveyComs/EditItems/SignatureConfigEditor.vue`
- [ ] `src/configs/componentMap.ts` — 注册 Signature 业务组件
- [ ] `src/configs/componentMap.ts` — 注册 SignatureConfigEditor 编辑器组件（勿遗漏）
- [ ] 新建 `src/configs/defaultStatus/advanced/Signature.ts`
- [ ] `src/configs/defaultStatus/defaultStatusMap.ts` — 注册默认状态函数
- [ ] `src/configs/SurveyGroupConfig.ts` — 高级组件分组添加签名项
- [ ] `src/i18n/zh-CN/components.ts` — 添加中文翻译
- [ ] `src/i18n/en-US/components.ts` — 添加英文翻译
- [ ] `src/i18n/ja-JP/components.ts` — 添加日文翻译

---

**文档版本**: v1.1
**创建日期**: 2026-06-10
**更新日期**: 2026-06-10（校正 Status 结构、Props 接口、添加遗漏注册步骤）
**适用项目**: q-editor 问卷低代码平台
