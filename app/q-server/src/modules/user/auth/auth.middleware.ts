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
import { AuthError } from "../../../utils/errors.js";
import { CacheKeys } from "../../../utils/cache.js";

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

/** 格式化封禁剩余时间为可读字符串 */
function formatBanDuration(seconds: number): string {
  if (seconds <= 0) return "即将解除";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}天`);
  if (hours > 0) parts.push(`${hours}小时`);
  if (mins > 0) parts.push(`${mins}分钟`);
  return parts.join("") || "不到1分钟";
}

/** 检查用户是否被封禁（authenticate 内部调用） */
async function checkBanStatus(request: FastifyRequest): Promise<void> {
  if (!request.user) return;

  const userId = request.user.userId.toString();
  const banKey = CacheKeys.userBanStatus(userId);
  let isBanned = false;
  let banRemaining = -2;

  // 1. 优先查 Redis 黑名单
  try {
    isBanned = !!(await request.server.redis.exists(banKey));
    if (isBanned) {
      banRemaining = await request.server.redis.ttl(banKey);
    }
  } catch {
    // Redis 不可用时降级，不做拦截
    request.log.warn({ userId }, "封禁状态 Redis 查询失败");
  }

  // 2. Redis 未命中时，回查 DB status
  if (!isBanned) {
    try {
      const user = await request.server.prisma.user.findUnique({
        where: { id: BigInt(userId) },
        select: { status: true }
      });
      if (user && user.status === 0) {
        // Redis 封禁 key 已过期但 DB status 仍为 0 → 封禁已到期，恢复 DB 状态
        request.log.info({ userId }, "封禁已到期，自动恢复 DB status=1");
        await request.server.prisma.user
          .update({
            where: { id: BigInt(userId) },
            data: { status: 1 }
          })
          .catch(() => {
            request.log.warn({ userId }, "封禁到期恢复 DB status 失败");
          });
      }
    } catch {
      request.log.warn({ userId }, "封禁状态 DB 兜底查询失败");
    }
  }

  if (isBanned) {
    throw new AuthError(
      banRemaining > 0 ? `账号已被封禁，剩余 ${formatBanDuration(banRemaining)}` : "账号已被封禁",
      403
    );
  }
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

    // ★ 检查封禁状态
    await checkBanStatus(request);
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
