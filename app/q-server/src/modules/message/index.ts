/**
 * 消息模块 — 统一导出入口
 *
 * 模块组织：
 *   message.routes.ts          用户端路由（收件箱、未读计数、已读、删除、发送咨询）
 *   admin-message.routes.ts    管理员端路由（广播、已发送列表）
 *   message.schemas.ts         Zod 请求/响应校验 Schema
 *   message.service.ts         业务逻辑层
 *   message-hooks.service.ts   供其他模块调用的系统通知触发入口
 *   message-scheduler.ts       每日定时任务（消息清理 + 问卷即将过期提醒扫描）
 */
export { MessageService } from "./message.service.js";
export type { CreateMessageInput } from "./message.service.js";
export { MessageHookService } from "./message-hooks.service.js";
export { startMessageScheduler } from "./message-scheduler.js";
export { default as messageRoutes } from "./message.routes.js";
export { default as adminMessageRoutes } from "./admin-message.routes.js";
export {
  messageIdSchema,
  messageContentSchema,
  messageListQuerySchema,
  markAllReadSchema,
  sendMessageSchema,
  broadcastSchema,
  broadcastSentQuerySchema
} from "./message.schemas.js";
export type {
  MessageListQueryInput,
  MarkAllReadInput,
  SendMessageInput,
  BroadcastInput,
  BroadcastSentQueryInput
} from "./message.schemas.js";
