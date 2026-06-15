/**
 * 日志消费进程 — 独立于 Fastify 业务服务运行
 *
 * 流程：
 *   RabbitMQ 队列 → 批量拉取 → MongoDB bulkWrite → 手动 ACK
 *
 * 启动方式：
 *   tsx src/consumer/log-consumer.ts            # 开发
 *   node dist/consumer/log-consumer.js          # 生产
 *   tsx watch src/consumer/log-consumer.ts      # 开发热重载
 */
import "dotenv/config";
import { connect, type Channel as AmqpChannel } from "amqplib";
import mongoose from "mongoose";
import { LogEntry } from "../models/LogEntry.model.js";

// ─── 配置 ────────────────────────────────────────────────────

const RABBITMQ_URL = process.env.RABBITMQ_URL ?? "amqp://questionnaire:questionnaire123@localhost:5672";
const MONGO_URI = process.env.MONGO_URI ?? "mongodb://admin:admin123@localhost:27017";
const MONGO_DB = process.env.MONGO_DB_NAME ?? "questionnaire_logs";

const QUEUE = process.env.LOG_MQ_QUEUE ?? "questionnaire-logs";
const BATCH_SIZE = Number(process.env.LOG_BATCH_SIZE ?? 100);
const BATCH_INTERVAL_MS = Number(process.env.LOG_BATCH_INTERVAL_MS ?? 5000);
const MAX_QUEUE_SIZE = Number(process.env.LOG_MAX_QUEUE_SIZE ?? 10000);

// ─── 工具 ────────────────────────────────────────────────────

let isShuttingDown = false;

const log = (level: string, msg: string, extra?: unknown) => {
  const ts = new Date().toISOString();
  console[level === "error" ? "error" : "log"](`[${ts}] [log-consumer] [${level.toUpperCase()}] ${msg}`, extra ?? "");
};

// ─── MongoDB 连接 ────────────────────────────────────────────

async function connectMongo(): Promise<typeof mongoose> {
  await mongoose.connect(MONGO_URI, {
    dbName: MONGO_DB,
    minPoolSize: 2,
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 10000
  });
  log("info", `MongoDB 已连接 → ${MONGO_DB}`);
  return mongoose;
}

// ─── RabbitMQ 连接 ───────────────────────────────────────────

async function connectRabbitMQ() {
  const conn = await connect(RABBITMQ_URL);
  const channel = await conn.createChannel();

  await channel.assertQueue(QUEUE, {
    durable: true,
    arguments: { "x-queue-mode": "lazy" }
  });

  // 每次只取 1 条，不预取（批量由业务层控制）
  channel.prefetch(BATCH_SIZE);
  log("info", `RabbitMQ 已连接 → 队列 ${QUEUE}`);
  return { conn, channel };
}

// ─── 批量写入 MongoDB ────────────────────────────────────────

interface RawLog {
  requestId?: string;
  level: string;
  message: string;
  context: Record<string, unknown>;
  timestamp: string;
  source: string;
}

async function bulkWrite(logs: RawLog[]): Promise<void> {
  if (logs.length === 0) return;

  const ops = logs.map(l => ({
    insertOne: {
      document: {
        requestId: l.requestId,
        level: l.level || "info",
        message: l.message,
        context: l.context || {},
        timestamp: new Date(l.timestamp || Date.now()),
        source: l.source || "q-server"
      }
    }
  }));

  try {
    const result = await LogEntry.bulkWrite(ops, { ordered: false });
    log("info", `批量写入完成 → ${result.insertedCount}/${logs.length} 条`);
  } catch (err) {
    log("error", `批量写入失败: ${(err as Error).message}`);
    throw err;
  }
}

// ─── 主循环 ──────────────────────────────────────────────────

async function consumeLoop(channel: AmqpChannel) {
  // LogEntry 模型已在顶部 import 时自动注册，无需重复加载
  const buffer: RawLog[] = [];
  let lastFlush = Date.now();

  while (!isShuttingDown) {
    try {
      // 非阻塞拉取一条消息
      const msg = await Promise.race([
        channel.get(QUEUE, { noAck: false }),
        new Promise<false>(resolve => setTimeout(() => resolve(false), 1000))
      ]);

      if (msg) {
        try {
          const parsed: RawLog = JSON.parse(msg.content.toString());
          buffer.push(parsed);
          channel.ack(msg);
        } catch {
          // 解析失败 → 仍 ACK（坏消息不能阻塞队列）
          channel.ack(msg);
        }
      }

      // 触发条件：达到批量大小 或 超过时间间隔
      const shouldFlush =
        buffer.length >= BATCH_SIZE || (buffer.length > 0 && Date.now() - lastFlush >= BATCH_INTERVAL_MS);

      if (shouldFlush) {
        await bulkWrite(buffer.splice(0));
        lastFlush = Date.now();
      }

      // 队列堆积告警
      const queueStatus = await channel.checkQueue(QUEUE);
      if (queueStatus.messageCount > MAX_QUEUE_SIZE) {
        log("warn", `队列堆积: ${queueStatus.messageCount} 条 → 阈值 ${MAX_QUEUE_SIZE}`);
      }
    } catch (err) {
      log("error", `消费循环异常: ${(err as Error).message}`);
      await new Promise(r => setTimeout(r, 3000)); // 出错后等待 3s 重试
    }
  }
}

// ─── 启动 ────────────────────────────────────────────────────

async function main() {
  log("info", "日志消费进程启动中...");
  log("info", `配置: batch=${BATCH_SIZE}, interval=${BATCH_INTERVAL_MS}ms, max_queue=${MAX_QUEUE_SIZE}`);

  const mg = await connectMongo();
  const { conn, channel } = await connectRabbitMQ();

  // 优雅关闭
  const shutdown = async (signal: string) => {
    log("info", `收到 ${signal}，开始优雅关闭...`);
    isShuttingDown = true;
    await channel.close();
    await conn.close();
    await mg.disconnect();
    log("info", "消费进程已关闭");
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  await consumeLoop(channel);
}

main().catch(err => {
  log("error", `启动失败: ${err.message}`);
  process.exit(1);
});
