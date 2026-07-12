/**
 * ClickHouse 连接插件
 *
 * 设计思路：
 *   - 基于 @clickhouse/client 官方驱动，使用 HTTP 接口（默认 8123 端口）
 *   - 连接失败时优雅降级，不阻塞服务启动（ClickHouse 并非核心业务依赖）
 *   - 开发环境输出查询日志，生产环境仅记录错误
 *   - 支持环境变量配置，对齐现有 Postgres/Redis/RabbitMQ 配置模式
 *   - 提供轻量级查询辅助方法（带超时和行数限制，防止 OLAP 查询打爆内存）
 *
 * 使用方式：
 *   const rows = await safeQuery(app.clickhouse, {
 *     query: "SELECT * FROM tracking_events WHERE date = today() LIMIT 100"
 *   });
 *
 *   await insertTrackingEvents(app.clickhouse, [{ event_id: '...', ... }]);
 */

import fp from "fastify-plugin";
import { createClient, type ClickHouseClient } from "@clickhouse/client";
import type { FastifyPluginAsync } from "fastify";

// ─── 类型声明 ──────────────────────────────────────────────────

declare module "fastify" {
  interface FastifyInstance {
    /** ClickHouse 客户端实例 */
    clickhouse: ClickHouseClient;
  }
}

// ─── 配置常量 ──────────────────────────────────────────────────

/** 默认查询最大行数限制（防止 OLAP 查询耗尽内存） */
const DEFAULT_MAX_ROWS = 10_000;

/** 默认查询超时（秒） */
const DEFAULT_QUERY_TIMEOUT_S = 30;

/** Ping 超时（毫秒） */
const PING_TIMEOUT_MS = 5_000;

// ─── 内部辅助类型 ──────────────────────────────────────────────

/**
 * @clickhouse/client v1.x 的 createClient 在运行时接受 connect_timeout 参数，
 * 但类型定义通过 BaseClickHouseClientConfigOptions 并未暴露此字段。
 * 使用本地扩展类型兼容运行时行为。
 */
interface ClickHouseClientConfigExt {
  url?: string;
  request_timeout?: number;
  connect_timeout?: number;
  compression?: { response?: boolean; request?: boolean };
  application?: string;
  max_open_connections?: number;
  keep_alive?: { enabled?: boolean; idle_socket_ttl?: number };
  database?: string;
  clickhouse_settings?: Record<string, unknown>;
}

// ─── 插件主体 ──────────────────────────────────────────────────

const clickhousePlugin: FastifyPluginAsync = async fastify => {
  const url =
    process.env.CLICKHOUSE_URL ?? "http://questionnaire:questionnaire123@localhost:8123/questionnaire_tracking";
  const isDevelopment = process.env.NODE_ENV === "development";

  // 使用扩展类型以兼容运行时接受的 connect_timeout 参数
  const config: ClickHouseClientConfigExt = {
    url,
    request_timeout: Number(process.env.CLICKHOUSE_REQUEST_TIMEOUT ?? 30_000),
    connect_timeout: Number(process.env.CLICKHOUSE_CONNECT_TIMEOUT ?? 10_000),
    compression: {
      response: isDevelopment ? undefined : true,
      request: isDevelopment ? false : true
    },
    application: "questionnaire-q-server",
    max_open_connections: 10
  };

  const client = createClient(config as Parameters<typeof createClient>[0]);

  // ── 连接探测 ──────────────────────────────────────────────

  try {
    // ping 操作用于验证 ClickHouse 连通性
    // @clickhouse/client v1.x 的 ping 在运行时接受 { timeout } 参数
    const pingStart = Date.now();
    await (client as ClickHouseClient & { ping(opts?: { timeout?: number }): Promise<{ success: boolean }> }).ping({
      timeout: PING_TIMEOUT_MS
    });
    const latency = Date.now() - pingStart;
    fastify.log.info(`ClickHouse 连接成功（延迟 ${latency}ms）→ ${url.replace(/\/\/.*@/, "//***@")}`);
  } catch (err) {
    // ClickHouse 不可用不阻塞业务启动（埋点数据丢失但系统正常运行）
    fastify.log.warn(`ClickHouse 连接失败（埋点存储将不可用）: ${(err as Error).message}`);
  }

  // ── 装饰 fastify 实例 ────────────────────────────────────

  fastify.decorate("clickhouse", client);

  // ── 优雅关闭 ──────────────────────────────────────────────

  fastify.addHook("onClose", async () => {
    fastify.log.info("正在关闭 ClickHouse 连接...");
    try {
      await client.close();
      fastify.log.info("ClickHouse 连接已关闭");
    } catch (err) {
      fastify.log.warn(`ClickHouse 关闭异常: ${(err as Error).message}`);
    }
  });
};

export default fp(clickhousePlugin, {
  name: "clickhouse"
});

