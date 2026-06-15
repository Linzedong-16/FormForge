# 日志系统使用指南

> 版本: v1.0 | 日期: 2026-06-11

---

## 1. 架构概览

```
 Fastify 业务服务
      │
      │ fastify.log.info(...)    ← 直接调用（自动注入 requestId）
      │ createLogger(fastify)    ← 带脱敏的结构化 logger
      │
      ▼
   Pino 日志引擎
      │
      ├── 开发环境 (LOG_ENV=development)
      │     → pino-pretty 控制台彩色输出
      │     → 不推 RabbitMQ
      │
      └── 生产环境 (LOG_ENV=production)
            → RabbitMQ (questionnaire-logs 持久化队列)
            → 降级: 本地文件 logs/fallback-YYYY-MM-DD.log
                │
                ▼
          独立消费进程 (log-consumer)
            → 批量读取 → MongoDB bulkWrite → TTL 90天自动清理
```

### 文件索引

| 文件                           | 职责                                  |
| ------------------------------ | ------------------------------------- |
| `src/plugins/log-transport.ts` | Pino → RabbitMQ 传输（生产环境激活）  |
| `src/utils/logger.ts`          | 结构化 Logger + 敏感字段脱敏          |
| `src/consumer/log-consumer.ts` | 独立消费进程（RabbitMQ → MongoDB）    |
| `src/models/LogEntry.model.ts` | MongoDB 日志 Schema + TTL 索引        |
| `src/plugins/mongo.ts`         | Mongoose 连接插件                     |
| `src/app.ts`                   | requestId 注入钩子 + pino-pretty 配置 |

---

## 2. 日志使用方式

### 2.1 路由中直接使用 `fastify.log`

Fastify 实例自带 pino logger，每条日志自动携带 `requestId`（由 `app.ts` 的 `onRequest` 钩子注入）。

```typescript
// src/modules/user/auth.routes.ts
import type { FastifyPluginAsync } from "fastify";

const authRoutes: FastifyPluginAsync = async fastify => {
  fastify.post("/login", async (request, reply) => {
    // ✅ info 级别：关键业务操作
    fastify.log.info({ email: request.body.email }, "用户尝试登录");

    try {
      const result = await authService.login(/* ... */);

      // ✅ 成功日志
      fastify.log.info({ userId: result.user.id }, "用户登录成功");
      return reply.sendSuccess(result, "登录成功");
    } catch (err) {
      // ✅ error 级别：异常情况
      fastify.log.error({ err, email: request.body.email }, "登录失败");
      throw err;
    }
  });
};
```

### 2.2 Service 中使用 `createLogger`

```typescript
// src/modules/user/auth.service.ts
import { createLogger, type StructuredLogger } from "../../utils/logger.js";

export class AuthService {
  private readonly log: StructuredLogger;

  constructor(private readonly fastify: FastifyInstance) {
    this.log = createLogger(fastify);
  }

  async login(email: string, password: string) {
    const t0 = Date.now();

    this.log.info("开始登录验证", { email });

    const user = await this.fastify.prisma.user.findFirst(/* ... */);
    if (!user) {
      this.log.warn("用户不存在", { email });
      throw new AuthError("邮箱或密码错误", 401);
    }

    // ✅ 记录耗时
    this.log.info("登录验证通过", {
      userId: user.id.toString(),
      elapsed_ms: Date.now() - t0
    });

    return {
      /* ... */
    };
  }
}
```

### 2.3 中间件中记录请求

```typescript
// 已有：app.ts 中 onRequest 钩子自动注入 requestId
// 可扩展：添加响应时间记录

app.addHook("onResponse", async (request, reply) => {
  fastify.log.info(
    {
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      elapsed_ms: reply.elapsedTime
    },
    "请求完成"
  );
});
```

---

## 3. 日志级别规范

| 级别    | 使用场景     | 示例                                       |
| ------- | ------------ | ------------------------------------------ |
| `trace` | 极细粒度调试 | 数据库查询参数、Redis 键值                 |
| `debug` | 开发调试信息 | 中间变量值、分支判断条件                   |
| `info`  | 关键业务操作 | 登录成功、注册完成、Token 刷新、问卷创建   |
| `warn`  | 可恢复异常   | 邮件发送失败、Redis 连接重试、审计日志丢失 |
| `error` | 需关注的错误 | 数据库操作失败、第三方服务调用失败         |
| `fatal` | 致命故障     | 数据库连接池耗尽、内存溢出                 |

---

## 4. 现有接口中的埋点建议

### 4.1 认证接口 (`/api/auth/*`)

```typescript
// POST /login — 已有: 无日志
// 建议添加:
fastify.log.info({ email }, "用户尝试登录"); // 进入路由
fastify.log.info({ userId }, "登录成功"); // 成功
fastify.log.warn({ email, remainAttempts }, "密码错误"); // 失败
fastify.log.warn({ email }, "账户已锁定"); // 锁定

// POST /register
fastify.log.info({ email }, "初始化注册"); // 系统首次初始化

// POST /send-code
fastify.log.info({ email, type }, "发送验证码"); // 成功
fastify.log.warn({ email }, "发送频率超限"); // 限流

// POST /refresh
fastify.log.info({ userId }, "Token 刷新成功");
fastify.log.warn("Refresh Token 无效");
```

