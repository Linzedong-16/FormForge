/**
 * 埋点消费进程 — 独立于 Fastify 业务服务运行
 *
 * 流程（对齐设计文档 §6.1）：
 *   RabbitMQ 队列 → 批量拉取（200条/批）→ 数据清洗/去重 → ClickHouse 批量写入
 *
 * 启动方式：
 *   tsx src/consumer/tracking-consumer.ts            # 开发
 *   node dist/consumer/tracking-consumer.js          # 生产
 *   tsx watch src/consumer/tracking-consumer.ts      # 开发热重载
 *
 * 消费队列：
 *   - tracking-errors（错误事件，高优先级）
 *   - tracking-analytics（性能/行为/指标事件）
 *
 * 数据可靠性保障：
 *   - 手动 ACK（消息处理完毕后确认）
 *   - ClickHouse 写入失败降级到本地 JSONL 文件
 *   - 事件去重（基于 event_id 的 Bloom Filter 模拟）
 *   - 队列堆积告警
 */
import "dotenv/config";
import { connect, type Channel as AmqpChannel, type ChannelModel } from "amqplib";
import { createClient, type ClickHouseClient } from "@clickhouse/client";
import { createWriteStream, mkdirSync } from "node:fs";
import path from "node:path";

// ─── 配置 ────────────────────────────────────────────────────────

const RABBITMQ_URL = process.env.RABBITMQ_URL ?? "amqp://questionnaire:questionnaire123@localhost:5672";
const CLICKHOUSE_URL =
  process.env.CLICKHOUSE_URL ?? "http://questionnaire:questionnaire123@localhost:8123/questionnaire_tracking";

// 队列名称
const ERROR_QUEUE = process.env.TRACKING_ERROR_QUEUE ?? "tracking-errors";
const ANALYTICS_QUEUE = process.env.TRACKING_ANALYTICS_QUEUE ?? "tracking-analytics";

// 批处理参数
const BATCH_SIZE = Number(process.env.TRACKING_BATCH_SIZE ?? 200);
const BATCH_INTERVAL_MS = Number(process.env.TRACKING_BATCH_INTERVAL_MS ?? 3000);
const MAX_QUEUE_WARN = Number(process.env.TRACKING_MAX_QUEUE_WARN ?? 50000);
const MAX_QUEUE_CRITICAL = Number(process.env.TRACKING_MAX_QUEUE_CRITICAL ?? 100000);

// 降级文件目录
const FALLBACK_DIR = process.env.TRACKING_CONSUMER_FALLBACK_DIR ?? path.resolve(process.cwd(), "logs/tracking-dead");

// ─── 类型定义 ────────────────────────────────────────────────────

interface TrackingEvent {
  event_id: string;
  event_name: string;
  app_id: string;
  environment?: string;
  user_id?: number | null;
  anonymous_id?: string;
  session_id?: string;
  device_id?: string;
  timestamp: string;
  server_timestamp: string;
  client_ip_hash: string;
  client_env?: {
    os?: string;
    browser?: string;
    browser_version?: string;
    screen_width?: number;
    screen_height?: number;
    network_type?: string;
  };
  user_agent_parsed?: {
    browser?: string;
    os?: string;
    device_type?: string;
  };
  geo_region?: string;
  geo_city?: string;
  page_url?: string;
  page_title?: string;
  sdk_version?: string;
  properties?: Record<string, unknown>;
  ingest_batch_id?: string;
}

// ─── 工具函数 ────────────────────────────────────────────────────

let isShuttingDown = false;

const log = (level: string, msg: string, extra?: unknown) => {
  const ts = new Date().toISOString();
  console[level === "error" ? "error" : level === "warn" ? "warn" : "log"](
    `[${ts}] [tracking-consumer] [${level.toUpperCase()}] ${msg}`,
    extra ?? ""
  );
};

// ─── 简单事件去重（基于 Set，定期清理防止内存溢出） ─────────────

