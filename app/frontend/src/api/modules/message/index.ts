/**
 * 消息模块 API（管理后台）
 *
 * 封装消息互动功能消费的全部用户端接口：
 *  - GET    /messages                — 收件箱列表（分页 + 类型/已读筛选）
 *  - GET    /messages/unread-count   — 未读消息计数
 *  - PUT    /messages/:id/read       — 标记单条已读
 *  - PUT    /messages/read-all       — 全部标记已读
 *  - DELETE /messages/:id            — 软删除单条消息
 *  - POST   /messages/send           — 发送消息（用户 → 管理员 / 管理员回复）
 *
 * 管理员端的广播接口在 src/api/modules/message-admin/index.ts 中单独封装
 * （见用户故事 3），以对齐"用户端/管理员端接口物理分离"的后端路由组织方式。
 *
 * 所有接口需认证，使用 serverClient。响应类型来自 packages/common，与 q-server
 * 的实际响应结构保持一致（对齐 Constitution 原则一"两个以上包共用的类型必须提取到
 * packages/common"）。
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

/** POST /messages/send — 发送消息（用户 → 管理员，或管理员回复） */
export const sendMessage = (data: SendMessageRequest): Promise<ApiResponse<SendMessageResponse>> =>
  serverClient.post("/messages/send", data);
