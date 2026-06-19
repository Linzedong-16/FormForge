/**
 * 问卷路由集成测试
 *
 * 验证路由正确绑定、请求校验、认证拦截、响应格式
 * 覆盖全部 8 个接口：创建、列表、详情、更新、删除、发布、关闭、申请模板
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import Fastify from "fastify";
import fp from "fastify-plugin";
import { createPrismaMock, createRedisMock, MOCK_SURVEY } from "../utils/test-helpers.js";

// ─── Mock 认证中间件 ──────────────────────────────────────────

const { mockAuth } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
}));

vi.mock("../../modules/user/auth.middleware.js", () => ({
  authenticate: mockAuth,
}));

// ─── 模拟 response 插件 ───────────────────────────────────────

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
  fastify.decorateReply("sendNotFound", function (msg?: string) {
    return this.status(404).send({ data: null, code: 404, msg: msg ?? "未找到" });
  });
  fastify.decorateReply("sendServerError", function (msg?: string) {
    return this.status(500).send({ data: null, code: 500, msg: msg ?? "服务器错误" });
  });
});

// ─── 模拟 rate-limit 跳过（测试环境不限制） ──────────────────

const rateLimitPluginMock = fp(async fastify => {
  fastify.addHook("onRoute", routeOptions => {
    if (routeOptions.config?.rateLimit) {
      delete routeOptions.config.rateLimit;
    }
  });
});

// ─── 模拟已认证用户信息 ──────────────────────────────────────

const MOCK_AUTH_USER = {
  userId: BigInt(2),
  email: "user@test.com",
  role: "user",
};

// ─── 辅助函数 ─────────────────────────────────────────────────

/** 设置 authenticate 为拒绝模式（返回 401） */
function setAuthDenied() {
  mockAuth.mockImplementation(async (_request: any, reply: any) => {
    reply.sendUnauthorized("请先登录");
  });
}

/** 设置 authenticate 为通过模式（注入 user） */
function setAuthPassed() {
  mockAuth.mockImplementation(async (request: any, _reply: any) => {
    request.user = MOCK_AUTH_USER;
  });
}

// ─── Setup ────────────────────────────────────────────────────

