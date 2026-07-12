/**
 * 消息模块 — 业务逻辑层
 *
 * 职责：
 *   - 收件箱查询（分页 + 类型/已读筛选，非广播消息 + 广播消息合并展示）
 *   - 未读计数（Cache-Aside，缓存的是派生计算结果，不是状态本身）
 *   - 标记已读 / 全部标记已读 / 软删除
 *   - 内部创建方法（供 MessageHookService、sendMessage、broadcast 复用）
 *
 * 广播消息的已读/隐藏状态：
 *   广播消息（recipient_id = NULL）只有一条物理记录，不能直接在共享记录上记录
 *   "用户 A 已读"。本 Service 通过 MessageBroadcastState 表按"用户 × 广播消息"维度
 *   惰性记录每个用户的已读/隐藏状态——只有用户真正读/删过某条广播才会写一行
 *   （见 data-model.md §3、research.md §13，修复了此前"状态只存在 Redis"的设计缺陷）。
 */

import type { FastifyInstance } from "fastify";
import { createCache, CacheKeys, CacheTTL } from "../../utils/cache.js";
import type { CacheClient } from "../../utils/cache.js";
import { AppError } from "../../utils/errors.js";
import { BizCode } from "../../utils/response.js";
import { checkRateLimit } from "../../utils/rate-limiter.js";
import { createAuditLog } from "../../utils/audit-log.js";
import { sanitizeMessageContent } from "./message-content-sanitizer.js";
import {
  MESSAGE_TYPES,
  type MessageType,
  type MessageListItem,
  type MessageListResponse,
  type MessageUnreadCountResponse,
  type MessageMarkReadResponse,
  type MessageMarkAllReadResponse,
  type MessageDeleteResponse,
  type SendMessageResponse,
  type BroadcastMessageResponse,
  type BroadcastSentItem,
  type BroadcastSentListResponse
} from "@common/message/message.interface.js";
import type {
  MessageListQueryInput,
  SendMessageInput,
  BroadcastInput,
  BroadcastSentQueryInput
} from "./message.schemas.js";

// ─── 内部类型 ──────────────────────────────────────────────────

/** 内部创建消息的输入（供 MessageHookService/sendMessage/broadcast 复用） */
export interface CreateMessageInput {
  type: MessageType;
  title: string;
  content: string;
  sender_id?: bigint | null;
  /** 广播消息（recipient_id 为 null）必须提供 target_role */
  recipient_id?: bigint | null;
  target_role?: string | null;
  related_resource?: string | null;
  related_resource_id?: bigint | null;
}

/** Prisma message 行的最小字段集合（含关联的 sender 信息） */
interface MessageRow {
  id: bigint;
  type: string;
  title: string;
  content: string;
  sender_id: bigint | null;
  recipient_id: bigint | null;
  target_role: string | null;
  related_resource: string | null;
  related_resource_id: bigint | null;
  is_read: boolean;
  read_at: Date | null;
  created_at: Date;
  sender: { username: string; role: string } | null;
}

// ─── 工具函数 ──────────────────────────────────────────────────

function bigIntToStr(value: bigint): string {
  return String(value);
}

/** 根据消息类型与发送者角色，决定收件箱中展示的发送者名称（不暴露具体管理员身份） */
function resolveSenderName(row: MessageRow): string {
  if (row.sender_id === null) return "系统通知";
  if (row.type === "admin_broadcast") return "平台管理员";
  if (row.type === "user_admin_comm" && row.sender?.role === "super_admin") return "管理员";
  return row.sender?.username ?? "未知用户";
}

// ─── Service 类 ────────────────────────────────────────────────

export class MessageService {
  private readonly cache: CacheClient;

  constructor(private readonly fastify: FastifyInstance) {
    this.cache = createCache(fastify);
  }

  // ============================================================
  //  内部创建方法
  // ============================================================

