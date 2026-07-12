# Phase 0 调研：问卷系统消息互动功能

本文件记录 `/speckit-plan` 阶段对项目现有代码的调研结论，解决 `plan.md` 技术上下文中隐含的
不确定点。每一节遵循"决策 / 理由 / 已考虑的替代方案"的格式。

## §1 系统通知钩子的真实触发点

**决策**：`MessageHookService` 的每个 `on*` 方法都挂接到项目中**真实存在**的既有 service 方法
内部，具体对应关系：

| 消息场景（源自参考文档 §1.1） | 钩子方法                                | 真实挂接点                                                                                                                                                                                |
| ----------------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 审核通过                      | `onReviewApproved`                      | `ReviewService.approveReview()`（`review.service.ts:306`），在既有 `createAuditLog(...approve_review...)` 调用（约第 400 行）之后追加                                                     |
| 审核驳回                      | `onReviewRejected`                      | `ReviewService.rejectReview()`（`review.service.ts:432`），在既有 `createAuditLog(...reject_review...)` 调用（约第 476 行）之后追加                                                       |
| 用户封禁                      | `onUserBanned`                          | `AdminService.banUser()`（`admin.service.ts:340`），在既有 `createAuditLog(...ban_user...)` 调用（约第 386 行）之后追加                                                                   |
| 用户解封                      | `onUserUnbanned`                        | `AdminService.unbanUser()`（`admin.service.ts:402`），在既有 `createAuditLog(...unban_user...)` 调用（约第 434 行）之后追加                                                               |
| 问卷发布成功                  | `onSurveyPublished`                     | `SurveyCrudService.publish()`（`survey-crud.service.ts:486`）                                                                                                                             |
| 答卷达到里程碑（50/100/500）  | `onSurveyResponseMilestone`             | `SurveyCrudService.submitResponse()`（`survey-crud.service.ts:929`），在既有 `responses_count: { increment: 1 }`（约第 1021 行）事务提交后，比较新计数与 `Survey.last_milestone_notified` |
| 模板互动（评分/被应用）       | `onTemplateRated` / `onTemplateApplied` | 见 §2                                                                                                                                                                                     |

**理由**：所有钩子调用都新增在既有方法**已经产生业务副作用之后**的位置（与既有 `createAuditLog`
fire-and-forget 调用并列），不改变这些方法原有的返回值/异常行为；钩子失败不阻塞主业务流程
（与 `createAuditLog` 的失败降级哲学一致）。

**已考虑的替代方案**：引入一个全局事件总线（EventEmitter/领域事件），让业务方法只 `emit`
一个事件，消息模块单独订阅。放弃理由——项目当前没有这类事件总线的先例，引入它属于一次新的
架构决策，超出本功能的必要范围；直接函数调用更符合项目现有"service 之间直接调用工具函数"的
既有风格（如 `createAuditLog`、`createCache`），复杂度更低、可读性更直接。

## §2 "模板点赞"与项目现状的差距

**决策**：参考文档 §1.1 中"模板互动（`template_like`）"场景写的是"模板被点赞、模板被应用"，
但读取 `app/q-server/src/modules/template/` 后确认：**项目当前没有"点赞"功能**。`Template`
模型上只有两个真实存在的互动信号：

1. `TemplateRating`（评分表，1-5 分，`template.service.ts` 的 `rate()` 方法，约第 286 行）——
   不允许作者给自己的模板评分。
2. `download_count` 字段自增（`template.service.ts` 约第 250 行，发生在"使用模板创建问卷"的
   事务内，紧邻既有 `createAuditLog(...use_template...)` 调用之后）。

因此 `template_like` 这个消息类型的两个触发场景改为对齐到这两个**真实存在**的事件：模板收到
新评分（`onTemplateRated`）、模板被应用于创建问卷（`onTemplateApplied`）。消息标题/文案会
如实反映"评分"与"被应用"，不会展示一个不存在的"点赞"字样。

**理由**：摘要与 Constitution 检查中反复强调的框定是"钩子调用点必须是真实存在的既有代码路径"。
虚构一个不存在的点赞事件（例如凭空在没有触发来源的情况下生成消息）既无法通过任何验收场景
测试，也会让 `MessageHookService` 里出现一个永远不会被调用的死代码方法。

