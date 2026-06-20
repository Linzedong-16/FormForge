/**
 * 业务请求客户端
 *
 * 用于需要 Token 认证的业务接口，自动附加 Authorization 头，
 * 在遇到 401 时自动触发 Token 刷新（带队列+锁机制）并重试原请求。
 */
import axios from "axios";
import { ElMessage } from "element-plus";
import { useUserStore } from "@/stores/useUser";

const serverClient = axios.create({
  baseURL: "/api",
  timeout: 15000 // 15s 超时（后端 Fastify requestTimeout 为 30s，前端应更短以便快速反馈）
});

// ─── 请求拦截器：自动附加 Authorization ────────────────────────

serverClient.interceptors.request.use(config => {
  const userStore = useUserStore();
  if (userStore.accessToken && config.headers) {
    config.headers.Authorization = `Bearer ${userStore.accessToken}`;
  }
  return config;
});

// ─── 响应拦截器：处理 401 + 超时 + 网络错误 ────────────────────

serverClient.interceptors.response.use(
  response => response.data,
  async error => {
    const originalRequest = error.config as typeof error.config & { _retry?: boolean };

    // ── 超时错误 ─────────────────────────────────────────────────
    if (error.code === "ECONNABORTED" && error.message?.includes("timeout")) {
      ElMessage.error("请求超时，请检查网络连接后重试");
      return Promise.reject(error);
    }

    // ── 网络错误（无响应） ───────────────────────────────────────
    if (!error.response) {
      ElMessage.error("网络连接失败，请检查后端服务是否正常运行");
      return Promise.reject(error);
    }

    // ── 5xx 服务器错误 — 统一提示，不重试 ────────────────────────
    if (error.response.status >= 500) {
      const msg = error.response.data?.msg || "服务器内部错误，请稍后重试";
      ElMessage.error(msg);
      return Promise.reject(error);
    }

    // ── 429 限流 — 提示用户稍后重试 ──────────────────────────────
    if (error.response.status === 429) {
      const msg = error.response.data?.msg || "请求过于频繁，请稍后重试";
      ElMessage.warning(msg);
      return Promise.reject(error);
    }

    // ── 401 未认证 — 尝试刷新 Token ─────────────────────────────
    if (error.response.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const userStore = useUserStore();
        const newToken = await userStore.refreshAccessToken();

        if (newToken && originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          return serverClient(originalRequest);
        }
      } catch {
        // 刷新失败 → 清理状态并跳转登录
        userStore.handleLogout();
      }

      window.location.href = "/login";
      return Promise.reject(error);
    }

    // ── 其他错误 — 透传后端 msg ──────────────────────────────────
    const msg = error.response.data?.msg || `请求失败 (${error.response.status})`;
    ElMessage.error(msg);
    return Promise.reject(error);
  }
);

export default serverClient;
