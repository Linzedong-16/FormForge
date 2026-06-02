# ai-server 项目架构文档

## 项目定位

`ai-server` 是问卷平台的 **AI 服务层**，与 `app/backend`（问卷编辑/存储服务）并列部署，承载两大职责：

1. **数据统计与处理** — 聚合问卷答卷数据，提供统计分析 API（各题选项分布、完成率、趋势等）
2. **AI 功能** — 通过 LangChain.js 编排大模型，实现 AI 一键生成问卷、智能分析答卷结论等功能

---

## 技术栈

| 层次     | 技术               | 版本      | 说明                                 |
| -------- | ------------------ | --------- | ------------------------------------ |
| Web 框架 | Fastify            | ^5.2.2    | 高性能 Node.js 框架，Schema 验证内置 |
| 语言     | TypeScript         | ^5.9.3    | NodeNext 模块系统，严格模式          |
| ORM      | Prisma             | ^6.8.2    | 类型安全的数据库访问                 |
| 数据库   | PostgreSQL         | 16        | 主数据库                             |
| 缓存     | Redis              | 7         | 统计缓存、AI 任务状态                |
| 消息队列 | RabbitMQ           | 3         | AI 长任务异步解耦                    |
| AI 框架  | LangChain.js       | ^0.3.0    | LLM 编排、Prompt 管理、Chain 组合    |
| AI 模型  | OpenAI / Anthropic | —         | 可按需切换，默认 claude-sonnet-4-6   |
| 运行时   | Node.js            | >=22.17.0 | 原生 ESM + top-level await           |

---

## 当前项目结构

```
app/ai-server/
├── src/
│   ├── index.ts                # 服务入口，top-level await 启动
│   ├── app.ts                  # buildApp 工厂，注册插件与路由
│   ├── config/
│   │   └── langchain.ts        # LLM 模型工厂（OpenAI / Anthropic）
│   ├── plugins/                # Fastify 插件（基础设施连接层）
│   │   ├── prisma.ts           # PrismaClient → fastify.prisma
│   │   ├── redis.ts            # @fastify/redis → fastify.redis
│   │   └── rabbitmq.ts         # amqplib → fastify.amqp.{connection, channel}
│   └── routes/
│       └── index.ts            # GET /api/health
├── prisma/
│   └── schema.prisma           # PostgreSQL datasource（Model 待填充）
├── docker-compose.yml          # PostgreSQL + Redis + RabbitMQ
├── package.json
├── tsconfig.json
├── .env
└── doc/
```

---

## 目标业务模块结构（规划）

在当前骨架基础上，按业务域拆分模块：

```
src/
├── index.ts
├── app.ts
├── config/
│   ├── langchain.ts            # LLM 工厂函数
│   └── constants.ts            # 队列名、缓存 Key 前缀、TTL 等常量
│
├── plugins/                    # 基础设施插件（保持现状）
│   ├── prisma.ts
│   ├── redis.ts
│   └── rabbitmq.ts
│
├── modules/
│   │
│   ├── survey/                 # 问卷数据层（对齐 backend 数据结构）
│   │   ├── survey.service.ts   # 问卷 / 题目 / 答卷的 Prisma 查询
│   │   └── survey.routes.ts    # GET /api/surveys/:id 等只读接口
│   │
│   ├── statistics/             # 统计分析
│   │   ├── statistics.service.ts    # 聚合计算（选项分布、完成率等）
│   │   ├── statistics.cache.ts      # Redis 缓存读写封装
│   │   └── statistics.routes.ts     # GET /api/statistics/:surveyId
│   │
│   └── ai/                     # AI 功能
│       ├── chains/             # LangChain 链定义
│       │   ├── generate-survey.chain.ts    # 一键生成问卷结构
│       │   └── analyze-responses.chain.ts  # 分析答卷摘要 / 结论
│       ├── consumers/          # RabbitMQ 消费者（处理异步任务）
│       │   └── ai-task.consumer.ts
│       ├── ai.service.ts       # 任务调度与状态管理
│       └── ai.routes.ts        # POST /api/ai/generate, POST /api/ai/analyze
│
└── shared/
    ├── errors.ts               # 统一 HTTP 错误类型
    └── types.ts                # 跨模块共享 TS 类型（问卷结构、组件 Schema）
```

