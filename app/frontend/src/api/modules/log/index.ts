/**
 * 日志查询模块 API
 *
 * 封装系统日志查询相关 API：
 *  - GET /api/logs              — 系统日志列表（MongoDB，分页 + 多条件筛选）
 *  - GET /api/logs/stats        — 系统日志统计
 *  - GET /api/audit-logs        — 审计日志列表（PostgreSQL，分页 + 多条件筛选）
 *  - GET /api/audit-logs/stats  — 审计日志统计
 *
 * 所有日志查询接口需认证 + super_admin 权限，使用 serverClient
 */
import serverClient from "../../clients/server";

// ══════════════════════════════════════════════════════════════
//  类型（与 @common/log/log.interface 保持一致）
// ══════════════════════════════════════════════════════════════

/** 统一 API 响应包装 */
export interface ApiResponse<T> {
  code: number;
  msg: string;
  data: T | null;
}

/** 日志级别 */
export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

/** 日志查询参数 */
export interface LogQueryParams {
  startDate?: string;
  endDate?: string;
  level?: LogLevel;
  source?: string;
  keyword?: string;
  page?: number;
  pageSize?: number;
}

/** 单条日志条目 */
export interface LogEntryItem {
  id: string;
  requestId?: string;
  level: LogLevel;
  message: string;
  source: string;
  user?: string;
  ip?: string;
  result: "success" | "failure";
  time: string;
}

/** 日志列表响应 */
export interface LogListResponse {
  items: LogEntryItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** 日志统计 */
export interface LogStats {
  todayTotal: number;
  warnCount: number;
  errorCount: number;
  activeUsers: number;
}

/** 日志统计响应 */
export interface LogStatsResponse {
  stats: LogStats;
}

// ══════════════════════════════════════════════════════════════
//  审计日志类型
// ══════════════════════════════════════════════════════════════

/** 审计日志查询参数 */
export interface AuditLogQueryParams {
  startDate?: string;
  endDate?: string;
  action?: string;
  resourceType?: string;
  userId?: number;
  keyword?: string;
  page?: number;
  pageSize?: number;
}

/** 单条审计日志条目 */
export interface AuditLogEntryItem {
  id: string;
  userId: string | null;
  username: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  details: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  time: string;
}

/** 审计日志列表响应 */
export interface AuditLogListResponse {
  items: AuditLogEntryItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** 审计日志统计 */
export interface AuditLogStats {
  todayTotal: number;
  actionDistribution: Record<string, number>;
  activeUsers: number;
}

/** 审计日志统计响应 */
export interface AuditLogStatsResponse {
  stats: AuditLogStats;
}

// ══════════════════════════════════════════════════════════════
//  API
// ══════════════════════════════════════════════════════════════

/**
 * GET /api/logs — 系统日志列表
 */
export const getLogList = (params: LogQueryParams): Promise<ApiResponse<LogListResponse>> =>
  serverClient.get("/logs", { params });

/**
 * GET /api/logs/stats — 系统日志统计
 */
export const getLogStats = (): Promise<ApiResponse<LogStatsResponse>> => serverClient.get("/logs/stats");

/**
 * GET /api/audit-logs — 审计日志列表
 */
export const getAuditLogList = (params: AuditLogQueryParams): Promise<ApiResponse<AuditLogListResponse>> =>
  serverClient.get("/audit-logs", { params });

/**
 * GET /api/audit-logs/stats — 审计日志统计
 */
export const getAuditLogStats = (): Promise<ApiResponse<AuditLogStatsResponse>> =>
  serverClient.get("/audit-logs/stats");