**已考虑的替代方案**：新增一个真正的"点赞"功能（点赞表 + 点赞按钮 + API）。放弃理由——这是
一个独立的、参考文档未详细定义验收标准的新功能，会显著扩大本功能的范围（需要新的数据模型、
新的前端交互、新的防刷设计），且 spec.md 的用户故事/成功标准均未提及"点赞"本身作为一个业务
目标，只是把它当作触发"模板互动通知"的一种场景描述；用真实存在的"评分"事件替代，同样能满足
"模板作者能收到互动反馈通知"这一验收意图（spec.md 用户故事 1）。

## §3 "问卷即将过期提醒"缺少持久化依据

**决策**：`Survey` 模型新增两个字段：

```prisma
deadline                  DateTime?  // 问卷截止时间（此前只存在于 Redis TTL 中）
expiring_reminder_sent_at DateTime?  // 已发送"即将过期"提醒的时间，避免同一问卷重复提醒
```

`deadline` 的写入时机对齐既有生成问卷链接的方法（`survey-crud.service.ts` 约第 731-803 行，
该方法此前只把截止时间写入 Redis 的 `survey:deadline:{surveyId}` 键，本功能新增在同一方法内
把 `deadline` 一并写入数据库列，不改变该方法原有的 Redis 逻辑）。每日定时任务扫描
`WHERE deadline BETWEEN now() AND now()+7d AND expiring_reminder_sent_at IS NULL AND status =
1 AND deleted_at IS NULL` 的问卷，逐条触发 `onSurveyExpiringSoon` 并回写
`expiring_reminder_sent_at`。

**理由**：读取 `survey-crud.service.ts` 确认问卷截止时间当前**只存在于 Redis 的 TTL 键值中**，
`Survey` 表没有对应的数据库列，因此无法直接写一条 SQL 查出"7 天内到期的问卷"。若不落库，只能
每天 `SCAN survey:deadline:*` 遍历 Redis 全部键并逐一反序列化判断——这既低效，也违反项目
Constitution 原则一"`q-server` 是持久化与跨切面业务逻辑的唯一可信来源"的精神（把一个业务规则
的判断依据完全托管在一个本质上是缓存层、可能因驱逐/重启丢失的存储上）。新增两个可加式字段是
成本最低、最贴合既有模型的做法，且不改变 Redis 侧原有的问卷访问期截止校验逻辑（`checkDeadline`
之类的现有方法完全不受影响）。

**已考虑的替代方案**：
(a) 完全依赖 Redis `SCAN` 遍历——放弃，理由如上（不可靠 + 效率差 + 违反持久化原则）。
(b) 引入一个独立的"提醒任务"表记录已发送状态——放弃，一个字段已经足够表达"是否已提醒"这个
单一布尔语义，没有必要为此新增一张表。

## §4 "答卷里程碑"通知的幂等去重

**决策**：`Survey` 模型新增：

```prisma
last_milestone_notified  Int  @default(0)  // 已通知过的最高里程碑阈值（0/50/100/500）
```

在 `submitResponse()` 既有的 `responses_count: { increment: 1 }` 事务提交后，读取更新后的
`responses_count`，与预定义的里程碑数组 `[50, 100, 500]` 比较：若跨过了某个尚未通知过的阈值
（`threshold > survey.last_milestone_notified`），触发 `onSurveyResponseMilestone` 并把
`last_milestone_notified` 更新为该阈值。

**理由**：`responses_count` 字段本身已经存在（既有的答卷数缓存列），是事件驱动、天然精确的
判断依据，不需要额外的定时扫描；但如果不记录"上次通知到哪个阈值"，同一问卷在阈值之上的每一次
新答卷提交都会重复触发同一条"已达 50 份"的通知。新增单个整数字段即可完整表达这个幂等语义，
且判断逻辑内嵌在既有的答卷提交事务路径中，不新增任何定时任务。

