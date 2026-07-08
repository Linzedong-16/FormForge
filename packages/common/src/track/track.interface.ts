// ═══════════════════════════════════════════════════════════════════
// 埋点监控系统 — 前后端共享类型声明
// ═══════════════════════════════════════════════════════════════════

// ─── 应用标识白名单 ─────────────────────────────────────────────

/** 允许上报的应用标识列表 */
export const TRACKING_APP_IDS = ["q-editor", "frontend", "main-app", "q-server", "ai-service"] as const;
export type TrackingAppId = (typeof TRACKING_APP_IDS)[number];

// ─── 事件名称常量 ───────────────────────────────────────────────

/** A 类：错误事件 */
export const ERROR_EVENTS = ["js_error", "vue_error", "api_error", "sse_error", "resource_error"] as const;

/** B 类：性能事件 */
export const PERF_EVENTS = ["page_perf", "api_perf", "resource_perf", "editor_perf"] as const;

/** C 类：行为事件 */
export const BEHAVIOR_EVENTS = [
  "page_view",
  "survey_view",
  "survey_submit_start",
  "survey_submit_success",
  "survey_submit_fail",
  "survey_abandon",
  "editor_create_survey",
  "editor_add_component",
  "editor_publish_survey",
  "editor_use_ai_generate",
  "editor_use_ai_polish",
  "admin_approve_review",
  "admin_ban_user",
  "user_login",
  "user_logout",
  "component_click"
] as const;

/** D 类：业务指标事件 */
export const METRIC_EVENTS = ["ai_usage_daily", "survey_response_aggregated", "template_apply"] as const;

/** 所有事件名称 */
export const ALL_TRACK_EVENTS = [...ERROR_EVENTS, ...PERF_EVENTS, ...BEHAVIOR_EVENTS, ...METRIC_EVENTS] as const;
export type TrackEventName = (typeof ALL_TRACK_EVENTS)[number];

/** 事件类别路由键 */
export type TrackEventCategory = "error" | "perf" | "behavior" | "metric";

// ─── 客户端环境信息 ─────────────────────────────────────────────

/** 客户端环境 */
export interface TrackClientEnv {
  os?: string;
  browser?: string;
  browser_version?: string;
  screen_width?: number;
  screen_height?: number;
  network_type?: string;
  language?: string;
}

// ─── 埋点事件基础结构 ───────────────────────────────────────────

/** 前端上报的事件结构（客户端生成） */
export interface TrackEventPayload {
  /** UUID v7（时间有序） */
  event_id: string;
  /** 事件名称（snake_case） */
  event_name: string;
  /** 应用标识 */
  app_id: TrackingAppId;
  /** 登录用户 ID（未登录为 null） */
  user_id?: number | null;
  /** 匿名用户 ID（localStorage 持久化） */
  anonymous_id?: string;
  /** 会话 ID（sessionStorage） */
  session_id?: string;
  /** 设备 ID（localStorage，跨会话） */
  device_id?: string;
  /** 客户端时间戳（ISO 8601，毫秒精度） */
  timestamp: string;
  /** 客户端环境 */
  client_env?: TrackClientEnv;
  /** 当前页面 URL */
  page_url?: string;
  /** 页面标题 */
  page_title?: string;
  /** SDK 版本号 */
  sdk_version?: string;
  /** 事件属性（半结构化，各事件类型自定义） */
  properties?: Record<string, unknown>;
}

/** 服务端补充的字段（tracking-api 处理） */
export interface TrackServerFields {
  /** 服务端接收时间戳 */
  server_timestamp: string;
  /** 哈希处理后的客户端 IP（SHA256 前 16 位） */
  client_ip_hash: string;
  /** 解析后的 User-Agent */
  user_agent_parsed?: {
    browser?: string;
    os?: string;
    device_type?: string;
  };
  /** IP 解析的地理位置（省份） */
  geo_region?: string;
  /** IP 解析的地理位置（城市） */
  geo_city?: string;
}

/** 完整的埋点事件（客户端 + 服务端字段合并后，投递到 MQ） */
export interface TrackEventFull extends TrackEventPayload, TrackServerFields {
  /** 上报批次 ID（批量上报时相同） */
  ingest_batch_id?: string;
}

// ─── 上报接口请求/响应类型 ──────────────────────────────────────

/** 单条上报请求体 */
export type TrackSingleRequest = TrackEventPayload;

/** 批量上报请求体 */
export interface TrackBatchRequest {
  events: TrackEventPayload[];
}

// ─── 数据分析接口类型 ───────────────────────────────────────────

/** 时间粒度 */
export type AnalyticsGranularity = "minute" | "hour" | "day" | "week" | "month";

/** 时间范围快捷值 */
export type AnalyticsTimeRange = "1h" | "6h" | "24h" | "7d" | "30d" | "90d";

/** 概览数据 */
export interface AnalyticsOverview {
  /** 今日 PV */
  pv_today: number;
  /** 今日 UV */
  uv_today: number;
  /** 当前在线用户数 */
  online_users: number;
  /** 今日问卷创建量 */
  surveys_created_today: number;
  /** 今日答卷回收量 */
  responses_today: number;
  /** 今日错误数 */
  errors_today: number;
  /** 今日 AI 使用次数 */
  ai_usage_today: number;
}

/** 趋势数据点 */
export interface AnalyticsTrendPoint {
  time: string;
  value: number;
}

/** 趋势查询参数 */
export interface AnalyticsTrendQuery {
  /** 指标名称 */
  metric: "pv" | "uv" | "errors" | "api_requests" | "surveys_created" | "responses" | "ai_usage";
  /** 时间粒度 */
  granularity: AnalyticsGranularity;
  /** 时间范围 */
  range: AnalyticsTimeRange;
  /** 应用标识（可选，不传则查全部） */
  app_id?: TrackingAppId;
}

