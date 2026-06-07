/**
 * 用户状态管理 (Pinia Store)
 *
 * 职责：
 *  - Token 存储（localStorage + Pinia 双写）
 *  - 用户信息管理
 *  - 登录/注册/登出流程
 *  - 并发 Token 刷新（队列+锁）
 *  - 页面刷新状态恢复
 */
import { defineStore } from "pinia";
import { ref, computed } from "vue";
import type { UserInfo, LoginResponse, SystemStatusResponse } from "@common/user/user.interface";
import { login as loginApi, logout as logoutApi, refreshToken as refreshTokenApi, getSystemStatus } from "@/api";

// ─── 持久化 Key ──────────────────────────────────────────────

const STORAGE_KEYS = {
  accessToken: "accessToken",
  refreshToken: "refreshToken",
  tokenExpiresAt: "tokenExpiresAt"
} as const;

// ─── Store ───────────────────────────────────────────────────

export const useUserStore = defineStore("user", () => {
  // ════════════════════════════════════════════════════════════
  //  状态
  // ════════════════════════════════════════════════════════════

  const user = ref<UserInfo | null>(null);
  const accessToken = ref<string | null>(null);
  const refreshTokenValue = ref<string | null>(null);
  const systemStatus = ref<SystemStatusResponse | null>(null);
  /** Token 过期时间戳（毫秒） */
  const tokenExpiresAt = ref<number | null>(null);

  // 并发刷新控制
  const isRefreshing = ref(false);
  const refreshQueue = ref<Array<(token: string) => void>>([]);

  // ════════════════════════════════════════════════════════════
  //  计算属性
  // ════════════════════════════════════════════════════════════

  const isLoggedIn = computed(() => !!accessToken.value && !!user.value);
  const isSuperAdmin = computed(() => user.value?.role === "super_admin");

  /** Token 是否将在 5 分钟内过期 */
  const isTokenExpiring = computed(() => {
    if (!tokenExpiresAt.value) return false;
    return Date.now() >= tokenExpiresAt.value - 5 * 60 * 1000;
  });

  // ════════════════════════════════════════════════════════════
  //  Token 存取
  // ════════════════════════════════════════════════════════════

  /** 写入 Token + 持久化 */
  function setTokens(data: LoginResponse) {
    accessToken.value = data.token;
    refreshTokenValue.value = data.refreshToken;
    user.value = data.user;

    tokenExpiresAt.value = Date.now() + data.expiresIn * 1000;

    localStorage.setItem(STORAGE_KEYS.refreshToken, data.refreshToken);
    sessionStorage.setItem(STORAGE_KEYS.accessToken, data.token);
    localStorage.setItem(STORAGE_KEYS.tokenExpiresAt, String(tokenExpiresAt.value));
  }

  /** 清除所有 Token 和用户信息 */
  function clearTokens() {
    accessToken.value = null;
    refreshTokenValue.value = null;
    user.value = null;
    tokenExpiresAt.value = null;

    localStorage.removeItem(STORAGE_KEYS.refreshToken);
    sessionStorage.removeItem(STORAGE_KEYS.accessToken);
    localStorage.removeItem(STORAGE_KEYS.tokenExpiresAt);
  }

  /** 页面刷新后从 Storage 恢复 */
  function restoreState() {
    const storedRefresh = localStorage.getItem(STORAGE_KEYS.refreshToken);
    const storedAccess = sessionStorage.getItem(STORAGE_KEYS.accessToken);
    const storedExpires = localStorage.getItem(STORAGE_KEYS.tokenExpiresAt);

    if (storedRefresh && storedAccess) {
      refreshTokenValue.value = storedRefresh;
      accessToken.value = storedAccess;
      tokenExpiresAt.value = storedExpires ? Number(storedExpires) : null;
    }
  }

  // ════════════════════════════════════════════════════════════
  //  业务方法
  // ════════════════════════════════════════════════════════════

  /** 登录 */
  async function handleLogin(email: string, password: string) {
    const res = await loginApi({ email, password });
    if (res.code === 0 && res.data) {
      setTokens(res.data);
    }
    return res;
  }

  /** 初始化注册 */
  async function handleInitRegister(email: string, password: string, username?: string) {
    const res = await (await import("@/api")).initRegister({ email, password, username });
    if (res.code === 0 && res.data) {
      setTokens(res.data);
    }
    return res;
  }

  /** 登出 */
  async function handleLogout() {
    try {
      await logoutApi();
    } catch {
      // 即便后端登出失败也清除本地状态
    }
    clearTokens();
  }

  /** 获取系统状态 */
  async function fetchSystemStatus() {
    const res = await getSystemStatus();
    if (res.code === 0 && res.data) {
      systemStatus.value = res.data;
    }
    return res;
  }

  // ════════════════════════════════════════════════════════════
  //  Token 刷新（队列+锁并发控制）
  // ════════════════════════════════════════════════════════════

  /**
   * 刷新 Access Token
   *
   * - 若已有刷新进行中，将回调加入队列等待
   * - 若无刷新进行中，加锁后发起刷新
   * - 刷新成功后通知队列中所有等待者
   *
   * @returns 新的 Access Token，刷新失败返回 null
   */
  async function refreshAccessToken(): Promise<string | null> {
    // 已有人在刷新 → 加入等待队列
    if (isRefreshing.value) {
      return new Promise(resolve => {
        refreshQueue.value.push(resolve);
      });
    }

    const storedRefresh = localStorage.getItem(STORAGE_KEYS.refreshToken);
    if (!storedRefresh) return null;

    isRefreshing.value = true;

    try {
      const res = await refreshTokenApi({ refreshToken: storedRefresh });
      if (res.code === 0 && res.data) {
        setTokens(res.data);

        // 通知队列中所有等待的请求
        refreshQueue.value.forEach(resolve => resolve(res.data!.token));
        refreshQueue.value = [];

        return res.data.token;
      }

      // 刷新失败 → 清除状态
      refreshQueue.value = [];
      clearTokens();
      return null;
    } catch {
      refreshQueue.value = [];
      clearTokens();
      return null;
    } finally {
      isRefreshing.value = false;
    }
  }

  /** 主动提前刷新（主动过期前 5 分钟调用） */
  async function checkAndRefreshToken() {
    if (isTokenExpiring.value && !isRefreshing.value) {
      await refreshAccessToken();
    }
  }

  // ════════════════════════════════════════════════════════════
  //  导出
  // ════════════════════════════════════════════════════════════

  return {
    // 状态
    user,
    accessToken,
    refreshTokenValue,
    systemStatus,
    tokenExpiresAt,
    isRefreshing,
    // 计算属性
    isLoggedIn,
    isSuperAdmin,
    isTokenExpiring,
    // Token
    setTokens,
    clearTokens,
    restoreState,
    // 业务
    handleLogin,
    handleInitRegister,
    handleLogout,
    fetchSystemStatus,
    // 刷新
    refreshAccessToken,
    checkAndRefreshToken
  };
});