**已考虑的替代方案**：用 Redis `SET`（如 `msg:milestone_notified:{surveyId}:{threshold}`）记录
已通知的阈值——放弃，理由与 §3 相同（业务判断依据不应完全托管在缓存层），且需要三次独立的
Redis 键（对应三个阈值）才能表达同一语义，比一个数据库整数列更复杂。

## §5 内容安全处理——项目当前无同类先例，需新建

**决策**：`message.schemas.ts` 中的 `messageContentSchema` 做长度限制（1-2000 字符，对齐参考
文档 §4.2.6/§10.1）；`message.service.ts` 在写入前对内容做三项新增处理：
(1) 简单 HTML 标签正则剔除（`<[^>]*>`），因为前端展示层已经用 `{{ }}`/`v-text` 做 Vue 自动
转义（既有惯例，`v-html` 未在任何既有消息展示计划中使用），后端的标签剔除是纵深防御的第二层；
(2) 手机号（11 位中国大陆号码正则）、邮箱、18 位身份证号的正则匹配替换为 `***`；
(3) 不引入第三方敏感词库，敏感词校验范围收窄为上述可枚举的个人信息模式，不做泛化的"敏感词
过滤"（参考文档 §10.1 提到的敏感词过滤在缺少明确词库来源的情况下无法可靠实现，且不是
spec.md 任何验收场景的强制要求——spec.md 边界情况一节把"敏感个人信息"列为必须处理项，但未把
"泛化敏感词"列为验收标准）。

**理由**：调研确认 `app/q-server` 目前**没有**任何 HTML 转义、敏感词过滤、个人信息脱敏（脱敏
先例只在日志层面存在——`src/utils/logger.ts` 对 `password`/`token`/`email` 字段做的是**日志
输出脱敏**，不是**用户可见内容脱敏**，场景不同，不能直接复用其正则）。因此这部分必须新建，
但刻意控制在 spec.md 明确要求的范围内（长度限制 + 脚本标签 + 手机号/邮箱/身份证号），不引入
没有明确来源、需要长期维护的第三方敏感词库依赖，符合 Constitution 原则七"不引入没有必要的
新依赖"的精神,也符合 spec.md 的假设"消息内容为纯文本展示"。

**已考虑的替代方案**：引入 `npm` 敏感词库（如某些开源敏感词过滤包）——放弃，理由如上（新增
依赖、词库来源与维护责任不明确、不是本功能验收标准的强制要求）。

## §6 前端未读计数状态管理：Pinia Store 而非 Composable

**决策**：`frontend`/`q-editor` 两侧均新建 Pinia store（`store/modules/message.ts` /
`stores/useMessage.ts`）管理未读计数轮询，而不是像 `useAnalyticsFilters.ts` 那样用模块级单例
`reactive` 的 composable。

**理由**：`useAnalyticsFilters.ts` 管理的是纯粹的、无持久化需求的筛选条件（时间范围/应用/
环境），生命周期完全绑定在"仪表盘页面打开期间"。未读计数不同——它需要在用户离开消息相关页面
（甚至整个应用范围内，只要顶部导航栏挂载着）持续轮询，且两个应用都已有成熟的 Pinia store
基础设施（`store/modules/user.ts` / `stores/useUser.ts`）承担类似"全局、跨路由存在"的状态。
用 Pinia store 也更符合项目里已有的、职责相近的状态（用户登录态）的组织方式，测试时也能直接
复用现有 store 测试的 mock 模式。

**已考虑的替代方案**：延续 `useAnalyticsFilters.ts` 的模块级单例 composable 模式——技术上
可行（两种方式都能做到跨组件共享同一份 reactive 状态），但考虑到未读计数的生命周期跨越整个
应用会话（不像筛选条件那样局限于单个页面），选择与既有全局状态（用户 store）风格更一致的
Pinia store，便于后续如果需要接入持久化（如"上次查看到第几条广播"的版本号，参考文档 §6.3）
时直接使用 Pinia 的 persist 插件（`frontend`/`q-editor` 均已配置该插件用于用户 store）。

## §7 两个前端各自独立轮询，不使用 qiankun globalState

**决策**：`frontend`（qiankun 主应用）与 `q-editor`（qiankun 子应用）的消息铃铛各自独立调用
未读计数接口、各自独立维护 Pinia store 实例，互不通信。

