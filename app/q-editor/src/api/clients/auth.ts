/**
 * 认证 API 客户端（纯 axios 实例）
 *
 * 仅创建实例 + 配置拦截器，不包含任何业务接口函数。
 * 业务接口函数统一收敛到 src/api/modules/auth/index.ts
 */
import axios from "axios";

const authClient = axios.create({
  baseURL: "/api",
  timeout: 50000
});

/** 响应拦截器 — 只解包 data，不做 Token 处理 */
authClient.interceptors.response.use(
  res => res.data,
  err => Promise.reject(err)
);

export default authClient;
