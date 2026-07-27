/**
 * 埋点上报 Service — 接收前端埋点数据，补充服务端字段，投递 RabbitMQ
 *
 * 设计要求（对齐设计文档 §4.3）：
 *   - 极速返回，绝不做阻塞操作（目标 < 10ms）
 *   - 补充 server_timestamp、client_ip_hash、user_agent_parsed、geo_region
 *   - 投递到 RabbitMQ tracking-events exchange，按事件类别路由
 *   - RabbitMQ 不可用时降级写本地文件
 */

import { createHash, randomUUID } from "node:crypto";
import { createWriteStream, mkdirSync } from "node:fs";
import path from "node:path";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { TrackEventPayload, TrackEventFull, TrackEventCategory } from "monorepo-code-common";
import { ERROR_EVENTS, PERF_EVENTS, BEHAVIOR_EVENTS } from "monorepo-code-common";

// ─── 配置常量 ────────────────────────────────────────────────────

/** RabbitMQ exchange 名称 */
const TRACKING_EXCHANGE = process.env.TRACKING_MQ_EXCHANGE ?? "tracking-events";
/** 降级文件目录 */
const FALLBACK_DIR = process.env.TRACKING_FALLBACK_DIR ?? path.resolve(process.cwd(), "logs/tracking-fallback");

// ─── 辅助函数 ────────────────────────────────────────────────────

/** IP 哈希：SHA256 前 16 位（不可逆） */
function hashIP(ip: string): string {
  return createHash("sha256").update(ip).digest("hex").slice(0, 16);
}

/** 简单 UA 解析（轻量级，不引入外部库） */
function parseUserAgent(ua: string): { browser?: string; os?: string; device_type?: string } {
  const result: { browser?: string; os?: string; device_type?: string } = {};

  // 操作系统
  if (/Windows/i.test(ua)) result.os = "Windows";
  else if (/Mac OS X/i.test(ua)) result.os = "macOS";
  else if (/Android/i.test(ua)) result.os = "Android";
  else if (/iOS|iPhone|iPad/i.test(ua)) result.os = "iOS";
  else if (/Linux/i.test(ua)) result.os = "Linux";

  // 浏览器
  if (/Edg\//i.test(ua)) result.browser = "Edge";
  else if (/Chrome\//i.test(ua)) result.browser = "Chrome";
  else if (/Firefox\//i.test(ua)) result.browser = "Firefox";
  else if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) result.browser = "Safari";

  // 设备类型
  if (/Mobile|Android.*Mobile|iPhone/i.test(ua)) result.device_type = "mobile";
  else if (/iPad|Tablet|Android(?!.*Mobile)/i.test(ua)) result.device_type = "tablet";
  else result.device_type = "desktop";

  return result;
}

/** 根据事件名称确定路由键（对应 MQ routing_key） */
function getRoutingKey(eventName: string): TrackEventCategory {
  if ((ERROR_EVENTS as readonly string[]).includes(eventName)) return "error";
  if ((PERF_EVENTS as readonly string[]).includes(eventName)) return "perf";
  if ((BEHAVIOR_EVENTS as readonly string[]).includes(eventName)) return "behavior";
  return "metric";
}

// ─── Service 类 ──────────────────────────────────────────────────

export class TrackingIngestService {
  /** 降级文件流（懒初始化） */
  private fallbackStream: ReturnType<typeof createWriteStream> | null = null;
  /** Exchange 是否已声明 */
  private exchangeReady = false;

  constructor(private readonly fastify: FastifyInstance) {}

  /**
   * 确保 RabbitMQ exchange 和队列已声明（首次调用时执行）
   */
  private async ensureExchange(): Promise<boolean> {
    if (this.exchangeReady) return true;

    try {
      const channel = this.fastify.amqp?.channel;
      if (!channel) return false;

      // 声明 topic 类型的 exchange
      await channel.assertExchange(TRACKING_EXCHANGE, "topic", { durable: true });

      // 声明错误队列（高优先级消费）
      await channel.assertQueue("tracking-errors", {
        durable: true,
        arguments: { "x-max-length": 50000 }
      });
      await channel.bindQueue("tracking-errors", TRACKING_EXCHANGE, "error.#");

      // 声明分析队列（批量消费）
      await channel.assertQueue("tracking-analytics", {
        durable: true,
        arguments: { "x-queue-mode": "lazy" }
      });
      await channel.bindQueue("tracking-analytics", TRACKING_EXCHANGE, "perf.#");
      await channel.bindQueue("tracking-analytics", TRACKING_EXCHANGE, "behavior.#");
      await channel.bindQueue("tracking-analytics", TRACKING_EXCHANGE, "metric.#");

      this.exchangeReady = true;
      return true;
    } catch (err) {
      this.fastify.log.error(`tracking exchange 声明失败: ${(err as Error).message}`);
      return false;
    }
  }

  /**
   * 获取降级写入流
   */
  private getFallbackStream(): ReturnType<typeof createWriteStream> {
    if (!this.fallbackStream) {
      mkdirSync(FALLBACK_DIR, { recursive: true });
      const filename = `tracking-${new Date().toISOString().slice(0, 10)}.jsonl`;
      this.fallbackStream = createWriteStream(path.join(FALLBACK_DIR, filename), { flags: "a" });
    }
    return this.fallbackStream;
  }

  /**
   * 处理单条埋点事件上报
   */
  async ingestSingle(event: TrackEventPayload, request: FastifyRequest): Promise<void> {
    const enriched = this.enrichEvent(event, request);
    await this.publishToMQ(enriched);
  }

  /**
   * 处理批量埋点事件上报
   */
  async ingestBatch(events: TrackEventPayload[], request: FastifyRequest): Promise<void> {
    const batchId = randomUUID();
    const enrichedEvents = events.map(e => this.enrichEvent(e, request, batchId));

    // 批量投递（并行发送，不等待每条确认）
    await Promise.all(enrichedEvents.map(e => this.publishToMQ(e)));
  }

  /**
   * 补充服务端字段
   */
  private enrichEvent(event: TrackEventPayload, request: FastifyRequest, batchId?: string): TrackEventFull {
    // 获取客户端真实 IP（支持代理转发）
    const clientIP =
      (request.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      (request.headers["x-real-ip"] as string) ||
      request.ip;

    const ua = (request.headers["user-agent"] as string) || "";

    return {
      ...event,
      server_timestamp: new Date().toISOString(),
      client_ip_hash: hashIP(clientIP),
      user_agent_parsed: parseUserAgent(ua),
      // geo_region/geo_city 暂不实现 IP 地理解析，后续可接入 ip2region
      geo_region: undefined,
      geo_city: undefined,
      ingest_batch_id: batchId
    };
  }

  /**
   * 发布到 RabbitMQ，失败时降级到本地文件
   */
  private async publishToMQ(event: TrackEventFull): Promise<void> {
    const exchangeOk = await this.ensureExchange();
    const channel = this.fastify.amqp?.channel;

    if (exchangeOk && channel) {
      try {
        const routingKey = `${getRoutingKey(event.event_name)}.${event.app_id}`;
        const message = Buffer.from(JSON.stringify(event));

        channel.publish(TRACKING_EXCHANGE, routingKey, message, {
          persistent: true,
          contentType: "application/json"
        });
        return;
      } catch (err) {
        this.fastify.log.warn(`tracking MQ 发布失败: ${(err as Error).message}`);
      }
    }

    // 降级：写入本地 JSONL 文件
    this.getFallbackStream().write(JSON.stringify(event) + "\n");
  }
}
