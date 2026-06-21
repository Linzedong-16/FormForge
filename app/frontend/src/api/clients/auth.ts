/**
 * 认证 API 客户端（纯 axios 实例）
 *
 * 用于公开接口（登录、注册、验证码等），不带 Authorization 头。
 * 业务接口函数收敛到 src/api/modules/auth/index.ts
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
    if (!err.response) {
      return Promise.reject(new Error("网络连接失败，请检查网络后重试"));
    }

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
    return Promise.reject(new Error(message));
  }
);

export default authClient;
