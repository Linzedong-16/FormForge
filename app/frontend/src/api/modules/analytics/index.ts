/**
 * 埋点监控数据分析模块 API
 *
 * 封装管理后台埋点监控可视化仪表盘所消费的全部 q-server 分析接口：
 *  - GET /api/admin/analytics/overview     — 概览快照（今日 PV/UV/错误数/AI 使用量，汇总全部环境）
 *  - GET /api/admin/analytics/realtime     — 近 5 分钟实时快照（汇总全部环境）
 *  - GET /api/admin/analytics/errors       — 错误排行
 *  - GET /api/admin/analytics/trend        — 趋势（PV/UV/错误数等）
 *  - GET /api/admin/analytics/performance  — 性能百分位与趋势
 *  - GET /api/admin/analytics/funnel       — 业务漏斗（汇总全部环境）
 *
 * 所有接口均需认证 + super_admin 权限，使用 serverClient。
 * 响应字段与 packages/common 的 Analytics* 类型保持一致（均为 snake_case，
 * 与 ClickHouse 侧字段命名对齐），本模块就近声明本地类型，不引入
 * monorepo-code-common 作为新依赖（见 specs/002-tracking-analytics-dashboard/research.md §2）。
 */
import serverClient from "../../clients/server";

// ══════════════════════════════════════════════════════════════
//  公共类型
// ══════════════════════════════════════════════════════════════

/** 统一 API 响应包装 */
export interface ApiResponse<T> {
  code: number;
  msg: string;
  data: T | null;
}

/** 时间范围快捷值 */
export type TimeRange = "1h" | "6h" | "24h" | "7d" | "30d" | "90d";

/** 时间粒度 */
export type Granularity = "minute" | "hour" | "day" | "week" | "month";

/** 部署环境 */
export type Environment = "production" | "staging" | "development";

/** 上报应用标识 */
export type TrackingAppId = "q-editor" | "frontend" | "main-app" | "q-server" | "ai-service";

// ══════════════════════════════════════════════════════════════
//  概览 / 实时快照（US1） —— 不支持 environment/app_id 筛选，见 research.md §7
// ══════════════════════════════════════════════════════════════

/** 概览快照 */
export interface OverviewSnapshot {
  pv_today: number;
  uv_today: number;
  online_users: number;
  surveys_created_today: number;
  responses_today: number;
  errors_today: number;
  ai_usage_today: number;
}

/** 近 5 分钟实时快照 */
export interface RealtimeSnapshot {
  online_users: number;
  recent_pv: number;
  recent_errors: number;
  recent_api_avg_ms: number;
}

/** GET /admin/analytics/overview — 概览快照 */
export const getOverview = (): Promise<ApiResponse<OverviewSnapshot>> => serverClient.get("/admin/analytics/overview");

/** GET /admin/analytics/realtime — 近 5 分钟实时快照 */
export const getRealtime = (): Promise<ApiResponse<RealtimeSnapshot>> => serverClient.get("/admin/analytics/realtime");

// ══════════════════════════════════════════════════════════════
//  错误排行 & 趋势（US2）
// ══════════════════════════════════════════════════════════════

/** 单条错误聚合项 */
export interface ErrorSummaryItem {
  error_group_key: string;
  error_type: string;
  error_message: string;
  count: number;
  affected_users: number;
  affected_sessions: number;
  first_seen: string;
  last_seen: string;
}

/** 错误排行响应 */
export interface ErrorsResponse {
  total_count: number;
  errors: ErrorSummaryItem[];
}

/** 趋势数据点 */
export interface TrendPoint {
  time: string;
  value: number;
}

/** 趋势查询响应 */
export interface TrendResponse {
  metric: string;
  granularity: Granularity;
  points: TrendPoint[];
}

export interface GetErrorsParams {
  range: TimeRange;
  environment?: Environment;
  appId?: TrackingAppId;
  topN?: number;
  errorType?: string;
}

/** GET /admin/analytics/errors — 错误排行 */
export const getErrors = (params: GetErrorsParams): Promise<ApiResponse<ErrorsResponse>> =>
  serverClient.get("/admin/analytics/errors", {
    params: {
      range: params.range,
      environment: params.environment,
      app_id: params.appId,
      top_n: params.topN,
      error_type: params.errorType
    }
  });

export interface GetTrendParams {
  metric: "pv" | "uv" | "errors" | "api_requests" | "surveys_created" | "responses" | "ai_usage";
  granularity: Granularity;
  range: TimeRange;
  environment?: Environment;
  appId?: TrackingAppId;
}

/** GET /admin/analytics/trend — 趋势（错误数 / PV / UV 等共用） */
export const getTrend = (params: GetTrendParams): Promise<ApiResponse<TrendResponse>> =>
  serverClient.get("/admin/analytics/trend", {
    params: {
      metric: params.metric,
      granularity: params.granularity,
      range: params.range,
      environment: params.environment,
      app_id: params.appId
    }
  });

// ══════════════════════════════════════════════════════════════
//  性能（US3）
// ══════════════════════════════════════════════════════════════

/** 性能指标类型：editor_load / editor_save 为编辑器加载/保存耗时（本功能新增） */
export type PerformanceMetric = "fcp" | "lcp" | "cls" | "inp" | "api_duration" | "editor_load" | "editor_save";

/** 性能百分位汇总 */
export interface PerformancePercentiles {
  p50: number;
  p75: number;
  p95: number;
  p99: number;
  avg: number;
  sample_count: number;
}

/** 性能查询响应 */
export interface PerformanceResponse {
  metric: string;
  current: PerformancePercentiles;
  trend_points: TrendPoint[];
}

export interface GetPerformanceParams {
  metric: PerformanceMetric;
  range: TimeRange;
  environment?: Environment;
  appId?: TrackingAppId;
  pageUrl?: string;
}

/** GET /admin/analytics/performance — 性能百分位与趋势 */
export const getPerformance = (params: GetPerformanceParams): Promise<ApiResponse<PerformanceResponse>> =>
  serverClient.get("/admin/analytics/performance", {
    params: {
      metric: params.metric,
      range: params.range,
      environment: params.environment,
      app_id: params.appId,
      page_url: params.pageUrl
    }
  });

// ══════════════════════════════════════════════════════════════
//  用量与漏斗（US4） —— 漏斗接口不支持 environment 筛选，见 research.md §7
// ══════════════════════════════════════════════════════════════

/** 漏斗步骤 */
export interface FunnelStep {
  name: string;
  event_name: string;
  count: number;
  rate: number;
  prev_step_rate: number;
}

/** 漏斗查询响应 */
export interface FunnelResult {
  funnel_name: string;
  total_users: number;
  steps: FunnelStep[];
}

export interface GetFunnelParams {
  funnelName: "survey_response" | "survey_creation" | "ai_usage";
  range: TimeRange;
  appId?: TrackingAppId;
}

/** GET /admin/analytics/funnel — 业务漏斗 */
export const getFunnel = (params: GetFunnelParams): Promise<ApiResponse<FunnelResult>> =>
  serverClient.get("/admin/analytics/funnel", {
    params: {
      funnel_name: params.funnelName,
      range: params.range,
      app_id: params.appId
    }
  });
