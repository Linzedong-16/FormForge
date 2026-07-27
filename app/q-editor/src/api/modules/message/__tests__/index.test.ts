/**
 * 消息模块 API 单元测试
 *
 * 测试范围：
 *   1. getMessages — GET /messages
 *   2. getUnreadCount — GET /messages/unread-count
 *   3. markMessageRead — PUT /messages/:id/read
 *   4. markAllMessagesRead — PUT /messages/read-all
 *   5. deleteMessage — DELETE /messages/:id
 *   6. sendMessage — POST /messages/send
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock 模块（使用 vi.hoisted 避免 hoisting 问题） ────────────

const mockServer = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
  post: vi.fn(),
  delete: vi.fn()
}));

vi.mock("../../../clients/server", () => ({
  default: mockServer
}));

// 必须在 mock 之后导入
import {
  getMessages,
  getUnreadCount,
  markMessageRead,
  markAllMessagesRead,
  deleteMessage,
  sendMessage
} from "../index";

describe("message API 模块 — 全量单元测试", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ════════════════════════════════════════════════════════════
  //  1. getMessages
  // ════════════════════════════════════════════════════════════
  describe("getMessages", () => {
    it("应调用 GET /messages 并传入 params", () => {
      const params = { page: 1, limit: 20 };
      getMessages(params);
      expect(mockServer.get).toHaveBeenCalledWith("/messages", { params });
    });

    it("无参数时应传入 undefined params", () => {
      getMessages();
      expect(mockServer.get).toHaveBeenCalledWith("/messages", { params: undefined });
    });
  });

  // ════════════════════════════════════════════════════════════
  //  2. getUnreadCount
  // ════════════════════════════════════════════════════════════
  describe("getUnreadCount", () => {
    it("应调用 GET /messages/unread-count", () => {
      getUnreadCount();
      expect(mockServer.get).toHaveBeenCalledWith("/messages/unread-count");
    });

    it("应只调用一次 get", () => {
      getUnreadCount();
      expect(mockServer.get).toHaveBeenCalledTimes(1);
    });
  });

  // ════════════════════════════════════════════════════════════
  //  3. markMessageRead
  // ════════════════════════════════════════════════════════════
  describe("markMessageRead", () => {
    it("应调用 PUT /messages/:id/read", () => {
      const id = "msg-001";
      markMessageRead(id);
      expect(mockServer.put).toHaveBeenCalledWith("/messages/msg-001/read");
    });
  });

  // ════════════════════════════════════════════════════════════
  //  4. markAllMessagesRead
  // ════════════════════════════════════════════════════════════
  describe("markAllMessagesRead", () => {
    it("应调用 PUT /messages/read-all 并传入 data", () => {
      const data = { type: "system" };
      markAllMessagesRead(data);
      expect(mockServer.put).toHaveBeenCalledWith("/messages/read-all", data);
    });

    it("无参数时应传入空对象 {}", () => {
      markAllMessagesRead();
      expect(mockServer.put).toHaveBeenCalledWith("/messages/read-all", {});
    });
  });

  // ════════════════════════════════════════════════════════════
  //  5. deleteMessage
  // ════════════════════════════════════════════════════════════
  describe("deleteMessage", () => {
    it("应调用 DELETE /messages/:id", () => {
      const id = "msg-999";
      deleteMessage(id);
      expect(mockServer.delete).toHaveBeenCalledWith("/messages/msg-999");
    });
  });

  // ════════════════════════════════════════════════════════════
  //  6. sendMessage
  // ════════════════════════════════════════════════════════════
  describe("sendMessage", () => {
    it("应调用 POST /messages/send 并传入 data", () => {
      const data = { content: "你好", receiverId: "admin-1" };
      sendMessage(data);
      expect(mockServer.post).toHaveBeenCalledWith("/messages/send", data);
    });
  });
});