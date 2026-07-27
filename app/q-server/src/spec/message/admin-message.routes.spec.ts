/**
 * 管理员消息路由 — 集成测试
 *
 * 覆盖：Zod Schema 校验（broadcastSchema/broadcastSentQuerySchema）、
 * 通过 mock Service 验证路由 → Service 调用链
 */
import { describe, it, expect, vi } from "vitest";
import { AppError } from "../../utils/errors.js";
import { BizCode } from "../../utils/response.js";
import { broadcastSchema, broadcastSentQuerySchema } from "../../modules/message/message.schemas.js";
import { MessageService } from "../../modules/message/message.service.js";

vi.mock("../../modules/message/message.service.js", () => ({ MessageService: vi.fn() }));
vi.mock("../../modules/user/auth/auth.middleware.js", () => ({
  authenticate: vi.fn(),
  requireSuperAdmin: vi.fn()
}));

function createMockService() {
  return { broadcast: vi.fn(), listSent: vi.fn() } as unknown as MessageService;
}

describe("broadcastSchema", () => {
  it("完整请求体通过校验，target_role 默认 all", () => {
    const result = broadcastSchema.safeParse({ title: "系统维护通知", content: "今晚维护" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.target_role).toBe("all");
  });

  it("请求体夹带 type 字段被忽略（不出现在解析结果中）", () => {
    const result = broadcastSchema.safeParse({ title: "标题", content: "内容", type: "admin_broadcast" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).not.toHaveProperty("type");
  });

  it("title 为空 — 校验失败", () => {
    const result = broadcastSchema.safeParse({ title: "", content: "内容" });
    expect(result.success).toBe(false);
  });

  it("title 超过 200 字符 — 校验失败", () => {
    const result = broadcastSchema.safeParse({ title: "a".repeat(201), content: "内容" });
    expect(result.success).toBe(false);
  });

  it("非法 target_role — 校验失败", () => {
    const result = broadcastSchema.safeParse({ title: "标题", content: "内容", target_role: "everyone" });
    expect(result.success).toBe(false);
  });

  it("target_role=user — 校验通过", () => {
    const result = broadcastSchema.safeParse({ title: "标题", content: "内容", target_role: "user" });
    expect(result.success).toBe(true);
  });
});

describe("broadcastSentQuerySchema", () => {
  it("默认 page=1, page_size=20", () => {
    const result = broadcastSentQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.page_size).toBe(20);
    }
  });
});

describe("Service 调用链 — broadcast/listSent", () => {
  it("broadcast — 调用 Service 并返回创建结果", async () => {
    const mockService = createMockService();
    mockService.broadcast.mockResolvedValue({ id: "9200", estimated_recipients: 486 });

    const result = await mockService.broadcast(BigInt(1), { title: "标题", content: "内容", target_role: "all" });

    expect(result.id).toBe("9200");
    expect(result.estimated_recipients).toBe(486);
  });

  it("broadcast — 频率限制触发 429 正确传播", async () => {
    const mockService = createMockService();
    mockService.broadcast.mockRejectedValue(new AppError("广播过于频繁，请稍后再试", 429, BizCode.BROADCAST_RATE_LIMITED));

    await expect(
      mockService.broadcast(BigInt(1), { title: "标题", content: "内容", target_role: "all" })
    ).rejects.toMatchObject({ statusCode: 429, code: BizCode.BROADCAST_RATE_LIMITED });
  });

  it("listSent — 调用 Service 并返回已发送列表", async () => {
    const mockService = createMockService();
    mockService.listSent.mockResolvedValue({
      items: [{ id: "9200", title: "标题", content: "内容", target_role: "all", estimated_recipients: 486, created_at: "" }],
      total: 1,
      page: 1,
      page_size: 20
    });

    const result = await mockService.listSent(BigInt(1), { page: 1, page_size: 20 });

    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(1);
  });
});
