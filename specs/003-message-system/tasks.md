---
description: "问卷系统消息互动功能 —— 任务列表"
---

# 任务列表：问卷系统消息互动功能

**输入**：来自 `/specs/003-message-system/` 的设计文档

**前置条件**：plan.md、spec.md、research.md、data-model.md、contracts/、quickstart.md（均已就位）

**测试**：包含在内——`plan.md` 的 Constitution 检查（原则五）明确要求 `message.service.ts`
的分支逻辑、`MessageHookService` 的每个钩子方法、前端消息 store 与铃铛组件的轮询/清理逻辑，
均需在同一变更中配套 Vitest 单元测试。

**组织方式**：任务按用户故事分组（对应 spec.md：US1 = P1 接收并管理系统通知消息，
US2 = P2 与管理员双向沟通，US3 = P3 管理员发布全体公告），以便每个故事都能独立实现、独立验收。

**`/speckit-analyze` 修复记录**：本版本已修复交叉一致性分析发现的全部问题（2 个 CRITICAL、
3 个 HIGH、2 个 MEDIUM、2 个 LOW），具体体现为：

- **C2**（架构自相矛盾）：新增 `MessageBroadcastState` 表持久化广播已读/隐藏状态（T003、
  T049），Redis 降级为纯缓存层，不再是状态的唯一存储。
- **C1**（Constitution 原则三对齐）：`docs/API接口文档.md` 的更新拆分到每个用户故事阶段末尾
  （T033、T043、T057），不再集中放在 Polish 阶段。
- **H1**（审计日志遗漏）：T038、T048 补充 `createAuditLog` 调用。
- **H2**（未读计数缓存失效遗漏）：T008 补充写操作后的缓存失效步骤。
- **H3**（spec.md"点赞"措辞未同步）：已在 spec.md 中改为"评分"，T021 描述随之更新。
- **M1**（`type` 白名单防御性校验缺任务）：T008 补充，T018/T036/T046 补充对应测试。
- **M2**（"关联资源已删除"边界情况缺验收步骤）：T026、T061 补充。
- **L1/L2**（文档间遗漏）：已在 plan.md/data-model.md 中同步补全。

## 格式：`[ID] [P?] [Story] 描述`

- **[P]**：可并行执行（不同文件，且不依赖尚未完成的任务）
- **[Story]**：本任务所属的用户故事（US1/US2/US3）
- 文件路径均为精确路径，依据 `plan.md` 的"项目结构"一节

## 路径约定

- 共享类型：`packages/common/src/message/message.interface.ts`
- 后端消息模块：`app/q-server/src/modules/message/`
- 后端既有模块的钩子调用改动：`app/q-server/src/modules/{review,user/admin,template,survey/survey-crud}/`
- 后端测试：`app/q-server/src/spec/message/`
- 管理后台前端：`app/frontend/src/{api/modules/message,store/modules,components/message,views/message-center,router}/`
- 编辑器前端：`app/q-editor/src/{api/modules/message,stores,components/Common}/`
- 前端测试：与各自应用既有惯例一致，就近放在 `__tests__/` 目录下

---

## Phase 1：Setup（共享基础设施）

**目的**：搭建三个包共用的消息类型、数据库模型，以及后端可复用工具的扩展点。

- [x] T001 [P] 在 `packages/common/src/message/message.interface.ts` 新增 `MessageType` 枚举
      以及消息列表/未读计数/发送/广播等接口的请求/响应 TypeScript 接口（对齐
      `contracts/message-endpoints.md`），并在 `packages/common/src/index.ts` 中新增
      `export * from "./message/message.interface.js"`
- [x] T002 [P] 在 `app/frontend/package.json` 的 dependencies 中新增
      `"monorepo-code-common": "workspace:*"`，然后在仓库根目录执行 `pnpm install` 完成解析
      （`app/q-editor` 与 `app/q-server` 已具备该依赖，无需改动）
- [x] T003 在 `app/q-server/prisma/schema.prisma` 中新增 `MessageType` 枚举、`Message` 模型、
      **`MessageBroadcastState` 模型**（字段/索引/关系见 `data-model.md` §1/§2/§3——后者是
      广播已读/隐藏状态的持久化来源，`@@unique([message_id, user_id])` + `onDelete:
Cascade`，修复 `/speckit-analyze` 发现的 C2 问题）；`User` 模型追加
      `sent_messages`/`received_messages`/`message_broadcast_states` 关联；`Survey` 模型
      新增 `deadline`、`expiring_reminder_sent_at`、`last_milestone_notified` 三个字段
      （见 `data-model.md` §4）
