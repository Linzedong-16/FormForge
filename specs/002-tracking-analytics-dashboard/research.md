# Phase 0 调研：管理后台埋点监控数据可视化仪表盘

技术上下文中的所有未知项，均通过直接查阅 `app/frontend` 的真实代码（路由、Store、
API 客户端约定）以及 `q-server` 现有的 `tracking-analytics` 模块（已在
`001-q-editor-monitoring-integration` 中建成，并支持环境筛选）得到解决。
不存在遗留的 `NEEDS CLARIFICATION` 标记。

## 1. 图表库选型

- **决策**：为 `app/frontend` 新增 `echarts` + `vue-echarts` 依赖。
- **理由**：`app/frontend` 的 `package.json` 目前完全没有任何图表库，而 Arco Design Vue
  （该应用主要的 UI 组件库）本身不提供数据可视化组件（仅有基础的 `Statistic`/`Progress`）。
  ECharts 是成熟、广泛使用、可摇树优化的图表库，配有一流的 Vue 3 封装（`vue-echarts`）；
  无需任何后端改动，且能直接从 `AnalyticsTrendResponse`/`AnalyticsPerformanceResponse`
  已经返回的 `{time, value}` 点数组渲染出本功能所需的全部图表类型（折线趋势图、排行柱状图）。
- **考虑过的替代方案**：
  - _Chart.js_：同样可行，但 ECharts 对本功能需要的"百分位 + 趋势"组合图有更好的开箱即用支持，
    也是该代码库所处的中文 Vue 生态里与 Arco/Element 搭配更常见的选择。
  - _自研 SVG 图表_：否决——为一个已被充分解决的问题重新造轮子，没有额外价值。

## 2. 响应类型策略：本地内联接口 vs. 从 `packages/common` 导入

- **决策**：在新建的 `src/api/modules/analytics/index.ts` 中声明本地、就近定义的 TypeScript
  接口，字段结构与 `packages/common/src/track/track.interface.ts` 中已有的 `Analytics*`
  类型保持一致——而不是为 `app/frontend` 新增 `monorepo-code-common` 这一工作区依赖。
- **理由**：`app/frontend` 现有的每一个 API 模块（`log`、`admin`、`auth`、`survey`、`user`、
  `review`）都遵循这个模式——本地定义的 `ApiResponse<T>` 包装类型 + 本地定义的响应结构接口，
  其中 `log/index.ts` 甚至专门写注释"与 @common/log/log.interface 保持一致"，而不是直接导入它。
  `app/frontend` 目前完全不依赖 `monorepo-code-common`。遵循这一既有的本地约定，比引入新依赖
  更贴合这个应用自身的实践；且 Constitution 原则二只要求类型"与相关 API 模块就近声明"并镜像
  后端的实际响应结构——本地接口已满足这一点。
- **考虑过的替代方案**：
  - 直接从 `monorepo-code-common` 导入带 `Analytics` 前缀的类型（如 `AnalyticsOverview`、
    `AnalyticsErrorsResponse`）：抽象上更 DRY，但会是这个应用里第一次出现这种导入，且会偏离
    所有同级模块既有的模式，而这些类型本身只是简单、稳定、只读的 DTO，收益有限。

## 3. 权限控制：新增路由守卫 vs. 新建权限系统

- **决策**：为现有的 `RouteMeta` 接口（`src/router/routes.ts`）新增一个可选字段
  `requiresSuperAdmin?: boolean`，并在 `main.ts` 现有的全局 `beforeEach` 守卫中新增一个
  `if` 分支：当 `to.meta.requiresSuperAdmin` 为真且 `useUserStore().isSuperAdmin` 为假时，
  提示错误信息并重定向离开。
- **理由**：`app/frontend` 目前没有任何基于角色的路由拦截（只有登录/未登录检查），也没有类似
  `q-editor` 的 `v-permiss` 指令。`useUserStore().isSuperAdmin`（一个已经存在的计算属性，
  读取 `user.role === "super_admin"`）恰好就是所需要的判断依据。为单独一个页面构建一套通用
  权限框架是不成比例的范围扩张；一个两行代码、范围收窄的守卫扩展是最小的正确修复方式，
  且未来任何新的"仅管理员可见"页面都能复用同一个 `meta` 字段。
