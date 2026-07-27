/**
 * 消息模块 — 用户端路由定义
 *
 * 挂载路径：无前缀（在 routes/index.ts 中直接注册），完整路径为 /api/messages*
 * 所有接口均需认证（authenticate）
 */

import type { FastifyPluginAsync, FastifyReply } from "fastify";
import { authenticate } from "../user/auth/auth.middleware.js";
import { MessageService } from "./message.service.js";
import { messageIdSchema, messageListQuerySchema, markAllReadSchema, sendMessageSchema } from "./message.schemas.js";
import { parseAndRespond, parseQueryAndRespond } from "../../utils/zod.js";

/** 解析并校验消息 ID，非法格式返回 400 */
function parseMessageId(id: string, reply: FastifyReply): bigint | null {
  const result = messageIdSchema.safeParse(id);
  if (!result.success) {
    reply.status(400).send({ data: null, code: 400, msg: "消息 ID 格式错误" });
    return null;
  }
  return result.data;
}

const messageRoutes: FastifyPluginAsync = async fastify => {
  const messageService = new MessageService(fastify);

  fastify.addHook("preHandler", authenticate);

  // ════════════════════════════════════════════════════════════
  // GET /messages — 收件箱列表（分页 + 类型/已读筛选）
  // ════════════════════════════════════════════════════════════
  fastify.get("/messages", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (request, reply) => {
    const query = parseQueryAndRespond(messageListQuerySchema.safeParse(request.query), reply);
    if (!query) return;

    try {
      const result = await messageService.list(request.user!.userId, request.user!.role, query);
      return reply.sendSuccess(result);
    } catch (err) {
      fastify.log.error({ err }, "[message] GET /messages — 查询失败");
      throw err;
    }
  });

  // ════════════════════════════════════════════════════════════
  // GET /messages/unread-count — 未读消息计数
  // ════════════════════════════════════════════════════════════
  fastify.get(
    "/messages/unread-count",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (request, reply) => {
      try {
        const result = await messageService.getUnreadCount(request.user!.userId, request.user!.role);
        return reply.sendSuccess(result);
      } catch (err) {
        fastify.log.error({ err }, "[message] GET /messages/unread-count — 查询失败");
        throw err;
      }
    }
  );

  // ════════════════════════════════════════════════════════════
  // PUT /messages/:id/read — 标记单条已读
  // ════════════════════════════════════════════════════════════
  fastify.put("/messages/:id/read", async (request, reply) => {
    const { id } = request.params as { id: string };
    const messageId = parseMessageId(id, reply);
    if (messageId === null) return;

    try {
      const result = await messageService.markRead(request.user!.userId, request.user!.role, messageId);
      return reply.sendSuccess(result);
    } catch (err) {
      fastify.log.error({ err, messageId: id }, "[message] PUT /messages/:id/read — 标记失败");
      throw err;
    }
  });

  // ════════════════════════════════════════════════════════════
  // PUT /messages/read-all — 全部标记已读（可按类型筛选）
  // ════════════════════════════════════════════════════════════
  fastify.put("/messages/read-all", async (request, reply) => {
    const body = parseAndRespond(markAllReadSchema.safeParse(request.body ?? {}), reply);
    if (!body) return;

    try {
      const result = await messageService.markAllRead(request.user!.userId, request.user!.role, body.type);
      return reply.sendSuccess(result);
    } catch (err) {
      fastify.log.error({ err }, "[message] PUT /messages/read-all — 标记失败");
      throw err;
    }
  });

  // ════════════════════════════════════════════════════════════
  // DELETE /messages/:id — 软删除单条消息
  // ════════════════════════════════════════════════════════════
  fastify.delete("/messages/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const messageId = parseMessageId(id, reply);
    if (messageId === null) return;

    try {
      const result = await messageService.softDelete(request.user!.userId, request.user!.role, messageId);
      return reply.sendSuccess(result);
    } catch (err) {
      fastify.log.error({ err, messageId: id }, "[message] DELETE /messages/:id — 删除失败");
      throw err;
    }
  });

  // ════════════════════════════════════════════════════════════
  // POST /messages/send — 发送消息（用户 → 管理员 / 管理员回复）
  // ════════════════════════════════════════════════════════════
  fastify.post("/messages/send", async (request, reply) => {
    const body = parseAndRespond(sendMessageSchema.safeParse(request.body), reply);
    if (!body) return;

    try {
      const result = await messageService.sendMessage(request.user!.userId, request.user!.role, body);
      return reply.status(201).send({ code: 0, msg: "消息已发送", data: result });
    } catch (err) {
      fastify.log.error({ err }, "[message] POST /messages/send — 发送失败");
      throw err;
    }
  });
};

export default messageRoutes;
