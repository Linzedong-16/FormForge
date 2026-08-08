/**
 * RabbitMQ 插件单元测试
 *
 * 覆盖：连接建立、close/error 事件、指数退避重连、Channel 引用更新、优雅关闭
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "node:events";

// ─── Mock amqplib ──────────────────────────────────────────────

/** 记录 connect 调用次数，供测试断言 */
let connectCallCount = 0;

/** 模拟的 Channel 序号 */
let channelSeq = 0;

const mockChannel = {
  close: vi.fn().mockResolvedValue(undefined),
};

function createMockChannel() {
  channelSeq++;
  return {
    close: vi.fn().mockResolvedValue(undefined),
    _seq: channelSeq,
  };
}

function createMockChannelModel(channel = createMockChannel()) {
  const emitter = new EventEmitter();
  return Object.assign(emitter, {
    createChannel: vi.fn().mockResolvedValue(channel),
    close: vi.fn().mockResolvedValue(undefined),
  });
}

// connect 的行为由测试用例动态控制
let connectBehavior: (() => Promise<ReturnType<typeof createMockChannelModel>>) | null = null;

vi.mock("amqplib", () => ({
  connect: vi.fn().mockImplementation(async () => {
    connectCallCount++;
    if (connectBehavior) return connectBehavior();
    throw new Error("connectBehavior 未设置");
  }),
}));

// 动态导入被 mock 的插件
const rabbitmqModule = await import("../../plugins/rabbitmq.js");
const rabbitmqPlugin = rabbitmqModule.default;

// Fastify
import Fastify from "fastify";

// ─── 辅助函数 ──────────────────────────────────────────────────

async function buildApp() {
  const app = Fastify({ logger: false });
  // 模拟 log 方法，方便断言日志输出
  app.log.info = vi.fn();
  app.log.warn = vi.fn();
  app.log.error = vi.fn();
  await app.register(rabbitmqPlugin);
  return app;
}

// ─── Tests ─────────────────────────────────────────────────────

