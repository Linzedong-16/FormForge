/**
 * 消息模块 API（问卷编辑器）
 *
 * 与 frontend（管理后台）侧字段结构一致的用户端消息接口，共用 packages/common 的类型定义。
 * 编辑器侧不需要管理员广播相关接口（那是 frontend 管理后台专属能力）。
 */
import type { ApiResponse } from "@common/user/user.interface";
import type {
  MessageListQuery,
  MessageListResponse,
  MessageUnreadCountResponse,
  MessageMarkReadResponse,
  MessageMarkAllReadRequest,
  MessageMarkAllReadResponse,
  MessageDeleteResponse,
  SendMessageRequest,
  SendMessageResponse
} from "@common/message/message.interface";
import serverClient from "../../clients/server";

/** GET /messages — 收件箱列表 */
export const getMessages = (params?: MessageListQuery): Promise<ApiResponse<MessageListResponse>> =>
  serverClient.get("/messages", { params });

/** GET /messages/unread-count — 未读消息计数 */
export const getUnreadCount = (): Promise<ApiResponse<MessageUnreadCountResponse>> =>
  serverClient.get("/messages/unread-count");

/** PUT /messages/:id/read — 标记单条已读 */
export const markMessageRead = (id: string): Promise<ApiResponse<MessageMarkReadResponse>> =>
  serverClient.put(`/messages/${id}/read`);

/** PUT /messages/read-all — 全部标记已读（可选按类型筛选） */
export const markAllMessagesRead = (
  data?: MessageMarkAllReadRequest
): Promise<ApiResponse<MessageMarkAllReadResponse>> => serverClient.put("/messages/read-all", data ?? {});

/** DELETE /messages/:id — 软删除单条消息 */
export const deleteMessage = (id: string): Promise<ApiResponse<MessageDeleteResponse>> =>
  serverClient.delete(`/messages/${id}`);

/** POST /messages/send — 发送消息（用户 → 管理员） */
export const sendMessage = (data: SendMessageRequest): Promise<ApiResponse<SendMessageResponse>> =>
  serverClient.post("/messages/send", data);
