---
description: "管理后台埋点监控数据可视化仪表盘 —— 任务列表"
---

# 任务列表：管理后台埋点监控数据可视化仪表盘

**输入**：来自 `/specs/002-tracking-analytics-dashboard/` 的设计文档

**前置条件**：plan.md、spec.md、research.md、data-model.md、contracts/、quickstart.md（均已就位）

**测试**：包含在内——`plan.md` 的 Constitution 检查明确要求新的 API 模块、筛选组合式函数、
路由守卫扩展以及后端新增的 `metric` 分支都配套单元测试（原则五），与该应用既有的
（尽管单薄的）Vitest 覆盖保持一致。

**组织方式**：任务按用户故事分组（对应 spec.md：US1 = P1 概览/管道健康，US2 = P2 错误，
US3 = P3 性能，US4 = P4 用量/漏斗），以便每个故事都能独立实现、独立验收。

**实现状态**：T001–T040 中除 5 个人工 quickstart 验收任务（T015/T021/T030/T036/T037）外
均已实现并通过自动化测试——`app/frontend` 63 个测试全部通过，`app/q-server`
`src/spec/tracking/` 下 12 个测试全部通过；ESLint/Prettier/cspell 全部通过。5 个人工验收
任务未执行：本环境没有可用的 Postgres/Redis/RabbitMQ/ClickHouse/q-server 真实运行栈，也没有
`001-q-editor-monitoring-integration` 管道产生的真实流量数据，如实记录此缺口而非悄悄跳过（做法
与 `001-q-editor-monitoring-integration` 自身 tasks.md 一致）。部分任务在实现时发现真实代码
细节与原计划存在偏差，已在对应任务下用"**偏差说明**"标注。

## 格式：`[ID] [P?] [Story] 描述`

- **[P]**：可并行执行（不同文件，且不依赖尚未完成的任务）
- **[Story]**：本任务所属的用户故事（US1/US2/US3/US4）
- 文件路径均为精确路径，依据 `plan.md` 的"项目结构"一节

## 路径约定

- 所有前端改动集中在 `app/frontend/src/` 下。
- 后端改动集中在 `app/q-server/src/modules/tracking/tracking-analytics/` 下——仅限
  Phase 5（US3）中为兑现 FR-010（编辑器加载/保存耗时）而新增的两个 `metric` 分支
  （详见 `research.md` §8，这是本功能对"零后端改动"假设的唯一、经明确评审确认的例外）。
- API 模块：`src/api/modules/analytics/index.ts`
- 组合式函数：`src/composables/useAnalyticsFilters.ts`
- 页面与面板：`src/views/analytics-dashboard/`
- 测试：与该应用既有惯例一致，就近放在各自的 `__tests__/` 目录下。

---

## Phase 1：Setup（共享基础设施）

**目的**：新增本功能所需的图表依赖，并补上一个 `test` 脚本——尽管 Vitest 已经配置好，
但目前没有脚本可以调用它。

- [x] T001 [P] 在 `app/frontend/package.json` 的 dependencies 中新增 `echarts` 与
      `vue-echarts`，然后在仓库根目录执行 `pnpm install` 完成解析
- [x] T002 [P] 在 `app/frontend/package.json` 中新增 `"test": "vitest run"` 脚本
      （Vitest 已经通过 `vitest.config.ts` 配置好，且已有 3 个既有测试文件，但目前没有任何
      脚本会去调用它）

**检查点**：`app/frontend` 能够渲染 ECharts 组件，并具备一个标准的 `test` 命令。

---

## Phase 2：Foundational（阻塞性前置任务）

**目的**：搭建受权限控制的路由/页面外壳、共享筛选状态，以及每个用户故事的面板都要挂载进去、
都要依赖的基础 API 模块。

**⚠️ 关键**：在本阶段完成之前，任何用户故事面板都无法实现或展示——既没有页面可供渲染，
也没有筛选状态可供读取。

