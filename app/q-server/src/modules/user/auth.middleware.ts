/**
 * 认证中间件
 *
 * authenticate      — 校验 Access Token，将用户信息挂载到 request.user
 * requireSuperAdmin — 校验当前用户是否为超级管理员
 *
 * 优化：使用 WeakMap 按 FastifyInstance 缓存 AuthService 实例，
 *       避免每次请求重复 new AuthService()（构造函数内初始化缓存客户端）
 */

import type { FastifyRequest, FastifyReply, FastifyInstance } from "fastify";
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

// ─── AuthService 单例（按 FastifyInstance 复用） ─────────────

const authServiceMap = new WeakMap<FastifyInstance, AuthService>();

function getAuthService(server: FastifyInstance): AuthService {
  let service = authServiceMap.get(server);
  if (!service) {
    service = new AuthService(server);
    authServiceMap.set(server, service);
  }
  return service;
}

/** 从请求头提取 Bearer Token */
export function extractToken(request: FastifyRequest): string | null {
  const auth = request.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) {
    return null;
  }
  return auth.slice(7);
}

/** 认证中间件 — 校验 Access Token */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function authenticate(request: FastifyRequest, _reply: FastifyReply) {
  // #region debug-point auth-middleware-entry
  const t0 = Date.now();
  // #endregion
  const token = extractToken(request);
  if (!token) {
    // #region debug-point auth-no-token
    request.log.info({ latency_ms: Date.now() - t0 }, "[debug] auth: no token, returning 401");
    // #endregion
    throw new AuthError("请先登录", 401);
  }

  try {
    // #region debug-point auth-verify-token-start
    request.log.info("[debug] auth: verifying token...");
    // #endregion
    const authService = getAuthService(request.server);
    request.user = await authService.verifyToken(token);
    // #region debug-point auth-verify-token-end
    request.log.info({ latency_ms: Date.now() - t0 }, "[debug] auth: token verified");
    // #endregion
  } catch (error) {
    // #region debug-point auth-verify-token-error
    request.log.warn({ latency_ms: Date.now() - t0, err: error }, "[debug] auth: token verification failed");
    // #endregion
    if (error instanceof AuthError) {
      throw error;
    }
    throw new AuthError("Token 无效", 401);
  }
}

/** 超级管理员权限中间件 — 需在 authenticate 之后使用 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function requireSuperAdmin(request: FastifyRequest, _reply: FastifyReply) {
  if (!request.user || request.user.role !== "super_admin") {
    throw new AuthError("需要超级管理员权限", 403);
  }
}
