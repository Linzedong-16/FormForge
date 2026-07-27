/**
 * useUserStore 单元测试
 *
 * 测试范围：
 *   1. 初始化默认值 / computed 属性
 *   2. Token 存取（setTokens / clearTokens / restoreState）
 *   3. 登录/注册/登出流程（handleLogin / handleInitRegister / handleLogout）
 *   4. 用户资料管理（fetchProfile / setProfile / clearProfile）
 *   5. Token 刷新（refreshAccessToken / checkAndRefreshToken）
 *   6. 系统状态（fetchSystemStatus）
 *   7. 登出清理（handleLogoutAndClear / checkUnsyncedSurveys）
 *   8. 并发刷新队列
 *   9. 边界场景
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import type { LoginResponse, SystemStatusResponse, UserProfileResponse } from "@common/user/user.interface";

// ─── Mock 工厂（vi.hoisted 确保在模块加载前生效） ──────────────

const mockLoginApi = vi.hoisted(() => vi.fn());
const mockLogoutApi = vi.hoisted(() => vi.fn());
const mockRefreshTokenApi = vi.hoisted(() => vi.fn());
const mockGetSystemStatus = vi.hoisted(() => vi.fn());
const mockInitRegister = vi.hoisted(() => vi.fn());
const mockGetProfile = vi.hoisted(() => vi.fn());
const mockClearAllSurveys = vi.hoisted(() => vi.fn());
const mockFlushLogs = vi.hoisted(() => vi.fn());
const mockGetUnsyncedSurveyCount = vi.hoisted(() => vi.fn());
const mockGetUnsyncedSurveyTitles = vi.hoisted(() => vi.fn());

vi.mock("@/api", () => ({
  login: mockLoginApi,
  logout: mockLogoutApi,
  refreshToken: mockRefreshTokenApi,
  getSystemStatus: mockGetSystemStatus,
  initRegister: mockInitRegister
}));

vi.mock("@/api/modules/settings", () => ({
  getProfile: mockGetProfile
}));

vi.mock("@/db/operation", () => ({
  clearAllSurveys: mockClearAllSurveys,
  flushLogs: mockFlushLogs,
  getUnsyncedSurveyCount: mockGetUnsyncedSurveyCount,
  getUnsyncedSurveyTitles: mockGetUnsyncedSurveyTitles
}));

import { useUserStore } from "../useUser";

// ─── 工厂函数 ──────────────────────────────────────────────────

const API_OK = { code: 0, data: null, msg: "ok" };

function apiOk<T>(data: T) {
  return { code: 0, data, msg: "ok" };
}

function apiFail(code = 1, msg = "error") {
  return { code, data: null, msg };
}

function makeLoginResponse(overrides: Partial<LoginResponse> = {}): LoginResponse {
  return {
    token: "access-token-mock",
    refreshToken: "refresh-token-mock",
    tokenType: "Bearer",
    expiresIn: 7200,
    refreshExpiresIn: 604800,
    user: {
      id: "1",
      email: "test@example.com",
      username: "testuser",
      role: "user"
    },
    ...overrides
  } as LoginResponse;
}

function makeSystemStatusResponse(overrides: Partial<SystemStatusResponse> = {}): SystemStatusResponse {
  return {
    initialized: true,
    registrationEnabled: true,
    registrationMode: "email_verify",
    smtpConfigured: true,
    ...overrides
  };
}

function makeProfileResponse(overrides: Partial<UserProfileResponse> = {}): UserProfileResponse {
  return {
    userId: "1",
    email: "test@example.com",
    username: "testuser",
    avatarUrl: "https://example.com/avatar.png",
    nickname: "TestUser",
    occupation: "Engineer",
    bio: "Hello world",
    interests: ["coding", "reading"],
    boundEmail: "test@example.com",
    emailVerified: true,
    ...overrides
  };
}

// ─── 常量 ──────────────────────────────────────────────────────

const STORAGE_KEYS = {
  accessToken: "accessToken",
  refreshToken: "refreshToken",
  tokenExpiresAt: "tokenExpiresAt"
};

// ═══════════════════════════════════════════════════════════════
//  测试套件
// ═══════════════════════════════════════════════════════════════

describe("useUserStore", () => {
  let store: ReturnType<typeof useUserStore>;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    setActivePinia(createPinia());
    store = useUserStore();

    // 重置所有 mock
    mockLoginApi.mockReset();
    mockLogoutApi.mockReset();
    mockRefreshTokenApi.mockReset();
    mockGetSystemStatus.mockReset();
    mockInitRegister.mockReset();
    mockGetProfile.mockReset();
    mockClearAllSurveys.mockReset();
    mockFlushLogs.mockReset();
    mockGetUnsyncedSurveyCount.mockReset();
    mockGetUnsyncedSurveyTitles.mockReset();
  });

  // ═══════════════════════════════════════════════════════════════
  //  1. 初始化默认值
  // ═══════════════════════════════════════════════════════════════

  describe("初始化默认值", () => {
    it("1. accessToken 初始值为 null", () => {
      expect(store.accessToken).toBeNull();
    });

    it("2. refreshTokenValue 初始值为 null", () => {
      expect(store.refreshTokenValue).toBeNull();
    });

    it("3. user 初始值为 null", () => {
      expect(store.user).toBeNull();
    });

    it("4. tokenExpiresAt 初始值为 null", () => {
      expect(store.tokenExpiresAt).toBeNull();
    });

    it("5. profile 初始值为默认值", () => {
      expect(store.profile).toEqual({
        avatarUrl: null,
        nickname: null,
        occupation: null,
        bio: null,
        interests: []
      });
    });

    it("6. systemStatus 初始值为 null", () => {
      expect(store.systemStatus).toBeNull();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  2. computed 属性
  // ═══════════════════════════════════════════════════════════════

  describe("computed: isLoggedIn", () => {
    it("7. 初始状态下 isLoggedIn 应为 false", () => {
      expect(store.isLoggedIn).toBe(false);
    });

    it("8. 仅有 accessToken 没有 user 时 isLoggedIn 应为 false", () => {
      store.accessToken = "some-token";
      expect(store.isLoggedIn).toBe(false);
    });

    it("9. 仅有 user 没有 accessToken 时 isLoggedIn 应为 false", () => {
      store.user = { id: "1", email: "a@b.com", username: "u", role: "user" };
      expect(store.isLoggedIn).toBe(false);
    });

    it("10. 同时有 accessToken 和 user 时 isLoggedIn 应为 true", () => {
      store.accessToken = "some-token";
      store.user = { id: "1", email: "a@b.com", username: "u", role: "user" };
      expect(store.isLoggedIn).toBe(true);
    });
  });

  describe("computed: isSuperAdmin", () => {
    it("11. user 为 null 时 isSuperAdmin 应为 false", () => {
      expect(store.isSuperAdmin).toBe(false);
    });

    it("12. user.role 为 super_admin 时 isSuperAdmin 应为 true", () => {
      store.user = { id: "1", email: "admin@b.com", username: "admin", role: "super_admin" };
      expect(store.isSuperAdmin).toBe(true);
    });

    it("13. user.role 为 user 时 isSuperAdmin 应为 false", () => {
      store.user = { id: "1", email: "u@b.com", username: "u", role: "user" };
      expect(store.isSuperAdmin).toBe(false);
    });
  });

  describe("computed: isTokenExpiring", () => {
    it("14. tokenExpiresAt 为 null 时 isTokenExpiring 应为 false", () => {
      expect(store.isTokenExpiring).toBe(false);
    });

    it("15. Token 在 5 分钟以内过期时 isTokenExpiring 应为 true", () => {
      store.tokenExpiresAt = Date.now() + 3 * 60 * 1000; // 3 分钟后过期
      expect(store.isTokenExpiring).toBe(true);
    });

    it("16. Token 正好在 5 分钟时过期，isTokenExpiring 应为 true", () => {
      store.tokenExpiresAt = Date.now() + 5 * 60 * 1000;
      expect(store.isTokenExpiring).toBe(true);
    });

    it("17. Token 在 10 分钟后过期时 isTokenExpiring 应为 false", () => {
      store.tokenExpiresAt = Date.now() + 10 * 60 * 1000;
      expect(store.isTokenExpiring).toBe(false);
    });

    it("18. Token 已过期时 isTokenExpiring 应为 true", () => {
      store.tokenExpiresAt = Date.now() - 1 * 60 * 1000; // 1 分钟前已过期
      expect(store.isTokenExpiring).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  3. Token 存取 — setTokens
  // ═══════════════════════════════════════════════════════════════

  describe("setTokens", () => {
    it("19. setTokens 应设置所有 token 值和 user", () => {
      const data = makeLoginResponse();
      store.setTokens(data);

      expect(store.accessToken).toBe(data.token);
      expect(store.refreshTokenValue).toBe(data.refreshToken);
      expect(store.user).toEqual(data.user);
      expect(store.tokenExpiresAt).toBeGreaterThan(Date.now());
    });

    it("20. setTokens 应将 refreshToken 存入 localStorage", () => {
      const data = makeLoginResponse();
      store.setTokens(data);

      expect(localStorage.getItem(STORAGE_KEYS.refreshToken)).toBe(data.refreshToken);
    });

    it("21. setTokens 应将 accessToken 存入 sessionStorage", () => {
      const data = makeLoginResponse();
      store.setTokens(data);

      expect(sessionStorage.getItem(STORAGE_KEYS.accessToken)).toBe(data.token);
    });

    it("22. setTokens 应将 tokenExpiresAt 存入 localStorage", () => {
      const data = makeLoginResponse();
      store.setTokens(data);

      const stored = localStorage.getItem(STORAGE_KEYS.tokenExpiresAt);
      expect(stored).not.toBeNull();
      expect(Number(stored)).toBe(store.tokenExpiresAt);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  4. Token 存取 — clearTokens
  // ═══════════════════════════════════════════════════════════════

  describe("clearTokens", () => {
    it("23. clearTokens 应清除所有 ref 值", () => {
      const data = makeLoginResponse();
      store.setTokens(data);
      store.clearTokens();

      expect(store.accessToken).toBeNull();
      expect(store.refreshTokenValue).toBeNull();
      expect(store.user).toBeNull();
      expect(store.tokenExpiresAt).toBeNull();
    });

    it("24. clearTokens 应从 localStorage 中移除 refreshToken", () => {
      localStorage.setItem(STORAGE_KEYS.refreshToken, "some-refresh");
      store.clearTokens();

      expect(localStorage.getItem(STORAGE_KEYS.refreshToken)).toBeNull();
    });

    it("25. clearTokens 应从 sessionStorage 中移除 accessToken", () => {
      sessionStorage.setItem(STORAGE_KEYS.accessToken, "some-access");
      store.clearTokens();

      expect(sessionStorage.getItem(STORAGE_KEYS.accessToken)).toBeNull();
    });

    it("26. clearTokens 应从 localStorage 中移除 tokenExpiresAt", () => {
      localStorage.setItem(STORAGE_KEYS.tokenExpiresAt, "123456789");
      store.clearTokens();

      expect(localStorage.getItem(STORAGE_KEYS.tokenExpiresAt)).toBeNull();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  5. Token 存取 — restoreState
  // ═══════════════════════════════════════════════════════════════

  describe("restoreState", () => {
    it("27. restoreState 应从 localStorage 恢复 refreshToken", () => {
      localStorage.setItem(STORAGE_KEYS.refreshToken, "stored-refresh");
      sessionStorage.setItem(STORAGE_KEYS.accessToken, "stored-access");

      store.restoreState();

      expect(store.refreshTokenValue).toBe("stored-refresh");
    });

    it("28. restoreState 应从 sessionStorage 恢复 accessToken", () => {
      localStorage.setItem(STORAGE_KEYS.refreshToken, "stored-refresh");
      sessionStorage.setItem(STORAGE_KEYS.accessToken, "stored-access");

      store.restoreState();

      expect(store.accessToken).toBe("stored-access");
    });

    it("29. restoreState 应恢复 tokenExpiresAt", () => {
      localStorage.setItem(STORAGE_KEYS.refreshToken, "stored-refresh");
      sessionStorage.setItem(STORAGE_KEYS.accessToken, "stored-access");
      localStorage.setItem(STORAGE_KEYS.tokenExpiresAt, "1700000000000");

      store.restoreState();

      expect(store.tokenExpiresAt).toBe(1700000000000);
    });

    it("30. restoreState 没有 tokenExpiresAt 时应设为 null", () => {
      localStorage.setItem(STORAGE_KEYS.refreshToken, "stored-refresh");
      sessionStorage.setItem(STORAGE_KEYS.accessToken, "stored-access");
      // 不设置 tokenExpiresAt

      store.restoreState();

      expect(store.tokenExpiresAt).toBeNull();
    });

    it("31. restoreState 当 localStorage 中没有 token 时不做任何操作", () => {
      // 初始状态已经是 null
      store.restoreState();

      expect(store.refreshTokenValue).toBeNull();
      expect(store.accessToken).toBeNull();
      expect(store.tokenExpiresAt).toBeNull();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  6. 登录流程 — handleLogin
  // ═══════════════════════════════════════════════════════════════

  describe("handleLogin", () => {
    it("32. 登录成功（code === 0）应调用 setTokens 设置 token", async () => {
      const data = makeLoginResponse();
      mockLoginApi.mockResolvedValue(apiOk(data));

      const res = await store.handleLogin("test@example.com", "password123");

      expect(res.code).toBe(0);
      expect(store.accessToken).toBe(data.token);
      expect(store.refreshTokenValue).toBe(data.refreshToken);
      expect(store.user).toEqual(data.user);
      expect(store.isLoggedIn).toBe(true);
    });

    it("33. 登录失败（code !== 0）不应设置 token", async () => {
      mockLoginApi.mockResolvedValue(apiFail(1007, "密码错误"));

      const res = await store.handleLogin("test@example.com", "wrongpass");

      expect(res.code).toBe(1007);
      expect(store.accessToken).toBeNull();
      expect(store.user).toBeNull();
      expect(store.isLoggedIn).toBe(false);
    });

    it("34. 登录成功但 data 为 null 时不应设置 token", async () => {
      mockLoginApi.mockResolvedValue({ code: 0, data: null, msg: "ok" });

      await store.handleLogin("test@example.com", "password123");

      expect(store.accessToken).toBeNull();
      expect(store.user).toBeNull();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  7. 注册流程 — handleInitRegister
  // ═══════════════════════════════════════════════════════════════

  describe("handleInitRegister", () => {
    it("35. 初始化注册成功应设置 token", async () => {
      const data = makeLoginResponse({
        user: { id: "1", email: "admin@b.com", username: "admin", role: "super_admin" }
      });
      mockInitRegister.mockResolvedValue(apiOk(data));

      const res = await store.handleInitRegister("admin@b.com", "Password123", "admin");

      expect(res.code).toBe(0);
      expect(store.accessToken).toBe(data.token);
      expect(store.refreshTokenValue).toBe(data.refreshToken);
      expect(store.isSuperAdmin).toBe(true);
    });

    it("36. 初始化注册失败不应设置 token", async () => {
      mockInitRegister.mockResolvedValue(apiFail(1008));

      await store.handleInitRegister("admin@b.com", "Password123");

      expect(store.accessToken).toBeNull();
      expect(store.user).toBeNull();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  8. 登出流程 — handleLogout
  // ═══════════════════════════════════════════════════════════════

  describe("handleLogout", () => {
    it("37. 登出成功后应清除 token 和 profile", async () => {
      // 先设置登录状态
      const data = makeLoginResponse();
      store.setTokens(data);
      store.setProfile({ nickname: "Test" });
      mockLogoutApi.mockResolvedValue(apiOk(null));

      await store.handleLogout();

      expect(store.accessToken).toBeNull();
      expect(store.refreshTokenValue).toBeNull();
      expect(store.user).toBeNull();
      expect(store.profile.nickname).toBeNull();
    });

    it("38. 即便 API 调用失败也应清除本地 token", async () => {
      const data = makeLoginResponse();
      store.setTokens(data);
      mockLogoutApi.mockRejectedValue(new Error("Network Error"));

      await store.handleLogout();

      expect(store.accessToken).toBeNull();
      expect(store.refreshTokenValue).toBeNull();
      expect(store.user).toBeNull();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  9. 用户资料管理 — setProfile / clearProfile
  // ═══════════════════════════════════════════════════════════════

  describe("setProfile", () => {
    it("39. setProfile 应更新指定字段", () => {
      store.setProfile({ nickname: "NewName", occupation: "Designer" });

      expect(store.profile.nickname).toBe("NewName");
      expect(store.profile.occupation).toBe("Designer");
    });

    it("40. setProfile 只应更新传入的字段，未传入的字段保持不变", () => {
      store.setProfile({ nickname: "NewName" });

      expect(store.profile.nickname).toBe("NewName");
      expect(store.profile.avatarUrl).toBeNull();
      expect(store.profile.occupation).toBeNull();
      expect(store.profile.bio).toBeNull();
      expect(store.profile.interests).toEqual([]);
    });

    it("41. setProfile 应支持更新 interests", () => {
      store.setProfile({ interests: ["music", "sports"] });

      expect(store.profile.interests).toEqual(["music", "sports"]);
    });
  });

  describe("clearProfile", () => {
    it("42. clearProfile 应将 profile 重置为默认值", () => {
      store.setProfile({
        avatarUrl: "https://example.com/avatar.png",
        nickname: "Test",
        occupation: "Engineer",
        bio: "Hello",
        interests: ["coding"]
      });

      store.clearProfile();

      expect(store.profile).toEqual({
        avatarUrl: null,
        nickname: null,
        occupation: null,
        bio: null,
        interests: []
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  10. fetchProfile
  // ═══════════════════════════════════════════════════════════════

  describe("fetchProfile", () => {
    it("43. fetchProfile 成功时应更新 profile", async () => {
      const profileData = makeProfileResponse();
      mockGetProfile.mockResolvedValue(apiOk(profileData));

      await store.fetchProfile();

      expect(store.profile.avatarUrl).toBe(profileData.avatarUrl);
      expect(store.profile.nickname).toBe(profileData.nickname);
      expect(store.profile.occupation).toBe(profileData.occupation);
      expect(store.profile.bio).toBe(profileData.bio);
      expect(store.profile.interests).toEqual(profileData.interests);
    });

    it("44. fetchProfile 失败时 profile 应保持不变", async () => {
      store.setProfile({ nickname: "OldName" });
      mockGetProfile.mockRejectedValue(new Error("Network Error"));

      await store.fetchProfile();

      expect(store.profile.nickname).toBe("OldName");
    });

    it("45. fetchProfile code !== 0 时 profile 应保持不变", async () => {
      store.setProfile({ nickname: "OldName" });
      mockGetProfile.mockResolvedValue(apiFail());

      await store.fetchProfile();

      expect(store.profile.nickname).toBe("OldName");
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  11. fetchSystemStatus
  // ═══════════════════════════════════════════════════════════════

  describe("fetchSystemStatus", () => {
    it("46. fetchSystemStatus 成功时应更新 systemStatus", async () => {
      const statusData = makeSystemStatusResponse();
      mockGetSystemStatus.mockResolvedValue(apiOk(statusData));

      const res = await store.fetchSystemStatus();

      expect(res.code).toBe(0);
      expect(store.systemStatus).toEqual(statusData);
    });

    it("47. fetchSystemStatus 失败时 systemStatus 应保持不变", async () => {
      store.systemStatus = makeSystemStatusResponse({ initialized: false });
      mockGetSystemStatus.mockResolvedValue(apiFail());

      await store.fetchSystemStatus();

      expect(store.systemStatus!.initialized).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  12. Token 刷新 — refreshAccessToken
  // ═══════════════════════════════════════════════════════════════

  describe("refreshAccessToken", () => {
    it("48. 没有 refreshToken 在 localStorage 时应返回 null", async () => {
      const result = await store.refreshAccessToken();

      expect(result).toBeNull();
      expect(mockRefreshTokenApi).not.toHaveBeenCalled();
    });

    it("49. 刷新成功时应返回新 token 并更新状态", async () => {
      localStorage.setItem(STORAGE_KEYS.refreshToken, "old-refresh");
      const newData = makeLoginResponse({
        token: "new-access-token",
        refreshToken: "new-refresh-token"
      });
      mockRefreshTokenApi.mockResolvedValue(apiOk(newData));

      const result = await store.refreshAccessToken();

      expect(result).toBe("new-access-token");
      expect(store.accessToken).toBe("new-access-token");
      expect(store.refreshTokenValue).toBe("new-refresh-token");
      expect(store.user).toEqual(newData.user);
    });

    it("50. 刷新失败时应清除 token 并返回 null", async () => {
      localStorage.setItem(STORAGE_KEYS.refreshToken, "old-refresh");
      // 先设置登录状态
      const data = makeLoginResponse();
      store.setTokens(data);
      mockRefreshTokenApi.mockRejectedValue(new Error("Refresh failed"));

      const result = await store.refreshAccessToken();

      expect(result).toBeNull();
      expect(store.accessToken).toBeNull();
      expect(store.refreshTokenValue).toBeNull();
      expect(store.user).toBeNull();
    });

    it("51. API 返回 code !== 0 时应清除 token 并返回 null", async () => {
      localStorage.setItem(STORAGE_KEYS.refreshToken, "old-refresh");
      const data = makeLoginResponse();
      store.setTokens(data);
      mockRefreshTokenApi.mockResolvedValue(apiFail(1005, "Token expired"));

      const result = await store.refreshAccessToken();

      expect(result).toBeNull();
      expect(store.accessToken).toBeNull();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  13. 并发刷新队列
  // ═══════════════════════════════════════════════════════════════

  describe("并发刷新队列", () => {
    it("52. 并发刷新请求应排队，共享同一个刷新结果", async () => {
      localStorage.setItem(STORAGE_KEYS.refreshToken, "old-refresh");
      const newData = makeLoginResponse({ token: "new-token", refreshToken: "new-refresh" });

      // 让第一个刷新请求挂起
      let resolveRefresh: (value: unknown) => void;
      const refreshPromise = new Promise(resolve => {
        resolveRefresh = resolve;
      });
      mockRefreshTokenApi.mockReturnValue(refreshPromise);

      // 发起两个并发刷新请求
      const promise1 = store.refreshAccessToken();
      const promise2 = store.refreshAccessToken();

      // 此时 API 应只被调用一次
      expect(mockRefreshTokenApi).toHaveBeenCalledTimes(1);

      // 完成刷新
      resolveRefresh!(apiOk(newData));

      const [result1, result2] = await Promise.all([promise1, promise2]);

      expect(result1).toBe("new-token");
      expect(result2).toBe("new-token");
      expect(mockRefreshTokenApi).toHaveBeenCalledTimes(1);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  14. checkAndRefreshToken
  // ═══════════════════════════════════════════════════════════════

  describe("checkAndRefreshToken", () => {
    it("53. Token 即将过期时应调用 refreshAccessToken", async () => {
      localStorage.setItem(STORAGE_KEYS.refreshToken, "old-refresh");
      const newData = makeLoginResponse({ token: "new-token" });
      mockRefreshTokenApi.mockResolvedValue(apiOk(newData));

      // 设置 token 在 3 分钟后过期
      store.tokenExpiresAt = Date.now() + 3 * 60 * 1000;

      await store.checkAndRefreshToken();

      expect(mockRefreshTokenApi).toHaveBeenCalledTimes(1);
      expect(store.accessToken).toBe("new-token");
    });

    it("54. Token 未过期时不应调用 refreshAccessToken", async () => {
      store.tokenExpiresAt = Date.now() + 30 * 60 * 1000; // 30 分钟后过期

      await store.checkAndRefreshToken();

      expect(mockRefreshTokenApi).not.toHaveBeenCalled();
    });

    it("55. Token 即将过期但正在刷新中时不应重复调用", async () => {
      localStorage.setItem(STORAGE_KEYS.refreshToken, "old-refresh");
      store.tokenExpiresAt = Date.now() + 3 * 60 * 1000;
      store.isRefreshing = true; // 模拟正在刷新

      await store.checkAndRefreshToken();

      expect(mockRefreshTokenApi).not.toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  15. handleLogoutAndClear
  // ═══════════════════════════════════════════════════════════════

  describe("handleLogoutAndClear", () => {
    it("56. handleLogoutAndClear 应调用 clearAllSurveys 和 handleLogout", async () => {
      mockClearAllSurveys.mockResolvedValue(true);
      mockFlushLogs.mockReturnValue([]);
      mockLogoutApi.mockResolvedValue(apiOk(null));

      await store.handleLogoutAndClear();

      expect(mockClearAllSurveys).toHaveBeenCalledTimes(1);
      expect(mockLogoutApi).toHaveBeenCalledTimes(1);
    });

    it("57. handleLogoutAndClear 即使 clearAllSurveys 失败也应执行登出", async () => {
      mockClearAllSurveys.mockRejectedValue(new Error("IndexedDB error"));
      mockFlushLogs.mockReturnValue([]);
      mockLogoutApi.mockResolvedValue(apiOk(null));

      await store.handleLogoutAndClear();

      // 即使 IndexedDB 清理失败，登出仍应执行
      expect(mockLogoutApi).toHaveBeenCalledTimes(1);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  16. checkUnsyncedSurveys
  // ═══════════════════════════════════════════════════════════════

  describe("checkUnsyncedSurveys", () => {
    it("58. checkUnsyncedSurveys 应返回未同步问卷的数量和标题", async () => {
      mockGetUnsyncedSurveyCount.mockResolvedValue(3);
      mockGetUnsyncedSurveyTitles.mockResolvedValue([
        { title: "问卷A", id: 1 },
        { title: "问卷B", id: 2 },
        { title: "问卷C", id: 3 }
      ]);

      const result = await store.checkUnsyncedSurveys();

      expect(result.count).toBe(3);
      expect(result.titles).toEqual(["问卷A", "问卷B", "问卷C"]);
    });

    it("59. checkUnsyncedSurveys 异常时应返回空结果", async () => {
      mockGetUnsyncedSurveyCount.mockRejectedValue(new Error("DB error"));

      const result = await store.checkUnsyncedSurveys();

      expect(result.count).toBe(0);
      expect(result.titles).toEqual([]);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  17. 边界场景
  // ═══════════════════════════════════════════════════════════════

  describe("边界场景", () => {
    it("60. 连续 setTokens 后 clearTokens 应完全清除状态", () => {
      const data1 = makeLoginResponse({ token: "token1" });
      const data2 = makeLoginResponse({ token: "token2" });

      store.setTokens(data1);
      store.setTokens(data2);
      store.clearTokens();

      expect(store.accessToken).toBeNull();
      expect(store.refreshTokenValue).toBeNull();
      expect(store.user).toBeNull();
      expect(store.tokenExpiresAt).toBeNull();
      expect(localStorage.getItem(STORAGE_KEYS.refreshToken)).toBeNull();
      expect(sessionStorage.getItem(STORAGE_KEYS.accessToken)).toBeNull();
    });

    it("61. 登录后登出再登录，token 应正确更新", async () => {
      const data1 = makeLoginResponse({ token: "token1", user: { id: "1", email: "a@b.com", username: "a", role: "user" } });
      const data2 = makeLoginResponse({ token: "token2", user: { id: "2", email: "b@b.com", username: "b", role: "super_admin" } });

      // 第一次登录
      mockLoginApi.mockResolvedValue(apiOk(data1));
      await store.handleLogin("a@b.com", "pass");
      expect(store.accessToken).toBe("token1");

      // 登出
      mockLogoutApi.mockResolvedValue(apiOk(null));
      await store.handleLogout();
      expect(store.accessToken).toBeNull();

      // 第二次登录
      mockLoginApi.mockResolvedValue(apiOk(data2));
      await store.handleLogin("b@b.com", "pass");
      expect(store.accessToken).toBe("token2");
      expect(store.isSuperAdmin).toBe(true);
    });
  });
});