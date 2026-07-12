/**
 * 管理员服务 — 用户 CRUD、封禁管理、系统配置管理
 */

import bcrypt from "bcrypt";
import type { FastifyInstance } from "fastify";
import type {
  CreateUserInput,
  UpdateUserInput,
  UserListQueryInput,
  UpdateSmtpConfigInput,
  BanUserInput
} from "../schemas/user.schemas.js";
import { AuthError, ValidationError, AppError } from "../../../utils/errors.js";
import { BizCode } from "../../../utils/response.js";
import { createCache, CacheKeys, CacheTTL } from "../../../utils/cache.js";
import type { CacheClient } from "../../../utils/cache.js";
import { createAuditLog } from "../../../utils/audit-log.js";
import { buildPagination, paginatedResult } from "../../../utils/pagination.js";
import { encrypt, decrypt, isEncrypted } from "../../../utils/crypto.js";
import { MessageHookService } from "../../message/message-hooks.service.js";

// ─── 常量 ────────────────────────────────────────────────────

/** 管理员创建用户时的默认密码（符合 passwordSchema：大写+小写+数字+≥8位） */
const DEFAULT_PASSWORD = "Aa123456";

// ─── 类型重导出（保持向后兼容） ──────────────────────────────

export type { CreateUserInput, UpdateUserInput };
export type UserListQuery = UserListQueryInput;

// ─── 封禁相关类型 ────────────────────────────────────────────

export interface BanUserResult {
  id: string;
  username: string;
  isBanned: boolean;
  banRemaining: number;
  bannedUntil: string;
}

export interface UnbanUserResult {
  id: string;
  username: string;
  isBanned: false;
}

// ─── 管理员服务类 ────────────────────────────────────────────

export class AdminService {
  private readonly cache: CacheClient;

  constructor(private readonly fastify: FastifyInstance) {
    this.cache = createCache(fastify);
  }

  // ============================================================
  //  权限校验
  // ============================================================

  /** 验证操作者是否为超级管理员（Cache-Aside，复用用户角色缓存） */
  async verifySuperAdmin(userId: bigint): Promise<void> {
    const roles = await this.cache.getOrSet<string[]>(
      CacheKeys.userRoles(userId.toString()),
      async () => {
        const userRoles = await this.fastify.prisma.userRole.findMany({
          where: { user_id: userId }
        });
        return userRoles.map(r => r.role_code);
      },
      CacheTTL.USER_ROLES
    );
    if (!roles.includes("super_admin")) {
      throw new AuthError("权限不足，需要超级管理员权限", 403);
    }
  }

  // ============================================================
  //  用户 CRUD
  // ============================================================

  /** 管理员创建用户 — 简化版：仅需 username + email，角色固定 user，密码默认 Aa123456 */
  async createUser(adminId: bigint, input: CreateUserInput) {
    await this.verifySuperAdmin(adminId);

    // 检查邮箱唯一性
    const existing = await this.fastify.prisma.user.findFirst({
      where: { email: input.email, deleted_at: null }
    });
    if (existing) {
      throw new AuthError("该邮箱已被注册", 409, BizCode.EMAIL_EXISTS);
    }

    const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);

    // 事务：user + role 原子写入，避免产生无角色的孤儿用户
    const user = await this.fastify.prisma.$transaction(async tx => {
      const newUser = await tx.user.create({
        data: {
          email: input.email,
          password_hash: passwordHash,
          username: input.username,
          role: "user",
          status: 1
        }
      });
      await tx.userRole.create({
        data: { user_id: newUser.id, role_code: "user" }
      });
      return newUser;
    });

    // 标记首次登录（password_updated_at NULL = 从未改密，login 时由 auth 模块强制要求修改）
    const userIdStr = user.id.toString();

    // 记录审计日志
    createAuditLog(this.fastify, adminId, "create_user", "user", user.id, {
      createdEmail: user.email,
      createdRole: "user"
    }).catch(() => {});

