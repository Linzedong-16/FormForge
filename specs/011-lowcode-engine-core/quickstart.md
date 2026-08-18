# Quickstart：验证低代码引擎核心解耦

本指南提供可运行的验证场景，证明改造后的 `packages/survey-engine` 满足 spec.md 的 Success Criteria。不包含完整实现代码，仅列出验证步骤与预期结果；具体实现细节留待 tasks 阶段与 implement 阶段落地。

## 前置条件

```bash
cd packages/survey-engine
pnpm install
```

- `SC-003` 的验证需要额外确认：`node_modules/vue` 在验证脚本运行的子进程中不可见（可用临时的 `--config` 隔离环境，见场景 3）。

## 场景 1：新 Schema 可直接序列化/反序列化（对应 SC-002、User Story 1）

```bash
pnpm test -- src/adapters/vue3/__tests__/serialization.spec.ts
```

**验证步骤**：

1. 用 `defaultStatusMap` 现有工厂函数（或改造后的等价入口）生成一份包含全部现有题型的 `LowCodeSchema`。
2. 执行 `JSON.parse(JSON.stringify(schema))`，不调用任何"引用还原"函数。
3. 将还原后的 `schema.components` 直接传给 Vue3 渲染层（`resolveVue3Component` 查表），断言每道题渲染出正确的组件标签名。

**预期结果**：序列化前后渲染结果一致；断言 `JSON.stringify` 产物中不包含 `function`/`Symbol`/循环引用相关的异常（例如不出现 `"type":{}` 这种组件引用被意外序列化为空对象的情况）。

## 场景 2：旧格式数据运行时自动兼容（对应 FR-006、SC-005）

```bash
pnpm test -- src/core/schema/__tests__/compat.spec.ts
```

**验证步骤**：

1. 构造一份"旧格式"题目数据（手工拼装一个带 `type`/`editCom` 属性的对象，模拟 `restoreComponentStatus()` 处理前的历史数据形态）。
2. 调用 `isLegacyComponent` 确认判定为 `true`，调用 `toSchemaComponent` 转换。
3. 对转换前（通过现状的 `restoreComponentStatus` 路径）与转换后（通过新的 `compat.ts` 路径）的两份数据，分别喂给 `resolveVisibility`/`resolveJump`/`resolveOptionPool`/`computeDerivedField`，断言两组求值结果逐字段相等。

**预期结果**：转换过程对调用方透明（不需要显式判断"这是旧数据我要特殊处理"），规则求值结果 100% 一致。

## 场景 3：核心逻辑在不安装 Vue 的环境下独立测试（对应 SC-003、User Story 2）

```bash
pnpm test:core
# 等价于：vitest run --config vitest.core.config.ts
```

**验证步骤**：

1. 临时在隔离环境中移除/屏蔽 `vue` 模块解析（可通过 CI 单独 job、或本地用 `pnpm --filter` 配合临时 `node_modules` 快照对比两种方式之一验证，具体做法留待 tasks 阶段确定，此处只要求"该命令本身不依赖已安装的 vue 包即可跑通"）。
2. 运行 `pnpm test:core`，覆盖 `core/schema/validator.ts`、`core/schema/compat.ts`、`core/factory/index.ts`、`core/logic/*.ts`、`core/orchestration/undoManager.ts` 的全部单测。
3. 用测试替身（如 `{ __isTestComponent: true }` 这样的普通对象）调用 `createComponentFactory<TestComponent>()` 完成注册/查找，断言行为正确，且过程中未 import 任何 `.vue` 文件。

**预期结果**：`pnpm test:core` 全部通过，且该命令的执行不要求 `vue`/`@vitejs/plugin-vue`/`jsdom` 已被安装（`vitest.core.config.ts` 的 `environment` 为 `"node"`，不加载 Vue 插件）。

## 场景 4：`app/frontend` 问卷预览页面验收（对应 SC-001）

```bash
cd app/frontend
pnpm dev
```

**验证步骤**：

1. 打开问卷预审详情页（`/survey-preview/detail/:id` 对应的 `SurveyPreviewDetail.vue`），选择一份覆盖尽可能多题型的历史审核记录。
2. 人工比对改造前后页面渲染的题型样式、题目数量、分页行为、规则联动效果（若该问卷配置了显示/隐藏或跳转规则）是否完全一致。
3. 打开浏览器控制台，确认不出现新增的报错或与"组件工厂查找失败"相关的告警（除非故意构造未知题型标识进行场景 5 的验证）。

**预期结果**：功能表现与改造前一致，无回归；`app/q-editor` 无需做任何配合改动。

## 场景 5：组件工厂查找失败时的降级处理（对应 FR-008）

**验证步骤**：

1. 手工构造一份 `SchemaComponent`，其 `name` 字段为一个未在 `componentMap` 中注册的虚构字符串（如 `"unknown-type-x"`）。
2. 将其加入 `SurveyPreviewDetail.vue` 实际渲染的问卷数据中（或在单测中直接调用渲染逻辑）。
3. 观察渲染结果与控制台输出。

**预期结果**：该题被跳过渲染或显示占位提示，同时控制台记录一条清晰的告警（包含未知标识本身），页面其余题目正常渲染，整页不崩溃、不空白。

## 验收清单对照

| 验证场景 | 对应 Success Criteria | 对应 Functional Requirement |
| -------- | --------------------- | --------------------------- |
| 场景 1   | SC-002                | FR-002                      |
| 场景 2   | SC-005                | FR-006、FR-009              |
| 场景 3   | SC-003、SC-004        | FR-001、FR-003              |
| 场景 4   | SC-001                | FR-007                      |
| 场景 5   | —                     | FR-008                      |
