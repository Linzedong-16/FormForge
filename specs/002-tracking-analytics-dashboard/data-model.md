# 数据模型：管理后台埋点监控数据可视化仪表盘

本功能不引入任何后端持久化存储，也不新增后端实体——所有数据已经存在于 `q-server` 由
ClickHouse 支撑的埋点管道中，并通过既有的分析接口读取。这里的"数据模型"指的是前端的视图状态
以及它所消费数据的结构，把规格说明里的关键实体映射为将在
`src/api/modules/analytics/index.ts` 中声明的具体 TypeScript 接口（就近声明的接口，
按 `research.md` §2 的决策）。

## 仪表盘筛选状态（Dashboard Filter State）

通过 `useAnalyticsFilters` 组合式函数在四个面板之间共享。

```typescript
interface AnalyticsFilterState {
  /** 后端已支持的六个时间范围快捷值之一 */
  range: "1h" | "6h" | "24h" | "7d" | "30d" | "90d";
  /** undefined = 不限应用；否则为 TRACKING_APP_IDS 中的某个取值 */
  appId?: "q-editor" | "frontend" | "main-app" | "q-server" | "ai-service";
  /** 按 FR-006 默认 "production"；始终展示，不会被静默省略 */
  environment: "production" | "staging" | "development";
}
```

**校验规则**：`range` 与 `environment` 始终有值（不存在"未设置"状态），因为每个被消费的接口
都要求或默认了它们；`appId` 可以为空（不筛选），代表 FR-005 所说的"不限应用"。

## 仪表盘概览快照（Dashboard Overview Snapshot，对应 US1）

数据来源：`GET /analytics/overview`（无参数）+ `GET /analytics/realtime`（无参数）——注意这
两个接口目前都不接受 `environment`/`app_id` 筛选参数（这对 FR-006 中"当前选择的环境"这一要求
意味着什么，见 `contracts/` 与 `research.md` §7 的说明）。

> **实现阶段更正**：以下字段命名已从最初文档草稿的 camelCase 更正为与
> `packages/common/src/track/track.interface.ts`（`AnalyticsOverview`/`AnalyticsRealtimeStats`）
> 及 ClickHouse 侧列名完全一致的 snake_case——`serverClient` 不做任何字段名转换，前端类型
> 必须原样镜像后端真实返回的字段名，否则会读到 `undefined`。以下各响应类型同理。

```typescript
interface OverviewSnapshot {
  pv_today: number;
  uv_today: number;
  online_users: number;
  surveys_created_today: number;
  responses_today: number;
  errors_today: number;
  ai_usage_today: number;
}

interface RealtimeSnapshot {
  online_users: number;
  recent_pv: number;
  recent_errors: number;
  recent_api_avg_ms: number;
}
```

**请求状态**：`{ status: "loading" | "ready" | "empty" | "error"; data?: OverviewSnapshot; error?: string }`
——这里的"empty"指全部数字为 0（这是一种合法、可区分的状态，对应 FR-007 边界情况中"管道刚部署、
还没有任何事件"的场景）；"error"指 HTTP 请求本身失败。

## 错误汇总条目（Error Summary Item，对应 US2）

数据来源：`GET /analytics/errors?range&environment&app_id?&top_n?&error_type?`。

```typescript
interface ErrorSummaryItem {
  error_group_key: string;
  error_type: string;
  error_message: string;
  count: number;
  affected_users: number;
  affected_sessions: number;
  first_seen: string; // ISO 时间字符串
  last_seen: string; // ISO 时间字符串
}

interface ErrorsResponse {
  total_count: number;
  errors: ErrorSummaryItem[];
}
```

错误趋势曲线复用 `GET /analytics/trend?metric=errors&granularity&range&environment&app_id?`
（见下方"用量趋势点"——响应结构相同，仅 `metric` 不同）。

## 性能汇总（Performance Summary，对应 US3）

数据来源：`GET /analytics/performance?metric&range&environment&app_id?&page_url?`。

```typescript
/**
 * metric 取值：fcp | lcp | cls | inp | api_duration 为既有取值；
 * editor_load | editor_save 为本功能新增（见 research.md §8，对应 q-server
 * getPerformance 的小幅可加式扩展），用于展示编辑器加载/保存耗时。
 */
type PerformanceMetric = "fcp" | "lcp" | "cls" | "inp" | "api_duration" | "editor_load" | "editor_save";

interface PerformancePercentiles {
  p50: number;
  p75: number;
  p95: number;
  p99: number;
  avg: number;
  sample_count: number;
}

interface PerformanceResponse {
  metric: PerformanceMetric;
  current: PerformancePercentiles;
  trend_points: TrendPoint[];
}
```

**校验规则（后端新增部分）**：当 `metric` 为 `editor_load` 或 `editor_save` 时，后端
`getPerformance` 的查询条件为
`event_name = 'custom_timing' AND JSONExtractString(properties, 'timing_name') = '<metric取值>'`，
度量字段为 `JSONExtractFloat(properties, 'duration_ms')`——其余既有 `metric` 取值的查询逻辑
不受影响（详见 `research.md` §8、`contracts/analytics-endpoints.md`）。

## 用量趋势点与漏斗结果（Usage Trend Point & Funnel Result，对应 US4）

数据来源：`GET /analytics/trend?metric=pv|uv&granularity&range&environment&app_id?` 与
`GET /analytics/funnel?funnel_name&range&app_id?`（漏斗接口目前不接受 `environment`
筛选参数——见 `contracts/`）。

```typescript
interface TrendPoint {
  time: string; // ISO 时间字符串或分桶标签
  value: number;
}

interface FunnelStep {
  name: string;
  event_name: string;
  count: number;
  rate: number; // 相对首步的转化率（百分比）
  prev_step_rate: number; // 相对上一步的转化率（百分比）
}

interface FunnelResult {
  funnel_name: string;
  total_users: number;
  steps: FunnelStep[];
}
```

## 面板请求状态（共享结构，4 个面板共用）

```typescript
type PanelStatus = "loading" | "ready" | "empty" | "error";

interface PanelState<T> {
  status: PanelStatus;
  data: T | null;
  errorMessage?: string;
}
```

**状态迁移**：`loading` → （数据非空则为 `ready`）｜（请求成功但结果集没有有意义的行/全为 0
则为 `empty`）｜（请求被拒绝则为 `error`）。任何筛选条件变化都会把受影响的面板重置回
`loading`。
