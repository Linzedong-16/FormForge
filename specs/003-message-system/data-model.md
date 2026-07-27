# 数据模型：问卷系统消息互动功能

## 1. `MessageType` 枚举

```prisma
enum MessageType {
  operation_notify   // 操作通知（审核结果、用户封禁/解封）
  template_like      // 模板互动（评分、被应用于创建问卷 —— 触发场景差异见 research.md §2）
  survey_lifecycle   // 问卷生命周期（发布成功、即将过期、答卷里程碑）
  user_admin_comm    // 用户-管理员通信
  admin_broadcast    // 管理员广播
}
```

五个取值与 spec.md FR-002 一一对应，同时决定：发送权限规则（见 §5 状态转换与业务规则）、
前端展示图标/颜色（`MessageBell`/`MessageItem` 消费）、清理保留期限（见 §7）。

## 2. `Message` 实体

| 字段                  | 类型                       | 说明                                                                                          |
| --------------------- | -------------------------- | --------------------------------------------------------------------------------------------- |
| `id`                  | `BigInt`                   | 主键，自增                                                                                    |
| `type`                | `MessageType`              | 消息类型                                                                                      |
| `title`               | `String @db.VarChar(200)`  | 标题，1-200 字符                                                                              |
| `content`             | `String @db.Text`          | 正文，1-2000 字符（`message.schemas.ts` 校验，内容安全处理见 research.md §5）                 |
| `sender_id`           | `BigInt?`                  | 发送者；`null` 表示系统自动发出                                                               |
| `recipient_id`        | `BigInt?`                  | 接收者；`null` 表示面向群体的广播（配合 `target_role` 判定范围）                              |
| `target_role`         | `String? @db.VarChar(20)`  | 仅广播消息使用，取值 `"all"` / `"user"` / `"super_admin"`，默认 `"all"`（见 research.md §11） |
| `related_resource`    | `String? @db.VarChar(50)`  | 关联资源类型：`"survey"` / `"template"` / `"review"`                                          |
| `related_resource_id` | `BigInt?`                  | 关联资源 ID，配合 `related_resource` 用于前端跳转（FR-017）                                   |
| `is_read`             | `Boolean @default(false)`  | 是否已读（仅对 `recipient_id` 非空的消息有意义；广播消息的已读状态见 §3）                     |
| `read_at`             | `DateTime?`                | 阅读时间（同上，广播消息见 §3）                                                               |
| `created_at`          | `DateTime @default(now())` | 创建时间                                                                                      |
| `updated_at`          | `DateTime @updatedAt`      | 更新时间                                                                                      |
| `deleted_at`          | `DateTime?`                | 软删除时间（仅对 `recipient_id` 非空的消息有意义；广播消息的"删除/隐藏"见 §3）                |

**关系**：

```prisma
sender    User? @relation("SentMessages", fields: [sender_id], references: [id])
recipient User? @relation("ReceivedMessages", fields: [recipient_id], references: [id])
broadcastStates MessageBroadcastState[]
```

`User` 模型追加：

```prisma
sent_messages         Message[]               @relation("SentMessages")
received_messages     Message[]               @relation("ReceivedMessages")
message_broadcast_states MessageBroadcastState[]
```

**索引**（对齐 research.md 中的高频查询模式）：

```prisma
@@index([recipient_id, is_read, created_at])   // 用户收件箱（核心查询）
@@index([type, created_at])                     // 按类型统计
@@index([sender_id, created_at])                // 管理员查看已发送
@@index([deleted_at])                           // 清理任务扫描
@@index([created_at])                           // 时间范围查询
```

## 3. `MessageBroadcastState` 实体（广播已读/隐藏状态的唯一持久化来源）

> **修复记录（原 C2 问题）**：本实体是本次 `/speckit-analyze` 发现并修复的架构问题的产物。
> 最初方案打算把广播的已读/隐藏状态**只**存在 Redis（"已读版本号" + 隐藏 `SET`），但
> research.md §3/§4 已经论证过"业务判断依据不应完全托管在 Redis 这一易失缓存层"——如果
> Redis 因驱逐或重启丢失这些 key，会导致用户已读的广播"复活"为未读、已隐藏的广播重新出现，
> 直接违反 SC-004（未读计数 100% 一致）与 SC-007，并与 research.md 自己的论证相矛盾。
> 现改为：持久化到 PostgreSQL，Redis 只缓存"未读计数"这一派生计算结果（见 §5）。

