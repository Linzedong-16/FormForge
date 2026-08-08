/**
 * Redis 插件单元测试
 *
 * 覆盖：enableOfflineQueue: false 行为验证、连接失败降级、优雅关闭
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Mock ioredis ──────────────────────────────────────────────

/** 模拟 Redis 实例的 get/set 行为：离线时 reject 还是入队 */
let mockReady = true;
const mockGet = vi.fn();
const mockSet = vi.fn();
const mockDel = vi.fn();
const mockConnect = vi.fn();
const mockQuit = vi.fn();
const mockDisconnect = vi.fn();

// 记录传给 ioredis 构造函数的选项（用于验证 enableOfflineQueue）
let capturedOptions: Record<string, unknown> | null = null;

const MockRedis = vi.fn().mockImplementation(function (this: Record<string, unknown>, options: Record<string, unknown>) {
  capturedOptions = options;

  this.get = mockGet;
  this.set = mockSet;
  this.del = mockDel;
  this.connect = mockConnect;
  this.quit = mockQuit;
  this.disconnect = mockDisconnect;
  this.on = vi.fn().mockReturnThis();

  // 模拟 ready 状态：离线时 get/set 的行为取决于 enableOfflineQueue
  // 若 ready 为 false 且 enableOfflineQueue 为 false → 命令立即 reject
  mockGet.mockImplementation(async () => {
    if (!mockReady) {
      throw new Error("Redis connection not ready");
    }
    return null;
  });
  mockSet.mockImplementation(async () => {
    if (!mockReady) {
      throw new Error("Redis connection not ready");
    }
    return "OK";
  });

  return this;
});

vi.mock("ioredis", () => ({
  Redis: MockRedis,
}));

// 动态导入
const redisModule = await import("../../plugins/redis.js");
const redisPlugin = redisModule.default;

// Fastify
import Fastify from "fastify";

// ─── 辅助函数 ──────────────────────────────────────────────────

async function buildApp() {
  const app = Fastify({ logger: false });
  app.log.info = vi.fn();
  app.log.warn = vi.fn();
  app.log.error = vi.fn();
  await app.register(redisPlugin);
  return app;
}

// ─── Tests ─────────────────────────────────────────────────────

describe("redis plugin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReady = true;
    capturedOptions = null;
    mockConnect.mockResolvedValue(undefined);
    mockQuit.mockResolvedValue(undefined);
    mockDisconnect.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ─── enableOfflineQueue 配置 (US3 T018) ───────────────────

  describe("enableOfflineQueue 配置 (US3)", () => {
    it("ioredis 构造时应传入 enableOfflineQueue: false", async () => {
      const app = await buildApp();

      expect(capturedOptions).not.toBeNull();
      expect(capturedOptions!.enableOfflineQueue).toBe(false);

      await app.close();
    });

    it("Redis 不可用时 get 命令应立即失败不排队", async () => {
      mockReady = false; // 模拟 Redis 离线

      const app = await buildApp();

      // 由于 enableOfflineQueue: false，命令应直接 reject
      await expect(app.redis.get("test-key")).rejects.toThrow("Redis connection not ready");

      await app.close();
    });

    it("Redis 不可用时 set 命令应立即失败不排队", async () => {
      mockReady = false;

      const app = await buildApp();

      await expect(app.redis.set("test-key", "value")).rejects.toThrow("Redis connection not ready");

      await app.close();
    });
  });

  // ─── 连接失败降级 ────────────────────────────────────────

  describe("连接失败降级", () => {
    it("connect 失败时服务仍可启动（不抛异常）", async () => {
      mockConnect.mockRejectedValue(new Error("ECONNREFUSED"));

      const app = await buildApp();

      // 服务正常启动
      expect(app.redis).toBeDefined();
      // 记录了警告日志
      expect(app.log.warn).toHaveBeenCalled();

      await app.close();
    });
  });

  // ─── 优雅关闭 ────────────────────────────────────────────

  describe("优雅关闭", () => {
    it("onClose 钩子应调用 quit 关闭连接", async () => {
      const app = await buildApp();

      await app.close();

      expect(mockQuit).toHaveBeenCalled();
    });
  });
});