- [x] T003 为既有的 `RouteMeta` 接口新增 `requiresSuperAdmin?: boolean` 字段，并在
      `app/frontend/src/router/routes.ts` 中新增本页面的路由条目（`path: "/analytics-dashboard"`、
      `name: "analyticsDashboard"`、
      `component: () => import("../views/analytics-dashboard/AnalyticsDashboardView.vue")`、
      `meta: { title: "埋点监控", icon: "radar", requiresSuperAdmin: true }`；若 `radar`
      图标键在该应用的 Arco 图标集中不存在，替换为已确认可用的图标，如 `barChart`）
      **偏差说明**：确认 `radar` 图标在该应用的图标映射表（`src/components/acro-icons.vue`）
      与已安装的 `@arco-design/web-vue@2.57.0` 图标集中均不存在，按预先约定的兜底方案使用
      `barChart`。
- [x] T004 在 `app/frontend/src/main.ts` 现有的全局 `beforeEach` 守卫中新增判断逻辑：
      在既有的登录检查之后，若 `to.meta.requiresSuperAdmin` 为真且
      `useUserStore().isSuperAdmin` 为假，则提示错误信息并重定向到 `/`，且不允许目标路由渡染
      （按 `research.md` §3——这必须发生在任何组件挂载之前，不能放在组件的 `onMounted` 里）
      **偏差说明**：为使守卫逻辑可独立单元测试（不依赖 Pinia/DOM），将判断逻辑抽取为纯函数
      `resolveNavigation(to, user)`，新建于 `app/frontend/src/router/guard.ts`；`main.ts` 的
      `beforeEach` 只负责调用该函数并处理返回值（`true` → 放行，字符串 → 重定向）。
- [x] T005 [P] 在 `app/frontend/src/__tests__/router/guard.spec.ts` 中为守卫扩展新增单元测试：
      非超级管理员在 `requiresSuperAdmin` 路由上被重定向离开，且目标组件从未挂载；
      超级管理员可以正常通过；不带 `requiresSuperAdmin` 的路由不受影响
      **偏差说明**：测试对象是 T004 中抽取出的纯函数 `resolveNavigation`，无需挂载任何组件或
      初始化 Pinia，6 个用例全部通过。
- [x] T006 创建 `app/frontend/src/api/modules/analytics/index.ts`，包含共享的
      `ApiResponse<T>` 包装类型、`TimeRange`/`Environment`/`TrackingAppId` 本地类型
      （按 `data-model.md`），以及 `getOverview()`/`getRealtime()` 函数
      （`GET /admin/analytics/overview`、`GET /admin/analytics/realtime`，按
      `contracts/analytics-endpoints.md`）
      **偏差说明**：(1) 实现时一次性写入了全部 6 个接口的函数（`getOverview`/`getRealtime`/
      `getErrors`/`getTrend`/`getPerformance`/`getFunnel`，对应 T016/T025/T031 里计划分阶段
      新增的函数），而不是严格按阶段切分成多次编辑同一文件——功能上等价，只是落地顺序不同。
      (2) 响应类型字段命名从最初 `data-model.md` 草稿的 camelCase 更正为真实后端返回的
      snake_case（如 `pv_today` 而非 `pvToday`），因为 `serverClient` 不做任何字段名转换；
      已同步更正 `data-model.md`。
- [x] T007 [P] 创建 `app/frontend/src/composables/useAnalyticsFilters.ts`：响应式的
      `{ range, appId, environment }` 状态（按 `data-model.md` 的
      `AnalyticsFilterState`），默认 `range: "24h"`、`environment: "production"`、
      `appId: undefined`
- [x] T008 创建 `app/frontend/src/views/analytics-dashboard/AnalyticsDashboardView.vue`：
      页面外壳，包含筛选栏（Arco 的 `a-radio-group`/`a-select`，用于范围、应用、环境，
      绑定到 `useAnalyticsFilters`）、一个持久展示的环境徽标，以及四个空的区域插槽，
      供 Phase 3–6 的面板挂载（依赖 T006、T007）
      **偏差说明**：额外新建 `app/frontend/src/plugins/echarts.ts` 集中注册本功能用到的
      ECharts 图表类型/组件（`LineChart`/`BarChart`/`GridComponent`/`TooltipComponent`/
      `LegendComponent`/`CanvasRenderer`）并导出 `VChart`，供四个面板复用，避免每个面板重复
      调用 `echarts.use()`——这是实现阶段发现的必要基础设施，原计划未单独列出。