**理由**：检索项目代码确认当前完全没有使用 qiankun 的 `initGlobalState`/`globalState`
机制——`main-app` 的子应用注册（`main.ts`）只通过 `props` 注入 `routerBase`，没有全局状态
下发。两个应用的 Pinia 实例本就在各自 `mount` 生命周期中独立创建（沙箱隔离），这是项目当前
刻意选择的隔离风格。引入 globalState 是一次跨越 Constitution 原则八（微前端集成纪律）的新
架构决策，不应该为了消息未读数这一个次要功能引入主应用与子应用之间此前不存在的强耦合。

**已考虑的替代方案**：主应用统一轮询，通过 `props` 或 `globalState` 下发给子应用——放弃，
理由如上；另外两个应用的用户角色/使用场景本身也不完全相同（管理后台 vs 编辑器），各自独立
轮询也更贴合"不同应用可能需要看到不同范围的消息"这一潜在差异（尽管当前 spec.md 未要求区分
应用范围的消息可见性）。

## §8 消息相关类型提取到 `packages/common`

**决策**：`MessageType` 枚举与消息列表/未读计数/发送/广播等接口的请求/响应类型定义在
`packages/common/src/message/message.interface.ts`，供 `q-server`、`frontend`、`q-editor`
三方共同导入，组织方式对齐既有的 `track.interface.ts`。`frontend` 需要新增
`monorepo-code-common` 工作区依赖（`q-editor` 与 `q-server` 均已具备该依赖）。

**理由**：`002-tracking-analytics-dashboard` 功能曾刻意选择"就近声明本地类型、不新增工作区
依赖"，但那是因为分析类型**只有一个前端消费方**（`frontend`），不满足 Constitution 原则一
"两个以上包共用的类型必须提取到 `packages/common`"的 MUST 门槛。本功能的消息类型会被
`frontend` 与 `q-editor` **两个前端同时消费**（且后端 `q-server` 本身也需要这些类型），
三方共用，触发该 MUST 规则，因此不能重复上一个功能"仅单一消费方"场景下的例外处理，必须提取。

**已考虑的替代方案**：在 `frontend` 和 `q-editor` 中分别复制粘贴一份结构相同的本地类型
声明——放弃，这正是 Constitution 原则一明确禁止的"两个以上包共用的类型被复制而非提取"的
反面案例，会导致两份定义随时间推移悄悄漂移不一致。

## §9 定时任务调度机制：复用既有 `setInterval` 风格，不引入 `node-cron`

**决策**：新增 `src/modules/message/message-scheduler.ts`，在 `q-server` 主进程的 `onReady`
钩子中启动，内部用"计算下一次目标时刻（每日 03:00）的毫秒差 → `setTimeout` 触发 →
之后用 24 小时的 `setInterval` 循环"的方式实现每日定时执行，串行执行"消息清理"与"问卷即将
过期提醒扫描"两个任务。

**理由**：检索 `package.json` 确认项目当前**没有** `node-cron` 或类似的调度库依赖。参考文档
本身在 §7.2 也把方案表述为"node-cron 内置于 q-server 进程...**或**在 q-server 中注册 Fastify
setInterval"，本身就把后者列为等价可选项。项目现有的周期性任务（`tracking-consumer.ts` 的
批量刷新、队列堆积检查）都是用原生 `setInterval` 实现的，延续这一风格不新增任何依赖，符合
Constitution 原则七对新依赖的谨慎态度，也让新任务与既有任务在实现风格上保持一致，降低维护
时的认知负担。

**已考虑的替代方案**：引入 `node-cron` 依赖，用标准 cron 表达式声明调度时刻——技术上更直观、
更易读，但引入一个新的第三方依赖去做一件原生 `setInterval` + 一次性时间差计算就能完成的事情，
在"不新增不必要依赖"与"复用既有实现风格"之间，本功能选择后者；如果未来消息清理之外还有更多
需要精细 cron 表达式（如每周/每月）的调度需求，届时再评估引入 `node-cron` 更合适。

## §10 频率限制阈值与错误码

