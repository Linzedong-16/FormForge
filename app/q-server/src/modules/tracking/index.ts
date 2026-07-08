/**
 * 埋点监控模块 — 统一导出
 *
 * 包含两个子模块：
 *   - tracking-ingest: 埋点数据上报接口（面向前端 SDK）
 *   - tracking-analytics: 数据分析查询接口（面向管理后台）
 */

export { default as trackingIngestRoutes } from "./tracking-ingest/tracking-ingest.routes.js";
export { default as trackingAnalyticsRoutes } from "./tracking-analytics/tracking-analytics.routes.js";