- [x] T009 [P] 在 `app/frontend/src/__tests__/composables/useAnalyticsFilters.spec.ts`
      中为 `useAnalyticsFilters` 新增单元测试：默认值、某个筛选项变化时的响应式行为
      （4 个用例全部通过）
- [x] T010 [P] 在 `app/frontend/src/__tests__/api/analytics.spec.ts` 中为
      `getOverview`/`getRealtime` 新增单元测试：确认传给 `serverClient` 的 URL/参数正确，
      响应结构原样传递不变
      **偏差说明**：与 T006 的偏差对应，本测试文件一次性覆盖了全部 6 个 API 函数（合并了
      T019/T028/T034 计划分阶段新增的测试），共 8 个用例，全部通过。

**检查点**：页面已存在于 `/analytics-dashboard`，仅 `super_admin` 用户可访问，筛选状态可正常
工作，且能拉取概览面板所需的两个接口。此时还没有任何面板被渲染出来。

---

## Phase 3：用户故事 1 —— 确认监控管道存活，查看今日概览（优先级：P1）🎯 MVP

**目标**：授权用户能看到今天的 PV/UV/错误数/AI 使用量以及一个 5 分钟实时快照，并具备清晰的
加载中/暂无数据/加载失败状态——在打开页面后 10 秒内就能回答"管道是否已部署并正常工作"。

**独立验收方式**：按 `quickstart.md` 场景 2——打开仪表盘，确认概览面板能从
`/analytics/overview` + `/analytics/realtime` 正确填充数据；另外分别验证后端不可达时展示
明确的错误态、以及数字确实为 0 时展示明确的空态。

### 用户故事 1 的实现任务

- [x] T011 [US1] 实现 `app/frontend/src/views/analytics-dashboard/OverviewPanel.vue`：
      今日 PV/UV/错误数/AI 使用量数字卡片（Arco 的 `a-statistic`）+ 5 分钟实时快照卡片，
      使用 T006 中的 `getOverview`/`getRealtime`，渲染 `loading | ready | empty | error`
      三态（按 `research.md` §6），错误态使用持久化的 `a-result`/`a-alert`（而不是一闪而过的
      提示条），数字全为 0 时使用 `a-empty` 展示"尚无数据"；本面板按 `research.md` §7
      标注"汇总全部环境"（这两个接口不支持环境筛选）
- [x] T012 [US1] 在 `OverviewPanel.vue` 内为 `getRealtime` 添加 30 秒轮询、为
      `getOverview` 添加 60 秒轮询，均在 `onMounted` 中启动、在 `onUnmounted` 中清除
      （Constitution 原则八——避免在 qiankun 主应用的挂载/卸载周期之间产生定时器泄漏）
- [x] T013 [US1] 将 `<OverviewPanel />` 挂载到 `AnalyticsDashboardView.vue` 的第一个区域
      插槽（依赖 T008、T011）
- [x] T014 [P] [US1] 在
      `app/frontend/src/views/analytics-dashboard/__tests__/OverviewPanel.spec.ts` 中为
      `OverviewPanel.vue` 新增单元测试：用模拟数据渲染出就绪态、全 0 响应渲染出空态、
      请求被拒绝渲染出错误态，并且组件卸载时清除了轮询定时器（对 `clearInterval` 打 spy）
      （4 个用例全部通过）
- [ ] T015 [US1] 按 `quickstart.md` 手动执行场景 1（访问控制）与场景 2（管道健康/概览），
      并记录结果
      **未执行**：本环境没有可运行的 q-server + Postgres/Redis/RabbitMQ/ClickHouse 真实栈，
      无法进行端到端人工验收。已通过 T005（访问控制的单元测试）与 T014（概览面板三态的单元
      测试）在组件/函数层面覆盖了本场景验证的核心行为。

**检查点**：用户故事 1 已完整可用、可独立演示——这就是 MVP。

---

## Phase 4：用户故事 2 —— 直观查看与诊断生产环境错误（优先级：P2）

**目标**：授权用户能看到出现频率最高的生产环境错误（次数、受影响用户数、首次/最近出现时间）
以及错误趋势，并可按时间范围与应用进行调整。

**独立验收方式**：按 `quickstart.md` 场景 3——在已知存在错误的前提下打开错误面板，确认
排名/次数正确，然后切换时间范围与应用筛选，确认面板在 3 秒内完成更新。

### 用户故事 2 的实现任务

