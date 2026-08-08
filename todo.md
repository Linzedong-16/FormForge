# 后端系统优化清单

> 基于 [index.md](index.md) 功能清单 + 全量代码审查，按优先级排列。  
> 生成日期：2026-08-08

---

## P0 — 严重问题（影响性能正确性或数据安全）

### 1. 统计模块 N+1 查询

- **文件**：[survey-stats.service.ts](app/q-server/src/modules/survey/survey-stats/survey-stats.service.ts#L176-L224)
- **问题**：`getSurveyStats()` 对每道题逐一执行 `answer.count()` + 题型聚合查询，30 道题的问卷产生约 60 次独立 SQL。
- **方案**：先一条 SQL 按 `component_id` GROUP BY 拿所有题目的答案计数；再按题型分类，每种题型一条批量聚合 SQL。

### 2. `getSurveyStats` 静默丢弃查询结果（Bug）

- **文件**：[survey-stats.service.ts](app/q-server/src/modules/survey/survey-stats/survey-stats.service.ts#L153-L168)
- **问题**：`Promise.all` 传了 4 个 Promise 但只解构了 3 个变量，第 4 个查询（全量组件）的结果被丢弃，白白浪费一次 DB 查询。
- **方案**：移除无效查询，或补全解构变量并在后续逻辑中使用。

### 3. JWT Secret 生产环境弱密钥硬编码

- **文件**：[auth.service.ts](app/q-server/src/modules/user/auth/auth.service.ts#L93)
- **问题**：`process.env.JWT_SECRET ?? "dev-secret-change-in-production"` — 生产环境忘设环境变量时静默使用弱密钥。
- **方案**：启动时若 `NODE_ENV === 'production'` 且 `JWT_SECRET === 'dev-secret-change-in-production'`，直接 `throw` 拒绝启动。

### 4. `refreshToken` 崩溃可致用户永久锁定

- **文件**：[auth.service.ts](app/q-server/src/modules/user/auth/auth.service.ts)（`refreshToken` 方法）
- **问题**：旧 Token 加入黑名单（Redis 写）和新 Token 生成之间无事务。若进程在两步之间崩溃，用户旧 Token 已失效、新 Token 未生成，账号锁定直到旧黑名单 TTL 过期。
- **方案**：先生成新 Token，再黑名单旧 Token；或使用 Redis Pipeline/MULTI 原子化两步操作。

---

## P1 — 高优先级（影响可靠性/内存安全）

### 5. CSV 导出无流式处理，大数据集 OOM

- **文件**：[survey-stats.service.ts](app/q-server/src/modules/survey/survey-stats/survey-stats.service.ts#L465-L551)
- **问题**：`exportResponsesCSV()` 一次性加载全部答卷+答案到内存构建 CSV 字符串，10 万份答卷会撑爆内存。
- **方案**：使用 `reply.raw` + `stream.Readable` 流式输出，数据库端用 cursor 分批读取。

### 6. RabbitMQ 无自动重连

- **文件**：[rabbitmq.ts](app/q-server/src/plugins/rabbitmq.ts)
- **问题**：amqplib 不自动重连。RabbitMQ 重启后连接变为 stale，日志投递和埋点消息静默失败直到服务重启。没有监听 `connection.on("error")` / `connection.on("close")`。
- **方案**：添加 `connection.on("close")` 事件监听 + 重连逻辑（指数退避）；或使用 `amqp-connection-manager` 包装。

### 7. Redis 离线队列与注释矛盾，有内存风险

- **文件**：[redis.ts](app/q-server/src/plugins/redis.ts#L58-L59)
- **问题**：注释写"不启用离线队列（Redis 不可用时命令直接失败，不排队）"，代码却是 `enableOfflineQueue: true`。Redis 长时间不可用时命令堆积内存。
- **方案**：改为 `enableOfflineQueue: false`，与项目中其他"Redis 不可用降级放行"策略一致。

### 8. 答卷删除后统计缓存未失效

- **文件**：[survey-crud.service.ts](app/q-server/src/modules/survey/survey-crud/survey-crud.service.ts#L915-L940)
- **问题**：`deleteResponse()` 只清了 `responseDetail` 缓存，没失效 `statsBySurvey` / `statsOverview`。与 `submitResponse()` 不对称。
- **方案**：在 `deleteResponse()` 末尾补 `this.cache.del(CacheKeys.statsOverview)` + `this.cache.del(CacheKeys.statsBySurvey(...))`。

### 9. `sendCode` 在 AMQP 不可用时静默跳过

- **文件**：[auth.service.ts](app/q-server/src/modules/user/auth/auth.service.ts)（`sendCode` 方法）
- **问题**：`fastify.amqp` 为 falsy 时跳过邮件发送，但验证码已存 Redis，用户收到"发送成功"响应却永远收不到邮件，无任何日志警告。
- **方案**：至少加一条 `fastify.log.warn` 提示邮件未发送；或返回错误告知用户邮件服务不可用。

---

## P2 — 中优先级（影响正确性/性能/安全深度）

### 10. 数据库缺失索引（6 处）

- **文件**：[schema.prisma](app/q-server/prisma/schema.prisma)

| 表                  | 缺失索引                      | 理由                                    |
| ------------------- | ----------------------------- | --------------------------------------- |
| `Response`          | `[survey_id, status]`         | 查询某问卷已提交/未提交答卷（高频操作） |
| `Answer`            | `[response_id, component_id]` | 按答卷+组件联合查询答案                 |
| `KnowledgeChunk`    | `[document_id, chunk_index]`  | 按文档分页加载片段                      |
| `TemplateEmbedding` | `[template_id, chunk_type]`   | RAG 检索按模板+片段类型过滤             |
| `Survey`            | `[deadline]`                  | 消息调度器定时扫描"即将过期"问卷        |
| `Survey`            | `[access_code]`               | 公开问卷密码验证查询                    |

### 11. 数据库冗余索引（6 处）

- **文件**：[schema.prisma](app/q-server/prisma/schema.prisma)
- **问题**：
  - `User.email`、`ApiToken.token`、`SystemConfig.key` 已有 `@unique` 自动唯一索引，额外 `@@index` 冗余
  - `SurveyPermission.survey_id` 和 `UserRole.user_id` 被复合主键最左前缀覆盖
  - `UserProfile.user_id` 已有 `@unique`，额外 `@@index` 冗余
- **方案**：删除 6 行冗余 `@@index` 声明。

### 12. RAG 检索向量+关键词应并行执行

- **文件**：[retriever.service.ts](app/q-server/src/modules/ai/ai-rag/retriever.service.ts)（`hybridSearch` 方法）
- **问题**：向量检索和关键词检索串行执行，总延迟 = `T_vector + T_keyword`。
- **方案**：`Promise.allSettled` 并行执行，延迟降为 `max(T_vector, T_keyword)`，也更契合降级设计意图。

### 13. 多方法存在 TOCTOU 竞态窗口

- **文件**：[survey-crud.service.ts](app/q-server/src/modules/survey/survey-crud/survey-crud.service.ts)
- **受影响方法**：`submitReview`（L638）、`applyTemplate`（L711）、`submitResponse`（L1043）、`deleteResponse`（L916）
- **问题**：所有权/状态校验在 Prisma 事务外部执行，与事务内写入之间有竞态窗口。
- **方案**：将校验逻辑移入事务内部（事务内重新查询并校验）。

### 14. 限流 IP 伪造风险

- **文件**：[rate-limit.ts](app/q-server/src/plugins/rate-limit.ts)（`keyGenerator`）
- **问题**：直接信任 `x-forwarded-for` / `x-real-ip` 头，恶意客户端可伪造 IP 绕限流或嫁祸他人。
- **方案**：仅信任 `x-real-ip`（由可信反向代理如 Nginx/Caddy 设置），或配置 `trustProxy`，从最右端取第一个非内网 IP。

### 15. MinIO bucket 默认 public-read

- **文件**：[minio.ts](app/q-server/src/plugins/minio.ts)（`ensureBucket` 函数）
- **问题**：无条件设置 bucket policy 为 public-read，所有上传文件可被公开访问。
- **方案**：默认 private + 使用预签名 URL 控制访问；或提供配置项由用户选择 bucket 公开性。

### 16. MongoDB 缺少 error 事件监听

- **文件**：[mongo.ts](app/q-server/src/plugins/mongo.ts)
- **问题**：`mongoose.connection` 未监听 `error` 事件。运行时连接错误会导致未处理异常，可能崩溃进程。
- **方案**：添加 `mongoose.connection.on("error", handler)`。

### 17. ClickHouse `safeQuery` 实现缺陷

- **文件**：[clickhouse.ts](app/q-server/src/plugins/clickhouse.ts)（`safeQuery` 方法）
- **问题**：
  - 正则 `/LIMIT\s+\d+/i` 无法检测子查询中的 LIMIT、`LIMIT ALL`
  - 无条件追加 `SETTINGS max_execution_time`，与已有 SETTINGS 子句冲突导致 SQL 语法错误
- **方案**：改用 SQL 解析库或移除自动追加逻辑，由调用方保证安全限制。

### 18. 日志脱敏仅浅层克隆

- **文件**：[error-handler.ts](app/q-server/src/plugins/error-handler.ts)（`sanitizeForLog` 函数）
- **问题**：`{ ...obj }` 浅拷贝，嵌套对象中的敏感字段（如 `body.password`）未被脱敏。
- **方案**：改为递归深拷贝脱敏。

---

## P3 — 低优先级（代码质量/运维改善）

### 19. 统计 `listResponses` 关键字搜索分页计数不准

- **文件**：[survey-stats.service.ts](app/q-server/src/modules/survey/survey-stats/survey-stats.service.ts#L432-L444)
- **问题**：关键字搜索落到应用层过滤时，`filteredTotal = filteredResponses.length`（当前页结果数当 total），分页组件显示错误总页数。
- **方案**：使用 PostgreSQL `ILIKE` 在数据库层完成搜索过滤 + COUNT；或先查全部符合条件的 response_id 再分页。

### 20. `TemplateComponent` 缺少 `client_key` 和 `logic` 字段

- **文件**：[schema.prisma](app/q-server/prisma/schema.prisma)（TemplateComponent 模型）
- **问题**：`SurveyComponent` 有 `client_key`（稳定引用键）和 `logic`（动态规则配置），`TemplateComponent` 没有。从模板创建问卷时规则逻辑会丢失。
- **方案**：为 TemplateComponent 添加 `client_key` 和 `logic` 字段到 schema，同步更新相关深拷贝逻辑。

### 21. `User.role` 字段与 `UserRole` 表冗余

- **文件**：[schema.prisma](app/q-server/prisma/schema.prisma)（User 模型）
- **问题**：`User.role`（String, default "user"）与 `UserRole` 多对多表语义重叠，可能是早期设计遗留。
- **方案**：评估后统一到 `UserRole` 表，移除 `User.role` 字段，迁移历史数据。

### 22. `Review.survey_id` / `template_id` 缺少互斥约束

- **文件**：[schema.prisma](app/q-server/prisma/schema.prisma)（Review 模型）
- **问题**：注释要求二者互斥（问卷审核时 survey_id 必填，模板审核时 template_id 必填），但 schema 层无 CHECK 约束。
- **方案**：在数据库迁移中添加 CHECK 约束（PostgreSQL 支持）。

### 23. Rate Limit 响应文案 TTL 显示问题

- **文件**：[rate-limit.ts](app/q-server/src/plugins/rate-limit.ts)（`errorResponseBuilder`）
- **问题**：`Math.ceil(context.ttl / 60)` 整数除法，剩余 < 60s 时显示"0 分钟后重试"。
- **方案**：改为 `Math.max(1, Math.ceil(context.ttl / 60))`。

### 24. `error-handler` Prisma 错误检测可能误分类

- **文件**：[error-handler.ts](app/q-server/src/plugins/error-handler.ts)（`isPrismaError` 函数）
- **问题**：仅检测 `code.startsWith("P")`，非 Prisma 错误如果恰有以 P 开头的 code 字段会被误判为 Prisma 错误。
- **方案**：加上 `meta` 字段存在性检查（Prisma 错误特有），或使用 Prisma 官方 `PrismaClientKnownRequestError` 类型判断。

### 25. auth.middleware 调试标记遗留在生产代码

- **文件**：[auth.middleware.ts](app/q-server/src/modules/user/auth/auth.middleware.ts)
- **问题**：`#region debug-point` 标记和 latency 计时代码留在生产路径中。
- **方案**：移除或改为条件编译（仅开发环境启用）。

### 26. Survey CRUD 文件过长，方法职责过重

- **文件**：[survey-crud.service.ts](app/q-server/src/modules/survey/survey-crud/survey-crud.service.ts)（1225 行）
- **问题**：`submitResponse` 约 160 行承担 7 项独立职责；`publish`/`close`/`update` 有大量重复的"事务内查+验+改+读"模式。
- **方案**：拆分为独立私有方法；提取"事务内查+验+改+读"公共模板方法。

### 27. 缺少 `@fastify/compress` 响应压缩

- **文件**：[app.ts](app/q-server/src/app.ts)
- **问题**：API 响应无 gzip/brotli 压缩，JSON 载荷浪费带宽。
- **方案**：添加 `@fastify/compress` 插件注册。

### 28. 缺少 Prometheus Metrics 端点

- **问题**：有日志和埋点，但无 QPS/延迟分位数/错误率/DB 连接池使用率等服务指标暴露。
- **方案**：集成 `fastify-metrics` 或手写 `/metrics` 端点暴露 Prometheus 格式指标。

### 29. `verifyAndRegister` / `resetPassword` 验证码校验代码重复

- **文件**：[auth.service.ts](app/q-server/src/modules/user/auth/auth.service.ts)
- **问题**：约 15 行几乎相同的"从 Redis 读取并校验验证码"逻辑在两个方法中重复。
- **方案**：提取私有方法 `validateVerificationCode(email, code)`。

### 30. `retriever.service.ts` 向量拼接前缺少数值校验

- **文件**：[retriever.service.ts](app/q-server/src/modules/ai/ai-rag/retriever.service.ts)（`vectorSearch` 方法）
- **问题**：`queryVector.join(",")` 拼接 SQL 向量字面量，未校验元素是否为 `number`/非 `NaN`/非 `Infinity`。
- **方案**：拼接前检查 `queryVector.every(v => typeof v === "number" && Number.isFinite(v))`。

### 31. Prisma 连接池无 min 配置

- **文件**：[prisma.ts](app/q-server/src/plugins/prisma.ts)
- **问题**：无最小连接数，空闲后连接池排空，首请求需等待新建 TCP + 认证。
- **方案**：在 `PrismaPg` adapter 中添加 `min: 2` 配置。

### 32. `ai-rag` 插件无错误处理和清理钩子

- **文件**：[ai-rag.ts](app/q-server/src/plugins/ai-rag.ts)
- **问题**：IndexerService/RetrieverService 构造无 try/catch，失败会崩溃应用；无 `onClose` 钩子导致资源泄漏；未声明 `dependencies: ["prisma"]`。
- **方案**：添加错误处理、onClose 清理、显式依赖声明。

### 33. ClickHouse/MinIO 插件类型断言脆弱

- **文件**：[clickhouse.ts](app/q-server/src/plugins/clickhouse.ts) / [minio.ts](app/q-server/src/plugins/minio.ts)
- **问题**：使用 `as` 绕开类型检查（ClickHouse config cast、MinIO SSL port 覆盖），库升级后可能静默失败。
- **方案**：升级库版本后用实际类型替代 cast；MinIO SSL 端口优先使用 `endpointPort` 再兜底 443。

### 34. `auth.service.ts` 注释编号跳跃

- **文件**：[auth.service.ts](app/q-server/src/modules/user/auth/auth.service.ts)
- **问题**：方法内步骤编号跳跃（如从 3 跳到 5），不影响功能但降低可维护性。
- **方案**：统一修正注释编号。

### 35. `SurveyService` 按请求重复实例化

- **文件**：多个路由文件
- **问题**：`new SurveyService(fastify)` 在路由 handler 中按请求实例化，Service 本身无状态（仅持有 fastify），重复创建浪费 GC。
- **方案**：在插件中实例化并 `decorate` 到 fastify 实例上，或在模块顶层创建单例。

---

## 统计

| 优先级   | 数量   | 主要类别                                                                           |
| -------- | ------ | ---------------------------------------------------------------------------------- |
| **P0**   | 4      | 严重 Bug / 安全（N+1、结果丢弃、弱密钥、Token 锁定）                               |
| **P1**   | 5      | 可靠性 / 内存安全（CSV OOM、RabbitMQ 断连、Redis 内存、缓存一致、静默丢邮件）      |
| **P2**   | 9      | 正确性 / 性能 / 安全深度（索引、TOCTOU、IP 伪造、public bucket、MongoDB crash 等） |
| **P3**   | 17     | 代码质量 / 运维改善（重复代码、类型安全、压缩、Metrics、冗余字段等）               |
| **合计** | **35** |                                                                                    |

---

## 已验证可排除的问题

以下为初步分析中怀疑但代码审查后确认**不存在**或**已正确处理**的问题：

- ✅ **健康检查端点** — `GET /health` 已存在并完善，覆盖 PostgreSQL / Redis / RabbitMQ / MinIO / MongoDB / ClickHouse 全部 6 项依赖，含各依赖延迟测量和 `degraded` 状态汇总
- ✅ **SQL 注入** — 所有 `$queryRawUnsafe` 均使用 `$1`/`$2` 参数化占位符传递值，无字符串拼接
- ✅ **缓存击穿** — `cache.ts` 的 `getOrSet` 已有 SET NX 分布式锁 + 双检查机制
- ✅ **XSS 防护** — 消息模块有 `message-content-sanitizer.ts` 做内容安全过滤
- ✅ **审计日志 fire-and-forget** — `.catch(() => {})` 模式是刻意设计（不阻塞主响应），失败有日志
- ✅ **AI 生成 AbortSignal** — 客户端断开时正确终止 SSE 流，定时器+事件监听器在 `finally` 块中清理
