/**
 * DeepSeek 用量查询路由 — 管理员接口
 *
 * 挂载于 /api/admin
 *   GET /ai/usage — 查询 DeepSeek 余额 + Token 用量
 *
 * 权限：需超级管理员（authenticate + requireSuperAdmin）
 */
import type { FastifyPluginAsync } from "fastify";
import { authenticate, requireSuperAdmin } from "../../user/auth/auth.middleware.js";
import { AIUsageService } from "./ai-usage.service.js";
import { usageQuerySchema } from "./ai-usage.schemas.js";
import { parseQueryAndRespond } from "../../../utils/zod.js";

const aiUsageRoutes: FastifyPluginAsync = async fastify => {
  const usageService = new AIUsageService(fastify);

  // 所有接口均需认证 + 超级管理员权限
  fastify.addHook("preHandler", authenticate);
  fastify.addHook("preHandler", requireSuperAdmin);

  // ══════════════════════════════════════════════════════════════
  //  GET /ai/usage — 查询 DeepSeek 余额 + 用量
  // ══════════════════════════════════════════════════════════════
  fastify.get(
    "/ai/usage",
    {
      config: {
        rateLimit: { max: 10, timeWindow: "1 minute" }
      }
    },
    async (request, reply) => {
      const query = parseQueryAndRespond(usageQuerySchema.safeParse(request.query), reply);
      if (!query) return;

      try {
        const result = await usageService.getUsage(query.start_date, query.end_date);
        return reply.sendSuccess(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        fastify.log.error({ err }, "[ai-usage] 查询失败");

        // 区分不同的错误类型
        if (message.includes("未配置")) {
          return reply.status(400).send({ data: null, code: 400, msg: message });
        }
        if (message.includes("余额不足") || message.includes("无效")) {
          return reply.status(402).send({ data: null, code: 402, msg: message });
        }
        return reply.status(502).send({
          data: null,
          code: 502,
          msg: `DeepSeek API 查询失败：${message}`
        });
      }
    }
  );
};

export default aiUsageRoutes;
