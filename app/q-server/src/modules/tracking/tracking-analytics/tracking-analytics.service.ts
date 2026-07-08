/**
 * 数据分析 Service — ClickHouse 聚合查询封装
 *
 * 设计要点：
 *   - 所有查询必须带 date 条件（利用分区裁剪）
 *   - 聚合查询优先查物化视图，明细查询走主表
 *   - 强制 LIMIT + max_execution_time 防止 OLAP 查询打爆内存
 *   - 查询结果通过 Redis 缓存，TTL 按数据实时性要求区分
 */

import type { FastifyInstance } from "fastify";
import type { ClickHouseClient } from "@clickhouse/client";
import { safeQuery } from "../../../plugins/clickhouse.js";
import { createCache, type CacheClient } from "../../../utils/cache.js";
import type {
  AnalyticsOverview,
  AnalyticsTrendResponse,
  AnalyticsErrorsResponse,
  AnalyticsPerformanceResponse,
  AnalyticsFunnelResponse,
  AnalyticsAIUsageResponse,
  AnalyticsEventDetailResponse,
  AnalyticsRealtimeStats,
  AnalyticsTimeRange
} from "monorepo-code-common";
import type {
  AnalyticsTrendQueryInput,
  AnalyticsErrorsQueryInput,
  AnalyticsPerformanceQueryInput,
  AnalyticsFunnelQueryInput,
  AnalyticsAIUsageQueryInput,
  AnalyticsEventDetailQueryInput
} from "./tracking-analytics.schemas.js";

// ─── 时间范围转换辅助 ────────────────────────────────────────────

/** 将时间范围快捷值转为 ClickHouse 日期条件 */
function rangeToDateCondition(range: AnalyticsTimeRange): string {
  const mapping: Record<AnalyticsTimeRange, string> = {
    "1h": "timestamp >= now() - INTERVAL 1 HOUR",
    "6h": "timestamp >= now() - INTERVAL 6 HOUR",
    "24h": "timestamp >= now() - INTERVAL 24 HOUR",
    "7d": "date >= today() - 7",
    "30d": "date >= today() - 30",
    "90d": "date >= today() - 90"
  };
  return mapping[range];
}

/** 将时间范围转为分区裁剪条件（date 列） */
function rangeToPartitionCondition(range: AnalyticsTimeRange): string {
  const mapping: Record<AnalyticsTimeRange, string> = {
    "1h": "date >= today()",
    "6h": "date >= today()",
    "24h": "date >= today() - 1",
    "7d": "date >= today() - 7",
    "30d": "date >= today() - 30",
    "90d": "date >= today() - 90"
  };
  return mapping[range];
}

/** 粒度到 ClickHouse 时间函数映射 */
function granularityToFunction(granularity: string): string {
  const mapping: Record<string, string> = {
    minute: "toStartOfMinute(timestamp)",
    hour: "toStartOfHour(timestamp)",
    day: "toDate(timestamp)",
    week: "toStartOfWeek(timestamp)",
    month: "toStartOfMonth(timestamp)"
  };
  return mapping[granularity] ?? "toStartOfHour(timestamp)";
}

// ─── 缓存 TTL 配置 ──────────────────────────────────────────────

const CACHE_TTL = {
  /** 实时数据：30 秒 */
  REALTIME: 30,
  /** 概览数据：60 秒 */
  OVERVIEW: 60,
  /** 趋势数据：5 分钟 */
  TREND: 300,
  /** 错误/性能聚合：5 分钟 */
  AGGREGATE: 300,
  /** 漏斗分析：10 分钟 */
  FUNNEL: 600,
  /** AI 使用分析：10 分钟 */
  AI_USAGE: 600
};

// ─── Service 类 ──────────────────────────────────────────────────

export class TrackingAnalyticsService {
  private readonly cache: CacheClient;
  private readonly ch: ClickHouseClient;

  constructor(private readonly fastify: FastifyInstance) {
    this.cache = createCache(fastify);
    this.ch = fastify.clickhouse;
  }

  // ════════════════════════════════════════════════════════════════
  // 概览数据
  // ════════════════════════════════════════════════════════════════

