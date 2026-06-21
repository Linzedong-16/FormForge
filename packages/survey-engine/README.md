# 问卷低代码渲染引擎 (`monorepo-survey-engine`)

问卷系统的跨项目共享渲染引擎，封装了完整的问卷渲染、表单交互、数据处理、状态管理能力。

## 目录结构

```
packages/survey-engine/src/
├── index.ts                  # 统一导出入口
├── components/
│   ├── SurveyComs/
│   │   ├── Materials/        # 14 个业务渲染组件
│   │   ├── EditItems/        # 17 个编辑面板组件
│   │   └── Common/           # 公共组件（MaterialsHeader / PicItem）
│   └── Common/               # SurveyPagination 分页器
├── configs/
│   ├── componentMap.ts       # 组件名 → Vue 组件注册表
│   ├── SurveyGroupConfig.ts  # 题型面板配置
│   ├── regionData.ts         # 省/市/区数据
│   └── defaultStatus/        # 14 种题型的默认配置
├── stores/
│   ├── useEditor.ts          # 编辑器/渲染器 Pinia Store
│   └── actions.ts            # Store 动作函数
├── types/                    # TypeScript 类型系统
│   ├── common.ts             # VueComType / Status
│   ├── editProps.ts          # 题型 Props 类型 + 类型谓词
│   ├── material.ts           # 组件名枚举
│   ├── editor.ts             # 编辑器类型
│   ├── db.ts                 # IndexedDB 类型
│   ├── store.ts              # Store 接口
│   └── eventBus.ts           # 事件类型
├── utils/
│   ├── index.ts              # 核心渲染工具函数（14个导出）
│   ├── hooks.ts              # useSurveyNo composable
│   ├── undoManager.ts        # 撤销/重做管理器
│   ├── eventBus.ts           # 事件总线（mitt）
│   └── i18n.ts               # i18n 桥接
├── i18n/                     # 国际化语言包
│   ├── zh-CN/  en-US/  ja-JP/
├── api/
│   ├── upload.ts             # 图片上传接口
│   └── clients/server.ts     # HTTP Client（axios）
└── db/
    ├── db.ts                 # IndexedDB 封装
    └── operation.ts          # 数据库操作
```

## 快速开始

### 1. 安装依赖

```bash
# 包已在 pnpm workspace 中，直接添加为依赖
pnpm add monorepo-survey-engine --filter your-app
```

### 2. 确保 consumer 支持以下 peer 依赖

```json
{
  "dependencies": {
    "vue": "^3.5.0",
    "element-plus": "^2.13.0",
    "vue-i18n": "^9.14.0",
    "pinia": "^3.0.0",
    "@element-plus/icons-vue": "^2.3.0"
  }
}
```

### 3. 配置 Vite

```ts
// vite.config.ts
import { ElementPlusResolver } from "unplugin-vue-components/resolvers";
import AutoImport from "unplugin-auto-import/vite";
import Components from "unplugin-vue-components/vite";

export default defineConfig({
  plugins: [
    vue(),
    AutoImport({ resolvers: [ElementPlusResolver()] }),
    Components({ resolvers: [ElementPlusResolver()] })
  ]
});
```

### 4. 配置 main.ts

```ts
import ElementPlus from "element-plus";
import "element-plus/dist/index.css";
import { createI18n } from "vue-i18n";
import { createPinia } from "pinia";

const i18n = createI18n({ legacy: false, locale: "zh-CN" });
const pinia = createPinia();

const app = createApp(App);
app.use(ElementPlus);
app.use(i18n);
app.use(pinia);
app.mount("#app");
```

### 5. 渲染问卷

```vue
<template>
  <div>
    <component v-for="(com, index) in store.coms" :is="componentMap[com.type]" :key="index" :status="com.status" />
  </div>
</template>

<script setup lang="ts">
import { useEditorStore, componentMap } from "monorepo-survey-engine";

const store = useEditorStore();

// 从后端 API 加载问卷数据
async function loadSurvey(surveyId: number) {
  const res = await fetch(`/api/survey/${surveyId}`);
  const data = await res.json();
  // 将后端 JSON 数据写入 store（会自动初始化组件状态）
  store.coms = data.components;
  store.surveyCount = data.components.length;
}
</script>
```

## 核心 API

### Store — `useEditorStore`

| 状态                    | 类型       | 说明               |
| ----------------------- | ---------- | ------------------ |
| `coms`                  | `Status[]` | 问卷题目组件数组   |
| `surveyCount`           | `number`   | 题目数量           |
| `currentPage`           | `number`   | 当前页码           |
| `pageSize`              | `number`   | 每页题目数         |
| `currentComponentIndex` | `number`   | 当前选中的组件索引 |

### 注册表 — `componentMap`

```ts
import { componentMap } from "monorepo-survey-engine";
// { "single-select": SingleSelect, "multi-select": MultiSelect, ... }
```

### 工具函数

| 函数                                     | 说明               |
| ---------------------------------------- | ------------------ |
| `getTextStatus(status)`                  | 获取文本显示状态   |
| `getCurrentStatus(status)`               | 获取当前选中值     |
| `getStringStatusByCurrentStatus(status)` | 获取选项文本数组   |
| `restoreComponentStatus(status)`         | 恢复组件到默认状态 |
| `formatDate(date, format?)`              | 日期格式化         |

### 类型系统

```ts
import type {
  Status, // 组件状态（核心类型）
  OptionsStatus, // 选项类题型
  TypeStatus, // 输入类题型
  MatrixStatus, // 矩阵题型
  SurveyDBData, // 问卷数据库结构
  ComponentMap // 组件映射表类型
} from "monorepo-survey-engine";
```

## 架构说明

### 数据流

```
后端 API → JSON 数据 → useEditorStore.coms[] → componentMap → Vue 组件渲染
```

- 问卷数据以 JSON 格式存储在后端
- 前端通过 `useEditorStore` 管理状态
- `componentMap` 将组件类型名映射到 Vue 组件
- 每个 Material 组件接收 `status` prop，通过工具函数解析渲染

### 组件分类

| 分类   | 数量 | 示例                                                                     |
| ------ | ---- | ------------------------------------------------------------------------ |
| 选择类 | 5    | SingleSelect, MultiSelect, OptionSelect, SinglePicSelect, MultiPicSelect |
| 输入类 | 1    | TextInput                                                                |
| 备注类 | 1    | TextNote                                                                 |
| 高级类 | 6    | RateScore, DateTime, Cascader, Slider, Transfer, Signature               |
| 矩阵类 | 1    | MatrixSingle                                                             |

### 双 UI 库共存

本引擎依赖 Element Plus，consumer 若已使用其他 UI 库（如 Arco Design），两者可安全共存：Element Plus 使用 `el-` 前缀，Arco Design 使用 `arco-` 前缀，CSS 不冲突。
