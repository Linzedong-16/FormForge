# Tracking 埋点监控模块 — 接口与前后端对接梳理

## 文档说明

本文档梳理 `app/q-server/src/modules/tracking` 下 `tracking-ingest`（埋点上报）与 `tracking-analytics`（数据分析）两个模块对外暴露的全部接口，包括请求方法、参数格式、返回数据结构、完整业务流程；并进一步梳理 `app/q-editor`、`app/frontend` 两个前端项目对这些接口的调用逻辑与 SDK 集成方式，以及 `packages` 目录下公共包在前后端对接链路中承担的角色。文末给出按功能分类的结构化接口清单。

参考源码：

- [tracking-ingest.routes.ts](file:///d:/coding/project/questionnaireSys/app/q-server/src/modules/tracking/tracking-ingest/tracking-ingest.routes.ts)
- [tracking-ingest.service.ts](file:///d:/coding/project/questionnaireSys/app/q-server/src/modules/tracking/tracking-ingest/tracking-ingest.service.ts)
- [tracking-analytics.routes.ts](file:///d:/coding/project/questionnaireSys/app/q-server/src/modules/tracking/tracking-analytics/tracking-analytics.routes.ts)
- [tracking-analytics.service.ts](file:///d:/coding/project/questionnaireSys/app/q-server/src/modules/tracking/tracking-analytics/tracking-analytics.service.ts)
- [track.interface.ts](file:///d:/coding/project/questionnaireSys/packages/common/src/track/track.interface.ts)
- [tracker.ts](file:///d:/coding/project/questionnaireSys/packages/tracking-sdk/src/core/tracker.ts)

---

## 1. 后端接口详解

### 1.1 挂载方式

在 [routes/index.ts](file:///d:/coding/project/questionnaireSys/app/q-server/src/routes/index.ts#L159-L162) 中注册：

```ts
// tracking-ingest: 埋点上报接口（公开，无需认证，前缀 /api/v1）
fastify.register(trackingIngestRoutes, { prefix: "/v1" });
// tracking-analytics: 数据分析接口（管理员权限，前缀 /api/admin）
fastify.register(trackingAnalyticsRoutes, { prefix: "/admin" });
```

Fastify 应用全局已带 `/api` 前缀，因此两个模块的完整路径分别为 `/api/v1/*` 与 `/api/admin/*`。

### 1.2 tracking-ingest（埋点上报，公开接口）

| 序号 | 方法 | 完整路径 | 认证 | 限流 | Body 限制 |
|------|------|----------|------|------|-----------|
| 1 | POST | `/api/v1/track` | 无需认证 | 60 次/秒（IP） | ≤ 10KB |
| 2 | POST | `/api/v1/track/batch` | 无需认证 | 30 次/秒（IP） | ≤ 512KB，最多 200 条 |

#### 1.2.1 `POST /api/v1/track` — 单条事件上报

- **用途**：错误事件优先通道，前端 SDK 在捕获到 JS/Vue/API 等错误时立即调用，不经过缓冲队列。
- **请求体**（`TrackSingleRequest` = `TrackEventPayload`，见 [track.interface.ts#L76-L105](file:///d:/coding/project/questionnaireSys/packages/common/src/track/track.interface.ts#L76-L105)）：

```json
{
  "event_id": "0191a2c3-...(UUID v7)",
  "event_name": "js_error",
  "app_id": "q-editor",
  "environment": "production",
  "user_id": 42,
  "anonymous_id": "anon-xxx",
  "session_id": "sess-xxx",
  "device_id": "dev-xxx",
  "timestamp": "2026-06-21T08:00:00.000Z",
  "client_env": { "os": "Windows", "browser": "Chrome" },
  "page_url": "https://xxx/editor/123",
  "page_title": "问卷编辑器",
  "sdk_version": "1.0.0",
  "properties": { "error_type": "TypeError", "error_message": "..." }
}
```

- **Zod 校验规则**（[tracking-ingest.schemas.ts](file:///d:/coding/project/questionnaireSys/app/q-server/src/modules/tracking/tracking-ingest/tracking-ingest.schemas.ts)）：`event_id`/`event_name` 必填字符串，`app_id` 必须在白名单 `["q-editor","frontend","main-app","q-server","ai-service"]` 内，`environment` 必须为 `production/staging/development`，`timestamp` 为 ISO 8601 且不能超过未来 5 分钟，`properties` JSON 大小 ≤ 8KB。
- **返回**：`204 No Content`（无响应体），校验失败时由 `parseAndRespond` 返回标准错误结构。
- **业务流程**：
  1. Fastify 路由用 Zod 校验请求体，失败直接 400 返回；
  2. 校验通过后**不等待**处理结果，立即 `reply.status(204).send()`（避免阻塞客户端）；
  3. 异步调用 `TrackingIngestService.ingestSingle(body, request)`：
     - 补充服务端字段 `TrackServerFields`：`server_timestamp`、`client_ip_hash`（SHA256 前 16 位，不可逆脱敏）、`user_agent_parsed`（UA 解析出浏览器/OS/设备类型）；
     - 合并为 `TrackEventFull`；
     - 通过 RabbitMQ（Exchange `tracking-events`，topic 类型）发布，`routing_key = "{error|perf|behavior|metric}.{app_id}"`；错误事件路由到 `tracking-errors` 队列（高优先级）；
     - **降级策略**：RabbitMQ 不可用时，写入本地 `logs/tracking-fallback/` 目录 JSONL 文件，保证数据不丢失；
  4. 处理过程中的异常仅记录日志（`fastify.log.error`），不影响已返回的 204 响应。

#### 1.2.2 `POST /api/v1/track/batch` — 批量事件上报

- **用途**：行为/性能类事件，前端 SDK 内部队列缓冲后批量上报（默认 50 条或 10 秒触发一次）。
- **请求体**（`TrackBatchRequest`）：

```json
{ "events": [ /* TrackEventPayload 数组，1-200 条 */ ] }
```

- **返回**：`204 No Content`。
- **业务流程**：与单条一致，区别在于 `ingestBatch(events, request)` 会对数组中每条事件分别补充服务端字段后按 `routing_key` 批量发布到 MQ；同样具备本地 JSONL 降级能力。

#### 1.2.3 下游消费与存储（非对外接口，但是完整链路的一部分）

```
前端 SDK → POST /track(/batch) → Ingest Service（补字段+发MQ） → RabbitMQ
   → Tracking Consumer（独立进程，批量200条/3s，event_id去重，手动ACK）
   → ClickHouse（tracking_events 主表 + 3 个物化视图，按天分区，TTL 90天）
```

消费进程与建表脚本位于 [consumer/tracking-consumer.ts](file:///d:/coding/project/questionnaireSys/app/q-server/src/consumer/tracking-consumer.ts)，非路由接口，此处仅作链路说明。

### 1.3 tracking-analytics（数据分析，管理员接口）

所有接口挂载前缀 `/api/admin/analytics`，均需 `authenticate`（登录校验）+ `requireSuperAdmin`（超级管理员权限）两个前置钩子（见 [tracking-analytics.routes.ts#L34-L36](file:///d:/coding/project/questionnaireSys/app/q-server/src/modules/tracking/tracking-analytics/tracking-analytics.routes.ts#L34-L36)），统一使用 `reply.sendSuccess(result)` 包装为 `{ code, msg, data }` 结构。

| 序号 | 方法 | 完整路径 | 限流 | 缓存 TTL | 功能 |
|------|------|----------|------|----------|------|
| 3 | GET | `/api/admin/analytics/overview` | 60次/分钟 | 60s | 今日概览（PV/UV/错误/问卷/AI） |
| 4 | GET | `/api/admin/analytics/realtime` | 120次/分钟 | 30s | 近5分钟实时快照 |
| 5 | GET | `/api/admin/analytics/trend` | 30次/分钟 | 5min | 多指标多粒度趋势 |
| 6 | GET | `/api/admin/analytics/errors` | 30次/分钟 | 5min | 错误聚合 Top N |
| 7 | GET | `/api/admin/analytics/performance` | 30次/分钟 | 5min | 性能百分位(P50/75/95/99) |
| 8 | GET | `/api/admin/analytics/funnel` | 30次/分钟 | 10min | 业务漏斗转化 |
| 9 | GET | `/api/admin/analytics/ai-usage` | 30次/分钟 | 10min | AI 使用统计 |
| 10 | GET | `/api/admin/analytics/events` | 30次/分钟 | 无缓存 | 事件明细分页查询 |

#### 1.3.1 `GET /analytics/overview`

- **请求参数**：无。
- **返回结构**（`AnalyticsOverview`）：

```ts
{
  pv_today: number; uv_today: number; online_users: number;
  surveys_created_today: number; responses_today: number;
  errors_today: number; ai_usage_today: number;
}
```

- **业务流程**：Service 层先查 Redis 缓存（key 含日期，TTL 60s），未命中则对 ClickHouse 并发聚合查询当日 PV/UV/错误数等，写回缓存后返回。

#### 1.3.2 `GET /analytics/realtime`

- **请求参数**：无。
- **返回结构**（`AnalyticsRealtimeStats`）：`online_users`、`recent_pv`、`recent_errors`、`recent_api_avg_ms`。
- **业务流程**：查询最近 5 分钟窗口数据，Redis 缓存 30s，用于监控大屏近实时刷新。

#### 1.3.3 `GET /analytics/trend`

- **Query 参数**（`AnalyticsTrendQuery`）：`metric`（pv/uv/errors/api_requests/surveys_created/responses/ai_usage，必填）、`granularity`（minute/hour/day/week/month，必填）、`range`（1h/6h/24h/7d/30d/90d，必填）、`app_id`（可选）、`environment`（可选，默认 production）。
- **返回结构**（`AnalyticsTrendResponse`）：`{ metric, granularity, points: [{ time, value }] }`。
- **业务流程**：Zod 校验查询参数 → 组装 Redis 缓存 key（含全部参数）→ 未命中时按 `range` 计算起止时间并强制携带 ClickHouse 分区裁剪条件 `date` → 按 `granularity` 做时间桶聚合 → 缓存 5 分钟。

#### 1.3.4 `GET /analytics/errors`

- **Query 参数**（`AnalyticsErrorsQuery`）：`range`（必填）、`app_id`/`environment`/`top_n`/`error_type`（可选）。
- **返回结构**（`AnalyticsErrorsResponse`）：`{ total_count, errors: AnalyticsErrorItem[] }`，每项含 `error_group_key`、`error_type`、`error_message`、`count`、`affected_users`、`affected_sessions`、`first_seen`、`last_seen`、`trend`（近24小时每小时计数）。
- **业务流程**：按 `error_group_key`（通常为错误类型+消息哈希）分组聚合 Top N，结合 `tracking_errors_hourly_mv` 物化视图加速；缓存 5 分钟。

#### 1.3.5 `GET /analytics/performance`

- **Query 参数**（`AnalyticsPerformanceQuery`）：`metric`（fcp/lcp/cls/inp/api_duration/editor_load/editor_save，必填）、`range`（必填）、`app_id`/`environment`/`page_url`（可选）。
- **返回结构**（`AnalyticsPerformanceResponse`）：`{ metric, current: { p50,p75,p95,p99,avg,sample_count }, trend_points }`。
- **业务流程**：从 `tracking_perf_hourly_mv` 聚合视图或主表计算百分位统计；`editor_load`/`editor_save` 对应 q-editor 通过自定义计时上报的 `custom_timing` 事件（`properties.timing_name` 区分）；缓存 5 分钟。

#### 1.3.6 `GET /analytics/funnel`

- **Query 参数**（`AnalyticsFunnelQuery`）：`funnel_name`（survey_response/survey_creation/ai_usage，必填）、`range`（必填）、`app_id`（可选）。
- **返回结构**（`AnalyticsFunnelResponse`）：`{ funnel_name, total_users, steps: [{ name, event_name, count, rate, prev_step_rate }] }`。
- **业务流程**：按预定义漏斗步骤（如问卷填写漏斗：`survey_view → survey_submit_start → survey_submit_success`）依次统计各步骤独立用户数，计算相对首步/上一步转化率；依赖 `tracking_funnel_daily_mv`；缓存 10 分钟。

#### 1.3.7 `GET /analytics/ai-usage`

- **Query 参数**（`AnalyticsAIUsageQuery`）：`range`（必填）。
- **返回结构**（`AnalyticsAIUsageResponse`）：`{ generate_count, polish_count, total_tokens, estimated_cost, success_rate, daily: [{date, generate_count, polish_count, tokens}] }`。
- **业务流程**：聚合 `editor_use_ai_generate`/`editor_use_ai_polish` 等指标事件，按日汇总生成趋势；缓存 10 分钟。

#### 1.3.8 `GET /analytics/events`

- **Query 参数**（`AnalyticsEventDetailQuery`）：`event_name`/`app_id`/`user_id`（可选筛选）、`range`（必填）、`page`/`page_size`（分页）。
- **返回结构**（`AnalyticsEventDetailResponse`）：`{ total, page, page_size, items: TrackEventFull[] }`。
- **业务流程**：直接查询 ClickHouse 主表明细并分页，不做缓存（保证明细实时性），强制 `LIMIT` 防止 OLAP 查询耗尽内存。

---

## 2. 前端对接实现

### 2.1 q-editor（问卷编辑器）— SDK 全量集成

q-editor 是 tracking-sdk 的**完整消费方**，负责真实产生埋点数据并上报。

#### 2.1.1 接入封装：`src/plugins/tracking.ts`

文件：[tracking.ts](file:///d:/coding/project/questionnaireSys/app/q-editor/src/plugins/tracking.ts)

- 从 `monorepo-tracking-sdk` 导入 `Tracker`、`ErrorCollector`、`PerformanceCollector`，从 `monorepo-tracking-sdk/plugins/vue` 导入 `createTrackingPlugin`；
- `getTracker()`：懒创建全局单例 `Tracker`，配置 `appId: "q-editor"`、`endpoint: "/api/v1/track"`、`environment` 由 `import.meta.env.MODE` 映射（production/staging/development）；
- `getErrorCollector()` / `getPerformanceCollector()`：懒创建并注册，供业务代码手动上报；
- `installTracking(app, router)`：核心安装函数——注册全局错误采集、安装 Vue 插件（自动挂载 `$tracker`、自动错误处理、路由 PV 上报）、启用性能采集器；
- `flushTracking()`：qiankun `unmount()` 生命周期中调用，冲刷缓冲队列避免事件丢失。

#### 2.1.2 挂载时机：`src/main.ts`

在 [main.ts](file:///d:/coding/project/questionnaireSys/app/q-editor/src/main.ts#L60-L86) 的 `render()` 函数内，standalone 与 qiankun 子应用两种运行模式**共用同一套** `installTracking(instance, router)` 调用，保证埋点行为一致；`unmount()` 生命周期钩子中调用 `flushTracking()` 尽力冲刷。

#### 2.1.3 业务代码手动上报：EditorView

在 [EditorView/index.vue](file:///d:/coding/project/questionnaireSys/app/q-editor/src/views/EditorView/index.vue#L32-L33) 中导入 `getPerformanceCollector`、`getErrorCollector`，在问卷加载/保存流程中调用 `trackTiming()` 上报耗时（对应分析接口 `performance` 的 `editor_load`/`editor_save` 指标），并在 `try/catch` 中调用 `errorCollector.reportError()` 上报加载失败等可恢复错误。

#### 2.1.4 完整数据传递流程（q-editor → 后端）

```
用户操作（打开编辑器/保存问卷/组件报错）
  → Tracker.track(eventName, priority, properties)
  → 采样判断 + 属性脱敏 + 答卷内容检测（安全防护，防止误报答卷正文）
  → priority='error' ? 立即 sendBeacon/fetch → POST /api/v1/track
  → 其他优先级 → EventQueue 缓冲（满50条或10s超时）→ POST /api/v1/track/batch
```

q-editor 未直接调用 analytics 分析接口（分析接口面向管理后台）。

### 2.2 frontend（管理后台）— 仅消费分析接口，不集成 SDK 上报

frontend 的 `package.json` 中**未依赖** `monorepo-tracking-sdk`（仅依赖 `monorepo-survey-engine`），代码中检索 `tracking-sdk`/`installTracking`/`Tracker(` 均无匹配，说明该应用本身**不采集/上报**埋点事件，只是埋点数据的**展示消费方**。

#### 2.2.1 接口封装：`src/api/modules/analytics/index.ts`

文件：[analytics/index.ts](file:///d:/coding/project/questionnaireSys/app/frontend/src/api/modules/analytics/index.ts)

- 就近声明本地类型（`OverviewSnapshot`、`ErrorsResponse`、`TrendResponse`、`PerformanceResponse`、`FunnelResult` 等），字段与 `packages/common` 的 `Analytics*` 类型保持一致（均为 snake_case，对齐 ClickHouse 字段命名），**未直接引入 `monorepo-code-common` 作为依赖**（文档注释说明为避免引入新依赖，见 `research.md §2`）；
- 通过统一的 `serverClient`（`baseURL: "/api"`，自动附加 `Authorization` Bearer Token，处理 401 刷新/429 限流/5xx 弹窗）逐一封装 8 个分析接口：
  - `getOverview()` → `GET /admin/analytics/overview`
  - `getRealtime()` → `GET /admin/analytics/realtime`
  - `getErrors(params)` → `GET /admin/analytics/errors`
  - `getTrend(params)` → `GET /admin/analytics/trend`
  - `getPerformance(params)` → `GET /admin/analytics/performance`
  - `getFunnel(params)` → `GET /admin/analytics/funnel`

  （注：ai-usage 与 events 明细接口未在该文件中列出对应封装，页面当前聚焦概览/错误/性能/用量四大面板。）

#### 2.2.2 页面消费：`analytics-dashboard` 视图

[AnalyticsDashboardView.vue](file:///d:/coding/project/questionnaireSys/app/frontend/src/views/analytics-dashboard/AnalyticsDashboardView.vue) 作为容器页，顶部提供时间范围/应用/环境三个筛选器（通过 `useAnalyticsFilters` composable 管理响应式状态），下方拆分为四个子面板组件分别消费对应接口：

| 子组件 | 消费接口 |
|--------|----------|
| `OverviewPanel.vue` | `getOverview` |
| `ErrorsPanel.vue` | `getErrors` |
| `PerformancePanel.vue` | `getPerformance` |
| `UsagePanel.vue` | `getTrend` / `getFunnel` |

筛选条件变化时各面板独立触发对应接口重新请求，实现联动刷新（概览/实时快照/漏斗按接口设计不支持环境筛选，见分析接口注释）。

#### 2.2.3 完整数据传递流程（frontend → 后端）

```
用户在筛选栏调整 range/app_id/environment
  → useAnalyticsFilters 更新响应式 filters
  → 各 Panel 组件 watch filters 变化 → 调用 analytics API 封装函数
  → serverClient.get(...) 自动携带 Authorization
  → GET /api/admin/analytics/* （需超级管理员权限）
  → 后端 Redis 缓存命中/ClickHouse 聚合查询
  → 响应 { code, msg, data } → Panel 组件渲染图表/表格
```

---

## 3. packages 公共包在对接链路中的作用

| 包名 | 类型 | 使用方 | 在 tracking 链路中的职责 |
|------|------|--------|--------------------------|
| `monorepo-tracking-sdk`（`packages/tracking-sdk`） | 前端埋点 SDK | q-editor（生产依赖） | **唯一的埋点数据生产与上报能力提供者**：<br>• `core/tracker.ts` — `Tracker` 核心类，负责采样、脱敏、答卷内容检测、队列路由、重试与页面卸载兜底冲刷；<br>• `core/queue.ts` — 环形缓冲队列，错误事件跳过队列直发，其他事件按 `batchSize`/`flushInterval` 批量冲刷；<br>• `core/context.ts` — 自动补全 `app_id`/`session_id`/`device_id`/`client_env` 等公共字段；<br>• `collectors/error.ts` — 自动捕获 JS 运行时错误、未处理 Promise 异常、资源加载错误；<br>• `collectors/performance.ts` — 基于 PerformanceObserver 采集 Web Vitals（FCP/LCP/CLS/INP）、慢资源、长任务；<br>• `collectors/page-view.ts` — 监听 Vue Router 或 history API 自动上报 PV；<br>• `plugins/vue.ts` — 提供 `createTrackingPlugin()`，一站式注入 `$tracker`、注册 `errorHandler`、启用 PV 采集；<br>• `plugins/axios.ts` — 提供 `installAxiosInterceptor()`，自动为 Axios 请求上报 `api_perf`/`api_error`（当前 q-editor 未显式调用此插件，但插件已随包提供）；<br>• `transport/` — 封装 `sendBeacon`/`fetch keepalive`/`img fallback` 三级降级传输策略，对接后端 `/api/v1/track(/batch)`。 |
| `monorepo-code-common`（`packages/common`） | 前后端共享类型声明包 | q-server（后端直接引用）；frontend（未直接依赖，仅参照字段命名对齐） | **前后端契约的单一真源**：`track.interface.ts` 定义了事件名称常量（`ERROR_EVENTS`/`PERF_EVENTS`/`BEHAVIOR_EVENTS`/`METRIC_EVENTS`）、应用与环境白名单（`TRACKING_APP_IDS`/`TRACKING_ENVIRONMENTS`）、上报结构（`TrackEventPayload`→`TrackEventFull`）、全部分析接口的请求/响应类型，以及聚合类型 `TrackingApi`/`AnalyticsApi` 供前端在对接新接口时参考字段结构。q-server 后端 Schema/Service 直接从该包导入类型保证与前端字段一致；frontend 因规避额外依赖未直接 import，而是手写等价本地类型。 |
| `monorepo-survey-engine`（`packages/survey-engine`） | 问卷渲染引擎（组件/状态/i18n） | frontend、q-editor | 与 tracking 链路**无直接关系**，仅说明其不承担埋点职责（frontend 引入该包用于问卷组件渲染，未附带任何埋点采集能力，印证 frontend 需自行选择是否接入 SDK，目前选择不接入）。 |
| `monorepo-sse-client`、`bit-permission`、`utils` 等其他包 | SSE 客户端 / 权限位运算 / 通用工具 | q-editor 等 | 与 tracking 模块无业务耦合，未在本次梳理范围内涉及埋点数据流转。 |

### 3.1 包配合关系图

```
┌───────────────┐   引用类型契约    ┌──────────────────────┐
│ monorepo-code- │ ───────────────→ │  q-server (后端)      │
│ common         │                  │  tracking-ingest/     │
│（共享类型）     │ ←── (字段对齐，  │  tracking-analytics   │
└───────────────┘     未强依赖)     └──────────────────────┘
        ▲                                     ▲
        │ 字段命名参照                         │ HTTP 调用
        │                                     │
┌───────────────┐   安装+调用 track()  ┌──────────────┐
│ monorepo-      │ ───────────────────→│  q-editor    │
│ tracking-sdk   │   (Vue插件/采集器)   │ (埋点生产方) │
└───────────────┘                      └──────────────┘

┌──────────────┐   仅 HTTP 调用 GET /analytics/*   ┌──────────────────────┐
│  frontend    │ ─────────────────────────────────→│ tracking-analytics   │
│ (数据消费方) │        (不引入 tracking-sdk)        │ （管理员权限）        │
└──────────────┘                                    └──────────────────────┘
```

---

## 4. 接口分类清单（结构化总表）

按核心功能实现分类，共 10 个对外接口：

### 4.1 分类一：埋点数据上报（Ingest）

面向前端 SDK 的公开写入接口，无需认证，承担埋点数据入口职责。

| 接口路径 | 请求方式 | 功能描述 | 所属分类 | 关联前端调用模块 | 关联依赖包 |
|----------|----------|----------|----------|------------------|------------|
| `/api/v1/track` | POST | 单条事件上报（错误事件优先通道，立即发送） | 埋点数据上报 | q-editor：`src/plugins/tracking.ts`（`Tracker.track` priority=error 时自动路由至此） | `monorepo-tracking-sdk`（`core/tracker.ts`、`transport/beacon.ts`）、`monorepo-code-common`（`TrackSingleRequest`/`TrackEventPayload`类型） |
| `/api/v1/track/batch` | POST | 批量事件上报（行为/性能事件，缓冲后批量发送，1-200条/次） | 埋点数据上报 | q-editor：`src/plugins/tracking.ts`（`EventQueue` 满50条或10s超时后自动触发） | `monorepo-tracking-sdk`（`core/queue.ts`、`transport/fetch.ts`）、`monorepo-code-common`（`TrackBatchRequest`类型） |

### 4.2 分类二：概览与实时监控

面向管理后台仪表盘首屏的快照类查询，均需超级管理员权限，短 TTL 缓存。

| 接口路径 | 请求方式 | 功能描述 | 所属分类 | 关联前端调用模块 | 关联依赖包 |
|----------|----------|----------|----------|------------------|------------|
| `/api/admin/analytics/overview` | GET | 今日概览（PV/UV/在线用户/问卷创建/答卷回收/错误数/AI使用量） | 概览与实时监控 | frontend：`src/api/modules/analytics/index.ts`（`getOverview`）→ `OverviewPanel.vue` | `monorepo-code-common`（`AnalyticsOverview`类型，frontend侧手写等价本地类型未直接依赖） |
| `/api/admin/analytics/realtime` | GET | 近5分钟实时统计（在线用户/PV/错误数/API平均耗时） | 概览与实时监控 | frontend：`src/api/modules/analytics/index.ts`（`getRealtime`） | `monorepo-code-common`（`AnalyticsRealtimeStats`类型） |

### 4.3 分类三：错误与性能分析

面向问题排查与体验优化的聚合分析接口，支持时间范围/应用/环境多维筛选。

| 接口路径 | 请求方式 | 功能描述 | 所属分类 | 关联前端调用模块 | 关联依赖包 |
|----------|----------|----------|----------|------------------|------------|
| `/api/admin/analytics/errors` | GET | 错误聚合分析（按分组Top N，含首末次出现时间与24小时趋势） | 错误与性能分析 | frontend：`src/api/modules/analytics/index.ts`（`getErrors`）→ `ErrorsPanel.vue` | `monorepo-code-common`（`AnalyticsErrorsQuery/Response`类型） |
| `/api/admin/analytics/performance` | GET | 性能指标分析（FCP/LCP/CLS/INP/API耗时/编辑器加载保存耗时的P50/75/95/99） | 错误与性能分析 | frontend：`src/api/modules/analytics/index.ts`（`getPerformance`）→ `PerformancePanel.vue`；数据源自 q-editor `EditorView` 通过 `getPerformanceCollector().trackTiming()` 上报 | `monorepo-code-common`（`AnalyticsPerformanceQuery/Response`类型）、`monorepo-tracking-sdk`（`collectors/performance.ts` 为数据生产端） |

### 4.4 分类四：趋势与用量统计

面向多指标时间序列观察与业务转化分析。

| 接口路径 | 请求方式 | 功能描述 | 所属分类 | 关联前端调用模块 | 关联依赖包 |
|----------|----------|----------|----------|------------------|------------|
| `/api/admin/analytics/trend` | GET | 多指标多粒度趋势查询（pv/uv/errors/api_requests/surveys_created/responses/ai_usage） | 趋势与用量统计 | frontend：`src/api/modules/analytics/index.ts`（`getTrend`）→ `UsagePanel.vue` | `monorepo-code-common`（`AnalyticsTrendQuery/Response`类型） |
| `/api/admin/analytics/funnel` | GET | 业务漏斗转化分析（问卷填写/问卷创建/AI使用三类漏斗） | 趋势与用量统计 | frontend：`src/api/modules/analytics/index.ts`（`getFunnel`）→ `UsagePanel.vue` | `monorepo-code-common`（`AnalyticsFunnelQuery/Response`类型） |
| `/api/admin/analytics/ai-usage` | GET | AI使用统计分析（生成/润色次数、token用量、预估费用、成功率、每日趋势） | 趋势与用量统计 | 后端已实现，frontend 分析模块当前未见对应封装函数（面板暂未消费） | `monorepo-code-common`（`AnalyticsAIUsageQuery/Response`类型） |

### 4.5 分类五：事件明细查询

面向精细化问题定位的原始事件检索能力。

| 接口路径 | 请求方式 | 功能描述 | 所属分类 | 关联前端调用模块 | 关联依赖包 |
|----------|----------|----------|----------|------------------|------------|
| `/api/admin/analytics/events` | GET | 事件明细分页查询（按事件名/应用/用户/时间范围筛选，不缓存保证实时性） | 事件明细查询 | 后端已实现，frontend 分析模块当前未见对应封装函数（面板暂未消费） | `monorepo-code-common`（`AnalyticsEventDetailQuery/Response`、`TrackEventFull`类型） |

---

## 5. 关键设计要点小结

1. **读写职责分离**：`tracking-ingest` 是无认证的高频写入通道（限流防刷 + 极速204响应 + 异步落地 + MQ降级本地文件三重可靠性保障），`tracking-analytics` 是强权限（超级管理员）的低频聚合查询通道（Redis分层缓存 + ClickHouse分区裁剪）。两者物理上共享同一 Fastify 应用但逻辑上完全解耦，符合写多读少的埋点场景特征。
2. **前后端类型契约统一由 `packages/common` 承担**：后端 Service/Schema 直接引用 `track.interface.ts` 中的类型，避免手写重复定义导致字段漂移；frontend 出于减少依赖面的考虑选择手写等价类型而非直接 import，但严格保持字段命名一致（snake_case，对齐 ClickHouse 列名）。
3. **埋点采集能力完全封装进 `tracking-sdk`，与业务代码解耦**：q-editor 仅需调用 `installTracking(app, router)` 一行代码即可获得错误采集、性能采集、PV采集三大自动化能力，业务代码只在少数场景（如编辑器加载/保存计时、可恢复错误上报）手动调用 `trackTiming`/`reportError`。
4. **frontend 管理后台是纯数据消费方**：不产生埋点、不依赖 `tracking-sdk`，仅作为 `tracking-analytics` 接口的可视化壳层，这一设计避免了管理后台自身操作行为污染业务埋点数据（后台管理操作走独立的审计日志体系，非本模块范畴）。
5. **待补齐点**：`ai-usage` 与 `events` 两个后端接口已完整实现，但 frontend `analytics` 模块当前未提供对应的前端封装与面板消费，属于后端能力超前于前端落地的部分，可作为后续迭代方向。

---

**文档版本历史**

| 版本 | 日期 | 修改内容 |
|------|------|----------|
| v1.0 | 2026-06-21 | 初始版本，基于 q-server tracking 模块源码、q-editor/frontend 前端调用代码及 packages 公共包实现梳理生成 |
