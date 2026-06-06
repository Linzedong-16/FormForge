/**
 * Zod 校验工具函数 — 与 Fastify reply 集成的快捷解析
 */

import type { ZodError } from "zod";
import type { FastifyReply } from "fastify";

/** safeParse 返回的联合类型 */
type SafeResult<T> = { success: true; data: T } | { success: false; error: ZodError };

/**
 * 解析请求体 — 校验失败自动响应 400
 *
 * @example
 *   const body = parseAndRespond(loginSchema.safeParse(request.body), reply);
 *   if (!body) return;  // 校验失败已自动响应
 *   // body 类型已收窄为 LoginInput
 */
export function parseAndRespond<T>(result: SafeResult<T>, reply: FastifyReply): T | null {
  if (!result.success) {
    const msg = result.error.issues[0]?.message ?? "参数校验失败";
    reply.status(400).send({ data: null, code: 400, msg });
    return null;
  }
  return result.data;
}

/**
 * 解析查询参数 — 校验失败自动响应 400
 */
export function parseQueryAndRespond<T>(result: SafeResult<T>, reply: FastifyReply): T | null {
  if (!result.success) {
    const messages = result.error.issues.map(e => `${e.path.join(".")}: ${e.message}`);
    reply.status(400).send({ data: null, code: 400, msg: messages.join("; ") });
    return null;
  }
  return result.data;
}

/**
 * 格式化 ZodError 为结构化数组
 */
export function formatZodErrors(error: ZodError): Array<{ path: string; message: string }> {
  return error.issues.map(e => ({
    path: e.path.join("."),
    message: e.message
  }));
}
