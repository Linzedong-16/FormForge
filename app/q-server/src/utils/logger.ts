/**
 * 结构化日志工具
 *
 * 提供带自动脱敏、requestId 追踪的日志方法。
 * 底层依赖 Fastify 的 pino 实例，不创建新的 logger。
 */
import type { FastifyInstance } from "fastify";

// ─── 脱敏规则 ────────────────────────────────────────────────

const SENSITIVE_KEYS = [
  "password",
  "password_hash",
  "token",
  "refreshToken",
  "authorization",
  "accessToken",
  "newPassword"
];

/** 脱敏单字段值 */
function maskValue(key: string, value: unknown): unknown {
  if (typeof value !== "string") return value;
  if (key === "password" || key === "password_hash" || key === "newPassword") return "***";
  if (key === "token" || key === "refreshToken") {
    return value.length > 16 ? `${value.slice(0, 8)}***${value.slice(-8)}` : "***";
  }
  if (key === "email" || (key === "email" && value.includes("@"))) {
    const [local, domain] = value.split("@");
    const masked = local.length <= 2 ? local + "***" : local.slice(0, 2) + "***";
    return `${masked}@${domain}`;
  }
  return value;
}

/** 递归脱敏对象 */
function sanitize(obj: unknown, depth = 0): unknown {
  if (depth > 3 || obj === null || obj === undefined) return obj;
  if (typeof obj !== "object") return obj;

  if (Array.isArray(obj)) {
    return obj.map(item => sanitize(item, depth + 1));
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.some(k => key.toLowerCase().includes(k.toLowerCase()))) {
      result[key] = maskValue(key, value);
    } else {
      result[key] = sanitize(value, depth + 1);
    }
  }
  return result;
}

// ─── Logger 封装 ─────────────────────────────────────────────

export interface StructuredLogger {
  trace: (msg: string, ctx?: Record<string, unknown>) => void;
  debug: (msg: string, ctx?: Record<string, unknown>) => void;
  info: (msg: string, ctx?: Record<string, unknown>) => void;
  warn: (msg: string, ctx?: Record<string, unknown>) => void;
  error: (msg: string, ctx?: Record<string, unknown>) => void;
  fatal: (msg: string, ctx?: Record<string, unknown>) => void;
}

/**
 * 基于 Fastify 实例创建结构化 logger
 *
 * @example
 *   const log = createLogger(fastify);
 *   log.info("用户登录", { email: "a@b.com", requestId: "xxx" });
 */
export function createLogger(fastify: FastifyInstance): StructuredLogger {
  return {
    trace(msg, ctx) {
      fastify.log.trace(sanitize({ msg, ...ctx }), msg);
    },
    debug(msg, ctx) {
      fastify.log.debug(sanitize({ msg, ...ctx }), msg);
    },
    info(msg, ctx) {
      fastify.log.info(sanitize({ msg, ...ctx }), msg);
    },
    warn(msg, ctx) {
      fastify.log.warn(sanitize({ msg, ...ctx }), msg);
    },
    error(msg, ctx) {
      fastify.log.error(sanitize({ msg, ...ctx }), msg);
    },
    fatal(msg, ctx) {
      fastify.log.fatal(sanitize({ msg, ...ctx }), msg);
    }
  };
}
