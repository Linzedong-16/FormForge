/**
 * 认证服务 — 处理登录、注册、Token 管理、验证码等核心业务逻辑
 */

import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { randomUUID, randomInt } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { AuthError } from "../../utils/errors.js";
import { BizCode } from "../../utils/response.js";
import { createCache, CacheKeys, CacheTTL } from "../../utils/cache.js";
import type { CacheClient } from "../../utils/cache.js";
import { createAuditLog } from "../../utils/audit-log.js";

// ─── Redis Key 常量 ──────────────────────────────────────────

/** 验证码 Key 前缀 */
const VERIFY_CODE_PREFIX = "auth:verify:";
/** 登录失败计数 Key 前缀 */
const LOGIN_FAIL_PREFIX = "auth:login_fail:";
/** 登录锁定 Key 前缀 */
const LOGIN_LOCK_PREFIX = "auth:login_lock:";
/** 发送频率限制 Key 前缀 */
const SEND_RATE_PREFIX = "auth:send_rate:";
/** JWT 黑名单 Key 前缀 */
const JWT_BLACKLIST_PREFIX = "auth:jwt:blacklist:";
/** 用户当前 Access Token JTI（用于 Refresh 时使旧 Token 失效） */
const USER_ACCESS_PREFIX = "auth:user:access:";

/** 登录失败最大次数 */
const MAX_LOGIN_FAILS = 5;
/** 登录失败记录过期时间（秒） */
const LOGIN_FAIL_TTL = 900;
/** 账户锁定时间（秒） */
const LOGIN_LOCK_TTL = 1800;
/** 验证码有效期（秒） */
const VERIFY_CODE_TTL = 300;
/** 发送频率限制窗口（秒） */
const SEND_RATE_TTL = 60;
/** 每分钟最大发送次数 */
const SEND_RATE_MAX = 3;

// ─── 工具函数 ────────────────────────────────────────────────

/** 邮箱脱敏：前2字符 + *** + @domain */
function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  const masked = local.length <= 2 ? local + "***" : local.slice(0, 2) + "***";
  return `${masked}@${domain}`;
}

// ─── 类型定义 ────────────────────────────────────────────────

/** 登录响应 */
export interface LoginResult {
  token: string;
  tokenType: string;
  expiresIn: number;
  refreshToken: string;
  refreshExpiresIn: number;
  user: { id: string; email: string; username: string; role: string };
}

/** 系统状态 */
export interface SystemStatus {
  initialized: boolean;
  registrationEnabled: boolean;
  registrationMode: "email_verify" | "admin_only";
  smtpConfigured: boolean;
}

/** JWT Payload */
interface JwtPayload {
  sub: string;
  email?: string;
  role?: string;
  type: "access" | "refresh";
  jti: string;
  iat?: number;
  exp?: number;
}

// ─── 认证服务类 ──────────────────────────────────────────────

export class AuthService {
  private readonly jwtSecret: string;
  private readonly accessExpire: number;
  private readonly refreshExpire: number;
  private readonly cache: CacheClient;

  constructor(private readonly fastify: FastifyInstance) {
    this.jwtSecret = process.env.JWT_SECRET ?? "dev-secret-change-in-production";
    this.accessExpire = Number(process.env.JWT_ACCESS_EXPIRE ?? 3600);
    this.refreshExpire = Number(process.env.JWT_REFRESH_EXPIRE ?? 604800);
    this.cache = createCache(fastify);
  }

  // ============================================================
  //  系统状态
  // ============================================================

  /** 获取系统状态（初始化状态、注册开关、SMTP 配置） */
  async getSystemStatus(): Promise<SystemStatus> {
    const [initialized, registrationEnabled, smtpConfigured] = await Promise.all([
      this.isSystemInitialized(),
      this.isRegistrationEnabled(),
      this.isSmtpConfigured()
    ]);

    return {
      initialized,
      registrationEnabled,
      registrationMode: smtpConfigured ? "email_verify" : "admin_only",
      smtpConfigured
    };
  }

