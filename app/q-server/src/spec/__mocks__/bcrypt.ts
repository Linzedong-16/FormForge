/**
 * bcrypt mock — 避免加载原生 node-gyp 模块
 *
 * 各测试中通过 vi.mocked(bcrypt.compare).mockResolvedValue(true/false) 控制行为
 */
import { vi } from "vitest";

// ─── 类型 ────────────────────────────────────────────────────

interface BcryptMock {
  compare: ReturnType<typeof vi.fn>;
  hash: ReturnType<typeof vi.fn>;
  genSalt: ReturnType<typeof vi.fn>;
}

// ─── Mock 实例 ───────────────────────────────────────────────

const mockCompare = vi.fn();
const mockHash = vi.fn();
const mockGenSalt = vi.fn();

// 默认行为
mockHash.mockResolvedValue("$2b$10$mockedhash");
mockCompare.mockResolvedValue(false);
mockGenSalt.mockResolvedValue("$2b$10$mockedsalt");

const bcryptMock: BcryptMock = {
  compare: mockCompare,
  hash: mockHash,
  genSalt: mockGenSalt,
};

export default bcryptMock;
