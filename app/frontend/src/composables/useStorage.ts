/**
 * localStorage 二次封装
 *
 * 职责：
 *   1. 统一 get/set/remove 入口，避免项目各处直接调用原生 localStorage
 *   2. 自动 JSON 序列化/反序列化
 *   3. 异常安全：存储不可用时静默降级（隐私模式 / quota 超限）
 *   4. 预留 key 前缀，方便未来加命名空间或 TTL 逻辑
 */

// ─── 工具函数 ──────────────────────────────────────────────────

/** 判断 localStorage 是否可用 */
function isStorageAvailable(): boolean {
  try {
    const testKey = "__storage_test__";
    localStorage.setItem(testKey, "1");
    localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

const storageReady = isStorageAvailable();

// ─── API ───────────────────────────────────────────────────────

/** 读取（自动 JSON.parse，失败返回 fallback） */
export function getStorageItem<T = string>(key: string, fallback?: T): T | null {
  if (!storageReady) return fallback ?? null;
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback ?? null;
    // 尝试 JSON 解析，失败则返回原始字符串
    try {
      return JSON.parse(raw) as T;
    } catch {
      return raw as unknown as T;
    }
  } catch {
    return fallback ?? null;
  }
}

/** 写入（自动 JSON.stringify） */
export function setStorageItem(key: string, value: unknown): void {
  if (!storageReady) return;
  try {
    const serialized = typeof value === "string" ? value : JSON.stringify(value);
    localStorage.setItem(key, serialized);
  } catch {
    // quota 超限 / 隐私模式 → 静默降级
  }
}

/** 删除 */
export function removeStorageItem(key: string): void {
  if (!storageReady) return;
  try {
    localStorage.removeItem(key);
  } catch {
    // 静默降级
  }
}
