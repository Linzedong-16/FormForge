/**
 * vitest 全局 setup — 在测试运行前执行
 *
 * 在此处 mock 原生模块，避免 node-gyp 编译产物加载失败
 */
import { vi } from "vitest";

// Mock bcrypt（原生模块）
vi.mock("bcrypt", () => ({
  default: {
    compare: vi.fn().mockResolvedValue(false),
    hash: vi.fn().mockResolvedValue("$2b$10$mockedhash"),
    genSalt: vi.fn().mockResolvedValue("$2b$10$mockedsalt"),
  },
}));