// ─── 辅助工具函数 ──────────────────────────────────────────────

/**
 * ClickHouse 安全查询参数。
 *
 * 供 Service 层调用，内置行数限制和超时保护。
 */
export interface SafeQueryOptions {
  /** SQL 查询语句 */
  query: string;
  /** 查询参数（ClickHouse 支持 {paramName:Type} 占位符） */
  query_params?: Record<string, unknown>;
  /** 最大返回行数，默认 10_000 */
  maxRows?: number;
  /** 查询超时秒数，默认 30 */
  timeoutSeconds?: number;
}

/**
 * 带安全限制的 ClickHouse 查询辅助函数。
 *
 * 自动追加 LIMIT 和 SETTINGS max_execution_time，防止：
 * - 无 LIMIT 的查询扫描全表耗尽内存
 * - 复杂聚合查询执行时间过长阻塞连接池
 *
 * 使用 JSONEachRow 格式获取数据，Stream API 遍历结果。
 *
 * @param client   - ClickHouse 客户端实例
 * @param options  - 查询选项
 * @returns 查询结果 JSON 对象数组
 *
 * @example
 * ```ts
 * const rows = await safeQuery(app.clickhouse, {
 *   query: "SELECT event_name, count() AS cnt FROM tracking_events WHERE date = {d:Date} GROUP BY event_name",
 *   query_params: { d: new Date().toISOString().slice(0, 10) },
 * });
 * ```
 */
export async function safeQuery(
  client: ClickHouseClient,
  options: SafeQueryOptions
): Promise<Record<string, unknown>[]> {
  const { query, query_params, maxRows = DEFAULT_MAX_ROWS, timeoutSeconds = DEFAULT_QUERY_TIMEOUT_S } = options;

  // 自动追加行数限制（如果原始查询没有 LIMIT）
  let safeQueryStmt = query.trimEnd();
  if (!/LIMIT\s+\d+/i.test(safeQueryStmt)) {
    safeQueryStmt = `${safeQueryStmt}\nLIMIT ${maxRows}`;
  }

  // 追加超时设置
  if (!/max_execution_time/i.test(safeQueryStmt)) {
    safeQueryStmt = `${safeQueryStmt}\nSETTINGS max_execution_time = ${timeoutSeconds}`;
  }

  const resultSet = await client.query({
    query: safeQueryStmt,
    query_params,
    format: "JSONEachRow"
  });

  // JSONEachRow 格式的流式结果：@clickhouse/client v1.x 的 stream() 每次迭代
  // 返回的是一批 Row<T> 组成的数组（而非单个 Row），每个 Row 提供 .json<T>() 方法
  const rows: Record<string, unknown>[] = [];
  const stream = resultSet.stream();

  for await (const rowsChunk of stream) {
    // 通过 unknown 中间转换处理 @clickhouse/client 的类型推断差异
    const rowBatch = rowsChunk as unknown as Array<{ json: <T = Record<string, unknown>>() => T }>;
    for (const row of rowBatch) {
      rows.push(row.json());
    }
  }

  return rows;
}

/**
 * 批量插入埋点事件到 ClickHouse。
 *
 * 将埋点事件数组转换为 ClickHouse tracking_events 表的数据行，
 * 使用 JSONEachRow 格式批量写入。自动处理 properties 字段的 JSON 序列化。
 *
 * @param client  - ClickHouse 客户端实例
 * @param events  - 埋点事件数组
 *
 * @example
 * ```ts
 * await insertTrackingEvents(app.clickhouse, [
 *   {
 *     event_id: '019a6f80-1234-7abc-8def-0123456789ab',
 *     event_name: 'page_view',
 *     app_id: 'q-editor',
 *     timestamp: '2026-06-28T08:00:00.000Z',
 *     properties: { page_url: '/editor' },
 *   },
 * ]);
 * ```
 */
export async function insertTrackingEvents(client: ClickHouseClient, events: Record<string, unknown>[]): Promise<void> {
  if (events.length === 0) return;

  const rows = events.map(e => {
    // 将 properties 序列化为 JSON 字符串（ClickHouse String 列）
    const props = e.properties;
    return {
      ...e,
      properties: typeof props === "string" ? props : JSON.stringify(props ?? {}),
      // 确保 date 分区键字段存在（从 timestamp 提取日期部分）
      date: typeof e.timestamp === "string" ? e.timestamp.slice(0, 10) : new Date().toISOString().slice(0, 10)
    };
  });

  await client.insert({
    table: "tracking_events",
    values: rows,
    format: "JSONEachRow",
    // best_effort 支持解析 ISO 8601 格式（含 T/Z），否则 DateTime64 列默认只接受
    // "YYYY-MM-DD HH:MM:SS.fff" 空格分隔格式，会导致 timestamp 字段解析失败
    clickhouse_settings: { date_time_input_format: "best_effort" }
  });
}
