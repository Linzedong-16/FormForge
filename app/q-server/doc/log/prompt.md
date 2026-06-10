# Fastify日志方案B（RabbitMQ缓冲+MongoDB持久化）完整AI编码提示词

---

## 基础身份设定

你是资深全栈后端工程师，精通**Fastify、Pino日志体系、RabbitMQ消息队列、MongoDB文档存储、TypeScript工程规范**，输出代码必须可直接运行、带完整异常容错、注释清晰、分层解耦。

---

## 项目架构适配说明

### 现有项目结构分析

| 模块             | 现有状态                            | 适配策略                              |
| ---------------- | ----------------------------------- | ------------------------------------- |
| **Fastify框架**  | ✅ 已配置 `src/app.ts`              | 复用现有Fastify实例，集成Pino日志传输 |
| **RabbitMQ插件** | ✅ 已实现 `src/plugins/rabbitmq.ts` | 复用现有连接，添加日志专用队列配置    |
| **MongoDB**      | 📦 新增                             | 使用MongoDB作为日志专用存储           |
| **PostgreSQL**   | ✅ 通过Prisma ORM集成               | 保持现有用途，不用于日志存储          |
| **环境变量**     | ✅ 使用 `dotenv`                    | 新增MongoDB及日志相关环境变量定义     |
| **TypeScript**   | ✅ 项目标准配置                     | 遵循现有TS规范                        |

### 核心依赖清单（已有/新增）

| 依赖          | 状态                | 用途                        |
| ------------- | ------------------- | --------------------------- |
| `amqplib`     | ✅ 已有             | RabbitMQ消息队列            |
| `fastify`     | ✅ 已有             | 主框架                      |
| `pino`        | ⚠️ 内置             | Fastify默认日志引擎         |
| `mongoose`    | 📦 新增             | MongoDB ODM（对象文档映射） |
| `pino-amqp`   | 📦 新增             | Pino到RabbitMQ的传输器      |
| `pino-pretty` | 📦 新增（开发环境） | 控制台彩色格式化            |

### MongoDB优势分析

| 维度            | PostgreSQL          | MongoDB             |
| --------------- | ------------------- | ------------------- |
| **写入性能**    | ⭐⭐⭐              | ⭐⭐⭐⭐⭐          |
| **资源消耗**    | ⭐⭐⭐              | ⭐⭐⭐⭐⭐          |
| **文档存储**    | ❌ 需要JSON字段     | ✅ 天然支持JSON文档 |
| **TTL自动清理** | 需要触发器/定时任务 | ✅ 原生支持         |
| **水平扩展**    | ⭐⭐                | ⭐⭐⭐⭐⭐          |
| **日志适配度**  | ⭐⭐⭐              | ⭐⭐⭐⭐⭐          |

---

## 需求完整背景

### 业务框架

- **主框架**: Fastify 5.x + TypeScript
- **日志底层**: Pino（Fastify内置）
- **MongoDB ODM**: Mongoose
- **消息队列**: RabbitMQ（已通过 `src/plugins/rabbitmq.ts` 集成）

### 日志流转架构

```
Fastify服务 → Pino日志 → pino-amqp传输器 → RabbitMQ持久化队列 → 独立消费进程 → MongoDB批量写入
```

### 核心约束

| 约束项         | 要求                                           |
| -------------- | ---------------------------------------------- |
| **非阻塞写入** | 业务HTTP请求绝对不能被日志IO阻塞               |
| **消息持久化** | RabbitMQ开启持久化、手动ACK机制                |
| **批量写入**   | MongoDB采用bulkWrite批量写入，拒绝单条循环插入 |
| **环境区分**   | 开发环境控制台彩色打印；生产环境仅推送RabbitMQ |
| **敏感脱敏**   | 自动脱敏密码、Token、手机号等敏感字段          |
| **全链路追踪** | 每条日志绑定唯一requestId                      |
| **进程隔离**   | 消费进程独立部署，不耦合业务服务               |
| **兜底策略**   | RabbitMQ不可用时本地文件日志兜底               |
| **自动清理**   | 日志自动过期清理（TTL索引）                    |

