/**
 * 认证中间件
 *
 * authenticate      — 校验 Access Token，将用户信息挂载到 request.user
 * requireSuperAdmin — 校验当前用户是否为超级管理员
 */

import type { FastifyRequest, FastifyReply } from "fastify";
import { AuthService } from "./auth.service.js";
import { AuthError } from "../../utils/errors.js";

// ─── 扩展 FastifyRequest 类型 ────────────────────────────────

declare module "fastify" {
  interface FastifyRequest {
    user?: {
      userId: bigint;
      email: string;
      role: string;
    };
  }
}

/** 从请求头提取 Bearer Token */
function extractToken(request: FastifyRequest): string | null {
  const auth = request.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) {
    return null;
  }
  return auth.slice(7);
}

/** 认证中间件 — 校验 Access Token */
export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  const token = extractToken(request);
  if (!token) {
    return reply.sendUnauthorized("请先登录");
  }

  try {
    const authService = new AuthService(request.server);
    request.user = await authService.verifyToken(token);
  } catch (error) {
    if (error instanceof AuthError) {
      return reply.status(error.statusCode).send({
        data: error.details ?? null,
        code: error.code,
        msg: error.message
      });
    }
    return reply.sendUnauthorized("Token 无效");
  }
}

/** 超级管理员权限中间件 — 需在 authenticate 之后使用 */
export async function requireSuperAdmin(request: FastifyRequest, reply: FastifyReply) {
  if (!request.user || request.user.role !== "super_admin") {
    return reply.sendForbidden("需要超级管理员权限");
  }
}