- [x] T004 在 `app/q-server` 目录执行 `pnpm db:generate` 与
      `pnpm exec prisma migrate dev --name add_messaging_system` 生成并应用迁移（依赖 T003）
- [x] T005 [P] 在 `app/q-server/src/utils/response.ts` 的 `BizCode` 枚举中新增 50xx
      消息模块错误码区段：`MESSAGE_NOT_FOUND = 5001`、`CANNOT_MESSAGE_SELF = 5002`、
      `BROADCAST_RATE_LIMITED = 5003`、`SYSTEM_MESSAGE_TYPE_FORBIDDEN = 5004`
- [x] T006 [P] 在 `app/q-server/src/utils/cache.ts` 的 `CacheKeys` 中新增
      `messageUnreadCount: (userId: string) => \`msg:unread:${userId}\``（HASH 结构，
字段为 `total`与各`MessageType`，缓存的是未读计数这一**派生计算结果**，不是状态本身
——状态的持久化来源是 `Message`/`MessageBroadcastState` 表，见 T003），`CacheTTL`中
新增`MESSAGE_UNREAD_COUNT: 60`；**不需要**新增任何"广播版本号"相关的缓存键（原方案
已废弃，见 `research.md` §13）

**检查点**：数据库模型就位，三个包共用的类型与后端扩展点均已就位，可以开始 Foundational 阶段。

---

## Phase 2：Foundational（阻塞性前置任务）

**目的**：搭建消息模块的核心 Service/Schema/路由骨架与两个前端的 API/状态管理骨架——这是
所有三个用户故事都要依赖的基础能力（收件箱能查、未读数能算、铃铛组件有地方挂）。

**⚠️ 关键**：在本阶段完成之前，任何用户故事都无法独立验收——没有收件箱查询能力，用户故事 1
就没有任何东西可以展示；没有 API/Store 骨架，用户故事 2/3 新增的接口也无从接入前端。

- [x] T007 在 `app/q-server/src/modules/message/message.schemas.ts` 新增基础 Zod Schema：
      `messageListQuerySchema`（`page`/`page_size`/`type`/`is_read`）、`messageIdSchema`、
      `messageContentSchema`（1-2000 字符长度限制；内容安全处理见 T008 的 service 层，
      Schema 层只做长度/格式校验）（依赖 T001，从 `packages/common` 导入 `MessageType`）
- [x] T008 在 `app/q-server/src/modules/message/message.service.ts` 新增 `MessageService`
      类骨架，构造函数注入 `fastify`（含 `createCache(fastify)`），实现以下方法（**均需覆盖
      `/speckit-analyze` 修复的 H2/L2/M1 三处细节，见下方括号标注**）：- `list(userId, query)`、`markRead(userId, messageId)`、`markAllRead(userId, type?)`、
      `softDelete(userId, messageId)`：本阶段仅需处理 `recipient_id` 非空的场景（广播的
      `recipient_id IS NULL` 分支在 US3 阶段的 T049 中扩展）- `getUnreadCount(userId)`：Cache-Aside 读取 `CacheKeys.messageUnreadCount`，**返回值
      必须包含按 `MessageType` 细分的 `by_type` 字段**（对齐 `contracts/message-endpoints.md`
      的响应结构，修复 L2）- `create(input)`：内部创建方法，供 `MessageHookService` 与后续 `sendMessage`/
      `broadcast` 调用；**必须对 `input.type` 做白名单校验**（仅接受 `MessageType` 五个
      枚举值之一，非法值抛 `SYSTEM_MESSAGE_TYPE_FORBIDDEN`），这是 FR-010 的第二道防线
      （修复 M1，见 `data-model.md` §6）- **`create`/`markRead`/`markAllRead`/`softDelete` 完成写入后，必须调用
      `cache.del(CacheKeys.messageUnreadCount(受影响的 userId))` 使未读计数缓存失效**，
      这是 FR-016/SC-004（未读计数 100% 一致）能够达成的关键实现细节（修复 H2）
      （依赖 T003-T007）
