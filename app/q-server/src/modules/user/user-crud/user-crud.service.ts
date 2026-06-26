/**
 * 用户服务 — 当前用户信息查询与更新
 */

import bcrypt from "bcrypt";
import type { FastifyInstance } from "fastify";
import { AuthError, ValidationError } from "../../../utils/errors.js";
import { createCache, CacheKeys } from "../../../utils/cache.js";
import type { CacheClient } from "../../../utils/cache.js";
import { createAuditLog } from "../../../utils/audit-log.js";

// ─── 类型 ────────────────────────────────────────────────────

export interface UserProfile {
  id: string;
  email: string;
  username: string;
  role: string;
  status: number;
  created_at: string;
  last_login_at: string | null;
}

export interface UpdateUserProfileInput {
  username?: string;
  password?: string;
}

// ─── 用户服务类 ──────────────────────────────────────────────

export class UserService {
  private readonly cache: CacheClient;

  constructor(private readonly fastify: FastifyInstance) {
    this.cache = createCache(fastify);
  }

  // ============================================================
  //  获取当前用户信息
  // ============================================================
  async getCurrentUser(userId: bigint): Promise<UserProfile> {
    const cacheKey = CacheKeys.userAuthProfile(userId.toString());

    const cached = await this.cache.get<UserProfile>(cacheKey);
    if (cached) {
      return cached;
    }

    const user = await this.fastify.prisma.user.findFirst({
      where: { id: userId, deleted_at: null },
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
        status: true,
        created_at: true,
        last_login_at: true
      }
    });

    if (!user) {
      throw new AuthError("用户不存在", 404);
    }

    const profile: UserProfile = {
      id: user.id.toString(),
      email: user.email,
      username: user.username,
      role: user.role,
      status: user.status,
      created_at: user.created_at.toISOString(),
      last_login_at: user.last_login_at?.toISOString() ?? null
    };

    // 后台回填缓存
    this.cache.set(cacheKey, profile, 300).catch(() => {});

    return profile;
  }

  // ============================================================
  //  更新当前用户信息
  // ============================================================
  async updateCurrentUser(userId: bigint, input: UpdateUserProfileInput): Promise<UserProfile> {
    if (!input.username && !input.password) {
      throw new ValidationError("至少需要提供 username 或 password 中的一个字段");
    }

    const data: Record<string, unknown> = {};

    // 用户名校验
    if (input.username !== undefined) {
      if (input.username.length < 1 || input.username.length > 50) {
        throw new ValidationError("用户名长度需在 1-50 个字符之间");
      }
      data.username = input.username;
    }

    // 密码校验与加密
    if (input.password !== undefined) {
      if (input.password.length < 8 || input.password.length > 128) {
        throw new ValidationError("密码长度需在 8-128 个字符之间");
      }
      const passwordHash = await bcrypt.hash(input.password, 10);
      data.password_hash = passwordHash;
      data.password_updated_at = new Date(); // 标记改密时间，清除 requirePasswordChange
    }

    const user = await this.fastify.prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
        status: true,
        created_at: true,
        last_login_at: true
      }
    });

    // 失效相关缓存
    const userIdStr = userId.toString();
    await Promise.all([
      this.cache.del(CacheKeys.userAuthProfile(userIdStr)),
      this.cache.del(CacheKeys.userRoles(userIdStr))
    ]);

    // 记录审计日志
    createAuditLog(this.fastify, userId, "update_profile", "user", userId, {
      updated_fields: Object.keys(input)
    }).catch(() => {});

    return {
      id: user.id.toString(),
      email: user.email,
      username: user.username,
      role: user.role,
      status: user.status,
      created_at: user.created_at.toISOString(),
      last_login_at: user.last_login_at?.toISOString() ?? null
    };
  }
}