---

## Prisma 数据模型规划

对齐 `app/backend` 已有数据结构（Survey / SurveyComponent / SurveyResponse），并扩展 AI 专属表：

```prisma
// 问卷主表（与 backend 数据共享或同步）
model Survey {
  id          Int                @id @default(autoincrement())
  surveyId    String             @unique @map("survey_id")
  title       String?
  description String?
  components  SurveyComponent[]
  responses   SurveyResponse[]
  createdAt   DateTime           @default(now()) @map("created_at")
  updatedAt   DateTime           @updatedAt @map("updated_at")

  @@map("surveys")
}

// 题目组件（type 与 status 存为 JSON）
model SurveyComponent {
  id            Int      @id @default(autoincrement())
  surveyId      String   @map("survey_id")
  componentId   String   @map("component_id")
  componentName String   @map("component_name")
  componentType Json?    @map("component_type")
  status        Json
  orderIndex    Int      @map("order_index")
  survey        Survey   @relation(fields: [surveyId], references: [surveyId])

  @@map("survey_components")
}

// 答卷（answers 为 JSON，key=componentId, value=用户答案）
model SurveyResponse {
  id        Int      @id @default(autoincrement())
  surveyId  String   @map("survey_id")
  answers   Json
  createdAt DateTime @default(now()) @map("created_at")
  survey    Survey   @relation(fields: [surveyId], references: [surveyId])

  @@map("survey_responses")
}

// AI 异步任务追踪
model AiTask {
  id        String   @id @default(cuid())
  type      String                          // generate_survey | analyze_responses
  status    String   @default("pending")   // pending | processing | done | failed
  payload   Json                           // 任务输入参数
  result    Json?                          // 任务输出结果
  error     String?
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  @@map("ai_tasks")
}
```

---

## 核心数据流

### 场景一：AI 一键生成问卷（同步短任务）

```
前端
 └─► POST /api/ai/generate-survey  { topic, questionCount, style }
      └─► ai.service.ts
           └─► generate-survey.chain.ts
                └─► ChatPromptTemplate → LLM（Anthropic / OpenAI）
                     └─► StructuredOutputParser → 问卷 JSON
      └─► 写入 AiTask 记录（status=done）
      └─► 返回结构化问卷数据给前端
```

### 场景二：统计查询（带 Redis 缓存）

```
前端
 └─► GET /api/statistics/:surveyId
      └─► statistics.cache.ts → Redis GET stats:{surveyId}
           ├─► 缓存命中 → 直接返回
           └─► 缓存 miss
                └─► statistics.service.ts → Prisma 查询 PostgreSQL
                     └─► 聚合计算（选项频率、填写时长、完成率…）
                          └─► Redis SET stats:{surveyId}  TTL=300s
                               └─► 返回统计结果
```

### 场景三：AI 分析答卷（异步长任务）

```
前端
 └─► POST /api/ai/analyze  { surveyId }
      └─► 写入 AiTask（status=pending）
      └─► 推送到 RabbitMQ  exchange: ai.tasks, routingKey: analyze
      └─► 返回 { taskId }

前端轮询
 └─► GET /api/ai/task/:taskId
      └─► 查询 Redis  ai:task:{taskId}  或 AiTask 表
      └─► 返回当前状态与结果

后台消费者（ai-task.consumer.ts）
 └─► 消费 RabbitMQ ai.tasks 队列
      └─► analyze-responses.chain.ts → LLM 分析
           └─► 更新 AiTask（status=done, result=…）
                └─► 写入 Redis  ai:task:{taskId}  TTL=3600s
```

---

## API 路由规划

| Method | Path                             | 描述                   |
| ------ | -------------------------------- | ---------------------- |
| GET    | /api/health                      | 健康检查               |
| GET    | /api/surveys                     | 获取问卷列表           |
| GET    | /api/surveys/:surveyId           | 获取问卷详情（含题目） |
| GET    | /api/statistics/:surveyId        | 获取问卷统计数据       |
| GET    | /api/statistics/:surveyId/export | 导出统计报告（待定）   |
| POST   | /api/ai/generate-survey          | AI 生成问卷结构        |
| POST   | /api/ai/analyze                  | 触发异步答卷分析       |
| GET    | /api/ai/task/:taskId             | 查询 AI 任务状态       |
