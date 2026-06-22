/**
 * 用户资料服务 — 资料查询/更新、头像上传、邮箱绑定、密码修改、账号注销
 *
 * 所有写操作均记录审计日志，读操作使用 Cache-Aside 缓存策略。
 */

import bcrypt from "bcrypt";
import type { FastifyInstance } from "fastify";
import { AuthError, ValidationError } from "../../../utils/errors.js";
import { BizCode } from "../../../utils/response.js";
import { createCache, CacheKeys } from "../../../utils/cache.js";
import type { CacheClient } from "../../../utils/cache.js";
import { createAuditLog } from "../../../utils/audit-log.js";
import type { UpdateProfileInput } from "../schemas/user.schemas.js";

// ─── Redis Key 常量 ──────────────────────────────────────────

/** 验证码 Key 前缀（与 auth.service.ts 保持一致） */
const VERIFY_CODE_PREFIX = "auth:verify:";
/** JWT 黑名单 Key 前缀 */
const JWT_BLACKLIST_PREFIX = "auth:jwt:blacklist:";
/** 用户当前 Access Token JTI */
const USER_ACCESS_PREFIX = "auth:user:access:";

// ─── 类型定义 ────────────────────────────────────────────────

/** 用户资料完整响应 */
export interface UserProfileResponse {
  userId: string;
  email: string;
  username: string;
  avatarUrl: string | null;
  nickname: string | null;
  occupation: string | null;
  bio: string | null;
  interests: string[];
  boundEmail: string | null;
  emailVerified: boolean;
}

// ─── 工具函数 ────────────────────────────────────────────────

/** 获取用户资料默认值（用于首访场景） */
function defaultProfile(
  userId: string,
  email: string,
  username: string,
  avatarUrl: string | null
): UserProfileResponse {
  return {
    userId,
    email,
    username,
    avatarUrl,
    nickname: null,
    occupation: null,
    bio: null,
    interests: [],
    boundEmail: null,
    emailVerified: false
  };
}

/** 安全解析 interests JSON 字段为字符串数组 */
function parseInterests(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === "string");
  }
  return [];
}

// ─── 资料服务类 ──────────────────────────────────────────────

export class ProfileService {
  private readonly cache: CacheClient;

  constructor(private readonly fastify: FastifyInstance) {
    this.cache = createCache(fastify);
  }

  // ============================================================
  //  获取用户资料（含表单回显数据）
  // ============================================================

  /**
   * 获取当前用户完整资料：
   * - 优先从 UserProfile 表读取
   * - 首访用户（UserProfile 不存在）返回空默认值，不报错
   * - 头像 URL 优先级：UserProfile.avatar_url → User.avatar_url → null
   * - 使用 Cache-Aside 缓存策略，TTL 300s
   */
  async getProfile(userId: bigint): Promise<UserProfileResponse> {
    const userIdStr = userId.toString();
    const cacheKey = CacheKeys.userProfile(userIdStr);

    // 1. 尝试读缓存
    const cached = await this.cache.get<UserProfileResponse>(cacheKey);
    if (cached) {
      return cached;
    }

    // 2. 查询 User 表（必须存在）
    const user = await this.fastify.prisma.user.findFirst({
      where: { id: userId, deleted_at: null },
      select: { id: true, email: true, username: true, avatar_url: true }
    });

    if (!user) {
      throw new AuthError("用户不存在", 404);
    }

    // 3. 查询 UserProfile 表
    const profile = await this.fastify.prisma.userProfile.findUnique({
      where: { user_id: userId }
    });

    // 4. 组装响应
    const result: UserProfileResponse = profile
      ? {
          userId: user.id.toString(),
          email: user.email,
          username: user.username,
          avatarUrl: profile.avatar_url ?? user.avatar_url,
          nickname: profile.nickname,
          occupation: profile.occupation,
          bio: profile.bio,
          interests: parseInterests(profile.interests),
          boundEmail: profile.bound_email,
          emailVerified: profile.email_verified
        }
      : defaultProfile(user.id.toString(), user.email, user.username, user.avatar_url);

    // 5. 后台回填缓存
    this.cache.set(cacheKey, result, 300).catch(() => {});

    return result;
  }

  // ============================================================
  //  更新用户资料
  // ============================================================

