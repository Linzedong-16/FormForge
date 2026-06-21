/**
 * 用户 Store 单元测试
 *
 * 测试范围：
 *  - Token 存储与恢复（localStorage）
 *  - 登录 / 注册 / 登出流程
 *  - Token 刷新（队列+锁并发控制）
 *  - 用户资料管理
 *  - 计算属性
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

// ══════════════════════════════════════════════════════════════
//  Mock 外部 API 模块
// ══════════════════════════════════════════════════════════════

vi.mock("@/api", () => ({
  login: vi.fn(),
  logout: vi.fn(),
  refreshToken: vi.fn(),
  getSystemStatus: vi.fn(),
  initRegister: vi.fn()
}));

import { useUserStore } from "@/store/modules/user";

const mockLoginResponse = {
  code: 0,
  msg: "登录成功",
  data: {
    token: "test-access-token",
    tokenType: "Bearer" as const,
    expiresIn: 7200,
    refreshToken: "test-refresh-token",
    refreshExpiresIn: 604800,
    user: {
      id: "1",
      email: "admin@example.com",
      username: "Admin",
      role: "super_admin" as const
    }
  }
};

describe("useUserStore", () => {
  beforeEach(() => {
    // 每次测试前创建新的 Pinia 实例 + 清空 Storage
    setActivePinia(createPinia());
    localStorage.clear();
  });

  // ── 初始状态 ──────────────────────────────────────────────

  describe("初始状态", () => {
    it("user 应为 null", () => {
      const store = useUserStore();
      expect(store.user).toBeNull();
    });

    it("accessToken 应为 null", () => {
      const store = useUserStore();
      expect(store.accessToken).toBeNull();
    });

    it("isLoggedIn 应为 false", () => {
      const store = useUserStore();
      expect(store.isLoggedIn).toBe(false);
    });

    it("isSuperAdmin 应为 false", () => {
      const store = useUserStore();
      expect(store.isSuperAdmin).toBe(false);
    });
  });

  // ── Token 存取 ───────────────────────────────────────────

  describe("setTokens / clearTokens", () => {
    it("setTokens 应正确写入所有状态", () => {
      const store = useUserStore();
      store.setTokens(mockLoginResponse.data);

      expect(store.accessToken).toBe("test-access-token");
      expect(store.refreshTokenValue).toBe("test-refresh-token");
      expect(store.user).toEqual(mockLoginResponse.data.user);
      expect(store.tokenExpiresAt).toBeGreaterThan(Date.now());
    });

    it("setTokens 应将 Token 和用户持久化到 localStorage", () => {
      const store = useUserStore();
      store.setTokens(mockLoginResponse.data);

      expect(localStorage.getItem("refreshToken")).toBe("test-refresh-token");
      expect(localStorage.getItem("accessToken")).toBe("test-access-token");
      expect(localStorage.getItem("frontend-user")).toBe(JSON.stringify(mockLoginResponse.data.user));
    });

    it("clearTokens 应清空所有状态和持久化数据", () => {
      const store = useUserStore();
      store.setTokens(mockLoginResponse.data);
      store.clearTokens();

      expect(store.accessToken).toBeNull();
      expect(store.refreshTokenValue).toBeNull();
      expect(store.user).toBeNull();
      expect(localStorage.getItem("refreshToken")).toBeNull();
      expect(localStorage.getItem("frontend-user")).toBeNull();
    });
  });

  // ── 状态恢复 ─────────────────────────────────────────────

  describe("restoreState", () => {
    it("应从 Storage 恢复 Token 和用户", async () => {
      localStorage.setItem("accessToken", "stored-access");
      localStorage.setItem("refreshToken", "stored-refresh");
      localStorage.setItem("tokenExpiresAt", String(Date.now() + 3600000));
      localStorage.setItem("frontend-user", JSON.stringify(mockLoginResponse.data.user));

      const store = useUserStore();
      await store.restoreState();

      expect(store.accessToken).toBe("stored-access");
      expect(store.refreshTokenValue).toBe("stored-refresh");
      expect(store.tokenExpiresAt).toBeGreaterThan(Date.now());
      expect(store.user).toEqual(mockLoginResponse.data.user);
      // 恢复后 isLoggedIn 应为 true
      expect(store.isLoggedIn).toBe(true);
    });

    it("Storage 无数据时应保持 null", async () => {
      const store = useUserStore();
      await store.restoreState();

      expect(store.accessToken).toBeNull();
      expect(store.refreshTokenValue).toBeNull();
    });

    it("accessToken 丢失但有 refreshToken 时应尝试刷新", async () => {
      localStorage.setItem("refreshToken", "test-refresh");

      const { refreshToken } = await import("@/api");
      vi.mocked(refreshToken).mockResolvedValueOnce({
        code: 0,
        msg: "ok",
        data: {
          ...mockLoginResponse.data,
          token: "refreshed-access",
          refreshToken: "new-refresh",
          refreshExpiresIn: 604800
        }
      });

      const store = useUserStore();
      await store.restoreState();

      expect(store.accessToken).toBe("refreshed-access");
      expect(localStorage.getItem("accessToken")).toBe("refreshed-access");
    });
  });

  // ── 登录流程 ─────────────────────────────────────────────

  describe("handleLogin", () => {
    it("登录成功后应写入 Token 和用户信息", async () => {
      const { login } = await import("@/api");
      vi.mocked(login).mockResolvedValueOnce(mockLoginResponse);

      const store = useUserStore();
      const res = await store.handleLogin("admin@example.com", "password123");

      expect(res).toBe(mockLoginResponse);
      expect(store.isLoggedIn).toBe(true);
      expect(store.user?.email).toBe("admin@example.com");
    });

    it("登录成功后 refreshToken 应写入 localStorage", async () => {
      const { login } = await import("@/api");
      vi.mocked(login).mockResolvedValueOnce(mockLoginResponse);

      const store = useUserStore();
      await store.handleLogin("admin@example.com", "password123");

      expect(localStorage.getItem("refreshToken")).toBe("test-refresh-token");
    });
  });

  // ── 登出流程 ─────────────────────────────────────────────

  describe("handleLogout", () => {
    it("登出应清空 Token 和用户信息", async () => {
      const store = useUserStore();
      store.setTokens(mockLoginResponse.data);

      await store.handleLogout();

      expect(store.accessToken).toBeNull();
      expect(store.refreshTokenValue).toBeNull();
      expect(store.user).toBeNull();
    });

    it("登出应清空 localStorage 中的 Token", async () => {
      const store = useUserStore();
      store.setTokens(mockLoginResponse.data);

      await store.handleLogout();

      expect(localStorage.getItem("refreshToken")).toBeNull();
    });
  });

  // ── Token 刷新 ───────────────────────────────────────────

  describe("refreshAccessToken", () => {
    it("刷新成功应更新 Token", async () => {
      localStorage.setItem("refreshToken", "old-refresh");

      const { refreshToken } = await import("@/api");
      vi.mocked(refreshToken).mockResolvedValueOnce({
        code: 0,
        msg: "ok",
        data: {
          ...mockLoginResponse.data,
          token: "new-access-token",
          refreshToken: "new-refresh-token",
          refreshExpiresIn: 604800
        }
      });

      const store = useUserStore();
      const newToken = await store.refreshAccessToken();

      expect(newToken).toBe("new-access-token");
      expect(store.accessToken).toBe("new-access-token");
      expect(store.refreshTokenValue).toBe("new-refresh-token");
    });

    it("无 refreshToken 时应返回 null", async () => {
      const store = useUserStore();
      const result = await store.refreshAccessToken();

      expect(result).toBeNull();
    });

    it("刷新失败时应清空 Token 状态", async () => {
      localStorage.setItem("refreshToken", "invalid-refresh");

      const { refreshToken } = await import("@/api");
      vi.mocked(refreshToken).mockRejectedValueOnce(new Error("刷新失败"));

      const store = useUserStore();
      const result = await store.refreshAccessToken();

      expect(result).toBeNull();
      expect(store.accessToken).toBeNull();
    });
  });

  // ── 用户资料管理 ─────────────────────────────────────────

  describe("资料管理", () => {
    it("初始 profile 应为空", () => {
      const store = useUserStore();
      expect(store.profile.avatarUrl).toBeNull();
      expect(store.profile.nickname).toBeNull();
    });

    it("setProfile 应更新指定字段", () => {
      const store = useUserStore();
      store.setProfile({ nickname: "TestUser" });

      expect(store.profile.nickname).toBe("TestUser");
      // 未指定的字段不受影响
      expect(store.profile.avatarUrl).toBeNull();
    });

    it("clearProfile 应重置所有字段", () => {
      const store = useUserStore();
      store.setProfile({
        nickname: "TestUser",
        avatarUrl: "https://example.com/avatar.png",
        bio: "Hello"
      });
      store.clearProfile();

      expect(store.profile.nickname).toBeNull();
      expect(store.profile.avatarUrl).toBeNull();
      expect(store.profile.bio).toBeNull();
    });
  });

  // ── 计算属性 ─────────────────────────────────────────────

  describe("计算属性", () => {
    it("登录后 isLoggedIn 为 true", () => {
      const store = useUserStore();
      store.setTokens(mockLoginResponse.data);

      expect(store.isLoggedIn).toBe(true);
    });

    it("超级管理员 isSuperAdmin 为 true", () => {
      const store = useUserStore();
      store.setTokens(mockLoginResponse.data);

      expect(store.isSuperAdmin).toBe(true);
    });

    it("普通用户 isSuperAdmin 为 false", () => {
      const store = useUserStore();
      store.setTokens({
        ...mockLoginResponse.data,
        user: {
          ...mockLoginResponse.data.user,
          role: "user" as const
        }
      });

      expect(store.isSuperAdmin).toBe(false);
    });

    it("Token 过期前 5 分钟 isTokenExpiring 为 true", () => {
      const store = useUserStore();
      store.setTokens(mockLoginResponse.data);
      // 模拟 Token 即将过期
      store.tokenExpiresAt = Date.now() + 3 * 60 * 1000; // 3 分钟后过期

      expect(store.isTokenExpiring).toBe(true);
    });

    it("Token 充足时 isTokenExpiring 为 false", () => {
      const store = useUserStore();
      store.setTokens(mockLoginResponse.data); // 2 小时

      expect(store.isTokenExpiring).toBe(false);
    });
  });
});