---

## 输出结构要求

### 1. 新增目录结构

```
src/
├── consumer/                # 独立消费进程目录（新增）
│   └── log-consumer.ts      # 日志消费主进程
├── plugins/
│   └── pino-amqp.ts         # Pino RabbitMQ传输插件（新增）
├── utils/
│   └── logger.ts            # 日志工具函数（新增）
└── schemas/
    └── log.schema.ts        # 日志数据库模型（新增）
```

### 2. 环境变量配置

| 变量名                  | 类型   | 默认值                      | 说明                                          |
| ----------------------- | ------ | --------------------------- | --------------------------------------------- |
| `LOG_LEVEL`             | string | `info`                      | 日志级别（trace/debug/info/warn/error/fatal） |
| `LOG_ENV`               | string | `development`               | 运行环境（development/production）            |
| `LOG_MQ_QUEUE`          | string | `questionnaire-logs`        | 日志队列名称                                  |
| `LOG_MQ_EXCHANGE`       | string | `logs-exchange`             | 日志交换机名称                                |
| `LOG_BATCH_SIZE`        | number | `100`                       | 批量写入条数                                  |
| `LOG_BATCH_INTERVAL_MS` | number | `5000`                      | 批量写入间隔（毫秒）                          |
| `LOG_MAX_QUEUE_SIZE`    | number | `10000`                     | 内存队列最大缓冲数                            |
| `MONGO_URI`             | string | `mongodb://localhost:27017` | MongoDB连接地址                               |
| `MONGO_DB_NAME`         | string | `questionnaire_logs`        | MongoDB数据库名称                             |
| `LOG_TTL_DAYS`          | number | `90`                        | 日志自动过期天数                              |

### 3. Fastify主服务入口改造 (`src/app.ts`)

**改造内容**:

- 配置Pino传输器：开发环境使用`pino-pretty`，生产环境使用`pino-amqp`
- 添加全局requestId钩子
- 集成日志脱敏中间件

### 4. Pino RabbitMQ传输插件 (`src/plugins/pino-amqp.ts`)

**功能要求**:

- 复用现有`fastify.amqp`连接
- 配置持久化队列和交换机
- 实现消息发送失败重试机制
- 集成敏感字段脱敏逻辑

### 5. MongoDB连接插件 (`src/plugins/mongo.ts`)

**功能要求**:

- 使用Mongoose建立MongoDB连接
- 配置连接池和重试策略
- 添加连接状态监控
- 集成到Fastify实例供其他模块使用

### 6. 日志模型定义 (`src/models/LogEntry.model.ts`)

**Mongoose Schema定义**:

```typescript
import mongoose, { Schema, Document } from "mongoose";

export interface LogEntryDocument extends Document {
  requestId?: string;
  level: string;
  message: string;
  context: Record<string, unknown>;
  timestamp: Date;
  source: string;
}

const LogEntrySchema = new Schema<LogEntryDocument>(
  {
    requestId: { type: String, index: true },
    level: { type: String, index: true, required: true },
    message: { type: String, required: true },
    context: { type: Schema.Types.Mixed, default: {} },
    timestamp: { type: Date, default: Date.now, index: true },
    source: { type: String, index: true }
  },
  {
    timestamps: { createdAt: "timestamp", updatedAt: false }
  }
);

// TTL索引：自动清理过期日志
LogEntrySchema.index({ timestamp: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

export const LogEntry = mongoose.model<LogEntryDocument>("LogEntry", LogEntrySchema);
```

### 7. 日志工具函数 (`src/utils/logger.ts`)

**功能要求**:

- 提供结构化日志方法（trace/debug/info/warn/error/fatal）
- 支持自定义标签（tags）
- 自动关联requestId
- 敏感字段脱敏处理

