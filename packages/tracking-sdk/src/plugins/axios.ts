/**
 * Axios 拦截器插件
 *
 * 自动为所有 Axios 请求注入性能追踪和错误捕获。
 * - 成功请求：上报 api_perf 事件（耗时、响应大小）
 * - 失败请求：上报 api_error 事件（状态码、错误信息）
 *
 * @module plugins/axios
 *
 * @example
 * ```ts
 * import axios from 'axios';
 * import { installAxiosInterceptor } from 'monorepo-tracking-sdk/plugins/axios';
 *
 * installAxiosInterceptor(axios, tracker);
 * ```
 */

import type { AxiosInstance, InternalAxiosRequestConfig, AxiosResponse, AxiosError } from "axios";
import type { Tracker } from "../core/tracker.js";

/**
 * Axios 拦截器配置选项。
 */
export interface AxiosInterceptorOptions {
  /** 是否捕获成功的 API 调用性能，默认 true */
  capturePerformance?: boolean;
  /** 是否捕获失败的 API 调用，默认 true */
  captureErrors?: boolean;
  /** 不需要监控的 API 路径模式（正则），匹配到的路径不追踪 */
  excludePaths?: RegExp[];
  /** 响应体最大上报长度（字符），用于错误详情截断，默认 200 */
  maxErrorResponseLength?: number;
}

/**
 * 为 Axios 实例安装请求/响应拦截器。
 *
 * 安装后，所有经过此 Axios 实例的请求会被自动追踪。
 * 注意：tracking-api 自身的请求不会追踪（通过请求路径过滤）。
 *
 * @param axiosInstance - Axios 实例
 * @param tracker - Tracker 实例
 * @param options - 可选配置
 *
 * @example
 * ```ts
 * installAxiosInterceptor(axios, tracker, {
 *   excludePaths: [/\/api\/v1\/track/], // 不追踪埋点上报自身的请求
 * });
 * ```
 */
export function installAxiosInterceptor(
  axiosInstance: AxiosInstance,
  tracker: Tracker,
  options: AxiosInterceptorOptions = {}
): void {
  const {
    capturePerformance = true,
    captureErrors = true,
    excludePaths = [/\/api\/v1\/track/],
    maxErrorResponseLength = 200
  } = options;

  // ── 请求拦截器：记录请求开始时间 ──────────────────────────
  axiosInstance.interceptors.request.use((config: InternalAxiosRequestConfig & { __trackStartTime?: number }) => {
    config.__trackStartTime = Date.now();
    return config;
  });

  // ── 响应拦截器 ────────────────────────────────────────────
  axiosInstance.interceptors.response.use(
    // 成功响应
    (response: AxiosResponse & { config: InternalAxiosRequestConfig & { __trackStartTime?: number } }) => {
      if (!capturePerformance) return response;

      const path = extractPath(response.config.url ?? "");
      if (isExcluded(path, excludePaths)) return response;

      const duration = Date.now() - (response.config.__trackStartTime ?? 0);

      tracker.track("api_perf", "perf", {
        api_path: path,
        http_method: response.config.method?.toUpperCase() ?? "GET",
        http_status: response.status,
        duration_ms: duration,
        response_size_bytes: estimateResponseSize(response.data),
        request_url: sanitizeUrlForTracking(response.config.url ?? "")
      });

      return response;
    },

    // 错误响应
    (error: AxiosError & { config?: InternalAxiosRequestConfig & { __trackStartTime?: number } }) => {
      if (!captureErrors) return Promise.reject(error);

      const path = extractPath(error.config?.url ?? "");
      if (isExcluded(path, excludePaths)) return Promise.reject(error);

      const duration = error.config?.__trackStartTime ? Date.now() - error.config.__trackStartTime : 0;

      const httpStatus = error.response?.status ?? 0;
      const errorData = error.response?.data;

      // 仅上报服务端错误（500+）和网络错误（status=0）
      if (httpStatus === 0 || httpStatus >= 500) {
        tracker.track("api_error", "error", {
          api_path: path,
          http_method: error.config?.method?.toUpperCase() ?? "GET",
          http_status: httpStatus,
          duration_ms: duration,
          error_message: (error.message || "Network Error").slice(0, 300),
          response_body:
            typeof errorData === "string"
              ? errorData.slice(0, maxErrorResponseLength)
              : JSON.stringify(errorData ?? {}).slice(0, maxErrorResponseLength),
          request_url: sanitizeUrlForTracking(error.config?.url ?? "")
        });
      }

      return Promise.reject(error);
    }
  );
}

/**
 * 从 URL 提取路径部分（不含协议、域名、查询参数）。
 */
function extractPath(url: string): string {
  try {
    const parsed = new URL(url, window.location.origin);
    return parsed.pathname;
  } catch {
    // 相对路径直接返回
    return url.split("?")[0] ?? url;
  }
}

/**
 * 检查路径是否在排除列表中。
 */
function isExcluded(path: string, patterns: RegExp[]): boolean {
  return patterns.some(p => p.test(path));
}

/**
 * 估算响应体大小（字节）。
 */
function estimateResponseSize(data: unknown): number {
  if (data === null || data === undefined) return 0;
  if (typeof data === "string") return new Blob([data]).size;
  try {
    return new Blob([JSON.stringify(data)]).size;
  } catch {
    return 0;
  }
}

/**
 * 清洗 URL 中的敏感参数后再上报。
 */
function sanitizeUrlForTracking(url: string): string {
  const SENSITIVE = ["token", "code", "sign", "signature", "access_token", "apikey", "api_key"];
  try {
    const parsed = new URL(url, window.location.origin);
    for (const param of SENSITIVE) {
      if (parsed.searchParams.has(param)) {
        parsed.searchParams.set(param, "[REDACTED]");
      }
    }
    return parsed.toString();
  } catch {
    return url;
  }
}
