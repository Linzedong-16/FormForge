/**
 * useMessageStore 单元测试
 *
 * 测试范围：
 *   1. 初始化默认值
 *   2. computed 属性（hasUnread / badgeText）
 *   3. fetchUnreadCount — 成功 / code !== 0 / 异常
 *   4. 轮询生命周期（startPolling / stopPolling）
 *   5. 重复 startPolling 防抖
 *   6. stopPolling 幂等性
 */
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import type { MessageUnreadCountResponse } from "@common/message/message.interface";

const mockGetUnreadCount = vi.hoisted(() => vi.fn());

vi.mock("@/api/modules/message", () => ({
  getUnreadCount: mockGetUnreadCount
}));

import { useMessageStore } from "../useMessage";

/** 构造成功响应的工厂函数 */
function makeSuccessResponse(
  overrides: Partial<MessageUnreadCountResponse> = {}
): MessageUnreadCountResponse {
  return {
    unread_total: 0,
    by_type: {},
    ...overrides
  } as MessageUnreadCountResponse;
}

/** 构造 API 返回的包装对象 */
function apiOk<T>(data: T) {
  return { code: 0, data };
}

describe("useMessageStore", () => {
  let store: ReturnType<typeof useMessageStore>;

  beforeEach(() => {
    vi.useFakeTimers();
    setActivePinia(createPinia());
    store = useMessageStore();
    mockGetUnreadCount.mockReset();
  });

  afterEach(() => {
    store.stopPolling();
    vi.useRealTimers();
  });

  // ─── 1. 初始化默认值 ──────────────────────────────────────────
  describe("初始化默认值", () => {
    it("unreadTotal 初始值为 0", () => {
      expect(store.unreadTotal).toBe(0);
    });

    it("unreadByType 初始值为空对象", () => {
      expect(store.unreadByType).toEqual({});
    });
  });

  // ─── 2. computed: hasUnread ────────────────────────────────────
  describe("hasUnread", () => {
    it("unreadTotal 为 0 时应返回 false", () => {
      store.unreadTotal = 0;
      expect(store.hasUnread).toBe(false);
    });

    it("unreadTotal > 0 时应返回 true", () => {
      store.unreadTotal = 3;
      expect(store.hasUnread).toBe(true);
    });
  });

  // ─── 3. computed: badgeText ────────────────────────────────────
  describe("badgeText", () => {
    it("0 条未读时返回 '0'", () => {
      store.unreadTotal = 0;
      expect(store.badgeText).toBe("0");
    });

    it("5 条未读时返回 '5'", () => {
      store.unreadTotal = 5;
      expect(store.badgeText).toBe("5");
    });

    it("99 条未读时返回 '99'", () => {
      store.unreadTotal = 99;
      expect(store.badgeText).toBe("99");
    });

    it("100 条未读时返回 '99+'", () => {
      store.unreadTotal = 100;
      expect(store.badgeText).toBe("99+");
    });

    it("150 条未读时返回 '99+'", () => {
      store.unreadTotal = 150;
      expect(store.badgeText).toBe("99+");
    });
  });

  // ─── 4. fetchUnreadCount — 成功 ───────────────────────────────
  describe("fetchUnreadCount — 成功", () => {
    it("API 返回 code === 0 时更新 unreadTotal 和 unreadByType", async () => {
      const data = makeSuccessResponse({
        unread_total: 10,
        by_type: { operation_notify: 3, template_like: 7 }
      });
      mockGetUnreadCount.mockResolvedValue(apiOk(data));

      await store.fetchUnreadCount();

      expect(store.unreadTotal).toBe(10);
      expect(store.unreadByType).toEqual({ operation_notify: 3, template_like: 7 });
    });
  });

  // ─── 5. fetchUnreadCount — code !== 0 ──────────────────────────
  describe("fetchUnreadCount — code !== 0", () => {
    it("code !== 0 时不改变状态", async () => {
      // 先设置一个非默认状态
      store.unreadTotal = 5;
      store.unreadByType = { operation_notify: 2, template_like: 3 };

      mockGetUnreadCount.mockResolvedValue({ code: 1, data: null });

      await store.fetchUnreadCount();

      // 状态应保持不变
      expect(store.unreadTotal).toBe(5);
      expect(store.unreadByType).toEqual({ operation_notify: 2, template_like: 3 });
    });
  });

  // ─── 6. fetchUnreadCount — 异常 ───────────────────────────────
  describe("fetchUnreadCount — 异常", () => {
    it("API 抛出异常时不改变状态", async () => {
      store.unreadTotal = 5;
      store.unreadByType = { operation_notify: 2, template_like: 3 };

      mockGetUnreadCount.mockRejectedValue(new Error("Network Error"));

      await store.fetchUnreadCount();

      // 状态应保持不变
      expect(store.unreadTotal).toBe(5);
      expect(store.unreadByType).toEqual({ operation_notify: 2, template_like: 3 });
    });
  });

  // ─── 7. startPolling ──────────────────────────────────────────
  describe("startPolling", () => {
    it("应立即调用 fetchUnreadCount 一次", async () => {
      const data = makeSuccessResponse({ unread_total: 3 });
      mockGetUnreadCount.mockResolvedValue(apiOk(data));

      store.startPolling();
      // 已经立即调用一次，等待 Promise 解析
      await Promise.resolve();

      expect(mockGetUnreadCount).toHaveBeenCalledTimes(1);
    });

    it("应设置定时器并周期性调用 fetchUnreadCount", async () => {
      mockGetUnreadCount.mockResolvedValue(apiOk(makeSuccessResponse()));

      store.startPolling();
      // 已经立即调用一次，等待 Promise 解析
      await Promise.resolve();
      expect(mockGetUnreadCount).toHaveBeenCalledTimes(1);

      // 推进 30 秒，定时器触发第二次调用
      await vi.advanceTimersByTimeAsync(30_000);
      expect(mockGetUnreadCount).toHaveBeenCalledTimes(2);

      // 再推进 30 秒，定时器触发第三次调用
      await vi.advanceTimersByTimeAsync(30_000);
      expect(mockGetUnreadCount).toHaveBeenCalledTimes(3);
    });
  });

  // ─── 8. startPolling — 防重复 ─────────────────────────────────
  describe("startPolling — 防重复", () => {
    it("已处于轮询状态时不应创建重复定时器", async () => {
      mockGetUnreadCount.mockResolvedValue(apiOk(makeSuccessResponse()));

      store.startPolling();
      await Promise.resolve();
      expect(mockGetUnreadCount).toHaveBeenCalledTimes(1);

      // 再次调用 startPolling 不应增加调用次数
      store.startPolling();
      await vi.advanceTimersByTimeAsync(30_000);
      // 仍只有 2 次（初始 1 次 + 定时器 1 次）
      expect(mockGetUnreadCount).toHaveBeenCalledTimes(2);
    });
  });

  // ─── 9. stopPolling ───────────────────────────────────────────
  describe("stopPolling", () => {
    it("应清除定时器，不再触发后续调用", async () => {
      mockGetUnreadCount.mockResolvedValue(apiOk(makeSuccessResponse()));

      store.startPolling();
      await Promise.resolve();
      expect(mockGetUnreadCount).toHaveBeenCalledTimes(1);

      store.stopPolling();

      // 推进 60 秒，不应再有新的调用
      await vi.advanceTimersByTimeAsync(60_000);
      expect(mockGetUnreadCount).toHaveBeenCalledTimes(1);
    });
  });

  // ─── 10. stopPolling — 幂等性 ─────────────────────────────────
  describe("stopPolling — 幂等性", () => {
    it("未启动轮询时调用 stopPolling 不应抛出异常", () => {
      expect(() => store.stopPolling()).not.toThrow();
    });

    it("连续多次调用 stopPolling 不应抛出异常", () => {
      store.startPolling();
      store.stopPolling();
      expect(() => store.stopPolling()).not.toThrow();
      expect(() => store.stopPolling()).not.toThrow();
    });
  });
});