/**
 * 全局响应插件 — 装饰 reply 对象，提供快捷响应方法
 *
 * 使用方式（路由中）：
 *   fastify.get("/api/user", async (req, reply) => {
 *     const user = await ...;
 *     return reply.sendSuccess(user);           // { data: user, code: 0, msg: "ok" }
 *   });
 *
 *   fastify.get("/api/user/:id", async (req, reply) => {
 *     const user = await ...;
 *     if (!user) return reply.sendNotFound("用户不存在");
 *     return reply.sendSuccess(user);
 *   });
 */
import fp from "fastify-plugin";
import { success, fail, badRequest, unauthorized, forbidden, notFound, serverError } from "../utils/response.js";
import type { FastifyReply } from "fastify";
// import type { ApiResponse } from "../utils/response.js";

// ─── 扩展 FastifyReply 类型 ─────────────────────────────────

declare module "fastify" {
  interface FastifyReply {
    /** 成功响应 */
    sendSuccess: <T = unknown>(data: T, msg?: string, code?: number) => FastifyReply;
    /** 失败响应 */
    sendFail: (code: number, msg: string, data?: unknown) => FastifyReply;
    /** 参数错误 */
    sendBadRequest: (msg?: string) => FastifyReply;
    /** 未登录 */
    sendUnauthorized: (msg?: string) => FastifyReply;
    /** 无权限 */
    sendForbidden: (msg?: string) => FastifyReply;
    /** 资源不存在 */
    sendNotFound: (msg?: string) => FastifyReply;
    /** 服务器错误 */
    sendServerError: (msg?: string) => FastifyReply;
  }
}

// ─── 插件实现 ───────────────────────────────────────────────

const responsePlugin: import("fastify").FastifyPluginAsync = async fastify => {
  // 装饰 reply 对象，注入快捷响应方法
  fastify.decorateReply("sendSuccess", function <T>(this: FastifyReply, data: T, msg?: string, code?: number) {
    return this.send(success(data, msg, code));
  });

  fastify.decorateReply("sendFail", function (this: FastifyReply, code: number, msg: string, data?: unknown) {
    return this.send(fail(code, msg, data));
  });

  fastify.decorateReply("sendBadRequest", function (this: FastifyReply, msg?: string) {
    return this.send(badRequest(msg));
  });

  fastify.decorateReply("sendUnauthorized", function (this: FastifyReply, msg?: string) {
    return this.send(unauthorized(msg));
  });

  fastify.decorateReply("sendForbidden", function (this: FastifyReply, msg?: string) {
    return this.send(forbidden(msg));
  });

  fastify.decorateReply("sendNotFound", function (this: FastifyReply, msg?: string) {
    return this.send(notFound(msg));
  });

  fastify.decorateReply("sendServerError", function (this: FastifyReply, msg?: string) {
    return this.send(serverError(msg));
  });
};

export default fp(responsePlugin, { name: "response" });
