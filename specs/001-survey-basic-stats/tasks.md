# Tasks: 问卷答卷基础统计与 CSV 导出

**Input**: Design documents from `/specs/001-survey-basic-stats/`

**Prerequisites**: plan.md (✅), spec.md (✅), research.md (✅), data-model.md (✅), contracts/ (✅), quickstart.md (✅)

**Tests**: Not explicitly requested in spec — test tasks omitted.

**Key fact**: 后端聚合引擎和 CSV 导出 API 已全部实现，本需求仅涉及前端展示层补全。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)

---

## Phase 1: Setup (环境确认)

**Purpose**: 确认已有后端 API 可用，前端开发环境就绪

- [x] T001 启动 q-server 并确认统计 API 可用：`GET /api/admin/stats/overview` 和 `GET /api/admin/surveys/:id/stats` 均返回正常数据
- [x] T002 [P] 确认前端已有 ECharts 依赖可用（`app/frontend` 中 `echarts@^5.6.0` + `vue-echarts@^7.0.3`）且 `src/plugins/echarts.ts` 已注册 LineChart、BarChart
- [x] T003 [P] 确认前端 API 封装就绪：`getSurveyStats()`、`getStatsOverview()`、`exportResponses()` 在 `app/frontend/src/api/modules/survey/index.ts` 可正常导入

---

## Phase 2: Foundational (路由注册)

**Purpose**: 注册单问卷统计详情页路由，这是 US1 和 US3 的共同前置条件

**⚠️ CRITICAL**: US1 和 US3 依赖此路由就绪

- [x] T004 在 `app/frontend/src/router/routes.ts` 的 `surveyManagement.children` 中新增 `statistics/:id` 路由，指向 `SurveyStatsDetailView.vue`（组件文件待 T005 创建，路由可先注册为懒加载占位）

**Checkpoint**: 路由就绪 — US1 和 US3 可以开始实现

---

## Phase 3: User Story 1 — 查看单问卷逐题统计 (Priority: P1) 🎯 MVP

**Goal**: 管理员进入 `/survey-management/statistics/:id`，看到每道题的逐题统计数据（按题型自动匹配统计维度）

**Independent Test**: 选任意一份有答卷的已发布问卷，进入统计详情页，验证每道题展示对应题型的统计维度

### Implementation for User Story 1

- [x] T005 [US1] 创建 `app/frontend/src/views/statistics/SurveyStatsDetailView.vue` 基础骨架：页面布局含返回按钮、问卷标题、指标卡片行（总答卷/有效答卷/完成率）、日期趋势折线图区域、逐题分析列表区域
- [x] T006 [US1] 在 SurveyStatsDetailView 中实现数据加载逻辑：`onMounted` 时从路由 `params.id` 获取问卷 ID，调用 `getSurveyStats(id)` 获取数据，处理 loading / empty / error 三种状态
- [x] T007 [US1] 在 SurveyStatsDetailView 中实现日期趋势折线图：用 `<VChart>` 绑定 `daily_trend` 数据，X 轴日期 Y 轴答卷数，无数据时显示占位提示
- [x] T008 [US1] 在 SurveyStatsDetailView 中实现选择题统计渲染（单选/多选/下拉/图片单选/图片多选/排序）：读取 `options_distribution` 数组，用 ECharts 横向条形图展示各选项频次+百分比
- [x] T009 [US1] 在 SurveyStatsDetailView 中实现评分/滑块题统计渲染：展示平均值/最小值/最大值指标，用 ECharts 柱状图展示各分值频次分布，平均值用 markLine 标注
- [x] T010 [US1] 在 SurveyStatsDetailView 中实现文本题/个人信息题统计渲染：展示总答案数和空值率，用 Arco `a-list` 或纯列表展示 `sample_answers` 抽样原文（最近 10 条）
- [x] T011 [US1] 在 SurveyStatsDetailView 中实现矩阵单选题统计渲染：解析 `options_distribution`（格式为 `"行标签 → 列标签"`），用 Arco `a-table` 渲染行列交叉表，单元格值用背景色深浅表示频次高低
- [x] T012 [US1] 在 SurveyStatsDetailView 中实现日期/级联题统计渲染：复用选择题条形图逻辑，读取 `options_distribution` 展示频次分布
- [x] T013 [US1] 在 SurveyStatsDetailView 中实现签名题统计渲染：展示有签名/无签名数量（从 `options_distribution` 或 `total_answers` 推算），不做图像内容分析
- [x] T014 [US1] 在 SurveyStatsDetailView 中实现无答卷数据处理：`total_responses === 0` 时，每道题展示"暂无数据"，不渲染图表
- [x] T015 [US1] 在 SurveyStatsDetailView 中实现组件类型中文映射：引用已有 `TYPE_NAME_MAP`（或自建常量），将后端 snake_case 类型（如 `single_select`）转为中文标签（如"单选题"）

