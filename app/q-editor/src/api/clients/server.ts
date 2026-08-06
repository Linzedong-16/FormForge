/**
 * 业务请求客户端
 *
 * 用于需要 Token 认证的业务接口，自动附加 Authorization 头，
 * 在遇到 401 时自动触发 Token 刷新（带队列+锁机制）并重试原请求。
 */
import axios from "axios";
import { ElMessage } from "element-plus";
import { BizCode } from "@common/user/user.interface";
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

// ─── 响应拦截器：处理 401 + 超时 + 网络错误 + 5xx ────────────
//
// 设计原则：
//   - 业务错误（400/403/404/409 等）不弹窗，直接返回 response.data，
//     由调用方通过 res.code 统一处理
//   - 基础设施/传输错误（超时、断网、5xx）在拦截器中统一弹窗提示
//   - 401 单独处理：自动刷新 Token 后重试

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

    const status = error.response.status;

    // ── 5xx 服务器错误 — 统一提示，不重试 ────────────────────────
    if (status >= 500) {
      const msg = error.response.data?.msg || "服务器内部错误，请稍后重试";
      ElMessage.error(msg);
      return Promise.reject(error);
    }

    // ── 429 限流 — 提示用户稍后重试 ──────────────────────────────
    if (status === 429) {
      const msg = error.response.data?.msg || "请求过于频繁，请稍后重试";
      ElMessage.warning(msg);
      return Promise.reject(error);
    }

    // ── 401 未认证 — 基于唯一业务码区分 AT/RT 失效场景，两者处理逻辑完全分离 ──
    if (status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      const bizCode: number | undefined = error.response.data?.code;
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

    // ── 业务错误（400/403/404/409 等） ──────────────────────────
    // 不做弹窗、不 reject，直接返回 response.data，
    // 让调用方通过 res.code / res.msg 统一处理业务逻辑
    return error.response.data;
  }
);

export default serverClient;
