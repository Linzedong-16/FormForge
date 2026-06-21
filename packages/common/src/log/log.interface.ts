/**
 * 日志查询模块 — 前后端通用 TypeScript 类型声明
 *
 * 职责：
 *   - 定义日志查询的请求参数、响应结构
 *   - 定义日志条目、统计信息的类型
 *   - 确保前后端接口定义一致，降低模块间耦合
 *
 * 后端实现：app/q-server/src/modules/log/
 * 前端使用：app/frontend/src/views/audit-logs/AuditLogsView.vue
 */

// ══════════════════════════════════════════════════════════════
//  1. 日志级别
// ══════════════════════════════════════════════════════════════

/**
 * 日志级别
 *
 * 与后端 `LogEntry.model.ts` 中的 level 字段保持一致
 */
export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

/**
 * 日志级别列表（供前端筛选下拉框使用）
 */
export const LOG_LEVELS: LogLevel[] = ["trace", "debug", "info", "warn", "error", "fatal"];

// ══════════════════════════════════════════════════════════════
//  2. 查询参数
// ══════════════════════════════════════════════════════════════

/**
 * GET /api/logs — 日志列表查询参数
 */
export interface LogQueryParams {
  /** 开始时间（ISO 8601） */
  startDate?: string;
  /** 结束时间（ISO 8601） */
  endDate?: string;
  /** 日志级别筛选 */
  level?: LogLevel;
  /** 服务来源筛选 */
  source?: string;
  /** 关键词搜索（匹配 message 字段） */
  keyword?: string;
  /** 页码（从 1 开始，默认 1） */
  page?: number;
  /** 每页数量（最大 100，默认 20） */
  pageSize?: number;
}

// ══════════════════════════════════════════════════════════════
//  3. 日志条目
// ══════════════════════════════════════════════════════════════

/**
 * 单条日志条目（前端展示用）
 *
 * 后端从 MongoDB LogEntry 文档映射而来
 */
export interface LogEntryItem {
  /** 日志 ID（MongoDB _id 字符串） */
  id: string;
  /** 全链路追踪 ID */
  requestId?: string;
  /** 日志级别 */
  level: LogLevel;
  /** 日志消息正文 */
  message: string;
  /** 服务来源 */
  source: string;
  /** 操作用户（从 context 中提取） */
  user?: string;
  /** 客户端 IP（从 context 中提取） */
  ip?: string;
  /** 操作结果 */
  result: "success" | "failure";
  /** 时间（ISO 8601 字符串） */
  time: string;
}

// ══════════════════════════════════════════════════════════════
//  4. 日志列表响应
// ══════════════════════════════════════════════════════════════

/**
 * GET /api/logs — 日志列表响应
 */
export interface LogListResponse {
  /** 日志条目列表 */
  items: LogEntryItem[];
  /** 总数 */
  total: number;
  /** 当前页码 */
  page: number;
  /** 每页数量 */
  pageSize: number;
  /** 总页数 */
  totalPages: number;
}

// ══════════════════════════════════════════════════════════════
//  5. 日志统计
// ══════════════════════════════════════════════════════════════

/**
 * 日志统计信息
 */
export interface LogStats {
  /** 今日日志总数 */
  todayTotal: number;
  /** 警告日志数（当日） */
  warnCount: number;
  /** 错误日志数（当日） */
  errorCount: number;
  /** 活跃用户数（当日） */
  activeUsers: number;
}

/**
 * GET /api/logs/stats — 日志统计响应
 */
export interface LogStatsResponse {
  stats: LogStats;
}

// ══════════════════════════════════════════════════════════════
//  6. API 类型映射
// ══════════════════════════════════════════════════════════════

/**
 * 日志模块 API 类型映射
 *
 * 用于类型安全的前端 API 调用：
 *
 * @example
 * ```ts
 * import type { LogApi } from "@common/log/log.interface";
 * const params: LogApi["list"]["request"] = { level: "error", page: 1 };
 * ```
 */
export interface LogApi {
  /** GET /api/logs — 日志列表 */
  list: {
    request: LogQueryParams;
    response: LogListResponse;
  };
  /** GET /api/logs/stats — 日志统计 */
  stats: {
    request: void;
    response: LogStatsResponse;
  };
}

// ══════════════════════════════════════════════════════════════
//  7. 审计日志（PostgreSQL audit_logs）
// ══════════════════════════════════════════════════════════════

/**
 * GET /api/audit-logs — 审计日志查询参数
 */
export interface AuditLogQueryParams {
  /** 开始时间（ISO 8601） */
  startDate?: string;
  /** 结束时间（ISO 8601） */
  endDate?: string;
  /** 操作类型筛选 */
  action?: string;
  /** 资源类型筛选 */
  resourceType?: string;
  /** 操作者 ID 筛选 */
  userId?: number;
  /** 关键词搜索（匹配 details JSON 字段） */
  keyword?: string;
  /** 页码（从 1 开始，默认 1） */
  page?: number;
  /** 每页数量（最大 100，默认 20） */
  pageSize?: number;
}

/**
 * 单条审计日志条目（前端展示用）
 */
export interface AuditLogEntryItem {
  /** 审计日志 ID */
  id: string;
  /** 操作者用户 ID */
  userId: string | null;
  /** 操作者用户名 */
  username: string | null;
  /** 操作类型 */
  action: string;
  /** 资源类型 */
  resourceType: string;
  /** 资源 ID */
  resourceId: string | null;
  /** 操作详情 JSON */
  details: Record<string, unknown> | null;
  /** 客户端 IP */
  ipAddress: string | null;
  /** 浏览器 UA */
  userAgent: string | null;
  /** 操作时间（ISO 8601 字符串） */
  time: string;
}

/**
 * GET /api/audit-logs — 审计日志列表响应
 */
export interface AuditLogListResponse {
  items: AuditLogEntryItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * 审计日志统计
 */
export interface AuditLogStats {
  /** 今日审计日志总数 */
  todayTotal: number;
  /** 操作类型分布 */
  actionDistribution: Record<string, number>;
  /** 活跃操作者数（当日） */
  activeUsers: number;
}

/**
 * GET /api/audit-logs/stats — 审计日志统计响应
 */
export interface AuditLogStatsResponse {
  stats: AuditLogStats;
}