- [x] T016 [US2] 在 `app/frontend/src/api/modules/analytics/index.ts` 中新增
      `getErrors()`（`GET /admin/analytics/errors`）与共享的 `getTrend()`
      （`GET /admin/analytics/trend`）函数，按 `contracts/analytics-endpoints.md`
      （两者均接受可选的 `environment`/`app_id`）
- [x] T017 [US2] 实现
      `app/frontend/src/views/analytics-dashboard/ErrorsPanel.vue`：一个错误排名表格
      （Arco 的 `a-table`：错误类型/消息、次数、受影响用户数、首次/最近出现时间），加一个
      ECharts 折线趋势图（`getTrend({ metric: "errors" })`），两者均响应
      `useAnalyticsFilters`，三态处理方式与 `OverviewPanel` 一致
- [x] T018 [US2] 将 `<ErrorsPanel />` 挂载到 `AnalyticsDashboardView.vue` 的第二个区域
      插槽（依赖 T008、T017）
- [x] T019 [P] [US2] 在 `app/frontend/src/__tests__/api/analytics.spec.ts` 中为
      `getErrors`/`getTrend` 新增单元测试：确认传给 `serverClient` 的参数正确
      （包括 `environment`/`app_id` 的正确传递）
- [x] T020 [P] [US2] 在
      `app/frontend/src/views/analytics-dashboard/__tests__/ErrorsPanel.spec.ts` 中为
      `ErrorsPanel.vue` 新增单元测试：用模拟数据渲染出排名结果，共享筛选状态变化时重新请求
      （2 个用例全部通过）
- [ ] T021 [US2] 按 `quickstart.md` 手动执行场景 3（错误诊断），并记录结果
      **未执行**：原因同 T015（无可用真实运行栈）。已通过 T019/T020 的自动化测试覆盖核心行为。

**检查点**：用户故事 1 和 2 均可独立正常工作。

---

## Phase 5：用户故事 3 —— 查看生产环境性能健康度（优先级：P3）

**目标**：授权用户能看到各性能指标的百分位汇总与趋势，覆盖来自
`001-q-editor-monitoring-integration` 的编辑器加载/保存耗时。

**独立验收方式**：按 `quickstart.md` 场景 4——在存在性能事件的前提下打开性能面板，确认
p50/p95 与趋势正常渲染，然后切换展示的指标，确认汇总数值/趋势同步更新——包括切换到
`editor_load`/`editor_save` 时同样正常。

### 后端扩展（对应分析报告 C1 缺口，方案 A）

- [x] T022 [US3] 在
      `app/q-server/src/modules/tracking/tracking-analytics/tracking-analytics.schemas.ts`
      中，把 performance 查询 schema 的 `metric` 枚举由
      `z.enum(["fcp", "lcp", "cls", "inp", "api_duration"])` 扩展为新增
      `"editor_load"`、`"editor_save"` 两个取值，按 `contracts/analytics-endpoints.md`
- [x] T023 [US3] 在
      `app/q-server/src/modules/tracking/tracking-analytics/tracking-analytics.service.ts`
      的 `getPerformance` 方法里，为 `switch (query.metric)` 新增两个 `case` 分支
      （`editor_load`/`editor_save`），查询条件为
      `event_name = 'custom_timing' AND JSONExtractString(properties, 'timing_name') = '<对应取值>'`，
      度量字段为 `JSONExtractFloat(properties, 'duration_ms')`，复用既有分支相同的百分位
      聚合 SQL 结构（依赖 T022）
- [x] T024 [P] [US3] 在 `app/q-server/src/spec/tracking/tracking-analytics.spec.ts` 中为
      新增的两个 `metric` 分支新增测试：正确匹配 `custom_timing` 事件并按 `timing_name`
      区分，且不影响既有 `metric` 取值的行为（依赖 T023）
      **偏差说明**：真实文件名为 `tracking-analytics.service.spec.ts`（已存在，本次追加新的
      `describe` 块，而不是新建文件）；同时发现 `packages/common/src/track/track.interface.ts`
      里的 `AnalyticsPerformanceQuery.metric` 字面量联合类型也需要同步扩展，一并完成。
      3 个新测试 + 既有 5 个测试全部通过（`pnpm exec vitest run src/spec/tracking/` → 12/12）。