### 8. 独立日志消费进程 (`src/consumer/log-consumer.ts`)

**功能要求**:

- 独立于Fastify服务运行
- 批量拉取队列消息（最多`LOG_BATCH_SIZE`条）
- 使用Mongoose执行bulkWrite批量写入
- 手动ACK机制，确保消息可靠消费
- 消费间隔控制（空闲时休眠`LOG_BATCH_INTERVAL_MS`毫秒）
- 异常捕获和重试策略
- 队列堆积告警

### 9. PM2部署配置 (`ecosystem.config.js`)

**配置要求**:

- 业务服务和日志消费进程分开托管
- 配置自动重启策略
- 设置进程资源限制

### 10. package.json脚本扩展

**新增脚本**:

```json
{
  "scripts": {
    "consumer:dev": "tsx watch src/consumer/log-consumer.ts",
    "consumer:start": "node dist/consumer/log-consumer.js",
    "start:all": "pm2 start ecosystem.config.js"
  }
}
```

---

## 强制编码规范

### 1. TypeScript规范

- 严格类型校验，禁止`any`滥用
- 使用类型别名定义复杂结构
- 导出类型声明供外部使用

### 2. 异步处理规范

- 统一使用`async/await`，杜绝回调地狱
- Promise链必须有`.catch()`错误处理
- 关键操作添加超时控制

### 3. 资源管理规范

- 复用现有RabbitMQ连接（`fastify.amqp`）
- Mongoose连接池自动管理
- 进程退出时释放所有资源（MongoDB连接、MQ通道）

### 4. 错误处理规范

- 分层捕获：网络错误、JSON解析错误、MongoDB写入错误
- MQ重连采用指数退避策略
- 日志消费失败时死信队列处理

### 5. 可配置化规范

- 所有参数通过环境变量或配置文件管理
- 批量条数、休眠时间、队列名等可配置
- 支持开发/测试/生产多环境配置

### 6. 日志埋点规范

- 数据概览分页接口完整埋点
- 采集page/pageSize/total等关键字段
- 接口响应时间追踪

---

## 禁止内容

| 禁止项           | 说明                              |
| ---------------- | --------------------------------- |
| **简化伪代码**   | 必须完整可复制运行                |
| **省略异常处理** | 必须包含重试、重连、兜底降级逻辑  |
| **混合业务代码** | 消费进程与业务服务严格隔离        |
| **废弃依赖**     | 不使用老旧npm包，选用稳定维护版本 |
| **硬编码配置**   | 所有配置必须通过环境变量注入      |

---

## 关键设计细节

### 1. 日志级别控制

| 环境        | 控制台输出                 | RabbitMQ推送 |
| ----------- | -------------------------- | ------------ |
| development | ✅ 彩色打印（pino-pretty） | ❌ 关闭      |
| production  | ❌ 关闭                    | ✅ 开启      |

### 2. 敏感字段脱敏规则

| 字段类型 | 脱敏方式              | 示例                       |
| -------- | --------------------- | -------------------------- |
| password | 全部替换为`***`       | `password: "***"`          |
| token    | 保留前8位+`***`+后8位 | `token: "eyJhbGc***9yIiw"` |
| phone    | 中间4位替换为`****`   | `phone: "138****1234"`     |
| email    | 用户名部分脱敏        | `email: "zh***@xxx.com"`   |

### 3. 批量写入策略

```
空闲状态 → 等待LOG_BATCH_INTERVAL_MS → 拉取并批量写入
繁忙状态 → 队列达到LOG_BATCH_SIZE → 立即拉取并批量写入
```

**MongoDB bulkWrite示例**:

```typescript
const bulkOps = logs.map(log => ({
  insertOne: {
    document: {
      requestId: log.requestId,
      level: log.level,
      message: log.message,
      context: log.context,
      timestamp: new Date(log.timestamp),
      source: log.source
    }
  }
}));

await LogEntry.bulkWrite(bulkOps);
```