**决策**：直接采用参考文档 §4.2.6/§4.2.7/§5.3 给出的具体阈值——用户发送咨询消息
10 次/分钟/用户，管理员广播 3 次/天/管理员，消息列表查询 60 次/分钟/IP，未读计数查询
30 次/分钟/用户；均通过既有 `checkRateLimit(fastify, userId, {prefix, max, ttl})` 工具实现
（发送/广播两个按用户维度限流的接口）,列表/未读计数两个高频只读接口沿用既有 `@fastify/
rate-limit` 插件的路由级 `config.rateLimit`（与 `review.routes.ts` 的既有用法一致）。

新增业务错误码在 `response.ts` 的 `BizCode` 枚举中以 `50xx` 区段追加（此前最大区段为
AI 模块的 `40xx`）：`MESSAGE_NOT_FOUND = 5001`、`CANNOT_MESSAGE_SELF = 5002`（用户尝试给自己
发消息，或普通用户尝试私信另一普通用户时统一复用该码）、`BROADCAST_RATE_LIMITED = 5003`、
`SYSTEM_MESSAGE_TYPE_FORBIDDEN = 5004`（HTTP 层尝试直接创建系统通知类型时返回）。

**理由**：参考文档已经给出了经过内部论证、具体到数值的方案，直接采纳为合理默认值（与
spec.md"假设"章节的整体处理原则一致），不需要重新设计；`checkRateLimit`/`@fastify/
rate-limit` 两个工具在项目中分别承担"按用户维度"与"按路由/IP 维度"的限流场景，选用哪个
完全取决于该接口原有的既有限流范式（写操作用前者，读操作用后者），与 `review`/`ai-generate`
等既有模块的选择保持一致。

## §11 广播目标范围（`target_role`）的查询实现

