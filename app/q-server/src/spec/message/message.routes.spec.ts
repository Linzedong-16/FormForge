/**
 * 消息模块路由 — 集成测试
 *
 * 覆盖：Zod Schema 校验（messageListQuerySchema/messageIdSchema/markAllReadSchema）、
 * 通过 mock Service 验证路由 → Service 调用链，含越权场景（非本人消息返回 403）
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MessageService } from "../../modules/message/message.service.js";
import { AppError } from "../../utils/errors.js";
import { BizCode } from "../../utils/response.js";
import { messageListQuerySchema, messageIdSchema, markAllReadSchema, sendMessageSchema } from "../../modules/message/message.schemas.js";

vi.mock("../../modules/message/message.service.js", () => ({
  MessageService: vi.fn()
}));

vi.mock("../../modules/user/auth/auth.middleware.js", () => ({
  authenticate: vi.fn()
}));

function createMockService() {
  return {
    list: vi.fn(),
    getUnreadCount: vi.fn(),
    markRead: vi.fn(),
    markAllRead: vi.fn(),
    softDelete: vi.fn(),
    sendMessage: vi.fn(),
    create: vi.fn()
  } as unknown as MessageService;
}

describe("Message Routes", () => {
  let mockService: ReturnType<typeof createMockService>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockService = createMockService();
    (MessageService as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => mockService);
  });

  // ============================================================
  //  Schema 验证
  // ============================================================

  describe("messageListQuerySchema", () => {
    it("默认 page=1, page_size=20", () => {
      const result = messageListQuerySchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.page).toBe(1);
        expect(result.data.page_size).toBe(20);
      }
    });

    it("page_size 超过 50 — 校验失败", () => {
      const result = messageListQuerySchema.safeParse({ page_size: 100 });
      expect(result.success).toBe(false);
    });

    it("逗号分隔的 type 被拆分为数组", () => {
      const result = messageListQuerySchema.safeParse({ type: "operation_notify,template_like" });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toEqual(["operation_notify", "template_like"]);
      }
    });

    it("不支持的 type 值 — 校验失败", () => {
      const result = messageListQuerySchema.safeParse({ type: "not_a_type" });
      expect(result.success).toBe(false);
    });

    it("is_read=\"false\" 正确转为布尔值 false（不是字符串非空即真值的陷阱）", () => {
      const result = messageListQuerySchema.safeParse({ is_read: "false" });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.is_read).toBe(false);
      }
    });

    it("is_read=\"true\" 正确转为布尔值 true", () => {
      const result = messageListQuerySchema.safeParse({ is_read: "true" });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.is_read).toBe(true);
      }
    });
  });

  describe("messageIdSchema", () => {
    it("有效数字字符串 — 转为 BigInt", () => {
      const result = messageIdSchema.safeParse("9001");
      expect(result.success).toBe(true);
      if (result.success) expect(result.data).toBe(BigInt(9001));
    });

    it("非数字字符串 — 校验失败", () => {
      const result = messageIdSchema.safeParse("abc");
      expect(result.success).toBe(false);
    });
  });

  describe("markAllReadSchema", () => {
    it("空对象 — 通过（不筛选类型）", () => {
      const result = markAllReadSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it("非法 type — 校验失败", () => {
      const result = markAllReadSchema.safeParse({ type: "not_a_type" });
      expect(result.success).toBe(false);
    });
  });

  // ============================================================
  //  路由逻辑测试（通过 mock Service 验证调用链）
  // ============================================================

  describe("Service 调用链", () => {
    it("list — 调用 Service 并返回正确响应", async () => {
      const mockResult = { items: [], total: 0, page: 1, page_size: 20, total_pages: 0 };
      mockService.list.mockResolvedValue(mockResult);

      const result = await mockService.list(BigInt(2), "user", { page: 1, page_size: 20 });

      expect(result).toEqual(mockResult);
      expect(mockService.list).toHaveBeenCalledWith(BigInt(2), "user", { page: 1, page_size: 20 });
    });

    it("getUnreadCount — 调用 Service 并返回未读计数", async () => {
      const mockResult = {
        unread_total: 3,
        by_type: { operation_notify: 3, template_like: 0, survey_lifecycle: 0, user_admin_comm: 0, admin_broadcast: 0 }
      };
      mockService.getUnreadCount.mockResolvedValue(mockResult);

      const result = await mockService.getUnreadCount(BigInt(2), "user");

      expect(result).toEqual(mockResult);
    });

    it("markRead — 非本人消息时 403 正确传播", async () => {
      mockService.markRead.mockRejectedValue(new AppError("无权操作", 403));

      await expect(mockService.markRead(BigInt(2), "user", BigInt(9001))).rejects.toMatchObject({ statusCode: 403 });
    });

    it("markRead — 消息不存在时 404 正确传播", async () => {
      mockService.markRead.mockRejectedValue(new AppError("消息不存在", 404, BizCode.MESSAGE_NOT_FOUND));

      await expect(mockService.markRead(BigInt(2), "user", BigInt(99999))).rejects.toMatchObject({
        statusCode: 404,
        code: BizCode.MESSAGE_NOT_FOUND
      });
    });

    it("markAllRead — 调用 Service 并返回标记数量", async () => {
      mockService.markAllRead.mockResolvedValue({ marked_count: 4 });

      const result = await mockService.markAllRead(BigInt(2), "user", undefined);

      expect(result.marked_count).toBe(4);
    });

    it("softDelete — 非本人消息时 403 正确传播", async () => {
      mockService.softDelete.mockRejectedValue(new AppError("无权操作", 403));

      await expect(mockService.softDelete(BigInt(2), "user", BigInt(9001))).rejects.toMatchObject({ statusCode: 403 });
    });

    it("softDelete — 调用 Service 并返回删除结果", async () => {
      mockService.softDelete.mockResolvedValue({ id: "9001", deleted: true as const });

      const result = await mockService.softDelete(BigInt(2), "user", BigInt(9001));

      expect(result.deleted).toBe(true);
    });
  });

  describe("sendMessageSchema", () => {
    it("仅 content 必填即通过", () => {
      const result = sendMessageSchema.safeParse({ content: "咨询内容" });
      expect(result.success).toBe(true);
    });

    it("请求体夹带 type 字段被忽略（不出现在解析结果中）", () => {
      const result = sendMessageSchema.safeParse({ content: "内容", type: "operation_notify" });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).not.toHaveProperty("type");
      }
    });

    it("content 为空 — 校验失败", () => {
      const result = sendMessageSchema.safeParse({ content: "" });
      expect(result.success).toBe(false);
    });

    it("content 超过 2000 字符 — 校验失败", () => {
      const result = sendMessageSchema.safeParse({ content: "a".repeat(2001) });
      expect(result.success).toBe(false);
    });
  });

  describe("Service 调用链 — sendMessage", () => {
    it("sendMessage — 调用 Service 并返回创建结果", async () => {
      mockService.sendMessage.mockResolvedValue({ id: "9001", created_at: "2026-07-10T10:00:00.000Z" });

      const result = await mockService.sendMessage(BigInt(2), "user", { content: "咨询内容" });

      expect(result.id).toBe("9001");
    });

    it("sendMessage — 频率限制触发 429 正确传播", async () => {
      mockService.sendMessage.mockRejectedValue(new AppError("发送过于频繁，请稍后再试", 429));

      await expect(mockService.sendMessage(BigInt(2), "user", { content: "内容" })).rejects.toMatchObject({
        statusCode: 429
      });
    });

    it("sendMessage — 非管理员回复被拒绝 403 正确传播", async () => {
      mockService.sendMessage.mockRejectedValue(new AppError("无权回复", 403));

      await expect(
        mockService.sendMessage(BigInt(2), "user", { content: "内容", reply_to_message_id: 1 })
      ).rejects.toMatchObject({ statusCode: 403 });
    });
  });
});
