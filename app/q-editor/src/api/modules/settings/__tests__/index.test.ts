/**
 * 个人设置模块 API 单元测试
 *
 * 测试范围：
 *   1. getProfile — GET /user/profile
 *   2. updateProfile — PUT /user/profile
 *   3. uploadAvatar — axios POST /api/user/avatar（multipart/form-data）
 *   4. bindEmail — POST /user/bind-email
 *   5. changePassword — PUT /user/change-password
 *   6. deleteAccount — DELETE /user/account
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock 模块（使用 vi.hoisted 避免 hoisting 问题） ────────────

const mockServer = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
  post: vi.fn(),
  delete: vi.fn()
}));

const mockAxios = vi.hoisted(() => ({
  post: vi.fn()
}));

vi.mock("../../../clients/server", () => ({
  default: mockServer
}));

vi.mock("axios", () => ({
  default: mockAxios
}));

vi.mock("@/stores/useUser", () => ({
  useUserStore: () => ({ accessToken: "mock-access-token" })
}));

// 必须在 mock 之后导入
import {
  getProfile,
  updateProfile,
  uploadAvatar,
  bindEmail,
  changePassword,
  deleteAccount
} from "../index";

describe("settings API 模块 — 全量单元测试", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ════════════════════════════════════════════════════════════
  //  1. getProfile
  // ════════════════════════════════════════════════════════════
  describe("getProfile", () => {
    it("应调用 GET /user/profile", () => {
      getProfile();
      expect(mockServer.get).toHaveBeenCalledWith("/user/profile");
    });

    it("应只调用一次 get", () => {
      getProfile();
      expect(mockServer.get).toHaveBeenCalledTimes(1);
    });
  });

  // ════════════════════════════════════════════════════════════
  //  2. updateProfile
  // ════════════════════════════════════════════════════════════
  describe("updateProfile", () => {
    it("应调用 PUT /user/profile 并传入 data", () => {
      const data = { username: "新用户名" };
      updateProfile(data);
      expect(mockServer.put).toHaveBeenCalledWith("/user/profile", data);
    });
  });

  // ════════════════════════════════════════════════════════════
  //  3. uploadAvatar
  // ════════════════════════════════════════════════════════════
  describe("uploadAvatar", () => {
    it("应使用 axios.post 调用 /api/user/avatar，传入 FormData 和正确的 headers", async () => {
      const blob = new Blob(["test"], { type: "image/png" });
      const filename = "avatar.png";

      mockAxios.post.mockResolvedValue({ data: { code: 0, msg: "ok", data: { url: "http://minio/avatar.png" } } });

      await uploadAvatar(blob, filename);

      expect(mockAxios.post).toHaveBeenCalledTimes(1);

      const [url, formData, config] = mockAxios.post.mock.calls[0] as [string, FormData, Record<string, unknown>];

      expect(url).toBe("/api/user/avatar");
      expect(formData.get("file")).toBeInstanceOf(Blob);

      expect(config.headers).toEqual({
        Authorization: "Bearer mock-access-token",
        "Content-Type": "multipart/form-data"
      });
      expect(config.timeout).toBe(30000);
    });

    it("应返回 axios 响应的 data 字段", async () => {
      const blob = new Blob(["test"], { type: "image/png" });
      const responseData = { code: 0, msg: "ok", data: { url: "http://minio/avatar.png" } };

      mockAxios.post.mockResolvedValue({ data: responseData });

      const result = await uploadAvatar(blob, "avatar.png");
      expect(result).toBe(responseData);
    });
  });

  // ════════════════════════════════════════════════════════════
  //  4. bindEmail
  // ════════════════════════════════════════════════════════════
  describe("bindEmail", () => {
    it("应调用 POST /user/bind-email 并传入 data", () => {
      const data = { email: "test@example.com", code: "123456" };
      bindEmail(data);
      expect(mockServer.post).toHaveBeenCalledWith("/user/bind-email", data);
    });
  });

  // ════════════════════════════════════════════════════════════
  //  5. changePassword
  // ════════════════════════════════════════════════════════════
  describe("changePassword", () => {
    it("应调用 PUT /user/change-password 并传入 data", () => {
      const data = { oldPassword: "old", newPassword: "new" };
      changePassword(data);
      expect(mockServer.put).toHaveBeenCalledWith("/user/change-password", data);
    });
  });

  // ════════════════════════════════════════════════════════════
  //  6. deleteAccount
  // ════════════════════════════════════════════════════════════
  describe("deleteAccount", () => {
    it("应调用 DELETE /user/account", () => {
      deleteAccount();
      expect(mockServer.delete).toHaveBeenCalledWith("/user/account");
    });

    it("应只调用一次 delete", () => {
      deleteAccount();
      expect(mockServer.delete).toHaveBeenCalledTimes(1);
    });
  });
});