- **考虑过的替代方案**：
  - _组件内守卫（在 `AnalyticsDashboardView.vue` 的 `onMounted` 里检查）_：否决——会在重定向
    之前出现页面外壳的一闪，违反 SC-005（"不出现任何数据的哪怕短暂闪现"）；路由级守卫可以让
    组件完全不渲染。
  - _新建独立的权限指令系统（比照 q-editor 的 `v-permiss`）_：否决，对单一页面而言范围过大；
    记录为未来如果新增更多仅管理员可见页面时的一个合理增强方向。

## 4. 各分析接口与用户故事的映射关系

- **决策**：按下表将接口映射到各区域（均已存在，均已按 `001-q-editor-monitoring-integration`
  支持 `environment`/`app_id` 筛选）：

  | 区域（对应用户故事） | 使用的接口                                                    |
  | -------------------- | ------------------------------------------------------------- |
  | 概览/管道健康（US1） | `GET /analytics/overview`、`GET /analytics/realtime`          |
  | 错误（US2）          | `GET /analytics/errors`、`GET /analytics/trend?metric=errors` |
  | 性能（US3）          | `GET /analytics/performance`                                  |
  | 用量与漏斗（US4）    | `GET /analytics/trend?metric=pv\|uv`、`GET /analytics/funnel` |

- **理由**：这是规格说明里四个用户故事到六个既有分析接口之间的一一直接映射，互不重叠——
  无需任何新的后端工作，也不存在"哪个区域该用哪份数据"的歧义。
- **考虑过的替代方案**：是否也展示 `/analytics/ai-usage` 与 `/analytics/events`
  （按规格说明的假设部分，两者均已明确推迟）：`ai-usage` 没有对应到任何编号用户故事，
  本次迭代不纳入；`events`（原始事件级下钻）已在规格说明的假设中明确排除在范围之外。

## 5. 自动刷新/轮询策略

- **决策**：概览面板（US1）在页面打开期间每 30 秒轮询一次 `/analytics/realtime`、每 60 秒
  轮询一次 `/analytics/overview`——恰好与这两个接口自身的 Redis 缓存 TTL 对齐（轮询更快只会
  重复拉取同一份缓存数据；轮询更慢则会不必要地展示陈旧的"实时"数据）。错误/性能/用量面板
  按需（筛选条件变化时）重新请求，而不是定时刷新，因为规格说明的假设部分并未要求趋势图表
  持续实时更新——只有 US1/FR-008 中"实时快照"的措辞暗示需要轮询。
- **理由**：与规格说明假设部分（"周期性后台刷新……具体节奏留给规划阶段"）保持一致，同时遵循
  Constitution 原则十（不要以超过后端有效应答能力的频率去轮询）。
- **考虑过的替代方案**：WebSocket/SSE 推送式真实时更新——否决，不成比例；后端目前并不主动推送
  分析数据更新，而 30 秒缓存轮询已经足以满足 SC-001（打开页面 10 秒内完成健康判断——SC-001
  衡量的是首次轮询响应，而非后续轮询）。

## 6. "暂无数据" 与 "加载失败" 状态的呈现方式

- **决策**：每个面板独立维护自己数据请求的三态（`loading | ready | empty | error`），
  分别渲染：加载中展示骨架屏/加载指示器；有数据时展示实际的图表/表格/卡片；请求成功但没有
  匹配数据时展示 Arco 的 `a-empty` 组件并附"尚无数据"文案；请求失败时展示一个持久化的 Arco
  `a-result`/`a-alert` 错误区块（而不只是一条一闪而过的 `Message.error` 提示），并提供
  重试操作。
- **理由**：现有的 `AuditLogsView.vue` 模式已经用 `a-table :loading` + `a-empty` 处理
  加载中/无数据这一对状态，但错误状态只用了一条一闪而过的提示——对本功能明确的 FR-007
  要求（三种状态必须持久地、视觉上彼此区分）而言是不够的（提示消失后，稍后瞥一眼仪表盘的人
  必须仍能区分"无数据"和"故障"）。
- **考虑过的替代方案**：只沿用既有的"错误用提示条"惯例——否决，不满足 FR-007 明确提出的、
  比这个代码库以往做法更严格的要求。

## 7. 发现的缺口：`overview`/`realtime`/`funnel` 不支持 `environment` 筛选

- **决策**：本功能不对此扩展 `q-server`。概览与实时面板（US1）按现状展示"汇总全部环境"的
  数据，并在界面上加一个小提示（"汇总全部环境"），而不是假称自己是按环境筛选的；漏斗视图
  （属于 US4 的一部分）同样处理。环境选择器（FR-006）在视觉上确实作用于、且被
  错误/性能/用量趋势这几个区域正确遵循（这几个区域自 `001-q-editor-monitoring-integration`
  起就已端到端支持该筛选）。
