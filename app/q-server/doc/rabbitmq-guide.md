# RabbitMQ 使用指南

## 目录

1. [RabbitMQ 简介](#1-rabbitmq-简介)
2. [核心概念与组件](#2-核心概念与组件)
3. [项目配置与集成](#3-项目配置与集成)
4. [使用示例](#4-使用示例)
5. [适用场景分析](#5-适用场景分析)
6. [优势与局限性](#6-优势与局限性)
7. [常见问题与解决方案](#7-常见问题与解决方案)
8. [最佳实践建议](#8-最佳实践建议)

---

## 1. RabbitMQ 简介

RabbitMQ 是一个开源的 **消息代理软件**（Message Broker），实现了 AMQP（Advanced Message Queuing Protocol）协议。它用于在分布式系统中存储和转发消息，实现应用间的异步通信和解耦。

### 1.1 核心特性

| 特性           | 说明                                           |
| -------------- | ---------------------------------------------- |
| **异步通信**   | 发送者和接收者无需同时在线，消息可暂存于队列中 |
| **解耦**       | 生产者和消费者独立变化，不影响对方             |
| **负载均衡**   | 多个消费者可共享处理同一队列的消息             |
| **路由灵活**   | 支持多种交换器类型，实现复杂的消息路由         |
| **可靠性**     | 支持消息持久化、确认机制、死信队列等           |
| **多协议支持** | 支持 AMQP、STOMP、MQTT、HTTP 等协议            |

### 1.2 工作原理

```
┌──────────┐     ┌─────────────┐     ┌──────────┐     ┌──────────────┐
│ Producer │────►│  Exchange   │────►│  Queue   │────►│  Consumer    │
└──────────┘     └─────────────┘     └──────────┘     └──────────────┘
                      │                                       │
                      ▼                                       ▼
                 ┌─────────┐                             ┌─────────┐
                 │ Routing │                             │  ACK    │
                 │  Key    │                             │ (确认)  │
                 └─────────┘                             └─────────┘
```

---

## 2. 核心概念与组件

### 2.1 核心组件

| 组件                      | 说明                                      |
| ------------------------- | ----------------------------------------- |
| **Producer（生产者）**    | 发送消息的应用                            |
| **Consumer（消费者）**    | 接收和处理消息的应用                      |
| **Exchange（交换器）**    | 接收生产者消息，根据规则路由到队列        |
| **Queue（队列）**         | 存储消息的容器，消费者从队列获取消息      |
| **Binding（绑定）**       | 定义交换器和队列之间的路由关系            |
| **Routing Key（路由键）** | 消息携带的键，用于交换器路由决策          |
| **Connection（连接）**    | AMQP 连接，通常是 TCP 长连接              |
| **Channel（通道）**       | 建立在连接上的虚拟通道，用于发送/接收消息 |

### 2.2 交换器类型

| 类型        | 说明       | 路由规则                               |
| ----------- | ---------- | -------------------------------------- |
| **direct**  | 精确匹配   | 路由键完全相等时投递给对应队列         |
| **fanout**  | 广播       | 投递给所有绑定的队列，忽略路由键       |
| **topic**   | 通配符匹配 | 支持 `*`（单个词）和 `#`（零或多个词） |
| **headers** | 头属性匹配 | 根据消息头属性匹配，不常用             |

### 2.3 消息确认机制

| 模式                    | 说明                                        |
| ----------------------- | ------------------------------------------- |
| **自动确认（autoAck）** | 消息投递给消费者后立即删除                  |
| **手动确认（manual）**  | 消费者显式调用 `ack` 后才删除，支持失败重试 |

---

## 3. 项目配置与集成

### 3.1 环境变量配置

在 `.env` 文件中配置 RabbitMQ 连接信息：

```bash
RABBITMQ_URL=amqp://questionnaire:questionnaire123@localhost:5672
```

URL 格式：`amqp://用户名:密码@主机:端口`

### 3.2 Docker Compose 配置

```yaml
rabbitmq:
  image: rabbitmq:3-management-alpine
  container_name: questionnaire-rabbitmq
  ports:
    - "5672:5672" # AMQP 协议端口
    - "15672:15672" # Web 管理后台
  environment:
    RABBITMQ_DEFAULT_USER: questionnaire
    RABBITMQ_DEFAULT_PASS: questionnaire123
```

### 3.3 插件实现

项目中的 RabbitMQ 插件位于 `src/plugins/rabbitmq.ts`：

```typescript
import fp from "fastify-plugin";
import { connect } from "amqplib";
import type { FastifyPluginAsync } from "fastify";
import type { ChannelModel, Channel as AmqpChannel } from "amqplib";

// 类型扩展
declare module "fastify" {
  interface FastifyInstance {
    amqp: {
      connection: ChannelModel; // 连接对象
      channel: AmqpChannel; // 通道对象
    };
  }
}

const rabbitmqPlugin: FastifyPluginAsync = async fastify => {
  const url = process.env.RABBITMQ_URL ?? "amqp://questionnaire:questionnaire123@localhost:5672";

  // 建立连接
  const connection: ChannelModel = await connect(url);
  // 创建通道
  const channel: AmqpChannel = await connection.createChannel();

  // 挂载到 fastify 实例
  fastify.decorate("amqp", { connection, channel });

  // 应用关闭时断开连接
  fastify.addHook("onClose", async () => {
    await channel.close();
    await connection.close();
  });
};

export default fp(rabbitmqPlugin, { name: "rabbitmq" });
```

### 3.4 注册插件

在 `src/app.ts` 中注册插件：

```typescript
import prismaPlugin from "./plugins/prisma.js";
import rabbitmqPlugin from "./plugins/rabbitmq.js"; // 取消注释

const app = buildApp();

app
  .register(helmet)
  .register(cors)
  .register(prismaPlugin)
  .register(rabbitmqPlugin) // 注册 RabbitMQ 插件
  .register(routes, { prefix: "/api" });
```

---

## 4. 使用示例

### 4.1 基础连接验证

```typescript
fastify.get("/test-rabbitmq", async (request, reply) => {
  try {
    // 检查通道是否可用
    await fastify.amqp.channel.checkQueue("test-queue");
    return { status: "ok", message: "RabbitMQ connected" };
  } catch (error) {
    return reply.status(500).send({ error: "RabbitMQ connection failed" });
  }
});
```

### 4.2 声明队列

```typescript
// 声明一个持久化队列
const queueName = "ai.generate-survey";
await fastify.amqp.channel.assertQueue(queueName, {
  durable: true // 队列持久化，重启后保留
});
```

### 4.3 发布消息

#### 简单发布

```typescript
const queueName = "ai.tasks";
const message = JSON.stringify({
  type: "generate-survey",
  payload: { topic: "用户调研", questionCount: 10 }
});

// 发送到指定队列
fastify.amqp.channel.sendToQueue(queueName, Buffer.from(message));
```

#### 带路由键的发布

```typescript
const exchangeName = "ai.tasks";
const routingKey = "generate"; // 路由键

// 发送到交换器
fastify.amqp.channel.publish(exchangeName, routingKey, Buffer.from(JSON.stringify({ taskId: "123", data: {} })));
```

### 4.4 消费消息

#### 基础消费

```typescript
const queueName = "ai.generate-survey";

await fastify.amqp.channel.consume(
  queueName,
  async msg => {
    if (!msg) return;

    try {
      const content = JSON.parse(msg.content.toString());
      console.log("Received:", content);

      // 业务逻辑处理
      const result = await processAiTask(content);

      // 确认消息
      fastify.amqp.channel.ack(msg);
    } catch (error) {
      console.error("Processing failed:", error);
      // 拒绝消息，可选择是否重新入队
      fastify.amqp.channel.nack(msg, false, true);
    }
  },
  { noAck: false }
); // 手动确认模式
```

#### 消费并回复

```typescript
const queueName = "rpc.requests";

// 设置预取数量（同时处理的消息数）
await fastify.amqp.channel.prefetch(1);

await fastify.amqp.channel.consume(queueName, async msg => {
  if (!msg) return;

  const request = JSON.parse(msg.content.toString());

  // 处理请求
  const result = await handleRequest(request);

  // 回复到响应队列
  fastify.amqp.channel.sendToQueue(
    msg.properties.replyTo, // 回复队列名
    Buffer.from(JSON.stringify(result)),
    { correlationId: msg.properties.correlationId }
  );

  // 确认原消息
  fastify.amqp.channel.ack(msg);
});
```

### 4.5 路由示例

#### Direct 交换器

```typescript
// 声明交换器
const exchangeName = "notifications";
await fastify.amqp.channel.assertExchange(exchangeName, "direct", {
  durable: true
});

// 绑定队列到交换器
await fastify.amqp.channel.assertQueue("email-notifications");
await fastify.amqp.channel.bindQueue("email-notifications", exchangeName, "email");

await fastify.amqp.channel.assertQueue("sms-notifications");
await fastify.amqp.channel.bindQueue("sms-notifications", exchangeName, "sms");

// 发送消息
fastify.amqp.channel.publish(exchangeName, "email", Buffer.from("Email message"));
fastify.amqp.channel.publish(exchangeName, "sms", Buffer.from("SMS message"));
```

#### Fanout 交换器（广播）

```typescript
const exchangeName = "system-events";
await fastify.amqp.channel.assertExchange(exchangeName, "fanout", {
  durable: true
});

// 多个队列接收同一消息
await fastify.amqp.channel.assertQueue("event-logger");
await fastify.amqp.channel.bindQueue("event-logger", exchangeName, "");

await fastify.amqp.channel.assertQueue("event-analytics");
await fastify.amqp.channel.bindQueue("event-analytics", exchangeName, "");

// 广播消息，所有绑定的队列都能收到
fastify.amqp.channel.publish(exchangeName, "", Buffer.from("System started"));
```

### 4.6 在路由中使用

```typescript
// src/routes/ai.ts
import type { FastifyPluginAsync } from "fastify";

const aiRoutes: FastifyPluginAsync = async fastify => {
  // 发布 AI 任务
  fastify.post("/ai/generate", async (request, reply) => {
    const { topic, questionCount } = request.body as {
      topic: string;
      questionCount: number;
    };

    // 创建任务记录
    const task = await fastify.prisma.aiTask.create({
      data: {
        type: "generate_survey",
        status: "pending",
        payload: { topic, questionCount }
      }
    });

    // 发布到消息队列
    const queueName = "ai.generate-survey";
    await fastify.amqp.channel.assertQueue(queueName, { durable: true });

    fastify.amqp.channel.sendToQueue(queueName, Buffer.from(JSON.stringify({ taskId: task.id, topic, questionCount })));

    return { taskId: task.id, status: "queued" };
  });

  // 查询任务状态
  fastify.get("/ai/task/:taskId", async (request, reply) => {
    const { taskId } = request.params as { taskId: string };

    const task = await fastify.prisma.aiTask.findUnique({
      where: { id: taskId }
    });

    if (!task) {
      return reply.status(404).send({ error: "Task not found" });
    }

    return {
      id: task.id,
      status: task.status,
      result: task.result,
      error: task.error
    };
  });
};

export default aiRoutes;
```

---

## 5. 适用场景分析

### 5.1 典型业务场景

| 场景             | 说明                 | 示例                           |
| ---------------- | -------------------- | ------------------------------ |
| **异步任务处理** | 耗时操作不阻塞主流程 | AI 生成问卷、批量发送邮件      |
| **系统解耦**     | 微服务间通信         | 问卷提交 → 发送通知 → 更新统计 |
| **流量削峰**     | 缓解突发流量         | 问卷提交高峰 → 队列缓冲处理    |
| **日志处理**     | 异步收集和分析日志   | 用户行为追踪、数据分析         |
| **事件驱动**     | 响应特定业务事件     | 问卷发布 → 通知订阅用户        |
| **RPC 调用**     | 跨服务同步请求/响应  | 前端 → 后端 → AI 服务          |

### 5.2 项目中的实际应用

根据项目架构文档，RabbitMQ 在本项目中的应用：

#### 场景一：AI 异步任务处理

```
前端 ──► POST /api/ai/generate
          │
          ├─► 写入数据库 (status=pending)
          │
          └─► 发送到队列 ai.generate-survey
                    │
                    ▼
              AI 消费者处理
                    │
                    ├─► 调用 AI 模型
                    │
                    ├─► 更新数据库 (status=done, result=…)
                    │
                    └─► 写入 Redis (TTL=3600s)

前端轮询 ◄── GET /api/ai/task/:taskId
```

#### 场景二：统计分析事件

| 事件     | 触发         | 处理           |
| -------- | ------------ | -------------- |
| 新增答卷 | 用户提交问卷 | 更新统计缓存   |
| 修改题目 | 编辑问卷     | 清除旧统计缓存 |
| 删除问卷 | 管理员操作   | 清理相关缓存   |

#### 场景三：跨服务通信

如果后续拆分为多个服务：

```
问卷服务 ──► 发布事件 ──► RabbitMQ ──► AI 服务
                                     ──► 通知服务
                                     ──► 统计服务
```

---

## 6. 优势与局限性

### 6.1 优势

| 优势           | 说明                                     |
| -------------- | ---------------------------------------- |
| **成熟稳定**   | 15+ 年生产验证，生态丰富                 |
| **功能完善**   | 支持交换器、绑定、死信队列、优先级队列等 |
| **跨语言支持** | 各主流语言都有客户端库                   |
| **可视化后台** | 提供 Web 管理界面                        |
| **集群支持**   | 支持镜像队列、联邦等高可用方案           |
| **协议标准**   | 基于 AMQP，厂商中立                      |
| **消息持久化** | 支持消息和队列的磁盘持久化               |
| **灵活的路由** | 四种交换器类型满足复杂路由需求           |

### 6.2 局限性

| 局限性               | 说明                                   | 应对方案                     |
| -------------------- | -------------------------------------- | ---------------------------- |
| **性能低于 Kafka**   | 吞吐量约 10万/秒，不适合超大规模数据流 | 评估数据量，按需迁移到 Kafka |
| **单节点单通道限制** | 高并发场景需多通道/连接                | 使用连接池或升级集群         |
| **运维复杂度**       | 需维护独立服务                         | 使用 Docker 容器化管理       |
| **消息顺序保证**     | 仅在同一队列内保证顺序                 | 设计时考虑消息顺序依赖       |
| **消息堆积风险**     | 消费者故障时消息堆积                   | 监控队列深度，设置 TTL       |
| **不支持精确重试**   | 需自行实现重试逻辑                     | 使用死信队列 + 定时重发布    |

---

## 7. 常见问题与解决方案

### 7.1 连接问题

#### 问题：连接被拒绝

```
Error: connect ECONNREFUSED 127.0.0.1:5672
```

**解决方案**：

1. 确认 RabbitMQ 服务已启动：`docker ps | grep rabbitmq`
2. 检查端口是否正确映射
3. 验证防火墙设置

#### 问题：认证失败

```
Error: 403 ACCESS_REFUSED - credentials were rejected
```

**解决方案**：

1. 检查 `.env` 中的用户名密码
2. 确认 Docker Compose 中的 `RABBITMQ_DEFAULT_USER/PASS`

### 7.2 消息问题

#### 问题：消息丢失

**原因**：

- 队列未声明为持久化
- 消息未设置持久化
- 消费者自动确认后处理失败

**解决方案**：

```typescript
// 1. 声明持久化队列
await channel.assertQueue("my-queue", { durable: true });

// 2. 发送持久化消息
channel.sendToQueue("my-queue", Buffer.from(data), {
  persistent: true // 消息持久化
});

// 3. 使用手动确认
channel.consume("my-queue", handler, { noAck: false });
```

#### 问题：消息重复消费

**原因**：

- 消费者未确认就崩溃
- 网络波动导致消息重新投递

**解决方案**：

1. 业务逻辑实现幂等性（同一消息多次处理结果一致）
2. 使用唯一标识追踪已处理消息

```typescript
// 示例：Redis 记录已处理消息
const isProcessed = await fastify.redis.get(`processed:${msgId}`);
if (isProcessed) {
  channel.ack(msg); // 已处理，直接确认
  return;
}

// 处理消息...
await fastify.redis.set(`processed:${msgId}`, "1", "EX", 3600);
channel.ack(msg);
```

### 7.3 队列问题

#### 问题：消息堆积

**原因**：消费者处理速度跟不上生产速度

**解决方案**：

1. 增加消费者数量
2. 优化消费者处理逻辑
3. 设置消息 TTL 和队列最大长度

```typescript
// 设置队列最大长度和消息 TTL
await channel.assertQueue("my-queue", {
  maxLength: 10000, // 最多 10000 条消息
  messageTtl: 3600000 // 消息 1 小时后自动删除
});
```

### 7.4 消费者问题

#### 问题：消费者无法接收消息

**检查项**：

1. 队列是否存在：`channel.checkQueue()`
2. 路由键是否匹配
3. 是否正确绑定到交换器

```typescript
// 调试：查看队列信息
const queueInfo = await channel.checkQueue("my-queue");
console.log(queueInfo);
// { queue: 'my-queue', messageCount: 0, consumerCount: 1 }
```

---

## 8. 最佳实践建议

### 8.1 连接管理

| 建议             | 说明                             |
| ---------------- | -------------------------------- |
| **使用连接池**   | 高并发场景复用连接，避免频繁创建 |
| **单连接多通道** | 减少 TCP 连接数，每个通道独立    |
| **心跳检测**     | 启用心跳检测，及时发现断连       |
| **优雅关闭**     | 关闭前确认所有消息已处理         |

### 8.2 消息设计

| 建议            | 说明                             |
| --------------- | -------------------------------- |
| **使用 JSON**   | 消息内容使用 JSON 格式，便于调试 |
| **避免大消息**  | 大消息占用内存，建议 < 1MB       |
| **添加消息 ID** | 每条消息携带唯一 ID，便于追踪    |
| **版本化消息**  | 消息格式变更时添加版本字段       |

```typescript
// 推荐的的消息格式
interface QueueMessage<T = unknown> {
  id: string; // 唯一标识
  version: number; // 消息格式版本
  timestamp: string; // 创建时间
  type: string; // 消息类型
  payload: T; // 业务数据
}
```

### 8.3 错误处理

| 建议         | 说明                                 |
| ------------ | ------------------------------------ |
| **死信队列** | 处理失败的消息转入死信队列，便于排查 |
| **重试机制** | 使用指数退避策略，避免雪崩           |
| **监控告警** | 监控队列深度、消费者数量、消息积压   |

```typescript
// 死信队列配置
await channel.assertExchange("dlx", "direct", { durable: true });
await channel.assertQueue("dlq", { durable: true });
await channel.bindQueue("dlq", "dlx", "dead-letter");

await channel.assertQueue("main-queue", {
  durable: true,
  arguments: {
    "x-dead-letter-exchange": "dlx",
    "x-dead-letter-routing-key": "dead-letter"
  }
});
```

### 8.4 性能优化

| 优化项       | 说明                             |
| ------------ | -------------------------------- |
| **预取数量** | `prefetch(10)` 平衡并发和资源    |
| **批量处理** | 积攒消息批量处理，减少数据库 IO  |
| **异步确认** | 使用 publisher confirms 异步确认 |
| **消息压缩** | 大消息可考虑 gzip 压缩           |

```typescript
// 设置预取数量
await channel.prefetch(10);

// 批量消费
channel.consume("my-queue", async msg => {
  const messages = [];
  while (messages.length < 100) {
    const m = channel.get("my-queue");
    if (!m) break;
    messages.push(m);
  }

  // 批量处理
  await processBatch(messages);

  // 批量确认
  messages.forEach(m => channel.ack(m));
});
```

### 8.5 安全建议

| 建议         | 说明                   |
| ------------ | ---------------------- |
| **启用 TLS** | 生产环境启用 AMQPS     |
| **访问控制** | 使用 RabbitMQ 权限管理 |
| **网络隔离** | 不暴露管理端口到公网   |
| **定期更新** | 及时更新安全补丁       |

### 8.6 运维建议

| 建议         | 说明                               |
| ------------ | ---------------------------------- |
| **日志记录** | 记录消息发送、接收、处理的完整日志 |
| **健康检查** | 实现 `/health/rabbitmq` 检查接口   |
| **容量规划** | 预估消息量，合理配置队列和资源     |
| **备份策略** | 配置镜像队列，确保高可用           |

---

## 附录：管理后台使用

RabbitMQ 提供 Web 管理界面，便于日常运维。

### 访问地址

```
http://localhost:15672
用户名: questionnaire
密码: questionnaire123
```

### 主要功能

| 功能            | 说明                           |
| --------------- | ------------------------------ |
| **Queues**      | 查看队列、消息数量、消费者数量 |
| **Exchanges**   | 管理交换器、绑定关系           |
| **Connections** | 查看当前连接和通道             |
| **Channels**    | 查看通道详情、消息速率         |
| **Admin**       | 用户管理、策略配置             |

### 常用操作

1. **查看队列消息**：点击队列名称 → `Get Messages`
2. **清空队列**：点击队列 → `Purge Messages`
3. **删除队列**：点击队列 → `Delete`
4. **创建交换器**：Exchanges → `Add a new exchange`

---

## 参考资料

- [RabbitMQ 官方文档](https://www.rabbitmq.com/documentation.html)
- [amqplib API 文档](http://www.squaremobius.net/amqp.node/)
- [RabbitMQ 管理界面指南](https://www.rabbitmq.com/management.html)
- [项目架构文档](./architecture.md)
- [基础设施配置](./infrastructure.md)
