/**
 * 物料管理路由 — 权限门禁集成测试
 *
 * 覆盖：未登录 → 401；已登录但非超级管理员 → 403；超级管理员 → 正常放行
 * 复用 admin.routes.spec.ts 已验证过的"真实 Fastify 实例 + 真实 authenticate/
 * requireSuperAdmin 中间件"集成测试方式，而不是 mock 掉中间件——因为本模块的
 * 权限门禁（FR-001/SC-002）恰恰是需要真实验证的部分。
 *
 * 关键点：AuthService.verifyToken() 的 role 直接取自 JWT payload 的 role 字段
 * （`decoded.role ?? "user"`），并非查库解析，因此测试 Token 必须显式带上 role。
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import Fastify from "fastify";
import jwt from "jsonwebtoken";
import fp from "fastify-plugin";
import mediaAssetRoutes from "../../modules/media-asset/media-asset.routes.js";
import { createPrismaMock, createRedisMock, MOCK_MEDIA_ASSET } from "../utils/test-helpers.js";

const responsePluginMock = fp(async fastify => {
  fastify.decorateReply("sendSuccess", function (data: unknown, msg?: string) {
    return this.send({ data, code: 0, msg: msg ?? "ok" });
  });
});

function createToken(userId: string, role: "super_admin" | "user"): string {
  return jwt.sign(
    { sub: userId, email: `${userId}@example.com`, role, type: "access", jti: `${userId}-jti` },
    process.env.JWT_SECRET!,
    { expiresIn: 3600 },
  );
}

describe("media-asset.routes 权限门禁", () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    app = Fastify({ logger: false });

    const basePrisma = createPrismaMock();
    const prisma = {
      ...basePrisma,
      user: {
        ...basePrisma.user,
        findFirst: vi.fn().mockResolvedValue({
          id: BigInt(1),
          email: "user@example.com",
          username: "测试账号",
          role: "user",
          status: 1,
          password_hash: "hash",
          created_at: new Date(),
          updated_at: new Date(),
          last_login_at: null,
          deleted_at: null,
          avatar_url: null,
        }),
      },
      mediaAsset: {
        ...basePrisma.mediaAsset,
        findMany: vi.fn().mockResolvedValue([MOCK_MEDIA_ASSET]),
        count: vi.fn().mockResolvedValue(1),
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    const redis = createRedisMock();
    redis.exists.mockResolvedValue(0); // 不在 JWT 黑名单
    redis.set.mockResolvedValue("OK");
    const pipelineMock = {
      exists: vi.fn().mockReturnThis(),
      ttl: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([]),
    };
    redis.pipeline.mockReturnValue(pipelineMock);

    app.decorate("prisma", prisma);
    app.decorate("redis", redis);

    await app.register(responsePluginMock);
    await app.register(mediaAssetRoutes, { prefix: "/admin" });
    await app.ready();
  });

  // 注：以下 401/403 场景未注册真实 error-handler 插件（与 admin.routes.spec.ts
  // 的既有测试约定一致），响应体不是项目统一的 {code,msg,data} 信封，故只断言状态码

  it("未登录调用 GET /admin/media-assets → 401", async () => {
    const res = await app.inject({ method: "GET", url: "/admin/media-assets" });
    expect(res.statusCode).toBe(401);
  });

  it("已登录但非超级管理员调用 → 403", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/media-assets",
      headers: { authorization: `Bearer ${createToken("2", "user")}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it("超级管理员调用 → 200，正常返回列表", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/media-assets",
      headers: { authorization: `Bearer ${createToken("1", "super_admin")}` },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data.list).toHaveLength(1);
  });

  it("未登录调用 GET /admin/media-assets/:id → 401", async () => {
    const res = await app.inject({ method: "GET", url: "/admin/media-assets/5001" });
    expect(res.statusCode).toBe(401);
  });

  it("非超级管理员调用 DELETE /admin/media-assets/:id → 403", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: "/admin/media-assets/5001",
      headers: { authorization: `Bearer ${createToken("2", "user")}` },
    });
    expect(res.statusCode).toBe(403);
  });
});
