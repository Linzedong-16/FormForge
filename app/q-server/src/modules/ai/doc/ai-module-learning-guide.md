# AI 问卷生成模块 — 后端学习指导文档

> 面向读者：后端初学者（已掌握 Node.js/TypeScript 基础，了解 Fastify + Prisma 框架）
> 版本：1.0
> 日期：2026-06-21
> 本文档严格基于已落地的代码实现，不包含任何未实现的假设性内容。

---

## 目录

1. [模块总览](#1-模块总览)
2. [架构设计](#2-架构设计)
3. [中间件与基础设施](#3-中间件与基础设施)
4. [分层职责详解](#4-分层职责详解)
5. [最佳实践](#5-最佳实践)
6. [性能优化策略](#6-性能优化策略)
7. [安全设计](#7-安全设计)
8. [代码精读：逐文件详解](#8-代码精读逐文件详解)
9. [调试与排障指南](#9-调试与排障指南)

---

## 1. 模块总览

### 1.1 模块定位

本模块实现了"AI 一键生成问卷"的后端能力：用户输入自然语言描述（如"生成一份员工满意度调查"），系统调用 DeepSeek 大模型，**流式返回**结构化的问卷 JSON，前端逐组件渐进渲染到编辑器画布。

### 1.2 目录结构

```
app/q-server/src/modules/ai/
├── prompt-templates/                 # 提示词模板（独立文件夹管理）
│   ├── system-prompt.ts             # System Prompt 构建（参数化）
│   └── few-shot-examples.ts         # 2 个 Few-shot 完整问卷示例
├── schema-validator.ts              # AI 输出 JSON 校验 + 容错解析
├── ai-generate.schemas.ts           # Zod 校验 Schema（请求体 + 输出结构）
├── ai-generate.service.ts           # 核心服务：SSE 流式生成引擎
├── ai-generate.routes.ts            # HTTP 路由层：SSE 端点
├── index.ts                         # 模块统一导出入口
└── doc/
    └── ai-module-learning-guide.md  # 本文档

涉及的外部文件（非本模块但强相关）：
├── app/q-server/src/config/langchain.ts    # DeepSeek 模型工厂 + API Key 读取解密
├── app/q-server/src/utils/crypto.ts        # AES-256-GCM 加密/解密工具
├── app/q-server/src/utils/audit-log.ts     # 审计日志写入工具
├── app/q-server/src/utils/errors.ts        # AppError 错误类体系
├── app/q-server/src/utils/response.ts      # 统一响应结构 + BizCode 业务码
├── app/q-server/src/utils/zod.ts           # Zod → Fastify reply 适配器
└── app/q-server/src/routes/index.ts        # 根路由注册
```

### 1.3 核心数据流

```
用户浏览器                              q-server 后端                        DeepSeek API
    │                                       │                                    │
    │  POST /api/surveys/generate          │                                    │
    │  { prompt: "生成员工满意度调查" }      │                                    │
    │ ──────────────────────────────────→  │                                    │
    │                                       │  1. authenticate (JWT 校验)        │
    │                                       │  2. Zod 校验 prompt/count/language │
    │                                       │  3. Redis 原子限流检查              │
    │                                       │  4. 读取 system_configs (DB)        │
    │                                       │     → AES-256-GCM 解密 API Key     │
    │                                       │  5. 构建 System Prompt              │
    │                                       │                                    │
    │                                       │  POST https://api.deepseek.com/v1  │
    │                                       │  { model: "deepseek-chat",         │
    │                                       │    messages: [system, user],       │
    │                                       │    stream: true }                  │
    │                                       │ ─────────────────────────────────→ │
    │                                       │                                    │
    │                                       │  ◄── SSE token 流 ──────────────  │
    │                                       │                                    │
    │  ◄── SSE: event:token                │  6. 逐 token 推送 + 增量 JSON 解析  │
    │       data: {"text":"{"}             │  7. 完整组件检测 → component 事件   │
    │  ◄── SSE: event:component           │                                    │
    │       data: {"type":"single-select"} │                                    │
    │  ◄── SSE: event:done                │  8. 收集完毕 → Zod 校验 → done      │
    │       data: {title, components[]}    │  9. 审计日志（异步）                 │
    │                                       │                                    │
```

---

## 2. 架构设计

### 2.1 分层架构

本模块遵循 **三层架构**，每层职责严格分离：

```
┌─────────────────────────────────────────────────────────────┐
│  路由层 (ai-generate.routes.ts)                             │
│  · HTTP 协议转换（SSE 响应头、事件序列化）                    │
│  · 请求体校验（Zod Schema → parseAndRespond）               │
│  · 客户端连接管理（AbortController 创建/透传/清理）           │
│  · 异常兜底（捕获 Service 层未处理的异常）                    │
└──────────────────────┬──────────────────────────────────────┘
                       │ 依赖注入（FastifyInstance）
┌──────────────────────▼──────────────────────────────────────┐
│  服务层 (ai-generate.service.ts)                            │
│  · 业务逻辑编排（限流→配置→Prompt→API→校验→审计）             │
│  · AsyncGenerator 流式控制                                   │
│  · 增量 JSON 解析（tryParseNewComponents → scanJSONObjects） │
│  · 外部 AbortSignal 合并（超时 + 客户端断连）                 │
└──────────────────────┬──────────────────────────────────────┘
                       │
        ┌──────────────┼──────────────┐
        ▼              ▼              ▼
┌──────────────┐ ┌────────────┐ ┌──────────────┐
│ Schema 校验   │ │ Prompt 模板 │ │ 配置层        │
│ (Zod)        │ │ (参数化)    │ │ (langchain)  │
│              │ │            │ │              │
│ · 请求体     │ │ · 角色定义  │ │ · API Key    │
│ · AI 输出    │ │ · 组件目录  │ │   读取/解密  │
│ · 类型白名单 │ │ · Few-shot  │ │ · 模块级缓存 │
│ · 容错修复   │ │ · 设计规范  │ │ · ai_enabled │
└──────────────┘ └────────────┘ └──────────────┘
```

### 2.2 设计原则

| 原则           | 在本模块中的体现                                                         |
| -------------- | ------------------------------------------------------------------------ |
| **单一职责**   | routes 只做 HTTP 适配，service 只做业务编排，validator 只做 JSON 校验    |
| **依赖注入**   | `FastifyInstance` 通过构造函数注入 Service，不 import 全局单例           |
| **开闭原则**   | Prompt 模板独立文件夹，新增 Few-shot 示例只需修改 `few-shot-examples.ts` |
| **防御式编程** | 文本长度上限、组件数量上限、ReDoS 安全扫描器、双层 AbortSignal           |
| **优雅降级**   | Redis 不可用时限流放行；MinIO 不可用时不阻断生成；解析失败返回有效部分   |

### 2.3 模块间依赖关系

```
ai-generate.routes.ts
  ├── imports → authenticate (user/auth.middleware)
  ├── imports → AIGenerateService (ai-generate.service)
  ├── imports → generateSurveySchema (ai-generate.schemas)
  ├── imports → parseAndRespond (utils/zod)
  └── imports → AppError (utils/errors)

ai-generate.service.ts
  ├── imports → createDeepSeekChat (config/langchain)
  ├── imports → buildSystemPrompt (prompt-templates/system-prompt)
  ├── imports → validateAIResponse (schema-validator)
  └── imports → createAuditLog (utils/audit-log)

config/langchain.ts
  ├── imports → decrypt (utils/crypto)
  └── imports → FastifyInstance (fastify)

schema-validator.ts
  └── imports → aiResponseSchema, VALID_COMPONENT_TYPES (ai-generate.schemas)
```

**注意**：`config/langchain.ts` 位于 `src/config/` 而非 `src/modules/ai/`，因为 LangChain 配置是跨模块共享的基础设施（同时服务于 OpenAI、Anthropic 等其他模型）。

---

## 3. 中间件与基础设施

### 3.1 认证中间件 — `authenticate`

**来源**：`src/modules/user/auth.middleware.ts`

**调用位置**：`ai-generate.routes.ts` 第 21 行

```typescript
fastify.addHook("preHandler", authenticate);
```

**工作流程**：

1. 从 `Authorization: Bearer <token>` 头提取 JWT
2. 调用 AuthService 验证 Token 有效性
3. 将解码后的用户信息挂载到 `request.user`：
   - `request.user.userId: bigint` — 用户 ID
   - `request.user.email: string` — 邮箱
   - `request.user.role: string` — 角色（"admin" / "user" / "super_admin"）
4. Token 无效时抛 `AuthError("Token 无效", 401)`

**为什么使用 `addHook("preHandler")` 而非单独注册？**

- `preHandler` 钩子在路由处理函数之前执行，作用于当前插件内的所有路由
- 如果未来本模块新增更多路由，认证会自动覆盖，无需逐一手动添加

### 3.2 限流中间件 — `@fastify/rate-limit`

**来源**：Fastify 插件，已在应用启动时全局注册

**调用位置**：`ai-generate.routes.ts` 第 29-31 行

```typescript
config: {
  rateLimit: { max: 3, timeWindow: "1 minute" }
}
```

**工作机制**：

- Fastify 的 `@fastify/rate-limit` 基于内存或 Redis 实现请求计数
- `max: 3` + `timeWindow: "1 minute"` = 每个用户每分钟最多 3 次请求
- 超限时自动返回 HTTP 429 Too Many Requests
- `config` 对象挂载在路由定义上，由 Fastify 框架在请求进入时自动处理

**为什么 Service 层还有额外的 Redis 限流？**

这是**双重限流**策略：
| 层级 | 机制 | 作用 |
|------|------|------|
| Framework 层 | `@fastify/rate-limit` | 第一道防线，基于 IP/Token 的全局限流 |
| Service 层 | `checkRateLimit()` | 第二道防线，基于 Redis 原子计数器，带优雅降级 |

如果 `@fastify/rate-limit` 使用内存模式（默认），多实例部署时无法跨实例限流。Service 层的 Redis 限流弥补了这个不足。

### 3.3 Redis 的使用

**来源**：通过 `this.fastify.redis` 访问（应用启动时注册的 Redis 插件）

**调用位置**：`ai-generate.service.ts` 第 72-87 行

```typescript
// 原子化限流：SET NX EX + INCR
await this.fastify.redis.set(key, "0", "NX", "EX", 60);
const current = await this.fastify.redis.incr(key);
```

**Redis 命令详解**：

| 命令                 | 参数                                       | 含义                     |
| -------------------- | ------------------------------------------ | ------------------------ |
| `SET key 0 NX EX 60` | `NX` = 不存在时才设置，`EX 60` = 60 秒过期 | 原子初始化计数器         |
| `INCR key`           | —                                          | 原子递增，返回递增后的值 |

**为什么这样设计？**

分开调用 `SET` + `INCR` 而非 `MULTI/EXEC` 事务，因为：

1. `SET NX EX` 已经保证原子性（key 不存在 → 创建并设 TTL；key 存在 → 无操作）
2. `INCR` 本身是原子操作
3. 两个命令之间即使有微小间隙，也不会导致计数错误（INCR 不会让未初始化的 key 出错，Redis 会自动创建值为 0 的 key 再递增）

**优雅降级策略**：

```typescript
catch {
  this.fastify.log.warn("AI 生成限流 Redis 操作失败，降级放行");
  return true; // Redis 不可用时放行
}
```

这是一种**故障开放（fail-open）**策略：Redis 挂了不应该阻止用户使用 AI 功能。代价是限流失效，但系统可用性优先。

### 3.4 Prisma ORM 的使用

**来源**：通过 `this.fastify.prisma` 访问（应用启动时注册的 Prisma 插件）

**调用位置**：`config/langchain.ts` 第 48-50 行

```typescript
const configs = await fastify.prisma.systemConfig.findMany({
  where: { key: { in: ["ai_api_key", "ai_model", "ai_enabled"] } }
});
```

**查询模式解析**：

- `findMany` — 一次查询获取 3 条配置记录，减少 DB 往返
- `where.key.in` — Prisma 的数组筛选语法，等价于 SQL `WHERE key IN (...)`
- 返回 `SystemConfig[]`，通过 `.find()` 按 key 取值

### 3.5 LangChain 集成

**来源**：`@langchain/openai` + `@langchain/core/messages`

**调用位置**：`ai-generate.service.ts` 第 159 行

```typescript
const stream = await chatModel.stream(messages, {
  signal: timeoutController.signal
});

for await (const chunk of stream) { ... }
```

**技术要点**：

1. **为什么用 `ChatOpenAI` 而非 DeepSeek 专属类？**
   - DeepSeek API 完全兼容 OpenAI Chat Completions 格式
   - `ChatOpenAI` 已经实现了流式、重试、错误处理等能力
   - 只需修改 `configuration.baseURL` 指向 `https://api.deepseek.com/v1`

2. **`AsyncGenerator` + `for await` 模式**：
   - `generate()` 返回 `AsyncGenerator<SSEEvent>`，本质是一个可以 `yield` 多次的异步函数
   - 路由层用 `for await` 消费，每 yield 一次就写一次 SSE 事件
   - 相比回调或 EventEmitter，AsyncGenerator 的优势是**控制流清晰**，`return`/`break`/异常都自然映射

3. **AbortSignal 透传**：
   - LangChain 的 `stream()` 接受原生的 `AbortSignal`
   - 当 signal 触发 abort 时，LangChain 内部会终止 HTTP 连接
   - 我们不需要手动管理 LangChain 内部的连接池

---

## 4. 分层职责详解

### 4.1 路由层：ai-generate.routes.ts

**核心职责**：将 Service 的 `AsyncGenerator<SSEEvent>` 转换为 HTTP SSE 响应

```typescript
// 关键代码段（简化）
reply.raw.writeHead(200, {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no"
});

for await (const sseEvent of aiService.generate(userId, options, clientSignal)) {
  if (clientSignal.aborted) break;
  const line = `event: ${sseEvent.event}\ndata: ${JSON.stringify(sseEvent.data)}\n\n`;
  reply.raw.write(line);
}
```

**SSE 协议要点**：

- 每帧格式：`event: <事件名>\ndata: <JSON>\n\n`（双换行结尾必须）
- `Content-Type: text/event-stream` 告诉浏览器这是 SSE
- `X-Accel-Buffering: no` 禁用 Nginx 代理缓冲（否则 SSE 会变成块传输）
- 使用 `reply.raw.writeHead()` / `reply.raw.write()` / `reply.raw.end()` 直接操作底层 socket，因为 Fastify 的 `reply.send()` 不支持流式

**客户端断连处理的三层防护**：

```typescript
// 第 1 层：监听 socket close 事件
const clientController = new AbortController();
request.raw.once("close", () => clientController.abort());

// 第 2 层：透传 signal 给 Service，终止 LangChain 流
aiService.generate(userId, options, clientController.signal);

// 第 3 层：每次写 SSE 前检查 signal 状态
if (clientController.signal.aborted) break;
```

### 4.2 服务层：ai-generate.service.ts

**核心职责**：编排完整的 AI 生成流程

```
checkRateLimit() → 加载配置 → 构建Prompt → 流式调用API → 增量解析 → JSON校验 → 审计日志
```

**AsyncGenerator 设计要点**：

```typescript
async *generate(userId, options, clientSignal?): AsyncGenerator<SSEEvent> {
  // 1. 前置检查：限流、配置 → 失败则 yield error 后 return
  // 2. 流式循环：每个 token → yield token 事件 + 增量解析 component 事件
  // 3. try/catch/finally：异常 → yield error；清理 → finally
  // 4. 后置处理：JSON 校验 → yield done 事件 → 审计日志
}
```

**信号合并策略**：

```typescript
// 内部超时信号
const timeoutController = new AbortController();
const timeoutId = setTimeout(() => timeoutController.abort(), 60_000);

// 合并外部信号（客户端断连）
if (clientSignal) {
  clientSignal.addEventListener("abort", () => timeoutController.abort(), { once: true });
}

// 传给 LangChain 的是合并后的超时控制器
chatModel.stream(messages, { signal: timeoutController.signal });
```

为什么这样设计？LangChain 的 `stream()` 只接受一个 signal。将两个信号源（超时 + 客户端断连）收敛到一个 AbortController，任一触发都会中止 API 调用。

### 4.3 校验层：schema-validator.ts

**核心职责**：从 AI 原始文本中提取并校验 JSON

**容错策略（3 级递进）**：

````
步骤 1：JSON.parse(rawText)                        ← 理想情况
  ↓ 失败
步骤 2：正则提取 markdown 代码块中的 JSON           ← 常见异常（DeepSeek 偶尔加 ```）
  ↓ 失败
步骤 3：提取第一个 { 到最后一个 } 之间的内容        ← 极端异常（AI 在 JSON 前后加了解释）
  ↓ 失败
返回 warnings: ["AI 返回内容无法解析为 JSON"]
````

**为什么 AI 可能不输出纯 JSON？**

大语言模型本质是概率模型，即使 System Prompt 反复强调"只输出纯 JSON"，仍有概率出现：

- 包裹在 ` ```json ... ``` ` 代码块中
- 在 JSON 前加上 "好的，这是你要的问卷：" 之类的前导文字
- 在 JSON 后加上 "以上是生成的问卷，请查看" 之类的后续文字

容错解析就是为了处理这些情况，避免用户看到"生成失败"而实际内容是有效的。

### 4.4 提示词模板层：prompt-templates/

**为什么独立文件夹管理？**

1. **解耦**：Prompt 内容变更不需要修改 Service 代码
2. **版本管理**：可以 git diff 清晰看到每次 Prompt 调优的变更
3. **A/B 测试**：可以并行维护多套 Prompt，通过参数切换
4. **Few-shot 示例分离**：示例是 Prompt 中 token 消耗最大的部分，独立文件便于成本和效果管理

**参数化构建模式**：

```typescript
export function buildSystemPrompt(options: SystemPromptOptions = {}): string {
  const { count = 10, language = "zh-CN" } = options;

  const countConstraint = `题目数量：${count} 道左右（可浮动 ±2 道）`;
  const languageConstraint =
    language !== "zh-CN" ? `语言：使用 ${language === "en-US" ? "英文" : "日文"} 撰写所有内容` : "";

  return [
    ROLE_DEFINITION,
    COMPONENT_CATALOG,
    JSON_SCHEMA,
    DESIGN_GUIDELINES,
    countConstraint,
    languageConstraint,
    examplesText,
    closing
  ].join("\n\n");
}
```

- `count` 控制题目数量约束 → 用户可指定 5-20 道
- `language` 控制多语言输出 → 支持 zh-CN / en-US / ja-JP
- 各部分用双换行分隔 → LLM 更容易理解结构边界

---

## 5. 最佳实践

### 5.1 错误处理：分层+兜底

```
┌─ 路由层 ───────────────────────────────────────────────┐
│  try { ... } catch (err) {                              │
│    // 仅捕获 Service 层未处理的意外异常                    │
│    if (!aborted) writeSSEError(err.message)             │
│  }                                                      │
└─────────────────────────────────────────────────────────┘
┌─ 服务层 ───────────────────────────────────────────────┐
│  try { stream() ... } catch (err) {                     │
│    // 区分 AbortError（超时/取消）和真正的异常             │
│    if (err.name === "AbortError") { ... }               │
│    else { log.error(...); yield error }                 │
│  }                                                      │
└─────────────────────────────────────────────────────────┘
┌─ 校验层 ───────────────────────────────────────────────┐
│  // 永远不抛异常，始终返回 { data, warnings }            │
│  // 最坏情况：data.components = [], warnings = [原因]    │
└─────────────────────────────────────────────────────────┘
```

**关键认知**：校验层"永不抛异常"的设计让 Service 层可以安全地调用，不需要 try-catch 包裹。

### 5.2 审计日志：fire-and-forget 模式

```typescript
createAuditLog(this.fastify, userId, "ai_generate_survey", "survey", null, {
  prompt_length: options.prompt.length,
  generated_components: generatedCount,
  token_count: tokenCount,
  elapsed_ms: elapsed,
  has_warnings: validationResult.warnings.length > 0
}).catch(() => {});
```

**关键点**：

- `.catch(() => {})` — 审计日志写入失败**绝不能**阻塞或中断主流程
- `null` 作为 resourceId — 因为一次生成可能对应多个问卷组件，不绑定特定资源
- 记录的维度：耗时（性能监控）、token 数（成本统计）、组件数（质量评估）

### 5.3 敏感配置管理：AES-256-GCM 加密

```
写入流程：                          读取流程：
管理员输入明文 API Key              createDeepSeekChat() 被调用
  │                                    │
  ▼                                    ▼
encrypt(key) → 密文                aiConfigCache 命中？
  │                                 │ 是 → 直接返回缓存
  ▼                                 │ 否 → loadAIConfig(fastify)
system_configs.upsert()            │
  │                                 ▼
  ▼                                findMany({ key: { in: [...] } })
密文持久化到 PostgreSQL               │
                                      ▼
                                   decrypt(密文) → 明文（仅存于内存）
                                      │
                                      ▼
                                   new ChatOpenAI({ apiKey: 明文 })
```

**安全边界**：

- 明文**仅在 Node.js 进程内存**中存在，不会写入日志、数据库、环境变量
- 加密密钥 `CRYPTO_ENCRYPTION_KEY` 由运维团队独立管理
- 前端回显时脱敏：`sk-d●●●●●●●●●●●●●●●●●●b2`

### 5.4 输入校验：Zod Schema 双重防护

```typescript
// 第 1 道：路由层 Zod 校验
const generateSurveySchema = z.object({
  prompt: z.string().min(5).max(2000),
  count: z.number().int().min(5).max(20).optional(),
  language: z.enum(["zh-CN", "en-US", "ja-JP"]).optional()
});

// 第 2 道：AI 输出 Zod 校验（validator 内）
const aiResponseSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional().default(""),
  components: z.array(aiComponentSchema)
});
```

**为什么需要两道校验？**

- 第 1 道校验用户输入，防止注入和恶意请求
- 第 2 道校验 AI 输出，因为 AI 本质是不可靠的数据源

---

## 6. 性能优化策略

### 6.1 模块级配置缓存

**文件**：`config/langchain.ts`

```typescript
let aiConfigCache: AIConfigCache | null = null;

export const createDeepSeekChat = async (fastify, options?) => {
  if (!aiConfigCache) {
    aiConfigCache = await loadAIConfig(fastify); // 仅首次查 DB
  }
  // 后续调用直接使用缓存
};
```

**效果**：

- 从"每次请求 2 次 DB 查询"优化为"首次 1 次 + 后续 0 次"
- 对于限流 3 次/分钟的场景，缓存命中率 66%+
- 提供 `invalidateAIConfigCache()` 供管理员更新配置后手动失效

### 6.2 增量解析 + 上限保护

```typescript
// 文本过长 → 跳过增量解析（最终有完整校验兜底）
if (fullText.length > 100_000) return events;

// 组件数达上限 → 停止增量解析
if (componentCount >= MAX_PARSE_COMPONENTS) continue;
```

**效果**：

- 防止超大 JSON 在流式过程中导致 CPU 飙升
- `MAX_PARSE_COMPONENTS = 50` — 正常问卷 5-20 题，完全够用
- "跳过增量解析"不等于"跳过校验"，最终完整的 `validateAIResponse()` 仍然运行

### 6.3 ReDoS 安全的状态机扫描器

```typescript
// ❌ 旧实现（正则，有 ReDoS 风险）
const matches = text.match(/\{[^}]*(?:\{[^}]*\}[^}]*)*\}/g);

// ✅ 新实现（状态机，O(n) 时间，O(1) 额外空间）
for (let i = 0; i < text.length; i++) {
  if (ch === "{") depth++;
  else if (ch === "}") depth--;
  if (depth === 0) {
    /* 找到完整对象 */
  }
}
```

**为什么正则有问题？**

- 嵌套 `{}` 匹配的正则可能触发指数级回溯
- AI 输出的 JSON 不受我们控制，可能包含深层嵌套或畸形的结构
- 状态机的 O(n) 是确定的，不会因输入变化而导致性能突变

### 6.4 连接管理：及时释放资源

```typescript
// 正常路径
// 异常路径 → finally 统一清理
finally {
  clearTimeout(timeoutId);
  if (clientSignal) {
    clientSignal.removeEventListener("abort", onClientDisconnect);
  }
}

// 路由层
finally {
  request.raw.removeListener("close", onClientClose);
}

// 安全结束（双检查）
if (!reply.raw.writableEnded && reply.raw.writable) {
  reply.raw.end();
}
```

**三个清理点逐一说明**：

1. `clearTimeout` — 防止超时定时器泄漏
2. `removeEventListener` — 防止事件监听器累积
3. `writableEnded && writable` 双检查 — 防止向已关闭的 socket 写入触发 EPIPE

---

## 7. 安全设计

### 7.1 安全措施总览

| 层面       | 措施                                                                  | 文件/位置                       |
| ---------- | --------------------------------------------------------------------- | ------------------------------- |
| 认证       | JWT Bearer Token + `authenticate` 中间件                              | routes.ts:21                    |
| 授权       | `request.user` 提取后传入 Service，基于 userId 做权限校验             | routes.ts:54                    |
| 输入校验   | Zod Schema：prompt 5-2000 字符，count 整数 5-20，language 枚举        | schemas.ts:53-60                |
| 限流       | Framework 层 `@fastify/rate-limit` + Service 层 Redis 原子计数        | routes.ts:30 + service.ts:72-87 |
| 密钥安全   | AES-256-GCM 加密存储，仅内存明文，不写日志                            | langchain.ts:60                 |
| ReDoS 防护 | 状态机替代正则扫描 JSON                                               | service.ts:279-335              |
| 注入防护   | `count` 是整数（`z.number().int()`），`language` 是枚举（不拼接 SQL） | schemas.ts:53-60                |
| 审计       | 每次生成记录 `ai_generate_survey` 审计日志                            | service.ts:223-229              |
| 传输安全   | 外部 HTTPS (DeepSeek API)，内部 HTTP 但依赖内网隔离                   | langchain.ts:101                |

### 7.2 API Key 安全链路

```
存储态（密文）         传输态（内网）         使用态（内存明文）
─────────────────    ─────────────────    ─────────────────
PostgreSQL            Fastify → Prisma     Node.js 进程堆内存
system_configs        HTTP (内网隔离)       ChatOpenAI 实例
value: <hex密文>                            apiKey 属性
                                            ↓
AES-256-GCM 加密      decrypt(密文)        仅在 process.env 和
密钥:                  ↓                    ChatOpenAI 内部使用
CRYPTO_ENCRYPTION     明文（仅存于变量）
_KEY (环境变量)                             进程退出 → 明文消失
```

---

## 8. 代码精读：逐文件详解

### 8.1 ai-generate.schemas.ts

**知识点：`z.enum()` + `as const` 模式**

```typescript
export const VALID_COMPONENT_TYPES = ["single-select", "multi-select" /* ... 35 种 */] as const;

export type ValidComponentType = (typeof VALID_COMPONENT_TYPES)[number];
// 等价于：type ValidComponentType = "single-select" | "multi-select" | ...
```

`as const` 让 TypeScript 将数组推断为**字面量类型的元组**而非 `string[]`，然后 `[number]` 索引取出所有元素类型的联合。这保证了类型白名单和运行时的值完全一致。

**知识点：`z.coerce` vs `z.number()`**

本模块中 `count` 使用 `z.number().int().min(5).max(20)`。如果前端以 FormData 或 URLSearchParams 发送（值总是字符串），需要用 `z.coerce.number()` 做自动转换。当前接口是 JSON body，所以直接用 `z.number()`。

### 8.2 ai-generate.service.ts

**知识点：`AsyncGenerator` 的 `return` vs `yield`**

```typescript
async *generate(): AsyncGenerator<SSEEvent> {
  if (error) {
    yield { event: "error", data: { message: "..." } };
    return;  // ← 终止生成器
  }
  // ... 正常流程
}
```

`return` 在 AsyncGenerator 中等价于 `{ done: true }`，调用方的 `for await` 循环会正常退出。

**知识点：`AbortController` + `AbortSignal` 模式**

```typescript
const controller = new AbortController();
setTimeout(() => controller.abort(), 60_000);

const stream = await chatModel.stream(messages, {
  signal: controller.signal // LangChain 内部监听此 signal
});
```

这是 Web API 标准模式，从浏览器端延伸到 Node.js 端。LangChain 的 `stream()` 接受 `AbortSignal`，内部会在 `abort` 事件触发时通过 `fetch()` 的 `signal` 机制终止 HTTP 连接。

### 8.3 schema-validator.ts

**知识点：多级容错的设计哲学**

不是"解析失败就报错"，而是"尽最大努力提取有效数据，同时记录问题"。

```typescript
// 始终返回 { data, warnings }，从不抛异常
// 最坏情况：data.components = [], warnings = ["原因"]
return {
  data: { title: title || "未命名问卷", description, components },
  warnings
};
```

**知识点：`attemptRepair` 的防御性修复**

```typescript
components = obj.components
  .filter(c => c !== null && typeof c === "object")  // 过滤 null/非对象
  .map(c => ({
    type: typeof c.type === "string" ? c.type : "",   // 类型检查
    config: typeof c.config === "object" ? ... : {}    // 类型检查
  }))
  .filter(c => VALID_COMPONENT_TYPES.includes(c.type)); // 白名单过滤
```

每一层 `.filter()` 和类型检查都是一道安全网。

### 8.4 prompt-templates/system-prompt.ts

**知识点：Few-shot 示例的 token 成本**

```typescript
const examplesText = FEW_SHOT_EXAMPLES.map(ex => `\n${ex.label}：\n${JSON.stringify(ex.json, null, 2)}`).join("");
```

- `JSON.stringify(ex.json, null, 2)` — 2 空格缩进，让 LLM 更容易学习格式（结构化数据+缩进→更好的输出一致性）
- 2 个完整示例约消耗 2,000 tokens，是 System Prompt 中最大的 token 消耗来源
- 如果未来需要降低成本，可以减少为 1 个示例

**知识点：参数化约束的注入安全**

```typescript
const countConstraint = `题目数量：${count} 道左右`;
```

`count` 的类型是 `number`（经 Zod `z.number().int()` 校验），不会包含恶意字符。如果是字符串拼接，需要使用模板引擎或 sanitizer。

### 8.5 config/langchain.ts

**知识点：模块级缓存 vs Redis 缓存**

| 维度     | 模块级缓存             | Redis 缓存           |
| -------- | ---------------------- | -------------------- |
| 生命周期 | 进程级，服务重启清空   | 独立进程，跨实例共享 |
| 访问速度 | 微秒级（内存直接访问） | 毫秒级（网络 IO）    |
| 一致性   | 单实例强一致           | 多实例最终一致       |
| 适用场景 | 低频变更、单实例够用   | 高频读写、多实例部署 |

AI 配置属于**低频变更**场景（管理员改一次后可能几个月不变），模块级缓存是最优选择。

---

## 9. 调试与排障指南

### 9.1 常见错误排查

| 错误现象                    | 可能原因                                  | 排查步骤                                                        |
| --------------------------- | ----------------------------------------- | --------------------------------------------------------------- |
| `DeepSeek API Key 未配置`   | `system_configs` 表中无 `ai_api_key` 记录 | `SELECT * FROM system_configs WHERE key LIKE 'ai_%'`            |
| `AI 生成功能已被管理员关闭` | `ai_enabled` 为 `false`                   | 同上，检查 `ai_enabled` 的值                                    |
| `AI 生成超时`               | DeepSeek API 响应超过 60 秒               | 查看 `audit_logs` 表 `ai_generate_survey` 记录中的 `elapsed_ms` |
| SSE 事件未到达前端          | Nginx 缓冲了响应                          | 确认响应头包含 `X-Accel-Buffering: no`                          |
| 增量解析不工作              | JSON 格式非标准                           | 查看 `done` 事件中的 `_warnings` 字段                           |

### 9.2 日志关键字

```bash
# 查看 AI 生成完成日志
grep "AI 问卷生成完成" app.log

# 查看 AI 生成异常
grep "AI 问卷生成异常" app.log

# 查看限流降级
grep "AI 生成限流 Redis 操作失败" app.log

# 查看 DeepSeek API Key 读取
grep "读取 DeepSeek API Key" app.log
```

### 9.3 审计日志查询

```sql
-- 查看最近的 AI 生成记录
SELECT
  created_at,
  details->>'prompt_length' AS prompt_len,
  details->>'generated_components' AS comps,
  details->>'token_count' AS tokens,
  details->>'elapsed_ms' AS elapsed,
  details->>'has_warnings' AS warnings
FROM audit_logs
WHERE action = 'ai_generate_survey'
ORDER BY created_at DESC
LIMIT 20;
```

### 9.4 手动测试 SSE 端点

```bash
curl -N -X POST http://localhost:8080/api/surveys/generate \
  -H "Authorization: Bearer <your_token>" \
  -H "Content-Type: application/json" \
  -d '{"prompt":"生成一份5道题的客户满意度调查","count":5}'
```

`-N` 参数禁用 curl 的缓冲，确保 SSE 事件逐条输出。

---

## 附录 A：与项目其他模块的对比学习

| 特性     | AI 生成                  | 头像上传         | 问卷 CRUD         |
| -------- | ------------------------ | ---------------- | ----------------- |
| 响应模式 | SSE 流式                 | JSON 一次性      | JSON 一次性       |
| 敏感配置 | AES-256-GCM DB 存储      | —                | —                 |
| 限流层级 | Framework + Service 双层 | Framework 单层   | Framework 单层    |
| 缓存策略 | 模块级内存缓存           | 无               | Redis Cache-Aside |
| 错误处理 | 降级返回部分结果         | 严格校验全部拒绝 | 事务回滚          |
| 外部依赖 | DeepSeek API (HTTPS)     | MinIO (S3)       | —                 |

## 附录 B：关键术语表

| 术语                            | 解释                                                            |
| ------------------------------- | --------------------------------------------------------------- |
| **SSE**                         | Server-Sent Events，服务器向客户端单向推送事件的 HTTP 协议      |
| **AsyncGenerator**              | ES2018 引入的异步生成器，可 `yield` 多次异步值的函数            |
| **AbortController/AbortSignal** | Web API 标准的中止信号机制，用于取消异步操作                    |
| **ReDoS**                       | Regular Expression Denial of Service，利用正则回溯导致 CPU 耗尽 |
| **AES-256-GCM**                 | 一种对称加密算法，GCM 模式同时提供加密和完整性校验              |
| **Few-shot**                    | Prompt Engineering 术语，在 Prompt 中提供示例来引导模型输出格式 |
| **Cache-Aside**                 | 缓存策略：先查缓存，miss 则查 DB 并回填缓存                     |
| **Fail-open**                   | 故障开放：依赖服务不可用时放行而非阻断                          |
| **EPIPE**                       | 向已关闭的 socket 写入数据时触发的系统错误                      |
