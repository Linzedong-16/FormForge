/**
 * AI 配置管理路由 — 管理员接口
 *
 * 挂载于 /api/admin
 *   GET  /config/ai    查询 AI 配置（Key 脱敏）
 *   PUT  /config/ai    更新 AI 配置
 *
 * 权限：需超级管理员（authenticate + requireSuperAdmin）
 */
import type { FastifyPluginAsync } from "fastify";
import { authenticate, requireSuperAdmin } from "../../user/auth/auth.middleware.js";
import { AIConfigService } from "./ai-config.service.js";
import { updateAIConfigSchema } from "./ai-config.schemas.js";
import { parseAndRespond } from "../../../utils/zod.js";

const aiConfigRoutes: FastifyPluginAsync = async fastify => {
  const aiConfigService = new AIConfigService(fastify);

  // 所有接口均需认证 + 超级管理员权限
  fastify.addHook("preHandler", authenticate);
  fastify.addHook("preHandler", requireSuperAdmin);

  // ══════════════════════════════════════════════════════════════
  //  GET /config/ai — 查询 AI 配置
  // ══════════════════════════════════════════════════════════════
  fastify.get("/config/ai", async (_request, reply) => {
    const config = await aiConfigService.getConfig();
    return reply.sendSuccess(config);
  });

  // ══════════════════════════════════════════════════════════════
  //  PUT /config/ai — 更新 AI 配置
  // ══════════════════════════════════════════════════════════════
  fastify.put("/config/ai", async (request, reply) => {
    const body = parseAndRespond(updateAIConfigSchema.safeParse(request.body), reply);
    if (!body) return;

    const adminId = request.user!.userId;

    try {
      const result = await aiConfigService.updateConfig(adminId, body);
      return reply.sendSuccess(result, "AI 配置已更新");
    } catch (err) {
      // 区分加密密钥未配置 与 其他异常
      const rawMsg = err instanceof Error ? err.message : String(err);
      fastify.log.error({ err }, "AI 配置更新失败");

      if (rawMsg.includes("CRYPTO_ENCRYPTION_KEY")) {
        return reply.status(500).send({
          data: null,
          code: 500,
          msg: "服务端加密密钥未配置（CRYPTO_ENCRYPTION_KEY），请联系运维配置后重试"
        });
      }
      return reply.status(500).send({
        data: null,
        code: 500,
        msg: `AI 配置更新失败：${rawMsg}`
      });
    }
  });
};

export default aiConfigRoutes;