**Checkpoint**: US1 完成 — 管理员可以进入任意问卷的统计详情页，看到每道题按题型维度的统计数据

---

## Phase 4: User Story 2 — 查看平台汇总仪表盘 (Priority: P2)

**Goal**: 平台统计概览数据在仪表盘中正确展示（大部分已有，仅验证+微调）

**Independent Test**: 登录后台进入仪表盘，验证统计卡片和趋势图数据与实际一致

### Implementation for User Story 2

- [x] T016 [US2] 确认 `app/frontend/src/views/statistics/SurveyStatisticsView.vue` 中 `handleViewDetail(record)` 能正确跳转到新路由 `/survey-management/statistics/${record.id}`，且新路由已匹配到 T005 创建的组件

**Checkpoint**: US2 完成 — 从统计列表页可正常跳转至详情页，形成完整导航闭环

---

## Phase 5: User Story 3 — 导出答卷数据为 CSV (Priority: P3)

**Goal**: 管理员在统计详情页点击"导出 CSV"按钮，浏览器下载问卷原始答卷 CSV 文件

**Independent Test**: 对任意有答卷的问卷触发导出，验证下载的 CSV 文件编码正确、多选分隔符正确、Excel 打开无乱码

### Implementation for User Story 3

- [x] T017 [US3] 在 SurveyStatsDetailView 页面顶部操作栏添加"导出 CSV"按钮，调用 `exportResponses(surveyId, { format: 'csv' })`，通过 `URL.createObjectURL` + 临时 `<a>` 标签触发浏览器下载
- [x] T018 [US3] 在 SurveyStatisticsView 列表页的"导出报表"按钮（当前 `handleExport()` 为占位符）中接入导出功能：弹窗让用户选择目标问卷后触发 CSV 下载

**Checkpoint**: US3 完成 — 管理员可从统计列表页或详情页导出任意问卷的原始答卷 CSV

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: 验证、微调和边界情况处理

- [x] T019 按 `quickstart.md` 完整走完验证流程：平台仪表盘 → 统计列表 → 统计详情（含 7 种题型渲染）→ CSV 导出 → Excel 打开验证中文
- [x] T020 [P] 处理问卷不存在场景：路由 `params.id` 无效时，SurveyStatsDetailView 展示 404 提示（后端返回 404 时前端拦截并展示友好提示）
- [x] T021 [P] 确保统计详情页渲染性能：题目数量 ≤ 100 时页面渲染无明显卡顿（ECharts 实例在组件卸载时 `dispose`）

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — 并行确认环境
- **Foundational (Phase 2)**: Depends on Phase 1
- **US1 (Phase 3)**: Depends on Phase 2 (路由就绪)
- **US2 (Phase 4)**: Depends on Phase 2 — 独立于 US1
- **US3 (Phase 5)**: Depends on Phase 3 (需要 SurveyStatsDetailView 中的导出按钮)
- **Polish (Phase 6)**: Depends on all preceding phases

### User Story Dependencies

- **US1 (P1)**: Foundation 完成后可开始 — 无依赖其他 Story
- **US2 (P2)**: Foundation 完成后可开始 — 仅需确认已有页面跳转正确
- **US3 (P3)**: 依赖 US1 的 SurveyStatsDetailView 组件存在

### Within US1

- T005 (骨架) → T006 (数据加载) → T007-T015 (各题型渲染，可部分并行)
- T007-T013 之间相互独立，可并行开发
- T014 (空数据处理) 依赖 T006 完成
- T015 (类型映射) 可与 T008-T013 并行

### Parallel Opportunities

- T002、T003 可与 T001 并行
- T007-T013 (不同题型渲染) 之间相互独立，文件均为同一个 Vue 组件但不同 `<template>` 区块
- T020、T021 可并行

---

## Implementation Strategy

### MVP First (US1 Only)

1. Phase 1: T001-T003 → 环境就绪
2. Phase 2: T004 → 路由就绪
3. Phase 3: T005-T015 → **单问卷统计详情页可用** ← MVP!
4. Phase 6: T019 → 手动验证

### Incremental Delivery

1. MVP (US1) → 核心价值：管理员能看到逐题统计数据
2. +US2 → 导航闭环：从列表页可跳转到详情页
3. +US3 → 完整闭环：查看统计 + 导出数据
4. +Polish → 边界情况处理

### Suggested MVP Scope

**仅完成 Phase 1-3 + T019** 即可交付可用的统计详情页，后端 API 已完全就绪，前端只需一个 Vue 组件。
