/**
 * 用户路由 — 当前用户信息查询与更新
 * 挂载于 /api/user
 *
 * 所有接口需要认证（authenticate 中间件）
 */

import type { FastifyPluginAsync } from "fastify";
import { authenticate } from "../auth/auth.middleware.js";
import { UserService } from "./user-crud.service.js";
import { parseAndRespond } from "../../../utils/zod.js";
import { z } from "zod";

/** 更新用户信息请求体 Schema */
const updateProfileSchema = z.object({
  username: z.string().min(1).max(50).optional(),
  password: z.string().min(8).max(128).optional()
});

const userCrudRoutes: FastifyPluginAsync = async fastify => {
  const userService = new UserService(fastify);

  // 所有用户接口均需认证
  fastify.addHook("preHandler", authenticate);

  // ── GET /user/me — 获取当前用户信息 ────────────────────────
  fastify.get("/me", async (request, reply) => {
    const result = await userService.getCurrentUser(request.user!.userId);
    return reply.sendSuccess(result);
  });

  // ── PUT /user/update — 更新当前用户信息 ────────────────────
  fastify.put("/update", async (request, reply) => {
    const body = parseAndRespond(updateProfileSchema.safeParse(request.body), reply);
    if (!body) return;

    const result = await userService.updateCurrentUser(request.user!.userId, body);
    return reply.sendSuccess(result, "更新成功");
  });
};

export default userCrudRoutes;