  /**
   * 创建一条消息（内部方法，不对外暴露 HTTP 路由）。
   *
   * 白名单校验 `type`（FR-010 的第二道防线——第一道是 sendMessageSchema/broadcastSchema
   * 本身不声明 type 字段）；写入成功后对已知的单一接收者失效未读计数缓存。广播消息
   * （recipient_id 为 null）不在此处逐用户失效缓存——那需要遍历全部目标用户，重新
   * 引入本功能一开始就要规避的写入放大问题；缓存 TTL（60s）足以在 SC-005 承诺的
   * "1 分钟内可见"窗口内自然过期，不需要主动失效。
   */
  async create(input: CreateMessageInput): Promise<{ id: bigint; created_at: Date }> {
    if (!MESSAGE_TYPES.includes(input.type)) {
      throw new AppError("非法的消息类型", 500, BizCode.SYSTEM_MESSAGE_TYPE_FORBIDDEN);
    }

    const message = await this.fastify.prisma.message.create({
      data: {
        type: input.type,
        title: input.title,
        content: input.content,
        sender_id: input.sender_id ?? null,
        recipient_id: input.recipient_id ?? null,
        target_role: input.target_role ?? null,
        related_resource: input.related_resource ?? null,
        related_resource_id: input.related_resource_id ?? null
      }
    });

    if (input.recipient_id) {
      await this.cache.del(CacheKeys.messageUnreadCount(bigIntToStr(input.recipient_id)));
    }

    return { id: message.id, created_at: message.created_at };
  }

  // ============================================================
  //  发送消息（用户 → 管理员 / 管理员回复）
  // ============================================================

  /**
   * 发送一条 user_admin_comm 类型的消息。
   *
   * - 普通场景：调用者向全体 super_admin 账号各发一条咨询消息（管理员数量通常个位数，
   *   不采用广播的单记录设计）。
   * - 回复场景：调用者携带 `reply_to_message_id` 且自身角色为 super_admin 时，
   *   仅回复给原咨询消息的发送者（recipient_id 设为原消息 sender_id）。
   *
   * 接口设计上不接受客户端指定 `recipient_id`（FR-007 的结构性防线）：调用者永远只能
   * "发给全体管理员"或"回复原发送者"，从根源杜绝普通用户之间互相私信的可能性。
   */
  async sendMessage(senderId: bigint, senderRole: string, input: SendMessageInput): Promise<SendMessageResponse> {
    const allowed = await checkRateLimit(this.fastify, senderId, { prefix: "rate:msg_send:", max: 10, ttl: 60 });
    if (!allowed) {
      throw new AppError("发送过于频繁，请稍后再试", 429);
    }

    const sanitizedContent = sanitizeMessageContent(input.content);

    let recipientIds: bigint[];
    if (input.reply_to_message_id !== undefined) {
      if (senderRole !== "super_admin") {
        throw new AppError("无权回复", 403);
      }
      const original = await this.fastify.prisma.message.findFirst({
        where: { id: BigInt(input.reply_to_message_id), type: "user_admin_comm" }
      });
      if (!original || !original.sender_id) {
        throw new AppError("原消息不存在", 404, BizCode.MESSAGE_NOT_FOUND);
      }
      recipientIds = [original.sender_id];
    } else {
      const admins = await this.fastify.prisma.user.findMany({
        where: { role: "super_admin", deleted_at: null },
        select: { id: true }
      });
      recipientIds = admins.map(a => a.id);
    }

    const created = await Promise.all(
      recipientIds.map(recipientId =>
        this.create({
          type: "user_admin_comm",
          title: "用户咨询",
          content: sanitizedContent,
          sender_id: senderId,
          recipient_id: recipientId,
          related_resource: input.related_resource ?? null,
          related_resource_id: input.related_resource_id ? BigInt(input.related_resource_id) : null
        })
      )
    );

    createAuditLog(this.fastify, senderId, "send_message", "message", created[0]?.id ?? null, {
      recipient_count: recipientIds.length,
      reply_to_message_id: input.reply_to_message_id ?? null
    }).catch(() => {});

    return {
      id: bigIntToStr(created[0].id),
      created_at: created[0].created_at.toISOString()
    };
  }

  // ============================================================
  //  管理员广播
  // ============================================================

