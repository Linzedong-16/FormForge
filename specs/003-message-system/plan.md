# 实施计划：问卷系统消息互动功能

**分支**：`003-message-system` | **日期**：2026-07-12 | **规格说明**：[spec.md](./spec.md)

**输入**：来自 `/specs/003-message-system/spec.md` 的功能规格说明

**说明**：本文件由 `/speckit-plan` 命令填写。执行流程详见 `.specify/templates/plan-template.md`。

## 摘要

在 `app/q-server` 中新增一个 `message` 模块（收件箱/未读计数/已读/删除/用户发咨询/管理员广播），
并在 `app/frontend`（管理后台）与 `app/q-editor`（编辑器）两个前端应用中各自新增消息铃铛 +
收件箱面板，覆盖 spec.md 的三个用户故事（接收系统通知、与管理员双向沟通、管理员广播）。
系统通知类消息（审核结果、模板互动、问卷生命周期、封禁/解封）通过一个新增的 `MessageHookService`
从既有业务方法内部触发，全部是真实存在的既有代码路径的**新增**调用（详见 `research.md` §1-§5），
不改变这些方法原有的业务行为。后端复用项目已有的限流工具（`checkRateLimit`）、缓存工具
（`createCache`/`CacheKeys`/`CacheTTL`）、审计日志工具（`createAuditLog`）、认证中间件
（`authenticate`/`requireSuperAdmin`），不引入任何新的第三方依赖——消息清理与"问卷即将过期
提醒"两个定时任务采用项目已有的 `setInterval` 调度风格（对齐 `tracking-consumer` 的实现习惯），
不新增 `node-cron` 依赖。前端两侧各自独立轮询未读计数（不使用 qiankun `globalState`，与项目
现状"两个前端各自独立维护 Pinia 实例"的既有隔离风格保持一致，详见 `research.md` §7）。

## 技术上下文

**语言/版本**：TypeScript 5.9（strict）——三个受影响的包（`q-server`/`frontend`/`q-editor`）均在
既有 strict TypeScript 代码基础上新增，不涉及语言/版本变更。

**主要依赖**：全部复用既有依赖，不新增任何第三方包。
后端（`q-server`）——Fastify 5（路由/中间件）、Prisma 7 + PostgreSQL（`Message` 模型 +
`MessageType` 枚举 + `Survey` 表两个新增字段）、Zod v4（请求体/查询校验）、ioredis
（未读计数缓存、限流计数器、广播版本号）、Pino（结构化日志）。
前端（`frontend`）——Vue 3.5、Pinia 3（新增 `store/modules/message.ts`，选型理由见
`research.md` §6）、Arco Design Vue（`a-badge`/`a-popover`/`a-list`/`a-tabs`）、既有
`serverClient` Axios 实例。
编辑器（`q-editor`）——Vue 3.5、Pinia 3（对应的消息 store）、Element Plus（`el-badge`/
`el-popover`，对齐既有 `ReviewNotice.vue` 的组件风格）、既有 `serverClient` Axios 实例。

**存储**：PostgreSQL（新增 `Message` 表 + `MessageType` 枚举 + `MessageBroadcastState` 表
——后者是 `/speckit-analyze` 修复 C2 问题后新增的广播已读/隐藏状态持久化来源，见
`research.md` §13；`Survey` 表新增 `deadline` `DateTime?`、`expiring_reminder_sent_at`
`DateTime?`、`last_milestone_notified` `Int @default(0)` 三个字段，用于支撑"问卷即将过期
提醒"与"答卷里程碑"通知的幂等去重，详见 `research.md` §3/§4）；Redis（未读计数**缓存**——
缓存的是派生计算结果而非状态本身，见 `research.md` §13、发送/广播频率限制计数器）。

