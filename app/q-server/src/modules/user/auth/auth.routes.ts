/**
 * 认证路由 — 登录、注册、Token 管理、密码重置
 * 挂载于 /api/auth
 *
 * 所有请求体/查询参数统一通过 Zod Schema 校验，不再手写 if-else
 */

import type { FastifyPluginAsync } from "fastify";
import { AuthService } from "./auth.service.js";
import { authenticate } from "./auth.middleware.js";
import {
  loginSchema,
  sendCodeSchema,
  registerSchema,
  verifyRegisterSchema,
  refreshTokenSchema,
  resetPasswordSchema
} from "../schemas/user.schemas.js";
import { parseAndRespond } from "../../../utils/zod.js";

const authRoutes: FastifyPluginAsync = async fastify => {
  const authService = new AuthService(fastify);

  // ── GET /status — 系统状态（公开） ──────────────────────────
  fastify.get("/status", async (_req, reply) => {
    const status = await authService.getSystemStatus();
    return reply.sendSuccess(status);
  });

  // ── POST /login — 登录（公开，20次/分钟防暴力破解） ────────
  fastify.post(
    "/login",
    {
      config: {
        rateLimit: {
          max: 20,
          timeWindow: "1 minute"
        }
      }
    },
    async (request, reply) => {
      const body = parseAndRespond(loginSchema.safeParse(request.body), reply);
      if (!body) return;

      const result = await authService.login(body.email, body.password);
      return reply.sendSuccess(result, "登录成功");
    }
  );

  // ── POST /send-code — 发送验证码（公开，5次/分钟防滥用） ────
  fastify.post(
    "/send-code",
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: "1 minute"
        }
      }
    },
    async (request, reply) => {
      const body = parseAndRespond(sendCodeSchema.safeParse(request.body), reply);
      if (!body) return;

      const result = await authService.sendCode(body.email, body.type);
      return reply.sendSuccess(result, "验证码已发送");
    }
  );

  // ── POST /register — 初始化注册（公开） ─────────────────────
  fastify.post("/register", async (request, reply) => {
    const body = parseAndRespond(registerSchema.safeParse(request.body), reply);
    if (!body) return;

    const result = await authService.registerAsSuperAdmin(body.email, body.password, body.username);
    return reply.sendSuccess(result, "注册成功");
  });

  // ── POST /verify-register — 邮箱验证注册（公开） ────────────
  fastify.post("/verify-register", async (request, reply) => {
    const body = parseAndRespond(verifyRegisterSchema.safeParse(request.body), reply);
    if (!body) return;

    const result = await authService.verifyAndRegister(
      body.email,
      body.code,
      body.password,
      body.username ?? body.email.split("@")[0]
    );
    return reply.sendSuccess(result, "注册成功");
  });

  // ── POST /refresh — 刷新 Token（公开） ──────────────────────
  fastify.post("/refresh", async (request, reply) => {
    const body = parseAndRespond(refreshTokenSchema.safeParse(request.body), reply);
    if (!body) return;

    const result = await authService.refreshToken(body.refreshToken);
    return reply.sendSuccess(result, "Token 刷新成功");
  });

  // ── POST /reset-password — 重置密码（公开） ─────────────────
  fastify.post("/reset-password", async (request, reply) => {
    const body = parseAndRespond(resetPasswordSchema.safeParse(request.body), reply);
    if (!body) return;

    await authService.resetPassword(body.email, body.code, body.newPassword);
    return reply.sendSuccess(null, "密码重置成功");
  });

  // ── POST /logout — 登出（需认证） ────────────────────────────
  fastify.post("/logout", { preHandler: [authenticate] }, async (request, reply) => {
    const token = (request.headers.authorization ?? "").replace("Bearer ", "");
    await authService.logout(token);
    return reply.sendSuccess(null, "已退出登录");
  });
};

export default authRoutes;