  /** 系统是否已初始化（存在超级管理员）— Cache-Aside */
  private async isSystemInitialized(): Promise<boolean> {
    return this.cache.getOrSet(
      CacheKeys.systemInitialized,
      async () => {
        const count = await this.fastify.prisma.userRole.count({
          where: { role_code: "super_admin" }
        });
        return count > 0;
      },
      CacheTTL.SYSTEM_STATUS
    );
  }

  /** 注册功能是否开放 — Cache-Aside */
  private async isRegistrationEnabled(): Promise<boolean> {
    return this.cache.getOrSet(
      CacheKeys.registrationEnabled,
      async () => {
        const config = await this.fastify.prisma.systemConfig.findUnique({
          where: { key: "registration_enabled" }
        });
        return config?.value === "true";
      },
      CacheTTL.SYSTEM_STATUS
    );
  }

  /** SMTP 是否已配置 — Cache-Aside */
  private async isSmtpConfigured(): Promise<boolean> {
    return this.cache.getOrSet(
      CacheKeys.smtpConfigured,
      async () => {
        const config = await this.fastify.prisma.systemConfig.findUnique({
          where: { key: "smtp_enabled" }
        });
        return config?.value === "true";
      },
      CacheTTL.SYSTEM_STATUS
    );
  }

  // ============================================================
  //  登录
  // ============================================================

  /** 用户登录 */
  async login(email: string, password: string): Promise<LoginResult> {
    // 1. 检查账户是否被锁定
    if (await this.isAccountLocked(email)) {
      throw new AuthError("登录失败次数过多，请30分钟后再试", BizCode.ACCOUNT_LOCKED);
    }

    // 2. 查询用户
    const user = await this.fastify.prisma.user.findFirst({
      where: { email, deleted_at: null }
    });
    if (!user) {
      await this.recordLoginFail(email);
      throw new AuthError("邮箱或密码错误", 401);
    }

    // 3. 验证密码
    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      await this.recordLoginFail(email);
      const failCount = await this.getLoginFailCount(email);
      const remainAttempts = Math.max(0, MAX_LOGIN_FAILS - failCount);
      throw new AuthError("邮箱或密码错误", 401, { remainAttempts });
    }

    // 4. 检查账户状态
    if (user.status === 0) {
      throw new AuthError("账户已被禁用，请联系管理员", BizCode.ACCOUNT_DISABLED);
    }

    // 5. 登录成功 — 清除失败记录 & 更新登录时间
    await Promise.all([
      this.clearLoginFail(email),
      this.fastify.prisma.user.update({
        where: { id: user.id },
        data: { last_login_at: new Date() }
      })
    ]);

    // 6. 获取用户角色
    const roles = await this.getUserRoles(user.id);
    const role = roles.includes("super_admin") ? "super_admin" : "user";

    // 7. 生成 Token
    const tokens = await this.generateTokens({ id: user.id.toString(), email: user.email, role });

    // 8. 记录登录审计日志
    createAuditLog(this.fastify, user.id, "login", "user", user.id, {
      loginTime: new Date().toISOString()
    }).catch(() => {});