  /**
   * 发布一条广播消息（写入单条 recipient_id=NULL 记录，不逐用户写入）。
   *
   * 已读/隐藏状态由 MessageBroadcastState 表惰性记录（见 §3），本方法不做任何
   * 逐用户初始化写入——绝大多数用户永远不会为这条广播产生一行状态记录。
   */
  async broadcast(adminId: bigint, input: BroadcastInput): Promise<BroadcastMessageResponse> {
    const allowed = await checkRateLimit(this.fastify, adminId, {
      prefix: "rate:msg_broadcast:",
      max: 3,
      ttl: 86400
    });
    if (!allowed) {
      throw new AppError("广播过于频繁，请稍后再试", 429, BizCode.BROADCAST_RATE_LIMITED);
    }

    const sanitizedContent = sanitizeMessageContent(input.content);
    const estimatedRecipients = await this.estimateRecipients(input.target_role);

    const message = await this.fastify.prisma.message.create({
      data: {
        type: "admin_broadcast",
        title: input.title,
        content: sanitizedContent,
        sender_id: adminId,
        recipient_id: null,
        target_role: input.target_role
      }
    });

    createAuditLog(this.fastify, adminId, "broadcast_message", "message", message.id, {
      target_role: input.target_role,
      estimated_recipients: estimatedRecipients
    }).catch(() => {});

    return { id: bigIntToStr(message.id), estimated_recipients: estimatedRecipients };
  }

  /** 管理员查看自己已发送的广播列表（不包含其他管理员发出的广播） */
  async listSent(adminId: bigint, query: BroadcastSentQueryInput): Promise<BroadcastSentListResponse> {
    const where = { sender_id: adminId, type: "admin_broadcast" as const };

    const [rows, total] = await Promise.all([
      this.fastify.prisma.message.findMany({
        where,
        orderBy: { created_at: "desc" },
        skip: (query.page - 1) * query.page_size,
        take: query.page_size
      }),
      this.fastify.prisma.message.count({ where })
    ]);

    const items: BroadcastSentItem[] = await Promise.all(
      rows.map(async row => ({
        id: bigIntToStr(row.id),
        title: row.title,
        content: row.content,
        target_role: (row.target_role ?? "all") as BroadcastSentItem["target_role"],
        // 展示用估算值，按当前用户表重新计算（非发出时的精确快照，仅供参考，见 contracts.md）
        estimated_recipients: await this.estimateRecipients(row.target_role ?? "all"),
        created_at: row.created_at.toISOString()
      }))
    );

    return { items, total, page: query.page, page_size: query.page_size };
  }

  /** 按目标角色估算广播覆盖的用户数（仅供前端展示参考，不是精确送达确认） */
  private async estimateRecipients(targetRole: string): Promise<number> {
    return this.fastify.prisma.user.count({
      where: {
        deleted_at: null,
        ...(targetRole === "all" ? {} : { role: targetRole })
      }
    });
  }

  // ============================================================
  //  收件箱查询
  // ============================================================

  async list(userId: bigint, userRole: string, query: MessageListQueryInput): Promise<MessageListResponse> {
    const typeFilter = query.type;
    const wantBroadcast = !typeFilter || typeFilter.includes("admin_broadcast");
    const wantNonBroadcast = !typeFilter || typeFilter.some(t => t !== "admin_broadcast");

    // 候选窗口：足够覆盖当前请求页所需的行数，两个来源各取一份，
    // 合并排序后再精确切出目标页——广播消息量天然很小（管理员广播频率受限 + 定期清理），
    // 这里的"过量拉取"成本可忽略，避免为一次分页查询引入复杂的原生 SQL UNION。
    const windowSize = query.page * query.page_size;

    const [nonBroadcastRows, broadcastRows] = await Promise.all([
      wantNonBroadcast ? this.fetchNonBroadcastCandidates(userId, typeFilter, query.is_read, windowSize) : [],
      wantBroadcast ? this.fetchBroadcastCandidates(userId, userRole, query.is_read, windowSize) : []
    ]);

    const merged = [...nonBroadcastRows, ...broadcastRows].sort(
      (a, b) => b.created_at.getTime() - a.created_at.getTime()
    );

    const [nonBroadcastTotal, broadcastTotal] = await Promise.all([
      wantNonBroadcast ? this.countNonBroadcast(userId, typeFilter, query.is_read) : 0,
      wantBroadcast ? this.countBroadcast(userId, userRole, query.is_read) : 0
    ]);
    const total = nonBroadcastTotal + broadcastTotal;

    const start = (query.page - 1) * query.page_size;
    const pageRows = merged.slice(start, start + query.page_size);

    return {
      items: pageRows.map(row => this.toListItem(row)),
      total,
      page: query.page,
      page_size: query.page_size,
      total_pages: total === 0 ? 0 : Math.ceil(total / query.page_size)
    };
  }

