/**
 * 日志查询路由 — 系统日志查询与统计
 *
 * 挂载前缀：/api（在 routes/index.ts 中注册）
 * 所有接口需要认证 + 超级管理员权限
 *
 * 接口列表：
 *   GET /api/logs              — 系统日志列表（MongoDB，分页 + 多条件筛选）
 *   GET /api/logs/stats        — 系统日志统计
 *   GET /api/audit-logs        — 审计日志列表（PostgreSQL，分页 + 多条件筛选）
 *   GET /api/audit-logs/stats  — 审计日志统计
 */

import type { FastifyPluginAsync } from "fastify";
import { authenticate, requireSuperAdmin } from "../user/auth.middleware.js";
import { LogService } from "./log.service.js";
import {
  logListQuerySchema,
  logStatsQuerySchema,
  auditLogListQuerySchema,
  auditLogStatsQuerySchema
} from "./log.schemas.js";
import { parseQueryAndRespond } from "../../utils/zod.js";

const logRoutes: FastifyPluginAsync = async fastify => {
  const logService = new LogService(fastify);

  // 所有日志查询接口均需认证 + 超级管理员权限
  fastify.addHook("preHandler", authenticate);
  fastify.addHook("preHandler", requireSuperAdmin);

  // ════════════════════════════════════════════════════════════
  // 系统日志（MongoDB logentries）
  // ════════════════════════════════════════════════════════════

  fastify.get(
    "/logs",
    {
      config: {
        rateLimit: { max: 60, timeWindow: "1 minute" }
      }
    },
    async (request, reply) => {
      const query = parseQueryAndRespond(logListQuerySchema.safeParse(request.query), reply);
      if (!query) return;

      const result = await logService.list(query);
      return reply.sendSuccess(result);
    }
  );

  fastify.get(
    "/logs/stats",
    {
      config: {
        rateLimit: { max: 30, timeWindow: "1 minute" }
      }
    },
    async (request, reply) => {
      const query = parseQueryAndRespond(logStatsQuerySchema.safeParse(request.query), reply);
      if (!query) return;

      const result = await logService.stats(query);
      return reply.sendSuccess(result);
    }
  );

  // ════════════════════════════════════════════════════════════
  // 审计日志（PostgreSQL audit_logs）
  // ════════════════════════════════════════════════════════════

  fastify.get(
    "/audit-logs",
    {
      config: {
        rateLimit: { max: 60, timeWindow: "1 minute" }
      }
    },
    async (request, reply) => {
      const query = parseQueryAndRespond(auditLogListQuerySchema.safeParse(request.query), reply);
      if (!query) return;

      const result = await logService.auditList(query);
      return reply.sendSuccess(result);
    }
  );

  fastify.get(
    "/audit-logs/stats",
    {
      config: {
        rateLimit: { max: 30, timeWindow: "1 minute" }
      }
    },
    async (request, reply) => {
      const query = parseQueryAndRespond(auditLogStatsQuerySchema.safeParse(request.query), reply);
      if (!query) return;

      const result = await logService.auditStats(query);
      return reply.sendSuccess(result);
    }
  );
};

export default logRoutes;
