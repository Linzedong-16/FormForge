/**
 * 认证中间件单元测试
 *
 * 覆盖：authenticate（校验 Token）、requireSuperAdmin（权限校验）
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import jwt from "jsonwebtoken";
import { authenticate, requireSuperAdmin, authenticateOrInternal } from "../../../modules/user/auth/auth.middleware.js";
import { AuthError } from "../../../utils/errors.js";
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

  // ============================================================
  //  authenticateOrInternal
  // ============================================================

  describe("authenticateOrInternal", () => {
    const ORIGINAL_INTERNAL_KEY = process.env.AI_SERVICE_INTERNAL_KEY;

    afterEach(() => {
      process.env.AI_SERVICE_INTERNAL_KEY = ORIGINAL_INTERNAL_KEY;
    });

    it("携带合法 X-Internal-Api-Key → 跳过 JWT 校验直接通过", async () => {
      process.env.AI_SERVICE_INTERNAL_KEY = "internal-secret";
      const req = createRequestMock({ headers: { "x-internal-api-key": "internal-secret" } });
      req.server = fastify;
      const reply = createReplyMock();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await expect(authenticateOrInternal(req as any, reply as any)).resolves.toBeUndefined();
      expect(req.user).toBeUndefined(); // 内部通道不挂载用户信息
    });

    it("Key 不匹配 → 回退标准 JWT 校验，凭有效 Token 通过", async () => {
      process.env.AI_SERVICE_INTERNAL_KEY = "internal-secret";
      const token = jwt.sign(
        { sub: MOCK_USER.id.toString(), email: MOCK_USER.email, role: "user", type: "access", jti: "j-internal-fallback" },
        process.env.JWT_SECRET!,
        { expiresIn: 3600 }
      );
      fastify.prisma.user.findFirst.mockResolvedValue(MOCK_USER);
      fastify.redis.exists.mockResolvedValue(0);

      const req = createRequestMock({
        headers: { "x-internal-api-key": "wrong-key", authorization: `Bearer ${token}` }
      });
      req.server = fastify;
      const reply = createReplyMock();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await authenticateOrInternal(req as any, reply as any);

      expect(req.user?.email).toBe(MOCK_USER.email);
    });

    it("未配置 AI_SERVICE_INTERNAL_KEY → 强制回退标准鉴权，即使携带任意 Key 也不生效", async () => {
      delete process.env.AI_SERVICE_INTERNAL_KEY;
      const req = createRequestMock({ headers: { "x-internal-api-key": "anything" } });
      req.server = fastify;
      const reply = createReplyMock();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await expect(authenticateOrInternal(req as any, reply as any)).rejects.toBeInstanceOf(AuthError);
    });

    it("Key 缺失且 JWT 也无效 → 抛出 401 AuthError", async () => {
      process.env.AI_SERVICE_INTERNAL_KEY = "internal-secret";
      const req = createRequestMock({ headers: { authorization: "Bearer invalid-token" } });
      req.server = fastify;
      const reply = createReplyMock();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await expect(authenticateOrInternal(req as any, reply as any)).rejects.toMatchObject({ statusCode: 401 });
    });
  });
});
