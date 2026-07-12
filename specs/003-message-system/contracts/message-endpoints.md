# 契约：新增消息系统接口

本功能在 `q-server` 新增 8 个 HTTP 接口，全部使用项目标准的 `{code, msg, data}` 响应结构
（`reply.sendSuccess`/`sendFail`），全部需要 `authenticate` 前置校验；标注了"仅管理员"的
接口额外叠加 `requireSuperAdmin`。请求/响应类型定义于
`packages/common/src/message/message.interface.ts`（research.md §8）。

## 用户端接口（无前缀，挂载于 `/api` 根路径下）

### `GET /messages` — 消息列表

| 项       | 说明                                                                                                                         |
| -------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 权限     | `authenticate`                                                                                                               |
| 限流     | 60 次/分钟/IP（`@fastify/rate-limit` 路由级配置）                                                                            |
| Query    | `page?: number`（默认 1），`page_size?: number`（默认 20，最大 50），`type?: string`（逗号分隔多类型），`is_read?: boolean`  |
| 200 响应 | `{ items: MessageListItem[], total, page, page_size, total_pages }`                                                          |
| 查询范围 | `recipient_id = $myId OR (recipient_id IS NULL AND (target_role = 'all' OR target_role = $myRole))`，且 `deleted_at IS NULL` |

`MessageListItem` 字段：`id`（字符串化 BigInt）、`type`、`title`、`content`、
`sender: { id: string | null, name: string }`（`sender_id` 为 `null` 时 `name` 固定返回
"系统通知"；广播消息固定返回"平台管理员"）、`is_read`、`related_resource`、
`related_resource_id`、`created_at`、`read_at`。广播消息的 `is_read` 通过 LEFT JOIN
`MessageBroadcastState`（`data-model.md` §3）计算：无对应状态行则视为未读，`is_hidden = true`
的广播直接从查询结果中排除。

**关联资源跳转的兜底说明**（FR-017）：`related_resource`/`related_resource_id` 只是消息创建
时的快照，本接口不会校验该资源当前是否仍存在（避免为一次列表查询引入 N 次跨模块存在性校验）；
前端点击跳转时若目标资源返回 404，必须展示"资源已不存在"提示而非直接报错，见 `quickstart.md`
场景 4。

### `GET /messages/unread-count` — 未读计数

| 项       | 说明                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 权限     | `authenticate`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 限流     | 30 次/分钟/用户                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 200 响应 | `{ unread_total: number, by_type: Record<MessageType, number> }`                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 缓存     | Redis `msg:unread:{userId}`（HASH，字段为 `total` 与各 `MessageType`，一次 `HGETALL` 拿到 `unread_total`+`by_type` 全部数据——缓存的是"未读计数"这一**派生计算结果**，不是状态本身的存储），TTL 60 秒（`CacheTTL.MESSAGE_UNREAD_COUNT`），Cache-Aside；`create`/`markRead`/`markAllRead`/`softDelete`/`sendMessage`/`broadcast` 任一改变某用户可见消息状态的写操作后，必须对受影响用户执行 `cache.del(CacheKeys.messageUnreadCount(userId))`（即使 Redis 被清空，重新计算也能得到正确结果——修复原 C2 问题，见 `data-model.md` §3） |

### `PUT /messages/:id/read` — 标记单条已读

| 项       | 说明                                                                                                                                                                                                                       |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 权限     | `authenticate`；非广播消息校验 `message.recipient_id === request.user.userId`；广播消息改为 upsert 一行仅归属当前用户的 `MessageBroadcastState`（`data-model.md` §3），天然按 `user_id` 隔离，不存在越权可能，无需额外校验 |
| 200 响应 | `{ id: string, is_read: true, read_at: string }`                                                                                                                                                                           |
| 403      | 非本人消息 → `sendFail(403, "无权操作")`                                                                                                                                                                                   |
| 404      | 消息不存在或已被软删除                                                                                                                                                                                                     |
| 幂等     | 已是已读状态时重复调用返回成功，不报错                                                                                                                                                                                     |

### `PUT /messages/read-all` — 全部标记已读

| 项           | 说明                                     |
| ------------ | ---------------------------------------- |
| 权限         | `authenticate`                           |
| Body（可选） | `{ type?: MessageType }` —— 仅标记该类型 |
| 200 响应     | `{ marked_count: number }`               |

