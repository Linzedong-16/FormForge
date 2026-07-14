/**
 * 用户模块 API 单元测试
 *
 * 测试范围：
 *   1. getCurrentUser — GET /user/me
 *   2. updateCurrentUser — PUT /user/update
 *   3. getUserList — GET /admin/users
 *   4. createUser — POST /admin/users
 *   5. updateUser — PUT /admin/users/:id
 *   6. deleteUser — DELETE /admin/users/:id
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
  getCurrentUser,
  updateCurrentUser,
  getUserList,
  createUser,
  updateUser,
  deleteUser
} from "../index";

describe("user API 模块 — 全量单元测试", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ════════════════════════════════════════════════════════════
  //  1. getCurrentUser
  // ════════════════════════════════════════════════════════════
  describe("getCurrentUser", () => {
    it("应调用 GET /user/me", () => {
      getCurrentUser();
      expect(mockServer.get).toHaveBeenCalledWith("/user/me");
    });

    it("应只调用一次 get", () => {
      getCurrentUser();
      expect(mockServer.get).toHaveBeenCalledTimes(1);
    });
  });

  // ════════════════════════════════════════════════════════════
  //  2. updateCurrentUser
  // ════════════════════════════════════════════════════════════
  describe("updateCurrentUser", () => {
    it("应调用 PUT /user/update 并传入 data", () => {
      const data = { username: "newName" };
      updateCurrentUser(data);
      expect(mockServer.put).toHaveBeenCalledWith("/user/update", data);
    });

    it("应支持传入 password 字段", () => {
      const data = { password: "newPass123" };
      updateCurrentUser(data);
      expect(mockServer.put).toHaveBeenCalledWith("/user/update", data);
    });
  });

  // ════════════════════════════════════════════════════════════
  //  3. getUserList
  // ════════════════════════════════════════════════════════════
  describe("getUserList", () => {
    it("应调用 GET /admin/users 并传入 params", () => {
      const params = { page: 1, limit: 10 };
      getUserList(params);
      expect(mockServer.get).toHaveBeenCalledWith("/admin/users", { params });
    });

    it("无参数时应传入 undefined params", () => {
      getUserList();
      expect(mockServer.get).toHaveBeenCalledWith("/admin/users", { params: undefined });
    });
  });

  // ════════════════════════════════════════════════════════════
  //  4. createUser
  // ════════════════════════════════════════════════════════════
  describe("createUser", () => {
    it("应调用 POST /admin/users 并传入 data", () => {
      const data = { email: "test@example.com", username: "test", role: "user" };
      createUser(data);
      expect(mockServer.post).toHaveBeenCalledWith("/admin/users", data);
    });
  });

  // ════════════════════════════════════════════════════════════
  //  5. updateUser
  // ════════════════════════════════════════════════════════════
  describe("updateUser", () => {
    it("应调用 PUT /admin/users/:id 并传入 id 和 data", () => {
      const id = "user-123";
      const data = { username: "updatedName" };
      updateUser(id, data);
      expect(mockServer.put).toHaveBeenCalledWith("/admin/users/user-123", data);
    });
  });

  // ════════════════════════════════════════════════════════════
  //  6. deleteUser
  // ════════════════════════════════════════════════════════════
  describe("deleteUser", () => {
    it("应调用 DELETE /admin/users/:id", () => {
      const id = "user-456";
      deleteUser(id);
      expect(mockServer.delete).toHaveBeenCalledWith("/admin/users/user-456");
    });
  });
});