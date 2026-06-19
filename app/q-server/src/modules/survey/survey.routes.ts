/**
 * 问卷模块 — 路由定义（C 端）
 *
 * 挂载前缀：/api（在 routes/index.ts 中注册）
 * 所有接口需要认证（authenticate 中间件）
 */

import type { FastifyPluginAsync } from "fastify";
import { authenticate } from "../user/auth.middleware.js";
import { SurveyService } from "./survey.service.js";
import {
  createSurveySchema,
  updateSurveySchema,
  surveyListQuerySchema,
  publishSurveySchema,
  closeSurveySchema,
  applyTemplateSchema
} from "./survey.schemas.js";
import { parseAndRespond, parseQueryAndRespond } from "../../utils/zod.js";

const surveyRoutes: FastifyPluginAsync = async fastify => {
  const surveyService = new SurveyService(fastify);

  // ── 所有问卷接口均需认证 ────────────────────────────────────
  fastify.addHook("preHandler", authenticate);

  // ════════════════════════════════════════════════════════════
  // POST /api/surveys — 创建问卷（首次同步）
  // ════════════════════════════════════════════════════════════
  fastify.post(
    "/surveys",
    {
      config: {
        rateLimit: { max: 30, timeWindow: "1 minute" }
      }
    },
    async (request, reply) => {
      const body = parseAndRespond(createSurveySchema.safeParse(request.body), reply);
      if (!body) return;

      const result = await surveyService.create(request.user!.userId, body);
      return reply.sendSuccess(result, "创建成功");
    }
  );

  // ════════════════════════════════════════════════════════════
  // GET /api/surveys — 问卷列表
  // ════════════════════════════════════════════════════════════
  fastify.get(
    "/surveys",
    {
      config: {
        rateLimit: { max: 60, timeWindow: "1 minute" }
      }
    },
    async (request, reply) => {
      const query = parseQueryAndRespond(surveyListQuerySchema.safeParse(request.query), reply);
      if (!query) return;

      const result = await surveyService.list(request.user!.userId, query);
      return reply.sendSuccess(result);
    }
  );

  // ════════════════════════════════════════════════════════════
  // GET /api/surveys/:id — 问卷详情
  // ════════════════════════════════════════════════════════════
  fastify.get(
    "/surveys/:id",
    {
      config: {
        rateLimit: { max: 60, timeWindow: "1 minute" }
      }
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const surveyId = BigInt(id);

      const result = await surveyService.getById(request.user!.userId, surveyId);
      return reply.sendSuccess(result);
    }
  );

  // ════════════════════════════════════════════════════════════
  // PUT /api/surveys/:id — 更新问卷（再次同步）
  // ════════════════════════════════════════════════════════════
  fastify.put(
    "/surveys/:id",
    {
      config: {
        rateLimit: { max: 30, timeWindow: "1 minute" }
      }
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const surveyId = BigInt(id);

      const body = parseAndRespond(updateSurveySchema.safeParse(request.body), reply);
      if (!body) return;

      const result = await surveyService.update(request.user!.userId, surveyId, body);
      return reply.sendSuccess(result, "更新成功");
    }
  );

  // ════════════════════════════════════════════════════════════
  // DELETE /api/surveys/:id — 删除问卷（软删除）
  // ════════════════════════════════════════════════════════════
  fastify.delete(
    "/surveys/:id",
    {
      config: {
        rateLimit: { max: 20, timeWindow: "1 minute" }
      }
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const surveyId = BigInt(id);

      await surveyService.delete(request.user!.userId, surveyId);
      return reply.sendSuccess(null, "删除成功");
    }
  );

  // ════════════════════════════════════════════════════════════
  // POST /api/surveys/:id/publish — 发布问卷
  // ════════════════════════════════════════════════════════════
  fastify.post(
    "/surveys/:id/publish",
    {
      config: {
        rateLimit: { max: 10, timeWindow: "1 minute" }
      }
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const surveyId = BigInt(id);

      const body = parseAndRespond(publishSurveySchema.safeParse(request.body), reply);
      if (!body) return;

      const result = await surveyService.publish(request.user!.userId, surveyId);
      return reply.sendSuccess(result, "发布成功");
    }
  );

  // ════════════════════════════════════════════════════════════
  // POST /api/surveys/:id/close — 关闭问卷
  // ════════════════════════════════════════════════════════════
  fastify.post(
    "/surveys/:id/close",
    {
      config: {
        rateLimit: { max: 10, timeWindow: "1 minute" }
      }
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const surveyId = BigInt(id);

      const body = parseAndRespond(closeSurveySchema.safeParse(request.body), reply);
      if (!body) return;

      const result = await surveyService.close(request.user!.userId, surveyId);
      return reply.sendSuccess(result, "关闭成功");
    }
  );

  // ════════════════════════════════════════════════════════════
  // POST /api/surveys/:id/apply-template — 申请共享模板
  // ════════════════════════════════════════════════════════════
  fastify.post(
    "/surveys/:id/apply-template",
    {
      config: {
        rateLimit: { max: 10, timeWindow: "1 minute" }
      }
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const surveyId = BigInt(id);

      const body = parseAndRespond(applyTemplateSchema.safeParse(request.body), reply);
      if (!body) return;

      const result = await surveyService.applyTemplate(request.user!.userId, surveyId, body);
      return reply.sendSuccess(result, "模板申请已提交，等待管理员审核");
    }
  );
};

export default surveyRoutes;