- **理由**：`001-q-editor-monitoring-integration` 当时是刻意、明确地把环境筛选范围限定在自身
  用户故事真正需要的三个接口上（`errors`/`performance`/`trend`），并明确记录
  `overview`/`realtime`/`funnel`/`ai-usage`/`events` 是有意不做筛选的（对 realtime 的说明是
  "不做扩展——给一个 5 分钟窗口做环境筛选价值不高"）。如果因为这个纯前端功能就顺手重新打开
  那个此前审慎划定的范围边界，会让本功能的范围悄悄扩张到计划里已明确排除的后端工作。
  更关键的是，US1 真正的目标（SC-001：确认管道存活）并不需要按环境筛选才能达成——只要看到
  *任意*环境里有*任意*事件在流动，就已经回答了"管道是否已部署并在接收数据"这个问题；
  按环境筛选反而会让这个检查变得更慢（多点几次），却不会带来更多信心。
- **考虑过的替代方案**：
  - _现在就扩展 `q-server`，把 `environment` 也加到 `overview`/`realtime`/`funnel` 上_：
    本功能否决——会与本计划"不改动后端"的整体框定相矛盾，且是在重新裁决上一个功能刻意划定的
    范围边界；记录为未来如果确实出现"漏斗/概览需要按环境筛选"的需求时的候选后续工作。
  - _在概览/漏斗面板上直接隐藏环境选择器_：考虑过但否决——让选择器在所有面板上始终可见
    （只是明确标注"此处未生效"），比它在不同面板间时隐时现更不容易让人困惑。

## 8. 分析报告发现的 C1 缺口：性能面板无法展示编辑器加载/保存耗时（采用方案 A：小幅扩展后端）

- **决策**：对 `q-server` 的 `getPerformance` 接口做一次小幅、可加式的扩展——在
  `tracking-analytics.schemas.ts` 的 `metric` 枚举中新增两个取值 `editor_load` 与
  `editor_save`，并在 `tracking-analytics.service.ts` 的 `switch (query.metric)` 分支中
  新增对应的两个 `case`，查询条件为
  `event_name = 'custom_timing' AND JSONExtractString(properties, 'timing_name') = 'editor_load'`
  （`editor_save` 同理），度量字段为 `JSONExtractFloat(properties, 'duration_ms')`。
- **理由**：本功能在 `/speckit-analyze` 阶段发现，`001-q-editor-monitoring-integration` 里
  q-editor 端上报编辑器加载/保存耗时的真实调用方式是
  `getPerformanceCollector().trackTiming("editor_load"/"editor_save", durationMs, {...})`
  （见 `app/q-editor/src/views/EditorView/index.vue`），而该方法在 SDK 内部
  （`packages/tracking-sdk/src/collectors/performance.ts`）统一以
  `event_name = "custom_timing"`、`properties.timing_name = "<传入的名字>"`、
  `properties.duration_ms` 上报——**并不是**用 `editor_load`/`editor_save` 作为
  `event_name` 本身。而 `getPerformance` 现有的 `metric` 枚举
  （`fcp | lcp | cls | inp | api_duration`）里，没有任何一个取值会去匹配
  `event_name = 'custom_timing'`。也就是说，在不改动后端的前提下，spec.md 的 FR-010／
  用户故事 3 里"性能区域必须……覆盖……编辑器的加载与保存耗时"这句承诺是**兑现不了的**——
  这正是分析报告里 C1（CRITICAL）指出的问题。用户在澄清问题中选择了"方案 A：小幅扩展后端"，
  因此这里选择真正扩展接口能力，而不是弱化 spec 里的措辞去回避这个缺口。这个改动严格是
  新增（新增两个 `metric` 枚举值 + 两个 `case` 分支），不影响任何既有 `metric` 取值的行为，
  符合 Constitution 原则十（不破坏既有的分区裁剪与缓存策略）。
- **考虑过的替代方案**：
  - _方案 B：降低 spec 描述，把编辑器加载/保存耗时列为本功能明确不处理的延后项，性能面板
    仅展示现有可用的四个标准性能指标_：用户在澄清问题中明确未选择此方案。
  - _在前端对 `custom_timing` 事件做二次聚合，绕开后端 `getPerformance`_：否决——违反
    FR-002（不得在前端重新实现聚合逻辑）与 Constitution 原则一（`q-server`
    是持久化与跨领域业务逻辑的唯一真源）。