- [x] T009 在 `app/q-server/src/modules/message/message-hooks.service.ts` 新增
      `MessageHookService` 类骨架，声明 `contracts/message-endpoints.md` "内部接口"一节列出的
      全部 9 个方法签名，每个方法内部调用 `MessageService.create()`；任一方法内部异常均需
      捕获并 `fastify.log.warn`，不向调用方抛出（依赖 T008）
- [x] T010 在 `app/q-server/src/modules/message/message.routes.ts` 新增用户端路由：
      `GET /messages`、`GET /messages/unread-count`、`PUT /messages/:id/read`、
      `PUT /messages/read-all`、`DELETE /messages/:id`，均挂载 `authenticate` 前置处理器，
      `GET /messages` 限流 60 次/分钟/IP，`GET /messages/unread-count` 限流 30 次/分钟/用户
      （依赖 T008）
- [x] T011 在 `app/q-server/src/modules/message/index.ts` 统一导出 `MessageService`、
      `MessageHookService`、路由；在 `app/q-server/src/routes/index.ts` 中
      `import` 并 `fastify.register(messageRoutes)`（无前缀，依赖 T010）
- [x] T012 [P] 在 `app/frontend/src/api/modules/message/index.ts` 新增
      `getMessages`/`getUnreadCount`/`markRead`/`markAllRead`/`deleteMessage` 请求函数
      （复用 `serverClient`，类型从 `monorepo-code-common` 导入，对齐
      `api/modules/admin/index.ts` 的既有写法）（依赖 T001、T002）
- [x] T013 [P] 在 `app/q-editor/src/api/modules/message/index.ts` 新增与 T012 结构一致的
      用户端消息接口封装（依赖 T001）
- [x] T014 [P] 在 `app/frontend/src/store/modules/message.ts` 新增未读计数 Pinia store
      （`unreadCount`/`hasUnread`/`fetchUnreadCount`/`startPolling`/`stopPolling`，30 秒
      轮询，对齐 `research.md` §6 的选型结论）（依赖 T012）
- [x] T015 [P] 在 `app/q-editor/src/stores/useMessage.ts` 新增对应的 Pinia store（依赖 T013）

**检查点**：Foundation 就位——收件箱可查询、未读计数可轮询，三个用户故事均可在此基础上开始
独立实现。

---

## Phase 3：用户故事 1 —— 接收并管理系统通知消息（优先级：P1）🎯 MVP

**目标**：用户能在收件箱中看到审核结果、模板互动、问卷生命周期等系统通知，并能标记已读/删除；
系统通知只能由业务事件真实触发。

**独立验收标准**：见 `quickstart.md` 场景 1。

### 用户故事 1 的测试

> **注意：先写测试，确认测试失败后再实现**

- [x] T016 [P] [US1] 在 `app/q-server/src/spec/message/message.service.spec.ts` 编写
      `list`/`getUnreadCount`（缓存命中/未命中、返回值含 `by_type`）/`markRead`（幂等、
      非本人拒绝、成功后未读计数缓存被清除）/`markAllRead`/`softDelete` 的单元测试
- [x] T017 [P] [US1] 在 `app/q-server/src/spec/message/message-hooks.service.spec.ts` 编写
      9 个钩子方法各自的单元测试（验证调用 `MessageService.create` 时传入的 `type`/
      `recipient_id`/`related_resource` 是否正确，以及异常被捕获不向外抛出）
- [x] T018 [P] [US1] 在 `app/q-server/src/spec/message/message.routes.spec.ts` 编写
      `GET /messages`（分页/筛选）、`GET /messages/unread-count`、`PUT /messages/:id/read`、
      `PUT /messages/read-all`、`DELETE /messages/:id` 的路由测试，含越权场景（非本人消息
      返回 403）；另需为 `MessageService.create()` 补一条单元测试：直接传入越界的 `type`
      字符串，断言抛出 `SYSTEM_MESSAGE_TYPE_FORBIDDEN`（验证 T008 的白名单校验，修复 M1）

### 用户故事 1 的实现

- [x] T019 [US1] 在 `app/q-server/src/modules/review/review.service.ts` 的 `approveReview`
      （约第 306 行）与 `rejectReview`（约第 432 行）方法内，紧邻既有 `createAuditLog` 调用
      之后，新增对 `MessageHookService.onReviewApproved`/`onReviewRejected` 的调用（依赖 T009）