  async getOverview(): Promise<AnalyticsOverview> {
    const cacheKey = "analytics:overview";
    return this.cache.getOrSet(
      cacheKey,
      async () => {
        // 并行查询多项指标
        const [pvUv, surveysCreated, responses, errors, aiUsage] = await Promise.all([
          this.queryPvUvToday(),
          this.queryCountToday("editor_create_survey"),
          this.queryCountToday("survey_submit_success"),
          this.queryErrorsToday(),
          this.queryAIUsageToday()
        ]);

        return {
          pv_today: pvUv.pv,
          uv_today: pvUv.uv,
          online_users: 0, // 需 Redis 实时计数，后续接入
          surveys_created_today: surveysCreated,
          responses_today: responses,
          errors_today: errors,
          ai_usage_today: aiUsage
        };
      },
      CACHE_TTL.OVERVIEW
    );
  }

  // ════════════════════════════════════════════════════════════════
  // 趋势查询
  // ════════════════════════════════════════════════════════════════

  async getTrend(query: AnalyticsTrendQueryInput): Promise<AnalyticsTrendResponse> {
    const cacheKey = `analytics:trend:${query.metric}:${query.granularity}:${query.range}:${query.app_id || "all"}`;

    return this.cache.getOrSet(
      cacheKey,
      async () => {
        const timeFunc = granularityToFunction(query.granularity);
        const dateCondition = rangeToDateCondition(query.range);
        const partitionCondition = rangeToPartitionCondition(query.range);
        const appFilter = query.app_id ? `AND app_id = '${query.app_id}'` : "";

        let sql: string;

        switch (query.metric) {
          case "pv":
            sql = `SELECT ${timeFunc} AS time, count() AS value FROM tracking_events WHERE ${partitionCondition} AND ${dateCondition} AND event_name = 'page_view' ${appFilter} GROUP BY time ORDER BY time`;
            break;
          case "uv":
            sql = `SELECT ${timeFunc} AS time, uniq(user_id) AS value FROM tracking_events WHERE ${partitionCondition} AND ${dateCondition} AND event_name = 'page_view' AND user_id != 0 ${appFilter} GROUP BY time ORDER BY time`;
            break;
          case "errors":
            sql = `SELECT ${timeFunc} AS time, count() AS value FROM tracking_events WHERE ${partitionCondition} AND ${dateCondition} AND event_name IN ('js_error', 'vue_error', 'api_error', 'sse_error', 'resource_error') ${appFilter} GROUP BY time ORDER BY time`;
            break;
          case "api_requests":
            sql = `SELECT ${timeFunc} AS time, count() AS value FROM tracking_events WHERE ${partitionCondition} AND ${dateCondition} AND event_name = 'api_perf' ${appFilter} GROUP BY time ORDER BY time`;
            break;
          case "surveys_created":
            sql = `SELECT ${timeFunc} AS time, count() AS value FROM tracking_events WHERE ${partitionCondition} AND ${dateCondition} AND event_name = 'editor_create_survey' ${appFilter} GROUP BY time ORDER BY time`;
            break;
          case "responses":
            sql = `SELECT ${timeFunc} AS time, count() AS value FROM tracking_events WHERE ${partitionCondition} AND ${dateCondition} AND event_name = 'survey_submit_success' ${appFilter} GROUP BY time ORDER BY time`;
            break;
          case "ai_usage":
            sql = `SELECT ${timeFunc} AS time, count() AS value FROM tracking_events WHERE ${partitionCondition} AND ${dateCondition} AND event_name IN ('editor_use_ai_generate', 'editor_use_ai_polish') ${appFilter} GROUP BY time ORDER BY time`;
            break;
          default:
            sql = `SELECT ${timeFunc} AS time, count() AS value FROM tracking_events WHERE ${partitionCondition} AND ${dateCondition} ${appFilter} GROUP BY time ORDER BY time`;
        }

        const rows = await safeQuery(this.ch, { query: sql });

        return {
          metric: query.metric,
          granularity: query.granularity,
          points: rows.map(r => ({
            time: String(r.time),
            value: Number(r.value)
          }))
        };
      },
      CACHE_TTL.TREND
    );
  }

  // ════════════════════════════════════════════════════════════════
  // 错误分析
  // ════════════════════════════════════════════════════════════════