**测试**：Vitest——`q-server` 侧新增 `src/spec/message/**/*.spec.ts`（对齐既有
`src/spec/tracking/`、`src/spec/user/` 的组织方式）；`frontend`/`q-editor` 侧新增
`__tests__/` 下的组件与 store 单元测试（对齐 `analytics-dashboard/__tests__/` 的既有模式：
mock API、`ArcoVue`/`ArcoVueIcon` 插件注册、`vi.useFakeTimers()` 验证轮询清理）。

**目标平台**：服务端 API（`q-server`，Node ≥22.17，新增路由挂载在既有 `/api` 前缀下）+ 两个
独立浏览器前端（`frontend` 管理后台，qiankun 主应用；`q-editor` 编辑器，qiankun 子应用）。

**项目类型**：Web 全栈功能——后端新增一个业务模块（路由+服务+Schema+钩子服务）、两个前端各自
新增消息铃铛组件 + 收件箱视图 + Pinia store + API 模块；不涉及任何新的独立服务/项目。

**性能目标**：未读计数查询 P95 < 10ms（Redis 缓存命中路径，对齐 `research.md` 引用文档
§6.4 的既有性能设定）；消息列表首页查询 P95 < 50ms（核心复合索引覆盖）；前端轮询间隔
30 秒，不快于后端未读计数缓存 TTL，避免产生无意义请求（对齐 SC-001/SC-002 的"数十秒级可接受
延迟"假设）。

**约束**：系统通知类消息（`operation_notify`/`template_like`/`survey_lifecycle`）必须只能由
服务端内部方法调用触发，HTTP 层不暴露任何可由客户端直接指定这三种类型的公开创建接口（FR-010）；
广播消息不逐条写入，用单条 `recipient_id=NULL` 记录 + 版本号缓存实现"全员可见"查询（避免
500 用户 × 1 广播 = 500 次 INSERT 的写入放大）；清理任务必须分批执行（每批 500 条 + 批次间隔），
避免长事务锁表；不得引入 `node-cron` 等新调度依赖，复用项目已有的 `setInterval` 周期任务风格；
`frontend`/`q-editor` 两侧的消息铃铛各自独立发起未读计数轮询，不依赖 qiankun `globalState`
（项目当前未使用该机制，两个子应用的 Pinia 实例本就相互隔离，详见 `research.md` §7）。

**规模/范围**：后端新增 2 个 Prisma 模型（`Message`、`MessageBroadcastState`） + 1 个枚举 +
`Survey` 表 3 个新增字段、1 个业务模块
（`message.routes.ts`/`admin-message.routes.ts`/`message.schemas.ts`/`message.service.ts`/
`message-hooks.service.ts`）、4 处既有业务方法内新增钩子调用（审核通过/驳回、封禁/解封）、
2 处既有业务方法内新增钩子调用（模板评分、模板被应用于创建问卷）、1 处既有业务方法内新增
里程碑判断（答卷提交）、1 处既有业务方法内新增钩子调用（问卷发布）、1 个新增的每日定时任务
（消息清理 + 问卷即将过期提醒共用一套调度机制）；前端每侧新增 1 个消息铃铛组件、1 个收件箱
视图、1 个 Pinia store、1 个 API 模块；`frontend` 侧额外新增 1 个仅管理员可见的"已发送广播"
管理页面（复用既有 `requiresSuperAdmin` 路由守卫）。

## Constitution 检查

_关卡：必须在 Phase 0 调研之前通过；Phase 1 设计完成后重新检查一次。_