describe("rabbitmq plugin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    connectCallCount = 0;
    channelSeq = 0;
    connectBehavior = null;
  });

  afterEach(async () => {
    // 恢复真实的定时器
    vi.useRealTimers();
  });

  // ─── 基础连接 ─────────────────────────────────────────────

  describe("基础连接", () => {
    it("成功连接后 amqp 对象上有 channel 和 connection", async () => {
      const channel = createMockChannel();
      const model = createMockChannelModel(channel);
      connectBehavior = async () => model;

      const app = await buildApp();

      expect(app.amqp).toBeDefined();
      expect(app.amqp.channel).toBe(channel);
      expect(app.amqp.connection).toBe(model);
      expect(connectCallCount).toBe(1);

      await app.close();
    });

    it("连接失败时注册空 amqp 对象（getter 抛错）", async () => {
      connectBehavior = async () => {
        throw new Error("ECONNREFUSED");
      };

      const app = await buildApp();

      expect(app.amqp).toBeDefined();
      expect(() => app.amqp.channel).toThrow("RabbitMQ 未连接");
      expect(() => app.amqp.connection).toThrow("RabbitMQ 未连接");

      await app.close();
    });
  });

  // ─── 重连机制 (US2 T016) ──────────────────────────────────

  describe("连接 close 事件触发重连 (US2)", () => {
    it("连接意外关闭后应触发重连", async () => {
      vi.useFakeTimers();

      // 第一次连接成功
      const firstChannel = createMockChannel();
      const firstModel = createMockChannelModel(firstChannel);
      connectBehavior = async () => firstModel;

      const app = await buildApp();
      expect(app.amqp.channel).toBe(firstChannel);
      expect(connectCallCount).toBe(1);

      // 第二次连接（重连时用）也成功
      const secondChannel = createMockChannel();
      const secondModel = createMockChannelModel(secondChannel);
      connectBehavior = async () => secondModel;

      // 模拟连接意外关闭
      firstModel.emit("close");

      // 等待当前 microtask
      await vi.runAllTicks();

      // 初始延迟 1 秒后应触发首次重连尝试
      expect(connectCallCount).toBe(1); // 还没到时间
      await vi.advanceTimersByTimeAsync(1000);
      expect(connectCallCount).toBe(2); // 重连调用了一次

      // Channel 引用已更新
      expect(app.amqp.channel).toBe(secondChannel);

      await app.close();
    });

    it("优雅关闭时不会重连（closing 标志位阻断）", async () => {
      vi.useFakeTimers();

      const channel = createMockChannel();
      const model = createMockChannelModel(channel);
      connectBehavior = async () => model;

      const app = await buildApp();
      expect(connectCallCount).toBe(1);

      // 先关闭 app（设置 closing = true）
      const closePromise = app.close();

      // 模拟连接 close 事件（在关闭过程中）
      model.emit("close");

      await vi.runAllTicks();
      // 由于 closing=true，不应触发重连
      // 等待超过初始延迟，确认 connect 没有被再次调用
      await vi.advanceTimersByTimeAsync(2000);
      expect(connectCallCount).toBe(1); // 只有初始连接，无重连

      await closePromise;
    });
  });

  // ─── 指数退避 (US2 T013) ─────────────────────────────────

  describe("指数退避重连 (US2)", () => {
    it("重连失败后延迟应翻倍（1s → 2s → 4s … 最大 30s）", async () => {
      vi.useFakeTimers();

      // 第一次连接成功
      const firstChannel = createMockChannel();
      const firstModel = createMockChannelModel(firstChannel);
      connectBehavior = async () => firstModel;

      const app = await buildApp();
      expect(connectCallCount).toBe(1);

      // 后续 connect 全部失败
      connectBehavior = async () => {
        throw new Error("ECONNREFUSED");
      };

      // 触发 close → 重连
      firstModel.emit("close");
      await vi.runAllTicks();

      // 第一次重连尝试 (after 1s)
      await vi.advanceTimersByTimeAsync(1000);
      expect(connectCallCount).toBe(2); // 失败
      await vi.runAllTicks();

      // 第二次重连尝试 (after 2s)
      await vi.advanceTimersByTimeAsync(2000);
      expect(connectCallCount).toBe(3); // 又失败
      await vi.runAllTicks();

      // 第三次重连尝试 (after 4s)
      await vi.advanceTimersByTimeAsync(4000);
      expect(connectCallCount).toBe(4); // 又失败

      // 第四次重连尝试 (after 8s)
      await vi.advanceTimersByTimeAsync(8000);
      expect(connectCallCount).toBe(5);

      await app.close();
    });
  });

  // ─── Channel 引用更新 (US2 T017) ──────────────────────────

  describe("重连成功后 Channel 引用更新 (US2)", () => {
    it("重连成功后 fastify.amqp.channel 应指向新 Channel", async () => {
      vi.useFakeTimers();

      // 第一次
      const oldChannel = createMockChannel();
      const oldModel = createMockChannelModel(oldChannel);
      connectBehavior = async () => oldModel;

      const app = await buildApp();
      const oldAmqpChannel = app.amqp.channel;
      expect(oldAmqpChannel).toBe(oldChannel);

      // 第二次返回新 channel
      const newChannel = createMockChannel();
      const newModel = createMockChannelModel(newChannel);
      connectBehavior = async () => newModel;

      // 触发重连
      oldModel.emit("close");
      await vi.runAllTicks();
      await vi.advanceTimersByTimeAsync(1000);

      // Channel 引用应已更新为新 Channel
      expect(app.amqp.channel).toBe(newChannel);
      expect(app.amqp.channel).not.toBe(oldAmqpChannel);
      // 旧 Channel 的 close 尝试被调用
      expect(oldChannel.close).toHaveBeenCalled();

      await app.close();
    });
  });

  // ─── error 事件 (US2 T012) ────────────────────────────────

  describe("error 事件日志 (US2)", () => {
    it("连接 error 时应记录 ERROR 日志", async () => {
      const channel = createMockChannel();
      const model = createMockChannelModel(channel);
      connectBehavior = async () => model;

      const app = await buildApp();

      // 触发 error 事件
      const testError = new Error("ECONNRESET");
      model.emit("error", testError);

      expect(app.log.error).toHaveBeenCalled();

      await app.close();
    });
  });
});