### `DELETE /messages/:id` — 软删除单条消息

| 项       | 说明                                                                                                                                                                                                                    |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 权限     | `authenticate`；非广播消息校验 `message.recipient_id === request.user.userId`；广播消息改为 upsert 当前用户自己的 `MessageBroadcastState.is_hidden = true`（不改动共享的 `Message` 记录，见下方"广播软删除的实现说明"） |
| 200 响应 | `{ id: string, deleted: true }`                                                                                                                                                                                         |

**广播软删除的实现说明**：与"已读"同理，广播只有一条共享记录，用户删除自己收件箱里的广播
不能物理/软删除这条共享记录。实现为 upsert 一行 `MessageBroadcastState`
（`message_id` = 该广播、`user_id` = 当前用户、`is_hidden = true`），持久化在 PostgreSQL
（`data-model.md` §3），列表查询时通过 `LEFT JOIN` 排除 `is_hidden = true` 的记录——不再依赖
Redis 集合，Redis 故障或被清空不会导致已隐藏的广播重新出现。

### `POST /messages/send` — 发送消息（用户 → 管理员）

| 项       | 说明                                                                                                                                                                                                                                                                                                                         |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 权限     | `authenticate`                                                                                                                                                                                                                                                                                                               |
| 限流     | `checkRateLimit(fastify, userId, {prefix: "rate:msg_send:", max: 10, ttl: 60})`                                                                                                                                                                                                                                              |
| Body     | `{ content: string(1-2000), related_resource?: "survey"\|"template"\|"review", related_resource_id?: number }`                                                                                                                                                                                                               |
| 行为     | `type` 固定为 `user_admin_comm`；对每一个 `role = "super_admin"` 的用户各写一条 `Message`（管理员数量通常个位数，不采用广播的单记录设计）；写入成功后调用 `createAuditLog(fastify, senderId, "send_message", "message", messageId, { recipient_count, reply_to_message_id? })`（FR-014）并对每个接收者的未读计数缓存执行失效 |
| 201 响应 | `{ id: string, created_at: string }`                                                                                                                                                                                                                                                                                         |
| 429      | 限流触发 → `sendFail(429, "发送过于频繁，请稍后再试")`                                                                                                                                                                                                                                                                       |
| 拒绝场景 | `request.user.role !== "user"` 时，仍允许发送（管理员也可能需要主动发起沟通，见下方"管理员回复"）；但公开接口的 `type` 参数始终被服务端固定为 `user_admin_comm`，客户端无法指定为系统通知类型（FR-010）                                                                                                                      |

**管理员回复的实现说明**：spec.md 用户故事 2 要求管理员能"回复"用户咨询。管理员回复复用同一个
`POST /messages/send` 接口，额外允许携带 `reply_to_message_id`（指向原始咨询消息的 id），
服务端据此把 `recipient_id` 设为原咨询消息的 `sender_id`（而不是"发给全体管理员"），并校验
调用者 `role === "super_admin"`。

### `POST /messages/send` 的普通用户互相私信拒绝

| 场景                                                                    | 行为                                                                                                                                                                                                                             |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `request.user.role === "user"` 尝试指定 `recipient_id` 为另一个普通用户 | 该接口设计上不接受客户端指定 `recipient_id`（见上）——普通用户调用时接收方永远是"全体管理员"，从接口设计层面直接杜绝用户间私信的可能性，不需要额外的运行时角色判断（FR-007 在契约层面即被满足，而不是靠一条可能被遗漏的 if 判断） |

## 管理员端接口（挂载于 `/api/admin` 前缀）

### `POST /admin/messages/broadcast` — 管理员广播

