/**
 * 模板模块 — 路由定义
 *
 * 挂载前缀：/api（在 routes/index.ts 中注册）
 * 所有接口需要认证（authenticate 中间件）
 */

import type { FastifyPluginAsync, FastifyReply } from "fastify";
import { authenticate } from "../user/auth/auth.middleware.js";
import { TemplateService } from "./template.service.js";
import {
  templateListQuerySchema,
  useTemplateSchema,
  rateTemplateSchema,
  templateIdSchema
} from "./template.schemas.js";
import { parseAndRespond, parseQueryAndRespond } from "../../utils/zod.js";

/** 解析并校验模板 ID，非法格式返回 400 */
function parseTemplateId(id: string, reply: FastifyReply): bigint | null {
  const result = templateIdSchema.safeParse(id);
  if (!result.success) {
    reply.status(400).send({ data: null, code: 400, msg: "模板 ID 格式错误" });
    return null;
  }
  return result.data;
}

const templateRoutes: FastifyPluginAsync = async fastify => {
  const templateService = new TemplateService(fastify);

  // ── 所有模板接口均需认证 ────────────────────────────────────
  fastify.addHook("preHandler", authenticate);

  // ════════════════════════════════════════════════════════════
  // GET /api/templates — 模板市场列表
  // ════════════════════════════════════════════════════════════
  fastify.get(
    "/templates",
    {
      config: {
        rateLimit: { max: 60, timeWindow: "1 minute" }
      }
    },
    async (request, reply) => {
      const query = parseQueryAndRespond(templateListQuerySchema.safeParse(request.query), reply);
      if (!query) return;

      const result = await templateService.list(query);
      return reply.sendSuccess(result);
    }
  );

  // ════════════════════════════════════════════════════════════
  // GET /api/templates/:id — 模板详情
  // ════════════════════════════════════════════════════════════
  fastify.get(
    "/templates/:id",
    {
      config: {
        rateLimit: { max: 60, timeWindow: "1 minute" }
      }
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const templateId = parseTemplateId(id, reply);
      if (templateId === null) return;

      const result = await templateService.getById(templateId);
      return reply.sendSuccess(result);
    }
  );

  // ════════════════════════════════════════════════════════════
  // POST /api/templates/:id/apply — 使用模板创建问卷
  // ════════════════════════════════════════════════════════════
  fastify.post(
    "/templates/:id/apply",
    {
      config: {
        rateLimit: { max: 20, timeWindow: "1 minute" }
      }
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const templateId = parseTemplateId(id, reply);
      if (templateId === null) return;

      const body = parseAndRespond(useTemplateSchema.safeParse(request.body), reply);
      if (!body) return;

      const result = await templateService.useTemplate(request.user!.userId, templateId, body);
      return reply.sendSuccess(result, "模板应用成功");
    }
  );

  // ════════════════════════════════════════════════════════════
  // POST /api/templates/:id/rate — 模板评分
  // ════════════════════════════════════════════════════════════
  fastify.post(
    "/templates/:id/rate",
    {
      config: {
        rateLimit: { max: 10, timeWindow: "1 minute" }
      }
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const templateId = parseTemplateId(id, reply);
      if (templateId === null) return;

      const body = parseAndRespond(rateTemplateSchema.safeParse(request.body), reply);
      if (!body) return;

      const result = await templateService.rate(request.user!.userId, templateId, body);
      return reply.sendSuccess(result, "评分成功");
    }
  );
};

export default templateRoutes;
