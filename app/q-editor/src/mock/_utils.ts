/**
 * Mock 工具函数 — 完全自包含，不依赖任何外部类型
 */

/** 模拟后端 src/utils/response.ts 统一响应格式 { data, code, msg } */
export function ok(data: unknown, msg = "ok") {
  return { data, code: 0, msg };
}

export function fail(code: number, msg: string) {
  return { data: null, code, msg };
}

export const delay = (ms = 300) => new Promise<void>(r => setTimeout(r, ms));

export function uid() {
  return `mock_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function log(label: string, ...args: unknown[]) {
  console.log(`%c[Mock] %c${label}`, "color:#4ade80;font-weight:bold", "color:inherit", ...args);
}
