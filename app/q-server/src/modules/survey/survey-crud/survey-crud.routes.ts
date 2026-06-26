/**
 * 问卷模块 — 路由定义
 *
 * 挂载前缀：/api（在 routes/index.ts 中注册）
 * 认证策略：
 *   - B 端接口（CRUD/审核/模板）：需要 authenticate
 *   - C 端接口（获取 token / 提交答卷）：无需认证（公开访问）
 *   - 答卷查询接口：需要 authenticate
 */

import type { FastifyPluginAsync } from "fastify";
import type { FastifyReply } from "fastify";
import { authenticate } from "../../user/auth/auth.middleware.js";
import { SurveyService } from "./survey-crud.service.js";
import {
  createSurveySchema,
  updateSurveySchema,
  surveyListQuerySchema,
  publishSurveySchema,
  closeSurveySchema,
  applyTemplateSchema,
  submitReviewSchema,
  surveyIdSchema,
  submitResponseSchema,
  responseListQuerySchema,
  generateLinkSchema
} from "./survey-crud.schemas.js";
import { parseAndRespond, parseQueryAndRespond } from "../../../utils/zod.js";
import { AppError } from "../../../utils/errors.js";

/** 解析并校验问卷 ID，非法格式返回 400 */
function parseSurveyId(id: string, reply: FastifyReply): bigint | null {
  const result = surveyIdSchema.safeParse(id);
  if (!result.success) {
    reply.status(400).send({ data: null, code: 400, msg: "问卷 ID 格式错误" });
    return null;
  }
  return result.data;
}