  async getErrors(query: AnalyticsErrorsQueryInput): Promise<AnalyticsErrorsResponse> {
    const cacheKey = `analytics:errors:${query.app_id || "all"}:${query.range}:${query.top_n}:${query.error_type || "all"}`;

    return this.cache.getOrSet(
      cacheKey,
      async () => {
        const partitionCondition = rangeToPartitionCondition(query.range);
        const dateCondition = rangeToDateCondition(query.range);
        const appFilter = query.app_id ? `AND app_id = '${query.app_id}'` : "";
        const typeFilter = query.error_type
          ? `AND JSONExtractString(properties, 'error_type') = '${query.error_type}'`
          : "";

        // 查询错误聚合
        const sql = `
          SELECT
            cityHash64(concat(
              JSONExtractString(properties, 'error_type'),
              substring(JSONExtractString(properties, 'error_message'), 1, 100)
            )) AS error_group_key,
            JSONExtractString(properties, 'error_type') AS error_type,
            substring(JSONExtractString(properties, 'error_message'), 1, 200) AS error_message,
            count() AS count,
            uniq(user_id) AS affected_users,
            uniq(session_id) AS affected_sessions,
            min(timestamp) AS first_seen,
            max(timestamp) AS last_seen
          FROM tracking_events
          WHERE ${partitionCondition}
            AND ${dateCondition}
            AND event_name IN ('js_error', 'vue_error', 'api_error', 'sse_error', 'resource_error')
            ${appFilter}
            ${typeFilter}
          GROUP BY error_group_key, error_type, error_message
          ORDER BY count DESC
          LIMIT ${query.top_n}
        `;

        const rows = await safeQuery(this.ch, { query: sql });

        // 查询总错误数
        const totalSql = `
          SELECT count() AS total FROM tracking_events
          WHERE ${partitionCondition} AND ${dateCondition}
            AND event_name IN ('js_error', 'vue_error', 'api_error', 'sse_error', 'resource_error')
            ${appFilter}
        `;
        const totalRows = await safeQuery(this.ch, { query: totalSql });
        const totalCount = Number(totalRows[0]?.total ?? 0);

        return {
          total_count: totalCount,
          errors: rows.map(r => ({
            error_group_key: String(r.error_group_key),
            error_type: String(r.error_type || "unknown"),
            error_message: String(r.error_message || ""),
            count: Number(r.count),
            affected_users: Number(r.affected_users),
            affected_sessions: Number(r.affected_sessions),
            first_seen: String(r.first_seen),
            last_seen: String(r.last_seen)
          }))
        };
      },
      CACHE_TTL.AGGREGATE
    );
  }

  // ════════════════════════════════════════════════════════════════
  // 性能分析
  // ════════════════════════════════════════════════════════════════

  async getPerformance(query: AnalyticsPerformanceQueryInput): Promise<AnalyticsPerformanceResponse> {
    const cacheKey = `analytics:perf:${query.app_id || "all"}:${query.metric}:${query.range}:${query.page_url || "all"}`;

    return this.cache.getOrSet(
      cacheKey,
      async () => {
        const partitionCondition = rangeToPartitionCondition(query.range);
        const dateCondition = rangeToDateCondition(query.range);
        const appFilter = query.app_id ? `AND app_id = '${query.app_id}'` : "";
        const pageFilter = query.page_url ? `AND page_url LIKE '%${query.page_url}%'` : "";

        // 根据 metric 确定事件名和字段
        let eventFilter: string;
        let metricField: string;

        switch (query.metric) {
          case "fcp":
            eventFilter = "event_name = 'page_perf'";
            metricField = "JSONExtractFloat(properties, 'fcp_ms')";
            break;
          case "lcp":
            eventFilter = "event_name = 'page_perf'";
            metricField = "JSONExtractFloat(properties, 'lcp_ms')";
            break;
          case "cls":
            eventFilter = "event_name = 'page_perf'";
            metricField = "JSONExtractFloat(properties, 'cls')";
            break;
          case "inp":
            eventFilter = "event_name = 'page_perf'";
            metricField = "JSONExtractFloat(properties, 'inp_ms')";
            break;
          case "api_duration":
            eventFilter = "event_name = 'api_perf'";
            metricField = "JSONExtractFloat(properties, 'duration_ms')";
            break;
          default:
            eventFilter = "event_name = 'page_perf'";
            metricField = "JSONExtractFloat(properties, 'lcp_ms')";
        }

        // 聚合指标
        const aggregateSql = `
          SELECT
            count() AS sample_count,
            avg(${metricField}) AS avg_val,
            quantile(0.50)(${metricField}) AS p50,
            quantile(0.75)(${metricField}) AS p75,
            quantile(0.95)(${metricField}) AS p95,
            quantile(0.99)(${metricField}) AS p99
          FROM tracking_events
          WHERE ${partitionCondition} AND ${dateCondition}
            AND ${eventFilter}
            AND ${metricField} > 0
            ${appFilter}
            ${pageFilter}
        `;

        // 趋势数据（按小时聚合）
        const trendSql = `
          SELECT
            toStartOfHour(timestamp) AS time,
            quantile(0.95)(${metricField}) AS value
          FROM tracking_events
          WHERE ${partitionCondition} AND ${dateCondition}
            AND ${eventFilter}
            AND ${metricField} > 0
            ${appFilter}
            ${pageFilter}
          GROUP BY time
          ORDER BY time
        `;

        const [aggregateRows, trendRows] = await Promise.all([
          safeQuery(this.ch, { query: aggregateSql }),
          safeQuery(this.ch, { query: trendSql })
        ]);

        const agg = aggregateRows[0] || {};

        return {
          metric: query.metric,
          current: {
            p50: Number(agg.p50 ?? 0),
            p75: Number(agg.p75 ?? 0),
            p95: Number(agg.p95 ?? 0),
            p99: Number(agg.p99 ?? 0),
            avg: Number(agg.avg_val ?? 0),
            sample_count: Number(agg.sample_count ?? 0)
          },
          trend_points: trendRows.map(r => ({
            time: String(r.time),
            value: Number(r.value)
          }))
        };
      },
      CACHE_TTL.AGGREGATE
    );
  }