  private toListItem(row: MessageRow): MessageListItem {
    return {
      id: bigIntToStr(row.id),
      type: row.type as MessageType,
      title: row.title,
      content: row.content,
      sender: { id: row.sender_id ? bigIntToStr(row.sender_id) : null, name: resolveSenderName(row) },
      is_read: row.is_read,
      related_resource: row.related_resource as MessageListItem["related_resource"],
      related_resource_id: row.related_resource_id ? bigIntToStr(row.related_resource_id) : null,
      created_at: row.created_at.toISOString(),
      read_at: row.read_at ? row.read_at.toISOString() : null
    };
  }

  private async fetchNonBroadcastCandidates(
    userId: bigint,
    typeFilter: MessageType[] | undefined,
    isReadFilter: boolean | undefined,
    take: number
  ): Promise<MessageRow[]> {
    const types = typeFilter?.filter(t => t !== "admin_broadcast");
    const rows = await this.fastify.prisma.message.findMany({
      where: {
        recipient_id: userId,
        deleted_at: null,
        ...(types && types.length > 0 ? { type: { in: types } } : {}),
        ...(isReadFilter !== undefined ? { is_read: isReadFilter } : {})
      },
      include: { sender: { select: { username: true, role: true } } },
      orderBy: { created_at: "desc" },
      take
    });
    return rows as unknown as MessageRow[];
  }

  private async countNonBroadcast(
    userId: bigint,
    typeFilter: MessageType[] | undefined,
    isReadFilter: boolean | undefined
  ): Promise<number> {
    const types = typeFilter?.filter(t => t !== "admin_broadcast");
    return this.fastify.prisma.message.count({
      where: {
        recipient_id: userId,
        deleted_at: null,
        ...(types && types.length > 0 ? { type: { in: types } } : {}),
        ...(isReadFilter !== undefined ? { is_read: isReadFilter } : {})
      }
    });
  }

  /** 拉取当前用户可见、未隐藏的广播消息，并按 MessageBroadcastState 派生出对该用户的 is_read */
  private async fetchBroadcastCandidates(
    userId: bigint,
    userRole: string,
    isReadFilter: boolean | undefined,
    take?: number
  ): Promise<MessageRow[]> {
    const rows = await this.fastify.prisma.message.findMany({
      where: {
        recipient_id: null,
        type: "admin_broadcast",
        OR: [{ target_role: "all" }, { target_role: userRole }],
        broadcastStates: { none: { user_id: userId, is_hidden: true } }
      },
      include: {
        sender: { select: { username: true, role: true } },
        broadcastStates: { where: { user_id: userId } }
      },
      orderBy: { created_at: "desc" },
      ...(take !== undefined ? { take } : {})
    });

    const withDerivedRead = rows.map(row => {
      const state = row.broadcastStates[0];
      return { ...row, is_read: state?.is_read ?? false, read_at: state?.read_at ?? null } as unknown as MessageRow;
    });

    if (isReadFilter === undefined) return withDerivedRead;
    return withDerivedRead.filter(row => row.is_read === isReadFilter);
  }

  private async countBroadcast(userId: bigint, userRole: string, isReadFilter: boolean | undefined): Promise<number> {
    // 广播消息体量天然很小（发送受频率限制、定期清理），直接拉取全量并在内存中计数，
    // 不为这一小体量场景单独设计聚合 SQL。
    const rows = await this.fetchBroadcastCandidates(userId, userRole, isReadFilter);
    return rows.length;
  }

  // ============================================================
  //  未读计数
  // ============================================================

  async getUnreadCount(userId: bigint, userRole: string): Promise<MessageUnreadCountResponse> {
    return this.cache.getOrSet(
      CacheKeys.messageUnreadCount(bigIntToStr(userId)),
      () => this.computeUnreadCount(userId, userRole),
      CacheTTL.MESSAGE_UNREAD_COUNT
    );
  }

  private async computeUnreadCount(userId: bigint, userRole: string): Promise<MessageUnreadCountResponse> {
    const by_type = Object.fromEntries(MESSAGE_TYPES.map(t => [t, 0])) as Record<MessageType, number>;

    const nonBroadcastGroups = await this.fastify.prisma.message.groupBy({
      by: ["type"],
      where: { recipient_id: userId, is_read: false, deleted_at: null },
      _count: { _all: true }
    });
    let total = 0;
    for (const group of nonBroadcastGroups) {
      const count = group._count._all;
      by_type[group.type as MessageType] = count;
      total += count;
    }

    const unreadBroadcasts = await this.fetchBroadcastCandidates(userId, userRole, false);
    by_type.admin_broadcast += unreadBroadcasts.length;
    total += unreadBroadcasts.length;

    return { unread_total: total, by_type };
  }

