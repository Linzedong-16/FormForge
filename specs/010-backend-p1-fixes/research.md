# Research: 后端 P1 级可靠性修复

**Feature**: 010-backend-p1-fixes
**Created**: 2026-08-08

## R1: CSV 导出流式处理方案

### Decision

使用 Node.js 内置 `stream.Readable` + Fastify `reply.raw` 实现流式 CSV 导出，数据库端使用基于 `created_at` 游标的分批查询（每次 1000 条）。

### Rationale

- **零新依赖**：Node.js 内置 `stream` 模块即可满足需求，无需引入 `csv-writer`、`fast-csv` 等库。
- **Fastify 原生支持**：`reply.raw` 提供底层 Node.js `ServerResponse` 对象，可直接 pipe 流，且 Fastify 自动处理 chunked transfer encoding。
- **游标分页 vs OFFSET**：`WHERE created_at > $cursor` 比 `OFFSET ... LIMIT` 更高效——后者在大偏移量时需要扫描并丢弃前面所有行。
- **批次大小 1000**：经 P0-1 批量聚合实践验证，1000 条/批在延迟和内存之间取得良好平衡。

### Alternatives Considered

| 方案                                | 优点                               | 缺点                                                 | 结论    |
| ----------------------------------- | ---------------------------------- | ---------------------------------------------------- | ------- |
| `stream.Readable` + 游标            | 零依赖，可控粒度，Fastify 原生兼容 | 需手动处理 CSV 转义                                  | ✅ 采用 |
| `@fastify/Reply.send()` + 大字符串  | 实现简单                           | 内存 OOM，违背修复目标                               | ❌ 否决 |
| `fast-csv` + `fs.createWriteStream` | 成熟的 CSV 库                      | 先写文件再返回，增加磁盘 IO 和清理逻辑；引入新依赖   | ❌ 否决 |
| 数据库 `COPY ... TO` 命令           | 极致性能                           | PostgreSQL 特有语法，绕过 Prisma；不支持自定义列映射 | ❌ 否决 |

---

## R2: RabbitMQ 自动重连方案

### Decision

采用手动事件驱动重连：监听 amqplib `Connection` 的 `close` 和 `error` 事件，在回调中执行指数退避重连逻辑。不引入 `amqp-connection-manager` 库。

### Rationale

- **最小变更**：当前 `rabbitmq.ts` 仅 ~50 行，手动实现重连只需追加 ~40 行事件监听 + 重连函数。
- **避免新依赖**：`amqp-connection-manager` 虽然成熟（周下载 60 万+），但引入新依赖需要审计其安全性和与 amqplib 版本的兼容性，且增加供应链攻击面。
- **指数退避**：初始 1s，最大 30s，乘数 2。重连成功后在 `ready` 事件中重建 Channel。
- **Channel 刷新**：重连后必须新建 Channel（旧 Channel 随旧连接关闭而失效），下游代码使用的 `fastify.amqp.channel` 引用需要指向新 Channel。

### Alternatives Considered

| 方案                               | 优点                         | 缺点                                           | 结论    |
| ---------------------------------- | ---------------------------- | ---------------------------------------------- | ------- |
| 手动事件驱动 + 指数退避            | 零新依赖，完全可控，代码量小 | 需要处理 Channel 重建细节                      | ✅ 采用 |
| `amqp-connection-manager`          | 久经考验，封装完善           | 新增依赖；版本锁定在 v4，未来可能有不兼容升级  | ❌ 否决 |
| 外部进程守护（如 systemd restart） | 简单粗暴                     | 重启整个服务影响所有在线用户；不符合云原生实践 | ❌ 否决 |
| 不重连，仅记录错误                 | 零实现成本                   | 消息持续丢失直到人工介入                       | ❌ 否决 |

---

## R3: Redis 离线队列策略修正

### Decision

将 `redis.ts` 第 59 行 `enableOfflineQueue: true` 改为 `enableOfflineQueue: false`，使配置与注释一致。

### Rationale

- **配置与注释矛盾**：代码注释写"不启用离线队列"，实际配置却是 `true`，这是明确的配置错误。
- **项目降级策略一致**：项目中所有 Redis 调用点均遵循"Redis 不可用 → 降级放行"模式（如缓存的 `getOrSet` 内部有 try/catch 降级），关闭离线队列使命令立即失败，降级逻辑顺势触发。
- **ioredis 默认值就是 `true`**：可能是初始开发时未显式设置，随后添加注释标注设计意图，但忘记同步修改代码。
- **无副作用**：现有 Redis 调用点（`cache.ts`、`auth.service.ts`、`survey-crud.service.ts` 等）均通过 `getOrSet` 包装或直接 try/catch 处理错误，关闭离线队列后这些错误处理路径正常工作。