  // ════════════════════════════════════════════════════════════════
  // 漏斗分析
  // ════════════════════════════════════════════════════════════════

  async getFunnel(query: AnalyticsFunnelQueryInput): Promise<AnalyticsFunnelResponse> {
    const cacheKey = `analytics:funnel:${query.funnel_name}:${query.range}:${query.app_id || "all"}`;

    return this.cache.getOrSet(
      cacheKey,
      async () => {
        const partitionCondition = rangeToPartitionCondition(query.range);
        const dateCondition = rangeToDateCondition(query.range);
        const appFilter = query.app_id ? `AND app_id = '${query.app_id}'` : "";

        // 根据漏斗类型定义步骤事件
        let funnelSteps: Array<{ name: string; event_name: string }>;

        switch (query.funnel_name) {
          case "survey_response":
            funnelSteps = [
              { name: "查看问卷", event_name: "survey_view" },
              { name: "开始填写", event_name: "survey_submit_start" },
              { name: "提交成功", event_name: "survey_submit_success" }
            ];
            break;
          case "survey_creation":
            funnelSteps = [
              { name: "进入编辑器", event_name: "page_view" },
              { name: "新建问卷", event_name: "editor_create_survey" },
              { name: "添加题目", event_name: "editor_add_component" },
              { name: "发布问卷", event_name: "editor_publish_survey" }
            ];
            break;
          case "ai_usage":
            funnelSteps = [
              { name: "进入编辑器", event_name: "page_view" },
              { name: "使用 AI 生成", event_name: "editor_use_ai_generate" },
              { name: "使用 AI 润色", event_name: "editor_use_ai_polish" }
            ];
            break;
          default:
            funnelSteps = [];
        }

        // 并行查询每一步的独立用户数
        const stepResults = await Promise.all(
          funnelSteps.map(async step => {
            // 对于 page_view 需要额外过滤编辑器页面
            let extraFilter = "";
            if (step.event_name === "page_view" && query.funnel_name !== "survey_response") {
              extraFilter = "AND page_url LIKE '%/editor%'";
            }

            const sql = `
              SELECT uniq(coalesce(nullIf(user_id, 0), cityHash64(anonymous_id))) AS unique_users
              FROM tracking_events
              WHERE ${partitionCondition} AND ${dateCondition}
                AND event_name = '${step.event_name}'
                ${appFilter}
                ${extraFilter}
            `;
            const rows = await safeQuery(this.ch, { query: sql });
            return Number(rows[0]?.unique_users ?? 0);
          })
        );

        // 计算转化率
        const firstStepCount = stepResults[0] || 1;
        const steps = funnelSteps.map((step, i) => ({
          name: step.name,
          event_name: step.event_name,
          count: stepResults[i],
          rate: firstStepCount > 0 ? Number(((stepResults[i] / firstStepCount) * 100).toFixed(2)) : 0,
          prev_step_rate:
            i === 0
              ? 100
              : stepResults[i - 1] > 0
                ? Number(((stepResults[i] / stepResults[i - 1]) * 100).toFixed(2))
                : 0
        }));

        return {
          funnel_name: query.funnel_name,
          total_users: firstStepCount,
          steps
        };
      },
      CACHE_TTL.FUNNEL
    );
  }

