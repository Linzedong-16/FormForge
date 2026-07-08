/**
 * 数据分析路由 — 埋点数据聚合查询接口
 *
 * 挂载前缀：/api/admin（在 routes/index.ts 中注册）
 * 所有接口需要认证 + 超级管理员权限
 *
 * 接口列表：
 *   GET /api/admin/analytics/overview       — 今日概览数据
 *   GET /api/admin/analytics/realtime       — 实时统计（5 分钟窗口）
 *   GET /api/admin/analytics/trend          — 趋势查询（多指标 + 多粒度）
 *   GET /api/admin/analytics/errors         — 错误聚合分析
 *   GET /api/admin/analytics/performance    — 性能指标分析
 *   GET /api/admin/analytics/funnel         — 漏斗分析
 *   GET /api/admin/analytics/ai-usage       — AI 使用分析
 *   GET /api/admin/analytics/events         — 事件明细查询
 */

import type { FastifyPluginAsync } from "fastify";
import { authenticate, requireSuperAdmin } from "../../user/auth/auth.middleware.js";
import { TrackingAnalyticsService } from "./tracking-analytics.service.js";
import {
  analyticsTrendQuerySchema,
  analyticsErrorsQuerySchema,
  analyticsPerformanceQuerySchema,
  analyticsFunnelQuerySchema,
  analyticsAIUsageQuerySchema,
  analyticsEventDetailQuerySchema
} from "./tracking-analytics.schemas.js";
import { parseQueryAndRespond } from "../../../utils/zod.js";

const trackingAnalyticsRoutes: FastifyPluginAsync = async fastify => {
  const analyticsService = new TrackingAnalyticsService(fastify);

  // 所有分析接口均需认证 + 超级管理员权限
  fastify.addHook("preHandler", authenticate);
  fastify.addHook("preHandler", requireSuperAdmin);

  // ════════════════════════════════════════════════════════════════
  // GET /analytics/overview — 今日概览
  // ════════════════════════════════════════════════════════════════

  fastify.get(
    "/analytics/overview",
    {
      config: { rateLimit: { max: 60, timeWindow: "1 minute" } }
    },
    async (_request, reply) => {
      const result = await analyticsService.getOverview();
      return reply.sendSuccess(result);
    }
  );

  // ════════════════════════════════════════════════════════════════
  // GET /analytics/realtime — 实时统计
  // ════════════════════════════════════════════════════════════════

  fastify.get(
    "/analytics/realtime",
    {
      config: { rateLimit: { max: 120, timeWindow: "1 minute" } }
    },
    async (_request, reply) => {
      const result = await analyticsService.getRealtimeStats();
      return reply.sendSuccess(result);
    }
  );

  // ════════════════════════════════════════════════════════════════
  // GET /analytics/trend — 趋势查询
  // ════════════════════════════════════════════════════════════════

  fastify.get(
    "/analytics/trend",
    {
      config: { rateLimit: { max: 30, timeWindow: "1 minute" } }
    },
    async (request, reply) => {
      const query = parseQueryAndRespond(analyticsTrendQuerySchema.safeParse(request.query), reply);
      if (!query) return;

      const result = await analyticsService.getTrend(query);
      return reply.sendSuccess(result);
    }
  );

  // ════════════════════════════════════════════════════════════════
  // GET /analytics/errors — 错误聚合分析
  // ════════════════════════════════════════════════════════════════

  fastify.get(
    "/analytics/errors",
    {
      config: { rateLimit: { max: 30, timeWindow: "1 minute" } }
    },
    async (request, reply) => {
      const query = parseQueryAndRespond(analyticsErrorsQuerySchema.safeParse(request.query), reply);
      if (!query) return;

      const result = await analyticsService.getErrors(query);
      return reply.sendSuccess(result);
    }
  );

  // ════════════════════════════════════════════════════════════════
  // GET /analytics/performance — 性能指标分析
  // ════════════════════════════════════════════════════════════════

  fastify.get(
    "/analytics/performance",
    {
      config: { rateLimit: { max: 30, timeWindow: "1 minute" } }
    },
    async (request, reply) => {
      const query = parseQueryAndRespond(analyticsPerformanceQuerySchema.safeParse(request.query), reply);
      if (!query) return;

      const result = await analyticsService.getPerformance(query);
      return reply.sendSuccess(result);
    }
  );

  // ════════════════════════════════════════════════════════════════
  // GET /analytics/funnel — 漏斗分析
  // ════════════════════════════════════════════════════════════════

  fastify.get(
    "/analytics/funnel",
    {
      config: { rateLimit: { max: 30, timeWindow: "1 minute" } }
    },
    async (request, reply) => {
      const query = parseQueryAndRespond(analyticsFunnelQuerySchema.safeParse(request.query), reply);
      if (!query) return;

      const result = await analyticsService.getFunnel(query);
      return reply.sendSuccess(result);
    }
  );

  // ════════════════════════════════════════════════════════════════
  // GET /analytics/ai-usage — AI 使用分析
  // ════════════════════════════════════════════════════════════════

  fastify.get(
    "/analytics/ai-usage",
    {
      config: { rateLimit: { max: 30, timeWindow: "1 minute" } }
    },
    async (request, reply) => {
      const query = parseQueryAndRespond(analyticsAIUsageQuerySchema.safeParse(request.query), reply);
      if (!query) return;

      const result = await analyticsService.getAIUsage(query);
      return reply.sendSuccess(result);
    }
  );

  // ════════════════════════════════════════════════════════════════
  // GET /analytics/events — 事件明细查询
  // ════════════════════════════════════════════════════════════════

  fastify.get(
    "/analytics/events",
    {
      config: { rateLimit: { max: 30, timeWindow: "1 minute" } }
    },
    async (request, reply) => {
      const query = parseQueryAndRespond(analyticsEventDetailQuerySchema.safeParse(request.query), reply);
      if (!query) return;

      const result = await analyticsService.getEventDetail(query);
      return reply.sendSuccess(result);
    }
  );
};

export default trackingAnalyticsRoutes;