describe("survey.routes", () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    vi.clearAllMocks();

    app = Fastify({ logger: false });

    // 注入 prisma / redis
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prisma = { ...createPrismaMock() } as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const redis = { ...createRedisMock() } as any;
    redis.scan.mockResolvedValue(["0", []]);

    app.decorate("prisma", prisma);
    app.decorate("redis", redis);

    await app.register(responsePluginMock);
    await app.register(rateLimitPluginMock);

    // 动态导入 surveyRoutes（在 vi.mock 之后）
    const { default: surveyRoutes } = await import("../../modules/survey/survey.routes.js");
    await app.register(surveyRoutes, { prefix: "/api" });
    await app.ready();
  });

  // ============================================================
  //  认证拦截 — 全部 8 个接口
  // ============================================================

  describe("认证拦截", () => {
    beforeEach(() => {
      setAuthDenied();
    });

    it("GET /api/surveys 无 Token → 401", async () => {
      const res = await app.inject({ method: "GET", url: "/api/surveys" });
      expect(res.statusCode).toBe(401);
    });

    it("POST /api/surveys 无 Token → 401", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/surveys",
        payload: { title: "test" },
      });
      expect(res.statusCode).toBe(401);
    });

    it("GET /api/surveys/100 无 Token → 401", async () => {
      const res = await app.inject({ method: "GET", url: "/api/surveys/100" });
      expect(res.statusCode).toBe(401);
    });

    it("PUT /api/surveys/100 无 Token → 401", async () => {
      const res = await app.inject({
        method: "PUT",
        url: "/api/surveys/100",
        payload: { title: "test" },
      });
      expect(res.statusCode).toBe(401);
    });

    it("DELETE /api/surveys/100 无 Token → 401", async () => {
      const res = await app.inject({ method: "DELETE", url: "/api/surveys/100" });
      expect(res.statusCode).toBe(401);
    });

    it("POST /api/surveys/100/publish 无 Token → 401", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/surveys/100/publish",
        payload: {},
      });
      expect(res.statusCode).toBe(401);
    });

    it("POST /api/surveys/100/close 无 Token → 401", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/surveys/100/close",
        payload: {},
      });
      expect(res.statusCode).toBe(401);
    });

    it("POST /api/surveys/100/apply-template 无 Token → 401", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/surveys/100/apply-template",
        payload: { category: "education" },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  // ============================================================
  //  请求校验（已认证，测试 Zod 校验）
  // ============================================================

  describe("请求校验", () => {
    beforeEach(() => {
      setAuthPassed();
    });

    // ── POST /api/surveys — 创建问卷 ──────────────────────────

    describe("POST /api/surveys — 创建问卷", () => {
      it("缺少 title → 400", async () => {
        const res = await app.inject({
          method: "POST",
          url: "/api/surveys",
          payload: { components: [] },
        });
        expect(res.statusCode).toBe(400);
      });

      it("title 空字符串 → 400", async () => {
        const res = await app.inject({
          method: "POST",
          url: "/api/surveys",
          payload: { title: "" },
        });
        expect(res.statusCode).toBe(400);
      });

      it("title 超过 500 字符 → 400", async () => {
        const res = await app.inject({
          method: "POST",
          url: "/api/surveys",
          payload: { title: "x".repeat(501) },
        });
        expect(res.statusCode).toBe(400);
      });

      it("title 刚好 500 字符 → 校验通过", async () => {
        // 校验通过后在 service 层 mock 返回
        app.prisma.survey.create.mockResolvedValue({
          id: BigInt(999),
          title: "x".repeat(500),
          status: 0,
          created_at: new Date("2026-06-19T00:00:00.000Z"),
        });
        app.prisma.auditLog.create.mockResolvedValue({});
        app.prisma.$transaction.mockImplementation((cb: Function) => cb(app.prisma));

        const res = await app.inject({
          method: "POST",
          url: "/api/surveys",
          payload: { title: "x".repeat(500), components: [] },
        });
        expect(res.statusCode).toBe(200);
      });

      it("description 超过 2000 字符 → 400", async () => {
        const res = await app.inject({
          method: "POST",
          url: "/api/surveys",
          payload: { title: "test", description: "x".repeat(2001) },
        });
        expect(res.statusCode).toBe(400);
      });

      it("components 非数组 → 400", async () => {
        const res = await app.inject({
          method: "POST",
          url: "/api/surveys",
          payload: { title: "test", components: "not-array" },
        });
        expect(res.statusCode).toBe(400);
      });

      it("component.type 为空 → 400", async () => {
        const res = await app.inject({
          method: "POST",
          url: "/api/surveys",
          payload: {
            title: "test",
            components: [{ type: "", config: {}, order_index: 0, required: 0 }],
          },
        });
        expect(res.statusCode).toBe(400);
      });

      it("component.order_index 为负数 → 400", async () => {
        const res = await app.inject({
          method: "POST",
          url: "/api/surveys",
          payload: {
            title: "test",
            components: [{ type: "text", config: {}, order_index: -1, required: 0 }],
          },
        });
        expect(res.statusCode).toBe(400);
      });

      it("component.required 非法值 → 400", async () => {
        const res = await app.inject({
          method: "POST",
          url: "/api/surveys",
          payload: {
            title: "test",
            components: [{ type: "text", config: {}, order_index: 0, required: 2 }],
          },
        });
        expect(res.statusCode).toBe(400);
      });

      it("status 非法值 → 400", async () => {
        const res = await app.inject({
          method: "POST",
          url: "/api/surveys",
          payload: { title: "test", status: 5 },
        });
        expect(res.statusCode).toBe(400);
      });

      it("status=0 (草稿) → 校验通过", async () => {
        app.prisma.survey.create.mockResolvedValue({
          id: BigInt(999),
          title: "test",
          status: 0,
          created_at: new Date("2026-06-19T00:00:00.000Z"),
        });
        app.prisma.auditLog.create.mockResolvedValue({});
        app.prisma.$transaction.mockImplementation((cb: Function) => cb(app.prisma));

        const res = await app.inject({
          method: "POST",
          url: "/api/surveys",
          payload: { title: "test", status: 0, components: [] },
        });
        expect(res.statusCode).toBe(200);
      });

      it("status=1 (发布) → 校验通过", async () => {
        app.prisma.survey.create.mockResolvedValue({
          id: BigInt(999),
          title: "test",
          status: 1,
          created_at: new Date("2026-06-19T00:00:00.000Z"),
        });
        app.prisma.auditLog.create.mockResolvedValue({});
        app.prisma.$transaction.mockImplementation((cb: Function) => cb(app.prisma));

        const res = await app.inject({
          method: "POST",
          url: "/api/surveys",
          payload: { title: "test", status: 1, components: [] },
        });
        expect(res.statusCode).toBe(200);
      });

      it("access_code 超过 50 字符 → 400", async () => {
        const res = await app.inject({
          method: "POST",
          url: "/api/surveys",
          payload: { title: "test", access_code: "x".repeat(51) },
        });
        expect(res.statusCode).toBe(400);
      });
    });

    // ── GET /api/surveys — 列表查询 ───────────────────────────

    describe("GET /api/surveys — 列表查询", () => {
      it("page 非数字 → 400", async () => {
        const res = await app.inject({
          method: "GET",
          url: "/api/surveys?page=xxx",
        });
        expect(res.statusCode).toBe(400);
      });

      it("page 为 0 → 400", async () => {
        const res = await app.inject({
          method: "GET",
          url: "/api/surveys?page=0",
        });
        expect(res.statusCode).toBe(400);
      });

      it("page_size 超过 100 → 400", async () => {
        const res = await app.inject({
          method: "GET",
          url: "/api/surveys?page_size=101",
        });
        expect(res.statusCode).toBe(400);
      });

      it("status 超出范围 → 400", async () => {
        const res = await app.inject({
          method: "GET",
          url: "/api/surveys?status=5",
        });
        expect(res.statusCode).toBe(400);
      });

      it("keyword 超过 200 字符 → 400", async () => {
        const res = await app.inject({
          method: "GET",
          url: `/api/surveys?keyword=${"x".repeat(201)}`,
        });
        expect(res.statusCode).toBe(400);
      });

      it("无参数 → 使用默认值 page=1, page_size=10", async () => {
        app.prisma.survey.findMany.mockResolvedValue([]);
        app.prisma.survey.count.mockResolvedValue(0);

        const res = await app.inject({ method: "GET", url: "/api/surveys" });
        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.body);
        expect(body.data.page).toBe(1);
        expect(body.data.page_size).toBe(10);
      });
    });

    // ── GET /api/surveys/:id — 详情 ───────────────────────────

    describe("GET /api/surveys/:id — 详情", () => {
      it("id 非数字 → 500（BigInt 转换抛出 TypeError）", async () => {
        const res = await app.inject({
          method: "GET",
          url: "/api/surveys/not-a-number",
        });
        expect(res.statusCode).toBe(500);
      });

      it("id 为小数 → 500（BigInt 转换抛出 TypeError）", async () => {
        const res = await app.inject({
          method: "GET",
          url: "/api/surveys/1.5",
        });
        expect(res.statusCode).toBe(500);
      });
    });

    // ── PUT /api/surveys/:id — 更新 ───────────────────────────

    describe("PUT /api/surveys/:id — 更新", () => {
      it("id 非数字 → 500（BigInt 转换抛出 TypeError）", async () => {
        const res = await app.inject({
          method: "PUT",
          url: "/api/surveys/not-a-number",
          payload: { title: "test" },
        });
        expect(res.statusCode).toBe(500);
      });

      it("body 为空对象 → 校验通过", async () => {
        app.prisma.survey.findFirst.mockResolvedValue({
          ...MOCK_SURVEY,
          id: BigInt(100),
          user_id: BigInt(2),
        });
        app.prisma.survey.update.mockResolvedValue({});
        app.prisma.auditLog.create.mockResolvedValue({});
        app.prisma.$transaction.mockImplementation((cb: Function) => cb(app.prisma));

        const res = await app.inject({
          method: "PUT",
          url: "/api/surveys/100",
          payload: {},
        });
        expect(res.statusCode).toBe(200);
      });

      it("title 超长 → 400", async () => {
        const res = await app.inject({
          method: "PUT",
          url: "/api/surveys/100",
          payload: { title: "x".repeat(501) },
        });
        expect(res.statusCode).toBe(400);
      });

      it("status 非法值 → 400", async () => {
        const res = await app.inject({
          method: "PUT",
          url: "/api/surveys/100",
          payload: { status: 5 },
        });
        expect(res.statusCode).toBe(400);
      });

      it("仅传 title → 校验通过", async () => {
        app.prisma.survey.findFirst.mockResolvedValue({
          ...MOCK_SURVEY,
          id: BigInt(100),
          user_id: BigInt(2),
          title: "old",
          survey_type: "personal",
          review_status: "none",
          status: 0,
          deleted_at: null,
        });
        app.prisma.survey.update.mockResolvedValue({});
        app.prisma.auditLog.create.mockResolvedValue({});
        app.prisma.$transaction.mockImplementation((cb: Function) => cb(app.prisma));

        const res = await app.inject({
          method: "PUT",
          url: "/api/surveys/100",
          payload: { title: "new title" },
        });
        expect(res.statusCode).toBe(200);
      });
    });

    // ── DELETE /api/surveys/:id — 删除 ────────────────────────

    describe("DELETE /api/surveys/:id — 删除", () => {
      it("id 非数字 → 500（BigInt 转换抛出 TypeError）", async () => {
        const res = await app.inject({
          method: "DELETE",
          url: "/api/surveys/not-a-number",
        });
        expect(res.statusCode).toBe(500);
      });
    });

    // ── POST /api/surveys/:id/publish — 发布 ──────────────────

    describe("POST /api/surveys/:id/publish — 发布", () => {
      it("id 非数字 → 500（BigInt 转换抛出 TypeError）", async () => {
        const res = await app.inject({
          method: "POST",
          url: "/api/surveys/not-a-number/publish",
          payload: {},
        });
        expect(res.statusCode).toBe(500);
      });

      it("空 body → 校验通过（publish 无需参数）", async () => {
        app.prisma.survey.findFirst.mockResolvedValue({
          ...MOCK_SURVEY,
          id: BigInt(100),
          user_id: BigInt(2),
          status: 0,
          deleted_at: null,
        });
        app.prisma.survey.update.mockResolvedValue({});
        app.prisma.auditLog.create.mockResolvedValue({});

        const res = await app.inject({
          method: "POST",
          url: "/api/surveys/100/publish",
          payload: {},
        });
        expect(res.statusCode).toBe(200);
      });
    });

    // ── POST /api/surveys/:id/close — 关闭 ────────────────────

    describe("POST /api/surveys/:id/close — 关闭", () => {
      it("id 非数字 → 500（BigInt 转换抛出 TypeError）", async () => {
        const res = await app.inject({
          method: "POST",
          url: "/api/surveys/not-a-number/close",
          payload: {},
        });
        expect(res.statusCode).toBe(500);
      });

      it("空 body → 校验通过（close 无需参数）", async () => {
        app.prisma.survey.findFirst.mockResolvedValue({
          ...MOCK_SURVEY,
          id: BigInt(100),
          user_id: BigInt(2),
          status: 1,
          deleted_at: null,
        });
        app.prisma.survey.update.mockResolvedValue({});
        app.prisma.auditLog.create.mockResolvedValue({});

        const res = await app.inject({
          method: "POST",
          url: "/api/surveys/100/close",
          payload: {},
        });
        expect(res.statusCode).toBe(200);
      });
    });

    // ── POST /api/surveys/:id/apply-template — 申请模板 ───────

    describe("POST /api/surveys/:id/apply-template — 申请模板", () => {
      it("id 非数字 → 500（BigInt 转换抛出 TypeError）", async () => {
        const res = await app.inject({
          method: "POST",
          url: "/api/surveys/not-a-number/apply-template",
          payload: { category: "education" },
        });
        expect(res.statusCode).toBe(500);
      });

      it("缺少 category → 400", async () => {
        const res = await app.inject({
          method: "POST",
          url: "/api/surveys/100/apply-template",
          payload: {},
        });
        expect(res.statusCode).toBe(400);
      });

      it("category 非法值 → 400", async () => {
        const res = await app.inject({
          method: "POST",
          url: "/api/surveys/100/apply-template",
          payload: { category: "invalid" },
        });
        expect(res.statusCode).toBe(400);
      });

      it("submit_message 超长 → 400", async () => {
        const res = await app.inject({
          method: "POST",
          url: "/api/surveys/100/apply-template",
          payload: { category: "education", submit_message: "x".repeat(501) },
        });
        expect(res.statusCode).toBe(400);
      });

      it("submit_message 空字符串 → 校验通过（transform 转 undefined）", async () => {
        app.prisma.survey.findFirst.mockResolvedValue({
          id: BigInt(100),
          user_id: BigInt(2),
          deleted_at: null,
        });
        app.prisma.review.findFirst.mockResolvedValue(null);
        app.prisma.review.create.mockResolvedValue({
          id: BigInt(5001),
          status: "pending",
        });
        app.prisma.survey.update.mockResolvedValue({});
        app.prisma.auditLog.create.mockResolvedValue({});
        app.prisma.$transaction.mockImplementation((cb: Function) => cb(app.prisma));

        const res = await app.inject({
          method: "POST",
          url: "/api/surveys/100/apply-template",
          payload: { category: "education", submit_message: "" },
        });
        expect(res.statusCode).toBe(200);
      });
    });
  });

  // ============================================================
  //  有 Token 时正常请求（Mock Service 成功响应）
  // ============================================================

  describe("有 Token 时正常请求", () => {
    beforeEach(() => {
      setAuthPassed();

      const prisma = app.prisma;
      prisma.user.findFirst.mockResolvedValue({ id: BigInt(2), email: "user@test.com", status: 1 });
    });

    // ── GET /api/surveys — 列表 ───────────────────────────────

    it("GET /api/surveys — 返回列表", async () => {
      app.prisma.survey.findMany.mockResolvedValue([]);
      app.prisma.survey.count.mockResolvedValue(0);

      const res = await app.inject({
        method: "GET",
        url: "/api/surveys",
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.code).toBe(0);
      expect(body.data.surveys).toBeDefined();
      expect(body.data.total).toBe(0);
    });

    it("GET /api/surveys?status=1&keyword=test — 带筛选条件", async () => {
      app.prisma.survey.findMany.mockResolvedValue([]);
      app.prisma.survey.count.mockResolvedValue(0);

      const res = await app.inject({
        method: "GET",
        url: "/api/surveys?status=1&keyword=test",
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.code).toBe(0);
    });

    // ── POST /api/surveys — 创建 ──────────────────────────────

    it("POST /api/surveys — 返回创建结果", async () => {
      app.prisma.survey.create.mockResolvedValue({
        id: BigInt(101),
        title: "test",
        status: 0,
        created_at: new Date("2026-06-19T00:00:00.000Z"),
      });
      app.prisma.auditLog.create.mockResolvedValue({});
      app.prisma.$transaction.mockImplementation((cb: Function) => cb(app.prisma));

      const res = await app.inject({
        method: "POST",
        url: "/api/surveys",
        payload: { title: "test", components: [] },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.code).toBe(0);
      expect(body.data.survey_id).toBe("101");
      expect(body.msg).toBe("创建成功");
    });

    // ── GET /api/surveys/:id — 详情 ───────────────────────────

    it("GET /api/surveys/100 — 返回详情", async () => {
      app.prisma.survey.findFirst.mockResolvedValue({
        id: BigInt(100),
        user_id: BigInt(2),
        title: "测试问卷",
        description: "描述",
        status: 0,
        page_size: 10,
        total_questions: 2,
        responses_count: 0,
        is_public: 0,
        access_code: null,
        survey_type: "personal",
        review_status: "none",
        category: null,
        cover_url: null,
        download_count: 0,
        rating: null,
        created_at: new Date("2026-06-01T10:00:00.000Z"),
        updated_at: new Date("2026-06-10T10:00:00.000Z"),
        published_at: null,
        closed_at: null,
        deleted_at: null,
        components: [],
      });

      const res = await app.inject({
        method: "GET",
        url: "/api/surveys/100",
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.code).toBe(0);
      expect(body.data.id).toBe("100");
      expect(body.data.title).toBe("测试问卷");
      expect(body.data.components).toBeDefined();
    });

    // ── PUT /api/surveys/:id — 更新 ───────────────────────────

    it("PUT /api/surveys/100 — 返回更新结果", async () => {
      app.prisma.survey.findFirst
        .mockResolvedValueOnce({
          id: BigInt(100),
          user_id: BigInt(2),
          survey_type: "personal",
          review_status: "none",
          deleted_at: null,
        })
        .mockResolvedValueOnce({
          id: BigInt(100),
          user_id: BigInt(2),
          title: "updated",
          description: null,
          status: 0,
          page_size: 10,
          total_questions: 0,
          responses_count: 0,
          is_public: 0,
          access_code: null,
          survey_type: "personal",
          review_status: "none",
          category: null,
          cover_url: null,
          download_count: 0,
          rating: null,
          created_at: new Date("2026-06-01T10:00:00.000Z"),
          updated_at: new Date("2026-06-10T10:00:00.000Z"),
          published_at: null,
          closed_at: null,
          deleted_at: null,
          components: [],
        });
      app.prisma.survey.update.mockResolvedValue({});
      app.prisma.auditLog.create.mockResolvedValue({});
      app.prisma.$transaction.mockImplementation((cb: Function) => cb(app.prisma));

      const res = await app.inject({
        method: "PUT",
        url: "/api/surveys/100",
        payload: { title: "updated" },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.code).toBe(0);
      expect(body.msg).toBe("更新成功");
    });

    // ── DELETE /api/surveys/:id — 删除 ────────────────────────

    it("DELETE /api/surveys/100 — 返回删除成功", async () => {
      app.prisma.survey.findFirst.mockResolvedValue({
        id: BigInt(100),
        user_id: BigInt(2),
        survey_type: "personal",
        review_status: "none",
        deleted_at: null,
      });
      app.prisma.survey.update.mockResolvedValue({});
      app.prisma.auditLog.create.mockResolvedValue({});
      app.prisma.$transaction.mockImplementation((cb: Function) => cb(app.prisma));

      const res = await app.inject({
        method: "DELETE",
        url: "/api/surveys/100",
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.code).toBe(0);
      expect(body.msg).toBe("删除成功");
    });

    // ── POST /api/surveys/:id/publish — 发布 ──────────────────

    it("POST /api/surveys/100/publish — 返回发布成功", async () => {
      app.prisma.survey.findFirst
        .mockResolvedValueOnce({
          id: BigInt(100),
          user_id: BigInt(2),
          status: 0,
          deleted_at: null,
        })
        .mockResolvedValueOnce({
          id: BigInt(100),
          user_id: BigInt(2),
          title: "test",
          description: null,
          status: 1,
          page_size: 10,
          total_questions: 0,
          responses_count: 0,
          is_public: 0,
          access_code: null,
          survey_type: "personal",
          review_status: "none",
          category: null,
          cover_url: null,
          download_count: 0,
          rating: null,
          created_at: new Date("2026-06-01T10:00:00.000Z"),
          updated_at: new Date("2026-06-10T10:00:00.000Z"),
          published_at: new Date("2026-06-19T10:00:00.000Z"),
          closed_at: null,
          deleted_at: null,
          components: [],
        });
      app.prisma.survey.update.mockResolvedValue({});
      app.prisma.auditLog.create.mockResolvedValue({});

      const res = await app.inject({
        method: "POST",
        url: "/api/surveys/100/publish",
        payload: {},
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.code).toBe(0);
      expect(body.msg).toBe("发布成功");
    });

    // ── POST /api/surveys/:id/close — 关闭 ────────────────────

    it("POST /api/surveys/100/close — 返回关闭成功", async () => {
      app.prisma.survey.findFirst
        .mockResolvedValueOnce({
          id: BigInt(100),
          user_id: BigInt(2),
          status: 1,
          deleted_at: null,
        })
        .mockResolvedValueOnce({
          id: BigInt(100),
          user_id: BigInt(2),
          title: "test",
          description: null,
          status: 2,
          page_size: 10,
          total_questions: 0,
          responses_count: 0,
          is_public: 0,
          access_code: null,
          survey_type: "personal",
          review_status: "none",
          category: null,
          cover_url: null,
          download_count: 0,
          rating: null,
          created_at: new Date("2026-06-01T10:00:00.000Z"),
          updated_at: new Date("2026-06-10T10:00:00.000Z"),
          published_at: new Date("2026-06-19T10:00:00.000Z"),
          closed_at: new Date("2026-06-19T10:00:00.000Z"),
          deleted_at: null,
          components: [],
        });
      app.prisma.survey.update.mockResolvedValue({});
      app.prisma.auditLog.create.mockResolvedValue({});

      const res = await app.inject({
        method: "POST",
        url: "/api/surveys/100/close",
        payload: {},
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.code).toBe(0);
      expect(body.msg).toBe("关闭成功");
    });

    // ── POST /api/surveys/:id/apply-template — 申请模板 ───────

    it("POST /api/surveys/100/apply-template — 返回申请成功", async () => {
      app.prisma.survey.findFirst.mockResolvedValue({
        id: BigInt(100),
        user_id: BigInt(2),
        deleted_at: null,
      });
      app.prisma.review.findFirst.mockResolvedValue(null);
      app.prisma.review.create.mockResolvedValue({
        id: BigInt(5001),
        status: "pending",
      });
      app.prisma.survey.update.mockResolvedValue({});
      app.prisma.auditLog.create.mockResolvedValue({});
      app.prisma.$transaction.mockImplementation((cb: Function) => cb(app.prisma));

      const res = await app.inject({
        method: "POST",
        url: "/api/surveys/100/apply-template",
        payload: { category: "education" },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.code).toBe(0);
      expect(body.data.review_id).toBe("5001");
      expect(body.data.status).toBe("pending");
      expect(body.msg).toBe("模板申请已提交，等待管理员审核");
    });
  });
});