| 项       | 说明                                                                                                                                                                                                                                                                                                                                                                                                                    |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 权限     | `authenticate` + `requireSuperAdmin`                                                                                                                                                                                                                                                                                                                                                                                    |
| 限流     | `checkRateLimit(fastify, adminId, {prefix: "rate:msg_broadcast:", max: 3, ttl: 86400})`                                                                                                                                                                                                                                                                                                                                 |
| Body     | `{ title: string(1-200), content: string(1-2000), target_role?: "all"\|"user"\|"super_admin" }`（默认 `"all"`）                                                                                                                                                                                                                                                                                                         |
| 行为     | 写入单条 `recipient_id = NULL` 记录（`type = "admin_broadcast"`），`target_role` 按请求体写入；写入成功后调用 `createAuditLog(fastify, adminId, "broadcast_message", "message", messageId, { target_role, estimated_recipients })`（FR-014）；**不再**维护 Redis 版本号（原方案已废弃，见 `data-model.md` §3 的修复记录）——广播的已读/隐藏状态改为 `MessageBroadcastState` 惰性记录，无需在广播发出时更新任何全局版本号 |
| 201 响应 | `{ id: string, estimated_recipients: number }`（`estimated_recipients` 按 `target_role` 统计当前用户表中对应角色的数量，仅供前端展示参考，不是精确送达确认）                                                                                                                                                                                                                                                            |
| 429      | 限流触发 → `sendFail(429, "广播过于频繁，请稍后再试")`                                                                                                                                                                                                                                                                                                                                                                  |

### `GET /admin/messages/sent` — 管理员查看已发送广播

| 项       | 说明                                                                                     |
| -------- | ---------------------------------------------------------------------------------------- |
| 权限     | `authenticate` + `requireSuperAdmin`                                                     |
| Query    | `page?`, `page_size?`                                                                    |
| 查询范围 | `sender_id = request.user.userId AND type = 'admin_broadcast'`（仅能看到自己发出的广播） |
| 200 响应 | `{ items: BroadcastSentItem[], total, page, page_size }`                                 |

`BroadcastSentItem` 字段：`id`、`title`、`content`、`target_role`、`estimated_recipients`
（发出时快照值）、`created_at`。

## 错误码对照（`BizCode`，`response.ts` 新增 50xx 区段）

| 错误码                                 | 触发场景                                                                                                                                                                                                                                                                                                                    |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MESSAGE_NOT_FOUND = 5001`             | 操作一个不存在或已被软删除的消息 id                                                                                                                                                                                                                                                                                         |
| `CANNOT_MESSAGE_SELF = 5002`           | 保留码位（当前接口设计已从根源避免此场景，见上方"普通用户互相私信拒绝"一节），供未来扩展使用                                                                                                                                                                                                                                |
| `BROADCAST_RATE_LIMITED = 5003`        | 管理员广播超出 3 次/天限制                                                                                                                                                                                                                                                                                                  |
| `SYSTEM_MESSAGE_TYPE_FORBIDDEN = 5004` | `MessageService.create()` 内部白名单校验发现非法/被禁止的 `type`（见 `data-model.md` §6）。HTTP 层正常路径下不可达（Zod 层已排除该输入，`sendMessage`/`broadcast` 内部硬编码 `type`），触发时视为异常情况并记录 `fastify.log.error`；需有单元测试直接调用 `create()` 传入越界 `type` 验证该分支（见 tasks.md US1 测试任务） |

## 内部接口（不对外暴露 HTTP 路由，仅供其他模块 TS 直接调用）

`MessageHookService`（`src/modules/message/message-hooks.service.ts`）：

```typescript
onReviewApproved(recipientId: bigint, surveyId: bigint, surveyTitle: string): Promise<void>
onReviewRejected(recipientId: bigint, surveyId: bigint, surveyTitle: string, reason?: string): Promise<void>
onUserBanned(recipientId: bigint, reason: string, until: Date | null): Promise<void>
onUserUnbanned(recipientId: bigint): Promise<void>
onTemplateRated(recipientId: bigint, templateId: bigint, templateTitle: string, score: number): Promise<void>
onTemplateApplied(recipientId: bigint, templateId: bigint, templateTitle: string): Promise<void>
onSurveyPublished(recipientId: bigint, surveyId: bigint, surveyTitle: string): Promise<void>
onSurveyResponseMilestone(recipientId: bigint, surveyId: bigint, surveyTitle: string, threshold: number): Promise<void>
onSurveyExpiringSoon(recipientId: bigint, surveyId: bigint, surveyTitle: string, deadline: Date): Promise<void>
```

每个方法内部调用 `MessageService.create()` 写入对应 `type` 的消息；任一方法内部异常均被
捕获并 `fastify.log.warn`，不向调用方（业务方法）抛出，不影响业务方法本身的成功返回
（对齐 `createAuditLog` 的既有失败降级哲学）。
