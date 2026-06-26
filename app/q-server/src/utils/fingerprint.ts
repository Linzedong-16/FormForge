/**
 * 浏览器指纹处理工具
 *
 * 职责：
 *   - 前端指纹哈希的二次服务端哈希（加盐防彩虹表）
 *   - 临时 token 的生成与验证
 *   - 提交去重记录的读写
 *
 * 安全设计：
 *   - 前端先 SHA-256 哈希指纹再传输，服务端加盐二次哈希
 *   - 指纹不存明文，仅存加盐哈希
 *   - Token 使用 crypto.randomUUID() 生成，绑定问卷 ID
 */

import { createHash, randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";

// ─── 配置 ──────────────────────────────────────────────────

/** 指纹哈希加盐 — 从环境变量注入，未配置则使用默认值（生产环境必须配置） */
function getFingerprintSalt(): string {
  return process.env.FINGERPRINT_SALT ?? "questionnaire-sys-default-salt-2026";
}

/** Token 有效期（秒），默认 30 分钟 */
const TOKEN_TTL = 1800;
/** 提交记录有效期（秒），默认 24 小时 — 防止同一天内重复提交 */
const SUBMIT_RECORD_TTL = 86400;
/** 上一个 token 保留时间（秒），Key 轮换防重放 */
const PREV_TOKEN_TTL = 60;

// ─── 缓存 Key 规范 ─────────────────────────────────────────

const CacheKeys = {
  /** 临时 token 存储：survey:token:{surveyId}:{token} */
  token: (surveyId: string, token: string) => `survey:token:${surveyId}:${token}`,
  /** 上一个 token 标记（防重放）：survey:token:prev:{surveyId} */
  prevToken: (surveyId: string) => `survey:token:prev:${surveyId}`,
  /** 提交去重记录：survey:submit:{surveyId}:{fingerprintHash}（同一设备+同一问卷不可重复提交） */
  submitRecord: (surveyId: string, fingerprintHash: string) => `survey:submit:${surveyId}:${fingerprintHash}`
};

// ════════════════════════════════════════════════════════════
//  指纹哈希
// ════════════════════════════════════════════════════════════

/**
 * 对前端发来的指纹哈希进行服务端二次加盐哈希
 *
 * 前端已做 SHA-256（减小传输体积），服务端加盐再做一次 SHA-256，
 * 防止彩虹表攻击和原始指纹泄露
 *
 * @param clientHash 前端计算好的 SHA-256 哈希（hex 字符串）
 * @returns 加盐后的二次哈希
 */
export function hashFingerprint(clientHash: string): string {
  const salt = getFingerprintSalt();
  return createHash("sha256").update(`${clientHash}:${salt}`).digest("hex");
}

// ════════════════════════════════════════════════════════════
//  Token 管理
// ════════════════════════════════════════════════════════════

/**
 * 生成临时 token（UUID v4）
 *
 * 特性：
 *   - 使用 crypto.randomUUID() 保证唯一性
 *   - 与问卷 ID 绑定，防止跨问卷复用
 *   - 存储在 Redis 中，设置 TTL
 */
export function generateToken(): string {
  return randomUUID();
}

/**
 * 存储临时 token 到 Redis
 *
 * @param fastify Fastify 实例
 * @param surveyId 问卷 ID
 * @param token 临时 token
 * @returns 是否存储成功
 */
export async function storeToken(fastify: FastifyInstance, surveyId: string, token: string): Promise<boolean> {
  try {
    const key = CacheKeys.token(surveyId, token);
    const value = JSON.stringify({
      token,
      survey_id: surveyId,
      created_at: Date.now(),
      expires_at: Date.now() + TOKEN_TTL * 1000
    });
    await fastify.redis.set(key, value, "EX", TOKEN_TTL);
    return true;
  } catch {
    fastify.log.warn(`[fingerprint] Redis 存储 token 失败: surveyId=${surveyId}`);
    return false;
  }
}

/**
 * 验证 token 是否有效（存在且未过期）
 *
 * @param fastify Fastify 实例
 * @param surveyId 问卷 ID
 * @param token 待验证的临时 token
 * @returns 有效返回 true，否则返回 false
 */
export async function validateToken(fastify: FastifyInstance, surveyId: string, token: string): Promise<boolean> {
  try {
    const key = CacheKeys.token(surveyId, token);
    const raw = await fastify.redis.get(key);
    if (!raw) return false;

    const data = JSON.parse(raw) as { expires_at: number };
    return Date.now() < data.expires_at;
  } catch {
    fastify.log.warn(`[fingerprint] Redis 验证 token 失败: surveyId=${surveyId}`);
    // Redis 不可用时降级放行（不阻塞正常提交）
    return true;
  }
}

/**
 * 消费 token（验证通过后删除，防止复用）
 *
 * @param fastify Fastify 实例
 * @param surveyId 问卷 ID
 * @param token 待消费的临时 token
 */
export async function consumeToken(fastify: FastifyInstance, surveyId: string, token: string): Promise<void> {
  try {
    const key = CacheKeys.token(surveyId, token);
    await fastify.redis.del(key);
  } catch {
    fastify.log.warn(`[fingerprint] Redis 删除 token 失败: surveyId=${surveyId}`);
  }
}

// ════════════════════════════════════════════════════════════
//  提交去重记录
// ════════════════════════════════════════════════════════════

/**
 * 检查是否已提交（防重复提交）
 *
 * 去重维度：同一设备（指纹）+ 同一问卷 → 24 小时内不可重复提交
 * 使用 Redis SET NX 原子操作：
 *   - 若 key 不存在 → 返回 null（首次提交）
 *   - 若 key 已存在 → 返回已有记录（重复提交）
 *
 * @param fastify Fastify 实例
 * @param surveyId 问卷 ID（字符串）
 * @param fingerprintHash 服务端加盐后的指纹哈希
 * @returns 已存在的提交记录，或 null（首次提交）
 */
export async function checkDuplicateSubmit(
  fastify: FastifyInstance,
  surveyId: string,
  fingerprintHash: string
): Promise<{ response_id: string; submitted_at: number } | null> {
  try {
    const key = CacheKeys.submitRecord(surveyId, fingerprintHash);

    // 先检查是否已存在
    const existing = await fastify.redis.get(key);
    if (existing) {
      return JSON.parse(existing) as { response_id: string; submitted_at: number };
    }

    return null;
  } catch {
    fastify.log.warn("[fingerprint] Redis 检查去重记录失败，降级放行");
    // Redis 不可用时降级放行
    return null;
  }
}

/**
 * 记录提交（写入去重缓存）
 *
 * @param fastify Fastify 实例
 * @param surveyId 问卷 ID（字符串）
 * @param fingerprintHash 服务端加盐后的指纹哈希
 * @param responseId 答卷 ID
 */
export async function recordSubmit(
  fastify: FastifyInstance,
  surveyId: string,
  fingerprintHash: string,
  responseId: string
): Promise<void> {
  try {
    const key = CacheKeys.submitRecord(surveyId, fingerprintHash);
    const value = JSON.stringify({
      response_id: responseId,
      submitted_at: Date.now()
    });
    // SET NX：仅当 key 不存在时写入，防止并发覆盖
    await fastify.redis.set(key, value, "EX", SUBMIT_RECORD_TTL, "NX");
  } catch {
    fastify.log.warn(`[fingerprint] Redis 记录提交失败: responseId=${responseId}`);
  }
}

// ════════════════════════════════════════════════════════════
//  Key 轮换相关（防重放）
// ════════════════════════════════════════════════════════════

/**
 * 保存上一个 token 标记（用于 Key 轮换防重放）
 *
 * 当用户刷新页面获取新 token 时，旧 token 在短时间内仍有效，
 * 将旧 token 标记为"即将过期"，保留短时间窗口用于合法提交
 *
 * @param fastify Fastify 实例
 * @param surveyId 问卷 ID
 * @param oldToken 旧 token
 */
export async function markPrevToken(fastify: FastifyInstance, surveyId: string, oldToken: string): Promise<void> {
  try {
    const key = CacheKeys.prevToken(surveyId);
    await fastify.redis.set(key, oldToken, "EX", PREV_TOKEN_TTL);
  } catch {
    fastify.log.warn(`[fingerprint] Redis 标记旧 token 失败: surveyId=${surveyId}`);
  }
}

/**
 * 检查是否为上一个 token（Key 轮换过渡期验证）
 */
export async function isPrevToken(fastify: FastifyInstance, surveyId: string, token: string): Promise<boolean> {
  try {
    const key = CacheKeys.prevToken(surveyId);
    const prevToken = await fastify.redis.get(key);
    return prevToken === token;
  } catch {
    return false;
  }
}