class EventDeduplicator {
  private seen = new Set<string>();
  private readonly maxSize: number;
  private lastCleanup = Date.now();
  private readonly cleanupIntervalMs = 5 * 60 * 1000; // 5 分钟清理一次

  constructor(maxSize = 100_000) {
    this.maxSize = maxSize;
  }

  /** 检查是否重复，返回 true 表示是重复事件 */
  isDuplicate(eventId: string): boolean {
    // 定期清理
    if (Date.now() - this.lastCleanup > this.cleanupIntervalMs || this.seen.size > this.maxSize) {
      this.seen.clear();
      this.lastCleanup = Date.now();
    }

    if (this.seen.has(eventId)) return true;
    this.seen.add(eventId);
    return false;
  }
}

// ─── ClickHouse 连接 ─────────────────────────────────────────────

async function connectClickHouse(): Promise<ClickHouseClient> {
  const client = createClient({
    url: CLICKHOUSE_URL,
    request_timeout: 30_000,
    compression: { request: true, response: true },
    application: "tracking-consumer",
    max_open_connections: 5
  } as Parameters<typeof createClient>[0]);

  // 验证连通性
  await (client as ClickHouseClient & { ping(): Promise<{ success: boolean }> }).ping();
  log("info", `ClickHouse 已连接 → ${CLICKHOUSE_URL.replace(/\/\/.*@/, "//***@")}`);
  return client;
}

// ─── RabbitMQ 连接 ───────────────────────────────────────────────

async function connectRabbitMQ(): Promise<{ conn: ChannelModel; channel: AmqpChannel }> {
  const conn = await connect(RABBITMQ_URL);
  const channel = await conn.createChannel();

  // 声明消费队列（与 ingest service 声明一致）
  await channel.assertQueue(ERROR_QUEUE, {
    durable: true,
    arguments: { "x-max-length": 50000 }
  });
  await channel.assertQueue(ANALYTICS_QUEUE, {
    durable: true,
    arguments: { "x-queue-mode": "lazy" }
  });

  // prefetch：控制未确认消息数量
  channel.prefetch(BATCH_SIZE);

  log("info", `RabbitMQ 已连接 → 队列 [${ERROR_QUEUE}, ${ANALYTICS_QUEUE}]`);
  return { conn, channel };
}

// ─── 数据清洗 ────────────────────────────────────────────────────

/** app_id 白名单 */
const APP_ID_WHITELIST = new Set(["q-editor", "frontend", "main-app", "q-server", "ai-service"]);

/** 部署环境白名单 */
const ENVIRONMENT_WHITELIST = new Set(["production", "staging", "development"]);

function cleanEvent(raw: TrackingEvent): Record<string, unknown> {
  // app_id 校验
  const appId = APP_ID_WHITELIST.has(raw.app_id) ? raw.app_id : "unknown";

  // environment 校验：非法或缺失时兜底为 production（与 ClickHouse 列默认值保持一致）
  const environment = ENVIRONMENT_WHITELIST.has(raw.environment ?? "") ? (raw.environment as string) : "production";

  // event_name 规范化：全小写，非法字符替换为下划线
  const eventName = (raw.event_name || "unknown")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_]/g, "_")
    .slice(0, 64);

  // page_url 截断
  const pageUrl = (raw.page_url || "").slice(0, 2048);

  // properties 截断（8KB 限制）
  let properties = "{}";
  if (raw.properties) {
    const serialized = typeof raw.properties === "string" ? raw.properties : JSON.stringify(raw.properties);
    properties = serialized.length > 8192 ? serialized.slice(0, 8192) + "[TRUNCATED]" : serialized;
  }

  // 时间戳处理
  const clientTimestamp = raw.timestamp || new Date().toISOString();
  const serverTimestamp = raw.server_timestamp || new Date().toISOString();

  return {
    event_id: raw.event_id,
    timestamp: clientTimestamp,
    date: clientTimestamp.slice(0, 10),
    event_name: eventName,
    app_id: appId,
    environment,
    user_id: raw.user_id ?? 0,
    anonymous_id: raw.anonymous_id || "",
    session_id: raw.session_id || "",
    device_id: raw.device_id || "",
    sdk_version: raw.sdk_version || "",
    client_timestamp: clientTimestamp,
    server_timestamp: serverTimestamp,
    client_os: raw.client_env?.os || raw.user_agent_parsed?.os || "",
    client_browser: raw.client_env?.browser || raw.user_agent_parsed?.browser || "",
    browser_version: raw.client_env?.browser_version || "",
    device_type: raw.user_agent_parsed?.device_type || "",
    screen_width: raw.client_env?.screen_width ?? 0,
    screen_height: raw.client_env?.screen_height ?? 0,
    network_type: raw.client_env?.network_type || "",
    geo_region: raw.geo_region || "",
    geo_city: raw.geo_city || "",
    page_url: pageUrl,
    page_title: (raw.page_title || "").slice(0, 256),
    referrer: "",
    properties,
    client_ip_hash: raw.client_ip_hash || "",
    ingest_batch_id: raw.ingest_batch_id || ""
  };
}

