/**
 * 结构化日志工具
 *
 * 提供带自动脱敏的日志方法，通过 Fastify hook 自动注入到 request.log
 */
import type { FastifyInstance } from "fastify";

const SENSITIVE_KEYS = [
  "password",
  "password_hash",
  "token",
  "refreshToken",
  "authorization",
  "accessToken",
  "newPassword"
];

function maskValue(key: string, value: unknown): unknown {
  if (typeof value !== "string") return value;
  if (key === "password" || key === "password_hash" || key === "newPassword") return "***";
  if (key === "token" || key === "refreshToken") {
    return value.length > 16 ? `${value.slice(0, 8)}***${value.slice(-8)}` : "***";
  }
  if (key === "email") {
    const [local, domain] = value.split("@");
    const masked = local.length <= 2 ? local + "***" : local.slice(0, 2) + "***";
    return `${masked}@${domain}`;
  }
  return value;
}

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

export interface StructuredLogger {
  trace: (msg: string, ctx?: Record<string, unknown>) => void;
  debug: (msg: string, ctx?: Record<string, unknown>) => void;
  info: (msg: string, ctx?: Record<string, unknown>) => void;
  warn: (msg: string, ctx?: Record<string, unknown>) => void;
  error: (msg: string, ctx?: Record<string, unknown>) => void;
  fatal: (msg: string, ctx?: Record<string, unknown>) => void;
}

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

/**
 * Fastify Plugin: 自动为 request.log 添加脱敏能力
 *
 * 使用方式：在 app.ts 中注册此插件后，request.log 自动脱敏
 */
import fp from "fastify-plugin";
import type { FastifyPluginAsync, FastifyRequest } from "fastify";

declare module "fastify" {
  interface FastifyRequest {
    sanitizedLog: StructuredLogger;
  }
}

const loggerPlugin: FastifyPluginAsync = async fastify => {
  fastify.addHook("onRequest", (request: FastifyRequest) => {
    request.sanitizedLog = {
      trace(msg, ctx) {
        request.log.trace(sanitize({ msg, ...ctx }), msg);
      },
      debug(msg, ctx) {
        request.log.debug(sanitize({ msg, ...ctx }), msg);
      },
      info(msg, ctx) {
        request.log.info(sanitize({ msg, ...ctx }), msg);
      },
      warn(msg, ctx) {
        request.log.warn(sanitize({ msg, ...ctx }), msg);
      },
      error(msg, ctx) {
        request.log.error(sanitize({ msg, ...ctx }), msg);
      },
      fatal(msg, ctx) {
        request.log.fatal(sanitize({ msg, ...ctx }), msg);
      }
    };
  });
};

export default fp(loggerPlugin, { name: "logger" });
