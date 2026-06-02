# 基础设施与中间件配置文档

## 当前基础设施总览

| 中间件     | 镜像                         | 端口         | 容器名                 | 用途                        |
| ---------- | ---------------------------- | ------------ | ---------------------- | --------------------------- |
| PostgreSQL | postgres:16-alpine           | 5432         | questionnaire-postgres | 主数据库                    |
| Redis      | redis:7-alpine               | 6379         | questionnaire-redis    | 缓存 / 任务状态             |
| RabbitMQ   | rabbitmq:3-management-alpine | 5672 / 15672 | questionnaire-rabbitmq | 异步消息队列                |
| MinIO      | minio/minio:latest           | 9000 / 9001  | questionnaire-minio    | 对象存储（报告导出 / 文件） |

---

## 当前中间件详细配置

### PostgreSQL 16

```yaml
postgres:
  image: postgres:16-alpine
  container_name: questionnaire-postgres
  ports:
    - "5432:5432"
  environment:
    POSTGRES_USER: questionnaire
    POSTGRES_PASSWORD: questionnaire123
    POSTGRES_DB: questionnaire_db
```

**职责：**

- 存储问卷（surveys）、题目组件（survey_components）、答卷（survey_responses）
- 存储 AI 任务记录（ai_tasks）
- 通过 Prisma ORM 访问，`fastify.prisma` 全局装饰

**连接字符串：**

```
DATABASE_URL=postgresql://questionnaire:questionnaire123@localhost:5432/questionnaire_db
```

---

### Redis 7

```yaml
redis:
  image: redis:7-alpine
  container_name: questionnaire-redis
  ports:
    - "6379:6379"
```

**职责分层：**

| Key 前缀            | 数据              | TTL                      |
| ------------------- | ----------------- | ------------------------ |
| `stats:{surveyId}`  | 统计聚合结果      | 300s（可按更新频率调整） |
| `ai:task:{taskId}`  | AI 任务状态与结果 | 3600s                    |
| `survey:{surveyId}` | 问卷结构缓存      | 600s                     |

**访问：** `fastify.redis`（ioredis 实例，来自 `@fastify/redis`）

---

### RabbitMQ 3

```yaml
rabbitmq:
  image: rabbitmq:3-management-alpine
  container_name: questionnaire-rabbitmq
  ports:
    - "5672:5672" # AMQP 协议
    - "15672:15672" # Web 管理后台
  environment:
    RABBITMQ_DEFAULT_USER: questionnaire
    RABBITMQ_DEFAULT_PASS: questionnaire123
```

**管理后台：** http://localhost:15672 （账号同上）

**队列与 Exchange 规划：**

| Exchange       | Type   | Routing Key | 队列                     | 消费者              |
| -------------- | ------ | ----------- | ------------------------ | ------------------- |
| `ai.tasks`     | direct | `generate`  | `ai.generate-survey`     | ai-task.consumer.ts |
| `ai.tasks`     | direct | `analyze`   | `ai.analyze-responses`   | ai-task.consumer.ts |
| `stats.events` | fanout | —           | `stats.invalidate-cache` | 统计缓存失效        |

**访问：** `fastify.amqp.channel`（amqplib Channel 实例）

---

## 未来扩展中间件规划

### 1. pgvector（PostgreSQL 向量扩展）

**用途：** RAG（检索增强生成）场景 —— 将历史问卷 Embedding 存入向量列，生成新问卷时检索相似问卷作为上下文参考，提升 AI 生成质量。

**启用方式：** 替换 docker-compose.yml 中的 PostgreSQL 镜像：

```yaml
# 将
image: postgres:16-alpine
# 替换为
image: pgvector/pgvector:pg16
```

然后在 Prisma schema 中添加向量列（需配合 `prisma-client-extensions` 或原始查询）：

```sql
-- 迁移 SQL
CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE surveys ADD COLUMN embedding vector(1536);  -- OpenAI text-embedding-3-small
CREATE INDEX ON surveys USING ivfflat (embedding vector_cosine_ops);
```

