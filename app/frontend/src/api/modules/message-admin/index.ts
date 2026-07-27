/**
 * 消息模块 API（管理员端 —— 广播）
 *
 * 与 src/api/modules/message/index.ts（用户端接口）物理分离，对齐 q-server 后端
 * 路由组织方式（用户端接口无前缀，管理员端接口挂载于 /admin 前缀）。
 */
import type { ApiResponse } from "@common/user/user.interface";
import type {
  BroadcastMessageRequest,
  BroadcastMessageResponse,
  BroadcastSentQuery,
  BroadcastSentListResponse
} from "@common/message/message.interface";
import serverClient from "../../clients/server";

/** POST /admin/messages/broadcast — 管理员广播 */
export const broadcastMessage = (data: BroadcastMessageRequest): Promise<ApiResponse<BroadcastMessageResponse>> =>
  serverClient.post("/admin/messages/broadcast", data);

/** GET /admin/messages/sent — 管理员查看已发送广播 */
export const getSentBroadcasts = (params?: BroadcastSentQuery): Promise<ApiResponse<BroadcastSentListResponse>> =>
  serverClient.get("/admin/messages/sent", { params });