### 前端实现

- [x] T025 [US3] 在 `app/frontend/src/api/modules/analytics/index.ts` 中新增
      `getPerformance()`（`GET /admin/analytics/performance`），按
      `contracts/analytics-endpoints.md`，`metric` 参数类型包含新增的
      `"editor_load" | "editor_save"`
- [x] T026 [US3] 实现
      `app/frontend/src/views/analytics-dashboard/PerformancePanel.vue`：百分位汇总
      （p50/p75/p95/p99，Arco 的 `a-statistic` 分组）+ ECharts 趋势图，一个指标切换器
      （`fcp | lcp | cls | inp | api_duration | editor_load | editor_save`），响应
      `useAnalyticsFilters`，三态处理方式与既有面板一致
- [x] T027 [US3] 将 `<PerformancePanel />` 挂载到 `AnalyticsDashboardView.vue` 的第三个
      区域插槽（依赖 T008、T026）
- [x] T028 [P] [US3] 在 `app/frontend/src/__tests__/api/analytics.spec.ts` 中为
      `getPerformance` 新增单元测试（含新增的 `editor_load`/`editor_save` 指标，3 个用例）
- [x] T029 [P] [US3] 在
      `app/frontend/src/views/analytics-dashboard/__tests__/PerformancePanel.spec.ts`
      中为 `PerformancePanel.vue` 新增单元测试：用模拟数据渲染出百分位数值，切换指标时
      重新请求（2 个用例全部通过）
- [ ] T030 [US3] 按 `quickstart.md` 手动执行场景 4（性能可见性，包含对 T022–T023 的验收），
      并记录结果
      **未执行**：原因同 T015。T022–T024 已通过针对真实 ClickHouse SQL 拼接逻辑的单元测试
      验证（断言生成的 SQL 片段），T028/T029 覆盖了前端调用与渲染逻辑。

**检查点**：用户故事 1、2、3 均可独立正常工作。

---

## Phase 6：用户故事 4 —— 了解用量与业务转化漏斗（优先级：P4）

**目标**：用户能看到 PV/UV 趋势，以及至少问卷创建、问卷填答两个漏斗的逐步次数与转化率。

**独立验收方式**：按 `quickstart.md` 场景 5——打开用量面板，确认 PV/UV 趋势正常渲染，
然后查看问卷创建漏斗，确认每一步的次数/转化率都展示出来。

### 用户故事 4 的实现任务

- [x] T031 [US4] 在 `app/frontend/src/api/modules/analytics/index.ts` 中新增
      `getFunnel()`（`GET /admin/analytics/funnel`），按 `contracts/analytics-endpoints.md`
      （复用 T016 的 `getTrend()` 获取 PV/UV 趋势，传入 `metric: "pv" | "uv"`）
- [x] T032 [US4] 实现
      `app/frontend/src/views/analytics-dashboard/UsagePanel.vue`：一个 ECharts 双折线
      PV+UV 趋势图（响应 `useAnalyticsFilters`），加一个漏斗名称切换器
      （`survey_creation | survey_response`），展示每一步的次数与转化率；漏斗子区域按
      `research.md` §7 标注"汇总全部环境"（该接口不支持环境筛选），三态处理方式与既有面板
      一致
- [x] T033 [US4] 将 `<UsagePanel />` 挂载到 `AnalyticsDashboardView.vue` 的第四个区域
      插槽（依赖 T008、T032）
- [x] T034 [P] [US4] 在 `app/frontend/src/__tests__/api/analytics.spec.ts` 中为
      `getFunnel` 新增单元测试
- [x] T035 [P] [US4] 在
      `app/frontend/src/views/analytics-dashboard/__tests__/UsagePanel.spec.ts` 中为
      `UsagePanel.vue` 新增单元测试：用模拟数据渲染出趋势 + 漏斗，环境筛选变化时重新请求
      趋势数据（但不重新请求漏斗数据）（2 个用例全部通过）
- [ ] T036 [US4] 按 `quickstart.md` 手动执行场景 5（用量与漏斗），并记录结果
      **未执行**：原因同 T015。T034/T035 已通过自动化测试覆盖核心行为。

**检查点**：四个用户故事均可独立正常工作。

---

## Phase 7：Polish 与横切关注点

