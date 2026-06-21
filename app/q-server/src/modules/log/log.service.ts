/**
 * 日志查询服务 — 系统日志查询与统计
 *
 * 基于 MongoDB LogEntry 集合提供：
 *   - 多条件日志列表查询（时间范围、级别、来源、关键词 + 分页）
 *   - 日志统计聚合（当日总数、警告数、错误数、活跃用户数）
 *
 * 设计原则：
 *   - MongoDB 查询失败不阻断业务，返回空数据
 *   - 使用 Mongoose 模型进行查询，复用现有 mongo 连接
 *   - 所有查询均使用索引覆盖（level、timestamp、source）
 */

import type { FastifyInstance } from "fastify";
import { Prisma } from "../../generated/prisma/client.js";
import { LogEntry, type LogEntryDocument } from "../../models/LogEntry.model.js";
import type {
  LogListQueryInput,
  LogStatsQueryInput,
  AuditLogListQueryInput,
  AuditLogStatsQueryInput
} from "./log.schemas.js";
import { paginatedResult } from "../../utils/pagination.js";
import type {
  LogEntryItem,
  LogListResponse,
  LogStats,
  LogStatsResponse,
  LogLevel,
  AuditLogEntryItem,
  AuditLogListResponse,
  AuditLogStats,
  AuditLogStatsResponse
} from "@common/log/log.interface.js";

// ─── 工具函数 ────────────────────────────────────────────────

/**
 * 将 Mongoose 文档映射为前端友好的 LogEntryItem
 */
function mapToLogEntryItem(doc: LogEntryDocument): LogEntryItem {
  const ctx = (doc.context ?? {}) as Record<string, unknown>;

  return {
    id: doc._id.toString(),
    requestId: doc.requestId,
    level: doc.level as LogLevel,
    message: doc.message,
    source: doc.source ?? "q-server",
    user: (ctx.user as string) ?? (ctx.email as string) ?? (ctx.userId as string),
    ip: (ctx.ip as string) ?? (ctx.clientIp as string),
    // 错误级别视为失败，其余为成功
    result: doc.level === "error" || doc.level === "fatal" ? "failure" : "success",
    time: doc.timestamp.toISOString()
  };
}

/**
 * 构建 MongoDB 查询条件
 */
function buildFilter(query: LogListQueryInput): Record<string, unknown> {
  const filter: Record<string, unknown> = {};

  // 时间范围
  if (query.startDate || query.endDate) {
    filter.timestamp = {};
    if (query.startDate) {
      (filter.timestamp as Record<string, Date>).$gte = new Date(query.startDate);
    }
    if (query.endDate) {
      (filter.timestamp as Record<string, Date>).$lte = new Date(query.endDate);
    }
  }

  // 日志级别
  if (query.level) {
    filter.level = query.level;
  }

  // 服务来源
  if (query.source) {
    filter.source = query.source;
  }

  // 关键词搜索（message 字段模糊匹配）
  if (query.keyword) {
    filter.message = { $regex: query.keyword, $options: "i" };
  }

  return filter;
}

/**
 * 获取当日零点时间（UTC+8 时区）
 */
function getTodayStart(): Date {
  const now = new Date();
  // 使用 UTC+8（Asia/Shanghai）
  const offset = 8 * 60 * 60 * 1000;
  const localNow = new Date(now.getTime() + offset);
  localNow.setUTCHours(0, 0, 0, 0);
  return new Date(localNow.getTime() - offset);
}

// ─── 日志服务类 ──────────────────────────────────────────────

export class LogService {
  constructor(private readonly fastify: FastifyInstance) {}

  /**
   * 查询日志列表（分页 + 多条件筛选）
   *
   * @param query 查询条件
   * @returns 分页日志列表
   */
  async list(query: LogListQueryInput): Promise<LogListResponse> {
    const filter = buildFilter(query);
    const page = query.page;
    const pageSize = query.pageSize;

    try {
      const [items, total] = await Promise.all([
        LogEntry.find(filter)
          .sort({ timestamp: -1 })
          .skip((page - 1) * pageSize)
          .limit(pageSize)
          .lean<LogEntryDocument[]>(),
        LogEntry.countDocuments(filter)
      ]);

      const result = paginatedResult(items.map(mapToLogEntryItem), total, { page, pageSize });

      return {
        items: result.items,
        total: result.total,
        page: result.page,
        pageSize: result.limit,
        totalPages: result.totalPages
      };
    } catch (err) {
      this.fastify.log.error({ err }, "日志查询失败");
      return {
        items: [],
        total: 0,
        page,
        pageSize,
        totalPages: 0
      };
    }
  }

