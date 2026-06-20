/**
 * 管理路由 — 用户管理、系统配置
 * 挂载于 /api/admin
 *
 * 所有请求体/查询参数统一通过 Zod Schema 校验
 */

import type { FastifyPluginAsync } from "fastify";
import { AdminService } from "./admin.service.js";
import { authenticate, requireSuperAdmin } from "./auth.middleware.js";
import {
  createUserSchema,
  updateUserSchema,
  userListQuerySchema,
  updateSmtpConfigSchema
} from "./schemas/user.schemas.js";
import { parseAndRespond, parseQueryAndRespond } from "../../utils/zod.js";
import { AppError } from "../../utils/errors.js";

/** 校验并解析用户 ID 参数 */
function parseUserIdParam(params: unknown): bigint {
  const id = (params as { id?: string }).id;
  if (!id || !/^[1-9]\d{0,18}$/.test(id)) {
    throw new AppError("无效的用户 ID", 400);
  }
  return BigInt(id);
}

const adminRoutes: FastifyPluginAsync = async fastify => {
  const adminService = new AdminService(fastify);

  // 所有管理接口均需认证 + 超级管理员权限
  fastify.addHook("preHandler", authenticate);
  fastify.addHook("preHandler", requireSuperAdmin);

  // ── POST /users — 创建用户 ──────────────────────────────────
  fastify.post("/users", async (request, reply) => {
    const body = parseAndRespond(createUserSchema.safeParse(request.body), reply);
    if (!body) return;

    const adminId = request.user!.userId;
    const result = await adminService.createUser(adminId, body);
    return reply.sendSuccess(result, "用户创建成功");
  });

  // ── GET /users — 用户列表（分页+搜索） ───────────────────────
  fastify.get("/users", async (request, reply) => {
    const query = parseQueryAndRespond(userListQuerySchema.safeParse(request.query), reply);
    if (!query) return;

    const result = await adminService.listUsers(query);
    return reply.sendSuccess(result);
  });

  // ── PUT /users/:id — 更新用户 ────────────────────────────────
  fastify.put("/users/:id", async (request, reply) => {
    const body = parseAndRespond(updateUserSchema.safeParse(request.body), reply);
    if (!body) return;

    const targetId = parseUserIdParam(request.params);
    const adminId = request.user!.userId;
    const result = await adminService.updateUser(adminId, targetId, body);
    return reply.sendSuccess(result, "用户更新成功");
  });

  // ── DELETE /users/:id — 删除用户 ─────────────────────────────
  fastify.delete("/users/:id", async (request, reply) => {
    const targetId = parseUserIdParam(request.params);
    const adminId = request.user!.userId;
    const result = await adminService.deleteUser(adminId, targetId);
    return reply.sendSuccess(result, "用户已删除");
  });

  // ── GET /config — 获取系统配置 ────────────────────────────────
  fastify.get("/config", async (_request, reply) => {
    const result = await adminService.getConfig();
    return reply.sendSuccess(result);
  });

  // ── PUT /config/smtp — 更新 SMTP 配置 ─────────────────────────
  fastify.put("/config/smtp", async (request, reply) => {
    const body = parseAndRespond(updateSmtpConfigSchema.safeParse(request.body), reply);
    if (!body) return;

    const adminId = request.user!.userId;
    const result = await adminService.updateSmtpConfig(adminId, body);
    return reply.sendSuccess(result, "SMTP 配置已更新");
  });
};

export default adminRoutes;