- [x] T020 [US1] 在 `app/q-server/src/modules/user/admin/admin.service.ts` 的 `banUser`
      （约第 340 行）与 `unbanUser`（约第 402 行）方法内，紧邻既有 `createAuditLog` 调用
      之后，新增对 `MessageHookService.onUserBanned`/`onUserUnbanned` 的调用（依赖 T009）
- [x] T021 [P] [US1] 在 `app/q-server/src/modules/template/template.service.ts` 的 `rate`
      （约第 286 行，模板评分方法）内新增 `onTemplateRated` 调用；`useTemplate`
      （约第 203 行，模板应用于创建问卷的方法）内紧邻既有
      `createAuditLog(...use_template...)` 调用之后新增 `onTemplateApplied` 调用——注意
      触发场景是"评分"而不是"点赞"（项目当前没有点赞功能，见 `research.md` §2，spec.md 已
      同步改为"评分"措辞，修复 H3）（依赖 T009）
- [x] T022 [US1] 在 `app/q-server/src/modules/survey/survey-crud/survey-crud.service.ts` 的
      `publish`（约第 486 行）方法内新增 `onSurveyPublished` 调用；`submitResponse`
      （约第 929 行）方法内在既有 `responses_count: { increment: 1 }` 事务提交后，比较新
      计数与 `[50, 100, 500]` 阈值及 `Survey.last_milestone_notified`，触发
      `onSurveyResponseMilestone` 并回写 `last_milestone_notified`；生成问卷链接的方法
      （约第 731-803 行）内把 `deadline` 一并写入数据库列（依赖 T009、T004）
- [x] T023 [US1] 新增 `app/q-server/src/modules/message/message-scheduler.ts`：计算下一次
      每日 03:00 的毫秒差 → `setTimeout` 触发 → 之后 24 小时 `setInterval` 循环，串行执行
      "消息清理"（按 `data-model.md` §7 的保留期限分批删除，每批 500 条 + 100ms 间隔；广播
      消息物理删除时依赖 `onDelete: Cascade` 级联清理对应的 `MessageBroadcastState` 行，
      无需额外代码）与"问卷即将过期提醒扫描"（`WHERE deadline BETWEEN now() AND now()+7d
AND expiring_reminder_sent_at IS NULL AND status=1 AND deleted_at IS NULL`，逐条触发
      `onSurveyExpiringSoon` 并回写 `expiring_reminder_sent_at`）两个任务，执行结果按
      参考文档 §7.3 的字段结构输出结构化日志（依赖 T004、T009）
- [x] T024 [US1] 在 `app/q-server/src/index.ts` 的启动流程中新增对
      `message-scheduler.ts` 调度入口的调用（依赖 T023）
- [x] T025 [P] [US1] 新增 `app/frontend/src/components/message/MessageBell.vue`
      （`a-badge` + 铃铛图标，未读数为 0 时隐藏徽标，超过 99 显示"99+"，点击打开
      `MessageDrawer`）（依赖 T014）
- [x] T026 [P] [US1] 新增 `app/frontend/src/components/message/MessageDrawer.vue` 与
      `MessageItem.vue`（列表/分页/按类型与已读状态筛选/点击标记已读/删除按钮/"全部已读"
      按钮/空状态"暂无消息"/消息类型→图标颜色映射，对齐参考文档 §8.3）；"查看详情"跳转必须
      处理关联资源已不存在的情况（目标接口返回 404 时展示"资源已不存在"提示而非直接报错或
      跳转到损坏页面，修复 M2，对应 FR-017 与 spec.md 边界情况一节）（依赖 T012）
- [x] T027 [US1] 修改 `app/frontend/src/views/layout/components/header-top.vue`，在主题
      切换按钮与用户下拉菜单之间嵌入 `<MessageBell />`（依赖 T025）
- [x] T028 [P] [US1] 新增 `app/q-editor/src/components/Common/MessageBell.vue`
      （Element Plus `el-badge` 风格，对齐既有 `ReviewNotice.vue` 的实现模式）（依赖 T015）
- [x] T029 [P] [US1] 新增 `app/q-editor/src/components/Common/MessagePanel.vue`
      （`el-popover` 下拉面板，列表/已读/删除/空状态/关联资源已删除兜底提示（同 T026），
      对齐 `ReviewNotice.vue` 风格）（依赖 T013）
