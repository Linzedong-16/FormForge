/**
 * Redis 缓存工具 — 问卷数据多级缓存层
 *
 * 设计思路：
 *   - 读取：先查 Redis，miss 则查 DB 并回填缓存（Cache-Aside 模式）
 *   - 写入：DB 写入成功后，主动删除缓存（防止脏数据）
 *   - TTL：短 TTL（5min）保证数据最终一致性
 *
 * 使用示例：
 *   const cache = createCache(fastify);
 *   const data = await cache.getOrSet("survey:123", () => db.findById(123), 300);
 */
import type { FastifyInstance } from "fastify";

// ─── 默认配置 ──────────────────────────────────────────────

const DEFAULT_TTL = 300; // 5 分钟
const CACHE_PREFIX = "cache:";

// ─── 缓存客户端 ────────────────────────────────────────────

export interface CacheClient {
  /** 读取缓存，miss 返回 null */
  get<T>(key: string): Promise<T | null>;
  /** 写入缓存 */
  set(key: string, value: unknown, ttl?: number): Promise<void>;
  /** 删除缓存 */
  del(key: string): Promise<void>;
  /** 批量删除（按前缀匹配） */
  delByPattern(pattern: string): Promise<void>;
  /** 读取或回源 — Cache-Aside 模式 */
  getOrSet<T>(key: string, factory: () => Promise<T>, ttl?: number): Promise<T>;
}

/**
 * 基于 Fastify Redis 插件创建缓存客户端
 */
export function createCache(fastify: FastifyInstance): CacheClient {
  const { redis } = fastify;

  async function get<T>(key: string): Promise<T | null> {
    try {
      const raw = await redis.get(`${CACHE_PREFIX}${key}`);
      if (raw === null) return null;
      return JSON.parse(raw) as T;
    } catch {
      fastify.log.warn(`Redis 读取失败，降级跳过缓存: ${key}`);
      return null;
    }
  }

  async function set(key: string, value: unknown, ttl = DEFAULT_TTL): Promise<void> {
    try {
      await redis.set(`${CACHE_PREFIX}${key}`, JSON.stringify(value), "EX", ttl);
    } catch {
      fastify.log.warn(`Redis 写入失败: ${key}`);
    }
  }

  async function del(key: string): Promise<void> {
    try {
      await redis.del(`${CACHE_PREFIX}${key}`);
    } catch {
      fastify.log.warn(`Redis 删除失败: ${key}`);
    }
  }

  async function delByPattern(pattern: string): Promise<void> {
    try {
      // SCAN 避免 KEYS 阻塞（生产环境 KEYS 是危险操作）
      let cursor = "0";
      do {
        const [nextCursor, keys] = await redis.scan(cursor, "MATCH", `${CACHE_PREFIX}${pattern}`, "COUNT", "100");
        cursor = nextCursor;
        if (keys.length > 0) {
          await redis.del(...keys);
        }
      } while (cursor !== "0");
    } catch {
      fastify.log.warn(`Redis 批量删除失败: ${pattern}`);
    }
  }

  async function getOrSet<T>(key: string, factory: () => Promise<T>, ttl = DEFAULT_TTL): Promise<T> {
    const cached = await get<T>(key);
    if (cached !== null) {
      return cached;
    }

    const data = await factory();
    // 后台回填缓存，不阻塞响应
    set(key, data, ttl).catch(() => {});
    return data;
  }

  return { get, set, del, delByPattern, getOrSet };
}

// ─── 问卷缓存键规范 ────────────────────────────────────────

/** 问卷相关缓存 Key 命名 */
export const CacheKeys = {
  /** 问卷详情 */
  surveyDetail: (id: string) => `survey:detail:${id}`,
  /** 问卷列表 */
  surveyList: (page: number, size: number) => `survey:list:${page}:${size}`,
  /** 问卷统计数据 */
  surveyStats: (surveyId: string) => `survey:stats:${surveyId}`,
  /** 用户信息 */
  userProfile: (userId: string) => `user:profile:${userId}`,
  /** 系统配置 */
  systemConfig: (key: string) => `config:${key}`,
  /** 删除某问卷的所有缓存 */
  surveyAll: (id: string) => `survey:*:${id}*`
} as const;
