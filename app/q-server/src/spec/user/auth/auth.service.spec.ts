/**
 * AuthService 单元测试
 *
 * 覆盖：系统状态、登录、初始化注册、邮箱验证注册、Token 管理、登录安全
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { AuthService } from "../../../modules/user/auth/auth.service.js";
import { AuthError } from "../../../utils/errors.js";
import { BizCode } from "../../../utils/response.js";
import { createFastifyMock, MOCK_USER, MOCK_ADMIN } from "../../utils/test-helpers.js";

// ─── Setup ────────────────────────────────────────────────────

describe("AuthService", () => {
  let fastify: ReturnType<typeof createFastifyMock>;
  let authService: AuthService;

  beforeEach(() => {
    fastify = createFastifyMock();
    authService = new AuthService(fastify);
    vi.clearAllMocks();
  });

  // ============================================================
  //  getSystemStatus
  // ============================================================

  describe("getSystemStatus", () => {
    it("应返回系统已初始化状态（存在超级管理员且 SMTP 已配置）", async () => {
      fastify.prisma.userRole.count.mockResolvedValue(1);
      fastify.prisma.systemConfig.findUnique
        .mockResolvedValueOnce({ value: "true" })  // registration_enabled
        .mockResolvedValueOnce({ value: "true" }); // smtp_enabled

      const status = await authService.getSystemStatus();

      expect(status).toEqual({
        initialized: true,
        registrationEnabled: true,
        registrationMode: "email_verify",
        smtpConfigured: true,
      });
    });

    it("应返回未初始化状态（无超级管理员）", async () => {
      fastify.prisma.userRole.count.mockResolvedValue(0);
      fastify.prisma.systemConfig.findUnique
        .mockResolvedValueOnce({ value: "false" })
        .mockResolvedValueOnce({ value: "false" });

      const status = await authService.getSystemStatus();

      expect(status).toEqual({
        initialized: false,
        registrationEnabled: false,
        registrationMode: "admin_only",
        smtpConfigured: false,
      });
    });
  });

  // ============================================================
  //  login
  // ============================================================

  describe("login", () => {
    const email = "user@example.com";
    const password = "correct-password";

    beforeEach(() => {
      // 默认：账户未锁定、用户存在、状态启用（密码验证由各测试控制）
      fastify.redis.exists.mockResolvedValue(0);
      fastify.prisma.user.findFirst.mockResolvedValue(MOCK_USER);
      fastify.prisma.userRole.findMany.mockResolvedValue([{ role_code: "user" }]);
      vi.mocked(bcrypt.compare).mockResolvedValue(false as never);
    });

    it("登录成功 — 返回 Token 和用户信息", async () => {
      vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

      const result = await authService.login(email, password);

      expect(result.token).toBeTruthy();
      expect(result.tokenType).toBe("Bearer");
      expect(result.expiresIn).toBeGreaterThan(0);
      expect(result.refreshToken).toBeTruthy();
      expect(result.user.email).toBe(email);
      expect(result.user.role).toBe("user");
    });

    it("登录成功 — 超级管理员角色", async () => {
      fastify.prisma.user.findFirst.mockResolvedValue(MOCK_ADMIN);
      fastify.prisma.userRole.findMany.mockResolvedValue([{ role_code: "super_admin" }]);
      vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

      const result = await authService.login(MOCK_ADMIN.email, password);

      expect(result.user.role).toBe("super_admin");
    });

    it("账户被锁定时抛出 ACCOUNT_LOCKED", async () => {
      fastify.redis.exists.mockResolvedValue(1); // 已锁定

      await expect(authService.login(email, password)).rejects.toThrow(AuthError);
      await expect(authService.login(email, password)).rejects.toMatchObject({
        code: BizCode.ACCOUNT_LOCKED,
      });
    });

    it("用户不存在时抛出 401 并记录失败", async () => {
      fastify.prisma.user.findFirst.mockResolvedValue(null);
      fastify.redis.eval.mockResolvedValue(1); // Lua 脚本返回 count=1

      await expect(authService.login(email, password)).rejects.toMatchObject({
        message: "邮箱或密码错误",
        statusCode: 401,
      });
      expect(fastify.redis.eval).toHaveBeenCalled();
    });

    it("密码错误时抛出 401 并返回剩余尝试次数", async () => {
      // recordLoginFail 调用 Lua eval→2, getLoginFailCount 读取 get→"1"
      fastify.redis.eval.mockResolvedValue(2);
      fastify.redis.get.mockResolvedValue("1");
      vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

      await expect(authService.login(email, "wrong-password")).rejects.toMatchObject({
        statusCode: 401,
        details: { remainAttempts: 4 }, // MAX_LOGIN_FAILS(5) - failCount(1) = 4
      });
    });

    it("账户被禁用时抛出 ACCOUNT_DISABLED", async () => {
      vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
      fastify.prisma.user.findFirst.mockResolvedValue({ ...MOCK_USER, status: 0 });

      await expect(authService.login(email, password)).rejects.toMatchObject({
        code: BizCode.ACCOUNT_DISABLED,
      });
    });

    it("登录成功后更新 last_login_at", async () => {
      vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

      await authService.login(email, password);

      expect(fastify.prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: MOCK_USER.id },
        }),
      );
    });

    it("登录成功后清除失败记录", async () => {
      vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

      await authService.login(email, password);

      expect(fastify.redis.del).toHaveBeenCalledTimes(2); // fail + lock
    });
  });

  // ============================================================
  //  registerAsSuperAdmin（初始化注册）
  // ============================================================

  describe("registerAsSuperAdmin", () => {
    const email = "first@example.com";
    const password = "Admin123!";

    it("首次注册成功 — 创建超级管理员并返回 Token", async () => {
      fastify.prisma.userRole.count.mockResolvedValue(0); // 未初始化
      fastify.prisma.user.findFirst.mockResolvedValue(null); // 邮箱未注册
      fastify.prisma.user.create.mockResolvedValue({ ...MOCK_ADMIN, email });
      fastify.prisma.userRole.create.mockResolvedValue({});
      fastify.prisma.auditLog.create.mockResolvedValue({});

      const result = await authService.registerAsSuperAdmin(email, password, "首席管理员");

      expect(result.isFirstUser).toBe(true);
      expect(result.user.role).toBe("super_admin");
      expect(fastify.prisma.user.create).toHaveBeenCalled();
      expect(fastify.prisma.userRole.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: { user_id: expect.any(BigInt), role_code: "super_admin" } }),
      );
    });

    it("系统已初始化时抛出 403", async () => {
      fastify.prisma.userRole.count.mockResolvedValue(1); // 已初始化

      await expect(authService.registerAsSuperAdmin(email, password)).rejects.toMatchObject({
        statusCode: 403,
      });
    });

    it("邮箱已被注册时抛出 EMAIL_EXISTS", async () => {
      fastify.prisma.userRole.count.mockResolvedValue(0);
      fastify.prisma.user.findFirst.mockResolvedValue(MOCK_USER);

      await expect(authService.registerAsSuperAdmin(MOCK_USER.email, password)).rejects.toMatchObject({
        code: BizCode.EMAIL_EXISTS,
      });
    });
  });

  // ============================================================
  //  sendCode（发送验证码）
  // ============================================================

  describe("sendCode", () => {
    const email = "newuser@example.com";

    beforeEach(() => {
      fastify.prisma.systemConfig.findUnique
        .mockResolvedValueOnce({ value: "true" }) // smtp_enabled
        .mockResolvedValueOnce({ value: "true" }); // registration_enabled
      fastify.prisma.user.findFirst.mockResolvedValue(null);
      fastify.redis.get.mockResolvedValue(null); // 未超频
      fastify.redis.set.mockResolvedValue("OK");
    });

    it("成功发送验证码并存入 Redis", async () => {
      const result = await authService.sendCode(email, "register");

      expect(result.expireSeconds).toBe(300);
      expect(fastify.redis.set).toHaveBeenCalled();
    });

    it("SMTP 未配置时抛出 SMTP_NOT_CONFIGURED", async () => {
      fastify.prisma.systemConfig.findUnique.mockReset();
      fastify.prisma.systemConfig.findUnique.mockResolvedValueOnce({ value: "false" }); // smtp

      await expect(authService.sendCode(email, "register")).rejects.toMatchObject({
        code: BizCode.SMTP_NOT_CONFIGURED,
      });
    });

    it("超出频率限制时抛出 429", async () => {
      fastify.redis.get.mockResolvedValue("3"); // 已发3次

      await expect(authService.sendCode(email, "register")).rejects.toMatchObject({
        statusCode: 429,
      });
    });
  });

  // ============================================================
  //  verifyAndRegister（邮箱验证注册）
  // ============================================================

  describe("verifyAndRegister", () => {
    const email = "newuser@example.com";
    const code = "123456";
    const password = "ValidP1!";

    it("验证码验证成功 + 注册 → 返回 Token", async () => {
      fastify.redis.get.mockResolvedValue(JSON.stringify({ code, type: "register" }));
      fastify.redis.del.mockResolvedValue(1);
      fastify.prisma.user.create.mockResolvedValue({ ...MOCK_USER, email });
      fastify.prisma.userRole.create.mockResolvedValue({});
      fastify.prisma.auditLog.create.mockResolvedValue({});

      const result = await authService.verifyAndRegister(email, code, password, "新用户");

      expect(result.user.email).toBe(email);
      expect(result.user.role).toBe("user");
      expect(fastify.redis.del).toHaveBeenCalled();
    });

    it("验证码过期 → VERIFY_CODE_EXPIRED", async () => {
      fastify.redis.get.mockResolvedValue(null);

      await expect(authService.verifyAndRegister(email, code, password, "x")).rejects.toMatchObject({
        code: BizCode.VERIFY_CODE_EXPIRED,
      });
    });

    it("验证码错误 → VERIFY_CODE_INVALID", async () => {
      fastify.redis.get.mockResolvedValue(JSON.stringify({ code: "999999", type: "register" }));

      await expect(authService.verifyAndRegister(email, code, password, "x")).rejects.toMatchObject({
        code: BizCode.VERIFY_CODE_INVALID,
      });
    });
  });

  // ============================================================
  //  refreshToken
  // ============================================================

  describe("refreshToken", () => {
    it("合法的 Refresh Token 返回新 Token", async () => {
      const user = MOCK_USER;
      const oldRefresh = jwt.sign(
        { sub: user.id.toString(), type: "refresh", jti: "test-jti" },
        process.env.JWT_SECRET!,
        { expiresIn: 604800 },
      );

      fastify.prisma.user.findFirst.mockResolvedValue(user);
      fastify.prisma.userRole.findMany.mockResolvedValue([{ role_code: "user" }]);
      fastify.redis.set.mockResolvedValue("OK");

      const result = await authService.refreshToken(oldRefresh);

      expect(result.token).toBeTruthy();
      expect(result.refreshToken).toBeTruthy();
      // 旧 Refresh Token 应被加入黑名单
      expect(fastify.redis.set).toHaveBeenCalled();
    });

    it("无效 Refresh Token 抛出 401", async () => {
      await expect(authService.refreshToken("invalid-token")).rejects.toMatchObject({
        statusCode: 401,
      });
    });

    it("Access Token 被当作 Refresh Token 使用 → 抛出 401", async () => {
      const accessToken = jwt.sign(
        { sub: "1", email: "x@x.com", role: "user", type: "access", jti: "x" },
        process.env.JWT_SECRET!,
        { expiresIn: 3600 },
      );

      await expect(authService.refreshToken(accessToken)).rejects.toMatchObject({
        statusCode: 401,
      });
    });

    it("已拉黑（已用过）的旧 Refresh Token 再次刷新 → 抛出 REFRESH_TOKEN_INVALID，防止重放", async () => {
      const usedRefresh = jwt.sign(
        { sub: MOCK_USER.id.toString(), type: "refresh", jti: "used-jti" },
        process.env.JWT_SECRET!,
        { expiresIn: 604800 },
      );

      // 该 jti 已在黑名单中（即已被使用过一次）
      fastify.redis.exists.mockResolvedValue(1);

      await expect(authService.refreshToken(usedRefresh)).rejects.toThrow(AuthError);
      await expect(authService.refreshToken(usedRefresh)).rejects.toMatchObject({
        statusCode: 401,
        code: BizCode.REFRESH_TOKEN_INVALID,
      });
    });
  });

  // ============================================================
  //  verifyToken
  // ============================================================

  describe("verifyToken", () => {
    it("合法 Access Token 返回用户信息", async () => {
      const token = jwt.sign(
        { sub: MOCK_USER.id.toString(), email: MOCK_USER.email, role: "user", type: "access", jti: "j1" },
        process.env.JWT_SECRET!,
        { expiresIn: 3600 },
      );

      fastify.redis.exists.mockResolvedValue(0);
      fastify.prisma.user.findFirst.mockResolvedValue(MOCK_USER);

      const result = await authService.verifyToken(token);

      expect(result.userId).toBe(MOCK_USER.id);
      expect(result.email).toBe(MOCK_USER.email);
    });

    it("黑名单 Token → 抛出 401", async () => {
      const token = jwt.sign(
        { sub: "1", email: "x@x.com", role: "user", type: "access", jti: "blacklisted-jti" },
        process.env.JWT_SECRET!,
        { expiresIn: 3600 },
      );

      fastify.redis.exists.mockResolvedValue(1); // 在黑名单

      await expect(authService.verifyToken(token)).rejects.toMatchObject({
        statusCode: 401,
      });
    });

    it("用户已被禁用 → 抛出 401", async () => {
      const token = jwt.sign(
        { sub: "99", email: "disabled@x.com", role: "user", type: "access", jti: "j2" },
        process.env.JWT_SECRET!,
        { expiresIn: 3600 },
      );

      fastify.redis.exists.mockResolvedValue(0);
      fastify.prisma.user.findFirst.mockResolvedValue(null); // 已软删除/不存在

      await expect(authService.verifyToken(token)).rejects.toMatchObject({
        statusCode: 401,
      });
    });
  });

  // ============================================================
  //  logout
  // ============================================================

  describe("logout", () => {
    it("将 Token 加入黑名单", async () => {
      const token = jwt.sign(
        { sub: "1", type: "access", jti: "logout-jti" },
        process.env.JWT_SECRET!,
        { expiresIn: 3600 },
      );

      fastify.redis.set.mockResolvedValue("OK");
      await authService.logout(token);

      expect(fastify.redis.set).toHaveBeenCalled();
    });
  });

  // ============================================================
  //  登录安全：锁定 & 计数
  // ============================================================

  describe("登录安全机制", () => {
    const email = "attacked@example.com";

    it("连续失败5次后账户被锁定", async () => {
      // 第 1-4 次失败 → Lua 脚本返回 <5，锁定不触发
      for (let i = 1; i <= 4; i++) {
        fastify.redis.exists.mockResolvedValue(0); // 未锁定
        fastify.prisma.user.findFirst.mockResolvedValue(null);
        fastify.redis.eval.mockResolvedValue(i);

        await expect(authService.login(email, "any")).rejects.toThrow();
      }

      // 第 5 次失败 → Lua 脚本返回 5，内部触发 set 锁定
      fastify.redis.exists.mockResolvedValue(0);
      fastify.prisma.user.findFirst.mockResolvedValue(null);
      fastify.redis.eval.mockResolvedValue(5);
      fastify.redis.set.mockResolvedValue("OK");

      await expect(authService.login(email, "any")).rejects.toThrow();
      // Lua 脚本内部已处理锁定 set，这里验证 Lua 被调用
      expect(fastify.redis.eval).toHaveBeenCalledTimes(5);
    });
  });

  // ============================================================
  //  US3 — JWT Secret 生产环境强制校验
  // ============================================================

  describe("JWT Secret 启动校验 (US3)", () => {
    const OLD_ENV = { ...process.env };

    afterEach(() => {
      process.env = { ...OLD_ENV };
    });

    it("生产环境 + 默认密钥 → 构造函数抛出 Error，阻止服务启动", () => {
      process.env.NODE_ENV = "production";
      process.env.JWT_SECRET = "dev-secret-change-in-production";

      expect(() => new AuthService(fastify)).toThrow(
        "生产环境必须设置 JWT_SECRET 环境变量，不得使用默认值。"
      );
    });

    it("生产环境 + 未设置 JWT_SECRET → 构造函数抛出 Error", () => {
      process.env.NODE_ENV = "production";
      delete process.env.JWT_SECRET;

      // JWT_SECRET 不存在时使用 ?? fallback → 等于默认值
      expect(() => new AuthService(fastify)).toThrow(
        "生产环境必须设置 JWT_SECRET 环境变量"
      );
    });

    it("生产环境 + 空字符串 JWT_SECRET → 构造函数抛出 Error", () => {
      process.env.NODE_ENV = "production";
      process.env.JWT_SECRET = "   ";

      expect(() => new AuthService(fastify)).toThrow(
        "生产环境必须设置 JWT_SECRET 环境变量"
      );
    });

    it("生产环境 + 自定义安全密钥 → 正常实例化", () => {
      process.env.NODE_ENV = "production";
      process.env.JWT_SECRET = "my-secure-random-secret-64-chars-long";

      expect(() => new AuthService(fastify)).not.toThrow();
    });

    it("开发环境 + 未设置密钥 → 正常实例化并输出警告日志", () => {
      process.env.NODE_ENV = "development";
      delete process.env.JWT_SECRET;

      expect(() => new AuthService(fastify)).not.toThrow();
      expect(fastify.log.warn).toHaveBeenCalledWith(
        expect.stringContaining("开发环境使用默认 JWT_SECRET")
      );
    });
  });

  // ============================================================
  //  US4 — refreshToken 操作顺序安全性
  // ============================================================

  describe("refreshToken — 操作顺序安全性 (US4)", () => {
    const user = { ...MOCK_USER, id: BigInt(2), status: 1 };

    beforeEach(() => {
      fastify.prisma.user.findFirst.mockResolvedValue(user);
      fastify.prisma.userRole.findMany.mockResolvedValue([{ role_code: "user" }]);
      fastify.redis.set.mockResolvedValue("OK");
      fastify.redis.exists.mockResolvedValue(0); // Token 不在黑名单
    });

    it("新 Token 在黑名单写入之前已生成（先生成新 → 再失效旧）", async () => {
      const oldRefresh = jwt.sign(
        { sub: user.id.toString(), type: "refresh", jti: "order-test-jti" },
        process.env.JWT_SECRET!,
        { expiresIn: 604800 }
      );

      // 记录 set 调用的 key 顺序
      const setKeys: string[] = [];
      fastify.redis.set.mockImplementation((key: string) => {
        setKeys.push(key);
        return Promise.resolve("OK");
      });

      await authService.refreshToken(oldRefresh);

      // USER_ACCESS 更新应该在 JWT_BLACKLIST 写入之前发生
      const accessUpdateIdx = setKeys.findIndex(k => k.includes("auth:user:access:"));
      const blacklistIdx = setKeys.findIndex(k => k.includes("auth:jwt:blacklist:"));
      expect(accessUpdateIdx).toBeGreaterThan(-1);
      expect(blacklistIdx).toBeGreaterThan(-1);
      // 先生成新 Token（更新 USER_ACCESS） → 再拉黑旧 Token
      expect(accessUpdateIdx).toBeLessThan(blacklistIdx);
    });

    it("Redis 黑名单写入失败 → 新 Token 仍然正常返回，旧 Token 仍可用", async () => {
      const oldRefresh = jwt.sign(
        { sub: user.id.toString(), type: "refresh", jti: "redis-fail-jti" },
        process.env.JWT_SECRET!,
        { expiresIn: 604800 }
      );

      // 模拟：generateTokens 成功（前 N 次 set），但 blacklistToken 写入失败
      // getUserRoles 缓存会触发 2 次 set（锁 + 数据），generateTokens 触发 1 次，
      // 之后的 set 调用为黑名单写入 → 模拟失败
      let setCallCount = 0;
      fastify.redis.set.mockImplementation(() => {
        setCallCount++;
        // 黑名单写入在第 4+ 次 set 调用时模拟 Redis 不可用
        if (setCallCount >= 4) {
          return Promise.reject(new Error("Redis connection lost"));
        }
        return Promise.resolve("OK");
      });

      // 不应抛出异常，新 Token 应正常返回
      const result = await authService.refreshToken(oldRefresh);

      expect(result.token).toBeTruthy();
      expect(result.refreshToken).toBeTruthy();
      // 错误应被记录到日志
      expect(fastify.log.error).toHaveBeenCalled();
    });

    it("已拉黑的 Refresh Token 重复使用 → 抛出 REFRESH_TOKEN_INVALID（幂等性）", async () => {
      const usedRefresh = jwt.sign(
        { sub: user.id.toString(), type: "refresh", jti: "replay-jti" },
        process.env.JWT_SECRET!,
        { expiresIn: 604800 }
      );

      // 该 jti 已在黑名单中
      fastify.redis.exists.mockResolvedValue(1);

      await expect(authService.refreshToken(usedRefresh)).rejects.toMatchObject({
        statusCode: 401,
        code: BizCode.REFRESH_TOKEN_INVALID,
      });
    });

    it("进程在生成新 Token 后、黑名单写入前崩溃 → 旧 Token 仍可用（用户可以重试）", async () => {
      const oldRefresh = jwt.sign(
        { sub: user.id.toString(), type: "refresh", jti: "crash-recovery-jti" },
        process.env.JWT_SECRET!,
        { expiresIn: 604800 }
      );

      // 第一次刷新：模拟黑名单写入失败（如同进程在 blacklistToken 时崩溃）
      let setCallCount = 0;
      fastify.redis.set.mockImplementation(() => {
        setCallCount++;
        // getUserRoles 缓存(2次) + generateTokens(1次) 都成功，黑名单写入失败
        if (setCallCount >= 4) {
          return Promise.reject(new Error("Simulated crash"));
        }
        return Promise.resolve("OK");
      });

      await authService.refreshToken(oldRefresh);
      // 应正常返回（黑名单失败被 catch）

      // 重置 mock：模拟用户重试
      vi.clearAllMocks();
      fastify.redis.get.mockResolvedValue(null);
      fastify.redis.set.mockResolvedValue("OK");
      fastify.redis.exists.mockResolvedValue(0); // 旧 Token 不在黑名单（写入失败）
      fastify.prisma.user.findFirst.mockResolvedValue(user);
      fastify.prisma.userRole.findMany.mockResolvedValue([{ role_code: "user" }]);

      // 用户可以使用旧 Refresh Token 再次刷新
      await expect(authService.refreshToken(oldRefresh)).resolves.toBeDefined();
    });
  });
});