    return {
      id: userIdStr,
      email: user.email,
      username: user.username,
      role: "user",
      status: user.status,
      defaultPassword: DEFAULT_PASSWORD,
      requirePasswordChange: true
    };
  }

  /** 获取用户列表（不含软删除，含封禁状态） */
  async listUsers(query: UserListQuery) {
    const where: Record<string, unknown> = { deleted_at: null };
    if (query.email) {
      where.email = { contains: query.email };
    }
    if (query.status !== undefined) {
      where.status = query.status;
    }

    const { skip, take } = buildPagination({ page: query.page, pageSize: query.limit });

    const [items, total] = await Promise.all([
      this.fastify.prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          username: true,
          role: true,
          status: true,
          created_at: true,
          last_login_at: true
        },
        orderBy: { created_at: "desc" },
        skip,
        take
      }),
      this.fastify.prisma.user.count({ where })
    ]);

    // 批量查询 Redis 封禁状态
    const banStatusMap = await this.fetchBanStatusBatch(items.map(u => u.id.toString()));

    // 收集 Redis 已过期但 DB status 仍为 0 的用户（封禁已到期），异步恢复
    const expiredBanIds: bigint[] = [];
    const expiredBanIdSet = new Set<string>();
    for (const u of items) {
      const idStr = u.id.toString();
      const banInfo = banStatusMap.get(idStr);
      if (!banInfo?.isBanned && u.status === 0) {
        expiredBanIds.push(u.id);
        expiredBanIdSet.add(idStr);
      }
    }
    if (expiredBanIds.length > 0) {
      this.fastify.prisma.user
        .updateMany({
          where: { id: { in: expiredBanIds }, status: 0 },
          data: { status: 1 }
        })
        .then(r => {
          this.fastify.log.info({ count: r.count }, "封禁到期批量恢复 DB status=1");
        })
        .catch(() => {});
    }

    // 按封禁状态过滤（应用层过滤，因为封禁数据在 Redis 中）
    let enrichedItems = items.map(u => {
      const idStr = u.id.toString();
      const banInfo = banStatusMap.get(idStr) ?? { isBanned: false, banRemaining: null };
      // 封禁已到期：修正内存中的 status 为 1，避免 UI 显示"已禁用"
      const actualStatus = expiredBanIdSet.has(idStr) ? 1 : u.status;
      return {
        ...u,
        id: idStr,
        status: actualStatus,
        isBanned: banInfo.isBanned,
        banRemaining: banInfo.banRemaining,
        isDeleted: false
      };
    });

    // 如果请求按封禁状态筛选
    if (query.ban_status === "banned") {
      enrichedItems = enrichedItems.filter(item => item.isBanned);
    } else if (query.ban_status === "active") {
      enrichedItems = enrichedItems.filter(item => !item.isBanned);
    }

    return paginatedResult(enrichedItems, query.ban_status ? enrichedItems.length : total, {
      page: query.page,
      pageSize: query.limit
    });
  }

  /** 更新用户信息 */
  async updateUser(adminId: bigint, targetId: bigint, input: UpdateUserInput) {
    await this.verifySuperAdmin(adminId);

    const target = await this.fastify.prisma.user.findFirst({
      where: { id: targetId, deleted_at: null }
    });
    if (!target) {
      throw new AuthError("用户不存在", 404);
    }

    const data: Record<string, unknown> = {};
    if (input.username !== undefined) data.username = input.username;
    if (input.status !== undefined) data.status = input.status;

    // 角色变更保护：不允许将唯一超级管理员降级
    if (input.role !== undefined) {
      if (input.role !== "admin") {
        // 检查目标用户是否确实是超级管理员（通过 user_roles 表精准判断）
        const isSuperAdmin = await this.fastify.prisma.userRole.findFirst({
          where: { user_id: targetId, role_code: "super_admin" }
        });
        if (isSuperAdmin) {
          const superAdminCount = await this.fastify.prisma.userRole.count({
            where: { role_code: "super_admin" }
          });
          if (superAdminCount <= 1) {
            throw new ValidationError("不能移除唯一的超级管理员", "");
          }
        }
      }
      data.role = input.role === "admin" ? "admin" : "user";
    }

    const user = await this.fastify.prisma.user.update({
      where: { id: targetId },
      data
    });

    // 若角色变更，同步更新 user_roles 并失效相关缓存
    if (input.role !== undefined) {
      const newRoleCode = input.role === "admin" ? "super_admin" : "user";
      await this.fastify.prisma.$transaction([
        this.fastify.prisma.userRole.deleteMany({ where: { user_id: targetId } }),
        this.fastify.prisma.userRole.create({ data: { user_id: targetId, role_code: newRoleCode } })
      ]);
    }

    // 失效缓存：用户角色、认证档案、用户列表
    const targetIdStr = targetId.toString();
    await Promise.all([
      this.cache.del(CacheKeys.userRoles(targetIdStr)),
      this.cache.del(CacheKeys.userAuthProfile(targetIdStr)),
      this.cache.delByPattern(`${CacheKeys.userListPrefix}*`)
    ]);

    // 记录审计日志
    createAuditLog(this.fastify, adminId, "update_user", "user", targetId, { changes: input }).catch(() => {});

    return { id: user.id.toString(), email: user.email, username: user.username, role: user.role, status: user.status };
  }

  /** 软删除用户 */
  async deleteUser(adminId: bigint, targetId: bigint) {
    await this.verifySuperAdmin(adminId);

    // 不能删除自己
    if (adminId === targetId) {
      throw new ValidationError("不能删除自己的账户");
    }

    const target = await this.fastify.prisma.user.findFirst({
      where: { id: targetId, deleted_at: null }
    });
    if (!target) {
      throw new AuthError("用户不存在", 404);
    }

    // 不能删除超级管理员
    const isSuperAdmin = await this.fastify.prisma.userRole.findFirst({
      where: { user_id: targetId, role_code: "super_admin" }
    });
    if (isSuperAdmin) {
      throw new AppError("不能删除超级管理员", 403, BizCode.CANNOT_DELETE_SUPER_ADMIN);
    }

    const now = new Date();

    // 软删除 & 记录操作人 & 失效缓存
    const targetIdStr = targetId.toString();
    await Promise.all([
      this.fastify.prisma.user.update({
        where: { id: targetId },
        data: {
          deleted_at: now,
          deleted_by: adminId
        }
      }),
      this.cache.del(CacheKeys.userRoles(targetIdStr)),
      this.cache.del(CacheKeys.userAuthProfile(targetIdStr)),
      this.cache.delByPattern(`${CacheKeys.userListPrefix}*`)
    ]);

    // 记录审计日志
    createAuditLog(this.fastify, adminId, "delete_user", "user", targetId, {
      deletedEmail: target.email
    }).catch(() => {});

    return {
      id: targetIdStr,
      deleted: true,
      deletedBy: adminId.toString(),
      deletedAt: now.toISOString()
    };
  }

  // ============================================================
  //  封禁管理
  // ============================================================

  /** 封禁用户 — Redis 黑名单 + DB status=0 */
  async banUser(adminId: bigint, targetId: bigint, input: BanUserInput): Promise<BanUserResult> {
    await this.verifySuperAdmin(adminId);

    // 不能封禁自己
    if (adminId === targetId) {
      throw new ValidationError("不能封禁自己的账户");
    }

    const target = await this.fastify.prisma.user.findFirst({
      where: { id: targetId, deleted_at: null }
    });
    if (!target) {
      throw new AuthError("用户不存在", 404);
    }

    // 不能封禁超级管理员
    const isSuperAdmin = await this.fastify.prisma.userRole.findFirst({
      where: { user_id: targetId, role_code: "super_admin" }
    });
    if (isSuperAdmin) {
      throw new AppError("不能封禁超级管理员", 403, BizCode.CANNOT_BAN_SUPER_ADMIN);
    }

    const targetIdStr = targetId.toString();
    const banSeconds = input.ban_duration * 60; // 分钟 → 秒
    const bannedUntil = new Date(Date.now() + banSeconds * 1000);

    // 1. 先更新 DB status（权威数据源），失效缓存
    await Promise.all([
      this.fastify.prisma.user.update({
        where: { id: targetId },
        data: { status: 0 }
      }),
      this.cache.del(CacheKeys.userRoles(targetIdStr)),
      this.cache.del(CacheKeys.userAuthProfile(targetIdStr)),
      this.cache.delByPattern(`${CacheKeys.userListPrefix}*`)
    ]);

    // 2. Redis 黑名单写入（best-effort，失败不影响 DB 状态）
    try {
      await this.fastify.redis.set(`${CacheKeys.userBanStatus(targetIdStr)}`, "banned", "EX", banSeconds);
    } catch {
      this.fastify.log.warn({ userId: targetIdStr }, "封禁 Redis 写入失败，依赖 DB status=0 兜底");
    }

    // 记录审计日志
    createAuditLog(this.fastify, adminId, "ban_user", "user", targetId, {
      banDurationMinutes: input.ban_duration,
      reason: input.reason ?? null,
      bannedUntil: bannedUntil.toISOString()
    }).catch(() => {});

    // 触发封禁通知（消息系统，失败不影响封禁主流程）
    new MessageHookService(this.fastify)
      .onUserBanned(targetId, input.reason ?? "违反平台规定", bannedUntil)
      .catch(() => {});

    return {
      id: targetIdStr,
      username: target.username,
      isBanned: true,
      banRemaining: banSeconds,
      bannedUntil: bannedUntil.toISOString()
    };
  }

  /** 解除封禁 — 清除 Redis 黑名单 + 恢复 DB status */
  async unbanUser(adminId: bigint, targetId: bigint): Promise<UnbanUserResult> {
    await this.verifySuperAdmin(adminId);

    const target = await this.fastify.prisma.user.findFirst({
      where: { id: targetId, deleted_at: null }
    });
    if (!target) {
      throw new AuthError("用户不存在", 404);
    }

    const targetIdStr = targetId.toString();
    const banKey = `${CacheKeys.userBanStatus(targetIdStr)}`;

    // 1. 先恢复 DB status，失效缓存
    await Promise.all([
      this.fastify.prisma.user.update({
        where: { id: targetId },
        data: { status: 1 }
      }),
      this.cache.del(CacheKeys.userRoles(targetIdStr)),
      this.cache.del(CacheKeys.userAuthProfile(targetIdStr)),
      this.cache.delByPattern(`${CacheKeys.userListPrefix}*`)
    ]);

    // 2. Redis 黑名单清除（best-effort，失败不影响 DB 状态）
    try {
      await this.fastify.redis.del(banKey);
    } catch {
      this.fastify.log.warn({ userId: targetIdStr }, "解封 Redis 清除失败，依赖 DB status=1 兜底");
    }

    // 记录审计日志
    createAuditLog(this.fastify, adminId, "unban_user", "user", targetId, {}).catch(() => {});

    // 触发解封通知（消息系统，失败不影响解封主流程）
    new MessageHookService(this.fastify).onUserUnbanned(targetId).catch(() => {});

    return {
      id: targetIdStr,
      username: target.username,
      isBanned: false
    };
  }

  // ============================================================
  //  系统配置
  // ============================================================

  /** 获取所有系统配置 — 敏感字段自动脱敏/解密 */
  async getConfig() {
    const configs = await this.fastify.prisma.systemConfig.findMany({
      orderBy: { category: "asc" }
    });

    // 按分类组织，SMTP 密码自动解密，AI API Key 脱敏
    const grouped: Record<string, Record<string, string>> = {};
    for (const c of configs) {
      if (!grouped[c.category]) grouped[c.category] = {};
      let value = c.value ?? "";

      if (c.key === "smtp_password" && isEncrypted(value)) {
        // SMTP 密码解密
        value = decrypt(value);
      } else if (c.key === "ai_api_key") {
        // AI API Key 脱敏：仅显示 sk-****末尾4位
        try {
          const plainKey = isEncrypted(value) ? decrypt(value) : value;
          value = plainKey.length > 10 ? `${plainKey.slice(0, 5)}****${plainKey.slice(-4)}` : "sk-****";
        } catch {
          value = "***解密失败***";
        }
      } else if (value.length > 64) {
        // 其他长密文截断（如加密后的 SMTP 密码等）
        value = value.substring(0, 32) + "…";
      }

      grouped[c.category][c.key] = value;
    }

    return grouped;
  }

  /** 更新 SMTP 配置 */
  async updateSmtpConfig(adminId: bigint, smtpConfig: UpdateSmtpConfigInput) {
    await this.verifySuperAdmin(adminId);

    const entries = [
      { key: "smtp_enabled", value: String(smtpConfig.enabled), description: "是否启用SMTP服务" },
      { key: "smtp_host", value: smtpConfig.host, description: "SMTP服务器地址" },
      { key: "smtp_port", value: String(smtpConfig.port), description: "SMTP端口" },
      { key: "smtp_username", value: smtpConfig.username, description: "SMTP用户名" },
      { key: "smtp_password", value: smtpConfig.password ? encrypt(smtpConfig.password) : "", description: "SMTP密码" },
      { key: "smtp_from_email", value: smtpConfig.fromEmail, description: "发件人邮箱" }
    ];

    // 批量 upsert
    await this.fastify.prisma.$transaction(
      entries.map(e =>
        this.fastify.prisma.systemConfig.upsert({
          where: { key: e.key },
          update: { value: e.value },
          create: { ...e, category: "smtp" }
        })
      )
    );

    // 失效配置缓存
    await Promise.all([this.cache.del(CacheKeys.smtpConfigured), this.cache.del(CacheKeys.registrationEnabled)]);

    // 记录审计日志
    createAuditLog(this.fastify, adminId, "update_smtp_config", "system_config", null, {
      enabled: smtpConfig.enabled,
      host: smtpConfig.host
    }).catch(() => {});

    return { updated: true };
  }

  // ============================================================
  //  Private — 工具
  // ============================================================

  /**
   * 批量查询 Redis 封禁状态
   *
   * 策略：
   *   - 使用 Pipeline 一次发送所有 EXISTS + TTL 命令 → 一次网络往返
   *   - Redis 不可用时返回空 Map（降级）
   */
  private async fetchBanStatusBatch(
    userIds: string[]
  ): Promise<Map<string, { isBanned: boolean; banRemaining: number | null }>> {
    const result = new Map<string, { isBanned: boolean; banRemaining: number | null }>();

    if (userIds.length === 0) return result;

    try {
      // 使用 pipeline 批量查询
      const pipeline = this.fastify.redis.pipeline();
      for (const uid of userIds) {
        pipeline.exists(CacheKeys.userBanStatus(uid));
      }
      for (const uid of userIds) {
        pipeline.ttl(CacheKeys.userBanStatus(uid));
      }

      const responses = await pipeline.exec();
      if (!responses) return result;

      // responses 结构：[exists0, exists1, ..., ttl0, ttl1, ...]
      const halfLen = userIds.length;
      for (let i = 0; i < halfLen; i++) {
        const existsReply = responses[i];
        const ttlReply = responses[i + halfLen];

        const isBanned = existsReply?.[1] === 1;
        // TTL: -1 = key 存在无过期, -2 = key 不存在, >0 = 剩余秒数
        const ttlVal = typeof ttlReply?.[1] === "number" ? (ttlReply[1] as number) : -2;
        result.set(userIds[i]!, {
          isBanned,
          banRemaining: ttlVal > 0 ? ttlVal : null
        });
      }
    } catch {
      // Redis 不可用时降级返回空 Map，不影响正常查询
      this.fastify.log.warn("批量查询封禁状态失败，降级返回空结果");
    }

    return result;
  }
}