**决策**：广播消息仍然只写一条 `recipient_id = NULL` 的记录（对齐参考文档 §4.2.7 的"单条记录，
全员可见"设计），但增加一个 `target_role` 字段（`String?`，取值 `"all"`/`"user"`/
`"super_admin"`，默认 `"all"`）。用户查询收件箱时的过滤条件从"简单的 `recipient_id = $myId
OR recipient_id IS NULL`"细化为"`recipient_id = $myId OR (recipient_id IS NULL AND
(target_role = 'all' OR target_role = $myRole))`"，以支持 spec.md 用户故事 3 验收场景 2
（"仅面向某一角色的广播"）。

**理由**：参考文档 §4.2.7 的请求体已经包含 `target_role` 参数，但查询逻辑段落只描述了
"全员可见"这一种情况，没有覆盖"仅面向某一角色"的过滤实现；spec.md 在此基础上明确把"分角色
广播"写成了独立的验收场景（用户故事 3 验收场景 2），因此本功能在实现层面补齐这一细节，
用一个额外字段 + 查询条件扩展即可满足，不改变"单条记录、不逐条写入"这一核心设计。

## §12 Message 数据模型沿用参考文档原始设计

**决策**：`Message` 模型字段严格沿用参考文档 §3.1 给出的设计（`is_read: Boolean` +
`read_at: DateTime?` + `deleted_at: DateTime?` 三态独立字段），不采用调研过程中作为对比方案
出现的"单一 `status` 枚举（`unread`/`read`/`deleted`）"设计。

**理由**：参考文档的三字段设计允许"已读"与"（软）删除"两个维度独立变化并互不冲突（例如一条
已删除的消息在删除前的已读状态仍应被保留用于审计追溯），且与项目里 `Survey`/`Review` 等既有
模型"用独立的 `xxx_at` 时间戳字段表达状态转换时间点"的惯例完全一致（如 `Survey.published_at`/
`closed_at`/`deleted_at`）。单一枚举字段会丢失"已读"与"删除"两个事件各自的发生时间，且与项目
既有建模风格不符。

## §13 广播已读/隐藏状态改为持久化到 PostgreSQL（`/speckit-analyze` 发现并修复的 C2 问题）

**背景**：`/speckit-analyze` 交叉检查 research.md/data-model.md/contracts.md 时发现一处
自相矛盾——本文档 §3（问卷即将过期提醒）与 §4（答卷里程碑）都明确论证过"业务判断依据不应
完全托管在 Redis 这一易失缓存层"，并因此把 `Survey.deadline`/`last_milestone_notified`
落到了 PostgreSQL；但当时 data-model.md/contracts.md 给广播消息设计的"已读版本号"
（`msg:broadcast:read_version:{userId}`）与"隐藏集合"（`msg:broadcast:hidden:{userId}`）
却只存在 Redis 里，没有任何数据库兜底——一旦 Redis 因驱逐策略或重启丢失这些 key，会导致
用户已读的广播"复活"为未读、已删除（隐藏）的广播重新出现在收件箱，直接违反 SC-004（未读
计数 100% 一致）与 SC-007，且与本文档自己刚论证过的原则相矛盾。

**决策**：新增 `MessageBroadcastState(message_id, user_id, is_read, is_hidden, ...)` 表
（见 `data-model.md` §3），作为广播已读/隐藏状态的**唯一持久化来源**；Redis 的
`msg:unread:{userId}` 缓存键改为只缓存"未读计数"这一**派生计算结果**（Cache-Aside，
TTL 60 秒），不再是状态本身的存储——即使 Redis 被完全清空，重新查询 PostgreSQL 也能得到
正确的已读/隐藏状态与未读计数，不存在"复活"风险。

**理由**：这一状态本质上和 `Survey.deadline`/`last_milestone_notified` 是同一类问题
（"用户对某条记录的持久业务状态"），理应采用与 §3/§4 一致的处理方式，保持整份 research.md
论证逻辑的自洽，也符合 Constitution 原则一"`q-server` 是持久化与跨切面业务逻辑的唯一可信
来源"。

**是否会重新引入"广播写入放大"问题**：不会。原方案要避免的是"广播发出的那一刻，为每个用户
各写一条 `Message`"（500 用户 × 1 广播 = 500 次 INSERT，发生在写路径、且不可延迟）。
`MessageBroadcastState` 是**惰性**写入——只有当某个用户真正点击"已读"或"删除"某条广播时，
才会为"这一个用户、这一条广播"upsert 一行状态；在广播刚发出、绝大多数用户还未查看的时刻，
这张表里不会有任何新增行。因此广播创建路径依然只有 1 次 `Message` INSERT，没有重新引入
写入放大问题。

**已考虑的替代方案**：
(a) 继续沿用纯 Redis 方案，但补充定时任务把 Redis 状态定期回写 PostgreSQL 做"最终持久化"
——放弃，这是给一个本可以直接持久化的简单状态引入了不必要的双写一致性问题（Redis 与
PostgreSQL 之间可能出现窗口期不一致），复杂度反而更高。
(b) 广播发出时就为 `target_role` 范围内的每个用户各写一行 `MessageBroadcastState`
（`is_read=false, is_hidden=false` 的初始状态）——放弃，这等价于退回"逐用户写入"的写入
放大问题（只是从 `Message` 表转移到了新表），完全违背本功能一开始就要规避的性能约束。

## §14 消息发送/广播的审计日志调用点（`/speckit-analyze` 发现并修复的 H1 问题）

**决策**：`MessageService.sendMessage()` 与 `broadcast()` 两个方法在写入成功后，分别调用
`createAuditLog(fastify, senderId, "send_message", "message", messageId, {...})` 与
`createAuditLog(fastify, adminId, "broadcast_message", "message", messageId, {...})`
（对齐 `contracts/message-endpoints.md` 的更新）。`MessageHookService` 的 9 个钩子方法
（系统通知）不额外重复审计——因为触发它们的业务动作本身已经在源头被审计（如
`approveReview` 已经调用 `createAuditLog(..., "approve_review", ...)`），消息只是这个已被
审计动作的一个副作用展示渠道，重复记录没有增量价值。

**理由**：FR-014 要求"记录消息发送、广播发布等关键操作的审计信息"，字面上指向的是用户/
管理员主动发起的写操作（发送咨询、发布广播），而不是系统内部自动生成通知这一展示行为本身；
plan.md 的 Constitution 检查（原则六）也已经承诺了这一点，本节只是把这一承诺落实到具体的
调用点，此前在 tasks.md 中遗漏了对应的任务描述，已在任务列表中补上。
