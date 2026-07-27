/**
 * 消息模块 — 管理员端路由定义
 *
 * 挂载路径：/admin 前缀（在 routes/index.ts 中注册），完整路径为 /api/admin/messages/*
 * 所有接口均需认证 + 超级管理员权限
 */

import type { FastifyPluginAsync } from "fastify";
import { authenticate, requireSuperAdmin } from "../user/auth/auth.middleware.js";
import { MessageService } from "./message.service.js";
import { broadcastSchema, broadcastSentQuerySchema } from "./message.schemas.js";
import { parseAndRespond, parseQueryAndRespond } from "../../utils/zod.js";

const adminMessageRoutes: FastifyPluginAsync = async fastify => {
  const messageService = new MessageService(fastify);

  fastify.addHook("preHandler", authenticate);
  fastify.addHook("preHandler", requireSuperAdmin);

  // ════════════════════════════════════════════════════════════
  // POST /messages/broadcast — 管理员广播
  // ════════════════════════════════════════════════════════════
  fastify.post("/messages/broadcast", async (request, reply) => {
    const body = parseAndRespond(broadcastSchema.safeParse(request.body), reply);
    if (!body) return;

    try {
      const result = await messageService.broadcast(request.user!.userId, body);
      return reply.status(201).send({ code: 0, msg: "广播已发送", data: result });
    } catch (err) {
      fastify.log.error({ err }, "[admin-message] POST /messages/broadcast — 发送失败");
      throw err;
    }
  });

  // ════════════════════════════════════════════════════════════
  // GET /messages/sent — 管理员查看已发送广播
  // ════════════════════════════════════════════════════════════
  fastify.get("/messages/sent", async (request, reply) => {
    const query = parseQueryAndRespond(broadcastSentQuerySchema.safeParse(request.query), reply);
    if (!query) return;

    try {
      const result = await messageService.listSent(request.user!.userId, query);
      return reply.sendSuccess(result);
    } catch (err) {
      fastify.log.error({ err }, "[admin-message] GET /messages/sent — 查询失败");
      throw err;
    }
  });
};

export default adminMessageRoutes;
