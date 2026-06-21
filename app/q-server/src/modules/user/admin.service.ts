/**
 * 管理员服务 — 用户 CRUD、系统配置管理
 */

import bcrypt from "bcrypt";
import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type {
  CreateUserInput,
  UpdateUserInput,
  UserListQueryInput,
  UpdateSmtpConfigInput
} from "./schemas/user.schemas.js";
import { AuthError, ValidationError } from "../../utils/errors.js";
import { BizCode } from "../../utils/response.js";
import { createCache, CacheKeys, CacheTTL } from "../../utils/cache.js";
import type { CacheClient } from "../../utils/cache.js";
import { createAuditLog } from "../../utils/audit-log.js";
import { buildPagination, paginatedResult } from "../../utils/pagination.js";
import { encrypt, decrypt, isEncrypted } from "../../utils/crypto.js";

// ─── 类型重导出（保持向后兼容） ──────────────────────────────

export type { CreateUserInput, UpdateUserInput };
export type UserListQuery = UserListQueryInput;

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

  /** 管理员创建用户 */
  async createUser(adminId: bigint, input: CreateUserInput) {
    await this.verifySuperAdmin(adminId);

    // 检查邮箱唯一性
    const existing = await this.fastify.prisma.user.findFirst({
      where: { email: input.email, deleted_at: null }
    });
    if (existing) {
      throw new AuthError("该邮箱已被注册", BizCode.EMAIL_EXISTS);
    }

    // 生成密码（未提供则随机生成12位）
    const password = input.password ?? this.generateRandomPassword(12);
    const passwordHash = await bcrypt.hash(password, 10);

    // 创建用户
    const user = await this.fastify.prisma.user.create({
      data: {
        email: input.email,
        password_hash: passwordHash,
        username: input.username,
        role: input.role === "admin" ? "admin" : "user",
        status: 1
      }
    });

    // 添加角色
    const roleCode = input.role === "admin" ? "super_admin" : "user";
    await this.fastify.prisma.userRole.create({
      data: { user_id: user.id, role_code: roleCode }
    });

    // 记录审计日志
    createAuditLog(this.fastify, adminId, "create_user", "user", user.id, {
      createdEmail: user.email,
      createdRole: input.role
    }).catch(() => {});

    return {
      id: user.id.toString(),
      email: user.email,
      username: user.username,
      role: input.role,
      status: user.status,
      passwordProvided: !!input.password,
      ...(input.password ? {} : { generatedPassword: password }) // 未提供密码时返回生成的密码
    };
  }

  /** 获取用户列表（不含软删除） */
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

    return paginatedResult(
      items.map(u => ({ ...u, id: u.id.toString() })),
      total,
      { page: query.page, pageSize: query.limit }
    );
  }

  /** 更新用户信息 */
  async updateUser(adminId: bigint, targetId: bigint, input: UpdateUserInput) {
    await this.verifySuperAdmin(adminId);

    // 检查用户是否存在
    const target = await this.fastify.prisma.user.findFirst({
      where: { id: targetId, deleted_at: null }
    });
    if (!target) {
      throw new AuthError("用户不存在", 404);
    }

    const data: Record<string, unknown> = {};
    if (input.username !== undefined) data.username = input.username;
    if (input.status !== undefined) data.status = input.status;
    if (input.role !== undefined) data.role = input.role === "admin" ? "admin" : "user";

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

    // 软删除 & 失效缓存
    const targetIdStr = targetId.toString();
    await Promise.all([
      this.fastify.prisma.user.update({
        where: { id: targetId },
        data: { deleted_at: new Date() }
      }),
      this.cache.del(CacheKeys.userRoles(targetIdStr)),
      this.cache.del(CacheKeys.userAuthProfile(targetIdStr)),
      this.cache.delByPattern(`${CacheKeys.userListPrefix}*`)
    ]);

    // 记录审计日志
    createAuditLog(this.fastify, adminId, "delete_user", "user", targetId, {
      deletedEmail: target.email
    }).catch(() => {});

    return { id: targetId.toString(), deleted: true };
  }

  // ============================================================
  //  系统配置
  // ============================================================

  /** 获取所有系统配置 — 敏感字段自动解密 */
  async getConfig() {
    const configs = await this.fastify.prisma.systemConfig.findMany({
      orderBy: { category: "asc" }
    });

    // 按分类组织，SMTP 密码自动解密
    const grouped: Record<string, Record<string, string>> = {};
    for (const c of configs) {
      if (!grouped[c.category]) grouped[c.category] = {};
      const value = c.value ?? "";
      // 自动解密 SMTP 密码（通过 ENC: 前缀判断，替代长度启发式）
      grouped[c.category][c.key] = c.key === "smtp_password" && isEncrypted(value) ? decrypt(value) : value;
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

  /** 生成安全随机密码 — 使用 crypto.randomBytes */
  private generateRandomPassword(length: number): string {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$";
    const bytes = randomBytes(length);
    let result = "";
    for (let i = 0; i < length; i++) {
      result += chars.charAt(bytes[i]! % chars.length);
    }
    return result;
  }
}
