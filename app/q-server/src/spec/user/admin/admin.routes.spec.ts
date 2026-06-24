/**
 * 管理路由集成测试
 *
 * 验证路由正确绑定、权限控制、请求校验、响应格式
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";
import jwt from "jsonwebtoken";
import fp from "fastify-plugin";
import adminRoutes from "../../../modules/user/admin/admin.routes.js";
import { createPrismaMock, createRedisMock } from "../../utils/test-helpers.js";

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
    redis.set.mockResolvedValue("OK");
    const pipelineMock = {
      exists: vi.fn().mockReturnThis(),
      ttl: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([])
    };
    redis.pipeline.mockReturnValue(pipelineMock);

    app.decorate("prisma", prisma);
    app.decorate("redis", redis);

    await app.register(responsePluginMock);
    await app.register(adminRoutes, { prefix: "/admin" });
    await app.ready();
  });

  // ────────────────────────────────────────────────────────────
  //  POST /admin/users（简化版 — 仅需 email + username）
  // ────────────────────────────────────────────────────────────

  describe("POST /admin/users", () => {
    it("无 Token → 401", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/admin/users",
        payload: { email: "x@x.com", username: "x" }
      });
      expect(res.statusCode).toBe(401);
    });

    it("缺少必填字段 → 400", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/admin/users",
        headers: { authorization: `Bearer ${createSuperAdminToken()}` },
        payload: { email: "x@x.com" } // 缺少 username
      });
      expect(res.statusCode).toBe(400);
    });
  });

  // ────────────────────────────────────────────────────────────
  //  GET /admin/users
  // ────────────────────────────────────────────────────────────

  describe("GET /admin/users", () => {
    it("无 Token → 401", async () => {
      const res = await app.inject({ method: "GET", url: "/admin/users" });
      expect(res.statusCode).toBe(401);
    });
  });

  // ────────────────────────────────────────────────────────────
  //  PUT /admin/users/:id
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
  //  DELETE /admin/users/:id
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
  //  POST /admin/users/:id/ban
  // ────────────────────────────────────────────────────────────

  describe("POST /admin/users/:id/ban", () => {
    it("无 Token → 401", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/admin/users/2/ban",
        payload: { ban_duration: 1440 }
      });
      expect(res.statusCode).toBe(401);
    });

    it("缺少 ban_duration → 400", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/admin/users/2/ban",
        headers: { authorization: `Bearer ${createSuperAdminToken()}` },
        payload: {}
      });
      expect(res.statusCode).toBe(400);
    });

    it("ban_duration 超限 → 400", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/admin/users/2/ban",
        headers: { authorization: `Bearer ${createSuperAdminToken()}` },
        payload: { ban_duration: 99999 }
      });
      expect(res.statusCode).toBe(400);
    });
  });

  // ────────────────────────────────────────────────────────────
  //  DELETE /admin/users/:id/ban
  // ────────────────────────────────────────────────────────────

  describe("DELETE /admin/users/:id/ban", () => {
    it("无 Token → 401", async () => {
      const res = await app.inject({
        method: "DELETE",
        url: "/admin/users/2/ban"
      });
      expect(res.statusCode).toBe(401);
    });
  });

  // ────────────────────────────────────────────────────────────
  //  GET /admin/config
  // ────────────────────────────────────────────────────────────

  describe("GET /admin/config", () => {
    it("无 Token → 401", async () => {
      const res = await app.inject({ method: "GET", url: "/admin/config" });
      expect(res.statusCode).toBe(401);
    });
  });

  // ────────────────────────────────────────────────────────────
  //  PUT /admin/config/smtp
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
