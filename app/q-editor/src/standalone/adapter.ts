/**
 * 独立部署 Axios Mock 适配器
 *
 * 替换 axios 默认的 HTTP 适配器，拦截所有 /api/* 请求并返回 Mock 数据。
 * 模拟真实网络延迟 (~150-300ms)，使演示体验更接近真实场景。
 */
import type { AxiosAdapter, AxiosResponse, InternalAxiosRequestConfig } from "axios";
import { handleRequest } from "./handlers";
import { log } from "./data";

/** 模拟网络延迟（随机 150~300ms） */
function simulateNetworkDelay(): Promise<void> {
  const delay = 150 + Math.random() * 150;
  return new Promise(resolve => setTimeout(resolve, delay));
}

/**
 * Standalone Mock Axios 适配器
 *
 * 对于 /api/* 请求：
 *   1. 匹配 handlers 中的路由
 *   2. 模拟网络延迟
 *   3. 返回 AxiosResponse 格式的 Mock 响应
 *
 * 对于非 /api/* 请求（如静态资源加载）：
 *   不做拦截，交由浏览器原生 fetch 处理
 */
export const standaloneMockAdapter: AxiosAdapter = async (config: InternalAxiosRequestConfig) => {
  // axios 不会在进入自定义 adapter 前把 baseURL 拼进 url（这一步只在内置 adapter 里做），
  // 而 authClient/serverClient 的 baseURL 均为 "/api"、调用时 url 只传子路径（如 "/auth/login"），
  // 因此这里必须手动拼接完整路径，否则下面的 "/api" 前缀判断永远为 false，
  // 所有请求都会被错误地当成"非 API 请求"直接跳过 Mock（导致 res.data 为 null，业务代码访问其字段时报错）
  const fullUrl = (config.baseURL ?? "") + (config.url ?? "");
  const method = (config.method ?? "get").toUpperCase();

  // 仅拦截 /api/* 请求，其余不处理
  if (!fullUrl.startsWith("/api")) {
    // 对于非 API 请求（如图片/静态资源），构造一个最简单的响应避免报错
    // 实际上 standalone 部署时不应有非 mock 的 HTTP 请求
    log("非 API 请求跳过", `${method} ${fullUrl}`);
    const response: AxiosResponse = {
      data: null,
      status: 200,
      statusText: "OK (standalone skipped)",
      headers: {},
      config
    };
    return response;
  }

  // 匹配 Mock 处理器 —— 传入拼接后的完整路径，与 handlers.ts 中 "/api/xxx" 风格的路由模式对齐
  const mockData = handleRequest({ ...config, url: fullUrl });

  if (mockData === null) {
    // 未找到匹配的路由 → 返回 404
    console.warn(`[Standalone Mock] 未匹配路由: ${method} ${fullUrl}`);
    const response: AxiosResponse = {
      data: { data: null, code: 404, msg: "Mock 路由未配置" },
      status: 404,
      statusText: "Not Found (standalone mock)",
      headers: {},
      config
    };
    return response;
  }

  // 模拟网络延迟
  await simulateNetworkDelay();

  // 将 mock 返回数据包装为 AxiosResponse 格式
  const response: AxiosResponse = {
    data: mockData,
    status: 200,
    statusText: "OK (standalone mock)",
    headers: {
      "content-type": "application/json"
    },
    config
  };

  return response;
};
