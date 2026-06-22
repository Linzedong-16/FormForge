/**
 * 认证中间件单元测试
 *
 * 覆盖：authenticate（校验 Token）、requireSuperAdmin（权限校验）
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import jwt from "jsonwebtoken";
import { authenticate, requireSuperAdmin } from "../../../modules/user/auth/auth.middleware.js";
import { createRequestMock, createReplyMock, createFastifyMock, MOCK_USER } from "../../utils/test-helpers.js";

describe("auth.middleware", () => {
  let fastify: ReturnType<typeof createFastifyMock>;

  beforeEach(() => {
    fastify = createFastifyMock();
    vi.clearAllMocks();
  });

  // ============================================================
  //  authenticate
  // ============================================================

  describe("authenticate", () => {
    it("无 Authorization 头 → 返回 401", async () => {
      const req = createRequestMock();
      req.server = fastify;
      const reply = createReplyMock();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await authenticate(req as any, reply as any);

      expect(reply.sendUnauthorized).toHaveBeenCalledWith("请先登录");
    });

    it("Authorization 不含 Bearer 前缀 → 返回 401", async () => {
      const req = createRequestMock({ headers: { authorization: "Token abc" } });
      req.server = fastify;
      const reply = createReplyMock();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await authenticate(req as any, reply as any);

      expect(reply.sendUnauthorized).toHaveBeenCalledWith("请先登录");
    });

    it("有效 Token → 挂载 user 到 request", async () => {
      const token = jwt.sign(
        { sub: MOCK_USER.id.toString(), email: MOCK_USER.email, role: "user", type: "access", jti: "j1" },
        process.env.JWT_SECRET!,
        { expiresIn: 3600 }
      );

      fastify.prisma.user.findFirst.mockResolvedValue(MOCK_USER);
      fastify.redis.exists.mockResolvedValue(0);

      const req = createRequestMock({ headers: { authorization: `Bearer ${token}` } });
      req.server = fastify;
      const reply = createReplyMock();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await authenticate(req as any, reply as any);

      expect(req.user).toBeDefined();
      expect(req.user?.email).toBe(MOCK_USER.email);
      expect(reply.sendUnauthorized).not.toHaveBeenCalled();
    });

    it("无效 Token → 返回 401", async () => {
      const req = createRequestMock({ headers: { authorization: "Bearer invalid-token" } });
      req.server = fastify;
      const reply = createReplyMock();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await authenticate(req as any, reply as any);

      // verifyToken 内部捕获 jwt.verify 异常后抛出 AuthError，
      // 中间件 catch 到 AuthError 调用 reply.status(401).send(...)
      expect(reply.status).toHaveBeenCalledWith(401);
      expect(reply.send).toHaveBeenCalled();
    });

    it("黑名单 Token → 返回 401", async () => {
      const token = jwt.sign(
        { sub: "1", email: "x@x.com", role: "user", type: "access", jti: "blacklisted" },
        process.env.JWT_SECRET!,
        { expiresIn: 3600 }
      );

      fastify.redis.exists.mockResolvedValue(1); // 黑名单

      const req = createRequestMock({ headers: { authorization: `Bearer ${token}` } });
      req.server = fastify;
      const reply = createReplyMock();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await authenticate(req as any, reply as any);

      expect(reply.status).toHaveBeenCalledWith(401);
      expect(reply.send).toHaveBeenCalled();
    });

    it("用户已禁用 → 返回 401", async () => {
      const token = jwt.sign(
        { sub: "99", email: "disabled@x.com", role: "user", type: "access", jti: "j99" },
        process.env.JWT_SECRET!,
        { expiresIn: 3600 }
      );

      fastify.redis.exists.mockResolvedValue(0);
      fastify.prisma.user.findFirst.mockResolvedValue(null); // 不存在

      const req = createRequestMock({ headers: { authorization: `Bearer ${token}` } });
      req.server = fastify;
      const reply = createReplyMock();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await authenticate(req as any, reply as any);

      expect(reply.status).toHaveBeenCalledWith(401);
      expect(reply.send).toHaveBeenCalled();
    });
  });

  // ============================================================
  //  requireSuperAdmin
  // ============================================================

  describe("requireSuperAdmin", () => {
    it("超级管理员 → 通过", async () => {
      const req = createRequestMock({
        user: { userId: BigInt(1), email: "admin@example.com", role: "super_admin" }
      });
      const reply = createReplyMock();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await requireSuperAdmin(req as any, reply as any);

      expect(reply.sendForbidden).not.toHaveBeenCalled();
    });

    it("普通用户 → 返回 403", async () => {
      const req = createRequestMock({
        user: { userId: BigInt(2), email: "user@example.com", role: "user" }
      });
      const reply = createReplyMock();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await requireSuperAdmin(req as any, reply as any);

      expect(reply.sendForbidden).toHaveBeenCalledWith("需要超级管理员权限");
    });

    it("无 user 对象 → 返回 403", async () => {
      const req = createRequestMock();
      const reply = createReplyMock();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await requireSuperAdmin(req as any, reply as any);

      expect(reply.sendForbidden).toHaveBeenCalledWith("需要超级管理员权限");
    });
  });
});