  /**
   * 更新用户个人资料（昵称/职业/个人介绍/兴趣标签）
   * - 所有字段均为可选，仅更新传入的非 undefined 字段
   * - 使用 upsert 合并 INSERT/UPDATE（首访用户自动创建记录）
   * - 兴趣标签自动去重
   */
  async updateProfile(
    userId: bigint,
    input: UpdateProfileInput
  ): Promise<Pick<UserProfileResponse, "nickname" | "occupation" | "bio" | "interests">> {
    // 1. 构建更新数据（仅含传入的非 undefined 字段）
    const data: Record<string, unknown> = {};

    if (input.nickname !== undefined) {
      data.nickname = input.nickname;
    }
    if (input.occupation !== undefined) {
      data.occupation = input.occupation;
    }
    if (input.bio !== undefined) {
      data.bio = input.bio;
    }
    if (input.interests !== undefined) {
      // 兴趣标签去重
      data.interests = [...new Set(input.interests)];
    }

    // 2. Upsert — 首次创建或更新
    const profile = await this.fastify.prisma.userProfile.upsert({
      where: { user_id: userId },
      create: {
        user_id: userId,
        ...data
      },
      update: data
    });

    // 3. 失效缓存
    const userIdStr = userId.toString();
    await this.cache.del(CacheKeys.userProfile(userIdStr));

    // 4. 记录审计日志
    createAuditLog(this.fastify, userId, "update_profile", "user_profile", userId, {
      updated_fields: Object.keys(input)
    }).catch(() => {});

    return {
      nickname: profile.nickname,
      occupation: profile.occupation,
      bio: profile.bio,
      interests: parseInterests(profile.interests)
    };
  }

  // ============================================================
  //  更新头像 URL（由 avatar.service.ts 调用）
  // ============================================================

  /**
   * 更新用户头像 URL 到数据库
   * 由 avatar.service.ts 在 MinIO 上传成功后调用
   */
  async updateAvatarUrl(userId: bigint, avatarUrl: string): Promise<void> {
    await this.fastify.prisma.userProfile.upsert({
      where: { user_id: userId },
      create: {
        user_id: userId,
        avatar_url: avatarUrl
      },
      update: {
        avatar_url: avatarUrl
      }
    });

    const userIdStr = userId.toString();
    await this.cache.del(CacheKeys.userProfile(userIdStr));

    createAuditLog(this.fastify, userId, "upload_avatar", "user_profile", userId, {
      avatarUrl
    }).catch(() => {});
  }

  // ============================================================
  //  绑定邮箱
  // ============================================================

  /**
   * 绑定/换绑邮箱
   * - 校验验证码（Redis 中 key: auth:verify:<email>）
   * - 校验邮箱未被其他用户绑定
   */
  async bindEmail(userId: bigint, email: string, code: string): Promise<{ email: string; verified: boolean }> {
    // 1. 从 Redis 校验验证码
    const stored = await this.fastify.redis.get(`${VERIFY_CODE_PREFIX}${email}`);
    if (!stored) {
      throw new ValidationError("验证码已过期，请重新获取");
    }

    let storedCode: string;
    let type: string;
    try {
      const parsed = JSON.parse(stored);
      storedCode = parsed.code;
      type = parsed.type;
    } catch {
      throw new ValidationError("验证码无效，请重新获取");
    }

    if (type !== "bind_email" || storedCode !== code) {
      throw new ValidationError("验证码错误");
    }

    // 2. 删除已使用的验证码
    await this.fastify.redis.del(`${VERIFY_CODE_PREFIX}${email}`);

    // 3. 校验邮箱未被其他用户绑定
    const existing = await this.fastify.prisma.userProfile.findFirst({
      where: {
        bound_email: email,
        user_id: { not: userId }
      }
    });
    if (existing) {
      throw new ValidationError("该邮箱已被其他用户绑定", BizCode.EMAIL_ALREADY_BOUND);
    }

    // 4. 检查是否已绑定相同邮箱（避免无意义的 upsert）
    const current = await this.fastify.prisma.userProfile.findUnique({
      where: { user_id: userId },
      select: { bound_email: true, email_verified: true }
    });
    if (current?.bound_email === email) {
      return { email, verified: current.email_verified };
    }

    // 5. 更新 UserProfile
    await this.fastify.prisma.userProfile.upsert({
      where: { user_id: userId },
      create: {
        user_id: userId,
        bound_email: email,
        email_verified: true
      },
      update: {
        bound_email: email,
        email_verified: true
      }
    });

    // 6. 失效缓存
    const userIdStr = userId.toString();
    await this.cache.del(CacheKeys.userProfile(userIdStr));

    // 7. 记录审计日志
    createAuditLog(this.fastify, userId, "bind_email", "user_profile", userId, {
      bound_email: email
    }).catch(() => {});

    return { email, verified: true };
  }

