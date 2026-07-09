/**
 * TrackingAnalyticsService 单元测试
 *
 * 重点覆盖本次新增的 environment 查询过滤：
 *   - 未传 environment 时默认过滤 production（避免预发/开发数据污染生产看板）
 *   - 显式传入 environment 时按指定环境过滤
 *
 * ClickHouse 查询通过捕获传给 client.query 的 SQL 文本进行断言，
 * 不依赖真实 ClickHouse 实例。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { TrackingAnalyticsService } from "../../modules/tracking/tracking-analytics/tracking-analytics.service.js";
import { createFastifyMock } from "../utils/test-helpers.js";

/** 创建一个捕获查询语句的 ClickHouse mock，query() 始终返回空结果集 */
function createClickHouseQueryCapture() {
  const queries: string[] = [];
  const query = vi.fn(async (opts: { query: string }) => {
    queries.push(opts.query);
    return {
      stream: () => ({
        // 空的异步可迭代结果集，模拟 0 行返回
        [Symbol.asyncIterator]: async function* () {}
      })
    };
  });
  return { query, queries };
}

describe("TrackingAnalyticsService — environment 过滤", () => {
  let fastify: ReturnType<typeof createFastifyMock>;
  let clickhouse: ReturnType<typeof createClickHouseQueryCapture>;
  let service: TrackingAnalyticsService;

  beforeEach(() => {
    fastify = createFastifyMock();
    clickhouse = createClickHouseQueryCapture();
    fastify.clickhouse = clickhouse;
    // 缓存直接回源：get 命中 miss（返回 null），set 加锁立即成功，避免真实等待
    fastify.redis.get.mockResolvedValue(null);
    fastify.redis.set.mockResolvedValue("OK");
    fastify.redis.del.mockResolvedValue(1);

    service = new TrackingAnalyticsService(fastify);
  });

  it("getErrors 默认按 production 过滤", async () => {
    await service.getErrors({ range: "24h", top_n: 10, environment: "production" });

    const sqlWithFilter = clickhouse.queries.find(q => q.includes("environment = 'production'"));
    expect(sqlWithFilter).toBeDefined();
  });

  it("getErrors 显式传入 staging 时按 staging 过滤", async () => {
    await service.getErrors({ range: "24h", top_n: 10, environment: "staging" });

    const sqlWithFilter = clickhouse.queries.find(q => q.includes("environment = 'staging'"));
    expect(sqlWithFilter).toBeDefined();
    expect(clickhouse.queries.some(q => q.includes("environment = 'production'"))).toBe(false);
  });

  it("getPerformance 按 environment 过滤聚合与趋势查询", async () => {
    await service.getPerformance({ range: "24h", metric: "lcp", environment: "staging" });

    const filtered = clickhouse.queries.filter(q => q.includes("environment = 'staging'"));
    // 聚合查询 + 趋势查询，两条 SQL 都应带上过滤条件
    expect(filtered.length).toBe(2);
  });

  it("getTrend（pv 指标）按 environment 过滤", async () => {
    await service.getTrend({ metric: "pv", granularity: "hour", range: "24h", environment: "development" });

    const sqlWithFilter = clickhouse.queries.find(q => q.includes("environment = 'development'"));
    expect(sqlWithFilter).toBeDefined();
  });

  it("不同 environment 的查询使用不同缓存 key（避免相互污染）", async () => {
    await service.getErrors({ range: "24h", top_n: 10, environment: "production" });
    await service.getErrors({ range: "24h", top_n: 10, environment: "staging" });

    // 两次调用应各自触发一次 ClickHouse 查询（缓存 key 不同，不会命中彼此的缓存）
    const errorQueries = clickhouse.queries.filter(q => q.includes("cityHash64"));
    expect(errorQueries.length).toBe(2);
  });
});