  /**
   * 获取日志统计信息
   *
   * @param query 查询条件（可选时间范围）
   * @returns 日志统计
   */
  async stats(query: LogStatsQueryInput): Promise<LogStatsResponse> {
    const todayStart = getTodayStart();
    const todayEnd = new Date();

    // 构建时间范围
    const startDate = query.startDate ? new Date(query.startDate) : todayStart;
    const endDate = query.endDate ? new Date(query.endDate) : todayEnd;

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const timeFilter: Record<string, Date> = {
      $gte: startDate,
      $lte: endDate
    };

    try {
      const [todayTotal, warnCount, errorCount, activeUsersResult] = await Promise.all([
        // 今日日志总数
        LogEntry.countDocuments({
          timestamp: { $gte: todayStart, $lte: todayEnd }
        }),
        // 警告日志数（当日）
        LogEntry.countDocuments({
          level: "warn",
          timestamp: { $gte: todayStart, $lte: todayEnd }
        }),
        // 错误日志数（当日）
        LogEntry.countDocuments({
          level: "error",
          timestamp: { $gte: todayStart, $lte: todayEnd }
        }),
        // 活跃用户数（当日，去重 context.user）
        LogEntry.aggregate([
          {
            $match: {
              timestamp: { $gte: todayStart, $lte: todayEnd },
              "context.user": { $exists: true, $nin: [null, ""] }
            }
          },
          {
            $group: {
              _id: "$context.user"
            }
          },
          {
            $count: "count"
          }
        ])
      ]);

      const stats: LogStats = {
        todayTotal,
        warnCount,
        errorCount,
        activeUsers: activeUsersResult.length > 0 ? (activeUsersResult[0] as { count: number }).count : 0
      };

      return { stats };
    } catch (err) {
      this.fastify.log.error({ err }, "日志统计查询失败");
      return {
        stats: { todayTotal: 0, warnCount: 0, errorCount: 0, activeUsers: 0 }
      };
    }
  }

  // ════════════════════════════════════════════════════════════
  //  审计日志查询（PostgreSQL audit_logs）
  // ════════════════════════════════════════════════════════════

  /**
   * 查询审计日志列表（分页 + 多条件筛选）
   *
   * @param query 查询条件
   * @returns 分页审计日志列表
   */
  async auditList(query: AuditLogListQueryInput): Promise<AuditLogListResponse> {
    const page = query.page;
    const pageSize = query.pageSize;

    // 构建 Prisma where 条件
    const where: Prisma.AuditLogWhereInput = {};

    // 时间范围
    if (query.startDate || query.endDate) {
      where.created_at = {};
      if (query.startDate) where.created_at.gte = new Date(query.startDate);
      if (query.endDate) where.created_at.lte = new Date(query.endDate);
    }

    // 操作类型
    if (query.action) {
      where.action = query.action;
    }

    // 资源类型
    if (query.resourceType) {
      where.resource_type = query.resourceType;
    }

    // 操作者
    if (query.userId) {
      where.user_id = query.userId;
    }

    try {
      const [items, total] = await Promise.all([
        this.fastify.prisma.auditLog.findMany({
          where,
          include: {
            user: {
              select: { username: true }
            }
          },
          orderBy: { created_at: "desc" },
          skip: (page - 1) * pageSize,
          take: pageSize
        }),
        this.fastify.prisma.auditLog.count({ where })
      ]);

      const mapped: AuditLogEntryItem[] = items.map(item => ({
        id: String(item.id),
        userId: item.user_id !== null ? String(item.user_id) : null,
        username: item.user?.username ?? null,
        action: item.action,
        resourceType: item.resource_type,
        resourceId: item.resource_id !== null ? String(item.resource_id) : null,
        details: item.details as Record<string, unknown> | null,
        ipAddress: item.ip_address,
        userAgent: item.user_agent,
        time: item.created_at.toISOString()
      }));

      return {
        items: mapped,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize)
      };
    } catch (err) {
      this.fastify.log.error({ err }, "审计日志查询失败");
      return { items: [], total: 0, page, pageSize, totalPages: 0 };
    }
  }

  /**
   * 获取审计日志统计信息
   *
   * @param query 查询条件（可选时间范围）
   * @returns 审计日志统计
   */
  async auditStats(query: AuditLogStatsQueryInput): Promise<AuditLogStatsResponse> {
    const todayStart = getTodayStart();
    const todayEnd = new Date();

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const startDate = query.startDate ? new Date(query.startDate) : todayStart;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const endDate = query.endDate ? new Date(query.endDate) : todayEnd;

    try {
      const [todayTotal, actionGroups, activeUsers] = await Promise.all([
        // 今日审计日志总数
        this.fastify.prisma.auditLog.count({
          where: { created_at: { gte: todayStart, lte: todayEnd } }
        }),
        // 操作类型分布
        this.fastify.prisma.auditLog.groupBy({
          by: ["action"],
          where: { created_at: { gte: todayStart, lte: todayEnd } },
          _count: { action: true }
        }),
        // 活跃操作者数
        this.fastify.prisma.auditLog.groupBy({
          by: ["user_id"],
          where: {
            created_at: { gte: todayStart, lte: todayEnd },
            user_id: { not: null }
          },
          _count: { user_id: true }
        })
      ]);

      const actionDistribution: Record<string, number> = {};
      for (const g of actionGroups) {
        actionDistribution[g.action] = g._count.action;
      }

      const stats: AuditLogStats = {
        todayTotal,
        actionDistribution,
        activeUsers: activeUsers.length
      };

      return { stats };
    } catch (err) {
      this.fastify.log.error({ err }, "审计日志统计查询失败");
      return {
        stats: { todayTotal: 0, actionDistribution: {}, activeUsers: 0 }
      };
    }
  }
}