**目的**：验证剩余的横切场景，并在提交合并前满足 Constitution 合规关卡。

- [ ] T037 [P] 按 `quickstart.md` 手动执行场景 6（环境范围的诚实呈现——概览/漏斗明确标注
      "汇总全部环境"，而错误/性能/用量趋势正确遵循环境选择器），并记录结果
      **未执行**：原因同 T015。各面板对环境筛选的响应/不响应行为已由各自的自动化测试覆盖
      （如 T035 的"环境变化重新请求趋势但不请求漏斗"用例）。
- [x] T038 更新 `docs/API接口文档.md` 中 `GET /api/admin/analytics/performance` 接口的
      `metric` 参数说明，补充本功能新增的 `editor_load`、`editor_save` 两个取值及其含义
      （编辑器加载/保存耗时），按 Constitution 原则三"任何新增或修改的接口必须在同一个 PR
      内同步更新接口文档"的要求（对应 `/speckit-analyze` 复查发现的 C2），在下一步的完整
      关卡之前完成，确保文档改动与代码改动在同一个 PR 内一起提交
      **偏差说明**：`docs/API接口文档.md` 是一份陈旧的根级文档，从未记录过 tracking-analytics
      模块的任何一个接口（包括本功能之前就已存在的 5 个接口），并非本次改动的真实文档缺口。
      该模块实际维护的接口文档是
      `app/q-server/src/modules/tracking/doc/tracking-module.md`（§6.2 "分析接口查询参数"
      表格），已在该文件里补充 `editor_load`/`editor_save` 取值及一句语义说明，这才是满足
      Constitution 原则三"同一 PR 内更新真实维护的接口文档"这一要求的正确落点。
- [x] T039 对 `app/frontend`（以及 T022–T024、T038 所改动的部分）执行完整的
      lint/格式化/拼写检查/测试关卡：ESLint、Prettier、cspell，以及
      `pnpm --filter frontend test`、`pnpm --filter q-server test:dev`
      （确认 T005/T009/T010/T014/T019/T020/T024/T028/T029/T034/T035 全部通过）后再提交 PR
      **执行结果**：ESLint 对全部新增/修改的源码文件无报错；Prettier 全部通过（发现的 2 处
      格式问题已用 `--write` 修复）；cspell 发现 1 处真实新词汇（`autoresize`，vue-echarts
      的合法 prop 名）已加入 `.cspell/custom-dictionary.txt`（另发现的 `Cascader`/`Mgmt`
      两处属于本功能未触及的既有代码，不在本次改动范围内）；`app/frontend` 63 个测试全部通过，
      `app/q-server` 的 `src/spec/tracking/` 12 个测试全部通过。
- [x] T040 [P] 按 Constitution 原则一、二、四、五、八、十对本次改动做自查（模块边界——
      仅有一处经明确评审的后端小幅新增；类型就近声明；路由守卫仅是 UX 层，后端依然是权威
      判定；测试覆盖；轮询定时器在卸载时被清理；轮询节奏与后端缓存 TTL 对齐；新增的两个
      `metric` 分支未影响既有分支行为）后再请求代码评审
      **自查结论**：全部通过，无遗留问题；`data-model.md` 中原先误写为 camelCase 的响应字段
      命名已同步更正为真实的 snake_case，避免文档与实现出现分歧。

---

## 依赖关系与执行顺序

### 阶段依赖

- **Setup（Phase 1）**：无依赖——可立即开始。
- **Foundational（Phase 2）**：依赖 Setup 完成——阻塞所有用户故事（否则没有页面可供面板挂载）。
- **用户故事（Phase 3–6）**：均依赖 Foundational 阶段完成。
  - 用户故事 1（P1）可在 Foundational 完成后立即开始。
  - 用户故事 2–4 也都可以在 Foundational 完成后立即开始——相互独立（不同的面板文件），
    但四者都会扩展同一个 `api/modules/analytics/index.ts` 文件，如果由不同的人并行开发，
    需要协调避免在这一个文件上产生合并冲突。
  - 用户故事 3 内部：T022–T024（后端）必须先于 T025–T030（前端）中依赖真实 `editor_load`/
    `editor_save` 数据的验收步骤，但不阻塞 T025（前端 `getPerformance` passthrough 函数本身
    的编写）。
