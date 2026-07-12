// ═══════════════════════════════════════════════════════════════════
// 消息互动系统 — 前后端共享类型声明
// ═══════════════════════════════════════════════════════════════════

// ─── 消息类型枚举 ───────────────────────────────────────────────

/** 消息类型：操作通知/模板互动/问卷生命周期/用户-管理员通信/管理员广播 */
export const MESSAGE_TYPES = [
  "operation_notify",
  "template_like",
  "survey_lifecycle",
  "user_admin_comm",
  "admin_broadcast"
] as const;
export type MessageType = (typeof MESSAGE_TYPES)[number];

/** 广播消息的目标角色范围 */
export const MESSAGE_TARGET_ROLES = ["all", "user", "super_admin"] as const;
export type MessageTargetRole = (typeof MESSAGE_TARGET_ROLES)[number];

/** 消息关联资源类型 */
export const MESSAGE_RELATED_RESOURCES = ["survey", "template", "review"] as const;
export type MessageRelatedResource = (typeof MESSAGE_RELATED_RESOURCES)[number];

// ─── 消息列表 ───────────────────────────────────────────────────

/** 消息发送者展示信息（系统通知/广播时 id 为 null，name 固定为对应文案） */
export interface MessageSenderInfo {
  id: string | null;
  name: string;
}

/** 收件箱单条消息 */
export interface MessageListItem {
  id: string;
  type: MessageType;
  title: string;
  content: string;
  sender: MessageSenderInfo;
  is_read: boolean;
  related_resource: MessageRelatedResource | null;
  related_resource_id: string | null;
  created_at: string;
  read_at: string | null;
}

/** GET /messages 查询参数 */
export interface MessageListQuery {
  page?: number;
  page_size?: number;
  /** 逗号分隔的多类型筛选，如 "operation_notify,template_like" */
  type?: string;
  is_read?: boolean;
}

/** GET /messages 响应 */
export interface MessageListResponse {
  items: MessageListItem[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

// ─── 未读计数 ───────────────────────────────────────────────────

/** GET /messages/unread-count 响应 */
export interface MessageUnreadCountResponse {
  unread_total: number;
  by_type: Record<MessageType, number>;
}

// ─── 标记已读 ───────────────────────────────────────────────────

/** PUT /messages/:id/read 响应 */
export interface MessageMarkReadResponse {
  id: string;
  is_read: true;
  read_at: string;
}

/** PUT /messages/read-all 请求体 */
export interface MessageMarkAllReadRequest {
  type?: MessageType;
}

/** PUT /messages/read-all 响应 */
export interface MessageMarkAllReadResponse {
  marked_count: number;
}

// ─── 软删除 ─────────────────────────────────────────────────────

/** DELETE /messages/:id 响应 */
export interface MessageDeleteResponse {
  id: string;
  deleted: true;
}

// ─── 用户 → 管理员发送 ──────────────────────────────────────────

/** POST /messages/send 请求体 */
export interface SendMessageRequest {
  content: string;
  related_resource?: MessageRelatedResource;
  related_resource_id?: number;
  /** 管理员回复用户咨询时携带，指向原始咨询消息 id */
  reply_to_message_id?: number;
}

/** POST /messages/send 响应 */
export interface SendMessageResponse {
  id: string;
  created_at: string;
}

// ─── 管理员广播 ─────────────────────────────────────────────────

/** POST /admin/messages/broadcast 请求体 */
export interface BroadcastMessageRequest {
  title: string;
  content: string;
  target_role?: MessageTargetRole;
}

/** POST /admin/messages/broadcast 响应 */
export interface BroadcastMessageResponse {
  id: string;
  estimated_recipients: number;
}

/** 管理员已发送广播列表单条 */
export interface BroadcastSentItem {
  id: string;
  title: string;
  content: string;
  target_role: MessageTargetRole;
  estimated_recipients: number;
  created_at: string;
}

/** GET /admin/messages/sent 查询参数 */
export interface BroadcastSentQuery {
  page?: number;
  page_size?: number;
}

/** GET /admin/messages/sent 响应 */
export interface BroadcastSentListResponse {
  items: BroadcastSentItem[];
  total: number;
  page: number;
  page_size: number;
}