const surveyCrudRoutes: FastifyPluginAsync = async fastify => {
  const surveyService = new SurveyService(fastify);

  // ════════════════════════════════════════════════════════════
  // POST /api/surveys — 创建问卷（首次同步）
  // ════════════════════════════════════════════════════════════
  fastify.post(
    "/surveys",
    {
      preHandler: authenticate,
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
      preHandler: authenticate,
      config: {
        rateLimit: { max: 60, timeWindow: "1 minute" }
      }
    },
    async (request, reply) => {
      const query = parseQueryAndRespond(surveyListQuerySchema.safeParse(request.query), reply);
      if (!query) return;

      const result = await surveyService.list(request.user!.userId, query, request.user!.role);
      return reply.sendSuccess(result);
    }
  );

  // ════════════════════════════════════════════════════════════
  // GET /api/surveys/:id — 问卷详情
  // ════════════════════════════════════════════════════════════
  fastify.get(
    "/surveys/:id",
    {
      preHandler: authenticate,
      config: {
        rateLimit: { max: 60, timeWindow: "1 minute" }
      }
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const surveyId = parseSurveyId(id, reply);
      if (surveyId === null) return;

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
      preHandler: authenticate,
      config: {
        rateLimit: { max: 30, timeWindow: "1 minute" }
      }
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const surveyId = parseSurveyId(id, reply);
      if (surveyId === null) return;

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
      preHandler: authenticate,
      config: {
        rateLimit: { max: 20, timeWindow: "1 minute" }
      }
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const surveyId = parseSurveyId(id, reply);
      if (surveyId === null) return;

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
      preHandler: authenticate,
      config: {
        rateLimit: { max: 10, timeWindow: "1 minute" }
      }
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const surveyId = parseSurveyId(id, reply);
      if (surveyId === null) return;

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
      preHandler: authenticate,
      config: {
        rateLimit: { max: 10, timeWindow: "1 minute" }
      }
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const surveyId = parseSurveyId(id, reply);
      if (surveyId === null) return;

      const body = parseAndRespond(closeSurveySchema.safeParse(request.body), reply);
      if (!body) return;

      const result = await surveyService.close(request.user!.userId, surveyId);
      return reply.sendSuccess(result, "关闭成功");
    }
  );

  // ════════════════════════════════════════════════════════════
  // POST /api/surveys/:id/submit-review — 提交问卷审核
  // ════════════════════════════════════════════════════════════
  fastify.post(
    "/surveys/:id/submit-review",
    {
      preHandler: authenticate,
      config: {
        rateLimit: { max: 10, timeWindow: "1 minute" }
      }
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const surveyId = parseSurveyId(id, reply);
      if (surveyId === null) return;

      const body = parseAndRespond(submitReviewSchema.safeParse(request.body), reply);
      if (!body) return;

      const result = await surveyService.submitReview(request.user!.userId, surveyId, body);
      return reply.sendSuccess(result, "审核申请已提交，等待管理员审核");
    }
  );

  // ════════════════════════════════════════════════════════════
  // POST /api/surveys/:id/apply-template — 申请共享模板
  // ════════════════════════════════════════════════════════════
  fastify.post(
    "/surveys/:id/apply-template",
    {
      preHandler: authenticate,
      config: {
        rateLimit: { max: 10, timeWindow: "1 minute" }
      }
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const surveyId = parseSurveyId(id, reply);
      if (surveyId === null) return;

      const body = parseAndRespond(applyTemplateSchema.safeParse(request.body), reply);
      if (!body) return;

      const result = await surveyService.applyTemplate(request.user!.userId, surveyId, body);
      return reply.sendSuccess(result, "模板申请已提交，等待管理员审核");
    }
  );

  // ════════════════════════════════════════════════════════════
  // GET /api/responses/:id — 答卷详情
  // ════════════════════════════════════════════════════════════
  fastify.get(
    "/responses/:id",
    {
      preHandler: authenticate,
      config: {
        rateLimit: { max: 60, timeWindow: "1 minute" }
      }
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const responseId = parseSurveyId(id, reply);
      if (responseId === null) return;

      const result = await surveyService.getResponseById(request.user!.userId, responseId);
      return reply.sendSuccess(result);
    }
  );

  // ════════════════════════════════════════════════════════════
  // DELETE /api/responses/:id — 删除答卷
  // ════════════════════════════════════════════════════════════
  fastify.delete(
    "/responses/:id",
    {
      preHandler: authenticate,
      config: {
        rateLimit: { max: 20, timeWindow: "1 minute" }
      }
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const responseId = parseSurveyId(id, reply);
      if (responseId === null) return;

      await surveyService.deleteResponse(request.user!.userId, responseId);
      return reply.sendSuccess(null, "删除成功");
    }
  );

  // ════════════════════════════════════════════════════════════
  // POST /api/surveys/:id/generate-link — 生成定时问卷链接
  // ════════════════════════════════════════════════════════════
  fastify.post(
    "/surveys/:id/generate-link",
    {
      preHandler: authenticate,
      config: {
        rateLimit: { max: 10, timeWindow: "1 minute" }
      }
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const surveyId = parseSurveyId(id, reply);
      if (surveyId === null) return;

      const body = parseAndRespond(generateLinkSchema.safeParse(request.body), reply);
      if (!body) return;

      try {
        const result = await surveyService.generateSurveyLink(request.user!.userId, surveyId, body);
        return reply.sendSuccess(result, "问卷链接生成成功");
      } catch (err) {
        if (err instanceof AppError) {
          return reply.status(err.statusCode).send({ data: null, code: err.code, msg: err.message });
        }
        throw err;
      }
    }
  );

  // ════════════════════════════════════════════════════════════
  //  C 端接口（无需认证）— 以下接口为公开访问
  // ════════════════════════════════════════════════════════════

  // ════════════════════════════════════════════════════════════
  // GET /api/surveys/:id/public — 问卷公开详情（C 端）
  // ════════════════════════════════════════════════════════════
  fastify.get(
    "/surveys/:id/public",
    {
      config: {
        rateLimit: { max: 120, timeWindow: "1 minute" }
      }
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const surveyId = parseSurveyId(id, reply);
      if (surveyId === null) return;

      try {
        const result = await surveyService.getPublicById(surveyId);
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
  // GET /api/surveys/:surveyId/token — 获取临时 token
  // ════════════════════════════════════════════════════════════
  fastify.get(
    "/surveys/:surveyId/token",
    {
      config: {
        rateLimit: { max: 60, timeWindow: "1 minute" }
      }
    },
    async (request, reply) => {
      const { surveyId } = request.params as { surveyId: string };
      const id = parseSurveyId(surveyId, reply);
      if (id === null) return;

      // 校验问卷存在且已发布
      const survey = await fastify.prisma.survey.findFirst({
        where: { id, deleted_at: null },
        select: { id: true, status: true }
      });
      if (!survey) {
        return reply.sendNotFound("问卷不存在");
      }
      if (survey.status !== 1) {
        return reply.status(400).send({ data: null, code: 400, msg: "问卷未发布，无法获取提交凭证" });
      }

      const result = await surveyService.generateSurveyToken(id);
      return reply.sendSuccess(result);
    }
  );

  // ════════════════════════════════════════════════════════════
  // POST /api/surveys/:surveyId/responses — 提交答卷（C 端）
  // ════════════════════════════════════════════════════════════
  fastify.post(
    "/surveys/:surveyId/responses",
    {
      config: {
        rateLimit: { max: 30, timeWindow: "1 minute" }
      }
    },
    async (request, reply) => {
      const { surveyId } = request.params as { surveyId: string };
      const id = parseSurveyId(surveyId, reply);
      if (id === null) return;

      const body = parseAndRespond(submitResponseSchema.safeParse(request.body), reply);
      if (!body) return;

      try {
        const result = await surveyService.submitResponse(id, body);
        return reply.sendSuccess(result, "提交成功");
      } catch (err) {
        if (err instanceof AppError) {
          return reply.status(err.statusCode).send({ data: null, code: err.code, msg: err.message });
        }
        throw err;
      }
    }
  );

  // ════════════════════════════════════════════════════════════
  // GET /api/surveys/:surveyId/responses — 答卷列表
  // ════════════════════════════════════════════════════════════
  fastify.get(
    "/surveys/:surveyId/responses",
    {
      preHandler: authenticate,
      config: {
        rateLimit: { max: 60, timeWindow: "1 minute" }
      }
    },
    async (request, reply) => {
      const { surveyId } = request.params as { surveyId: string };
      const id = parseSurveyId(surveyId, reply);
      if (id === null) return;

      const query = parseQueryAndRespond(responseListQuerySchema.safeParse(request.query), reply);
      if (!query) return;

      const result = await surveyService.listResponses(request.user!.userId, id, query);
      return reply.sendSuccess(result);
    }
  );
};

export default surveyCrudRoutes;
