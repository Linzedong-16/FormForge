/**
 * 认证路由 — 登录、注册、Token 管理
 * 挂载于 /api/auth
 */

import type { FastifyPluginAsync } from "fastify";
import { AuthService } from "./auth.service.js";
import { authenticate } from "./auth.middleware.js";

const authRoutes: FastifyPluginAsync = async fastify => {
  const authService = new AuthService(fastify);

  // ── GET /status — 获取系统状态（公开） ────────────────────
  fastify.get("/status", async (_req, reply) => {
    const status = await authService.getSystemStatus();
    return reply.sendSuccess(status);
  });

  // ── POST /login — 用户登录（公开） ────────────────────────
  fastify.post("/login", async (request, reply) => {
    const { email, password } = request.body as { email: string; password: string };

    if (!email || !password) {
      return reply.sendBadRequest("邮箱和密码不能为空");
    }

    const result = await authService.login(email, password);
    return reply.sendSuccess(result, "登录成功");
  });

  // ── POST /send-code — 发送验证码（公开） ──────────────────
  fastify.post("/send-code", async (request, reply) => {
    const { email, type } = request.body as { email: string; type: "register" | "reset_password" };

    if (!email || !type) {
      return reply.sendBadRequest("邮箱和验证码类型不能为空");
    }
    if (!["register", "reset_password"].includes(type)) {
      return reply.sendBadRequest("无效的验证码类型");
    }

    const result = await authService.sendCode(email, type);
    return reply.sendSuccess(result, "验证码已发送");
  });

  // ── POST /register — 初始化注册（公开） ────────────────────
  fastify.post("/register", async (request, reply) => {
    const { email, password, username } = request.body as {
      email: string;
      password: string;
      username?: string;
    };

    if (!email || !password) {
      return reply.sendBadRequest("邮箱和密码不能为空");
    }

    const result = await authService.registerAsSuperAdmin(email, password, username);
    return reply.sendSuccess(result, "注册成功");
  });

  // ── POST /verify-register — 验证邮箱并注册（公开） ─────────
  fastify.post("/verify-register", async (request, reply) => {
    const { email, code, password, username } = request.body as {
      email: string;
      code: string;
      password: string;
      username?: string;
    };

    if (!email || !code || !password) {
      return reply.sendBadRequest("邮箱、验证码和密码不能为空");
    }

    const result = await authService.verifyAndRegister(email, code, password, username ?? email.split("@")[0]);
    return reply.sendSuccess(result, "注册成功");
  });

  // ── POST /refresh — 刷新 Token（公开） ─────────────────────
  fastify.post("/refresh", async (request, reply) => {
    const { refreshToken } = request.body as { refreshToken: string };

    if (!refreshToken) {
      return reply.sendBadRequest("Refresh Token 不能为空");
    }

    const result = await authService.refreshToken(refreshToken);
    return reply.sendSuccess(result, "Token 刷新成功");
  });

  // ── POST /logout — 登出（需认证） ──────────────────────────
  fastify.post("/logout", { preHandler: [authenticate] }, async (request, reply) => {
    const token = (request.headers.authorization ?? "").replace("Bearer ", "");
    await authService.logout(token);
    return reply.sendSuccess(null, "已退出登录");
  });
};

export default authRoutes;