- **Polish（Phase 7）**：依赖四个用户故事全部完成（场景 6 覆盖了跨 US1/US2/US3/US4 引入的
  行为）。

### 每个用户故事内部

- API 模块函数先于调用它的面板组件（如 T016 先于 T017；T022–T023 先于 T025–T026）。
- 面板组件实现先于把它挂载进页面外壳（如 T017 先于 T018）。
- 实现任务先于其单元测试真正具有验证意义，但也可以按 TDD 风格与实现同步编写——此处的顺序
  反映的是依赖关系，不是强制"测试必须最后写"。
- 自动化任务先于该阶段的手动 quickstart 验收任务。

### 并行机会

- T001 与 T002（对同一个 `package.json` 的不同、互不重叠的编辑）可以一起做；一旦 T004/T006
  落地，T005、T007、T009、T010 均可 `[P]` 并行。
- Foundational 完成后，US1/US2/US3/US4 各自的面板实现任务（T011、T017、T026、T032）原则上
  可由不同的人并行推进，注意协调共享的 `analytics/index.ts` 与
  `AnalyticsDashboardView.vue` 文件。
- 每个故事标记 `[P]` 的测试任务可以和该故事的下一个实现任务并行进行。

---

## 并行示例：Foundational 阶段

```bash
# 一旦 T004/T006 落地，以下独立任务可以一起进行：
Task: "在 app/frontend/src/__tests__/router/guard.spec.ts 中为守卫扩展新增单元测试"
Task: "创建 app/frontend/src/composables/useAnalyticsFilters.ts 组合式函数"
```

## 并行示例：用户故事 3（含新增的后端任务）

```bash
# T023 完成后，以下独立任务可以一起进行：
Task: "在 app/q-server/src/spec/tracking/tracking-analytics.spec.ts 中为新增 metric 分支写测试"
Task: "在 app/frontend/src/api/modules/analytics/index.ts 中新增 getPerformance() 函数"
```

---

## 实施策略

### 先做 MVP（仅用户故事 1）

1. 完成 Phase 1：Setup
2. 完成 Phase 2：Foundational（关键——阻塞所有用户故事）
3. 完成 Phase 3：用户故事 1（管道健康/概览）
4. **停下来验证**：独立执行 quickstart 场景 1–2
5. 如果一切正常，可以部署/演示——确认监控管道存活，正是最初需求里"部署是否完整"这一半问题
   最直接的答案，也是四个视图中价值最高的增量

### 增量交付

1. Setup + Foundational → 一个受权限控制、筛选功能正常的页面外壳
2. 加入用户故事 1 → 验证 → 部署（MVP：管道健康/概览）
3. 加入用户故事 2 → 验证 → 部署（增加错误诊断）
4. 加入用户故事 3 → 验证 → 部署（增加性能可见性，包含后端小幅扩展）
5. 加入用户故事 4 → 验证 → 部署（增加用量/漏斗可见性）
6. Polish 阶段 → 验证剩余的横切场景，跑完整关卡

---

## 备注

- `[P]` 任务涉及不同文件（或对同一配置文件里明显不重叠的编辑），且不依赖尚未完成的任务。
- `[Story]` 标签把每个用户故事阶段的任务追溯回 spec.md 中的 US1/US2/US3/US4。
- T016/T022/T031（分别属于 US2/US3/US4）都会扩展同一个 `api/modules/analytics/index.ts`
  文件——如果由一个人完成，按顺序实现即可；如果拆给多人，需要协调合并。
- T022/T023 是本功能对"零后端改动"这一最初假设的唯一、经用户明确选定的例外（分析报告 C1，
  方案 A）——不要跳过这两个任务去"降级"处理，那是未被选中的方案 B。
- 提交建议按任务或逻辑分组进行；可以在任何检查点停下来独立验证某个故事，再继续下一个。
- **手动 quickstart 验收任务（T015/T021/T030/T036/T037）需要一套跑着真实数据、且已部署
  `001-q-editor-monitoring-integration` 埋点管道的 `q-server` 环境才能执行**——如果实现时
  仍无法访问这样的环境，应如实记录这一缺口，而不是悄悄跳过（参见
  `001-q-editor-monitoring-integration` 自身 tasks.md 里对同类情况的记录方式）。