- [x] T030 [US1] 修改 `app/q-editor/src/components/Common/header-nav.vue`，在既有
      `<ReviewNotice />` 旁新增 `<MessageBell />`（依赖 T028、T029）
- [x] T031 [P] [US1] 新增 `app/frontend/src/components/message/__tests__/MessageBell.spec.ts`
      与 `MessageDrawer.spec.ts`（mock API、`ArcoVue`/`ArcoVueIcon` 插件注册、
      `vi.useFakeTimers()` 验证轮询清理，对齐 `analytics-dashboard/__tests__/` 既有模式）
      （依赖 T025、T026）
- [x] T032 [P] [US1] 新增 `app/q-editor/src/components/Common/__tests__/MessageBell.spec.ts`
      （依赖 T028、T029）
- [x] T033 [US1] 更新 `docs/API接口文档.md`，补充用户故事 1 引入的 5 个用户端接口
      （`GET /messages`、`GET /messages/unread-count`、`PUT /messages/:id/read`、
      `PUT /messages/read-all`、`DELETE /messages/:id`），对齐 Constitution 原则三
      "每一个新增/修改的接口必须在同一 PR 内同步更新接口文档"的要求（修复 C1——此前该任务
      被集中放在 Polish 阶段，与"增量交付"策略下各用户故事可能独立成 PR 相冲突）（依赖 T010）
- [x] T034 [US1] 按 `quickstart.md` 手动执行场景 1（接收并管理系统通知消息），并记录结果

**检查点**：用户故事 1 应可独立完整运行与验收——用户能看到系统通知、标记已读、删除，管理员
封禁/审核等操作会真实触发通知。

---

## Phase 4：用户故事 2 —— 与管理员双向沟通（优先级：P2）

**目标**：普通用户能向管理员发送咨询消息，管理员能回复；普通用户之间的私信在接口设计层面
直接被杜绝。

**独立验收标准**：见 `quickstart.md` 场景 2。

### 用户故事 2 的测试

- [x] T035 [P] [US2] 在 `message.service.spec.ts` 追加 `sendMessage` 的单元测试：普通用户
      发送 → 全体管理员收到、管理员携带 `reply_to_message_id` 回复 → 原发送者收到、
      频率限制触发返回 429、写入成功后调用了 `createAuditLog`（修复 H1）、写入成功后
      对应接收者的未读计数缓存被清除（修复 H2）
- [x] T036 [P] [US2] 在 `message.routes.spec.ts` 追加 `POST /messages/send` 的路由测试，
      含一条"请求体夹带 `type: 'operation_notify'` 字段被忽略，创建的消息 `type` 仍为
      `user_admin_comm`"的用例（验证 FR-010/SC-008，修复 M1）

### 用户故事 2 的实现

- [x] T037 [US2] 在 `message.schemas.ts` 新增 `sendMessageSchema`（`content`、
      `related_resource?`、`related_resource_id?`、`reply_to_message_id?`——**不声明
      `type` 字段**，多余字段被 Zod 丢弃，这是 FR-010 的第一道防线），并在
      `messageContentSchema` 的基础上于 service 层新增内容安全处理：正则剔除 HTML 标签、
      手机号/邮箱/18 位身份证号替换为 `***`（对齐 `research.md` §5，仅覆盖这三类可枚举的
      个人信息模式，不引入第三方敏感词库）（依赖 T007）
- [x] T038 [US2] 在 `message.service.ts` 新增 `sendMessage(senderId, input)` 方法：
      当调用者角色为 `user` 时，对每个 `role = "super_admin"` 的用户各写一条
      `type = "user_admin_comm"` 消息；当携带 `reply_to_message_id` 且调用者为
      `super_admin` 时，`recipient_id` 设为原消息的 `sender_id`；调用前经
      `checkRateLimit(fastify, senderId, {prefix: "rate:msg_send:", max: 10, ttl: 60})`
      校验；**写入成功后调用 `createAuditLog(fastify, senderId, "send_message", "message",
messageId, {...})`**（修复 H1，对齐 `research.md` §14）；**对每个接收者调用
      `cache.del(CacheKeys.messageUnreadCount(...))`**（修复 H2，若 T008 已把此逻辑封装进
      `create()` 内部则此处无需重复）（依赖 T008、T037）