| 原则                               | 评估                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 一、Monorepo 模块边界完整性        | 通过——消息模块是 `q-server` 内部的一个新业务模块，只通过既有的公开 HTTP 契约被两个前端消费；跨模块的钩子调用（审核/模板/封禁/问卷 → 消息）都发生在 `q-server` 内部的 service 方法之间的直接函数调用，不跨越到其他应用的 `src/`。消息相关的响应类型（`MessageType`、消息列表/未读计数等接口的请求/响应结构）会被 `q-server`、`frontend`、`q-editor` 三个包同时使用，达到本原则"两个以上包共用的类型必须提取到 `packages/common`"的 MUST 门槛，因此提取到 `packages/common/src/message/message.interface.ts`（与 `002` 中 analytics 类型"仅单一前端消费、就近声明本地类型"的场景不同——那里只有一个消费方，不触发本条 MUST 规则；这里有三个消费方，必须提取，详见 `research.md` §8）。`frontend` 因此需要新增对 `monorepo-code-common` 的工作区依赖（`q-editor` 已有该依赖，`q-server` 已有该依赖）。 |
| 二、严格类型安全与 Schema 优先校验 | 通过——所有消息相关的路由 body/query 都通过 Zod（`message.schemas.ts`）在信任边界处校验，遵循 `review.schemas.ts` 的既有惯例；前端 API 响应类型以 TypeScript 接口就近声明在新建的 `api/modules/message/index.ts` 中，镜像后端响应结构。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 三、统一 API 契约与响应结构        | 通过——所有新增接口使用既有的 `{code, msg, data}` 响应结构（`reply.sendSuccess`/`sendFail`）；新增业务错误码在 `response.ts` 的 `BizCode` 枚举中以 50xx 区段追加（如 `MESSAGE_NOT_FOUND`、`CANNOT_MESSAGE_SELF`），不引入 ad hoc 数字字面量；分页列表接口（`GET /messages`）复用与其他列表接口一致的分页结构（`total`/`page`/`page_size`）；`docs/API接口文档.md` 的更新按用户故事拆分到各自阶段末尾同步进行，不集中推迟到 Polish 阶段，确保每个可能独立成 PR 的用户故事都满足"同一 PR 内更新接口文档"的要求（`/speckit-analyze` 发现并修复的 C1 问题，见 tasks.md）。                                                                                                                                                                                                                              |
| 四、默认安全                       | 通过——所有用户端接口通过既有 `authenticate` 前置处理器强制鉴权；广播/管理员已发送列表接口额外叠加 `requireSuperAdmin`；发送/广播两个主动写入接口通过既有 `checkRateLimit` 工具做按用户/按天维度的频率限制（FR-011）；消息内容长度限制、脚本标签过滤、敏感个人信息（手机号/邮箱/身份证号）自动屏蔽在 Zod schema + service 层新增处理（项目当前无同类先例，属于本功能新增的安全能力，详见 `research.md` §5）；系统通知类型在 Zod schema 层面直接从公开可提交的枚举中剔除，`create()` 内部再做一次白名单兜底校验，从根源与运行时两道防线共同杜绝伪造（FR-010，`/speckit-analyze` 发现并修复的 M1 问题）。                                                                                                                                                                                             |
| 五、测试优先/测试充分交付          | 通过——`message.service.ts` 的分支逻辑（角色隔离、频率限制触发、幂等标记已读、越权拒绝、`type` 白名单兜底）、`MessageHookService` 的每个钩子方法、前端消息 store 与铃铛组件的轮询/清理逻辑，均在同一变更中配套 Vitest 单元测试，对齐 `tracking-analytics`/`analytics-dashboard` 已确立的测试基线。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 六、可观测性与结构化日志           | 通过——所有新路由使用既有 `fastify.log`/`request.log` 结构化日志，不引入 `console.log`；`sendMessage`/`broadcast` 两个用户主动触发的写操作显式调用既有 `createAuditLog` 工具落审计日志（FR-014，`/speckit-analyze` 发现并修复的 H1 问题，见 `research.md` §14），失败降级到本地文件，与既有模块行为一致；系统通知类消息不重复审计（触发它们的源业务动作已在源头被审计）；不触碰埋点管道，不适用该原则中关于 ClickHouse 管道降级的条款。                                                                                                                                                                                                                                                                                                                                                             |
| 七、代码风格与静态分析合规         | 通过——适用标准的根目录 ESLint/Prettier/cspell 关卡；消息相关的新词汇（如"广播"英文标识符片段）如触发 cspell 报错，追加到项目自定义词典而非行内抑制。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 八、微前端与跨应用集成纪律         | 通过——两个前端的消息铃铛各自独立轮询、各自维护独立 Pinia store 实例，不改变 qiankun `bootstrap`/`mount`/`unmount`/`update` 生命周期契约，不引入 `globalState`（与项目现状一致，详见 `research.md` §7）；轮询定时器必须在组件 `onUnmounted`/store 卸载时清除，防止 qiankun 子应用重复挂载/卸载周期之间的定时器泄漏。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 九、AI/LLM 集成治理                | 不适用——本功能不涉及任何 LLM/AI 能力。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 十、性能与数据管道完整性           | 通过——未读计数查询走 Redis 缓存（Cache-Aside，`createCache` 既有工具，缓存的是派生计算结果，写操作后主动失效），TTL 与既有缓存分层（30s~10min）保持同一量级；广播创建仍是单记录写入，已读/隐藏状态改为 `MessageBroadcastState` 表**惰性**记录（只在用户真正交互时才产生一行），既避免了全表批量失效/批量写入放大，也避免了纯 Redis 方案的易失性风险（`/speckit-analyze` 发现并修复的 C2 问题，见 `research.md` §13）；消息清理任务分批执行（500 条/批 + 间隔），避免长事务锁表影响其他查询；新增的 `Survey.responses_count` 里程碑判断复用既有已缓存字段，不引入新的聚合查询。                                                                                                                                                                                                                     |

