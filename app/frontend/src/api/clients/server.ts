/**
 * 业务请求客户端
 *
 * 用于需要 Token 认证的业务接口，自动附加 Authorization 头，
 * 在遇到 401 时自动触发 Token 刷新并重试原请求。
 */
import axios from "axios";
import { BizCode } from "@common/user/user.interface";

const serverClient = axios.create({
  baseURL: "/api",
  timeout: 15000
});

// ─── 请求拦截器：自动附加 Authorization（从 localStorage 读取 accessToken）───

serverClient.interceptors.request.use(config => {
  const accessToken = localStorage.getItem("accessToken");
  if (accessToken && config.headers) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

// ─── 响应拦截器：解包 + 401 自动刷新 Token ────────────────────

serverClient.interceptors.response.use(
  response => response.data,
  async error => {
    const originalRequest = error.config as typeof error.config & { _retry?: boolean };

    // 超时
    if (error.code === "ECONNABORTED" && error.message?.includes("timeout")) {
      return Promise.reject(new Error("请求超时，请检查网络连接后重试"));
    }

    // 网络错误
    if (!error.response) {
      return Promise.reject(new Error("网络连接失败，请检查后端服务是否正常运行"));
    }

    // 5xx
    if (error.response.status >= 500) {
      const msg = error.response.data?.msg || "服务器内部错误，请稍后重试";
      return Promise.reject(new Error(msg));
    }

    // 429
    if (error.response.status === 429) {
      return Promise.reject(new Error(error.response.data?.msg || "请求过于频繁，请稍后重试"));
    }

    // 401 — 基于唯一业务码区分 AT/RT 失效场景，两者处理逻辑完全分离
    if (error.response.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      const bizCode: number | undefined = error.response.data?.code;
      const { useUserStore } = await import("@/store/modules/user");
      const userStore = useUserStore();

      // 只有明确是 AT 失效的唯一响应码才走"静默刷新 + 重试"路径
      if (bizCode === BizCode.AccessTokenInvalid) {
        const newToken = await userStore.refreshAccessToken();
        if (newToken && originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          return serverClient(originalRequest);
        }
        // newToken 为 null：refreshAccessToken 内部已按 bizCode 做过区分处理
        // （RT 失效已 forceLogoutToLogin；其它异常已 clearTokens），这里兜底跳转一次
        userStore.forceLogoutToLogin();
        return Promise.reject(error);
      }

      // 非预期的 401（未识别的 bizCode，含 RT 失效）：不尝试刷新，直接强制登出
      userStore.forceLogoutToLogin();
      return Promise.reject(error);
    }

    const msg = error.response.data?.msg || `请求失败 (${error.response.status})`;
    return Promise.reject(new Error(msg));
  }
);

export default serverClient;
