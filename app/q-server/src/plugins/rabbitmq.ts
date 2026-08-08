import fp from "fastify-plugin";
import { connect } from "amqplib";
import type { FastifyPluginAsync } from "fastify";
import type { ChannelModel, Channel as AmqpChannel } from "amqplib";

declare module "fastify" {
  interface FastifyInstance {
    amqp: {
      connection: ChannelModel; // connect() 返回 ChannelModel，含 connection + createChannel
      channel: AmqpChannel;
    };
  }
}

// ─── 重连配置常量 ────────────────────────────────────────────────

/** 初始重连延迟 (ms) */
const INITIAL_RECONNECT_DELAY = 1000;
/** 最大重连延迟 (ms) */
const MAX_RECONNECT_DELAY = 30000;
/** 退避乘数 */
const BACKOFF_MULTIPLIER = 2;

const rabbitmqPlugin: FastifyPluginAsync = async fastify => {
  const url = process.env.RABBITMQ_URL ?? "amqp://questionnaire:questionnaire123@localhost:5672";

  /** 应用是否正在关闭（停止重连的标志位） */
  let closing = false;
  /** 当前重连延迟（指数退避） */
  let reconnectDelay = INITIAL_RECONNECT_DELAY;

  // ─── 连接与 Channel 建立 ──────────────────────────────────────

  /**
   * 尝试连接 RabbitMQ 并创建 Channel
   * @returns 成功时返回 { connection, channel }，失败时返回 null
   */
  async function connectAndSetup(): Promise<{
    connection: ChannelModel;
    channel: AmqpChannel;
  } | null> {
    try {
      const connection: ChannelModel = await connect(url);
      const channel: AmqpChannel = await connection.createChannel();

      // T011: 监听连接意外关闭（非应用主动关闭的场景）
      connection.on("close", () => {
        if (closing) return; // 应用主动关闭，不重连
        fastify.log.warn("RabbitMQ 连接意外关闭，开始重连…");
        reconnectWithBackoff();
      });

      // T012: 连接错误日志（close 事件会跟随触发，由 close 统一处理重连）
      connection.on("error", (err: Error) => {
        fastify.log.error({ err }, "RabbitMQ 连接错误");
      });

      return { connection, channel };
    } catch (err) {
      fastify.log.warn(`RabbitMQ 连接失败: ${(err as Error).message}`);
      return null;
    }
  }

  // ─── 指数退避重连 ─────────────────────────────────────────────

  /**
   * 指数退避重连函数
   * 每次重连失败后延迟翻倍（最大 30s），成功后重置延迟并更新 fastify.amqp 引用
   */
  async function reconnectWithBackoff(): Promise<void> {
    if (closing) return;

    const delay = reconnectDelay;
    fastify.log.info({ delay }, `RabbitMQ 将在 ${delay}ms 后重连…`);

    await new Promise(resolve => setTimeout(resolve, delay));

    if (closing) return;

    const result = await connectAndSetup();
    if (result) {
      // T014: 重连成功 → 更新 fastify.amqp 引用，下游 sendToQueue 使用新 Channel
      const oldChannel = fastify.amqp?.channel;
      fastify.amqp = { connection: result.connection, channel: result.channel };
      reconnectDelay = INITIAL_RECONNECT_DELAY; // 重置退避
      fastify.log.info("RabbitMQ 重连成功，Channel 已更新");

      // 尝试安全关闭旧 Channel（忽略错误，因为旧连接可能已失效）
      try {
        await oldChannel?.close();
      } catch {
        // 旧 Channel 可能已不可用
      }
    } else {
      // 重连失败 → 指数退避
      reconnectDelay = Math.min(reconnectDelay * BACKOFF_MULTIPLIER, MAX_RECONNECT_DELAY);
      fastify.log.warn({ nextDelay: reconnectDelay }, "RabbitMQ 重连失败，将再次尝试");
      // 递归重试（非阻塞 await，不让调用链无限增长；每次都是新的异步周期）
      reconnectWithBackoff();
    }
  }

  // ─── 初始化连接 ───────────────────────────────────────────────

  const result = await connectAndSetup();

  if (result) {
    fastify.decorate("amqp", { connection: result.connection, channel: result.channel });

    fastify.log.info(`RabbitMQ 已连接 → ${url}`);
  } else {
    // RabbitMQ 不可用不应阻断业务启动（本地开发可能未启动 Docker）
    fastify.log.warn("RabbitMQ 连接失败（日志队列将不可用），将在首次请求时按需重连");

    // 注册一个空的 amqp 对象，避免下游代码 null 检查
    fastify.decorate("amqp", {
      get connection() {
        throw new Error("RabbitMQ 未连接");
      },
      get channel() {
        throw new Error("RabbitMQ 未连接");
      }
    } as unknown as { connection: ChannelModel; channel: AmqpChannel });
  }

  // ─── 优雅关闭 ─────────────────────────────────────────────────

  // T015: Fastify 关闭时设置标志位停止重连循环，避免优雅关闭被重连定时器阻塞
  fastify.addHook("onClose", async () => {
    closing = true;

    try {
      if (fastify.amqp?.channel && typeof fastify.amqp.channel.close === "function") {
        await (fastify.amqp.channel as AmqpChannel).close();
      }
      if (fastify.amqp?.connection && typeof fastify.amqp.connection.close === "function") {
        await (fastify.amqp.connection as ChannelModel).close();
      }
    } catch {
      // 连接已在关闭时断开，忽略错误
    }
  });
};

export default fp(rabbitmqPlugin, { name: "rabbitmq" });
