/**
 * 审核模块 — 路由定义（管理员接口）
 *
 * 挂载前缀：/api/admin（在 routes/index.ts 中注册）
 * 所有接口需认证 + 超级管理员权限
 */

import type { FastifyPluginAsync, FastifyReply } from "fastify";
import { authenticate, requireSuperAdmin } from "../user/auth/auth.middleware.js";
import { ReviewService } from "./review.service.js";
import { reviewListQuerySchema, approveReviewSchema, rejectReviewSchema, reviewIdSchema } from "./review.schemas.js";
import { parseAndRespond, parseQueryAndRespond } from "../../utils/zod.js";

/** 解析并校验审核记录 ID，非法格式返回 400 */
function parseReviewId(id: string, reply: FastifyReply): bigint | null {
  const result = reviewIdSchema.safeParse(id);
  if (!result.success) {
    reply.status(400).send({ data: null, code: 400, msg: "审核记录 ID 格式错误" });
    return null;
  }
  return result.data;
}

const reviewRoutes: FastifyPluginAsync = async fastify => {
  const reviewService = new ReviewService(fastify);

  // 所有接口均需认证 + 超级管理员权限
  fastify.addHook("preHandler", authenticate);
  fastify.addHook("preHandler", requireSuperAdmin);

  // ════════════════════════════════════════════════════════════
  // GET /reviews — 审核列表（分页 + 筛选）
  // ════════════════════════════════════════════════════════════
  fastify.get(
    "/reviews",
    {
      config: {
        rateLimit: { max: 60, timeWindow: "1 minute" }
      }
    },
    async (request, reply) => {
      const query = parseQueryAndRespond(reviewListQuerySchema.safeParse(request.query), reply);
      if (!query) return;

      fastify.log.info({ userId: String(request.user!.userId), query }, "[review] GET /reviews — 查询审核列表");

      try {
        const result = await reviewService.listReviews(query);
        fastify.log.info({ total: result.pagination.total }, "[review] GET /reviews — 查询成功");
        return reply.sendSuccess(result);
      } catch (err) {
        fastify.log.error({ err }, "[review] GET /reviews — 查询失败");
        throw err;
      }
    }
  );

  // ════════════════════════════════════════════════════════════
  // GET /reviews/:id — 审核详情（含问卷完整内容）
  // ════════════════════════════════════════════════════════════
  fastify.get(
    "/reviews/:id",
    {
      config: {
        rateLimit: { max: 60, timeWindow: "1 minute" }
      }
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const reviewId = parseReviewId(id, reply);
      if (reviewId === null) return;

      fastify.log.info(
        { userId: String(request.user!.userId), reviewId: id },
        "[review] GET /reviews/:id — 查询审核详情"
      );

      try {
        const result = await reviewService.getReviewDetail(reviewId);
        fastify.log.info({ reviewId: id, status: result.status }, "[review] GET /reviews/:id — 查询成功");
        return reply.sendSuccess(result);
      } catch (err) {
        fastify.log.error({ err, reviewId: id }, "[review] GET /reviews/:id — 查询失败");
        throw err;
      }
    }
  );

  // ════════════════════════════════════════════════════════════
  // POST /reviews/:id/approve — 审核通过
  // ════════════════════════════════════════════════════════════
  fastify.post(
    "/reviews/:id/approve",
    {
      config: {
        rateLimit: { max: 30, timeWindow: "1 minute" }
      }
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const reviewId = parseReviewId(id, reply);
      if (reviewId === null) return;

      const body = parseAndRespond(approveReviewSchema.safeParse(request.body), reply);
      if (!body) return;

      fastify.log.info(
        { userId: String(request.user!.userId), reviewId: id },
        "[review] POST /reviews/:id/approve — 审核通过"
      );

      try {
        const result = await reviewService.approveReview(request.user!.userId, reviewId, body);
        fastify.log.info({ reviewId: id, status: "approved" }, "[review] POST /reviews/:id/approve — 审核通过完成");
        return reply.sendSuccess(result, "审核通过");
      } catch (err) {
        fastify.log.error({ err, reviewId: id }, "[review] POST /reviews/:id/approve — 审核失败");
        throw err;
      }
    }
  );

  // ════════════════════════════════════════════════════════════
  // POST /reviews/:id/reject — 审核驳回
  // ════════════════════════════════════════════════════════════
  fastify.post(
    "/reviews/:id/reject",
    {
      config: {
        rateLimit: { max: 30, timeWindow: "1 minute" }
      }
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const reviewId = parseReviewId(id, reply);
      if (reviewId === null) return;

      const body = parseAndRespond(rejectReviewSchema.safeParse(request.body), reply);
      if (!body) return;

      fastify.log.info(
        { userId: String(request.user!.userId), reviewId: id },
        "[review] POST /reviews/:id/reject — 审核驳回"
      );

      try {
        const result = await reviewService.rejectReview(request.user!.userId, reviewId, body);
        fastify.log.info({ reviewId: id, status: "rejected" }, "[review] POST /reviews/:id/reject — 审核驳回完成");
        return reply.sendSuccess(result, "审核已驳回");
      } catch (err) {
        fastify.log.error({ err, reviewId: id }, "[review] POST /reviews/:id/reject — 审核失败");
        throw err;
      }
    }
  );
};

export default reviewRoutes;
