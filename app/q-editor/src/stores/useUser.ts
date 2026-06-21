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

export const useUserStore = defineStore(
  "user",
  () => {
    // ════════════════════════════════════════════════════════════
    //  状态
    // ════════════════════════════════════════════════════════════

    const user = ref<UserInfo | null>(null);
    const accessToken = ref<string | null>(null);
    const refreshTokenValue = ref<string | null>(null);
    const systemStatus = ref<SystemStatusResponse | null>(null);
    /** Token 过期时间戳（毫秒） */
    const tokenExpiresAt = ref<number | null>(null);

    // ── 用户资料（头像、昵称等，持久化 + 跨组件共享） ──────
    const profile = ref<{
      avatarUrl: string | null;
      nickname: string | null;
      occupation: string | null;
      bio: string | null;
      interests: string[];
    }>({
      avatarUrl: null,
      nickname: null,
      occupation: null,
      bio: null,
      interests: []
    });

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
    //  Token 存取（手动存储逻辑，保持原有双 Token 策略）
    // ════════════════════════════════════════════════════════════

    /** 写入 Token + 持久化 */
    function setTokens(data: LoginResponse) {
      accessToken.value = data.token;
      refreshTokenValue.value = data.refreshToken;
      user.value = data.user;

      tokenExpiresAt.value = Date.now() + data.expiresIn * 1000;

      // 原有双 Token 存储逻辑保持不变
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

      // 原有双 Token 清除逻辑保持不变
      localStorage.removeItem(STORAGE_KEYS.refreshToken);
      sessionStorage.removeItem(STORAGE_KEYS.accessToken);
      localStorage.removeItem(STORAGE_KEYS.tokenExpiresAt);
    }

    /** 页面刷新后从 Storage 恢复 Token（保持原有逻辑） */
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
      clearProfile();
    }

    /** 获取系统状态 */
    async function fetchSystemStatus() {
      const res = await getSystemStatus();
      if (res.code === 0 && res.data) {
        systemStatus.value = res.data;
      }
      return res;
    }

    // ── 用户资料管理 ──────────────────────────────────────

    /** 从后端加载用户资料并更新 store */
    async function fetchProfile() {
      try {
        const { getProfile } = await import("@/api/modules/settings");
        const res = await getProfile();
        if (res.code === 0 && res.data) {
          profile.value = {
            avatarUrl: res.data.avatarUrl,
            nickname: res.data.nickname,
            occupation: res.data.occupation,
            bio: res.data.bio,
            interests: res.data.interests ?? []
          };
        }
      } catch {
        // 网络异常不影响正常使用，保留旧数据
      }
    }

    /** 更新本地资料缓存（各组件修改后调用） */
    function setProfile(partial: {
      avatarUrl?: string | null;
      nickname?: string | null;
      occupation?: string | null;
      bio?: string | null;
      interests?: string[];
    }) {
      if (partial.avatarUrl !== undefined) profile.value.avatarUrl = partial.avatarUrl;
      if (partial.nickname !== undefined) profile.value.nickname = partial.nickname;
      if (partial.occupation !== undefined) profile.value.occupation = partial.occupation;
      if (partial.bio !== undefined) profile.value.bio = partial.bio;
      if (partial.interests !== undefined) profile.value.interests = partial.interests;
    }

    /** 清除资料缓存（登出时调用） */
    function clearProfile() {
      profile.value = {
        avatarUrl: null,
        nickname: null,
        occupation: null,
        bio: null,
        interests: []
      };
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
      profile,
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
      // 资料
      fetchProfile,
      setProfile,
      clearProfile,
      // 刷新
      refreshAccessToken,
      checkAndRefreshToken
    };
  },
  {
    // Pinia 持久化插件配置
    // 持久化 user（认证信息）和 profile（头像/昵称等），Token 使用原有手动存储
    persist: {
      key: "q-editor-user-info",
      storage: localStorage,
      pick: ["user", "profile"]
    }
  }
);
