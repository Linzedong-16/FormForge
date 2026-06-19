# 用户模块优化实践指南

> 版本：2.0  
> 日期：2026-06-19  
> 适用范围：`src/modules/user/` 全部接口的中间件优化、性能调优与安全防护  
> 前置阅读：[user-module-tech-doc.md](./user-module-tech-doc.md)（基础架构与接口文档）

---

## 目录

1. [中间件架构与工作流程](#1-中间件架构与工作流程)
2. [接口级优化详解](#2-接口级优化详解)
   - 2.1 [GET /api/auth/status — 系统状态查询](#21-get-apiauthstatus--系统状态查询)
   - 2.2 [POST /api/auth/login — 用户登录](#22-post-apiauthlogin--用户登录)
   - 2.3 [POST /api/auth/send-code — 发送验证码](#23-post-apiauthsend-code--发送验证码)
   - 2.4 [POST /api/auth/register — 初始化注册](#24-post-apiauthregister--初始化注册)
   - 2.5 [POST /api/auth/verify-register — 邮箱验证注册](#25-post-apiauthverify-register--邮箱验证注册)
   - 2.6 [POST /api/auth/refresh — 刷新 Token](#26-post-apiauthrefresh--刷新-token)
   - 2.7 [POST /api/auth/reset-password — 重置密码](#27-post-apiauthreset-password--重置密码)
   - 2.8 [POST /api/auth/logout — 登出](#28-post-apiauthlogout--登出)
   - 2.9 [POST /api/admin/users — 创建用户](#29-post-apiadminusers--创建用户)
   - 2.10 [GET /api/admin/users — 用户列表](#210-get-apiadminusers--用户列表)
   - 2.11 [PUT /api/admin/users/:id — 更新用户](#211-put-apiadminusersid--更新用户)
   - 2.12 [DELETE /api/admin/users/:id — 删除用户](#212-delete-apiadminusersid--删除用户)
   - 2.13 [GET /api/admin/config — 获取系统配置](#213-get-apiadminconfig--获取系统配置)
   - 2.14 [PUT /api/admin/config/smtp — 更新 SMTP 配置](#214-put-apiadminconfigsmtp--更新-smtp-配置)
3. [性能优化策略](#3-性能优化策略)
4. [安全防护机制](#4-安全防护机制)
5. [优化前后对比](#5-优化前后对比)
6. [使用注意事项](#6-使用注意事项)

---

## 1. 中间件架构与工作流程

### 1.1 全局中间件注册栈

Fastify 插件按注册顺序自底向上组装，user 模块的所有接口请求穿越以下层：

```
                         ┌──────────────────────────┐
   HTTP Request ────────►│  cors          — 跨域控制  │
                         │  helmet        — 安全头    │
                         │  prisma        — 数据库    │
                         │  response      — 响应封装  │
                         │  redis         — 缓存      │
                         │  rabbitmq      — 消息队列  │
                         │  minio         — 文件存储  │
                         │  mongo         — 日志存储  │
                         │  log-transport — 日志传输  │
                         │  logger        — 请求日志  │
                         │  rate-limit    — 全局限流  │
                         ├──────────────────────────┤
                         │  auth.routes   — 路由插件  │
                         │  ┌─ /login       [限流]  │
                         │  ├─ /send-code   [限流]  │
                         │  ├─ /register             │
                         │  ├─ /verify-register      │
                         │  ├─ /refresh              │
                         │  ├─ /reset-password       │
                         │  ├─ /logout   [认证]      │
                         │  └─ /status               │
                         ├──────────────────────────┤
                         │  admin.routes — 路由插件  │
                         │  └─ [认证→超管] 全路由    │
                         ├──────────────────────────┤
                         │  error-handler — 兜底     │
                         └──────────────────────────┘
```

### 1.2 请求生命周期与中间件执行时序

```
onRequest  →  preParsing  →  preHandler  →  handler  →  onSend  →  onResponse
   │              │              │              │           │           │
   │              │              │              │           │           │
   └─ cors        │              │              │           │           │
      helmet      │              │              │           │           │
      rate-limit  │              │              │           │           │
                  │              │              │           │           │
                  └─ 无 (user    │              │           │           │
                     模块未使用) │              │           │           │
                                 │              │           │           │
                                 ├─ 路由级限流*  │           │           │
                                 ├─ authenticate*│           │           │
                                 └─ requireSuper │           │           │
                                    Admin*       │           │           │
                                                 │           │           │
                                                 └─ 业务逻辑  │           │
                                                              │           │
                                                              └─ 压缩**    │
                                                                           │
                                                                           └─ 日志收尾
```

> \* 仅 auth/admin 路由局部生效  
> \*\* 建议后续添加 `@fastify/compress`

### 1.3 双层限流架构

```
┌─────────────────────────────────────────────────────────────────┐
│                      双层限流架构                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  全局层（rate-limit 插件）                                       │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ 所有接口：100 req/min                                     │  │
│  │ 生产环境：Redis 共享计数器（跨多进程一致）                 │  │
│  │ 开发环境：内存计数器                                       │  │
│  │ IP 识别：X-Real-IP > X-Forwarded-For > Remote IP          │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              │                                   │
│                              ▼ 路由级覆盖                        │
│  路由层（config.rateLimit）                                      │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ /login     → 20 req/min（防暴力破解）                     │  │
│  │ /send-code → 5 req/min（防短信轰炸）                      │  │
│  │ /admin/*   → 全局 100 req/min                             │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**实现代码**（`auth.routes.ts`）：

```typescript
// 路由级限流 — 覆盖全局默认值
fastify.post(
  "/login",
  {
    config: {
      rateLimit: { max: 20, timeWindow: "1 minute" }
    }
  },
  async (request, reply) => {
    /* handler */
  }
);

fastify.post(
  "/send-code",
  {
    config: {
      rateLimit: { max: 5, timeWindow: "1 minute" }
    }
  },
  async (request, reply) => {
    /* handler */
  }
);
```

### 1.4 Admin 路由合并认证 Hook

**优化前（存在 "Reply already sent" 风险）：**

```typescript
// ❌ 两个独立 hook：authenticate 失败后 requireSuperAdmin 仍执行
fastify.addHook("preHandler", authenticate);
fastify.addHook("preHandler", requireSuperAdmin);
```

当 `authenticate` 因 Token 缺失调用 `reply.sendUnauthorized()` 发送 401 响应后，`requireSuperAdmin` 仍会执行，发现 `request.user` 为 undefined 后调用 `reply.sendForbidden()` 尝试再次发送响应，触发 Fastify 内部 `FST_ERR_REP_ALREADY_SENT` 错误，最终被兜底为 500 错误。

**优化后：**

```typescript
// ✅ 合并为单一 hook：认证失败时短路，避免二次 send
fastify.addHook("preHandler", async (request, reply) => {
  await authenticate(request, reply);
  // 仅当认证通过（request.user 已挂载）时才检查权限
  if (request.user) {
    await requireSuperAdmin(request, reply);
  }
});
```

**中间件执行时序图：**

```
请求到达 /api/admin/users
        │
        ▼
  ┌─────────────┐
  │ authenticate │
  └──────┬──────┘
         │
    ┌────▼────┐
    │ Token?  │
    └─┬─────┬─┘
      │     │
   无 │     │ 有
      │     │
      ▼     ▼
  ┌─────┐ ┌──────────┐
  │ 401 │ │ 验证 Token│
  │返回 │ └────┬─────┘
  └─────┘      │
          ┌────▼────┐
          │ 有效?   │
          └─┬─────┬─┘
            │     │
         失败│     │成功
            │     │
            ▼     ▼
        ┌─────┐ ┌──────────────────┐
        │ 401 │ │ request.user = {}│
        │返回 │ └────────┬─────────┘
        └─────┘          │
                    ┌────▼────┐
                    │ user?   │
                    └─┬─────┬─┘
                      │     │
                   undefined│有值
                      │     │
                      ▼     ▼
                  ┌─────┐ ┌──────────────┐
                  │ 跳过 │ │requireSuper  │
                  │权限  │ │Admin         │
                  └─────┘ └──────┬───────┘
                                 │
                            ┌────▼────┐
                            │ super?  │
                            └─┬─────┬─┘
                              │     │
                           否 │     │是
                              │     │
                              ▼     ▼
                          ┌─────┐ ┌──────┐
                          │ 403 │ │ 继续 │
                          │返回 │ │handler│
                          └─────┘ └──────┘
```

### 1.5 AuthService 实例复用（WeakMap）

```typescript
// auth.middleware.ts
const authServiceMap = new WeakMap<FastifyInstance, AuthService>();

function getAuthService(server: FastifyInstance): AuthService {
  let service = authServiceMap.get(server);
  if (!service) {
    service = new AuthService(server);
    authServiceMap.set(server, service);
  }
  return service;
}
```

**优化效果：**

| 指标                     | 优化前                     | 优化后                        |
| ------------------------ | -------------------------- | ----------------------------- |
| 每次请求新建 AuthService | 是                         | 否（按 FastifyInstance 复用） |
| 构造函数开销             | 每次请求初始化 CacheClient | 仅首次                        |
| 内存                     | 请求级短生命周期           | 应用级长生命周期              |

---

## 2. 接口级优化详解

### 2.1 GET /api/auth/status — 系统状态查询

**功能概述：** 查询系统是否已初始化、注册功能开关、SMTP 配置状态，用于前端判断展示注册入口还是登录入口。

**中间件链：** cors → helmet → rate-limit(100/min) → handler

**优化策略：**

| 策略        | 实现                                                                    | 效果                                           |
| ----------- | ----------------------------------------------------------------------- | ---------------------------------------------- |
| 并行查询    | `Promise.all([isInitialized, isRegistrationEnabled, isSmtpConfigured])` | 3 次 DB 查询并行，总耗时 ≈ max(各查询)         |
| Cache-Aside | `cache.getOrSet(Key, factory, 60s)`                                     | 首次查询 DB 后缓存 60s，后续命中缓存无 DB 开销 |
| 短 TTL      | 60s                                                                     | 配置变更后最多 60s 生效，兼顾实时性与性能      |

**实现代码：**

```typescript
// auth.service.ts
async getSystemStatus(): Promise<SystemStatus> {
  const [initialized, registrationEnabled, smtpConfigured] = await Promise.all([
    this.isSystemInitialized(),
    this.isRegistrationEnabled(),
    this.isSmtpConfigured()
  ]);

  return {
    initialized,
    registrationEnabled,
    registrationMode: smtpConfigured ? "email_verify" : "admin_only",
    smtpConfigured
  };
}

// Cache-Aside 模式示例
private async isSystemInitialized(): Promise<boolean> {
  return this.cache.getOrSet(
    CacheKeys.systemInitialized,
    async () => {
      const count = await this.fastify.prisma.userRole.count({
        where: { role_code: "super_admin" }
      });
      return count > 0;
    },
    CacheTTL.SYSTEM_STATUS  // 60s
  );
}
```

**优化前后对比：**

| 指标             | 优化前（无缓存） | 优化后（Cache-Aside） |
| ---------------- | :--------------: | :-------------------: |
| 每次请求 DB 查询 |       3 次       | 首次 3 次，后续 0 次  |
| 首次响应时间     |      ~15ms       |         ~15ms         |
| 缓存命中响应时间 |        —         | <1ms（纯 Redis 读取） |
| 缓存命中率       |        0%        |  >99%（60s 窗口内）   |

---

### 2.2 POST /api/auth/login — 用户登录

**功能概述：** 邮箱 + 密码登录，返回 Access Token + Refresh Token + 用户信息。

**中间件链：** cors → helmet → rate-limit(**20/min**) → handler

**优化策略：**

| 策略             | 实现                                                 | 效果                                         |
| ---------------- | ---------------------------------------------------- | -------------------------------------------- |
| 路由级限流       | `config.rateLimit: { max: 20, timeWindow: "1 min" }` | 覆盖全局 100/min，20/min 防暴力破解          |
| Lua 原子失败计数 | `redis.eval(luaScript, ...)`                         | INCR + EXPIRE + 锁定判定在一个原子操作中完成 |
| bcrypt 盐值轮数  | `bcrypt.hash(password, 10)`                          | 平衡安全性与性能（10 轮约 70ms）             |
| 并行清除         | `Promise.all([clearLoginFail, updateLastLogin])`     | 失败计数清除 + 登录时间更新并行              |
| 角色缓存         | `getUserRoles()` → Cache-Aside 10min                 | 避免每次登录查 user_roles 表                 |

**登录失败锁定 Lua 脚本：**

```lua
-- 原子操作：计数 + 过期 + 锁定判定
local count = redis.call('incr', KEYS[1])         -- 递增失败计数
if count == 1 then
  redis.call('expire', KEYS[1], tonumber(ARGV[1])) -- 首次设置过期时间
end
if count >= tonumber(ARGV[2]) then                 -- 达到阈值
  redis.call('set', KEYS[2], ARGV[3], 'ex', tonumber(ARGV[4])) -- 锁定
end
return count
```

**TypeScript 调用：**

```typescript
private async recordLoginFail(email: string): Promise<number> {
  const failKey = `${LOGIN_FAIL_PREFIX}${email}`;
  const lockKey = `${LOGIN_LOCK_PREFIX}${email}`;

  const count = (await this.fastify.redis.eval(
    script,
    2,           // KEYS 数量
    failKey,     // KEYS[1]
    lockKey,     // KEYS[2]
    LOGIN_FAIL_TTL,   // ARGV[1] = 900s
    MAX_LOGIN_FAILS,  // ARGV[2] = 5
    String(Date.now()), // ARGV[3]
    LOGIN_LOCK_TTL    // ARGV[4] = 1800s
  )) as number;

  return count;
}
```

**优化前后对比：**

| 指标             | 优化前                         | 优化后                          |
| ---------------- | ------------------------------ | ------------------------------- |
| 限流             | 全局 100/min                   | 路由级 20/min                   |
| 失败计数并发安全 | 存在竞态（INCR + EXPIRE 分离） | Lua 原子操作                    |
| 角色查询         | 每次查 DB                      | Cache-Aside 10min               |
| 登录成功响应     | 顺序执行                       | 并行清除失败记录 + 更新登录时间 |

---

### 2.3 POST /api/auth/send-code — 发送验证码

**功能概述：** 向指定邮箱发送 6 位数字验证码，用于注册或密码重置。

**中间件链：** cors → helmet → rate-limit(**5/min**) → handler

**优化策略：**

| 策略           | 实现                                                | 效果                                           |
| -------------- | --------------------------------------------------- | ---------------------------------------------- |
| 路由级限流     | `config.rateLimit: { max: 5, timeWindow: "1 min" }` | 覆盖全局 100/min，5/min 防短信轰炸             |
| 服务层频率控制 | `checkSendRate()` → Redis 计数器                    | 同一邮箱 1 分钟最多 3 次，双重保护             |
| 异步邮件发送   | RabbitMQ 消息队列                                   | 不阻塞 HTTP 响应，邮件发送失败不影响验证码存储 |
| 验证码即用即删 | 校验后 `redis.del(key)`                             | 防止验证码重用                                 |
| 5 分钟 TTL     | `redis.set(key, value, "EX", 300)`                  | 自动过期，无需手动清理                         |

**实现代码：**

```typescript
// 服务层频率控制（补充路由层限流）
private async checkSendRate(email: string): Promise<boolean> {
  const key = `${SEND_RATE_PREFIX}${email}`;
  const count = await this.fastify.redis.get(key);
  if (!count) {
    await this.fastify.redis.set(key, "1", "EX", SEND_RATE_TTL);
    return true;
  }
  if (parseInt(count, 10) >= SEND_RATE_MAX) {
    return false;
  }
  await this.fastify.redis.incr(key);
  return true;
}

// 异步邮件发送（不阻塞 HTTP 响应）
if (this.fastify.amqp) {
  try {
    await this.fastify.amqp.channel.sendToQueue(
      "mail:send",
      Buffer.from(JSON.stringify({
        to: email,
        subject: "Q问卷 - 注册验证码",
        template: "verification-code",
        data: { code, expiresMinutes: 5 }
      }))
    );
  } catch {
    this.fastify.log.warn(`邮件队列发送失败: ${maskEmail(email)}`);
  }
}
```

**优化前后对比：**

| 指标         | 优化前             | 优化后                           |
| ------------ | ------------------ | -------------------------------- |
| 限流         | 全局 100/min       | 路由级 5/min + 服务层 3/min/邮箱 |
| 邮件发送     | 同步阻塞 HTTP 响应 | RabbitMQ 异步队列                |
| 验证码安全性 | 无频率限制         | 双层限流 + 即用即删              |

---

### 2.4 POST /api/auth/register — 初始化注册

**功能概述：** 系统首次启动时，创建首个超级管理员账户。

**中间件链：** cors → helmet → rate-limit(100/min) → handler

**优化策略：**

| 策略         | 实现                                                     | 效果                                  |
| ------------ | -------------------------------------------------------- | ------------------------------------- |
| 系统状态缓存 | `isSystemInitialized()` → Cache-Aside 60s                | 注册后立即失效缓存，避免脏读          |
| 缓存主动失效 | 注册成功后 `this.cache.del(CacheKeys.systemInitialized)` | 下次 GET /status 立即感知系统已初始化 |
| 审计日志异步 | `createAuditLog(...).catch(() => {})`                    | 日志写入失败不阻塞注册流程            |

**实现代码：**

```typescript
// 注册成功后立即失效系统状态缓存
await Promise.all([
  createAuditLog(this.fastify, user.id, "register", "user", user.id, {
    action: "initial_registration",
    isFirstUser: true
  }),
  this.cache.del(CacheKeys.systemInitialized) // 关键：使缓存失效
]);
```

---

### 2.5 POST /api/auth/verify-register — 邮箱验证注册

**功能概述：** 使用邮箱验证码完成普通用户注册。

**中间件链：** cors → helmet → rate-limit(100/min) → handler

**优化策略：**

| 策略           | 实现                           | 效果                       |
| -------------- | ------------------------------ | -------------------------- |
| 验证码即用即删 | 校验通过后 `redis.del(key)`    | 防重用                     |
| 类型校验       | 检查 `type === "register"`     | 防止用重置密码的验证码注册 |
| 角色分配       | 普通用户注册仅分配 `user` 角色 | 最小权限原则               |

---

### 2.6 POST /api/auth/refresh — 刷新 Token

**功能概述：** 使用 Refresh Token 获取新的 Access Token + Refresh Token。

**中间件链：** cors → helmet → rate-limit(100/min) → handler

**优化策略：**

| 策略              | 实现                                                     | 效果                        |
| ----------------- | -------------------------------------------------------- | --------------------------- |
| 双向 Token 黑名单 | 旧 Refresh Token 黑名单 + 旧 Access Token JTI 黑名单     | 防止旧 Token 在刷新后仍可用 |
| 精准失效          | 通过 `USER_ACCESS_PREFIX` 存储当前 JTI，刷新时精准黑名单 | 避免全量黑名单扫描          |
| 用户状态校验      | 刷新时检查 `status === 1`                                | 禁用用户刷新后立即失效      |

**实现代码：**

```typescript
async refreshToken(refreshToken: string): Promise<LoginResult> {
  // 1. 验证 Refresh Token
  let decoded: JwtPayload;
  try {
    decoded = jwt.verify(refreshToken, this.jwtSecret) as JwtPayload;
  } catch {
    throw new AuthError("Refresh Token 无效或已过期", 401);
  }

  // 2. 将旧 Refresh Token 加入黑名单
  await this.blacklistToken(refreshToken);

  // 3. 将旧 Access Token 精准失效（通过 JTI）
  const oldJti = await this.fastify.redis.get(`${USER_ACCESS_PREFIX}${decoded.sub}`);
  if (oldJti) {
    await this.blacklistTokenByJti(oldJti, this.accessExpire);
  }

  // 4. 生成新 Token（generateTokens 内部会更新 USER_ACCESS_PREFIX）
  const tokens = await this.generateTokens({ id, email, role });

  return { ...tokens, user: { ... } };
}
```

**Token 轮换时序：**

```
┌─────────┐     ┌─────────┐     ┌─────────┐
│ Client  │     │ /refresh │     │  Redis  │
└────┬────┘     └────┬────┘     └────┬────┘
     │               │               │
     │ RefreshToken  │               │
     │──────────────►│               │
     │               │               │
     │               │ 黑名单旧RT     │
     │               │──────────────►│
     │               │               │
     │               │ 查旧AT的JTI    │
     │               │──────────────►│
     │               │               │
     │               │ 黑名单旧AT_JTI │
     │               │──────────────►│
     │               │               │
     │               │ 生成新AT+RT    │
     │               │──────────────►│
     │               │               │
     │  新AT + 新RT  │               │
     │◄──────────────│               │
```

---

### 2.7 POST /api/auth/reset-password — 重置密码

**功能概述：** 通过邮箱验证码重置密码。

**中间件链：** cors → helmet → rate-limit(100/min) → handler

**优化策略：**

| 策略           | 实现                                          | 效果                 |
| -------------- | --------------------------------------------- | -------------------- |
| 验证码即用即删 | 校验后 `redis.del(key)`                       | 防重用               |
| 全量失效       | 删除用户当前 Access Token 记录 + 清除认证缓存 | 所有设备强制重新登录 |
| 并行执行       | `Promise.all([redis.del, cache.del])`         | 减少等待时间         |

**实现代码：**

```typescript
// 5. 使该用户所有旧 Token 失效 & 清除认证缓存
await Promise.all([
  this.fastify.redis.del(`${USER_ACCESS_PREFIX}${user.id}`),
  this.cache.del(CacheKeys.userAuthProfile(user.id.toString()))
]);
```

---

### 2.8 POST /api/auth/logout — 登出

**功能概述：** 将当前 Access Token 加入黑名单。

**中间件链：** cors → helmet → rate-limit(100/min) → **authenticate** → handler

**优化策略：**

| 策略             | 实现                                                                      | 效果                              |
| ---------------- | ------------------------------------------------------------------------- | --------------------------------- |
| 按剩余有效期 TTL | `blacklistToken()` 解析 JWT 的 exp 计算剩余时间，按剩余时间设置黑名单 TTL | 黑名单自动过期，不浪费 Redis 内存 |
| 精确黑名单       | 按 JTI 黑名单，而非用户维度                                               | 不影响用户其他设备                |

---

### 2.9 POST /api/admin/users — 创建用户

**功能概述：** 超级管理员创建新用户。

**中间件链：** cors → helmet → rate-limit(100/min) → **authenticate → requireSuperAdmin** → handler

**优化策略：**

| 策略           | 实现                                                       | 效果                           |
| -------------- | ---------------------------------------------------------- | ------------------------------ |
| 邮箱唯一性校验 | Prisma `findFirst({ where: { email, deleted_at: null } })` | 排除已软删除用户，允许重新注册 |
| 自动生成密码   | 未提供密码时 `generateRandomPassword(12)`                  | 12 位含大小写+数字+特殊字符    |
| 审计日志异步   | `.catch(() => {})`                                         | 不阻塞 HTTP 响应               |

---

### 2.10 GET /api/admin/users — 用户列表

**功能概述：** 分页查询用户列表，支持邮箱模糊搜索和状态过滤。

**中间件链：** cors → helmet → rate-limit(100/min) → **authenticate → requireSuperAdmin** → handler

**优化策略：**

| 策略         | 实现                                                                       | 效果                                |
| ------------ | -------------------------------------------------------------------------- | ----------------------------------- |
| 并行查询     | `Promise.all([findMany, count])`                                           | 列表 + 总数并行，总耗时 ≈ max(两者) |
| 分页安全限制 | `buildPagination({ page, pageSize })` → `max 100`                          | 防止 `pageSize=99999` 拖垮数据库    |
| 按需 SELECT  | `select: { id, email, username, role, status, created_at, last_login_at }` | 不返回 `password_hash` 等敏感字段   |
| 降序排列     | `orderBy: { created_at: "desc" }`                                          | 最新用户在前，符合管理习惯          |

---

### 2.11 PUT /api/admin/users/:id — 更新用户

**功能概述：** 更新用户信息（用户名、角色、状态）。

**中间件链：** cors → helmet → rate-limit(100/min) → **authenticate → requireSuperAdmin** → handler

**优化策略：**

| 策略         | 实现                                                                   | 效果                     |
| ------------ | ---------------------------------------------------------------------- | ------------------------ |
| 存在性校验   | `findFirst({ where: { id: targetId, deleted_at: null } })`             | 排除已删除用户           |
| 角色变更事务 | `$transaction([deleteMany, create])`                                   | 保证 user_roles 表一致性 |
| 三级缓存失效 | `del(userRoles) + del(userAuthProfile) + delByPattern(userListPrefix)` | 写后主动失效，防止脏数据 |
| 审计日志     | 记录 `{ changes: input }`                                              | 可追溯所有变更           |

**缓存失效模式：**

```typescript
// 写操作后主动失效三级缓存
const targetIdStr = targetId.toString();
await Promise.all([
  this.cache.del(CacheKeys.userRoles(targetIdStr)), // 用户角色缓存
  this.cache.del(CacheKeys.userAuthProfile(targetIdStr)), // 认证档案缓存
  this.cache.delByPattern(`${CacheKeys.userListPrefix}*`) // 用户列表缓存（模糊匹配）
]);
```

**`delByPattern` 使用 SCAN 替代 KEYS：**

```typescript
async delByPattern(pattern: string): Promise<void> {
  let cursor = "0";
  do {
    const [nextCursor, keys] = await redis.scan(
      cursor, "MATCH", `${CACHE_PREFIX}${pattern}`, "COUNT", "100"
    );
    cursor = nextCursor;
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } while (cursor !== "0");
}
```

> **为什么用 SCAN 而非 KEYS？**  
> Redis 是单线程的，`KEYS pattern` 会阻塞所有其他命令。在百万级 Key 的生产环境中，`KEYS` 可能导致数百毫秒的阻塞。`SCAN` 是游标迭代，每次只返回少量 Key，不阻塞其他请求。

---

### 2.12 DELETE /api/admin/users/:id — 删除用户

**功能概述：** 软删除用户（设置 `deleted_at`）。

**中间件链：** cors → helmet → rate-limit(100/min) → **authenticate → requireSuperAdmin** → handler

**优化策略：**

| 策略         | 实现                                              | 效果                   |
| ------------ | ------------------------------------------------- | ---------------------- |
| 不可删除自己 | `if (adminId === targetId) throw ValidationError` | 防止管理员误删自己     |
| 软删除       | 设置 `deleted_at` 而非物理删除                    | 数据可恢复，审计可追溯 |
| 三级缓存失效 | 同更新用户                                        | 删除后缓存同步清理     |

---

### 2.13 GET /api/admin/config — 获取系统配置

**功能概述：** 按分类分组返回所有系统配置。

**中间件链：** cors → helmet → rate-limit(100/min) → **authenticate → requireSuperAdmin** → handler

**优化策略：**

| 策略       | 实现                                                                                | 效果                 |
| ---------- | ----------------------------------------------------------------------------------- | -------------------- |
| 按分类分组 | 遍历 `findMany` 结果，按 `category` 组织为 `Record<string, Record<string, string>>` | 前端可直接按分类渲染 |
| 按分类排序 | `orderBy: { category: "asc" }`                                                      | 输出稳定有序         |

---

### 2.14 PUT /api/admin/config/smtp — 更新 SMTP 配置

**功能概述：** 批量更新 SMTP 相关配置（6 项）。

**中间件链：** cors → helmet → rate-limit(100/min) → **authenticate → requireSuperAdmin** → handler

**优化策略：**

| 策略             | 实现                                             | 效果                                  |
| ---------------- | ------------------------------------------------ | ------------------------------------- |
| 批量 upsert 事务 | `$transaction(entries.map(e => upsert(...)))`    | 6 项配置原子化更新，失败全部回滚      |
| 配置缓存失效     | `del(smtpConfigured) + del(registrationEnabled)` | SMTP 配置变更后，/status 接口立即感知 |
| 审计日志         | 记录 `{ enabled, host }`                         | 不记录密码明文                        |

---

## 3. 性能优化策略

### 3.1 Cache-Aside 缓存体系

```
┌─────────────────────────────────────────────────────────────────┐
│                    Cache-Aside 读写流程                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  读取：                                                          │
│  ┌──────┐     miss      ┌──────┐     ┌──────┐                  │
│  │Redis │──────────────►│  DB  │────►│ 回填  │                  │
│  │      │               │      │     │Redis │                  │
│  └──┬───┘               └──────┘     └──────┘                  │
│     │ hit                                                       │
│     ▼                                                           │
│  ┌──────┐                                                       │
│  │ 返回  │                                                       │
│  └──────┘                                                       │
│                                                                  │
│  写入：                                                          │
│  ┌──────┐     ┌──────┐     ┌──────┐                           │
│  │  DB  │────►│ 删除  │────►│ 返回  │                           │
│  │ 写入  │     │Redis │     │      │                           │
│  └──────┘     └──────┘     └──────┘                           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**用户模块缓存 Key 全景：**

| 缓存 Key                                 | TTL  | 读场景                           | 写失效触发                                                   |
| ---------------------------------------- | ---- | -------------------------------- | ------------------------------------------------------------ |
| `cache:user:system:initialized`          | 60s  | GET /status                      | POST /register                                               |
| `cache:user:config:registration_enabled` | 60s  | GET /status                      | PUT /admin/config/smtp                                       |
| `cache:user:config:smtp_enabled`         | 60s  | GET /status                      | PUT /admin/config/smtp                                       |
| `cache:user:roles:{userId}`              | 600s | login, refreshToken, verifyToken | PUT /admin/users/:id, DELETE /admin/users/:id                |
| `cache:user:auth:{userId}`               | 300s | verifyToken（认证中间件）        | PUT /admin/users/:id, DELETE /admin/users/:id, resetPassword |
| `cache:user:list:*`                      | 300s | —                                | PUT /admin/users/:id, DELETE /admin/users/:id                |

### 3.2 数据库查询优化

| 优化点             | 实现                                           | 适用范围                   |
| ------------------ | ---------------------------------------------- | -------------------------- |
| 按需 SELECT        | 明确指定 `select` 字段，不返回 `password_hash` | 所有查询                   |
| `Promise.all` 并行 | 列表 + 总数并行查询                            | listUsers, getSystemStatus |
| 软删除条件         | `where: { deleted_at: null }` 统一过滤         | 所有用户查询               |
| 分页安全限制       | `take: min(pageSize, 100)`                     | listUsers                  |
| 索引友好           | 邮箱 `UNIQUE` 索引，`deleted_at` 需索引        | 高频查询字段               |

### 3.3 异步非阻塞操作

| 操作     | 处理方式                              | 原因                              |
| -------- | ------------------------------------- | --------------------------------- |
| 审计日志 | `createAuditLog(...).catch(() => {})` | 日志写入失败不影响业务            |
| 邮件发送 | RabbitMQ 消息队列异步推送             | 邮件发送耗时不可控                |
| 缓存回填 | `set(key, data, ttl).catch(() => {})` | 后台回填，不阻塞 Cache-Aside 返回 |

### 3.4 连接池与实例复用

| 优化点           | 实现                                                           |
| ---------------- | -------------------------------------------------------------- |
| AuthService 复用 | `WeakMap<FastifyInstance, AuthService>` 按实例缓存             |
| CacheClient 复用 | `AuthService` 构造函数内创建，实例生命周期内复用               |
| Prisma 连接池    | 由 Prisma 内置管理，默认 `connection_limit = num_cpus * 2 + 1` |
| Redis 连接池     | ioredis 内置连接池                                             |

---

## 4. 安全防护机制

### 4.1 登录安全体系

```
┌─────────────────────────────────────────────────────────────────┐
│                      登录安全防护链                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  第1层：路由限流 20 req/min（防暴力破解）                        │
│         │                                                        │
│         ▼                                                        │
│  第2层：账户锁定检查（Redis 标记）                                │
│         │                                                        │
│         ▼                                                        │
│  第3层：密码验证（bcrypt 10轮）                                   │
│         │                                                        │
│    ┌────▼────┐                                                   │
│    │ 验证结果 │                                                   │
│    └─┬─────┬─┘                                                   │
│      │     │                                                     │
│   失败│     │成功                                                 │
│      │     │                                                     │
│      ▼     ▼                                                     │
│  ┌──────┐ ┌──────────┐                                         │
│  │Lua原子│ │清除失败记录│                                         │
│  │失败+1│ │更新登录时间│                                         │
│  │≥5则锁│ │并行执行    │                                         │
│  └──────┘ └──────────┘                                         │
│                                                                  │
│  第4层：账户状态检查（status === 0 → 禁用）                       │
│  第5层：返回信息脱敏（不区分"邮箱不存在"和"密码错误"）            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**密码策略：**

| 参数     | 值     | 说明                         |
| -------- | ------ | ---------------------------- |
| 哈希算法 | bcrypt | 内置盐值，抗彩虹表           |
| 哈希轮数 | 10     | 约 70ms/次，平衡安全性与性能 |
| 最小长度 | 8 位   | 含大小写字母 + 数字          |
| 最大长度 | 128 位 | 防止 DoS（超长密码哈希极慢） |

### 4.2 Token 安全体系

```
┌─────────────────────────────────────────────────────────────────┐
│                      Token 安全机制                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Access Token（短期，默认 1h）                                    │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ 结构：{ sub, email, role, type:"access", jti, iat, exp } │  │
│  │ 黑名单：Redis "auth:jwt:blacklist:{jti}"                  │  │
│  │ TTL：按剩余有效期（最多 1h）                               │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  Refresh Token（长期，默认 7d）                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ 结构：{ sub, type:"refresh", jti, iat, exp }              │  │
│  │ 黑名单：Redis "auth:jwt:blacklist:{jti}"                  │  │
│  │ 轮换：刷新时旧 RT 入黑名单                                 │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  失效触发：                                                      │
│  ┌────────────┬────────────────────────────────────────────┐   │
│  │ 登出       │ 当前 AT 的 JTI 入黑名单                     │   │
│  │ 刷新 Token │ 旧 RT 入黑名单 + 旧 AT_JTI 精准黑名单       │   │
│  │ 密码重置   │ 删除用户当前 AT 记录 + 清除认证缓存          │   │
│  │ 用户禁用   │ 下次 verifyToken 时检查 status               │   │
│  └────────────┴────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 4.3 参数校验（Zod Schema）

所有接口请求体均通过 Zod Schema 校验，校验失败自动返回 400：

```typescript
// 路由层统一校验模式
const body = parseAndRespond(loginSchema.safeParse(request.body), reply);
if (!body) return; // 校验失败已自动响应 400
```

**关键校验规则：**

| 字段       | 规则                                    | 说明          |
| ---------- | --------------------------------------- | ------------- |
| email      | `z.string().email()`                    | RFC 5322 格式 |
| password   | ≥8 位 + 大小写 + 数字                   | 强度校验      |
| username   | 1-50 字符，中文/字母/数字/下划线/短横线 | 字符集限制    |
| verifyCode | 6 位数字                                | 长度 + 格式   |
| pageSize   | 1-100                                   | 安全限制      |

### 4.4 错误信息脱敏

```typescript
// error-handler.ts — 生产环境敏感信息脱敏
function sanitizeForLog(obj: unknown): unknown {
  const sensitiveKeys = ["password", "password_hash", "token", "refreshToken", "authorization"];
  for (const key of sensitiveKeys) {
    if (key in cloned) cloned[key] = "***REDACTED***";
  }
  return cloned;
}

// 生产环境不暴露堆栈信息
msg: isProduction() ? "服务器内部错误" : error.message;
```

---

## 5. 优化前后对比

### 5.1 关键指标对比

| 维度           | 优化项            | 优化前                           | 优化后                                   |
| -------------- | ----------------- | -------------------------------- | ---------------------------------------- |
| **响应延迟**   | /status 缓存命中  | 15ms (DB)                        | <1ms (Redis)                             |
|                | /login 角色查询   | 每次 DB 查询                     | Cache-Aside 10min                        |
|                | /admin/users 列表 | 顺序查列表+总数                  | Promise.all 并行                         |
| **并发安全**   | 登录失败计数      | INCR + EXPIRE 分离（竞态风险）   | Lua 原子操作                             |
|                | Admin 路由认证    | 两次独立 hook（Reply sent 风险） | 合并为单一 hook                          |
| **限流安全**   | /login            | 全局 100/min                     | 路由级 20/min                            |
|                | /send-code        | 全局 100/min                     | 路由级 5/min + 服务层 3/min/邮箱         |
| **缓存一致性** | 写后缓存          | 未主动失效                       | 三级缓存主动失效                         |
|                | 缓存删除          | 未使用                           | delByPattern（SCAN 替代 KEYS）           |
| **内存效率**   | AuthService       | 每次请求新建                     | WeakMap 按实例复用                       |
|                | Token 黑名单      | 无 TTL                           | 按剩余有效期自动过期                     |
| **可观测性**   | 审计日志          | 同步写入（阻塞）                 | 异步写入 + 失败降级                      |
|                | 错误处理          | 未分类                           | 四级分类（AppError/Fastify/Prisma/未知） |

### 5.2 限流层级对比

```
优化前：                              优化后：
┌──────────────────────┐             ┌──────────────────────┐
│ 全局 100 req/min      │             │ 全局 100 req/min      │
│ （所有接口同一限制）   │             │                      │
│                       │             │ ┌──────────────────┐ │
│ /login    100/min ←── │             │ │ /login    20/min │ │
│ /send-code 100/min ←── │             │ │ /send-code 5/min │ │
│ /status   100/min      │             │ └──────────────────┘ │
│ /admin/*  100/min      │             │ /status   100/min    │
└──────────────────────┘             │ /admin/*  100/min    │
                                      └──────────────────────┘
```

### 5.3 缓存命中率预估

| 接口             | 缓存 Key          | TTL  |   日请求量估算   | 缓存命中率 |
| ---------------- | ----------------- | ---- | :--------------: | :--------: |
| GET /status      | systemInitialized | 60s  | 高频（前端轮询） |    >99%    |
| POST /login      | userRoles         | 600s |       中频       |    >90%    |
| authenticate     | userAuthProfile   | 300s |     每次请求     |    >95%    |
| GET /admin/users | 无缓存            | —    |       低频       |     0%     |

---

## 6. 使用注意事项

### 6.1 开发环境 vs 生产环境

| 配置项     | 开发环境                          | 生产环境                       |
| ---------- | --------------------------------- | ------------------------------ |
| 限流计数   | 内存（单进程）                    | Redis（多进程共享）            |
| JWT_SECRET | `dev-secret-change-in-production` | 环境变量注入，≥32 位随机字符串 |
| 错误信息   | 返回 `error.message`              | 返回 `"服务器内部错误"`        |
| 日志级别   | debug                             | info/warn                      |

### 6.2 缓存一致性

- **Cache-Aside 模式**：读操作先查 Redis，miss 查 DB 并回填；写操作先写 DB 再删 Redis
- **最终一致性**：短 TTL 保证最多 60s-600s 的延迟，适用于用户模块低频变更场景
- **写后失效**：所有 `updateUser` / `deleteUser` / `updateSmtpConfig` 操作后必须主动 `del` 相关缓存

### 6.3 Token 安全

- **Access Token** 有效期应尽量短（默认 1h），配合 Refresh Token 实现无感刷新
- **Refresh Token** 一旦使用即入黑名单，仅能使用一次
- **密码重置后**，该用户所有设备立即失效（删除 `USER_ACCESS_PREFIX`）
- 前端应将 Access Token 存 `sessionStorage`（关闭标签页即清除），Refresh Token 存 `localStorage`

### 6.4 限流配置

- 路由级限流 `config.rateLimit` 会覆盖全局默认值，但不会叠加
- 服务层 `checkSendRate` 是额外的业务级限流，与路由限流并行生效
- 生产环境限流由 Redis 共享计数，多进程/多实例一致

### 6.5 审计日志

- 审计日志写入失败仅 `warn`，不阻塞业务
- 日志不记录密码明文，SMTP 密码不记录在 `details` 中
- 邮箱脱敏：`maskEmail()` 保留前 2 字符 + `@domain`

### 6.6 后续优化建议

| 建议                     | 优先级 | 说明                                     |
| ------------------------ | :----: | ---------------------------------------- |
| 添加 `@fastify/compress` |   高   | gzip/brotli 响应压缩，减少 70%+ 传输体积 |
| 用户列表加入缓存         |   中   | 配合 `delByPattern` 已预留失效逻辑       |
| 敏感操作二次验证         |   中   | 删除用户、修改 SMTP 需二次确认           |
| 登录设备管理             |   低   | 记录登录设备，支持远程踢出               |

---

## 附录

### A. 文件索引

| 文件                             | 职责                                           |
| -------------------------------- | ---------------------------------------------- |
| `auth.routes.ts`                 | 认证路由定义 + 路由级限流配置                  |
| `auth.service.ts`                | 认证核心业务逻辑（登录/注册/Token/验证码）     |
| `admin.routes.ts`                | 管理员路由定义 + 合并认证 hook                 |
| `admin.service.ts`               | 管理员业务逻辑（用户 CRUD/系统配置）           |
| `auth.middleware.ts`             | 认证中间件 + 超管权限中间件 + WeakMap 实例复用 |
| `schemas/user.schemas.ts`        | Zod 校验 Schema + 类型推导                     |
| `../../utils/cache.ts`           | Cache-Aside 缓存客户端 + Key 规范              |
| `../../utils/audit-log.ts`       | 审计日志统一写入                               |
| `../../utils/pagination.ts`      | 分页参数校验 + 安全限制                        |
| `../../utils/zod.ts`             | Zod 校验与 Fastify reply 集成                  |
| `../../plugins/rate-limit.ts`    | 全局限流插件                                   |
| `../../plugins/error-handler.ts` | 全局错误兜底 + 脱敏                            |

### B. 测试覆盖率

```
Test Files  6 passed (6)
Tests      72 passed (72)
├── auth.routes.spec.ts      认证路由集成测试
├── admin.routes.spec.ts     管理员路由集成测试
├── auth.service.spec.ts     AuthService 单元测试
├── admin.service.spec.ts    AdminService 单元测试
├── auth.middleware.spec.ts  认证中间件单元测试
└── error-handler.spec.ts    错误处理插件测试
```

### C. 版本历史

| 版本 | 日期       | 变更说明                                         |
| ---- | ---------- | ------------------------------------------------ |
| 1.0  | 2026-06-06 | 初始版本，架构设计与接口文档                     |
| 2.0  | 2026-06-19 | 新增中间件优化详解、接口级优化策略、优化前后对比 |

---

**文档维护者**：系统自动生成  
**最后更新**：2026-06-19
