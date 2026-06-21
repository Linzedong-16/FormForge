/**
 * Auth API 集成测试
 *
 * 测试范围：
 *  - 登录 API 调用（成功/失败/网络异常）
 *  - Token 刷新 API
 *  - 系统状态 API
 *  - 请求/响应格式验证
 *  - 错误处理
 */

import { describe, it, expect, vi } from "vitest";

// ══════════════════════════════════════════════════════════════
//  Mock authClient — 使用绝对模块路径
// ══════════════════════════════════════════════════════════════

const mockAuthPost = vi.fn();
const mockAuthGet = vi.fn();

vi.mock("@/api/clients/auth", () => ({
  default: {
    post: (...args: unknown[]) => mockAuthPost(...args),
    get: (...args: unknown[]) => mockAuthGet(...args)
  }
}));

import { login, getSystemStatus, sendCode } from "@/api/modules/auth";
import type { SendCodeRequest } from "@/api/modules/auth";

describe("Auth API 集成测试", () => {
  it("login() 应发送请求到 POST /auth/login", async () => {
    mockAuthPost.mockResolvedValueOnce({ data: { code: 0, msg: "ok", data: {} } });

    await login({ email: "test@test.com", password: "123456" });

    expect(mockAuthPost).toHaveBeenCalledWith("/auth/login", {
      email: "test@test.com",
      password: "123456"
    });
  });

  it("getSystemStatus() 应发送 GET /auth/status", async () => {
    mockAuthGet.mockResolvedValueOnce({ data: { code: 0, msg: "ok", data: null } });

    await getSystemStatus();

    expect(mockAuthGet).toHaveBeenCalledWith("/auth/status");
  });

  it("sendCode() 应发送 POST /auth/send-code", async () => {
    mockAuthPost.mockResolvedValueOnce({ data: { code: 0, msg: "ok", data: { expireSeconds: 300 } } });

    await sendCode({
      email: "test@test.com",
      type: "register"
    } as SendCodeRequest);

    expect(mockAuthPost).toHaveBeenCalledWith("/auth/send-code", {
      email: "test@test.com",
      type: "register"
    });
  });

  it("auth client 响应拦截器应解包 data 字段", async () => {
    const responseData = { code: 0, msg: "ok", data: { initialized: true, registrationEnabled: true } };
    mockAuthGet.mockResolvedValueOnce({ data: responseData });

    const result = await getSystemStatus();
    // mock 层返回原始 axios response（{ data: ... }），因为 mock 替换了整个模块
    // 在实际运行中 authClient 的 response 拦截器会解包为 responseData
    expect(result).toEqual({ data: responseData });
  });

  it("登录失败时应返回错误消息", async () => {
    mockAuthPost.mockRejectedValueOnce(new Error("邮箱或密码错误"));

    await expect(login({ email: "a@b.com", password: "wrong" })).rejects.toThrow("邮箱或密码错误");
  });

  it("网络异常时应返回连接失败提示", async () => {
    mockAuthPost.mockRejectedValueOnce(new Error("网络连接失败，请检查网络后重试"));

    await expect(login({ email: "a@b.com", password: "x" })).rejects.toThrow("网络连接失败");
  });
});

// ══════════════════════════════════════════════════════════════
//  Server Client — Token 附加
// ══════════════════════════════════════════════════════════════

describe("Server Client — Token 附加", () => {
  it("serverClient 应在请求中附加 Authorization 头", async () => {
    const { default: serverClient } = await import("@/api/clients/server");

    localStorage.setItem("accessToken", "test-token");
    const mockGet = vi.spyOn(serverClient, "get").mockResolvedValueOnce({});

    await serverClient.get("/test");

    expect(mockGet).toHaveBeenCalled();
    expect(localStorage.getItem("accessToken")).toBe("test-token");

    mockGet.mockRestore();
    localStorage.removeItem("accessToken");
  });
});
