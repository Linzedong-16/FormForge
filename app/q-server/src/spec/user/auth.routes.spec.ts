/**
 * 认证路由集成测试
 *
 * 验证路由正确绑定、请求校验、响应格式
 */

import { describe, it, expect, beforeEach } from "vitest";
import Fastify from "fastify";
import fp from "fastify-plugin";
import authRoutes from "../../modules/user/auth/auth.routes.js";
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

describe("auth.routes", () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    app = Fastify({ logger: false });

    // 注入 prisma / redis 到 fastify
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prisma = { ...createPrismaMock() } as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const redis = { ...createRedisMock() } as any;
    app.decorate("prisma", prisma);
    app.decorate("redis", redis);

    await app.register(responsePluginMock);
    await app.register(authRoutes, { prefix: "/auth" });
    await app.ready();
  });

  // ────────────────────────────────────────────────────────────

  describe("GET /auth/status", () => {
    it("返回系统状态（code=0）", async () => {
      const res = await app.inject({ method: "GET", url: "/auth/status" });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.code).toBe(0);
      expect(body.data.registrationMode).toBeDefined();
    });
  });

  // ────────────────────────────────────────────────────────────

  describe("POST /auth/login", () => {
    it("缺少 email → 400", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { password: "123" }
      });
      expect(res.statusCode).toBe(400);
    });

    it("缺少 password → 400", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email: "x@x.com" }
      });
      expect(res.statusCode).toBe(400);
    });
  });

  // ────────────────────────────────────────────────────────────

  describe("POST /auth/send-code", () => {
    it("缺少 email → 400", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/auth/send-code",
        payload: { type: "register" }
      });
      expect(res.statusCode).toBe(400);
    });

    it("无效 type → 400", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/auth/send-code",
        payload: { email: "x@x.com", type: "invalid" }
      });
      expect(res.statusCode).toBe(400);
    });
  });

  // ────────────────────────────────────────────────────────────

  describe("POST /auth/register", () => {
    it("缺少 email → 400", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/auth/register",
        payload: { password: "Admin123!" }
      });
      expect(res.statusCode).toBe(400);
    });
  });

  // ────────────────────────────────────────────────────────────

  describe("POST /auth/verify-register", () => {
    it("缺少必填字段 → 400", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/auth/verify-register",
        payload: { email: "x@x.com" }
      });
      expect(res.statusCode).toBe(400);
    });
  });

  // ────────────────────────────────────────────────────────────

  describe("POST /auth/refresh", () => {
    it("缺少 refreshToken → 400", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/auth/refresh",
        payload: {}
      });
      expect(res.statusCode).toBe(400);
    });
  });

  // ────────────────────────────────────────────────────────────

  describe("POST /auth/logout", () => {
    it("未携带 Token → 401", async () => {
      const res = await app.inject({ method: "POST", url: "/auth/logout" });
      expect(res.statusCode).toBe(401);
    });
  });
});