**影响范围：** 仅需更换镜像，数据文件兼容，现有数据不丢失。

---

### 2. LangSmith（LangChain 链路追踪）

**用途：** 可视化 LangChain 每次调用的 Prompt、Token 消耗、延迟、中间步骤，便于调试和优化 Chain。

**方式：** SaaS 服务，无需自建，仅配置环境变量：

```bash
LANGCHAIN_TRACING_V2=true
LANGCHAIN_API_KEY=<https://smith.langchain.com 申请>
LANGCHAIN_PROJECT=questionnaire-server
```

开启后，所有 LangChain Chain / Agent 调用自动上报到 LangSmith 面板。

---

### 3. MinIO（对象存储，按需添加）

**用途：** 统计报告导出（PDF / Excel）、AI 生成内容的持久化存储、文件上传缓存区。

**docker-compose 配置：**

```yaml
minio:
  image: minio/minio:latest
  container_name: questionnaire-minio
  ports:
    - "9000:9000" # S3 兼容 API
    - "9001:9001" # 管理控制台
  environment:
    MINIO_ROOT_USER: questionnaire
    MINIO_ROOT_PASSWORD: questionnaire123
  volumes:
    - minio-data:/data
  command: server /data --console-address ":9001"
  restart: unless-stopped

volumes:
  minio-data:
    driver: local
```

**Node.js 接入：** 使用 `@aws-sdk/client-s3`（S3 兼容接口）或 `minio` SDK。

**管理后台：** http://localhost:9001

---

### 4. BullMQ（可选，替代 RabbitMQ 的轻量方案）

**用途：** 如果 AI 任务队列复杂度不高，可用基于 Redis 的 BullMQ 替代 RabbitMQ，减少维护成本。

**对比：**

|          | RabbitMQ       | BullMQ           |
| -------- | -------------- | ---------------- |
| 基础设施 | 独立服务       | 复用 Redis       |
| 协议     | AMQP           | Redis            |
| 延迟任务 | 需插件         | 原生支持         |
| 优先队列 | 原生支持       | 原生支持         |
| 适用场景 | 跨服务消息通信 | 单服务内异步任务 |

**如果** 后续 `ai.tasks` 只在 ai-server 内部流转，可考虑迁移到 BullMQ；若需跨服务（如 backend → ai-server 推送事件），保留 RabbitMQ。

---

## 环境变量完整清单

```bash
# 服务
PORT=3000
HOST=0.0.0.0
LOG_LEVEL=info
CORS_ORIGIN=*

# PostgreSQL
DATABASE_URL=postgresql://questionnaire:questionnaire123@localhost:5432/questionnaire_db

# Redis
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
# REDIS_PASSWORD=

# RabbitMQ
RABBITMQ_URL=amqp://questionnaire:questionnaire123@localhost:5672

# AI 模型 API Key（至少配置一个）
OPENAI_API_KEY=
ANTHROPIC_API_KEY=

# LangSmith 追踪（可选）
# LANGCHAIN_TRACING_V2=true
# LANGCHAIN_API_KEY=
# LANGCHAIN_PROJECT=questionnaire-server

# MinIO（按需启用）
# MINIO_ENDPOINT=localhost
# MINIO_PORT=9000
# MINIO_ACCESS_KEY=questionnaire
# MINIO_SECRET_KEY=questionnaire123
# MINIO_BUCKET=questionnaire-assets
```

---

## 启动顺序与依赖关系

```
docker compose up -d
        │
        ├── postgres    ──► 健康检查通过后
        ├── redis       ──► Fastify 插件可连接
        └── rabbitmq    ──► Fastify 插件可连接
                │
                └── pnpm dev  （ai-server 进程）
                      ├── prisma plugin    → 等待 postgres
                      ├── redis plugin     → 等待 redis
                      └── rabbitmq plugin  → 等待 rabbitmq
```

**推荐在 docker-compose.yml 为各服务添加 `depends_on` 后再应用到生产**，开发环境手动按顺序启动即可。
