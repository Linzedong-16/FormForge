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
import { authenticate, requireSuperAdmin } from "../user/auth.middleware.js";
import { AIConfigService } from "./ai-config.service.js";
import { updateAIConfigSchema } from "./ai-config.schemas.js";
import { parseAndRespond } from "../../utils/zod.js";
import { AppError } from "../../utils/errors.js";

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
      // 加密/解密相关错误（如 CRYPTO_ENCRYPTION_KEY 未配置）
      const msg = err instanceof AppError ? err.message : "AI 配置更新失败";
      return reply.status(500).send({ data: null, code: 500, msg });
    }
  });
};

export default aiConfigRoutes;