  // ============================================================
  //  标记已读 / 全部标记已读
  // ============================================================

  async markRead(userId: bigint, userRole: string, messageId: bigint): Promise<MessageMarkReadResponse> {
    const message = await this.fastify.prisma.message.findFirst({ where: { id: messageId, deleted_at: null } });
    if (!message) throw new AppError("消息不存在", 404, BizCode.MESSAGE_NOT_FOUND);

    const now = new Date();

    if (message.recipient_id === null) {
      // 广播消息：校验当前用户确实在目标范围内，再 upsert 自己的状态行
      this.assertBroadcastVisible(message.target_role, userRole);
      await this.fastify.prisma.messageBroadcastState.upsert({
        where: { message_id_user_id: { message_id: messageId, user_id: userId } },
        create: { message_id: messageId, user_id: userId, is_read: true, read_at: now },
        update: { is_read: true, read_at: now }
      });
    } else {
      if (message.recipient_id !== userId) {
        throw new AppError("无权操作", 403);
      }
      if (!message.is_read) {
        await this.fastify.prisma.message.update({
          where: { id: messageId },
          data: { is_read: true, read_at: now }
        });
      }
    }

    await this.cache.del(CacheKeys.messageUnreadCount(bigIntToStr(userId)));

    return { id: bigIntToStr(messageId), is_read: true, read_at: now.toISOString() };
  }

  async markAllRead(userId: bigint, userRole: string, type?: MessageType): Promise<MessageMarkAllReadResponse> {
    const now = new Date();
    const includesNonBroadcast = !type || type !== "admin_broadcast";
    const includesBroadcast = !type || type === "admin_broadcast";

    const nonBroadcastResult = includesNonBroadcast
      ? await this.fastify.prisma.message.updateMany({
          where: {
            recipient_id: userId,
            deleted_at: null,
            is_read: false,
            ...(type ? { type } : {})
          },
          data: { is_read: true, read_at: now }
        })
      : { count: 0 };

    let broadcastMarked = 0;
    if (includesBroadcast) {
      const unreadBroadcasts = await this.fetchBroadcastCandidates(userId, userRole, false);
      if (unreadBroadcasts.length > 0) {
        await this.fastify.prisma.$transaction(
          unreadBroadcasts.map(row =>
            this.fastify.prisma.messageBroadcastState.upsert({
              where: { message_id_user_id: { message_id: row.id, user_id: userId } },
              create: { message_id: row.id, user_id: userId, is_read: true, read_at: now },
              update: { is_read: true, read_at: now }
            })
          )
        );
        broadcastMarked = unreadBroadcasts.length;
      }
    }

    await this.cache.del(CacheKeys.messageUnreadCount(bigIntToStr(userId)));

    return { marked_count: nonBroadcastResult.count + broadcastMarked };
  }

  // ============================================================
  //  软删除
  // ============================================================

  async softDelete(userId: bigint, userRole: string, messageId: bigint): Promise<MessageDeleteResponse> {
    const message = await this.fastify.prisma.message.findFirst({ where: { id: messageId, deleted_at: null } });
    if (!message) throw new AppError("消息不存在", 404, BizCode.MESSAGE_NOT_FOUND);

    const now = new Date();

    if (message.recipient_id === null) {
      this.assertBroadcastVisible(message.target_role, userRole);
      await this.fastify.prisma.messageBroadcastState.upsert({
        where: { message_id_user_id: { message_id: messageId, user_id: userId } },
        create: { message_id: messageId, user_id: userId, is_hidden: true, hidden_at: now },
        update: { is_hidden: true, hidden_at: now }
      });
    } else {
      if (message.recipient_id !== userId) {
        throw new AppError("无权操作", 403);
      }
      await this.fastify.prisma.message.update({ where: { id: messageId }, data: { deleted_at: now } });
    }

    await this.cache.del(CacheKeys.messageUnreadCount(bigIntToStr(userId)));

    return { id: bigIntToStr(messageId), deleted: true };
  }

  private assertBroadcastVisible(targetRole: string | null, userRole: string): void {
    if (targetRole !== "all" && targetRole !== userRole) {
      throw new AppError("无权操作", 403);
    }
  }
}
