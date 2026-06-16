/**
 * Pino → RabbitMQ 日志传输插件
 *
 * 功能：
 *   1. 生产环境：拦截所有日志，通过 RabbitMQ 推送到日志队列
 *   2. 复用现有 fastify.amqp 连接，不创建新连接
 *   3. RabbitMQ 不可用时自动降级到本地文件
 *   4. 通过 pino 的 stream 系统实现真正的日志输出
 */
import fp from "fastify-plugin";
import { Writable } from "node:stream";
import { createWriteStream, mkdirSync } from "node:fs";
import path from "node:path";
import type { FastifyPluginAsync } from "fastify";

// ─── 配置 ────────────────────────────────────────────────────

const LOG_MQ_QUEUE = process.env.LOG_MQ_QUEUE ?? "questionnaire-logs";
const LOG_MQ_EXCHANGE = process.env.LOG_MQ_EXCHANGE ?? "logs-exchange";
const LOG_FALLBACK_DIR = process.env.LOG_FALLBACK_DIR ?? path.resolve(process.cwd(), "logs");

// ─── 创建日志传输流 ──────────────────────────────────────────

/**
 * 创建一个 Writable Stream，同时写入 RabbitMQ 和本地文件
 */
function createTransportStream(
  fastify: {
    amqp?: { channel: { sendToQueue: (q: string, b: Buffer) => boolean } };
    log: { error: (msg: string) => void };
  },
  fallbackPath: string
): Writable {
  mkdirSync(path.dirname(fallbackPath), { recursive: true });
  const fallbackStream = createWriteStream(fallbackPath, { flags: "a" });

  return new Writable({
    objectMode: false,
    async write(chunk, _encoding, callback) {
      const line = chunk.toString();

      try {
        if (fastify?.amqp?.channel) {
          fastify.amqp.channel.sendToQueue(LOG_MQ_QUEUE, Buffer.from(line));
        }
      } catch {
        // RabbitMQ 推送失败不阻塞，继续写入文件
      }

      fallbackStream.write(line);
      callback();
    },
    final(callback) {
      fallbackStream.end(callback);
    }
  });
}

// ─── 插件主体 ────────────────────────────────────────────────

const logTransportPlugin: FastifyPluginAsync = async fastify => {
  const isProduction = process.env.LOG_ENV === "production" || process.env.NODE_ENV === "production";

  if (!isProduction) {
    fastify.log.info("日志传输：开发模式（控制台 pino-pretty，不推 RabbitMQ）");
    return;
  }

  try {
    // 确保 RabbitMQ 日志交换机和队列存在
    if (fastify.amqp?.channel) {
      await fastify.amqp.channel.assertExchange(LOG_MQ_EXCHANGE, "fanout", { durable: true });
      await fastify.amqp.channel.assertQueue(LOG_MQ_QUEUE, {
        durable: true,
        arguments: { "x-queue-mode": "lazy" }
      });
      await fastify.amqp.channel.bindQueue(LOG_MQ_QUEUE, LOG_MQ_EXCHANGE, "");

      fastify.log.info(`日志传输：生产模式 → RabbitMQ 队列 ${LOG_MQ_QUEUE}`);
    } else {
      fastify.log.warn("日志传输：RabbitMQ 未就绪，降级到本地文件");
    }

    // 创建传输流：同时写 RabbitMQ + 文件
    const fallbackPath = path.join(LOG_FALLBACK_DIR, `fallback-${new Date().toISOString().slice(0, 10)}.log`);
    const transportStream = createTransportStream(fastify, fallbackPath);

    // 获取 pino 实例并替换其 destination
    const pinoInstance = fastify.log as unknown as {
      destination?: Writable;
      [key: string]: unknown;
    };

    // 保存原始 destination（如果有）
    const originalDest = pinoInstance.destination;

    // 创建组合流：同时写入原始 destination（控制台）和传输流（RabbitMQ + 文件）
    const combinedStream = new Writable({
      objectMode: false,
      write(chunk, encoding, callback) {
        // 写入原始 destination（通常是 stdout）
        if (originalDest && typeof originalDest.write === "function") {
          originalDest.write(chunk, encoding);
        }

        // 写入传输流（RabbitMQ + 文件）
        transportStream.write(chunk, encoding, callback);
      },
      final(callback) {
        const cleanup: Promise<void>[] = [];
        if (originalDest && typeof originalDest.end === "function") {
          cleanup.push(new Promise(resolve => originalDest.end(resolve)));
        }
        cleanup.push(new Promise(resolve => transportStream.end(resolve)));
        Promise.all(cleanup).then(() => callback());
      }
    });

    // 将组合流设置为 pino 的 destination
    pinoInstance.destination = combinedStream;

    // 监听错误
    transportStream.on("error", (err: Error) => {
      fastify.log.error(`日志传输流错误: ${err.message}`);
    });

    fastify.log.info(`日志传输插件已激活 → RabbitMQ: ${fastify.amqp?.channel ? "✓" : "✗"}, 文件: ${fallbackPath}`);
  } catch (err) {
    fastify.log.error(`日志传输初始化失败: ${(err as Error).message}`);
  }
};

export default fp(logTransportPlugin, {
  name: "log-transport",
  dependencies: ["rabbitmq"]
});
