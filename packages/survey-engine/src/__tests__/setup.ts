// ──────────────────────────────────────────────────────────────────────────────
// Vitest 全局设置 — jsdom 环境下补充缺失的浏览器 API
// ──────────────────────────────────────────────────────────────────────────────
import { vi } from "vitest";

// mock IndexedDB（jsdom 不支持，db.ts 依赖）
const indexedDBMock = {
  open: vi.fn(() => ({
    result: {} as IDBDatabase,
    onerror: null,
    onsuccess: null,
    onupgradeneeded: null
  }))
};
globalThis.indexedDB = indexedDBMock as unknown as IDBFactory;