**结论**：无违规项。下方"复杂度追踪"表无需填写。

**Phase 1 设计后复查**：`research.md` §1 记录了参考技术方案文档中"模板被点赞"这一触发场景与
项目现状的真实差距——`Template` 模块目前没有"点赞"功能，只有评分（`TemplateRating`，1-5 分）
与"应用模板创建问卷"（会递增 `download_count`）两个真实存在的互动事件。处理方式是将
`template_like` 类型的触发场景对齐到这两个真实存在的事件，而不是虚造一个不存在的"点赞"钩子
调用点——这维持了摘要中"钩子调用点必须是真实存在的既有代码路径"这一整体框定，也没有扩大
`Template` 模块的功能范围（新增点赞按钮/点赞表不在本功能范围内）。`research.md` §3/§4 记录了
"问卷即将过期提醒"和"答卷里程碑"两个通知场景在当前 `Survey` 模型下缺少可查询的持久化依据
（截止时间只存在于 Redis TTL 中，没有数据库列；里程碑判断没有幂等去重字段）——处理方式是对
`Survey` 表做两处小幅、可加式的字段新增（`deadline`、`expiring_reminder_sent_at`、
`last_milestone_notified`），而不是依赖易失的 Redis 状态作为业务判断的唯一依据，这与本项目
"`q-server` 是持久化与跨切面业务逻辑的唯一可信来源"的模块边界原则（原则一）保持一致。两项
复查均维持"通过"结论。

**`/speckit-analyze` 复查（第二轮）**：交叉检查 spec.md/plan.md/research.md/data-model.md/
contracts/tasks.md 后发现并修复了 2 个 CRITICAL、3 个 HIGH、2 个 MEDIUM、2 个 LOW 问题，
其中最实质性的两项：

- **C2**（架构自相矛盾）：广播已读/隐藏状态原方案完全依赖 Redis，与本文档 §3/§4 论证过的
  "持久化依据不应托管在易失缓存层"原则相矛盾。修复为新增 `MessageBroadcastState` 表
  持久化该状态，Redis 降级为纯缓存层（详见 `research.md` §13）。
- **C1**（Constitution 原则三对齐）：原 tasks.md 把接口文档更新（`docs/API接口文档.md`）
  集中放在 Polish 阶段，与"增量交付"策略（每个用户故事可能独立成 PR）下"同一 PR 内更新
  接口文档"的 MUST 要求相冲突。修复为把文档更新拆分到每个用户故事阶段末尾。
  其余 H1（审计日志调用点遗漏）、H2（未读计数缓存失效步骤遗漏）、H3（spec.md"点赞"措辞与
  research.md §2 的"评分"决策不同步）、M1（`type` 白名单防御性校验缺实现任务）、M2（"关联资源
  已删除"边界情况缺验收步骤）、L1/L2（文档间的方法清单/字段遗漏）均已在对应文档中修复。
  详细清单见 `/speckit-analyze` 报告；修复后的 Constitution 检查表（见上）已同步更新，结论
  仍为"无违规项"。

