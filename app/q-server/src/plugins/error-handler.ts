/**
 * 全局错误处理插件
 *
 * 兜底所有未捕获的异常，统一输出 { data, code, msg } 格式。
 * 注册顺序应在所有插件之前，确保覆盖全链路。
 */

import fp from "fastify-plugin";
import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { AppError } from "../utils/errors.js";
import type { ApiResponse } from "../utils/response.js";
import { StatusCode } from "../utils/response.js";

// ─── Prisma 常见错误码映射 ───────────────────────────────────

/** Prisma 错误码 → 业务状态码 + 用户友好消息 */
const PRISMA_ERROR_MAP: Record<string, { code: number; status: number; msg: string }> = {
  P2002: { code: 409, status: 409, msg: "数据已存在，请检查唯一字段" }, // Unique constraint
  P2025: { code: 404, status: 404, msg: "请求的资源不存在或已被删除" }, // Record not found
  P2003: { code: 400, status: 400, msg: "关联数据不存在，请检查引用" }, // Foreign key constraint
  P2014: { code: 400, status: 400, msg: "数据关联冲突，请先删除关联项" } // Required relation
};

/** @fastify/multipart 等插件常见错误码 → 用户友好的中文提示 */
const FASTIFY_ERROR_MSG_MAP: Record<string, string> = {
  FST_REQ_FILE_TOO_LARGE: "文件大小超出限制",
  FST_FILES_LIMIT: "上传文件数量超出限制",
  FST_FIELDS_LIMIT: "表单字段数量超出限制",
  FST_PARTS_LIMIT: "表单内容超出限制",
  FST_INVALID_MULTIPART_CONTENT_TYPE: "请求格式错误，请使用 multipart/form-data 上传"
};

/**
 * 判断错误是否为 Prisma 已知错误（携带 code 字段）
 */
function isPrismaError(err: unknown): err is Error & { code: string; meta?: Record<string, unknown> } {
  if (!(err instanceof Error)) return false;
  const maybePrisma = err as unknown as Record<string, unknown>;
  return typeof maybePrisma.code === "string" && String(maybePrisma.code).startsWith("P");
}

// ─── 工具函数 ────────────────────────────────────────────────

/** 运行时求值，避免模块顶层快照导致 env 切换后仍使用旧值 */
const isProduction = () => process.env.NODE_ENV === "production";

/**
 * 日志脱敏 — 移除对象中的敏感字段
 */
function sanitizeForLog(obj: unknown): unknown {
  if (!obj || typeof obj !== "object") return obj;
  const cloned = { ...(obj as Record<string, unknown>) };
  const sensitiveKeys = ["password", "password_hash", "token", "refreshToken", "authorization"];
  for (const key of sensitiveKeys) {
    if (key in cloned) cloned[key] = "***REDACTED***";
  }
  return cloned;
}

// ─── 核心处理器 ───────────────────────────────────────────────

const errorHandlerPlugin: import("fastify").FastifyPluginAsync = async fastify => {
  fastify.setErrorHandler((error: FastifyError | Error, request: FastifyRequest, reply: FastifyReply) => {
    // ════════════════════════════════════════════════════════════
    // 1. AppError 及其子类（AuthError / ValidationError）
    // ════════════════════════════════════════════════════════════
    if (error instanceof AppError) {
      request.log.warn(
        { err: sanitizeForLog({ name: error.name, message: error.message, code: error.code, details: error.details }) },
        `[${error.name}] ${error.message}`
      );

      return reply.status(error.statusCode).send({
        data: error.details ?? null,
        code: error.code,
        msg: error.message
      } satisfies ApiResponse);
    }

    // ════════════════════════════════════════════════════════════
    // 2. Fastify 内置校验错误（schema validation）
    // ════════════════════════════════════════════════════════════
    if ("validation" in error && error.validation) {
      request.log.warn({ err: error.validation }, "请求参数校验失败");

      return reply.status(400).send({
        data: error.validation,
        code: StatusCode.BAD_REQUEST,
        msg: "请求参数校验失败"
      } satisfies ApiResponse);
    }

    // ════════════════════════════════════════════════════════════
    // 3. Prisma 数据库错误
    // ════════════════════════════════════════════════════════════
    if (isPrismaError(error)) {
      const mapped = PRISMA_ERROR_MAP[error.code];
      if (mapped) {
        request.log.error({ err: { prismaCode: error.code, meta: error.meta } }, `Prisma error ${error.code}`);
        return reply.status(mapped.status).send({
          data: null,
          code: mapped.code,
          msg: mapped.msg
        } satisfies ApiResponse);
      }

      // 未映射的 Prisma 错误 → 500
      request.log.error({ err: error }, `未处理的 Prisma 错误: ${error.code}`);
      return reply.status(500).send({
        data: null,
        code: StatusCode.INTERNAL_ERROR,
        msg: isProduction() ? "服务器内部错误" : `数据库错误: ${error.code}`
      } satisfies ApiResponse);
    }

    // ════════════════════════════════════════════════════════════
    // 4. Fastify / 插件级 4xx 错误（如 @fastify/multipart 文件超限、字段超限等）
    //    这类错误自带正确的 statusCode，此前被下方兜底分支强制覆盖为 500，
    //    导致"文件过大"等客户端可修正的错误被误报为服务器内部错误。
    // ════════════════════════════════════════════════════════════
    if (
      "statusCode" in error &&
      typeof error.statusCode === "number" &&
      error.statusCode >= 400 &&
      error.statusCode < 500
    ) {
      const statusCode = error.statusCode;
      const code = "code" in error ? String(error.code) : undefined;
      request.log.warn({ err: { code, message: error.message } }, "请求被拒绝（插件级校验）");

      return reply.status(statusCode).send({
        data: null,
        code: statusCode,
        msg: FASTIFY_ERROR_MSG_MAP[code ?? ""] ?? error.message
      } satisfies ApiResponse);
    }

    // ════════════════════════════════════════════════════════════
    // 5. 其他未预期错误 — 兜底 500
    // ════════════════════════════════════════════════════════════
    request.log.error(
      { err: sanitizeForLog({ name: error.name, message: error.message, stack: error.stack }) },
      "未处理的服务器错误"
    );

    return reply.status(500).send({
      data: null,
      code: StatusCode.INTERNAL_ERROR,
      msg: isProduction() ? "服务器内部错误" : error.message
    } satisfies ApiResponse);
  });
};

export default fp(errorHandlerPlugin, { name: "error-handler" });
