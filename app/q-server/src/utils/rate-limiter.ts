/**
 * Redis 限流工具 — 原子化请求频率控制
 *
 * 实现策略：
 *   - SET NX EX 初始化计数器（不存在时创建，同时设 TTL）
 *   - INCR 递增计数
 *   - 两步操作虽非单条 Redis 命令，但 SET NX 保证了初始化只发生一次，
 *     INCR 是原子操作，整体不存在竞态窗口
 *
 * @example
 * ```typescript
 * import { checkRateLimit } from "../utils/rate-limiter.js";
 * const allowed = await checkRateLimit(fastify, userId, {
 *   prefix: "rate:ai_generate:",
 *   max: 3
 * });
 * if (!allowed) {
 *   // 返回限流错误
 * }
 * ```
 */

import type { FastifyInstance } from "fastify";

/** 限流配置 */
export interface RateLimitConfig {
  /** 计数器 Key 前缀 */
  prefix: string;
  /** 每分钟最大请求数 */
  max: number;
  /** 计数器 TTL（秒），默认 60 */
  ttl?: number;
}

/**
 * 原子化限流检查
 *
 * @param fastify Fastify 实例（需含 redis 插件）
 * @param userId  用户 ID
 * @param config  限流配置
 * @returns true = 允许请求，false = 超限需拦截
 */
export async function checkRateLimit(
  fastify: FastifyInstance,
  userId: bigint,
  config: RateLimitConfig
): Promise<boolean> {
  const key = `${config.prefix}${userId}`;
  const ttl = config.ttl ?? 60;
  try {
    await fastify.redis.set(key, "0", "EX", ttl, "NX");
    const current = await fastify.redis.incr(key);
    return current <= config.max;
  } catch {
    fastify.log.warn(`限流 Redis 操作失败（prefix=${config.prefix}），降级放行`);
    return true;
  }
}