### 4. MongoDB索引策略

```javascript
// 单字段索引
db.logs.createIndex({ requestId: 1 }); // 链路追踪查询
db.logs.createIndex({ timestamp: -1 }); // 时间范围查询
db.logs.createIndex({ level: 1 }); // 级别过滤
db.logs.createIndex({ source: 1 }); // 服务来源过滤

// 复合索引
db.logs.createIndex({ level: 1, timestamp: -1 }); // 按级别+时间查询
db.logs.createIndex({ source: 1, timestamp: -1 }); // 按服务+时间查询

// TTL索引（自动清理90天前的日志）
db.logs.createIndex({ timestamp: 1 }, { expireAfterSeconds: 7776000 });
```

### 5. MongoDB连接配置

```typescript
// src/plugins/mongo.ts 关键配置
const mongoConfig = {
  uri: process.env.MONGO_URI,
  dbName: process.env.MONGO_DB_NAME,
  poolSize: 10, // 连接池大小
  minPoolSize: 2, // 最小连接数
  maxPoolSize: 20, // 最大连接数
  serverSelectionTimeoutMS: 5000, // 服务器选择超时
  socketTimeoutMS: 30000, // 套接字超时
  retryWrites: true, // 重试写入
  writeConcern: { w: 1 } // 写入确认级别
};
```

### 6. 故障降级方案

```
RabbitMQ可用 → 正常推送队列
    ↓
RabbitMQ不可用 → 本地文件日志兜底
    ↓
RabbitMQ恢复 → 自动切换回队列模式
```

### 7. MongoDB性能优化建议

| 优化项             | 说明                  | 配置建议                         |
| ------------------ | --------------------- | -------------------------------- |
| **WiredTiger缓存** | 设置合适的缓存大小    | `cache_size=2G`                  |
| **日志级别**       | 生产环境降低日志级别  | `systemLog.verbosity=0`          |
| **写关注**         | 根据需求调整写入确认  | `w: 1`（默认）或 `w: "majority"` |
| **批量写入**       | 使用bulkWrite提升性能 | 每批100-500条                    |
| **索引优化**       | 合理创建索引          | 根据查询模式创建                 |
| **分片**           | 海量日志时考虑分片    | 按时间分片                       |

---

## MongoDB部署与运维

### 1. Docker部署配置

```yaml
# docker-compose.yml
services:
  mongodb:
    image: mongo:7.0
    container_name: questionnaire-mongo
    ports:
      - "27017:27017"
    volumes:
      - ./data/mongo:/data/db
      - ./config/mongo:/etc/mongo
    environment:
      MONGO_INITDB_DATABASE: questionnaire_logs
      MONGO_INITDB_ROOT_USERNAME: admin
      MONGO_INITDB_ROOT_PASSWORD: password
    command: mongod --config /etc/mongo/mongod.conf
```

### 2. 资源配置建议

| 环境     | CPU | 内存 | 存储   |
| -------- | --- | ---- | ------ |
| 开发环境 | 1核 | 2GB  | 10GB   |
| 测试环境 | 2核 | 4GB  | 50GB   |
| 生产环境 | 4核 | 8GB+ | 200GB+ |

### 3. 监控指标

| 指标           | 说明                   | 告警阈值             |
| -------------- | ---------------------- | -------------------- |
| **连接数**     | 当前MongoDB连接数      | > 80% of maxPoolSize |
| **写入延迟**   | 平均写入耗时           | > 100ms              |
| **队列深度**   | RabbitMQ日志队列消息数 | > 10000              |
| **磁盘使用率** | MongoDB数据目录使用率  | > 80%                |

---

### 附加追问指令（你可以直接复制发给AI生成代码）

```
按照上面这套提示词完整输出所有代码文件、配置、SQL（如适用），分步输出，每个文件标清楚文件名，代码附带详细中文注释，最后补充部署启动步骤和调优参数说明。
```
