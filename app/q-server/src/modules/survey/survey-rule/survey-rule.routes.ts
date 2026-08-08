/**
 * 问卷动态规则模块 — 路由定义
 *
 * 挂载前缀：/api（在 routes/index.ts 中注册）
 * 认证策略：仅问卷所属用户可调用，复用 survey-crud 模块既有的 authenticate 中间件与归属校验语义
 */

import type { FastifyPluginAsync } from "fastify";
import type { FastifyReply } from "fastify";
import { authenticate } from "../../user/auth/auth.middleware.js";
import { SurveyRuleService } from "./survey-rule.service.js";
import { surveyIdSchema } from "../survey-crud/survey-crud.schemas.js";

/** 解析并校验问卷 ID，非法格式返回 400（与 survey-crud.routes.ts 的同名校验逻辑保持一致） */
function parseSurveyId(id: string, reply: FastifyReply): bigint | null {
  const result = surveyIdSchema.safeParse(id);
  if (!result.success) {
    reply.status(400).send({ data: null, code: 400, msg: "问卷 ID 格式错误" });
    return null;
  }
  return result.data;
}

const surveyRuleRoutes: FastifyPluginAsync = async fastify => {
  const surveyRuleService = new SurveyRuleService(fastify);

  // ════════════════════════════════════════════════════════════
  // POST /api/surveys/:id/validate-rules — 规则完整性预检（只读，不改变问卷状态）
  // ════════════════════════════════════════════════════════════
  fastify.post(
    "/surveys/:id/validate-rules",
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

      const result = await surveyRuleService.validateSurveyRules(request.user!.userId, surveyId);
      return reply.sendSuccess(result);
    }
  );
};

export default surveyRuleRoutes;
