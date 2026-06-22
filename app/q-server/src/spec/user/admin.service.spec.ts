/**
 * AdminService 单元测试
 *
 * 覆盖：用户 CRUD、系统配置管理、权限校验
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
// import bcrypt from "bcrypt";
import { AdminService } from "../../modules/user/admin/admin.service.js";
import { ValidationError } from "../../utils/errors.js";
import { BizCode } from "../../utils/response.js";
import { createFastifyMock, MOCK_USER, MOCK_ADMIN } from "../utils/test-helpers.js";

describe("AdminService", () => {
  let fastify: ReturnType<typeof createFastifyMock>;
  let adminService: AdminService;

  beforeEach(() => {
    fastify = createFastifyMock();
    adminService = new AdminService(fastify);
    vi.clearAllMocks();

    // 默认：adminId 为超级管理员
    fastify.prisma.userRole.findFirst.mockResolvedValue({ user_id: BigInt(1), role_code: "super_admin" });
  });

  // ============================================================
  //  verifySuperAdmin
  // ============================================================

  describe("verifySuperAdmin", () => {
    it("超级管理员身份验证通过", async () => {
      fastify.prisma.userRole.findFirst.mockResolvedValue({ role_code: "super_admin" });
      await expect(adminService.verifySuperAdmin(BigInt(1))).resolves.toBeUndefined();
    });

    it("非超级管理员抛出 403", async () => {
      fastify.prisma.userRole.findFirst.mockResolvedValue(null);
      await expect(adminService.verifySuperAdmin(BigInt(2))).rejects.toMatchObject({
        statusCode: 403
      });
    });
  });

  // ============================================================
  //  createUser
  // ============================================================

  describe("createUser", () => {
    const input = { email: "new@example.com", username: "新用户", role: "user" as const };

    it("管理员创建用户成功", async () => {
      fastify.prisma.user.findFirst.mockResolvedValue(null); // 邮箱不存在
      fastify.prisma.user.create.mockResolvedValue({ ...MOCK_USER, email: input.email, username: input.username });
      fastify.prisma.userRole.create.mockResolvedValue({});
      fastify.prisma.auditLog.create.mockResolvedValue({});

      const result = await adminService.createUser(BigInt(1), input);

      expect(result.email).toBe(input.email);
      expect(result.role).toBe("user");
      expect(result.passwordProvided).toBe(false); // 未提供密码，系统生成
    });

    it("邮箱已存在 → EMAIL_EXISTS", async () => {
      fastify.prisma.user.findFirst.mockResolvedValue(MOCK_USER);

      await expect(adminService.createUser(BigInt(1), { ...input, email: MOCK_USER.email })).rejects.toMatchObject({
        code: BizCode.EMAIL_EXISTS
      });
    });
  });

  // ============================================================
  //  listUsers
  // ============================================================

  describe("listUsers", () => {
    it("返回分页用户列表", async () => {
      const users = [MOCK_ADMIN, MOCK_USER];
      fastify.prisma.user.findMany.mockResolvedValue(users);
      fastify.prisma.user.count.mockResolvedValue(2);

      const result = await adminService.listUsers({ page: 1, limit: 20 });

      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.totalPages).toBe(1);
    });

    it("支持按邮箱模糊搜索", async () => {
      fastify.prisma.user.findMany.mockResolvedValue([MOCK_USER]);
      fastify.prisma.user.count.mockResolvedValue(1);

      await adminService.listUsers({ page: 1, limit: 10, email: "user" });

      expect(fastify.prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { deleted_at: null, email: { contains: "user" } } })
      );
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

      const result = await adminService.updateUser(BigInt(1), BigInt(2), { status: 0, role: "user" });

      expect(result.status).toBe(0);
      expect(fastify.prisma.userRole.deleteMany).toHaveBeenCalled();
      expect(fastify.prisma.userRole.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: { user_id: BigInt(2), role_code: "user" } })
      );
    });

    it("目标用户不存在 → 404", async () => {
      fastify.prisma.user.findFirst.mockResolvedValue(null);

      await expect(adminService.updateUser(BigInt(1), BigInt(999), {})).rejects.toMatchObject({
        statusCode: 404
      });
    });
  });

  // ============================================================
  //  deleteUser
  // ============================================================

  describe("deleteUser", () => {
    it("软删除用户成功", async () => {
      fastify.prisma.user.findFirst.mockResolvedValue(MOCK_USER);
      fastify.prisma.user.update.mockResolvedValue({ ...MOCK_USER, deleted_at: new Date() });
      fastify.prisma.auditLog.create.mockResolvedValue({});

      const result = await adminService.deleteUser(BigInt(1), BigInt(2));

      expect(result.deleted).toBe(true);
      expect(fastify.prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { deleted_at: expect.any(Date) } })
      );
    });

    it("不能删除自己", async () => {
      await expect(adminService.deleteUser(BigInt(1), BigInt(1))).rejects.toThrow(ValidationError);
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
    });
  });
});
