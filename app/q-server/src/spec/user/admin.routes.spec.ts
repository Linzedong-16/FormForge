/**
 * 管理路由集成测试
 *
 * 验证路由正确绑定、权限控制、请求校验、响应格式
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";
import jwt from "jsonwebtoken";
import fp from "fastify-plugin";
import adminRoutes from "../../modules/user/admin/admin.routes.js";
import { createPrismaMock, createRedisMock } from "../utils/test-helpers.js";

// 模拟 response 插件
const responsePluginMock = fp(async fastify => {
  fastify.decorateReply("sendSuccess", function (data: unknown, msg?: string) {
    return this.send({ data, code: 0, msg: msg ?? "ok" });
  });
  fastify.decorateReply("sendFail", function (code: number, msg: string) {
    return this.send({ data: null, code, msg });
  });
  fastify.decorateReply("sendBadRequest", function (msg?: string) {
    return this.status(400).send({ data: null, code: 400, msg: msg ?? "参数错误" });
  });
  fastify.decorateReply("sendUnauthorized", function (msg?: string) {
    return this.status(401).send({ data: null, code: 401, msg: msg ?? "未登录" });
  });
  fastify.decorateReply("sendForbidden", function (msg?: string) {
    return this.status(403).send({ data: null, code: 403, msg: msg ?? "无权限" });
  });
});

/** 生成超级管理员 Token */
function createSuperAdminToken(): string {
  return jwt.sign(
    { sub: "1", email: "admin@example.com", role: "super_admin", type: "access", jti: "admin-jti" },
    process.env.JWT_SECRET!,
    { expiresIn: 3600 }
  );
}

describe("admin.routes", () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    app = Fastify({ logger: false });

    // 注入 prisma / redis
    const basePrisma = createPrismaMock();
    const prisma = {
      ...basePrisma,
      // authenticate 中间件查询用户 → 需返回有效用户
      user: {
        ...basePrisma.user,
        findFirst: vi.fn().mockResolvedValue({
          id: BigInt(1),
          email: "admin@example.com",
          username: "管理员",
          role: "admin",
          status: 1,
          password_hash: "hash",
          created_at: new Date(),
          updated_at: new Date(),
          last_login_at: null,
          deleted_at: null,
          avatar_url: null
        })
      },
      userRole: {
        findFirst: vi.fn().mockResolvedValue({ role_code: "super_admin" }),
        findMany: vi.fn(),
        create: vi.fn(),
        count: vi.fn(),
        deleteMany: vi.fn()
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    const redis = createRedisMock();
    redis.exists.mockResolvedValue(0); // 不在 JWT 黑名单
    app.decorate("prisma", prisma);
    app.decorate("redis", redis);

    await app.register(responsePluginMock);
    await app.register(adminRoutes, { prefix: "/admin" });
    await app.ready();
  });

  // ────────────────────────────────────────────────────────────

  describe("POST /admin/users", () => {
    it("无 Token → 401", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/admin/users",
        payload: { email: "x@x.com", username: "x", role: "user" }
      });
      expect(res.statusCode).toBe(401);
    });

    it("缺少必填字段 → 400", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/admin/users",
        headers: { authorization: `Bearer ${createSuperAdminToken()}` },
        payload: { email: "x@x.com" } // 缺少 username, role
      });
      expect(res.statusCode).toBe(400);
    });

    it("无效 role → 400", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/admin/users",
        headers: { authorization: `Bearer ${createSuperAdminToken()}` },
        payload: { email: "x@x.com", username: "x", role: "guest" }
      });
      expect(res.statusCode).toBe(400);
    });
  });

  // ────────────────────────────────────────────────────────────

  describe("GET /admin/users", () => {
    it("无 Token → 401", async () => {
      const res = await app.inject({ method: "GET", url: "/admin/users" });
      expect(res.statusCode).toBe(401);
    });
  });

  // ────────────────────────────────────────────────────────────

  describe("PUT /admin/users/:id", () => {
    it("无 Token → 401", async () => {
      const res = await app.inject({
        method: "PUT",
        url: "/admin/users/2",
        payload: { status: 0 }
      });
      expect(res.statusCode).toBe(401);
    });
  });

  // ────────────────────────────────────────────────────────────

  describe("DELETE /admin/users/:id", () => {
    it("无 Token → 401", async () => {
      const res = await app.inject({
        method: "DELETE",
        url: "/admin/users/2"
      });
      expect(res.statusCode).toBe(401);
    });
  });

  // ────────────────────────────────────────────────────────────

  describe("GET /admin/config", () => {
    it("无 Token → 401", async () => {
      const res = await app.inject({ method: "GET", url: "/admin/config" });
      expect(res.statusCode).toBe(401);
    });
  });

  // ────────────────────────────────────────────────────────────

  describe("PUT /admin/config/smtp", () => {
    it("无 Token → 401", async () => {
      const res = await app.inject({
        method: "PUT",
        url: "/admin/config/smtp",
        payload: { enabled: true, host: "smtp.example.com", port: 587, username: "u", fromEmail: "f" }
      });
      expect(res.statusCode).toBe(401);
    });

    it("缺少字段 → 400", async () => {
      const res = await app.inject({
        method: "PUT",
        url: "/admin/config/smtp",
        headers: { authorization: `Bearer ${createSuperAdminToken()}` },
        payload: { enabled: true }
      });
      expect(res.statusCode).toBe(400);
    });
  });
});
