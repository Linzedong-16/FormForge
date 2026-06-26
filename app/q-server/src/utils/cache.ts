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
/** 缓存重建锁 TTL（秒），确保锁持有者完成后其他请求可重试 */
const LOCK_TTL = 10;
/** 未获取锁时的重试等待（毫秒） */
const LOCK_RETRY_DELAY_MS = 200;
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
      // #region debug-point cache-get-start
      const t0 = Date.now();
      // #endregion
      const raw = await redis.get(`${CACHE_PREFIX}${key}`);
      // #region debug-point cache-get-end
      const latency = Date.now() - t0;
      if (latency > 100) {
        fastify.log.warn({ latency_ms: latency, key }, "[debug] cache: Redis GET slow");
      }
      // #endregion
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
          await redis.unlink(...keys);
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

    // 尝试获取重建锁（SET NX），防止缓存击穿
    const lockKey = `${CACHE_PREFIX}${key}:lock`;
    let locked = false;
    try {
      locked = (await redis.set(lockKey, "1", "EX", LOCK_TTL, "NX")) === "OK";
    } catch {
      // Redis 不可用时跳过锁，直接回源
    }

    if (locked) {
      try {
        // 双检查：另一个锁持有者可能已经回填了缓存
        const fresh = await get<T>(key);
        if (fresh !== null) return fresh;

        const data = await factory();
        // 同步写回，确保后续请求立即命中
        try {
          await redis.set(`${CACHE_PREFIX}${key}`, JSON.stringify(data), "EX", ttl);
        } catch {
          fastify.log.warn(`Redis 回填缓存失败: ${key}`);
        }
        return data;
      } finally {
        // 释放锁
        try {
          await redis.del(lockKey);
        } catch {
          // 锁 TTL 自动过期兜底
        }
      }
    }

    // 未获锁 → 等待后重试读缓存，仍 miss 则降级直接回源
    await new Promise(resolve => setTimeout(resolve, LOCK_RETRY_DELAY_MS));
    const retry = await get<T>(key);
    if (retry !== null) return retry;

    // 降级：直接回源，尝试写入缓存以减少后续击穿
    const data = await factory();
    try {
      await redis.set(`${CACHE_PREFIX}${key}`, JSON.stringify(data), "EX", ttl);
    } catch {
      // 写缓存失败不影响返回
    }
    return data;
  }

  return { get, set, del, delByPattern, getOrSet };
}

// ─── 缓存键规范 — 集中管理所有缓存 Key ────────────────────────

/** 缓存 Key 命名常量（便于全局搜索 & 避免硬编码） */
export const CacheKeys = {
  // ─── 用户模块 ──────────────────────────────────────────────
  /** 系统初始化状态（是否存在超级管理员） */
  systemInitialized: "user:system:initialized",
  /** 注册功能开关 */
  registrationEnabled: "user:config:registration_enabled",
  /** SMTP 配置状态 */
  smtpConfigured: "user:config:smtp_enabled",
  /** 用户角色列表（userId → role[]） */
  userRoles: (userId: string) => `user:roles:${userId}`,
  /** 用户认证档案（verifyToken 查询结果，含 status） */
  userAuthProfile: (userId: string) => `user:auth:${userId}`,
  /** 用户列表页缓存前缀（用于模糊匹配批量失效） */
  userListPrefix: "user:list:",

  // ─── 用户封禁模块 ──────────────────────────────────────────
  /** 用户封禁黑名单（value 任意非空字符串，TTL = 封禁期限） */
  userBanStatus: (userId: string) => `user:ban:${userId}`,
  /** 用户首次登录标记（value = "1"，TTL = 7天） */
  userFirstLogin: (userId: string) => `user:first_login:${userId}`,

  // ─── 用户资料模块 ──────────────────────────────────────────
  /** 用户资料（含 UserProfile 全部字段） */
  userProfile: (userId: string) => `user:profile:${userId}`,

  // ─── 问卷模块 ──────────────────────────────────────────────
  /** 问卷详情 */
  surveyDetail: (id: string) => `survey:detail:${id}`,
  /** 问卷列表 */
  surveyList: (userId: string, page: number, size: number, status: string, keyword: string) =>
    `survey:list:${userId}:${page}:${size}:${status}:${keyword}`,
  /** 问卷列表缓存前缀（用于批量失效） */
  surveyListPattern: (userId: string) => `survey:list:${userId}:*`,
  /** 问卷统计数据 */
  surveyStats: (surveyId: string) => `survey:stats:${surveyId}`,
  /** 问卷模块全部缓存前缀（用于批量失效） */
  surveyAll: (id: string) => `survey:*:${id}*`,
  /** 答卷详情 */
  responseDetail: (id: string) => `response:detail:${id}`,
  /** 答卷缓存前缀（用于批量失效） */
  responsePattern: (surveyId: string) => `response:survey:${surveyId}:*`,

  // ─── 统计模块 ──────────────────────────────────────────
  /** 平台统计概览 */
  statsOverview: "admin:stats:overview",
  /** 单问卷统计 */
  statsBySurvey: (surveyId: string) => `admin:stats:survey:${surveyId}`,

  // ─── 问卷文件模块 ──────────────────────────────────────────
  /** 问卷文件列表 */
  surveyFileList: (surveyId: string) => `survey:file:list:${surveyId}`,
  /** 问卷文件列表缓存前缀（用于批量失效） */
  surveyFileListPattern: (surveyId: string) => `survey:file:list:${surveyId}:*`,

  // ─── 问卷链接模块 ──────────────────────────────────────────
  /** 问卷链接截止时间 */
  surveyDeadline: (surveyId: string) => `survey:deadline:${surveyId}`
} as const;

/** 缓存 TTL（秒）常量 */
export const CacheTTL = {
  /** 系统状态 / 配置：60s（变更频率极低，但仍需感知配置更新） */
  SYSTEM_STATUS: 60,
  /** 用户角色：600s（10min，角色极少变更） */
  USER_ROLES: 600,
  /** 用户认证档案：300s（5min，用户状态变更后需感知） */
  USER_AUTH_PROFILE: 300,
  /** 问卷数据：300s（5min，编辑后可能变化） */
  SURVEY: 300,
  /** 答卷数据：600s（10min，只读不变） */
  RESPONSE: 600,
  /** 默认：300s */
  DEFAULT: 300
} as const;