- [x] T039 [US2] 在 `message.routes.ts` 新增 `POST /messages/send`（依赖 T038）
- [x] T040 [P] [US2] 修改 `app/frontend/src/components/message/MessageDrawer.vue` 新增
      "联系管理员"入口与发送表单（依赖 T026、T012）
- [x] T041 [P] [US2] 修改 `app/frontend/src/components/message/MessageItem.vue`，在
      `type === "user_admin_comm"` 且当前用户为管理员时展示"回复"按钮及回复输入框
      （依赖 T026）
- [x] T042 [P] [US2] 修改 `app/q-editor/src/components/Common/MessagePanel.vue` 新增
      "联系管理员"入口与发送表单（依赖 T029、T013）
- [x] T043 [US2] 更新 `docs/API接口文档.md`，补充用户故事 2 引入的 `POST /messages/send`
      接口（修复 C1，见 T033 说明）（依赖 T039）
- [x] T044 [US2] 按 `quickstart.md` 手动执行场景 2（与管理员双向沟通），并记录结果

**检查点**：用户故事 1 与 2 均应可独立运行——用户能收发系统通知与咨询消息，管理员能回复。

---

## Phase 5：用户故事 3 —— 管理员发布全体公告（优先级：P3）

**目标**：管理员能向全体用户或指定角色发布广播；普通用户无法发起广播；广播有独立的频率限制
与"已发送列表"查看能力；广播的已读/隐藏状态持久化、可靠，不因缓存失效而复活。

**独立验收标准**：见 `quickstart.md` 场景 3。

### 用户故事 3 的测试

- [x] T045 [P] [US3] 在 `message.service.spec.ts` 追加 `broadcast`/`listSent` 的单元测试：
      `target_role` 范围过滤、频率限制（3 次/天）触发、非 `super_admin` 调用被拒绝、写入
      成功后调用了 `createAuditLog`（修复 H1）；追加一条"请求体夹带 `type` 字段被忽略"的
      用例（同 T036，修复 M1）
- [x] T046 [P] [US3] 新增 `app/q-server/src/spec/message/admin-message.routes.spec.ts`
      编写 `POST /admin/messages/broadcast`、`GET /admin/messages/sent` 的路由测试；新增
      一条**健壮性测试**（修复 C2）：用户 A 标记某条广播已读、删除另一条广播后，直接对
      `MessageBroadcastState` 表做断言（而不经过 Redis），确认状态已落库；随后清空/mock
      掉 Redis 客户端再次调用 `list`/`getUnreadCount`，确认已读/隐藏状态与未读计数依然正确
      （证明 Redis 只是缓存，不是状态的唯一来源）

### 用户故事 3 的实现

- [x] T047 [US3] 在 `message.schemas.ts` 新增 `broadcastSchema`（`title`、`content`、
      `target_role?`，枚举 `"all"`/`"user"`/`"super_admin"`，默认 `"all"`——同样**不声明
      `type` 字段**，见 T037 的防御设计）（依赖 T007）
- [x] T048 [US3] 在 `message.service.ts` 新增 `broadcast(adminId, input)`（写入单条
      `recipient_id = NULL` 记录；调用前经 `checkRateLimit(fastify, adminId, {prefix:
"rate:msg_broadcast:", max: 3, ttl: 86400})` 校验；**写入成功后调用
      `createAuditLog(fastify, adminId, "broadcast_message", "message", messageId,
{target_role, estimated_recipients})`**，修复 H1）与 `listSent(adminId, query)`
      （`WHERE sender_id = adminId AND type = 'admin_broadcast'`）方法；**不再实现任何
      "广播版本号"相关逻辑**（原方案已废弃，见 `research.md` §13）（依赖 T008、T047）