广播消息只有一条 `recipient_id = NULL` 的物理 `Message` 记录，不能直接在这条共享记录上记
"用户 A 已读"。本实体按"用户 × 广播消息"维度**惰性**记录每个用户对某条广播的已读/隐藏状态
——只有当用户真正读过/删除过某条广播时才会写一行，绝大多数"广播-用户"组合永远不会有对应
记录（隐式视为"未读、未隐藏"）。这不会重现原设计试图避免的"广播发出时批量写入"问题：
`Message` 表始终只写一条广播记录，`MessageBroadcastState` 只在用户**实际交互**时才逐行惰性
产生，不在广播发出的那一刻批量写入。

| 字段         | 类型                       | 说明                                                  |
| ------------ | -------------------------- | ----------------------------------------------------- |
| `id`         | `BigInt`                   | 主键，自增                                            |
| `message_id` | `BigInt`                   | 广播消息 id（`Message.id`，`type = admin_broadcast`） |
| `user_id`    | `BigInt`                   | 用户 id                                               |
| `is_read`    | `Boolean @default(false)`  | 该用户是否已读这条广播                                |
| `read_at`    | `DateTime?`                | 已读时间                                              |
| `is_hidden`  | `Boolean @default(false)`  | 该用户是否"删除"（隐藏）了这条广播                    |
| `hidden_at`  | `DateTime?`                | 隐藏时间                                              |
| `created_at` | `DateTime @default(now())` | —                                                     |
| `updated_at` | `DateTime @updatedAt`      | —                                                     |

```prisma
model MessageBroadcastState {
  id         BigInt    @id @default(autoincrement())
  message_id BigInt
  user_id    BigInt
  is_read    Boolean   @default(false)
  read_at    DateTime?
  is_hidden  Boolean   @default(false)
  hidden_at  DateTime?
  created_at DateTime  @default(now())
  updated_at DateTime  @updatedAt

  message Message @relation(fields: [message_id], references: [id], onDelete: Cascade)
  user    User    @relation(fields: [user_id], references: [id], onDelete: Cascade)

  @@unique([message_id, user_id])   // upsert 的天然锚点：一个用户对一条广播只有一行状态
  @@index([user_id, is_hidden])     // 列表查询：排除某用户已隐藏的广播
  @@map("message_broadcast_states")
}
```

`onDelete: Cascade` 确保广播消息被清理任务物理删除（见 §7）时，关联的状态行自动一并清理，
不会残留孤儿数据；用户账号被删除时同理。

## 4. `Survey` 模型新增字段（支撑生命周期通知，见 research.md §3/§4）

```prisma
deadline                  DateTime?          // 问卷截止时间（原仅存在于 Redis TTL）
expiring_reminder_sent_at DateTime?          // "即将过期"提醒已发送时间，防止重复提醒
last_milestone_notified   Int      @default(0)  // 已通知过的最高答卷里程碑阈值
```

均为可加式新增（新迁移全部是 `ADD COLUMN ... DEFAULT ...` 或可空列），不影响任何既有查询/
写入路径的行为。

## 5. 校验规则（Zod，`message.schemas.ts`）

| 规则                       | 约束                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `title`                    | 1-200 字符（仅广播/系统通知需要标题；用户发起的咨询消息由服务端自动生成标题，如"用户咨询"）                                                                                                                                                                                                                                                                                                                                                                  |
| `content`                  | 1-2000 字符；服务端在写入前执行 research.md §5 的三项安全处理                                                                                                                                                                                                                                                                                                                                                                                                |
| `type`（对外可提交的子集） | 公开接口只允许 `user_admin_comm`（普通用户发送）与 `admin_broadcast`（管理员广播）；`operation_notify`/`template_like`/`survey_lifecycle` 在 Zod 层直接排除在公开可提交枚举之外（FR-010，防伪造的第一道防线）；`POST /messages/send`、`POST /admin/messages/broadcast` 的请求体 Schema 本身**不包含 `type` 字段**，`type` 始终由服务端硬编码写入，即使请求体夹带 `type` 字段也会被 Zod 忽略（第二道防线，见 `message.service.ts.create()` 的白名单校验，§6） |
| `related_resource`         | 可选，枚举 `"survey"` / `"template"` / `"review"`                                                                                                                                                                                                                                                                                                                                                                                                            |
| `target_role`（广播专用）  | 枚举 `"all"` / `"user"` / `"super_admin"`，默认 `"all"`                                                                                                                                                                                                                                                                                                                                                                                                      |
| 分页 `page`/`page_size`    | `page ≥ 1`；`page_size` 1-50，默认 20（对齐参考文档 §4.2.1）                                                                                                                                                                                                                                                                                                                                                                                                 |

