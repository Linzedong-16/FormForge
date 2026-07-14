/**
 * serverClient 拦截器深度测试
 *
 * 测试范围：
 *   1. 请求拦截器 — 自动附加 Authorization
 *   2. 响应拦截器 — 成功响应解包
 *   3. 响应拦截器 — 超时/网络错误处理
 *   4. 响应拦截器 — 5xx/429 错误处理
 *   5. 响应拦截器 — 401 Token 刷新
 *   6. 响应拦截器 — 业务错误透传
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// 使用 vi.hoisted 确保变量在 vi.mock 提升前初始化
const { mockElMessage, mockRefreshToken, mockHandleLogout } = vi.hoisted(() => ({
  mockElMessage: { error: vi.fn(), warning: vi.fn(), success: vi.fn() },
  mockRefreshToken: vi.fn(),
  mockHandleLogout: vi.fn()
}));

vi.mock("element-plus", () => ({ ElMessage: mockElMessage }));

vi.mock("@/stores/useUser", () => ({
  useUserStore: vi.fn(() => ({
    accessToken: "test-token-123",
    refreshAccessToken: mockRefreshToken,
    handleLogout: mockHandleLogout
  }))
}));

// 捕获拦截器 — 使用 hoisted 确保变量在 vi.mock 工厂中可用
const { reqInterceptor, resSuccess, resError } = vi.hoisted(() => {
  let req: any = null;
  let resS: any = null;
  let resE: any = null;
  return {
    reqInterceptor: { get: () => req, set: (v: any) => { req = v; } },
    resSuccess: { get: () => resS, set: (v: any) => { resS = v; } },
    resError: { get: () => resE, set: (v: any) => { resE = v; } }
  };
});

vi.mock("axios", () => ({
  default: {
    create: vi.fn(() => ({
      interceptors: {
        request: { use: vi.fn((fn: any) => { reqInterceptor.set(fn); }) },
        response: { use: vi.fn((s: any, e: any) => { resSuccess.set(s); resError.set(e); }) }
      }
    }))
  }
}));

describe("serverClient — 拦截器", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await import("../clients/server");
  });

  // ─── 请求拦截器 ──────────────────────────────────────────────
  describe("请求拦截器", () => {
    it("token 存在时应附加 Authorization 头", () => {
      const config = { headers: {} };
      const fn = reqInterceptor.get();
      const result = fn(config);
      expect((result.headers as Record<string, string>).Authorization).toBe("Bearer test-token-123");
    });

    it("headers 为 undefined 时应安全处理", () => {
      const config = { headers: undefined };
      const fn = reqInterceptor.get();
      const result = fn(config);
      expect(result).toBeDefined();
    });
  });

  // ─── 响应拦截器 — 成功 ──────────────────────────────────────
  describe("响应拦截器 — 成功", () => {
    it("应解包 response.data", () => {
      const fn = resSuccess.get();
      const result = fn({ data: { code: 0, msg: "ok" } } as any);
      expect(result).toEqual({ code: 0, msg: "ok" });
    });
  });

  // ─── 响应拦截器 — 超时 ──────────────────────────────────────
  describe("响应拦截器 — 超时", () => {
    it("ECONNABORTED + timeout 应提示超时并 reject", async () => {
      const fn = resError.get();
      const error = { code: "ECONNABORTED", message: "timeout of 15000ms exceeded", config: {} };
      await expect(fn(error)).rejects.toBeDefined();
      expect(mockElMessage.error).toHaveBeenCalledWith(expect.stringContaining("超时"));
    });
  });

  // ─── 响应拦截器 — 网络错误 ──────────────────────────────────
  describe("响应拦截器 — 网络错误", () => {
    it("无 response 时应提示网络连接失败并 reject", async () => {
      const fn = resError.get();
      const error = { config: {}, message: "Network Error" };
      await expect(fn(error)).rejects.toBeDefined();
      expect(mockElMessage.error).toHaveBeenCalledWith(expect.stringContaining("网络连接"));
    });
  });

  // ─── 响应拦截器 — 5xx ──────────────────────────────────────
  describe("响应拦截器 — 5xx", () => {
    it("500 应提示服务器异常并 reject", async () => {
      const fn = resError.get();
      const error = { config: {}, response: { status: 500, data: { msg: "崩溃了" } } };
      await expect(fn(error)).rejects.toBeDefined();
      expect(mockElMessage.error).toHaveBeenCalledWith("崩溃了");
    });

    it("500 无 msg 时应使用默认提示", async () => {
      const fn = resError.get();
      const error = { config: {}, response: { status: 500, data: {} } };
      await expect(fn(error)).rejects.toBeDefined();
      expect(mockElMessage.error).toHaveBeenCalledWith("服务器内部错误，请稍后重试");
    });

    it("503 也应提示", async () => {
      const fn = resError.get();
      const error = { config: {}, response: { status: 503, data: {} } };
      await expect(fn(error)).rejects.toBeDefined();
      expect(mockElMessage.error).toHaveBeenCalled();
    });
  });

  // ─── 响应拦截器 — 429 ──────────────────────────────────────
  describe("响应拦截器 — 429 限流", () => {
    it("429 应提示并 reject", async () => {
      const fn = resError.get();
      const error = { config: {}, response: { status: 429, data: {} } };
      await expect(fn(error)).rejects.toBeDefined();
      expect(mockElMessage.warning).toHaveBeenCalled();
    });
  });

  // ─── 响应拦截器 — 401 ──────────────────────────────────────
  describe("响应拦截器 — 401", () => {
    const originalLocation = window.location;

    beforeEach(() => {
      // @ts-expect-error mock
      delete window.location;
      window.location = { href: "" } as any;
    });

    afterEach(() => {
      window.location = originalLocation;
    });

    it("401 应尝试刷新 Token", async () => {
      mockRefreshToken.mockResolvedValue("new-token");
      const fn = resError.get();
      const error = {
        config: { headers: {}, _retry: undefined },
        response: { status: 401, data: {} }
      };
      try { await fn(error); } catch { /* expected */ }
      expect(mockRefreshToken).toHaveBeenCalled();
    });

    it("Token 刷新失败应调用 handleLogout", async () => {
      mockRefreshToken.mockRejectedValue(new Error("failed"));
      const fn = resError.get();
      const error = {
        config: { headers: {}, _retry: undefined },
        response: { status: 401, data: {} }
      };
      try { await fn(error); } catch { /* expected */ }
      expect(mockHandleLogout).toHaveBeenCalled();
    });

    it("已重试的请求不应再次刷新 Token", async () => {
      const fn = resError.get();
      const error = {
        config: { headers: {}, _retry: true },
        response: { status: 401, data: {} }
      };
      try { await fn(error); } catch { /* expected */ }
      expect(mockRefreshToken).not.toHaveBeenCalled();
    });
  });

  // ─── 响应拦截器 — 业务错误 ──────────────────────────────────
  describe("响应拦截器 — 业务错误", () => {
    it("400 错误应透传 response.data", async () => {
      const fn = resError.get();
      const error = {
        config: {},
        response: { status: 400, data: { code: 400, msg: "参数错误" } }
      };
      const result = await fn(error);
      expect(result).toEqual({ code: 400, msg: "参数错误" });
    });

    it("403 错误应透传", async () => {
      const fn = resError.get();
      const error = {
        config: {},
        response: { status: 403, data: { code: 403, msg: "无权限" } }
      };
      const result = await fn(error);
      expect(result).toEqual({ code: 403, msg: "无权限" });
    });

    it("404 错误应透传", async () => {
      const fn = resError.get();
      const error = {
        config: {},
        response: { status: 404, data: { code: 404, msg: "未找到" } }
      };
      const result = await fn(error);
      expect(result).toEqual({ code: 404, msg: "未找到" });
    });
  });
});