### Alternatives Considered

| 方案                           | 优点                 | 缺点                                   | 结论      |
| ------------------------------ | -------------------- | -------------------------------------- | --------- |
| 改为 `false`                   | 对齐设计意图，零风险 | 无                                     | ✅ 采用   |
| 保持 `true` + 修改注释         | 保守                 | 违背设计意图；离线队列内存风险持续存在 | ❌ 否决   |
| 保持 `true` + 添加队列长度限制 | 折中方案             | ioredis 不支持离线队列长度限制配置     | ❌ 不可行 |

---

## R4: 答卷删除后统计缓存失效

### Decision

在 `deleteResponse()` 方法末尾（`createAuditLog` 之前）追加两条缓存删除调用：`this.cache.del(CacheKeys.statsOverview)` 和 `this.cache.del(CacheKeys.statsBySurvey(surveyIdStr))`，并使用 `.catch(() => {})` 模式（与 `submitResponse` 中的缓存失效模式一致）。

### Rationale

- **对称性**：`submitResponse`（行 1016-1017）和 `publish`/`close`（行 364-365）均已清除统计缓存，`deleteResponse` 缺少相同逻辑是不对称的遗漏。
- **降级安全**：使用 `.catch(() => {})` 确保缓存清除失败不阻塞答卷删除事务（事务已提交后才清缓存），缓存将在 TTL 后自动过期。
- **需要 surveyId**：当前 `deleteResponse` 方法仅查找 response 并 include `survey.user_id`，需要额外 include `survey_id` 字段以构造缓存键。

### Alternatives Considered

| 方案                             | 优点                            | 缺点                                       | 结论    |
| -------------------------------- | ------------------------------- | ------------------------------------------ | ------- |
| 追加 cache.del 调用              | 最小变更，对称于 submitResponse | 无                                         | ✅ 采用 |
| 删除答卷时重新计算统计并写入缓存 | 缓存始终热                      | 不必要的计算开销；删除操作不应触发统计重算 | ❌ 否决 |
| 缩短统计缓存 TTL 到极小值        | 不修改代码                      | 缓存命中率下降，治标不治本                 | ❌ 否决 |

---

## R5: sendCode AMQP 不可用告警

### Decision

在 `auth.service.ts` 的 `sendCode()` 方法中，`if (this.fastify.amqp)` 为 falsy 的分支添加 `fastify.log.warn` 日志，并在响应中返回业务错误码告知用户邮件服务不可用。

### Rationale

- **静默失败 → 显式告警**：当前代码在 amqp 为 falsy 时完全不执行任何日志/错误处理，运维人员无法排查"用户收不到邮件"问题。WARN 日志提供运维排查线索，错误响应告知用户真相。
- **新增 BizCode**：需在 `StatusCode` 枚举中新增 `MAIL_SERVICE_UNAVAILABLE` 错误码，响应格式遵循 `{ code, msg, data: null }` 信封。
- **日志脱敏**：日志中使用项目已有的 `maskEmail()` 函数脱敏邮箱地址，符合安全要求。
- **用户体验权衡**：从"静默成功（实际失败）"改为"明确告知失败"，短期可能增加客服咨询量，但长期减少了"为什么收不到验证码"的困惑。

### Alternatives Considered

| 方案                          | 优点                 | 缺点                                               | 结论    |
| ----------------------------- | -------------------- | -------------------------------------------------- | ------- |
| log.warn + 返回错误码         | 运维可观测，用户知情 | 现有前端可能需要处理新错误码                       | ✅ 采用 |
| 仅 log.warn，仍返回"发送成功" | 前端无改动           | 用户仍被误导；治标不治本                           | ❌ 否决 |
| 改为同步发送邮件（不走队列）  | 邮件必达             | 阻塞响应；RabbitMQ 设计意图被绕过；增加响应延迟    | ❌ 否决 |
| 降级到 HTTP 直连 SMTP 服务    | 高可用               | 架构复杂度增加；需要引入 nodemailer 等 SMTP 客户端 | ❌ 否决 |