### 4.2 管理接口 (`/api/admin/*`)

```typescript
// POST /admin/users
fastify.log.info({ adminId, email, role }, "管理员创建用户");

// DELETE /admin/users
fastify.log.info({ adminId, targetId }, "管理员删除用户");

// PUT /admin/config/smtp
fastify.log.info({ adminId }, "更新 SMTP 配置");
```

### 4.3 健康检查 (`/api/health`)

```typescript
// 已有: 无日志
// 建议添加:
fastify.log.info({ checks }, "健康检查完成"); // 正常
fastify.log.error({ checks }, "健康检查异常"); // 降级
```

---

## 5. MongoDB 日志查询

### 5.1 常用查询

```javascript
// 按 requestId 追踪完整请求链路
db.logentries.find({ requestId: "550e8400-e29b-41d4-a716-446655440000" }).sort({ timestamp: 1 });

// 查询最近 1 小时的错误日志
db.logentries
  .find({
    level: "error",
    timestamp: { $gte: new Date(Date.now() - 3600000) }
  })
  .sort({ timestamp: -1 })
  .limit(50);

// 查询特定用户的登录日志
db.logentries
  .find({
    "context.userId": "1",
    message: "用户登录成功"
  })
  .sort({ timestamp: -1 });

// 统计各接口的平均响应时间
db.logentries.aggregate([
  { $match: { message: "请求完成", timestamp: { $gte: new Date(Date.now() - 86400000) } } },
  {
    $group: {
      _id: "$context.url",
      avg_ms: { $avg: "$context.elapsed_ms" },
      count: { $sum: 1 }
    }
  },
  { $sort: { avg_ms: -1 } }
]);

// 统计各日志级别数量
db.logentries.aggregate([{ $group: { _id: "$level", count: { $sum: 1 } } }]);
```

### 5.2 索引说明

| 索引                                            | 用途                     |
| ----------------------------------------------- | ------------------------ |
| `{ requestId: 1 }`                              | 按链路追踪 ID 查询       |
| `{ timestamp: -1 }`                             | 按时间范围查询           |
| `{ level: 1 }`                                  | 按日志级别过滤           |
| `{ source: 1 }`                                 | 按服务来源过滤（多实例） |
| `{ level: 1, timestamp: -1 }`                   | 按级别+时间复合查询      |
| `{ timestamp: 1, expireAfterSeconds: 7776000 }` | TTL 自动清理（90天）     |

---

## 6. 敏感字段自动脱敏

`src/utils/logger.ts` 内置脱敏规则，所有通过 `createLogger` 写入的日志自动处理：

| 原始字段                     | 输出示例                     |
| ---------------------------- | ---------------------------- |
| `password: "Admin@123"`      | `password: "***"`            |
| `token: "eyJhbGc...9yIiw"`   | `token: "eyJhbGc***9yIiw"`   |
| `email: "admin@example.com"` | `email: "ad***@example.com"` |

**注意**：直接使用 `fastify.log.info(data)` 不会自动脱敏，建议在涉及敏感数据时使用 `createLogger(fastify)`。

---

## 7. 环境变量

```bash
# 日志级别（trace/debug/info/warn/error/fatal）
LOG_LEVEL=info

# 运行环境（development=控制台彩色, production=推RabbitMQ）
LOG_ENV=development

# RabbitMQ 队列配置
LOG_MQ_QUEUE=questionnaire-logs
LOG_MQ_EXCHANGE=logs-exchange

# 消费端批量参数
LOG_BATCH_SIZE=100           # 批量写入条数
LOG_BATCH_INTERVAL_MS=5000   # 批量写入间隔（毫秒）
LOG_MAX_QUEUE_SIZE=10000     # 队列堆积告警阈值

# MongoDB
MONGO_URI=mongodb://admin:admin123@localhost:27017
MONGO_DB_NAME=questionnaire_logs

# 日志过期天数
LOG_TTL_DAYS=90
```

---

## 8. 启动与运维

### 8.1 开发环境

```bash
# 仅启动业务服务（控制台 pino-pretty 彩色日志）
pnpm dev
```

### 8.2 含日志持久化的完整栈

```bash
# 1. 启动基础设施
docker compose up -d postgres redis rabbitmq mongodb

# 2. 启动业务服务（生产日志模式）
LOG_ENV=production pnpm dev

# 3. 启动日志消费进程（另一终端）
pnpm consumer:dev
```

### 8.3 PM2 生产部署

```bash
pnpm build
pnpm start:all   # = pm2 start ecosystem.config.js
pm2 logs         # 查看实时日志
```

### 8.4 故障排查

| 现象               | 排查                                                 |
| ------------------ | ---------------------------------------------------- |
| 日志不写入 MongoDB | 检查 `log-consumer` 进程是否运行: `pm2 list`         |
| 队列堆积           | 调小 `LOG_BATCH_INTERVAL_MS` 或增大 `LOG_BATCH_SIZE` |
| MongoDB 磁盘满     | 检查 TTL 索引是否生效: `db.logentries.getIndexes()`  |
| RabbitMQ 断连      | 消费进程自动重连，检查 `logs/fallback-*.log`         |
