/**
 * 管理路由 — 用户管理、系统配置
 * 挂载于 /api/admin
 */

import type { FastifyPluginAsync } from "fastify";
import { AdminService } from "./admin.service.js";
import { authenticate, requireSuperAdmin } from "./auth.middleware.js";

const adminRoutes: FastifyPluginAsync = async fastify => {
  const adminService = new AdminService(fastify);

  // 所有管理接口均需认证 + 超级管理员权限
  fastify.addHook("preHandler", authenticate);
  fastify.addHook("preHandler", requireSuperAdmin);

  // ── POST /users — 创建用户 ────────────────────────────────
  fastify.post("/users", async (request, reply) => {
    const { email, username, role, password } = request.body as {
      email: string;
      username: string;
      role: "user" | "admin";
      password?: string;
    };

    if (!email || !username || !role) {
      return reply.sendBadRequest("邮箱、用户名和角色不能为空");
    }
    if (!["user", "admin"].includes(role)) {
      return reply.sendBadRequest("无效的角色类型");
    }

    const adminId = request.user!.userId;
    const result = await adminService.createUser(adminId, { email, username, role, password });
    return reply.sendSuccess(result, "用户创建成功");
  });

  // ── GET /users — 获取用户列表 ─────────────────────────────
  fastify.get("/users", async (request, reply) => {
    const query = request.query as {
      page?: string;
      limit?: string;
      email?: string;
      status?: string;
    };

    const result = await adminService.listUsers({
      page: Math.max(1, Number(query.page ?? 1)),
      limit: Math.min(100, Math.max(1, Number(query.limit ?? 20))),
      email: query.email,
      status: query.status !== undefined ? Number(query.status) : undefined
    });

    return reply.sendSuccess(result);
  });

  // ── PUT /users/:id — 更新用户 ─────────────────────────────
  fastify.put("/users/:id", async (request, reply) => {
    const targetId = BigInt((request.params as { id: string }).id);
    const { username, role, status } = request.body as {
      username?: string;
      role?: "user" | "admin";
      status?: number;
    };

    const adminId = request.user!.userId;
    const result = await adminService.updateUser(adminId, targetId, { username, role, status });
    return reply.sendSuccess(result, "用户更新成功");
  });

  // ── DELETE /users/:id — 删除用户 ──────────────────────────
  fastify.delete("/users/:id", async (request, reply) => {
    const targetId = BigInt((request.params as { id: string }).id);
    const adminId = request.user!.userId;
    const result = await adminService.deleteUser(adminId, targetId);
    return reply.sendSuccess(result, "用户已删除");
  });

  // ── GET /config — 获取系统配置 ────────────────────────────
  fastify.get("/config", async (_request, reply) => {
    const result = await adminService.getConfig();
    return reply.sendSuccess(result);
  });

  // ── PUT /config/smtp — 更新 SMTP 配置 ─────────────────────
  fastify.put("/config/smtp", async (request, reply) => {
    const { enabled, host, port, username, password, fromEmail } = request.body as {
      enabled: boolean;
      host: string;
      port: number;
      username: string;
      password: string;
      fromEmail: string;
    };

    if (!host || !port || !username || !fromEmail) {
      return reply.sendBadRequest("SMTP 配置信息不完整");
    }

    const adminId = request.user!.userId;
    const result = await adminService.updateSmtpConfig(adminId, {
      enabled: enabled ?? false,
      host,
      port,
      username,
      password: password ?? "",
      fromEmail
    });
    return reply.sendSuccess(result, "SMTP 配置已更新");
  });
};

export default adminRoutes;