  // ============================================================
  //  修改密码
  // ============================================================

  /**
   * 已登录用户修改密码
   * - 验证当前密码
   * - 新密码不能与当前密码相同
   * - 修改成功后使当前 Token 失效
   */
  async changePassword(userId: bigint, currentPassword: string, newPassword: string): Promise<void> {
    // 1. 查询用户
    const user = await this.fastify.prisma.user.findFirst({
      where: { id: userId, deleted_at: null }
    });
    if (!user) {
      throw new AuthError("用户不存在", 404);
    }

    // 2. 验证当前密码
    const isValid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isValid) {
      throw new ValidationError("当前密码不正确", BizCode.CURRENT_PASSWORD_INCORRECT);
    }

    // 3. 校验新密码与当前密码不同
    const isSame = await bcrypt.compare(newPassword, user.password_hash);
    if (isSame) {
      throw new ValidationError("新密码不能与当前密码相同", BizCode.PASSWORD_SAME_AS_CURRENT);
    }

    // 4. 更新密码
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.fastify.prisma.user.update({
      where: { id: userId },
      data: { password_hash: passwordHash }
    });

    // 5. 使当前用户所有 Token 失效 & 清除认证缓存
    const userIdStr = userId.toString();
    await Promise.all([
      this.fastify.redis.del(`${USER_ACCESS_PREFIX}${userId}`),
      this.cache.del(CacheKeys.userAuthProfile(userIdStr))
    ]);

    // 6. 记录审计日志
    createAuditLog(this.fastify, userId, "change_password", "user", userId).catch(() => {});
  }

  // ============================================================
  //  注销账号
  // ============================================================

  /**
   * 软删除当前用户账号
   * - 设置 deleted_at 时间戳
   * - 使 Token 失效
   * - 清理所有用户相关缓存
   */
  async deleteAccount(userId: bigint): Promise<{ deletedAt: string }> {
    // 1. 检查用户是否存在且未被注销
    const user = await this.fastify.prisma.user.findFirst({
      where: { id: userId, deleted_at: null }
    });

    if (!user) {
      throw new AuthError("用户不存在", 404);
    }

    // 2. 软删除
    const now = new Date();
    const updated = await this.fastify.prisma.user.update({
      where: { id: userId },
      data: { deleted_at: now }
    });

    // 3. 使 Token 失效 & 清理缓存
    const userIdStr = userId.toString();
    await Promise.all([
      this.fastify.redis.del(`${USER_ACCESS_PREFIX}${userId}`),
      this.cache.del(CacheKeys.userAuthProfile(userIdStr)),
      this.cache.del(CacheKeys.userProfile(userIdStr)),
      this.cache.del(CacheKeys.userRoles(userIdStr)),
      this.cache.delByPattern(CacheKeys.userListPrefix)
    ]);

    // 4. 记录审计日志
    createAuditLog(this.fastify, userId, "delete_account", "user", userId, {
      deletedAt: now.toISOString()
    }).catch(() => {});

    return { deletedAt: updated.deleted_at!.toISOString() };
  }

  // ============================================================
  //  Token 黑名单（修改密码 / 注销后供路由层使用）
  // ============================================================

  /**
   * 将 Token 加入黑名单（以 JTI 为 key，与 auth.service.ts 的 isTokenBlacklisted 保持一致）
   */
  async blacklistToken(token: string, expiresIn: number): Promise<void> {
    try {
      const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
      const jti = payload?.jti;
      if (jti) {
        await this.fastify.redis.set(`${JWT_BLACKLIST_PREFIX}${jti}`, "1", "EX", expiresIn);
      }
    } catch {
      // JWT 解码失败、格式错误时静默跳过，让 Token 自然过期
    }
  }
}
