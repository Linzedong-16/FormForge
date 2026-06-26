/**
 * 问卷统计模块 — 路由定义（管理员接口）
 *
 * 挂载前缀：/api/admin（在 routes/index.ts 中注册）
 * 所有接口需认证 + 管理员权限（问卷所有者或超级管理员均可访问）
 *
 * 新增接口：
 *   GET  /stats/overview              — 平台统计概览
 *   GET  /surveys/:id/stats            — 单问卷详细统计
 *   GET  /surveys/:id/responses        — 答卷列表（增强：含搜索/筛选）
 *   GET  /surveys/:id/responses/export — CSV 导出
 */

import type { FastifyPluginAsync, FastifyReply } from "fastify";
import { authenticate, requireSuperAdmin } from "../../user/auth/auth.middleware.js";
import { SurveyStatsService } from "./survey-stats.service.js";
import {
  statsOverviewQuerySchema,
  statsSurveyIdSchema,
  adminResponseListQuerySchema,
  exportQuerySchema
} from "./survey-stats.schemas.js";
import { parseQueryAndRespond } from "../../../utils/zod.js";
import { AppError } from "../../../utils/errors.js";

/** 解析并校验问卷 ID */
function parseStatsSurveyId(id: string, reply: FastifyReply): bigint | null {
  const result = statsSurveyIdSchema.safeParse(id);
  if (!result.success) {
    reply.status(400).send({ data: null, code: 400, msg: "问卷 ID 格式错误" });
    return null;
  }
  return result.data;
}

const surveyStatsRoutes: FastifyPluginAsync = async fastify => {
  const statsService = new SurveyStatsService(fastify);

  // 所有接口均需认证 + 管理员权限
  fastify.addHook("preHandler", authenticate);
  fastify.addHook("preHandler", requireSuperAdmin);

  // ════════════════════════════════════════════════════════════
  // GET /stats/overview — 平台统计概览
  // ════════════════════════════════════════════════════════════
  fastify.get(
    "/stats/overview",
    {
      config: {
        rateLimit: { max: 30, timeWindow: "1 minute" }
      }
    },
    async (request, reply) => {
      const query = parseQueryAndRespond(statsOverviewQuerySchema.safeParse(request.query), reply);
      if (!query) return;

      try {
        const result = await statsService.getOverview(query);
        return reply.sendSuccess(result);
      } catch (err) {
        if (err instanceof AppError) {
          return reply.status(err.statusCode).send({ data: null, code: err.code, msg: err.message });
        }
        throw err;
      }
    }
  );

  // ════════════════════════════════════════════════════════════
  // GET /surveys/:id/stats — 单问卷详细统计
  // ════════════════════════════════════════════════════════════
  fastify.get(
    "/surveys/:id/stats",
    {
      config: {
        rateLimit: { max: 30, timeWindow: "1 minute" }
      }
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const surveyId = parseStatsSurveyId(id, reply);
      if (surveyId === null) return;

      try {
        const result = await statsService.getSurveyStats(surveyId);
        return reply.sendSuccess(result);
      } catch (err) {
        if (err instanceof AppError) {
          return reply.status(err.statusCode).send({ data: null, code: err.code, msg: err.message });
        }
        throw err;
      }
    }
  );

  // ════════════════════════════════════════════════════════════
  // GET /surveys/:id/responses — 答卷列表（增强查询）
  // ════════════════════════════════════════════════════════════
  fastify.get(
    "/surveys/:id/responses",
    {
      config: {
        rateLimit: { max: 30, timeWindow: "1 minute" }
      }
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const surveyId = parseStatsSurveyId(id, reply);
      if (surveyId === null) return;

      const query = parseQueryAndRespond(adminResponseListQuerySchema.safeParse(request.query), reply);
      if (!query) return;

      try {
        const result = await statsService.listResponses(surveyId, query);
        return reply.sendSuccess(result);
      } catch (err) {
        if (err instanceof AppError) {
          return reply.status(err.statusCode).send({ data: null, code: err.code, msg: err.message });
        }
        throw err;
      }
    }
  );

  // ════════════════════════════════════════════════════════════
  // GET /surveys/:id/responses/export — CSV 导出
  // ════════════════════════════════════════════════════════════
  fastify.get(
    "/surveys/:id/responses/export",
    {
      config: {
        rateLimit: { max: 10, timeWindow: "1 minute" }
      }
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const surveyId = parseStatsSurveyId(id, reply);
      if (surveyId === null) return;

      const query = parseQueryAndRespond(exportQuerySchema.safeParse(request.query), reply);
      if (!query) return;

      try {
        const csv = await statsService.exportResponsesCSV(surveyId, query);

        const survey = await fastify.prisma.survey.findFirst({
          where: { id: surveyId, deleted_at: null },
          select: { title: true }
        });
        const filename = `survey_${id}_${survey?.title ?? "responses"}.csv`;

        reply.header("Content-Type", "text/csv; charset=utf-8");
        reply.header("Content-Disposition", `attachment; filename="${encodeURIComponent(filename)}"`);
        // 添加 UTF-8 BOM，确保 Excel 正确识别中文
        return reply.send("﻿" + csv);
      } catch (err) {
        if (err instanceof AppError) {
          return reply.status(err.statusCode).send({ data: null, code: err.code, msg: err.message });
        }
        throw err;
      }
    }
  );
};

export default surveyStatsRoutes;
