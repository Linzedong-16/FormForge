/**
 * AdminService 单元测试
 *
 * 覆盖：用户 CRUD、封禁管理、系统配置管理、权限校验
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { AdminService } from "../../../modules/user/admin/admin.service.js";
import { ValidationError } from "../../../utils/errors.js";
import { BizCode } from "../../../utils/response.js";
import { createFastifyMock, MOCK_USER, MOCK_ADMIN } from "../../utils/test-helpers.js";

describe("AdminService", () => {
  let fastify: ReturnType<typeof createFastifyMock>;
  let adminService: AdminService;

  beforeEach(() => {
    fastify = createFastifyMock();
    adminService = new AdminService(fastify);
    vi.clearAllMocks();

    // 默认：adminId 为超级管理员（verifySuperAdmin 使用 findMany 查询角色）
    fastify.prisma.userRole.findMany.mockResolvedValue([
      { user_id: BigInt(1), role_code: "super_admin" }
    ]);

    // Redis pipeline mock（listUsers 批量封禁查询）
    const pipelineMock = {
      exists: vi.fn().mockReturnThis(),
      ttl: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([])
    };
    fastify.redis.pipeline.mockReturnValue(pipelineMock);

    // Redis exists 默认返回 0（不在黑名单/未封禁）
    fastify.redis.exists.mockResolvedValue(0);

    // Redis set 默认返回 "OK"
    fastify.redis.set.mockResolvedValue("OK");
  });

  // ============================================================
  //  verifySuperAdmin
  // ============================================================

  describe("verifySuperAdmin", () => {
    it("超级管理员身份验证通过", async () => {
      fastify.prisma.userRole.findMany.mockResolvedValue([{ role_code: "super_admin" }]);
      await expect(adminService.verifySuperAdmin(BigInt(1))).resolves.toBeUndefined();
    });

    it("非超级管理员抛出 403", async () => {
      fastify.prisma.userRole.findMany.mockResolvedValue([{ role_code: "user" }]);
      await expect(adminService.verifySuperAdmin(BigInt(2))).rejects.toMatchObject({
        statusCode: 403
      });
    });
  });

  // ============================================================
  //  createUser（简化版 — 仅需 username + email）
  // ============================================================

  describe("createUser", () => {
    const input = { email: "new@example.com", username: "新用户" };

    it("管理员创建用户成功，返回默认密码和首次登录标记", async () => {
      fastify.prisma.user.findFirst.mockResolvedValue(null);
      fastify.prisma.user.create.mockResolvedValue({
        ...MOCK_USER,
        id: BigInt(42),
        email: input.email,
        username: input.username,
        role: "user",
        status: 1
      });
      fastify.prisma.userRole.create.mockResolvedValue({});
      fastify.prisma.auditLog.create.mockResolvedValue({});

      const result = await adminService.createUser(BigInt(1), input);

      expect(result.email).toBe(input.email);
      expect(result.role).toBe("user");
      expect(result.defaultPassword).toBe("Aa123456");
      expect(result.requirePasswordChange).toBe(true);
      // 验证角色固定为 user
      expect(fastify.prisma.userRole.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: { user_id: BigInt(42), role_code: "user" } })
      );
    });

    it("邮箱已存在 → EMAIL_EXISTS", async () => {
      fastify.prisma.user.findFirst.mockResolvedValue(MOCK_USER);

      await expect(adminService.createUser(BigInt(1), { ...input, email: MOCK_USER.email })).rejects.toMatchObject({
        code: BizCode.EMAIL_EXISTS
      });
    });
  });

  // ============================================================
  //  listUsers（增强版 — 含封禁状态）
  // ============================================================

  describe("listUsers", () => {
    it("返回分页用户列表（含封禁状态）", async () => {
      const users = [MOCK_ADMIN, MOCK_USER];
      fastify.prisma.user.findMany.mockResolvedValue(users);
      fastify.prisma.user.count.mockResolvedValue(2);

      const result = await adminService.listUsers({ page: 1, limit: 20 });

      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(2);
      // 每个用户都应包含封禁状态字段
      for (const item of result.items) {
        expect(item).toHaveProperty("isBanned");
        expect(item).toHaveProperty("banRemaining");
        expect(item).toHaveProperty("isDeleted");
      }
    });

    it("支持按邮箱模糊搜索", async () => {
      fastify.prisma.user.findMany.mockResolvedValue([MOCK_USER]);
      fastify.prisma.user.count.mockResolvedValue(1);

      await adminService.listUsers({ page: 1, limit: 10, email: "user" });

      expect(fastify.prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { deleted_at: null, email: { contains: "user" } } })
      );
    });

    it("支持按 ban_status=banned 筛选", async () => {
      fastify.prisma.user.findMany.mockResolvedValue([MOCK_USER]);
      fastify.prisma.user.count.mockResolvedValue(1);

      await adminService.listUsers({ page: 1, limit: 10, ban_status: "banned" });
      // 验证 ban_status 通过（不会报错）
    });
  });

  // ============================================================
  //  updateUser
  // ============================================================

  describe("updateUser", () => {
    it("更新用户状态/角色成功", async () => {
      fastify.prisma.user.findFirst.mockResolvedValue(MOCK_USER);
      fastify.prisma.user.update.mockResolvedValue({ ...MOCK_USER, status: 0, role: "user" });
      fastify.prisma.userRole.deleteMany.mockResolvedValue({});
      fastify.prisma.userRole.create.mockResolvedValue({});
      fastify.prisma.auditLog.create.mockResolvedValue({});
      // 不是降级唯一超级管理员，不会触发 count
      fastify.prisma.userRole.count.mockResolvedValue(5);

      const result = await adminService.updateUser(BigInt(1), BigInt(2), { status: 0, role: "user" });

      expect(result.status).toBe(0);
    });

    it("目标用户不存在 → 404", async () => {
      fastify.prisma.user.findFirst.mockResolvedValue(null);

      await expect(adminService.updateUser(BigInt(1), BigInt(999), {})).rejects.toMatchObject({
        statusCode: 404
      });
    });
  });

  // ============================================================
  //  deleteUser（增强版 — 含 deleted_by）
  // ============================================================

  describe("deleteUser", () => {
    beforeEach(() => {
      // userRole.findFirst 默认返回 null（不是超级管理员）
      fastify.prisma.userRole.findFirst.mockResolvedValue(null);
    });

    it("软删除用户成功，返回 deletedBy 和 deletedAt", async () => {
      fastify.prisma.user.findFirst.mockResolvedValue(MOCK_USER);
      fastify.prisma.user.update.mockResolvedValue({ ...MOCK_USER, deleted_at: new Date(), deleted_by: BigInt(1) });
      fastify.prisma.auditLog.create.mockResolvedValue({});

      const result = await adminService.deleteUser(BigInt(1), BigInt(2));

      expect(result.deleted).toBe(true);
      expect(result.deletedBy).toBe("1");
      expect(result.deletedAt).toBeDefined();
      expect(fastify.prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { deleted_at: expect.any(Date), deleted_by: BigInt(1) }
        })
      );
    });

    it("不能删除自己", async () => {
      await expect(adminService.deleteUser(BigInt(1), BigInt(1))).rejects.toThrow(ValidationError);
    });

    it("用户不存在 → 404", async () => {
      fastify.prisma.user.findFirst.mockResolvedValue(null);
      await expect(adminService.deleteUser(BigInt(1), BigInt(999))).rejects.toMatchObject({
        statusCode: 404
      });
    });

    it("不能删除超级管理员", async () => {
      fastify.prisma.user.findFirst.mockResolvedValue({ ...MOCK_ADMIN, role: "admin" });
      // 目标用户是超级管理员
      fastify.prisma.userRole.findFirst.mockResolvedValue({ role_code: "super_admin" });

      await expect(adminService.deleteUser(BigInt(1), BigInt(3))).rejects.toMatchObject({
        code: BizCode.CANNOT_DELETE_SUPER_ADMIN
      });
    });
  });

  // ============================================================
  //  banUser（新增）
  // ============================================================

  describe("banUser", () => {
    const banInput = { ban_duration: 1440, reason: "违规" }; // 1440 分钟 = 1 天

    beforeEach(() => {
      // verifySuperAdmin uses findMany (already mocked in top-level beforeEach)
      // isSuperAdmin check in banUser uses findFirst
      fastify.prisma.userRole.findFirst.mockResolvedValue(null); // target 不是超级管理员
      fastify.redis.set.mockResolvedValue("OK");
    });

    it("封禁普通用户成功，写入 Redis 并更新 DB status=0", async () => {
      fastify.prisma.user.findFirst.mockResolvedValue({ ...MOCK_USER, username: "测试用户" });
      fastify.prisma.user.update.mockResolvedValue({});
      fastify.prisma.auditLog.create.mockResolvedValue({});

      const result = await adminService.banUser(BigInt(1), BigInt(2), banInput);

      expect(result.isBanned).toBe(true);
      expect(result.banRemaining).toBe(1440 * 60);
      expect(result.bannedUntil).toBeDefined();
      expect(result.username).toBe("测试用户");
      // 验证 DB status 更新
      expect(fastify.prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 0 } })
      );
    });

    it("不能封禁超级管理员", async () => {
      fastify.prisma.user.findFirst.mockResolvedValue({ ...MOCK_ADMIN, role: "admin" });
      // isSuperAdmin check: target 是超级管理员
      fastify.prisma.userRole.findFirst.mockResolvedValue({ role_code: "super_admin" });

      await expect(adminService.banUser(BigInt(1), BigInt(2), banInput)).rejects.toMatchObject({
        code: BizCode.CANNOT_BAN_SUPER_ADMIN
      });
    });

    it("不能封禁自己", async () => {
      await expect(adminService.banUser(BigInt(1), BigInt(1), banInput)).rejects.toThrow(ValidationError);
    });

    it("用户不存在 → 404", async () => {
      fastify.prisma.user.findFirst.mockResolvedValue(null);

      await expect(adminService.banUser(BigInt(1), BigInt(999), banInput)).rejects.toMatchObject({
        statusCode: 404
      });
    });
  });

  // ============================================================
  //  unbanUser（新增）
  // ============================================================

  describe("unbanUser", () => {
    it("解除封禁成功，清除 Redis 并恢复 DB status=1", async () => {
      fastify.prisma.user.findFirst.mockResolvedValue({ ...MOCK_USER, username: "测试用户" });
      fastify.prisma.user.update.mockResolvedValue({});
      fastify.prisma.auditLog.create.mockResolvedValue({});

      const result = await adminService.unbanUser(BigInt(1), BigInt(2));

      expect(result.isBanned).toBe(false);
      expect(result.username).toBe("测试用户");
      expect(fastify.prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 1 } })
      );
      expect(fastify.redis.del).toHaveBeenCalled();
    });

    it("用户不存在 → 404", async () => {
      fastify.prisma.user.findFirst.mockResolvedValue(null);

      await expect(adminService.unbanUser(BigInt(1), BigInt(999))).rejects.toMatchObject({
        statusCode: 404
      });
    });
  });

  // ============================================================
  //  getConfig / updateSmtpConfig
  // ============================================================

  describe("getConfig", () => {
    it("返回按分类分组的配置", async () => {
      fastify.prisma.systemConfig.findMany.mockResolvedValue([
        { key: "smtp_host", value: "smtp.example.com", category: "smtp" },
        { key: "registration_enabled", value: "true", category: "auth" }
      ]);

      const result = await adminService.getConfig();

      expect(result).toEqual({
        smtp: { smtp_host: "smtp.example.com" },
        auth: { registration_enabled: "true" }
      });
    });
  });

  describe("updateSmtpConfig", () => {
    it("upsert SMTP 配置项", async () => {
      // 设置加密密钥环境变量
      process.env.CRYPTO_ENCRYPTION_KEY = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2";
      fastify.prisma.systemConfig.upsert.mockResolvedValue({});
      fastify.prisma.auditLog.create.mockResolvedValue({});

      const result = await adminService.updateSmtpConfig(BigInt(1), {
        enabled: true,
        host: "smtp.example.com",
        port: 587,
        username: "noreply@example.com",
        password: "secret",
        fromEmail: "noreply@example.com"
      });

      expect(result.updated).toBe(true);
      expect(fastify.prisma.systemConfig.upsert).toHaveBeenCalledTimes(6);

      // 清理
      delete process.env.CRYPTO_ENCRYPTION_KEY;
    });
  });
});
