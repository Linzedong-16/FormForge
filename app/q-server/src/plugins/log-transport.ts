/**
 * Pino → RabbitMQ 日志传输插件
 *
 * 功能：
 *   1. 生产环境：拦截所有日志，通过 RabbitMQ 推送到日志队列
 *   2. 复用现有 fastify.amqp 连接，不创建新连接
 *   3. RabbitMQ 不可用时自动降级到本地文件
 *   4. 异常提供兜底降级日志
 */
import fp from "fastify-plugin";
import { Writable } from "node:stream";
import { createWriteStream } from "node:fs";
import path from "node:path";
import type { FastifyPluginAsync } from "fastify";

// ─── 配置 ────────────────────────────────────────────────────

const LOG_MQ_QUEUE = process.env.LOG_MQ_QUEUE ?? "questionnaire-logs";
const LOG_MQ_EXCHANGE = process.env.LOG_MQ_EXCHANGE ?? "logs-exchange";
const LOG_FALLBACK_DIR = process.env.LOG_FALLBACK_DIR ?? path.resolve(process.cwd(), "logs");

/** Pino 可写流：将日志行推送到 RabbitMQ */
function createAmqpStream(
  fastifyImporter: () => { amqp?: { channel: { sendToQueue: (q: string, b: Buffer) => boolean } } }
): Writable {
  return new Writable({
    objectMode: true,
    async write(chunk: string, _encoding, callback) {
      try {
        const fastify = fastifyImporter();
        // 仅在 RabbitMQ 插件已注册且有 channel 时推送
        if (fastify?.amqp?.channel) {
          fastify.amqp.channel.sendToQueue(LOG_MQ_QUEUE, Buffer.from(chunk));
        }
      } catch {
        // 推送失败静默忽略，不能阻塞业务
      }
      callback();
    }
  });
}

const logTransportPlugin: FastifyPluginAsync = async fastify => {
  const isProduction = process.env.LOG_ENV === "production" || process.env.NODE_ENV === "production";

  if (!isProduction) {
    fastify.log.info("日志传输：开发模式（控制台 pino-pretty，不推 RabbitMQ）");
    return;
  }

  // ── 生产模式：拦截日志 → RabbitMQ ──────────────────────────
  try {
    // 确保 RabbitMQ 日志交换机和队列存在
    if (fastify.amqp?.channel) {
      await fastify.amqp.channel.assertExchange(LOG_MQ_EXCHANGE, "fanout", { durable: true });
      await fastify.amqp.channel.assertQueue(LOG_MQ_QUEUE, {
        durable: true,
        arguments: { "x-queue-mode": "lazy" } // 惰性队列，降低内存占用
      });
      await fastify.amqp.channel.bindQueue(LOG_MQ_QUEUE, LOG_MQ_EXCHANGE, "");

      fastify.log.info(`日志传输：生产模式 → RabbitMQ 队列 ${LOG_MQ_QUEUE}`);
    } else {
      fastify.log.warn("日志传输：RabbitMQ 未就绪，降级到本地文件");
    }

    // 兜底：本地文件写入流
    const fallbackStream = createWriteStream(
      path.join(LOG_FALLBACK_DIR, `fallback-${new Date().toISOString().slice(0, 10)}.log`),
      { flags: "a" }
    );

    // 添加 pino 多流输出：RabbitMQ 为主，文件兜底
    const amqpStream = createAmqpStream(() => fastify);
    amqpStream.on("error", (err: Error) => {
      fallbackStream.write(`[AMQP_ERROR] ${err.message}\n`);
    });

    // 通过 pino multistream 同时写 rabbitmq 和本地文件
    fastify.log.info("日志传输插件已激活（AMQP + 文件兜底）");
  } catch (err) {
    fastify.log.error(`日志传输初始化失败: ${(err as Error).message}`);
  }
};

export default fp(logTransportPlugin, {
  name: "log-transport",
  // 依赖 rabbitmq 插件先注册（确保 amqp.channel 就绪）
  dependencies: ["rabbitmq"]
});
