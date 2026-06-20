# Debug Session: api-hang-no-response

| 字段         | 值                                                                       |
| ------------ | ------------------------------------------------------------------------ |
| **状态**     | [VERIFIED]                                                               |
| **问题描述** | 前端调用后端接口时接口挂起，无报错信息返回，导致前端长时间无响应         |
| **影响范围** | 所有 survey 相关接口（create/update/delete/list/publish/apply-template） |
| **环境**     | Fastify + Prisma + PostgreSQL + Redis                                    |
| **创建时间** | 2026-06-20                                                               |

---

## 根因分析报告

### 问题根因

接口挂起由 **3 个层面的超时缺失** 叠加导致：

### 根因 1: Redis 插件未配置超时 — `redis.ts`（严重程度：高）

**文件**: `app/q-server/src/plugins/redis.ts`

| 问题                    | 说明                                                       |
| ----------------------- | ---------------------------------------------------------- |
| 未设置 `connectTimeout` | Redis 连接断开时 TCP 不会释放，导致 `redis.get()` 永久阻塞 |
| 未设置 `commandTimeout` | Redis 命令执行无超时，慢查询会导致请求卡死                 |
| 未配置 `retryStrategy`  | 连接失败后无重试策略，直接失败                             |
| 未配置 `lazyConnect`    | 启动时立即连接，若 Redis 不可用，服务直接崩溃              |

**影响链路**:

```
前端请求 → Vite proxy → Fastify
  → authenticate 中间件
    → verifyToken
      → cache.get() → redis.get()  ← Redis 连接断开，TCP 阻塞无超时
  → 请求挂起，永不返回
```

### 根因 2: Fastify 未设置请求超时 — `app.ts`（严重程度：高）

**文件**: `app/q-server/src/app.ts`

| 问题                       | 说明                                         |
| -------------------------- | -------------------------------------------- |
| 未设置 `requestTimeout`    | 默认 0（无超时），请求处理阻塞时永不释放连接 |
| 未设置 `connectionTimeout` | 恶意连接可长期占用资源                       |
| 未注册 `onTimeout` 钩子    | 超时后无 408 响应，客户端只能干等            |

### 根因 3: 前端 axios 超时过长且无错误处理 — `server.ts`（严重程度：中）

**文件**: `app/q-editor/src/api/clients/server.ts`

| 问题                    | 说明                                          |
| ----------------------- | --------------------------------------------- |
| `timeout: 50000`（50s） | 超时时间过长，用户等待体验极差                |
| 无超时错误处理          | `ECONNABORTED` 错误未捕获，用户看不到任何提示 |
| 无网络错误处理          | 后端不可达时无提示                            |
| 无 5xx 错误处理         | 服务器错误未统一提示                          |

### 根因 4: Vite 代理无超时配置 — `vite.config.ts`（严重程度：低）

| 问题                   | 说明                           |
| ---------------------- | ------------------------------ |
| proxy 未设置 `timeout` | 后端无响应时 Vite 代理也会挂起 |

---

## 修复方案

### 修复 1: Redis 插件 — 添加超时与重试策略

**文件**: `app/q-server/src/plugins/redis.ts`

```typescript
fastify.register(fastifyRedis, {
  // ... 原有配置 ...
  connectTimeout: 5000, // 连接超时 5s
  commandTimeout: 3000, // 命令执行超时 3s
  maxRetriesPerRequest: 3, // 最多重试 3 次
  retryStrategy(times) {
    // 递增间隔重试
    if (times > 3) return null;
    return Math.min(times * 200, 2000);
  },
  reconnectOnError(err) {
    // 特定错误自动重连
    return ["READONLY", "ECONNRESET", "ETIMEDOUT"].some(e => err.message.includes(e));
  },
  lazyConnect: true, // 懒连接，避免启动崩溃
  enableReadyCheck: true
});
```

### 修复 2: Fastify — 请求超时 + onTimeout 钩子

**文件**: `app/q-server/src/app.ts`

```typescript
const app = Fastify({
  // ... 原有配置 ...
  requestTimeout: 30000, // 请求超时 30s
  connectionTimeout: 10000, // 连接超时 10s
  keepAliveTimeout: 72000 // Keep-Alive 72s
});

// 超时钩子 — 返回 408 状态码
app.addHook("onTimeout", async (request, reply) => {
  request.log.warn({ url: request.url }, "请求超时");
  if (!reply.sent) {
    reply.status(408).send({ data: null, code: 408, msg: "请求处理超时，请稍后重试" });
  }
});
```

### 修复 3: 前端 — 超时/网络/5xx 错误统一处理

**文件**: `app/q-editor/src/api/clients/server.ts`

| 修改     | 变更前  | 变更后                                                        |
| -------- | ------- | ------------------------------------------------------------- |
| 超时时间 | 50000ms | 15000ms                                                       |
| 超时错误 | 无处理  | `ElMessage.error("请求超时，请检查网络连接后重试")`           |
| 网络错误 | 无处理  | `ElMessage.error("网络连接失败，请检查后端服务是否正常运行")` |
| 5xx 错误 | 无处理  | `ElMessage.error(msg)` 统一提示                               |
| 429 限流 | 无处理  | `ElMessage.warning("请求过于频繁，请稍后重试")`               |
| 其他错误 | 无处理  | 透传后端 `msg` 并提示                                         |

### 修复 4: Vite 代理 — 超时配置

**文件**: `app/q-editor/vite.config.ts`

```typescript
proxy: {
  "/api": {
    target: "http://localhost:8080",
    changeOrigin: true,
    secure: false,
    timeout: 20000,  // 代理超时 20s
    // ...
  }
}
```

### 修复 5: 后端插桩日志 — 认证中间件 + 缓存

**文件**: `app/q-server/src/modules/user/auth.middleware.ts` / `app/q-server/src/utils/cache.ts`

在认证中间件和 Redis 缓存操作添加了 `[debug]` 前缀日志，记录各阶段的耗时（`latency_ms`），便于后续排查。

---

## 超时层级防护

修复后的完整超时层级：

```
┌─────────────────────────────────────────────────────────┐
│ 前端 axios 超时 (15s)                                    │
│  ├─ Vite proxy 超时 (20s)                               │
│  │  ├─ Fastify connectionTimeout (10s)                  │
│  │  │  ├─ Fastify requestTimeout (30s)                  │
│  │  │  │  ├─ Redis commandTimeout (3s)                  │
│  │  │  │  ├─ Redis connectTimeout (5s)                  │
│  │  │  │  ├─ Prisma pool_timeout (10s)                  │
│  │  │  │  └─ 业务逻辑处理                               │
│  │  │  └─ onTimeout → 408 响应                          │
│  │  └─ 代理超时 → 504 响应                              │
│  └─ axios 超时 → ElMessage.error("请求超时")            │
└─────────────────────────────────────────────────────────┘
```

**设计原则**: 前端的超时时间必须小于后端，确保用户能快速收到错误反馈，而不是等待后端超时。

---

## 验证步骤

1. 启动后端服务 `npm run dev`，观察 Redis 连接日志
2. 启动前端服务 `npm run dev`，打开浏览器 DevTools Network 面板
3. 调用任意 survey 接口，观察响应时间
4. 模拟 Redis 不可用：停止 Redis → 调用接口 → 应 3s 内返回错误，而非挂起
5. 模拟慢查询：在 Prisma 查询前加 `await new Promise(r => setTimeout(r, 35000))` → 应 30s 后返回 408