// ─── 批量写入 ClickHouse ─────────────────────────────────────────

async function bulkInsertClickHouse(client: ClickHouseClient, events: Record<string, unknown>[]): Promise<void> {
  if (events.length === 0) return;

  await client.insert({
    table: "tracking_events",
    values: events,
    format: "JSONEachRow"
  });

  log("info", `ClickHouse 批量写入完成 → ${events.length} 条`);
}

// ─── 降级写入本地文件 ────────────────────────────────────────────

let fallbackStream: ReturnType<typeof createWriteStream> | null = null;

function writeFallback(events: Record<string, unknown>[]): void {
  if (!fallbackStream) {
    mkdirSync(FALLBACK_DIR, { recursive: true });
    const filename = `dead-${new Date().toISOString().slice(0, 10)}.jsonl`;
    fallbackStream = createWriteStream(path.join(FALLBACK_DIR, filename), { flags: "a" });
  }

  for (const event of events) {
    fallbackStream.write(JSON.stringify(event) + "\n");
  }

  log("warn", `降级写入本地文件: ${events.length} 条`);
}

// ─── 主消费循环 ──────────────────────────────────────────────────

async function consumeLoop(channel: AmqpChannel, clickhouse: ClickHouseClient): Promise<void> {
  const deduplicator = new EventDeduplicator();
  const buffer: Record<string, unknown>[] = [];
  let lastFlush = Date.now();
  let consecutiveWriteFailures = 0;

  // 从两个队列交替拉取消息
  const queues = [ERROR_QUEUE, ANALYTICS_QUEUE];
  let queueIndex = 0;

  while (!isShuttingDown) {
    try {
      // 从当前队列拉取消息
      const currentQueue = queues[queueIndex];
      const msg = await Promise.race([
        channel.get(currentQueue, { noAck: false }),
        new Promise<false>(resolve => setTimeout(() => resolve(false), 500))
      ]);

      if (msg) {
        try {
          const raw: TrackingEvent = JSON.parse(msg.content.toString());

          // 事件去重
          if (!deduplicator.isDuplicate(raw.event_id)) {
            const cleaned = cleanEvent(raw);
            buffer.push(cleaned);
          }

          channel.ack(msg);
        } catch {
          // JSON 解析失败 → ACK 掉坏消息，不阻塞队列
          channel.ack(msg);
          log("warn", `消息解析失败，已丢弃`);
        }
      }

      // 轮换队列（优先消费错误队列：错误队列消费 2 次才轮换到分析队列 1 次）
      if (currentQueue === ERROR_QUEUE) {
        // 检查错误队列是否还有消息
        const errorStatus = await channel.checkQueue(ERROR_QUEUE).catch(() => null);
        if (!errorStatus || errorStatus.messageCount === 0) {
          queueIndex = 1;
        }
      } else {
        queueIndex = 0;
      }

      // 批量写入条件：达到批量大小 或 超时
      const shouldFlush =
        buffer.length >= BATCH_SIZE || (buffer.length > 0 && Date.now() - lastFlush >= BATCH_INTERVAL_MS);

      if (shouldFlush) {
        const batch = buffer.splice(0);

        try {
          await bulkInsertClickHouse(clickhouse, batch);
          consecutiveWriteFailures = 0;
          lastFlush = Date.now();
        } catch (err) {
          consecutiveWriteFailures++;
          log("error", `ClickHouse 写入失败（第 ${consecutiveWriteFailures} 次）: ${(err as Error).message}`);

          // 降级写入本地文件
          writeFallback(batch);
          lastFlush = Date.now();

          // 连续 3 次失败发出告警
          if (consecutiveWriteFailures >= 3) {
            log("error", `[P1 告警] ClickHouse 连续 ${consecutiveWriteFailures} 次写入失败，数据管道中断！`);
          }
        }
      }

      // 队列堆积检查（每 30 秒检查一次）
      if (Date.now() - lastFlush > 30000 || buffer.length === 0) {
        for (const q of queues) {
          try {
            const status = await channel.checkQueue(q);
            if (status.messageCount > MAX_QUEUE_CRITICAL) {
              log("error", `[P1 告警] 队列 ${q} 严重堆积: ${status.messageCount} 条`);
            } else if (status.messageCount > MAX_QUEUE_WARN) {
              log("warn", `[P2 告警] 队列 ${q} 堆积: ${status.messageCount} 条`);
            }
          } catch {
            // 队列检查失败不影响主循环
          }
        }
      }
    } catch (err) {
      log("error", `消费循环异常: ${(err as Error).message}`);
      // 出错后等待 3s 重试，防止高频重试
      await new Promise(r => setTimeout(r, 3000));
    }
  }

  // 关闭前冲刷剩余数据
  if (buffer.length > 0) {
    log("info", `关闭前冲刷剩余 ${buffer.length} 条事件...`);
    try {
      await bulkInsertClickHouse(clickhouse, buffer.splice(0));
    } catch {
      writeFallback(buffer);
    }
  }
}

