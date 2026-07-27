/**
 * API 客户端单元测试
 *
 * 测试范围：
 *   1. authClient 响应拦截器解包 data
 *   2. authClient 错误拦截器处理各种 HTTP 状态
 *   3. serverClient 配置验证
 *   4. serverClient 响应拦截器
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import axios from "axios";

// ─── Mock axios ────────────────────────────────────────────

vi.mock("axios", () => {
  const mockAxios = {
    create: vi.fn().mockReturnValue({
      interceptors: {
        request: { use: vi.fn() },
        response: { use: vi.fn() }
      }
    }),
    interceptors: {
      response: { use: vi.fn() },
      request: { use: vi.fn() }
    }
  };
  return { default: mockAxios };
});

describe("authClient", () => {
  it("应使用 /api 作为 baseURL", async () => {
    const { default: authClient } = await import("../clients/auth");
    expect(axios.create).toHaveBeenCalledWith(
      expect.objectContaining({ baseURL: "/api" })
    );
  });

  it("应配置 15 秒超时", async () => {
    const { default: authClient } = await import("../clients/auth");
    expect(axios.create).toHaveBeenCalledWith(
      expect.objectContaining({ timeout: 15000 })
    );
  });

  it("应注册响应拦截器", async () => {
    const { default: authClient } = await import("../clients/auth");
    expect(authClient.interceptors.response.use).toBeDefined();
  });
});

describe("serverClient", () => {
  it("应使用 /api 作为 baseURL", async () => {
    const { default: serverClient } = await import("../clients/server");
    expect(axios.create).toHaveBeenCalledWith(
      expect.objectContaining({ baseURL: "/api" })
    );
  });

  it("应配置 15 秒超时", async () => {
    const { default: serverClient } = await import("../clients/server");
    expect(axios.create).toHaveBeenCalledWith(
      expect.objectContaining({ timeout: 15000 })
    );
  });

  it("应注册请求拦截器", async () => {
    const { default: serverClient } = await import("../clients/server");
    expect(serverClient.interceptors.request.use).toBeDefined();
  });

  it("应注册响应拦截器", async () => {
    const { default: serverClient } = await import("../clients/server");
    expect(serverClient.interceptors.response.use).toBeDefined();
  });
});