/**
 * 用户状态管理 (Pinia Store)
 *
 * 职责：
 *  - Token 存储（localStorage + sessionStorage 双写，axios 拦截器直接读取）
 *  - 用户信息管理（Pinia persist 持久化到 localStorage）
 *  - 登录/注册/登出流程
 *  - 并发 Token 刷新（队列+锁）
 *  - 页面刷新状态恢复
 *  - 用户资料管理（头像/昵称/职业/简介/兴趣，对接后端 /api/user/profile）
 *
 * 架构参考：app/q-editor/src/stores/useUser.ts
 */
import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { qiankunWindow } from "vite-plugin-qiankun/es/helper";
import { BizCode } from "@common/user/user.interface";
import {
  login as loginApi,
  logout as logoutApi,
  refreshToken as refreshTokenApi,
  getSystemStatus,
  type UserInfo,
  type LoginResponse,
  type SystemStatusResponse
} from "@/api";

import { getProfile as getProfileApi } from "@/api/modules/user";

// ─── 持久化 Key ──────────────────────────────────────────────

const STORAGE_KEYS = {
  accessToken: "accessToken",
  refreshToken: "refreshToken",
  tokenExpiresAt: "tokenExpiresAt",
  /** 用户基本信息（id/email/username/role），与 Pinia persist 双写，确保刷新时 restoreState 不依赖时序 */
  user: "frontend-user"
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

    // ── 用户资料（持久化 + 跨组件共享） ──────────────────
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

    // 并发刷新控制（刷新失败时向队列 resolve(null)，避免并发请求永久挂起）
    const isRefreshing = ref(false);
    const refreshQueue = ref<Array<(token: string | null) => void>>([]);

    // ════════════════════════════════════════════════════════════
    //  计算属性
    // ════════════════════════════════════════════════════════════

    /** 是否已登录 */
    const isLoggedIn = computed(() => !!accessToken.value && !!user.value);

    /** 是否为超级管理员 */
    const isSuperAdmin = computed(() => user.value?.role === "super_admin");

    /** Token 是否将在 5 分钟内过期 */
    const isTokenExpiring = computed(() => {
      if (!tokenExpiresAt.value) return false;
      return Date.now() >= tokenExpiresAt.value - 5 * 60 * 1000;
    });

    // ════════════════════════════════════════════════════════════
    //  Token 存取
    // ════════════════════════════════════════════════════════════

    /**
     * 写入 Token + 持久化
     *
     * - accessToken  → localStorage（axios 拦截器读取）
     * - refreshToken → localStorage（长期，跨标签共享，刷新用）
     * - tokenExpiresAt → localStorage
     * - user + profile → Pinia persist 自动同步到 localStorage
     */
    function setTokens(data: LoginResponse) {
      accessToken.value = data.token;
      refreshTokenValue.value = data.refreshToken;
      user.value = data.user;

      tokenExpiresAt.value = Date.now() + data.expiresIn * 1000;

      // Token 持久化
      localStorage.setItem(STORAGE_KEYS.refreshToken, data.refreshToken);
      localStorage.setItem(STORAGE_KEYS.accessToken, data.token);
      localStorage.setItem(STORAGE_KEYS.tokenExpiresAt, String(tokenExpiresAt.value));
      // 用户信息双写：手动 key + Pinia persist 自动同步
      localStorage.setItem(STORAGE_KEYS.user, JSON.stringify(data.user));
    }

    /** 清除所有 Token 和用户信息 */
    function clearTokens() {
      accessToken.value = null;
      refreshTokenValue.value = null;
      user.value = null;
      tokenExpiresAt.value = null;

      localStorage.removeItem(STORAGE_KEYS.refreshToken);
      localStorage.removeItem(STORAGE_KEYS.accessToken);
      localStorage.removeItem(STORAGE_KEYS.tokenExpiresAt);
      localStorage.removeItem(STORAGE_KEYS.user);
    }

    /**
     * 页面刷新后从 Storage 恢复登录态
     *
     * 直接读 localStorage，不依赖 Pinia persist 的 hydration 时序
     */
    async function restoreState() {
      const storedRefresh = localStorage.getItem(STORAGE_KEYS.refreshToken);
      const storedAccess = localStorage.getItem(STORAGE_KEYS.accessToken);
      const storedExpires = localStorage.getItem(STORAGE_KEYS.tokenExpiresAt);
      const storedUser = localStorage.getItem(STORAGE_KEYS.user);

      // 恢复用户信息（直接从 localStorage 读，不用等 Pinia persist）
      if (storedUser) {
        try {
          user.value = JSON.parse(storedUser);
        } catch {
          localStorage.removeItem(STORAGE_KEYS.user);
        }
      }

      if (storedRefresh && storedAccess) {
        refreshTokenValue.value = storedRefresh;
        accessToken.value = storedAccess;
        tokenExpiresAt.value = storedExpires ? Number(storedExpires) : null;
        return;
      }

      // accessToken 丢失但 refreshToken 还在 → 静默刷新
      if (storedRefresh && !storedAccess) {
        await refreshAccessToken();
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
        await logoutApi({ refreshToken: refreshTokenValue.value ?? undefined });
      } catch {
        // 即便后端登出失败也清除本地状态
      }
      clearTokens();
      clearProfile();
    }

    /**
     * 强制登出并跳转登录页 —— Refresh Token 失效场景的唯一清空+跳转入口
     *
     * qiankun 子应用场景下需跳转到本子应用自己的登录页（/admin/login），
     * 而非主壳根路径 /login（main-app 未注册该路由，直接跳会 404）
     */
    function forceLogoutToLogin() {
      clearTokens();
      clearProfile();
      window.location.href = qiankunWindow.__POWERED_BY_QIANKUN__ ? "/admin/login" : "/login";
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

    /** 从后端加载用户资料（对接 /api/user/profile） */
    async function fetchProfile() {
      try {
        const res = await getProfileApi();
        if (res.code === 0 && res.data) {
          profile.value = {
            avatarUrl: res.data.avatarUrl ?? null,
            nickname: res.data.nickname ?? null,
            occupation: res.data.occupation ?? null,
            bio: res.data.bio ?? null,
            interests: res.data.interests ?? []
          };
        }
      } catch {
        // 网络异常不影响正常使用，保留旧数据
      }
    }

    /** 更新本地资料缓存 */
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

        // 防御性兜底：非 2xx 但业务码非 0（正常链路不会走到，authClient 对失败响应会走 catch 分支）
        refreshQueue.value.forEach(resolve => resolve(null));
        refreshQueue.value = [];
        clearTokens();
        return null;
      } catch (err) {
        const bizCode = (err as Error & { bizCode?: number }).bizCode;

        // 无论何种失败原因，先唤醒所有排队等待者，避免并发请求永久挂起
        refreshQueue.value.forEach(resolve => resolve(null));
        refreshQueue.value = [];

        if (bizCode === BizCode.RefreshTokenInvalid) {
          // Refresh Token 失效的唯一响应码 —— 立即清空状态并跳转登录
          forceLogoutToLogin();
        } else {
          // 网络异常/超时等其它失败：仅清空 Token，是否跳转交给调用方（server.ts 401 分支）兜底
          clearTokens();
        }
        return null;
      } finally {
        isRefreshing.value = false;
      }
    }

    /** 主动提前刷新（过期前 5 分钟调用） */
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
      forceLogoutToLogin,
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
    // - user（认证信息：id/email/username/role）和 profile（头像/昵称等）持久化到 localStorage
    // - Token 使用原有手动存储（axios 拦截器直接读取 Storage，不依赖 Pinia）
    persist: {
      key: "frontend-user-info",
      storage: localStorage,
      pick: ["user", "profile"]
    }
  }
);
