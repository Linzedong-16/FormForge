/**
 * 业务请求客户端
 *
 * 用于需要 Token 认证的业务接口，自动附加 Authorization 头，
 * 在遇到 401 时自动触发 Token 刷新（带队列+锁机制）并重试原请求。
 */
import axios from "axios";
import { useUserStore } from "@/stores/useUser";

const serverClient = axios.create({
  baseURL: "/api",
  timeout: 50000
});

// ─── 请求拦截器：自动附加 Authorization ────────────────────────

serverClient.interceptors.request.use(config => {
  const userStore = useUserStore();
  if (userStore.accessToken && config.headers) {
    config.headers.Authorization = `Bearer ${userStore.accessToken}`;
  }
  return config;
});

// ─── 响应拦截器：处理 401 + 队列+锁并发刷新 ────────────────────

serverClient.interceptors.response.use(
  response => response.data,
  async error => {
    const originalRequest = error.config as typeof error.config & { _retry?: boolean };

    // 非 401 或已重试过 → 直接 reject
    if (error.response?.status !== 401 || originalRequest._retry) {
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    try {
      const userStore = useUserStore();
      const newToken = await userStore.refreshAccessToken();

      if (newToken && originalRequest.headers) {
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return serverClient(originalRequest);
      }
    } catch {
      // 刷新失败 → 跳转登录
    }

    window.location.href = "/login";
    return Promise.reject(error);
  }
);

export default serverClient;