- [x] T049 [US3] 扩展 `message.service.ts` 的 `list`/`getUnreadCount`/`markRead`/
      `softDelete`（T008 产出），全部改为通过 `MessageBroadcastState` 表处理广播分支
      （**修复 C2**，取代原计划中基于 Redis 版本号/隐藏集合的方案，见 `data-model.md` §3、
      `research.md` §13）：- `list()`：查询条件新增 `OR (recipient_id IS NULL AND (target_role = 'all' OR
target_role = $myRole))` 分支，对广播消息 `LEFT JOIN MessageBroadcastState`
      计算 `is_read`（无记录视为未读）并排除 `is_hidden = true` 的记录 - `markRead()`：若目标是广播消息，`upsert` 一行 `MessageBroadcastState`
      （`message_id`+`user_id` 为 `@@unique` 锚点）设置 `is_read = true, read_at = now()` - `softDelete()`：若目标是广播消息，`upsert` `MessageBroadcastState.is_hidden = true,
hidden_at = now()` - `getUnreadCount()`：未读总数 = 非广播未读数 + （匹配 `target_role` 且
      `is_hidden` 不为 `true` 且（无 `MessageBroadcastState` 记录或 `is_read = false`））
      的广播数；整体计算结果走 T008 已建立的 Cache-Aside（Redis 只是这个计算结果的缓存层，
      清空 Redis 后重新计算即可得到正确结果）
      （依赖 T046、T048）
- [x] T050 [US3] 新增 `app/q-server/src/modules/message/admin-message.routes.ts`：
      `POST /messages/broadcast`、`GET /messages/sent`，均挂载 `authenticate` +
      `requireSuperAdmin`（依赖 T048、T049）
- [x] T051 [US3] 在 `app/q-server/src/modules/message/index.ts` 追加导出
      `adminMessageRoutes`；在 `routes/index.ts` 中
      `fastify.register(adminMessageRoutes, { prefix: "/admin" })`（依赖 T050）
- [x] T052 [P] [US3] 在 `app/frontend/src/components/acro-icons.vue` 的 `iconMap` 新增
      消息中心所需图标（如 `notification`/`send`，需先确认 `@arco-design/web-vue` 图标集中
      存在对应导出）
- [x] T053 [US3] 在 `app/frontend/src/router/routes.ts` 新增 `/message-center` 父子路由
      （`meta: { requiresSuperAdmin: true }`，子路由 `broadcast`），对齐
      `survey-management` 既有的父子路由模式（依赖 T052）
- [x] T054 [US3] 新增 `app/frontend/src/views/message-center/MessageCenterLayout.vue`
      （`<router-view />` 外壳，对齐 `SurveyManagementLayout.vue`）（依赖 T053）
- [x] T055 [US3] 新增 `app/frontend/src/views/message-center/BroadcastSentView.vue`
      （已发送广播列表 `a-table` + 发布新广播的表单，`target_role` 选择器）（依赖 T012、T054）
- [x] T056 [P] [US3] 新增
      `app/frontend/src/views/message-center/__tests__/BroadcastSentView.spec.ts`
      （依赖 T055）
- [x] T057 [US3] 更新 `docs/API接口文档.md`，补充用户故事 3 引入的
      `POST /admin/messages/broadcast`、`GET /admin/messages/sent` 两个接口（修复 C1，
      见 T033 说明——本任务完成后，三个用户故事各自引入的全部 8 个接口均已在其自身阶段内
      完成文档同步，不存在任何接口"文档滞后于代码合并"的窗口期）（依赖 T050）
- [x] T058 [US3] 按 `quickstart.md` 手动执行场景 3（管理员发布全体公告），并记录结果

**检查点**：三个用户故事均应可独立运行与验收。

---

## Phase 6：Polish & 收尾

**目的**：补齐跨用户故事的边界情况验证、静态检查，以及不便归入单一用户故事的收尾工作。

- [x] T059 [P] 补充 `message.schemas.ts`/`message.service.ts` 内容安全处理的专项单元测试
      （脚本标签剔除、手机号/邮箱/身份证号替换为 `***`、超长内容 400 拒绝），对应
      `research.md` §5 与 spec.md 边界情况一节
- [x] T060 [P] 在仓库根目录运行 `q-server`（`vitest run`）、`frontend`（`vitest run` +
      `vue-tsc --noEmit`）、`q-editor`（`vitest run` + `vue-tsc --noEmit`）以及根 ESLint/
      Prettier/cspell，确认三端全部通过
- [x] T061 按 `quickstart.md` 手动执行场景 4（内容安全与边界情况，含"关联资源已删除"兜底
      提示与"伪造 `type` 字段被忽略"两条新增步骤）与场景 5（消息清理与生命周期通知，含
      "清空 Redis 后广播已读/隐藏状态仍正确"这一新增的健壮性验证步骤——需构造历史时间数据
      触发清理与提醒逻辑），并记录结果

---

## 依赖关系与执行顺序

### 阶段依赖