    return {
      ...tokens,
      user: {
        id: user.id.toString(),
        email: user.email,
        username: user.username,
        role
      }
    };
  }

  // ============================================================
  //  注册（初始化模式 — 首个超级管理员）
  // ============================================================

  /** 初始化注册（用户表为空时，第一个注册者成为超级管理员） */
  async registerAsSuperAdmin(email: string, password: string, username?: string) {
    // 1. 检查系统是否已初始化
    if (await this.isSystemInitialized()) {
      throw new AuthError("系统已初始化，请使用邮箱验证注册或联系管理员", 403);
    }

    // 2. 检查邮箱唯一性
    const existing = await this.fastify.prisma.user.findFirst({
      where: { email, deleted_at: null }
    });
    if (existing) {
      throw new AuthError("该邮箱已被注册", BizCode.EMAIL_EXISTS);
    }

    // 3. 创建用户
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await this.fastify.prisma.user.create({
      data: {
        email,
        password_hash: passwordHash,
        username: username ?? email.split("@")[0],
        role: "admin",
        status: 1
      }
    });

    // 4. 添加超级管理员角色
    await this.fastify.prisma.userRole.create({
      data: { user_id: user.id, role_code: "super_admin" }
    });

    // 5. 生成 Token
    const tokens = await this.generateTokens({
      id: user.id.toString(),
      email: user.email,
      role: "super_admin"
    });

    // 6. 记录审计日志 & 失效系统状态缓存
    await Promise.all([
      createAuditLog(this.fastify, user.id, "register", "user", user.id, {
        action: "initial_registration",
        isFirstUser: true
      }),
      this.cache.del(CacheKeys.systemInitialized)
    ]);

    return {
      ...tokens,
      user: {
        id: user.id.toString(),
        email: user.email,
        username: user.username,
        role: "super_admin"
      },
      isFirstUser: true
    };
  }

  // ============================================================
  //  邮箱验证注册
  // ============================================================

  /** 发送验证码（注册 / 重置密码 / 绑定邮箱 / 修改密码） */
  async sendCode(email: string, type: "register" | "reset_password" | "bind_email" | "change_password") {
    // 1. 检查 SMTP 是否配置
    if (!(await this.isSmtpConfigured())) {
      throw new AuthError("邮件服务暂未配置，请联系管理员", BizCode.SMTP_NOT_CONFIGURED);
    }

    // 2. 根据类型做前置校验
    if (type === "register") {
      if (!(await this.isRegistrationEnabled())) {
        throw new AuthError("暂未开放注册，请联系管理员", BizCode.REGISTRATION_CLOSED);
      }
      const existing = await this.fastify.prisma.user.findFirst({
        where: { email, deleted_at: null }
      });
      if (existing) {
        throw new AuthError("该邮箱已被注册", BizCode.EMAIL_EXISTS);
      }
    }

    if (type === "reset_password") {
      const existing = await this.fastify.prisma.user.findFirst({
        where: { email, deleted_at: null }
      });
      if (!existing) {
        throw new AuthError("该邮箱未注册", BizCode.EMAIL_NOT_EXISTS);
      }
    }

    // 3. 检查发送频率
    if (!(await this.checkSendRate(email))) {
      throw new AuthError("发送过于频繁，请1分钟后再试", 429);
    }

    // 4. 生成验证码并存入 Redis
    const code = this.generateVerificationCode();
    // ioredis v5: set(key, value, "EX", seconds) 替代 setEx
    await this.fastify.redis.set(
      `${VERIFY_CODE_PREFIX}${email}`,
      JSON.stringify({ code, type }),
      "EX",
      VERIFY_CODE_TTL
    );

    // 5. 根据类型生成邮件主题
    const subjectMap: Record<string, string> = {
      register: "Q问卷 - 注册验证码",
      reset_password: "Q问卷 - 密码重置验证码",
      bind_email: "Q问卷 - 邮箱绑定验证码",
      change_password: "Q问卷 - 修改密码验证码"
    };

    // 6. 异步发送邮件（通过 RabbitMQ 队列，不阻塞响应）
    if (this.fastify.amqp) {
      try {
        this.fastify.amqp.channel.sendToQueue(
          "mail:send",
          Buffer.from(
            JSON.stringify({
              to: email,
              subject: subjectMap[type] ?? "Q问卷 - 验证码",
              template: "verification-code",
              data: { code, expiresMinutes: 5 }
            })
          )
        );
      } catch {
        // 邮件发送失败不影响验证码存储，仅记录日志
        this.fastify.log.warn(`邮件队列发送失败: ${maskEmail(email)}`);
      }
    }

    return { expireSeconds: VERIFY_CODE_TTL };
  }

  /** 密码重置 */
  async resetPassword(email: string, code: string, newPassword: string): Promise<void> {
    // 1. 从 Redis 取出验证码
    const stored = await this.fastify.redis.get(`${VERIFY_CODE_PREFIX}${email}`);
    if (!stored) {
      throw new AuthError("验证码已过期，请重新获取", BizCode.VERIFY_CODE_EXPIRED);
    }

    let storedCode: string;
    let type: string;
    try {
      const parsed = JSON.parse(stored);
      storedCode = parsed.code;
      type = parsed.type;
    } catch {
      throw new AuthError("验证码无效，请重新获取", BizCode.VERIFY_CODE_INVALID);
    }
    if (type !== "reset_password" || storedCode !== code) {
      throw new AuthError("验证码错误", BizCode.VERIFY_CODE_INVALID);
    }

    // 2. 删除已使用的验证码
    await this.fastify.redis.del(`${VERIFY_CODE_PREFIX}${email}`);

    // 3. 查找用户
    const user = await this.fastify.prisma.user.findFirst({
      where: { email, deleted_at: null }
    });
    if (!user) {
      throw new AuthError("用户不存在", BizCode.EMAIL_NOT_EXISTS);
    }

    // 4. 更新密码
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.fastify.prisma.user.update({
      where: { id: user.id },
      data: { password_hash: passwordHash }
    });

    // 5. 使该用户所有旧 Token 失效 & 清除认证缓存
    await Promise.all([
      this.fastify.redis.del(`${USER_ACCESS_PREFIX}${user.id}`),
      this.cache.del(CacheKeys.userAuthProfile(user.id.toString()))
    ]);

    // 6. 记录审计日志
    createAuditLog(this.fastify, user.id, "reset_password", "user", user.id).catch(() => {});
  }

  /** 验证邮箱并完成注册 */
  async verifyAndRegister(email: string, code: string, password: string, username: string) {
    // 1. 从 Redis 取出验证码
    const stored = await this.fastify.redis.get(`${VERIFY_CODE_PREFIX}${email}`);
    if (!stored) {
      throw new AuthError("验证码已过期，请重新获取", BizCode.VERIFY_CODE_EXPIRED);
    }

    let storedCode2: string;
    let type2: string;
    try {
      const parsed = JSON.parse(stored);
      storedCode2 = parsed.code;
      type2 = parsed.type;
    } catch {
      throw new AuthError("验证码无效，请重新获取", BizCode.VERIFY_CODE_INVALID);
    }
    if (type2 !== "register") {
      throw new AuthError("验证码类型错误", BizCode.VERIFY_CODE_INVALID);
    }
    if (storedCode2 !== code) {
      throw new AuthError("验证码错误", BizCode.VERIFY_CODE_INVALID);
    }

    // 2. 删除已使用的验证码
    await this.fastify.redis.del(`${VERIFY_CODE_PREFIX}${email}`);

    // 3. 创建用户
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await this.fastify.prisma.user.create({
      data: {
        email,
        password_hash: passwordHash,
        username: username ?? email.split("@")[0],
        role: "user",
        status: 1
      }
    });

    // 4. 添加普通用户角色
    await this.fastify.prisma.userRole.create({
      data: { user_id: user.id, role_code: "user" }
    });

    // 5. 生成 Token
    const tokens = await this.generateTokens({
      id: user.id.toString(),
      email: user.email,
      role: "user"
    });

    // 6. 记录审计日志
    createAuditLog(this.fastify, user.id, "register", "user", user.id, {
      action: "email_verification_register"
    }).catch(() => {});

    return {
      ...tokens,
      user: {
        id: user.id.toString(),
        email: user.email,
        username: user.username,
        role: "user"
      }
    };
  }

  // ============================================================
  //  Token 管理
  // ============================================================

  /** 刷新 Access Token */
  async refreshToken(refreshToken: string): Promise<LoginResult> {
    let decoded: JwtPayload;
    try {
      decoded = jwt.verify(refreshToken, this.jwtSecret) as JwtPayload;
    } catch {
      throw new AuthError("Refresh Token 无效或已过期", 401);
    }

    if (decoded.type !== "refresh") {
      throw new AuthError("无效的 Token 类型", 401);
    }

    // 查询用户
    const user = await this.fastify.prisma.user.findFirst({
      where: { id: BigInt(decoded.sub), deleted_at: null }
    });
    if (!user || user.status === 0) {
      throw new AuthError("用户不存在或已被禁用", 401);
    }

    // 将旧 Refresh Token 加入黑名单
    await this.blacklistToken(refreshToken);

    // 将旧 Access Token 加入黑名单（精准失效）
    const oldJti = await this.fastify.redis.get(`${USER_ACCESS_PREFIX}${decoded.sub}`);
    if (oldJti) {
      await this.blacklistTokenByJti(oldJti, this.accessExpire);
    }

    // 生成新 Token（generateTokens 内部会更新 USER_ACCESS_PREFIX）
    const roles = await this.getUserRoles(user.id);
    const role = roles.includes("super_admin") ? "super_admin" : "user";
    const tokens = await this.generateTokens({ id: user.id.toString(), email: user.email, role });

    return {
      ...tokens,
      user: {
        id: user.id.toString(),
        email: user.email,
        username: user.username,
        role
      }
    };
  }

  /** 验证 Access Token，返回用户信息 — 用户档案查 Redis 缓存 */
  async verifyToken(token: string): Promise<{ userId: bigint; email: string; role: string }> {
    let decoded: JwtPayload;
    try {
      decoded = jwt.verify(token, this.jwtSecret) as JwtPayload;
    } catch {
      throw new AuthError("Token 无效或已过期", 401);
    }

    if (decoded.type !== "access") {
      throw new AuthError("无效的 Token 类型", 401);
    }

    // 检查黑名单
    if (await this.isTokenBlacklisted(decoded.jti)) {
      throw new AuthError("Token 已失效", 401);
    }

    // 查用户档案（Cache-Aside getOrSet，避免并发重复查 DB）
    interface AuthProfile {
      userId: string;
      email: string;
      role: string;
      status: number;
    }
    const profile = await this.cache.getOrSet<AuthProfile>(
      CacheKeys.userAuthProfile(decoded.sub),
      async () => {
        const user = await this.fastify.prisma.user.findFirst({
          where: { id: BigInt(decoded.sub), deleted_at: null },
          select: { id: true, email: true, status: true }
        });
        if (!user || user.status === 0) {
          throw new AuthError("用户不存在或已被禁用", 401);
        }
        return {
          userId: user.id.toString(),
          email: user.email,
          role: decoded.role ?? "user",
          status: user.status
        };
      },
      CacheTTL.USER_AUTH_PROFILE
    );

    return {
      userId: BigInt(profile.userId),
      email: profile.email,
      role: profile.role
    };
  }

  /** 登出 — 将 Access Token 加入黑名单 */
  async logout(token: string): Promise<void> {
    await this.blacklistToken(token);
  }

  // ============================================================
  //  Private — Token 生成
  // ============================================================

  /** 生成 Access Token + Refresh Token */
  private async generateTokens(user: { id: string; email: string; role: string }) {
    const accessJti = randomUUID();

    const accessToken = jwt.sign(
      { sub: user.id, email: user.email, role: user.role, type: "access", jti: accessJti },
      this.jwtSecret,
      { expiresIn: this.accessExpire }
    );

    const refreshToken = jwt.sign({ sub: user.id, type: "refresh", jti: randomUUID() }, this.jwtSecret, {
      expiresIn: this.refreshExpire
    });

    // 记录当前 Access Token JTI，供 Refresh 时精准黑名单旧 Token
    await this.fastify.redis.set(`${USER_ACCESS_PREFIX}${user.id}`, accessJti, "EX", this.accessExpire);

    return {
      token: accessToken,
      tokenType: "Bearer",
      expiresIn: this.accessExpire,
      refreshToken,
      refreshExpiresIn: this.refreshExpire,
      accessJti
    };
  }

  /** 将 Token 加入黑名单 */
  private async blacklistToken(token: string): Promise<void> {
    try {
      const decoded = jwt.decode(token) as JwtPayload | null;
      if (decoded?.exp && decoded?.jti) {
        const ttl = decoded.exp - Math.floor(Date.now() / 1000);
        if (ttl > 0) {
          await this.fastify.redis.set(`${JWT_BLACKLIST_PREFIX}${decoded.jti}`, "1", "EX", ttl);
        }
      }
    } catch {
      // 解码失败忽略
    }
  }

  /** 通过 JTI 将 Token 加入黑名单（用于 Refresh 时精准失效旧 Access Token） */
  private async blacklistTokenByJti(jti: string, ttlSeconds: number): Promise<void> {
    try {
      if (ttlSeconds > 0) {
        await this.fastify.redis.set(`${JWT_BLACKLIST_PREFIX}${jti}`, "1", "EX", ttlSeconds);
      }
    } catch {
      // 忽略
    }
  }

  /** 检查 Token 是否在黑名单 */
  private async isTokenBlacklisted(jti: string): Promise<boolean> {
    const exists = await this.fastify.redis.exists(`${JWT_BLACKLIST_PREFIX}${jti}`);
    return exists === 1;
  }

  // ============================================================
  //  Private — 登录安全
  // ============================================================

  /** 记录登录失败（Lua 脚本保证原子性，避免并发竞态） */
  private async recordLoginFail(email: string): Promise<number> {
    const failKey = `${LOGIN_FAIL_PREFIX}${email}`;
    const lockKey = `${LOGIN_LOCK_PREFIX}${email}`;

    // Lua: 原子 incr + expire + 锁定判定
    const script = `
      local count = redis.call('incr', KEYS[1])
      if count == 1 then
        redis.call('expire', KEYS[1], tonumber(ARGV[1]))
      end
      if count >= tonumber(ARGV[2]) then
        redis.call('set', KEYS[2], ARGV[3], 'ex', tonumber(ARGV[4]))
      end
      return count
    `;

    const count = (await this.fastify.redis.eval(
      script,
      2,
      failKey,
      lockKey,
      LOGIN_FAIL_TTL,
      MAX_LOGIN_FAILS,
      String(Date.now()),
      LOGIN_LOCK_TTL
    )) as number;

    return count;
  }

  /** 获取登录失败次数 */
  private async getLoginFailCount(email: string): Promise<number> {
    const val = await this.fastify.redis.get(`${LOGIN_FAIL_PREFIX}${email}`);
    return parseInt(val ?? "0", 10);
  }

  /** 检查账户是否被锁定 */
  private async isAccountLocked(email: string): Promise<boolean> {
    const exists = await this.fastify.redis.exists(`${LOGIN_LOCK_PREFIX}${email}`);
    return exists === 1;
  }

  /** 清除登录失败记录 */
  private async clearLoginFail(email: string): Promise<void> {
    await Promise.all([
      this.fastify.redis.del(`${LOGIN_FAIL_PREFIX}${email}`),
      this.fastify.redis.del(`${LOGIN_LOCK_PREFIX}${email}`)
    ]);
  }

  // ============================================================
  //  Private — 发送频率
  // ============================================================

  /** 检查发送频率（同一邮箱1分钟最多3次）— 使用 Lua 脚本保证原子性 */
  private async checkSendRate(email: string): Promise<boolean> {
    const key = `${SEND_RATE_PREFIX}${email}`;
    // Lua 脚本：原子地检查并递增计数器
    const script = `
      local count = redis.call("GET", KEYS[1])
      if not count then
        redis.call("SET", KEYS[1], "1", "EX", ARGV[1])
        return 1
      end
      if tonumber(count) >= tonumber(ARGV[2]) then
        return 0
      end
      redis.call("INCR", KEYS[1])
      return 1
    `;
    const result = await this.fastify.redis.eval(script, 1, key, SEND_RATE_TTL, SEND_RATE_MAX);
    return result === 1;
  }

  // ============================================================
  //  Private — 工具方法
  // ============================================================

  /** 获取用户角色列表 — Cache-Aside（10min TTL，角色极少变更） */
  private async getUserRoles(userId: bigint): Promise<string[]> {
    return this.cache.getOrSet(
      CacheKeys.userRoles(userId.toString()),
      async () => {
        const roles = await this.fastify.prisma.userRole.findMany({
          where: { user_id: userId },
          select: { role_code: true }
        });
        return roles.map(r => r.role_code);
      },
      CacheTTL.USER_ROLES
    );
  }

  /** 生成6位数字验证码 — 使用加密安全随机数 */
  private generateVerificationCode(): string {
    return randomInt(100000, 999999).toString();
  }
}
