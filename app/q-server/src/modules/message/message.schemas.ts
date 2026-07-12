/**
 * 消息模块 — Zod Schema 定义
 *
 * 所有请求体 / 查询参数统一通过 Zod 校验，输出类型可供 Service 层直接复用。
 *
 * 安全设计（FR-010 第一道防线）：`sendMessageSchema`/`broadcastSchema` 均不声明
 * `type` 字段——即使客户端在请求体中夹带 `type`，也会被 Zod 忽略，最终写入的消息
 * 类型始终由 `MessageService` 内部硬编码决定，不可能通过公开接口伪造系统通知类型。
 */

import { z } from "zod";
import { MESSAGE_TYPES, MESSAGE_RELATED_RESOURCES, MESSAGE_TARGET_ROLES } from "@common/message/message.interface.js";

// ─── 消息 ID 校验 ───────────────────────────────────────────────

/** 消息 ID — 仅允许纯数字字符串，自动转为 BigInt */
export const messageIdSchema = z
  .string()
  .regex(/^\d+$/, "消息 ID 必须为数字")
  .transform(val => BigInt(val));

// ─── 消息内容安全校验 ───────────────────────────────────────────

/** 消息正文：1-2000 字符（脚本标签剔除/敏感信息脱敏在 service 层处理，见 research.md §5） */
export const messageContentSchema = z.string().min(1, "消息内容不能为空").max(2000, "消息内容最多 2000 个字符");

// ─── 消息列表查询 ───────────────────────────────────────────────

/** GET /messages — 消息列表查询参数 */
export const messageListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(50).default(20),
  /** 逗号分隔的多类型筛选，如 "operation_notify,template_like" */
  type: z
    .string()
    .optional()
    .refine(
      val => {
        if (!val) return true;
        return val.split(",").every(t => MESSAGE_TYPES.includes(t.trim() as (typeof MESSAGE_TYPES)[number]));
      },
      { message: "包含不支持的消息类型" }
    )
    .transform(val => {
      if (!val) return undefined;
      return val.split(",").map(t => t.trim()) as (typeof MESSAGE_TYPES)[number][];
    }),
  // 布尔查询参数以字符串形式传入，显式枚举转换，避免 z.coerce.boolean() 把
  // 非空字符串 "false" 也转成 true 的常见陷阱
  is_read: z
    .enum(["true", "false"])
    .optional()
    .transform(val => (val === undefined ? undefined : val === "true"))
});

// ─── 全部标记已读 ───────────────────────────────────────────────

/** PUT /messages/read-all — 请求体（可选，仅标记指定类型） */
export const markAllReadSchema = z.object({
  type: z.enum(MESSAGE_TYPES).optional()
});

// ─── 类型导出（供 Service 层复用） ─────────────────────────────

export type MessageListQueryInput = z.infer<typeof messageListQuerySchema>;
export type MarkAllReadInput = z.infer<typeof markAllReadSchema>;

// 供后续 sendMessageSchema/broadcastSchema 复用的公共字段片段
export const relatedResourceSchema = z.enum(MESSAGE_RELATED_RESOURCES).optional();
export const targetRoleSchema = z.enum(MESSAGE_TARGET_ROLES).optional().default("all");

// ─── 发送消息（用户 → 管理员 / 管理员回复） ─────────────────────

/**
 * POST /messages/send — 请求体
 *
 * 刻意不声明 `type` 字段：多余字段会被 Zod 忽略，最终写入的消息类型始终由
 * `MessageService.sendMessage()` 内部硬编码决定（FR-010 第一道防线）。
 */
export const sendMessageSchema = z.object({
  content: messageContentSchema,
  related_resource: relatedResourceSchema,
  related_resource_id: z.coerce.number().int().positive().optional(),
  /** 管理员回复用户咨询时携带，指向原始咨询消息 id */
  reply_to_message_id: z.coerce.number().int().positive().optional()
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;

// ─── 管理员广播 ─────────────────────────────────────────────────

/**
 * POST /admin/messages/broadcast — 请求体
 *
 * 同样刻意不声明 `type` 字段，见 sendMessageSchema 的说明。
 */
export const broadcastSchema = z.object({
  title: z.string().min(1, "标题不能为空").max(200, "标题最多 200 个字符"),
  content: messageContentSchema,
  target_role: targetRoleSchema
});

export type BroadcastInput = z.infer<typeof broadcastSchema>;

/** GET /admin/messages/sent — 查询参数 */
export const broadcastSentQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(50).default(20)
});

export type BroadcastSentQueryInput = z.infer<typeof broadcastSentQuerySchema>;