  // ════════════════════════════════════════════════════════════════
  // AI 使用分析
  // ════════════════════════════════════════════════════════════════

  async getAIUsage(query: AnalyticsAIUsageQueryInput): Promise<AnalyticsAIUsageResponse> {
    const cacheKey = `analytics:ai_usage:${query.range}`;

    return this.cache.getOrSet(
      cacheKey,
      async () => {
        const partitionCondition = rangeToPartitionCondition(query.range);
        const dateCondition = rangeToDateCondition(query.range);

        // 总量统计
        const totalSql = `
          SELECT
            countIf(event_name = 'editor_use_ai_generate') AS generate_count,
            countIf(event_name = 'editor_use_ai_polish') AS polish_count,
            sumIf(JSONExtractFloat(properties, 'prompt_tokens') + JSONExtractFloat(properties, 'completion_tokens'), event_name = 'ai_usage_daily') AS total_tokens,
            sumIf(JSONExtractFloat(properties, 'estimated_cost'), event_name = 'ai_usage_daily') AS estimated_cost
          FROM tracking_events
          WHERE ${partitionCondition} AND ${dateCondition}
            AND event_name IN ('editor_use_ai_generate', 'editor_use_ai_polish', 'ai_usage_daily')
        `;

        // 成功率（有 elapsed_ms 属性表示成功完成）
        const successRateSql = `
          SELECT
            count() AS total,
            countIf(JSONExtractFloat(properties, 'elapsed_ms') > 0) AS success
          FROM tracking_events
          WHERE ${partitionCondition} AND ${dateCondition}
            AND event_name IN ('editor_use_ai_generate', 'editor_use_ai_polish')
        `;

        // 每日趋势
        const dailySql = `
          SELECT
            toDate(timestamp) AS date,
            countIf(event_name = 'editor_use_ai_generate') AS generate_count,
            countIf(event_name = 'editor_use_ai_polish') AS polish_count,
            sumIf(JSONExtractFloat(properties, 'prompt_tokens') + JSONExtractFloat(properties, 'completion_tokens'), event_name = 'ai_usage_daily') AS tokens
          FROM tracking_events
          WHERE ${partitionCondition} AND ${dateCondition}
            AND event_name IN ('editor_use_ai_generate', 'editor_use_ai_polish', 'ai_usage_daily')
          GROUP BY date
          ORDER BY date
        `;

        const [totalRows, successRows, dailyRows] = await Promise.all([
          safeQuery(this.ch, { query: totalSql }),
          safeQuery(this.ch, { query: successRateSql }),
          safeQuery(this.ch, { query: dailySql })
        ]);

        const total = totalRows[0] || {};
        const successData = successRows[0] || {};
        const totalAttempts = Number(successData.total ?? 0);
        const successCount = Number(successData.success ?? 0);

        return {
          generate_count: Number(total.generate_count ?? 0),
          polish_count: Number(total.polish_count ?? 0),
          total_tokens: Number(total.total_tokens ?? 0),
          estimated_cost: Number(total.estimated_cost ?? 0),
          success_rate: totalAttempts > 0 ? Number(((successCount / totalAttempts) * 100).toFixed(2)) : 100,
          daily: dailyRows.map(r => ({
            date: String(r.date),
            generate_count: Number(r.generate_count ?? 0),
            polish_count: Number(r.polish_count ?? 0),
            tokens: Number(r.tokens ?? 0)
          }))
        };
      },
      CACHE_TTL.AI_USAGE
    );
  }

  // ════════════════════════════════════════════════════════════════
  // 事件明细查询
  // ════════════════════════════════════════════════════════════════