## 6. 状态转换与业务规则

```text
[创建]
  ├─ 系统通知（operation_notify/template_like/survey_lifecycle）
  │    只能由 MessageHookService 内部调用 MessageService.create() 产生，
  │    HTTP 层不存在对应的公开创建入口（FR-010）；create() 内部对 type 做白名单校验
  │    （必须是 MessageType 五个取值之一），非法值抛 SYSTEM_MESSAGE_TYPE_FORBIDDEN
  │    ——这是防御性兜底，正常调用路径下不会触发，用于防止未来误用/重构引入的绕过
  ├─ 用户 → 管理员（user_admin_comm）
  │    sender.role == "user" 且 recipient 为全体 super_admin 账号；
  │    禁止 sender.role == "user" 且目标非管理员（FR-007，接口层面 recipient_id 不可由
  │    客户端指定，从结构上杜绝而非仅靠运行时校验）
  └─ 管理员 → 群体（admin_broadcast）
       仅 sender.role == "super_admin" 可创建；recipient_id = NULL + target_role 限定范围

[未读] --标记单条已读--> [已读]（非广播：is_read=true, read_at=now()；广播：upsert
                                  MessageBroadcastState，见 §3）
[未读] --标记全部已读（可按 type 过滤）--> [已读]（批量更新，幂等：重复调用不报错）

[已读/未读] --用户删除（仅接收者本人）--> [软删除]（非广播：deleted_at=now()；广播：upsert
                                  MessageBroadcastState.is_hidden=true，见 §3；均不影响
                                  其他用户对同一条消息的可见性）

[已读 + 非通信类, created_at 超过 180 天] --每日清理任务--> [物理删除]
[已读 + user_admin_comm, created_at 超过 365 天] --每日清理任务--> [物理删除]
[已读 + admin_broadcast, created_at 超过 365 天] --每日清理任务--> [物理删除]
[软删除超过 30 天] --每日清理任务--> [物理删除]
[未读] --永不自动清理（不论多久）--
```

**越权防护**（FR-013）：所有读取/标记已读/删除操作必须校验
`message.recipient_id === request.user.userId`（广播消息走 §3 的 `MessageBroadcastState`
按 `user_id === request.user.userId` 隔离，天然不存在越权可能——每个用户只能 upsert 自己那
一行状态）。管理员查看"已发送广播列表"接口按 `sender_id === request.user.userId` 过滤
（仅能看到自己发出的广播,不能看到其他管理员的）。

**内容安全的防御深度**（FR-010/FR-012，对应 research.md §5 与 M1 修复）：`POST
/messages/send`、`POST /admin/messages/broadcast` 的请求体即使被恶意构造出多余的 `type`
字段，也不会影响最终写入的消息类型——Zod Schema 不声明该字段（多余字段被丢弃），
`MessageService.sendMessage()`/`broadcast()` 内部始终把 `type` 硬编码为
`user_admin_comm`/`admin_broadcast` 再调用 `create()`；`create()` 自身也会再做一次白名单
校验（见上方状态转换图）。这两层防御共同保证 FR-010/SC-008 中"伪造系统通知被拒绝"这一场景
即使在代码演进中出现疏漏也有兜底。

## 7. 与消息类型对应的清理保留期限（对齐参考文档 §7.1，供每日清理任务使用）

| 消息状态                                                     | 保留期限 | 说明                                                                                                    |
| ------------------------------------------------------------ | -------- | ------------------------------------------------------------------------------------------------------- |
| 已读 + `operation_notify`/`template_like`/`survey_lifecycle` | 180 天   | 普通系统通知，读过后无长期保留价值                                                                      |
| 已读 + `user_admin_comm`                                     | 365 天   | 可能有纠纷追溯需求                                                                                      |
| 已读 + `admin_broadcast`                                     | 365 天   | 公告类有存档价值；物理删除时级联清理 `MessageBroadcastState`（§3）                                      |
| 未读（任意类型）                                             | 不限     | 必须用户主动读取，清理任务必须跳过                                                                      |
| 软删除（任意类型）                                           | 30 天    | 回收站缓冲期；广播的"隐藏"（`MessageBroadcastState.is_hidden`）不参与此清理，只随广播本体一起被级联删除 |

## 8. 未决问题

无——本功能范围内的所有数据建模问题均已在 research.md 中给出决策，无遗留的
`[NEEDS CLARIFICATION]` 标记。C2（广播状态持久化的架构自相矛盾）已通过新增 §3
`MessageBroadcastState` 修复，详见 research.md §13。
