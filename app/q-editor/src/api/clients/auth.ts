/**
 * 认证 API 客户端（纯 axios 实例）
 *
 * 仅创建实例 + 配置拦截器，不包含任何业务接口函数。
 * 业务接口函数统一收敛到 src/api/modules/auth/index.ts
 */
import axios from "axios";

const authClient = axios.create({
  baseURL: "/api",
  timeout: 15000
});

/** 响应拦截器 — 统一解包 data + 错误处理 */
authClient.interceptors.response.use(
  res => res.data,
  err => {
    // 网络错误（无响应）
    if (!err.response) {
      console.error("[Auth] 网络连接失败，请检查网络", err.message);
      return Promise.reject(new Error("网络连接失败，请检查网络后重试"));
    }

    // 提取后端返回的错误信息（此时 err.response 已确保非空，status 必为 number）
    const backendMsg: string | undefined = err.response.data?.msg;
    const statusCode: number = err.response.status;

    const STATUS_MAP: Record<number, string> = {
      400: "请求参数错误",
      401: "认证已过期，请重新登录",
      403: "没有权限执行此操作",
      404: "请求的资源不存在",
      409: "操作冲突，请检查后重试",
      429: "请求过于频繁，请稍后再试",
      500: "服务器内部错误，请稍后重试"
    };

    const message = backendMsg || STATUS_MAP[statusCode] || `请求失败 (${statusCode})`;

    // 保留后端业务码，供上层（如 store 的刷新逻辑）区分 AT/RT 失效场景
    const bizCode: number | undefined = err.response.data?.code;
    const rejected = new Error(message) as Error & { bizCode?: number };
    rejected.bizCode = bizCode;
    return Promise.reject(rejected);
  }
);

export default authClient;