  async getEventDetail(query: AnalyticsEventDetailQueryInput): Promise<AnalyticsEventDetailResponse> {
    const partitionCondition = rangeToPartitionCondition(query.range);
    const dateCondition = rangeToDateCondition(query.range);
    const eventFilter = query.event_name ? `AND event_name = '${query.event_name}'` : "";
    const appFilter = query.app_id ? `AND app_id = '${query.app_id}'` : "";
    const userFilter = query.user_id ? `AND user_id = ${query.user_id}` : "";
    const offset = (query.page - 1) * query.page_size;

    // 总数查询
    const countSql = `
      SELECT count() AS total FROM tracking_events
      WHERE ${partitionCondition} AND ${dateCondition}
        ${eventFilter} ${appFilter} ${userFilter}
    `;

    // 明细查询
    const detailSql = `
      SELECT *
      FROM tracking_events
      WHERE ${partitionCondition} AND ${dateCondition}
        ${eventFilter} ${appFilter} ${userFilter}
      ORDER BY timestamp DESC
      LIMIT ${query.page_size} OFFSET ${offset}
    `;

    const [countRows, detailRows] = await Promise.all([
      safeQuery(this.ch, { query: countSql }),
      safeQuery(this.ch, { query: detailSql, maxRows: query.page_size })
    ]);

    return {
      total: Number(countRows[0]?.total ?? 0),
      page: query.page,
      page_size: query.page_size,
      items: detailRows as unknown as AnalyticsEventDetailResponse["items"]
    };
  }

  // ════════════════════════════════════════════════════════════════
  // 实时统计（Redis 配合）
  // ════════════════════════════════════════════════════════════════

  async getRealtimeStats(): Promise<AnalyticsRealtimeStats> {
    const cacheKey = "analytics:realtime";
    return this.cache.getOrSet(
      cacheKey,
      async () => {
        // 最近 5 分钟的实时数据
        const sql = `
          SELECT
            count() AS recent_pv,
            countIf(event_name IN ('js_error', 'vue_error', 'api_error', 'sse_error', 'resource_error')) AS recent_errors,
            avgIf(JSONExtractFloat(properties, 'duration_ms'), event_name = 'api_perf' AND JSONExtractFloat(properties, 'duration_ms') > 0) AS recent_api_avg_ms
          FROM tracking_events
          WHERE date >= today()
            AND timestamp >= now() - INTERVAL 5 MINUTE
        `;

        const rows = await safeQuery(this.ch, { query: sql });
        const data = rows[0] || {};

        return {
          online_users: 0, // 需 Redis 支持，后续接入
          recent_pv: Number(data.recent_pv ?? 0),
          recent_errors: Number(data.recent_errors ?? 0),
          recent_api_avg_ms: Number(Number(data.recent_api_avg_ms ?? 0).toFixed(2))
        };
      },
      CACHE_TTL.REALTIME
    );
  }

  // ════════════════════════════════════════════════════════════════
  // 内部查询辅助
  // ════════════════════════════════════════════════════════════════

  /** 查询今日 PV/UV */
  private async queryPvUvToday(): Promise<{ pv: number; uv: number }> {
    const sql = `
      SELECT
        count() AS pv,
        uniq(coalesce(nullIf(user_id, 0), cityHash64(anonymous_id))) AS uv
      FROM tracking_events
      WHERE date = today() AND event_name = 'page_view'
    `;
    const rows = await safeQuery(this.ch, { query: sql });
    return { pv: Number(rows[0]?.pv ?? 0), uv: Number(rows[0]?.uv ?? 0) };
  }

  /** 查询今日某事件的总数 */
  private async queryCountToday(eventName: string): Promise<number> {
    const sql = `SELECT count() AS cnt FROM tracking_events WHERE date = today() AND event_name = '${eventName}'`;
    const rows = await safeQuery(this.ch, { query: sql });
    return Number(rows[0]?.cnt ?? 0);
  }

  /** 查询今日错误总数 */
  private async queryErrorsToday(): Promise<number> {
    const sql = `
      SELECT count() AS cnt FROM tracking_events
      WHERE date = today()
        AND event_name IN ('js_error', 'vue_error', 'api_error', 'sse_error', 'resource_error')
    `;
    const rows = await safeQuery(this.ch, { query: sql });
    return Number(rows[0]?.cnt ?? 0);
  }

  /** 查询今日 AI 使用次数 */
  private async queryAIUsageToday(): Promise<number> {
    const sql = `
      SELECT count() AS cnt FROM tracking_events
      WHERE date = today()
        AND event_name IN ('editor_use_ai_generate', 'editor_use_ai_polish')
    `;
    const rows = await safeQuery(this.ch, { query: sql });
    return Number(rows[0]?.cnt ?? 0);
  }
}