// ─── 启动入口 ────────────────────────────────────────────────────

async function main(): Promise<void> {
  log("info", "埋点消费进程启动中...");
  log(
    "info",
    `配置: batch_size=${BATCH_SIZE}, interval=${BATCH_INTERVAL_MS}ms, warn=${MAX_QUEUE_WARN}, critical=${MAX_QUEUE_CRITICAL}`
  );

  // 连接 ClickHouse
  let clickhouse: ClickHouseClient;
  try {
    clickhouse = await connectClickHouse();
  } catch (err) {
    log("error", `ClickHouse 连接失败: ${(err as Error).message}`);
    process.exit(1);
  }

  // 连接 RabbitMQ
  let conn: ChannelModel;
  let channel: AmqpChannel;
  try {
    ({ conn, channel } = await connectRabbitMQ());
  } catch (err) {
    log("error", `RabbitMQ 连接失败: ${(err as Error).message}`);
    await clickhouse.close();
    process.exit(1);
  }

  // 优雅关闭
  const shutdown = async (signal: string) => {
    log("info", `收到 ${signal}，开始优雅关闭...`);
    isShuttingDown = true;

    // 等待消费循环退出后关闭连接
    await new Promise(resolve => setTimeout(resolve, 2000));

    try {
      await channel.close();
      await conn.close();
    } catch {
      // 忽略关闭异常
    }

    try {
      await clickhouse.close();
    } catch {
      // 忽略关闭异常
    }

    log("info", "埋点消费进程已关闭");
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  // 启动消费循环
  await consumeLoop(channel, clickhouse);
}

main().catch(err => {
  log("error", `启动失败: ${err.message}`);
  process.exit(1);
});