/** 趋势查询响应 */
export interface AnalyticsTrendResponse {
  metric: string;
  granularity: AnalyticsGranularity;
  points: AnalyticsTrendPoint[];
}

/** 错误聚合项 */
export interface AnalyticsErrorItem {
  /** 错误分组 key */
  error_group_key: string;
  /** 错误类型 */
  error_type: string;
  /** 错误消息摘要 */
  error_message: string;
  /** 发生次数 */
  count: number;
  /** 影响用户数 */
  affected_users: number;
  /** 影响会话数 */
  affected_sessions: number;
  /** 首次出现 */
  first_seen: string;
  /** 最近出现 */
  last_seen: string;
  /** 趋势（最近 24 小时每小时计数） */
  trend?: number[];
}

/** 错误查询参数 */
export interface AnalyticsErrorsQuery {
  /** 应用标识 */
  app_id?: TrackingAppId;
  /** 时间范围 */
  range: AnalyticsTimeRange;
  /** Top N */
  top_n?: number;
  /** 错误类型筛选 */
  error_type?: string;
}

/** 错误查询响应 */
export interface AnalyticsErrorsResponse {
  total_count: number;
  errors: AnalyticsErrorItem[];
}

/** 性能指标 */
export interface AnalyticsPerformanceMetrics {
  p50: number;
  p75: number;
  p95: number;
  p99: number;
  avg: number;
  sample_count: number;
}

/** 性能查询参数 */
export interface AnalyticsPerformanceQuery {
  /** 应用标识 */
  app_id?: TrackingAppId;
  /** 性能指标 */
  metric: "fcp" | "lcp" | "cls" | "inp" | "api_duration";
  /** 时间范围 */
  range: AnalyticsTimeRange;
  /** 页面 URL 筛选 */
  page_url?: string;
}

/** 性能查询响应 */
export interface AnalyticsPerformanceResponse {
  metric: string;
  current: AnalyticsPerformanceMetrics;
  trend_points: AnalyticsTrendPoint[];
}

/** 漏斗步骤 */
export interface AnalyticsFunnelStep {
  /** 步骤名称 */
  name: string;
  /** 事件名 */
  event_name: string;
  /** 独立用户数 */
  count: number;
  /** 相对于第一步的转化率 */
  rate: number;
  /** 相对于上一步的转化率 */
  prev_step_rate: number;
}

/** 漏斗查询参数 */
export interface AnalyticsFunnelQuery {
  /** 漏斗类型 */
  funnel_name: "survey_response" | "survey_creation" | "ai_usage";
  /** 时间范围 */
  range: AnalyticsTimeRange;
  /** 应用标识 */
  app_id?: TrackingAppId;
}

/** 漏斗查询响应 */
export interface AnalyticsFunnelResponse {
  funnel_name: string;
  total_users: number;
  steps: AnalyticsFunnelStep[];
}

/** AI 使用分析查询参数 */
export interface AnalyticsAIUsageQuery {
  /** 时间范围 */
  range: AnalyticsTimeRange;
}

/** AI 使用分析响应 */
export interface AnalyticsAIUsageResponse {
  /** 生成次数 */
  generate_count: number;
  /** 润色次数 */
  polish_count: number;
  /** 总 token 用量 */
  total_tokens: number;
  /** 预估费用 */
  estimated_cost: number;
  /** 成功率 */
  success_rate: number;
  /** 每日趋势 */
  daily: Array<{
    date: string;
    generate_count: number;
    polish_count: number;
    tokens: number;
  }>;
}

/** 事件详情查询参数 */
export interface AnalyticsEventDetailQuery {
  /** 事件名称 */
  event_name?: string;
  /** 应用标识 */
  app_id?: TrackingAppId;
  /** 用户 ID */
  user_id?: number;
  /** 时间范围 */
  range: AnalyticsTimeRange;
  /** 分页 */
  page?: number;
  page_size?: number;
}

/** 事件详情响应 */
export interface AnalyticsEventDetailResponse {
  total: number;
  page: number;
  page_size: number;
  items: TrackEventFull[];
}

/** 实时统计数据 */
export interface AnalyticsRealtimeStats {
  /** 当前在线用户数 */
  online_users: number;
  /** 最近 5 分钟 PV */
  recent_pv: number;
  /** 最近 5 分钟错误数 */
  recent_errors: number;
  /** 最近 5 分钟 API 平均耗时 */
  recent_api_avg_ms: number;
}

// ─── API 聚合映射（前端调用参考） ────────────────────────────────

export interface TrackingApi {
  /** 单条上报 */
  track: { request: TrackSingleRequest; response: void };
  /** 批量上报 */
  trackBatch: { request: TrackBatchRequest; response: void };
}

export interface AnalyticsApi {
  /** 概览 */
  overview: { request: void; response: AnalyticsOverview };
  /** 趋势 */
  trend: { request: AnalyticsTrendQuery; response: AnalyticsTrendResponse };
  /** 错误 */
  errors: { request: AnalyticsErrorsQuery; response: AnalyticsErrorsResponse };
  /** 性能 */
  performance: { request: AnalyticsPerformanceQuery; response: AnalyticsPerformanceResponse };
  /** 漏斗 */
  funnel: { request: AnalyticsFunnelQuery; response: AnalyticsFunnelResponse };
  /** AI 使用 */
  aiUsage: { request: AnalyticsAIUsageQuery; response: AnalyticsAIUsageResponse };
  /** 事件详情 */
  eventDetail: { request: AnalyticsEventDetailQuery; response: AnalyticsEventDetailResponse };
  /** 实时统计 */
  realtime: { request: void; response: AnalyticsRealtimeStats };
}