- **Setup（Phase 1）**：无依赖，可立即开始
- **Foundational（Phase 2）**：依赖 Setup 完成——阻塞全部用户故事
- **用户故事（Phase 3+）**：均依赖 Foundational 完成
  - 用户故事之间按优先级顺序推进（P1 → P2 → P3），也可在人力充足时并行
  - US2/US3 均在 US1 产出的 `message.service.ts`/`message.routes.ts` 基础上扩展
    （T038/T049 分别扩展 T008 的方法），但各自新增的接口/UI 独立可测试
  - 每个用户故事阶段末尾都包含一次 `docs/API接口文档.md` 的增量更新（T033/T043/T057），
    而不是集中放在 Polish——这样即使某个用户故事被拆成独立 PR 先行合并，也始终满足
    "同一 PR 内同步更新接口文档"的要求
- **Polish（最终阶段）**：依赖期望完成的用户故事全部完成

### 用户故事依赖

- **用户故事 1（P1）**：Foundational 完成后即可开始，不依赖其他用户故事
- **用户故事 2（P2）**：Foundational 完成后即可开始；`sendMessage` 复用 US1 的
  `MessageService`/`message.routes.ts` 文件（同文件追加方法/路由），但功能上不依赖 US1
  的任何具体特性即可独立验收
- **用户故事 3（P3）**：Foundational 完成后即可开始；T049 扩展 US1 产出的 `list`/
  `getUnreadCount`/`markRead`/`softDelete`（将广播分支从"未实现"变为"基于
  `MessageBroadcastState` 实现"），其余部分（`broadcast`/`listSent`/管理页面）独立于
  US1/US2

### 每个用户故事内部

- 先写测试（若采纳 TDD），测试必须先失败再实现
- Schema 在 Service 之前；Service 在 Routes 之前
- 后端钩子调用改动在前端 UI 之前（前端需要有真实数据才能展示，尽管开发期可用 mock 数据并行）
- 完成一个故事再进入下一个优先级

### 并行机会

- Phase 1 全部标 [P] 的任务可并行
- Phase 2 中 T012/T013（两个前端的 API 模块）、T014/T015（两个前端的 store）可两两并行
- Foundational 完成后，US1/US2/US3 的后端与前端部分可由不同开发者并行推进
- 每个故事内部标 [P] 的任务（不同文件、无相互依赖）可并行

---

## 并行示例：用户故事 1

```bash
# 后端测试可并行编写：
Task: "message.service.spec.ts 的单元测试"
Task: "message-hooks.service.spec.ts 的单元测试"
Task: "message.routes.spec.ts 的路由测试"

# 两个前端的铃铛组件可并行开发（不同应用、不同技术栈）：
Task: "app/frontend 的 MessageBell.vue + MessageDrawer.vue"
Task: "app/q-editor 的 MessageBell.vue + MessagePanel.vue"
```

---

## 实施策略

### 先交付 MVP（仅用户故事 1）

1. 完成 Phase 1：Setup
2. 完成 Phase 2：Foundational（关键——阻塞所有用户故事）
3. 完成 Phase 3：用户故事 1
4. **停下来验证**：独立测试用户故事 1（`quickstart.md` 场景 1）
5. 视情况部署/演示

### 增量交付

1. 完成 Setup + Foundational → 基础就位
2. 加入用户故事 1 → 独立测试 → 部署/演示（MVP！）
3. 加入用户故事 2 → 独立测试 → 部署/演示
4. 加入用户故事 3 → 独立测试 → 部署/演示
5. 每个故事都在不破坏前一个故事的前提下新增价值，且各自在自己的阶段内完成接口文档同步

---

## 备注

- `[P]` 任务 = 不同文件、无相互依赖
- `[Story]` 标签把任务追溯到具体用户故事
- 每个用户故事都应可独立完成、独立验收
- 落地前先确认测试失败（若采纳 TDD）
- 建议每完成一个任务或一组逻辑相关任务后提交一次
- 可以在任意检查点停下来独立验证某个用户故事
- 避免：模糊不清的任务描述、多个任务写同一个文件产生冲突、破坏用户故事独立性的跨故事强依赖
- 广播消息的已读/隐藏状态以 `MessageBroadcastState` 表为唯一持久化来源，Redis 只缓存未读
  计数这一派生结果——任何后续对广播相关逻辑的修改都不应该退回"状态只存在 Redis"的方案