## 项目结构

### 文档（本功能）

```text
specs/003-message-system/
├── plan.md              # 本文件（/speckit-plan 命令输出）
├── research.md          # Phase 0 输出（/speckit-plan 命令）
├── data-model.md         # Phase 1 输出（/speckit-plan 命令）
├── quickstart.md         # Phase 1 输出（/speckit-plan 命令）
├── contracts/            # Phase 1 输出（/speckit-plan 命令）
└── tasks.md              # Phase 2 输出（/speckit-tasks 命令 —— 不由 /speckit-plan 创建）
```

### 源代码（仓库根目录）

```text
packages/common/
└── src/
    ├── message/
    │   └── message.interface.ts                # 新增：MessageType 枚举、Message 相关请求/响应接口
    │                                            #        （被 q-server/frontend/q-editor 三方共用，
    │                                            #        对齐 track.interface.ts 的既有组织方式）
    └── index.ts                                 # 修改：新增 export * from "./message/message.interface.js"

app/q-server/
├── prisma/
│   └── schema.prisma                          # 修改：新增 Message 模型 + MessageType 枚举 +
│                                                #        MessageBroadcastState 模型（广播已读/
│                                                #        隐藏状态持久化来源，见 research.md §13）；
│                                                #        User 追加 sent_messages/received_messages/
│                                                #        message_broadcast_states 关联；
│                                                #        Survey 追加 deadline/expiring_reminder_sent_at/
│                                                #        last_milestone_notified 三个字段
├── src/
│   ├── modules/message/
│   │   ├── index.ts                            # 新增：统一导出
│   │   ├── message.routes.ts                   # 新增：用户端路由 —— GET /messages,
│   │   │                                        #        GET /messages/unread-count,
│   │   │                                        #        PUT /messages/:id/read,
│   │   │                                        #        PUT /messages/read-all,
│   │   │                                        #        DELETE /messages/:id,
│   │   │                                        #        POST /messages/send
│   │   ├── admin-message.routes.ts             # 新增：管理员端路由（挂载于 /admin 前缀）——
│   │   │                                        #        POST /messages/broadcast,
│   │   │                                        #        GET /messages/sent
│   │   ├── message.schemas.ts                  # 新增：Zod Schema（列表查询/发送/广播/内容安全校验）
│   │   ├── message.service.ts                  # 新增：MessageService —— create/list/getUnreadCount/
│   │   │                                        #        markRead/markAllRead/softDelete/sendMessage/
│   │   │                                        #        broadcast/listSent；广播相关方法内部操作
│   │   │                                        #        MessageBroadcastState（research.md §13）
│   │   ├── message-hooks.service.ts            # 新增：MessageHookService —— onReviewApproved/
│   │   │                                        #        onReviewRejected/onUserBanned/onUserUnbanned/
│   │   │                                        #        onTemplateRated/onTemplateApplied/
│   │   │                                        #        onSurveyPublished/onSurveyResponseMilestone/
│   │   │                                        #        onSurveyExpiringSoon
│   │   └── message-scheduler.ts                # 新增：每日定时任务入口 —— 消息清理 + 问卷即将
│   │                                            #        过期提醒扫描，setInterval 调度风格
│   ├── modules/review/review.service.ts        # 修改：approveReview/rejectReview 内新增
│   │                                            #        MessageHookService 调用
│   ├── modules/user/admin/admin.service.ts     # 修改：banUser/unbanUser 内新增钩子调用
│   ├── modules/template/template.service.ts    # 修改：rate（模板评分）、模板应用创建问卷的方法
│   │                                            #        内新增钩子调用
│   ├── modules/survey/survey-crud/
│   │   └── survey-crud.service.ts              # 修改：publish 内新增钩子调用；submitResponse 内
│   │                                            #        新增里程碑判断 + 钩子调用；生成问卷链接
│   │                                            #        的方法内把 deadline 一并写入 DB 字段
│   ├── utils/response.ts                       # 修改：BizCode 新增 50xx 消息模块错误码区段
│   ├── utils/cache.ts                          # 修改：CacheKeys/CacheTTL 新增消息未读计数相关键
│   ├── index.ts                                 # 修改：注册 message-scheduler 的启动挂钩
│   ├── routes/index.ts                          # 修改：注册 messageRoutes（无前缀）与
│   │                                            #        adminMessageRoutes（/admin 前缀）
│   └── spec/message/
│       ├── message.service.spec.ts              # 新增
│       ├── message-hooks.service.spec.ts        # 新增
│       └── message.routes.spec.ts               # 新增

app/frontend/
├── package.json                                 # 修改：新增 monorepo-code-common 工作区依赖
├── src/
│   ├── api/modules/message/index.ts             # 新增：本功能消费的全部用户端 + 管理员端消息接口，
│   │                                            #        请求/响应类型从 packages/common 导入
│   ├── store/modules/message.ts                 # 新增：未读计数 Pinia store（轮询 + 生命周期管理，
│   │                                            #        选型理由见 research.md §6）
│   ├── components/message/
│   │   ├── MessageBell.vue                      # 新增：铃铛图标 + 未读徽标，挂载于顶部导航
│   │   ├── MessageDrawer.vue                     # 新增：收件箱抽屉（列表/筛选/分页/已读/删除）
│   │   └── MessageItem.vue                       # 新增：单条消息行（类型图标/标题/时间/详情跳转）
│   ├── views/layout/components/header-top.vue   # 修改：在主题切换与用户下拉菜单之间嵌入 MessageBell
│   ├── views/message-center/
│   │   ├── MessageCenterLayout.vue               # 新增：仅管理员可见的消息中心布局（router-view 外壳，
│   │   │                                        #        对齐 SurveyManagementLayout.vue 的既有模式）
│   │   └── BroadcastSentView.vue                 # 新增：管理员查看已发送广播列表 + 发布新广播表单
│   ├── router/routes.ts                          # 修改：新增 /message-center 父子路由
│   │                                            #        （requiresSuperAdmin）
│   └── __tests__/ 与 components/message/__tests__/  # 新增：对齐既有测试模式

app/q-editor/
├── src/
│   ├── api/modules/message/index.ts             # 新增：与 frontend 侧共用 packages/common 类型的
│   │                                            #        用户端消息接口
│   ├── stores/useMessage.ts                      # 新增：对应的 Pinia store
│   ├── components/Common/
│   │   ├── MessageBell.vue                       # 新增：Element Plus 风格，对齐既有 ReviewNotice.vue
│   │   └── header-nav.vue                        # 修改：在既有 <ReviewNotice /> 旁新增 <MessageBell />
│   └── __tests__/ 下新增对应测试
```

**结构决策**：后端新增一个独立的 `message` 模块（路由 + Schema + Service + 钩子 Service + 调度
入口），职责边界清晰——`MessageHookService` 是唯一被其他模块调用的入口，其他模块只新增"调用一行
钩子方法"这一处改动，不反向依赖消息模块的内部实现。两个前端各自新增结构一致但技术栈相符的一套
消息 UI（组件命名一致，内部用各自的 UI 库实现），复用既有的 `serverClient`/Pinia/测试基础设施，
不新增跨应用的共享状态机制。`frontend` 侧额外新增的"消息中心"管理页面沿用 `survey-management`
既有的父子路由 + `router-view` 外壳模式。

## 复杂度追踪

> **仅当 Constitution 检查存在必须说明理由的违规项时才填写**

无——上方 Constitution 检查未记录任何违规项。
