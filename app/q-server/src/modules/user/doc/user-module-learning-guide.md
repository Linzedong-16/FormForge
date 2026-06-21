# User 模块完整学习指导文档

> 版本：v1.0 | 最后更新：2026-06-21

---

## 目录

1. [模块概述](#1-模块概述)
2. [架构设计分析](#2-架构设计分析)
   - 2.1 [模块定位与分层](#21-模块定位与分层)
   - 2.2 [文件结构](#22-文件结构)
   - 2.3 [数据流图](#23-数据流图)
   - 2.4 [模块间交互关系](#24-模块间交互关系)
3. [接口详细说明](#3-接口详细说明)
   - 3.1 [认证接口 (auth.routes.ts)](#31-认证接口)
   - 3.2 [用户接口 (user.routes.ts)](#32-用户接口)
   - 3.3 [用户资料接口 (profile.routes.ts)](#33-用户资料接口)
   - 3.4 [管理员接口 (admin.routes.ts)](#34-管理员接口)
4. [代码实现详细解析](#4-代码实现详细解析)
   - 4.1 [认证服务 (auth.service.ts)](#41-认证服务)
   - 4.2 [用户服务 (user.service.ts)](#42-用户服务)
   - 4.3 [用户资料服务 (profile.service.ts)](#43-用户资料服务)
   - 4.4 [头像上传服务 (avatar.service.ts)](#44-头像上传服务)
   - 4.5 [管理员服务 (admin.service.ts)](#45-管理员服务)
   - 4.6 [认证中间件 (auth.middleware.ts)](#46-认证中间件)
   - 4.7 [Zod 校验模式 (user.schemas.ts)](#47-zod-校验模式)
5. [性能优化策略](#5-性能优化策略)
6. [落地实践逻辑](#6-落地实践逻辑)
   - 6.1 [业务场景案例](#61-业务场景案例)
   - 6.2 [异常处理机制](#62-异常处理机制)
   - 6.3 [部署与运维](#63-部署与运维)
7. [依赖工具汇总](#7-依赖工具汇总)

---

## 1. 模块概述

User 模块是问卷系统的**核心用户域模块**，负责用户身份认证、安全管理、资料维护、头像处理、管理员操作等全部用户相关业务逻辑。模块遵循以下设计原则：

| 原则           | 说明                                                                    |
| -------------- | ----------------------------------------------------------------------- |
| **分层清晰**   | Routes（路由）→ Service（服务）→ Prisma/Redis/MinIO（数据层），职责单一 |
| **类型安全**   | 所有输入通过 Zod Schema 校验并自动推导 TypeScript 类型                  |
| **防御式编程** | 魔数校验、速率限制、软删除、Token 黑名单、审计日志全覆盖                |
| **性能优先**   | Cache-Aside 缓存、并行压缩上传、Promise.all 并行 I/O                    |
| **安全第一**   | bcrypt 密码哈希、JWT 双 Token 机制、登录锁定、密钥加密                  |

---

## 2. 架构设计分析

### 2.1 模块定位与分层

```
┌─────────────────────────────────────────────────────────┐
│                     HTTP Request                        │
└────────────────────────┬────────────────────────────────┘
                         │ /api/auth/*  /api/user/*  /api/admin/*
                         ▼
┌─────────────────────────────────────────────────────────┐
│  Routes 层 (路由 + 限流 + 校验)                           │
│  auth.routes.ts  user.routes.ts  profile.routes.ts      │
│  admin.routes.ts                                        │
│  ┌──────────────┬──────────────┬────────────────────┐   │
│  │ authenticate │ rateLimit    │ Zod parseAndRespond│   │
│  └──────────────┴──────────────┴────────────────────┘   │
├─────────────────────────────────────────────────────────┤
│  Service 层 (纯业务逻辑)                                  │
│  AuthService  UserService  ProfileService               │
│  AvatarService  AdminService                            │
│  ┌──────────────┬──────────────┬────────────────────┐   │
│  │ bcrypt/JWT   │ Cache-Aside  │ AuditLog           │   │
│  └──────────────┴──────────────┴────────────────────┘   │
├─────────────────────────────────────────────────────────┤
│  Data 层                                                 │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐             │
│  │ Prisma   │  │  Redis   │  │  MinIO    │             │
│  │ (MySQL)  │  │ (Cache)  │  │ (Storage) │             │
│  └──────────┘  └──────────┘  └───────────┘             │
└─────────────────────────────────────────────────────────┘
```

### 2.2 文件结构

```
app/q-server/src/modules/user/
├── doc/
│   ├── profile-api-design.md          # API 设计文档
│   ├── user-module-optimization-guide.md  # 优化指南
│   └── user-module-tech-doc.md        # 技术文档
│
├── schemas/
│   └── user.schemas.ts                # Zod 校验 Schema（单一真源）
│
├── auth.routes.ts                     # 认证路由（/api/auth）
├── auth.service.ts                    # 认证服务（登录/注册/Token）
├── auth.middleware.ts                 # 认证中间件（Token 校验/权限）
│
├── user.routes.ts                     # 用户路由（/api/user）
├── user.service.ts                    # 用户服务（当前用户信息）
│
├── profile.routes.ts                  # 用户资料路由（/api/user）
├── profile.service.ts                 # 用户资料服务（资料/邮箱/密码/注销）
├── avatar.service.ts                  # 头像上传服务（校验/压缩/存储）
│
├── admin.routes.ts                    # 管理路由（/api/admin）
└── admin.service.ts                   # 管理服务（用户 CRUD/系统配置）
```

### 2.3 数据流图

```mermaid
sequenceDiagram
    participant Client
    participant Route as Routes
    participant MW as Middleware
    participant Svc as Service
    participant Cache as Redis
    participant DB as MySQL/Prisma
    participant MQ as RabbitMQ
    participant FS as MinIO

    Note over Client,FS: 认证流程 (login)
    Client->>Route: POST /api/auth/login
    Route->>Svc: AuthService.login(email, pwd)
    Svc->>Cache: 检查锁定状态
    Svc->>DB: 查询用户
    Svc->>Svc: bcrypt.compare()
    Svc->>Svc: generateTokens()
    Svc->>Cache: SET auth:user:access:{id}
    Svc->>DB: 写入审计日志
    Svc-->>Client: accessToken + refreshToken + user

    Note over Client,FS: 资料查询流程 (getProfile)
    Client->>Route: GET /api/user/profile
    Route->>MW: authenticate (verifyToken)
    MW->>Cache: 检查黑名单 JTI
    MW->>DB: 查询用户档案
    MW-->>Route: request.user
    Route->>Svc: ProfileService.getProfile(userId)
    Svc->>Cache: GET user:profile:{id}
    alt 缓存命中
        Cache-->>Svc: 直接返回
    else 缓存未命中
        Svc->>DB: 查询 User + UserProfile
        Svc->>Cache: SET user:profile:{id}
    end
    Svc-->>Client: UserProfileResponse

    Note over Client,FS: 头像上传流程 (upload)
    Client->>Route: POST /api/user/avatar (multipart)
    Route->>Svc: AvatarService.upload(userId, buffer, mime)
    Svc->>Svc: fileTypeFromBuffer() 魔数校验
    Svc->>Svc: sharp() 并行压缩 800+200
    Svc->>FS: MinIO 并行上传 x2
    Svc->>DB: upsert avatar_url
    Svc->>Cache: DEL user:profile:{id}
    Svc->>FS: 异步删除旧头像
    Svc-->>Client: avatarUrl + thumbnailUrl

    Note over Client,FS: 邮件发送流程 (sendCode)
    Client->>Route: POST /api/auth/send-code
    Route->>Svc: AuthService.sendCode(email, type)
    Svc->>DB: 前置校验（注册状态/邮箱存在）
    Svc->>Cache: 频率检查
    Svc->>Cache: SET auth:verify:{email}
    Svc->>MQ: 投递 mail:send 队列
    Svc-->>Client: expireSeconds
```

### 2.4 模块间交互关系

```mermaid
flowchart TB
    subgraph UserModule["User 模块"]
        AuthR[Auth Routes]
        AuthS[Auth Service]
        AuthM[Auth Middleware]
        UserR[User Routes]
        UserS[User Service]
        ProfR[Profile Routes]
        ProfS[Profile Service]
        AvatS[Avatar Service]
        AdminR[Admin Routes]
        AdminS[Admin Service]
        Schema[Zod Schemas]
    end

    subgraph Utils["项目工具层 (src/utils/)"]
        Cache[Cache Client]
        Upload[Upload Utils]
        Audit[Audit Log]
        Response[Response/BizCode]
        Pagination[Pagination]
        Crypto[Crypto KS1]
        ZodParse[Zod Parse]
    end

    subgraph Infra["基础设施"]
        Prisma[(Prisma/MySQL)]
        Redis[(Redis)]
        MinIO[(MinIO)]
        RabbitMQ[(RabbitMQ)]
    end

    AuthR --> AuthS
    AuthR --> AuthM
    AuthS --> Cache
    AuthS --> Prisma
    AuthS --> Redis
    AuthS --> RabbitMQ
    AuthS --> Audit

    UserR --> AuthM
    UserR --> UserS
    UserS --> Cache
    UserS --> Prisma
    UserS --> Audit

    ProfR --> AuthM
    ProfR --> ProfS
    ProfR --> AvatS
    ProfS --> Cache
    ProfS --> Prisma
    ProfS --> Redis
    ProfS --> Audit
    AvatS --> Upload
    AvatS --> MinIO
    AvatS --> Prisma

    AdminR --> AuthM
    AdminR --> AdminS
    AdminS --> Cache
    AdminS --> Prisma
    AdminS --> Audit
    AdminS --> Crypto

    Schema --> AuthR
    Schema --> AdminR
    Schema --> ProfR
    Schema --> AuthS
    Schema --> AdminS
    Schema --> ProfS
```

---

## 3. 接口详细说明

### 3.1 认证接口

挂载前缀：`/api/auth`

| 方法   | 路径               | 认证   | 限流      | 说明         |
| ------ | ------------------ | ------ | --------- | ------------ |
| `GET`  | `/status`          | 无     | 无        | 获取系统状态 |
| `POST` | `/login`           | 无     | 20次/分钟 | 用户登录     |
| `POST` | `/send-code`       | 无     | 5次/分钟  | 发送验证码   |
| `POST` | `/register`        | 无     | 无        | 初始化注册   |
| `POST` | `/verify-register` | 无     | 无        | 邮箱验证注册 |
| `POST` | `/refresh`         | 无     | 无        | 刷新 Token   |
| `POST` | `/reset-password`  | 无     | 无        | 重置密码     |
| `POST` | `/logout`          | Bearer | 无        | 登出         |

---

#### `GET /api/auth/status` — 系统状态

**请求：** 无参数

**响应：**

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "initialized": true,
    "registrationEnabled": true,
    "registrationMode": "email_verify",
    "smtpConfigured": true
  }
}
```

| 字段                  | 类型                           | 说明                               |
| --------------------- | ------------------------------ | ---------------------------------- |
| `initialized`         | boolean                        | 系统是否已初始化（存在超级管理员） |
| `registrationEnabled` | boolean                        | 注册功能是否开放                   |
| `registrationMode`    | "email_verify" \| "admin_only" | 注册模式                           |
| `smtpConfigured`      | boolean                        | 邮件服务是否已配置                 |

**使用示例：**

```typescript
// 前端判断是否显示注册入口
const { initialized, registrationEnabled } = await api.get("/api/auth/status");
if (!initialized) {
  // 显示初始化注册页
} else if (registrationEnabled) {
  // 显示邮箱验证注册页
}
```

---

#### `POST /api/auth/login` — 用户登录

**请求体：**

```json
{
  "email": "user@example.com",
  "password": "MyPass123"
}
```

| 参数       | 类型   | 约束          | 说明     |
| ---------- | ------ | ------------- | -------- |
| `email`    | string | RFC 5322 格式 | 登录邮箱 |
| `password` | string | 非空          | 登录密码 |

**响应：**

```json
{
  "code": 0,
  "msg": "登录成功",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "tokenType": "Bearer",
    "expiresIn": 3600,
    "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
    "refreshExpiresIn": 604800,
    "user": {
      "id": "1",
      "email": "user@example.com",
      "username": "zhangsan",
      "role": "user"
    }
  }
}
```

**安全机制：**

- 登录失败 5 次后账户锁定 30 分钟
- 锁定期间返回 `BizCode.ACCOUNT_LOCKED`
- 剩余尝试次数随错误响应返回

---

#### `POST /api/auth/send-code` — 发送验证码

**请求体：**

```json
{
  "email": "user@example.com",
  "type": "register"
}
```

| 参数    | 类型   | 约束                                                                | 说明       |
| ------- | ------ | ------------------------------------------------------------------- | ---------- |
| `email` | string | RFC 5322                                                            | 接收邮箱   |
| `type`  | enum   | "register" \| "reset_password" \| "bind_email" \| "change_password" | 验证码用途 |

**响应：**

```json
{
  "code": 0,
  "msg": "验证码已发送",
  "data": { "expireSeconds": 300 }
}
```

**前置校验（按 type 不同）：**

| type              | 前置条件                                      |
| ----------------- | --------------------------------------------- |
| `register`        | SMTP 已配置 && 注册功能已开放 && 邮箱未被注册 |
| `reset_password`  | SMTP 已配置 && 邮箱已注册                     |
| `bind_email`      | SMTP 已配置（由 profile.service 进一步鉴权）  |
| `change_password` | SMTP 已配置                                   |

---

#### `POST /api/auth/register` — 初始化注册

系统未初始化时（无超级管理员），第一个注册者自动成为超级管理员。

**请求体：**

```json
{
  "email": "admin@example.com",
  "password": "AdminPass123",
  "username": "管理员"
}
```

**响应：**

```json
{
  "code": 0,
  "msg": "注册成功",
  "data": {
    "token": "...",
    "user": { "role": "super_admin" },
    "isFirstUser": true
  }
}
```

---

#### `POST /api/auth/verify-register` — 邮箱验证注册

**请求体：**

```json
{
  "email": "user@example.com",
  "code": "123456",
  "password": "MyPass123",
  "username": "zhangsan"
}
```

**流程：** 先调用 `/send-code`（type=register）获取验证码 → 再调用本接口完成注册。

---

#### `POST /api/auth/refresh` — 刷新 Token

**请求体：**

```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

**响应：** 与 `/login` 返回结构相同，包含新的 accessToken + refreshToken。

**机制：** 刷新时旧 accessToken 和旧 refreshToken 都会加入黑名单，确保一次刷新后旧凭证全部失效。

---

#### `POST /api/auth/reset-password` — 重置密码

**请求体：**

```json
{
  "email": "user@example.com",
  "code": "123456",
  "newPassword": "NewPass456"
}
```

**副作用：** 重置后使该用户所有旧 Token 失效，清除认证缓存。

---

#### `POST /api/auth/logout` — 登出

**请求头：** `Authorization: Bearer <accessToken>`

**机制：** 将当前 Access Token 的 JTI 加入 Redis 黑名单，有效期等于 Token 剩余寿命。

---

### 3.2 用户接口

挂载前缀：`/api/user`，全部需要认证。

| 方法  | 路径      | 限流 | 说明             |
| ----- | --------- | ---- | ---------------- |
| `GET` | `/me`     | 无   | 获取当前用户信息 |
| `PUT` | `/update` | 无   | 更新用户名/密码  |

#### `GET /api/user/me`

```json
{
  "data": {
    "id": "1",
    "email": "user@example.com",
    "username": "zhangsan",
    "role": "user",
    "status": 1,
    "created_at": "2026-01-01T00:00:00.000Z",
    "last_login_at": "2026-06-21T10:00:00.000Z"
  }
}
```

#### `PUT /api/user/update`

```json
// Request
{ "username": "new_name", "password": "NewPass456" }
// Response
{ "msg": "更新成功", "data": { ... } }
```

> **注意：** `/me` 和 `/update` 属于旧版 User 接口（user.routes.ts），与新版 Profile 接口（profile.routes.ts）共存但路由不冲突。

---

### 3.3 用户资料接口

挂载前缀：`/api/user`，全部需要认证。

| 方法     | 路径               | 限流      | 说明                           |
| -------- | ------------------ | --------- | ------------------------------ |
| `GET`    | `/profile`         | 无        | 获取完整用户资料（含表单回显） |
| `PUT`    | `/profile`         | 无        | 更新昵称/职业/介绍/兴趣        |
| `POST`   | `/avatar`          | 10次/分钟 | 上传头像                       |
| `POST`   | `/bind-email`      | 5次/分钟  | 绑定/换绑邮箱                  |
| `PUT`    | `/change-password` | 5次/分钟  | 修改密码                       |
| `DELETE` | `/account`         | 3次/天    | 注销账号                       |

详细接口文档见 [接口一览](./profile-api-design.md#33-接口一览)，此处仅做关键补充。

#### 头像上传处理流程

```
Client → Multipart file
  → 空文件检查 (length === 0)
  → 魔数校验 (file-type)
  → 大小校验 (≤ 5MB)
  → 元数据读取 (sharp.metadata)
  → 尺寸校验 (200~4096px)
  → 并行压缩 (原图800+缩略图200)
  → 并行上传 MinIO
  → 更新 DB avatar_url
  → 异步清理旧头像
  → 返回 avatarUrl + thumbnailUrl
```

---

### 3.4 管理员接口

挂载前缀：`/api/admin`，全部需要超级管理员权限（authenticate + requireSuperAdmin）。

| 方法     | 路径                                    | 说明                         |
| -------- | --------------------------------------- | ---------------------------- |
| `POST`   | `/users`                                | 创建用户                     |
| `GET`    | `/users?page=1&limit=20&email=&status=` | 用户列表（分页+搜索）        |
| `PUT`    | `/users/:id`                            | 更新用户（用户名/角色/状态） |
| `DELETE` | `/users/:id`                            | 软删除用户                   |
| `GET`    | `/config`                               | 获取系统配置                 |
| `PUT`    | `/config/smtp`                          | 更新 SMTP 配置               |

---

## 4. 代码实现详细解析

### 4.1 认证服务

**文件：** [auth.service.ts](./auth.service.ts)

#### 4.1.1 JWT 双 Token 机制

```typescript
// Access Token：短时效（默认 1h），用于 API 认证
jwt.sign({ sub, email, role, type: "access", jti }, secret, { expiresIn: 3600 });

// Refresh Token：长时效（默认 7天），仅用于刷新
jwt.sign({ sub, type: "refresh", jti }, secret, { expiresIn: 604800 });
```

**Token 生命周期：**

```mermaid
sequenceDiagram
    participant User
    participant Server
    participant Redis

    User->>Server: login
    Server->>Redis: SET auth:user:access:{id} → jti
    Server-->>User: accessToken + refreshToken

    Note over User,Redis: Access Token 过期后
    User->>Server: POST /refresh (refreshToken)
    Server->>Redis: 黑名单旧 refresh JTI
    Server->>Redis: 查询旧 access JTI 并黑名单
    Server->>Redis: SET 新 access JTI
    Server-->>User: 新 accessToken + 新 refreshToken

    Note over User,Redis: 修改密码/注销
    User->>Server: changePassword / deleteAccount
    Server->>Redis: DEL auth:user:access:{id}
    Server->>Redis: SET auth:jwt:blacklist:{jti} (当前 Token)
    Server --> User: 旧 Token 立即失效
```

**黑名单三态一致性：**

| 操作           | USER_ACCESS_PREFIX | JTI 黑名单                     | 认证缓存 |
| -------------- | ------------------ | ------------------------------ | -------- |
| login          | SET                | —                              | —        |
| refresh        | SET 新             | 旧 access JTI + 旧 refresh JTI | —        |
| changePassword | DEL                | 当前 access JTI                | DEL      |
| deleteAccount  | DEL                | 当前 access JTI                | DEL      |
| logout         | —                  | 当前 access JTI                | —        |

#### 4.1.2 登录安全

**失败锁定（Lua 原子脚本）：**

```lua
-- Redis Lua 脚本，保证 incr + expire + 锁定判定原子性
local count = redis.call('incr', KEYS[1])   -- 失败计数
if count == 1 then
  redis.call('expire', KEYS[1], ARGV[1])    -- 首次失败设过期
end
if count >= ARGV[2] then
  redis.call('set', KEYS[2], ARGV[3], 'ex', ARGV[4]) -- 锁定
end
return count
```

**配置：** 5 次失败 → 锁定 30 分钟，失败计数 TTL 15 分钟。

#### 4.1.3 验证码系统

```
┌─────────────┐     Redis     ┌──────────────┐
│ sendCode()   │ ─────SET────> │ auth:verify:  │
│              │   {code,type} │   {email}     │
│              │   EX 300s     │              │
└─────────────┘               └──────┬───────┘
                                     │ GET + DEL
┌─────────────┐                      ▼
│ 消费者接口    │ <──── 验证码校验 ────┘
│ (verifyAndRegister / resetPassword
│  / bindEmail)  验证后立即删除
└─────────────┘
```

> 关键设计：验证码使用后**立即删除**，防止重放攻击。`bindEmail` 和 `changePassword` 的收发分离（sendCode 公开 + 消费接口需认证）是合理的安全权衡。

---

### 4.2 用户服务

**文件：** [user.service.ts](./user.service.ts)

#### 4.2.1 获取当前用户 (getCurrentUser)

```
Cache-Aside 模式：
  1. GET user:auth:{userId} from Redis
  2. Hit? → 直接返回
  3. Miss? → Prisma findFirst → 组装 UserProfile → SET 后台回填
```

#### 4.2.2 更新当前用户 (updateCurrentUser)

```
更新用户信息流程：
  1. 校验 (username ∥ password 至少一个)
  2. 校验 username 长度 (1~50)
  3. 校验 password 长度 (8~128) + bcrypt.hash
  4. Prisma update
  5. 失效缓存: userAuthProfile + userRoles
  6. 写审计日志
```

---

### 4.3 用户资料服务

**文件：** [profile.service.ts](./profile.service.ts)

#### 4.3.1 Cache-Aside 缓存策略

```
读操作 (getProfile):
  ┌─── Cache Hit ──→ 直接返回
  │
  GET ─┤                         ┌─→ SET cache (后台)
  │     └─── Cache Miss ──→ DB ──┤
                                  └─→ 返回数据

写操作 (updateProfile / updateAvatarUrl / bindEmail / changePassword / deleteAccount):
  DB Write ──→ DEL cache ──→ 返回
```

**缓存 Key 清单：**

| Key                 | 格式           | TTL  | 用途                 |
| ------------------- | -------------- | ---- | -------------------- |
| `user:profile:{id}` | user:profile:1 | 300s | 用户资料完整缓存     |
| `user:auth:{id}`    | user:auth:1    | 300s | 用户认证档案缓存     |
| `user:roles:{id}`   | user:roles:1   | 300s | 用户角色缓存         |
| `user:list:*`       | user:list:\*   | —    | 用户列表模糊匹配失效 |

#### 4.3.2 parseInterests — 运行时安全解析

```typescript
function parseInterests(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === "string");
  }
  return [];
}
```

> 数据库 JSON 字段可能存储非数组数据，直接 `as string[]` 断言会导致运行时崩溃。`parseInterests` 通过 `Array.isArray()` + `typeof` 双重守卫确保类型安全。

#### 4.3.3 bindEmail 防重复绑定

```
bindEmail 流程：
  1. Redis 校验验证码 (auth:verify:{email})
  2. DEL 验证码 (防重放)
  3. DB 查其他用户是否绑定了该邮箱 → 已绑定则报错 EMAIL_ALREADY_BOUND
  4. DB 查当前用户是否已绑相同邮箱 → 已相同则直接返回 (避免无意义 upsert)
  5. Upsert UserProfile
  6. DEL 缓存 + 审计日志
```

#### 4.3.4 changePassword 安全性

```
changePassword 流程：
  1. 查询用户 (deleted_at IS NULL)
  2. bcrypt.compare(currentPassword) — 验证当前密码
  3. bcrypt.compare(newPassword) — 确保新密码不同
  4. Prisma update password_hash
  5. Promise.all([
       redis.del(auth:user:access:{id}),    // 使当前 Access Token 失效
       cache.del(userAuthProfile)            // 清除认证缓存
     ])
  6. 审计日志
  7. 路由层额外 blacklistToken(JTI) — 黑名单当前 Token
```

#### 4.3.5 deleteAccount 软删除

```
软删除流程：
  1. 检查用户存在且 deleted_at IS NULL
  2. Prisma update deleted_at = now
  3. 批量失效：
     - DEL auth:user:access:{id} (Token)
     - DEL user:auth:{id} (认证缓存)
     - DEL user:profile:{id} (资料缓存)
     - DEL user:roles:{id} (角色缓存)
     - DEL user:list:* (列表缓存)
  4. 审计日志
```

---

### 4.4 头像上传服务

**文件：** [avatar.service.ts](./avatar.service.ts)

#### 4.4.1 完整处理管道

```
                    ┌──────────────────────────────┐
  Buffer ──────────→│ 0. 空文件检查 (length === 0)  │
  (5MB max)         │ 1. 魔数校验 (file-type)       │
                    │ 2. 大小校验 (≤ 5MB)           │
                    │ 3. 元数据读取 (sharp)         │
                    │ 4. 尺寸校验 (200~4096px)      │
                    │ 5. 获取旧头像 URL             │
                    └──────────┬───────────────────┘
                               │
              ┌────────────────┼────────────────┐
              ▼                                 ▼
  ┌─────────────────────┐         ┌─────────────────────┐
  │ processImage(800)   │         │ processImage(200)   │
  │ fit: "inside"       │         │ fit: "cover"        │
  │ quality: 85         │         │ quality: 80         │
  │ mozjpeg: true       │         │ mozjpeg: true       │
  └──────────┬──────────┘         └──────────┬──────────┘
             │                               │
             └───────────┬───────────────────┘
                         │ Promise.all
              ┌──────────┼──────────┐
              ▼                     ▼
  ┌─────────────────────┐ ┌─────────────────────┐
  │ uploadToMinioWithKey │ │ uploadToMinioWithKey │
  │ _original.jpg        │ │ _thumb.jpg          │
  └──────────┬───────────┘ └──────────┬──────────┘
             │                        │
             └───────────┬────────────┘
                         ▼
              ┌─────────────────────┐
              │ updateAvatarUrl(DB) │
              ├─────────────────────┤
              │ cleanupOldAvatar    │ ← 异步，不阻塞
              │ (delete _original   │
              │  + _thumb)          │
              └─────────────────────┘
```

#### 4.4.2 关键设计点

**预计算对象键：**

```typescript
// 在 sharp 处理之前就确定 MinIO key，确保 _original / _thumb 后缀不会丢失
const id = randomUUID();
const originalKey = `${AVATAR_PREFIX}/${id}_original.jpg`;
const thumbKey = `${AVATAR_PREFIX}/${id}_thumb.jpg`;
```

**并行管道（性能优化）：**

```typescript
// 两个 sharp 管道独立处理同一份 Buffer，互不依赖 → Promise.all 并行
const [originalBuffer, thumbBuffer] = await Promise.all([
  this.processImage(file, { ...originalOpts }),
  this.processImage(file, { ...thumbOpts })
]);

// MinIO 上传同样并行
const [originalUrl, thumbUrl] = await Promise.all([
  uploadToMinioWithKey(...), uploadToMinioWithKey(...)
]);
```

**异步清理（不阻塞响应）：**

```typescript
// cleanupOldAvatar 是 fire-and-forget，失败仅记日志
this.cleanupOldAvatar(oldAvatarUrl).catch(err => {
  this.fastify.log.warn({ err }, "旧头像清理失败");
});
```

---

### 4.5 管理员服务

**文件：** [admin.service.ts](./admin.service.ts)

#### 4.5.1 用户 CRUD 设计模式

```
createUser:
  verifySuperAdmin → 邮箱唯一性检查 → 生成密码(未提供则随机12位) → bcrypt.hash
  → Prisma create user → Prisma create userRole → 审计日志

listUsers:
  buildPagination → findMany + count 并行 → paginatedResult 封装

updateUser:
  verifySuperAdmin → 目标存在性检查 → Prisma update
  → 角色变更时: transaction(deleteMany + create)
  → 失效: userRoles + userAuthProfile + userListPrefix*

deleteUser:
  verifySuperAdmin → 不能删自己 → 目标存在性检查
  → Promise.all(update deleted_at + 批量失效缓存)
  → 审计日志
```

#### 4.5.2 SMTP 配置管理

```typescript
// 敏感字段自动加密存储
{ key: "smtp_password", value: encrypt(smtpConfig.password) }

// 读取时自动解密（仅在 getConfig 时）
grouped[c.category][c.key] = c.key === "smtp_password" && value.length > 50
  ? decrypt(value)
  : value;
```

---

### 4.6 认证中间件

**文件：** [auth.middleware.ts](./auth.middleware.ts)

#### 4.6.1 认证管道

```
Request → extractToken (从 Header 取 Bearer Token)
       → AuthService.verifyToken
         ├─ jwt.verify (签名校验)
         ├─ 黑名单检查 (isTokenBlacklisted: Redis EXISTS)
         └─ 用户档案查询 (Cache-Aside getOrSet)
       → request.user = { userId, email, role }
       → 继续路由处理
```

#### 4.6.2 AuthService 弱引用缓存

```typescript
const authServiceMap = new WeakMap<FastifyInstance, AuthService>();

function getAuthService(server: FastifyInstance): AuthService {
  // 同一 FastifyInstance 复用同一个 AuthService，避免重复初始化
  let service = authServiceMap.get(server);
  if (!service) {
    service = new AuthService(server);
    authServiceMap.set(server, service);
  }
  return service;
}
```

---

### 4.7 Zod 校验模式

**文件：** [schemas/user.schemas.ts](./schemas/user.schemas.ts)

#### 4.7.1 "定义一次，校验+类型+复用三合一"

```typescript
// 1. 定义基础校验规则（可跨接口复用）
export const emailSchema = z.string().min(1).email("请输入有效的邮箱地址");
export const passwordSchema = z.string().min(8).regex(/[A-Z]/).regex(/[a-z]/).regex(/\d/);
export const nicknameSchema = z
  .string()
  .min(1)
  .max(50)
  .regex(/^[\u4e00-\u9fa5a-zA-Z0-9_\s]+$/);

// 2. 组合为接口 Schema
export const updateProfileSchema = z
  .object({
    nickname: nicknameSchema.optional(),
    occupation: occupationSchema.optional(),
    bio: bioSchema.optional(),
    interests: interestsSchema.optional()
  })
  .refine(data => Object.keys(data).length > 0, {
    message: "至少需要提供一个有效字段"
  });

// 3. 自动推导 TypeScript 类型（无需手写 interface）
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
```

#### 4.7.2 路由层调用模式

```typescript
// profile.routes.ts — 统一的校验调用方式
const body = parseAndRespond(updateProfileSchema.safeParse(request.body), reply);
if (!body) return; // 校验失败时 parseAndRespond 已自动返回 400 错误
// body 类型已自动推导为 UpdateProfileInput
```

**扩展的 sendCode type 枚举：**

```typescript
type: z.enum(["register", "reset_password", "bind_email", "change_password"]);
```

新增 `bind_email` 和 `change_password` 以支持资料模块的邮箱绑定和密码修改场景。

---

## 5. 性能优化策略

### 5.1 已实施的优化方案

| 优化项               | 策略                                               | 效果               |
| -------------------- | -------------------------------------------------- | ------------------ |
| **Cache-Aside 缓存** | 读操作优先 Redis，miss 回源 DB + 后台回填          | 减少 80%+ DB 查询  |
| **getOrSet 模式**    | 缓存穿透保护，同一 key 只回源一次                  | 防缓存击穿         |
| **sharp 并行压缩**   | 原图 + 缩略图 `Promise.all` 并行处理               | 缩短 ~33% 压缩耗时 |
| **MinIO 并行上传**   | 原图 + 缩略图 `Promise.all` 并行上传               | 缩短 ~50% 上传耗时 |
| **异步审计日志**     | `createAuditLog().catch(() => {})` fire-and-forget | 零阻塞业务响应     |
| **异步旧文件清理**   | `cleanupOldAvatar().catch(...)` 不阻塞响应         | 零阻塞业务响应     |
| **DB 查询并行**      | `findMany` + `count` 并行、多条 `Promise.all`      | 减少串行 DB 往返   |
| **Lua 原子操作**     | 登录失败计数器使用 Redis Lua 脚本                  | 无竞态条件         |
| **SCAN 替代 KEYS**   | `delByPattern` 使用 SCAN 命令                      | 避免 Redis 阻塞    |
| **WeakMap 单例**     | AuthService 按 FastifyInstance 复用                | 避免重复初始化     |

### 5.2 性能瓶颈分析

| 瓶颈点         | 当前耗时        | 影响                          |
| -------------- | --------------- | ----------------------------- |
| bcrypt.hash    | ~200ms          | 注册/修改密码时的不可绕过开销 |
| bcrypt.compare | ~50ms           | 登录/修改密码时的验证开销     |
| sharp 压缩     | ~200ms (已并行) | 头像上传的核心 CPU 密集操作   |
| MinIO 上传     | ~100ms (已并行) | 已优化，取决于网络带宽        |

### 5.3 潜在优化方向

| 方向                 | 说明                                                    | 适用场景             |
| -------------------- | ------------------------------------------------------- | -------------------- |
| **bcrypt 降轮次**    | 当前 10 轮，高并发场景可降至 8 轮                       | 大规模注册           |
| **头像 CDN**         | MinIO URL 替换为 CDN 域名                               | 生产环境千级以上用户 |
| **图片预压缩**       | 前端 Canvas 压缩至 ≤800px 再上传，减少服务端 sharp 开销 | 高并发上传           |
| **JWT 无状态优化**   | 使用非对称密钥 (RS256)，微服务间无需共享 Secret         | 多服务架构           |
| **批量预生成验证码** | 预先计算 N 个验证码缓存到 Redis，避免实时 randomInt     | 短信/邮件高频发送    |

---

## 6. 落地实践逻辑

### 6.1 业务场景案例

#### 场景一：系统首次部署 → 管理员注册

```
1. GET /api/auth/status → { initialized: false }
2. POST /api/auth/register → { email, password, username }
   后端：创建 User + UserRole(super_admin) + 生成 Token
   → 返回 accessToken + refreshToken + { isFirstUser: true }
3. 前端存储 Token，跳转管理后台
4. 管理员配置 SMTP → PUT /api/admin/config/smtp
   后端：encrypt(password) → upsert 6 条 systemConfig → 失效缓存
5. 开放注册 → 前端通过管理面板设置 registration_enabled = true
6. GET /api/auth/status → { initialized: true, registrationEnabled: true }
```

#### 场景二：普通用户注册 → 完善资料

```
1. POST /api/auth/send-code { email, type: "register" }
2. POST /api/auth/verify-register { email, code, password, username }
   → 返回 Token + 自动登录
3. GET /api/user/profile
   → { nickname: null, occupation: null, bio: null, interests: [], ... }
   首访用户返回默认值，不报错
4. PUT /api/user/profile { nickname, occupation, bio, interests }
5. POST /api/user/avatar (multipart file)
6. POST /api/auth/send-code { email, type: "bind_email" }
7. POST /api/user/bind-email { email, code }
```

#### 场景三：用户修改密码

```
1. PUT /api/user/change-password { currentPassword, newPassword }
   后端：
     - bcrypt.compare(currentPassword) 验证
     - bcrypt.compare(newPassword) 防止相同
     - bcrypt.hash(newPassword) 更新
     - del(auth:user:access:{id}) 使旧 Token 失效
     - del(cache:user:auth:{id}) 清除认证缓存
     - blacklistToken(当前 JTI) 加入黑名单
   → 返回 "密码修改成功，请重新登录"
2. 前端清除本地 Token，跳转登录页
```

#### 场景四：用户注销账号

```
1. DELETE /api/user/account
   后端：
     - 检查用户存在且未注销
     - update deleted_at = now (软删除)
     - 批量失效所有缓存 + Token
     - 审计日志
   → 返回 { deletedAt: "2026-06-21T..." }
2. 前端清除 Token，跳转首页
```

### 6.2 异常处理机制

#### 6.2.1 错误码体系 (BizCode)

| 分段     | 错误码        | 说明                         |
| -------- | ------------- | ---------------------------- |
| 通用     | 1-999         | 系统级错误                   |
| 认证     | 1001-1010     | 登录/注册/验证码             |
| **资料** | **2001-2009** | 用户资料/头像/邮箱/密码/注销 |

```typescript
// 用户资料模块专用错误码
NICKNAME_INVALID = 2001; // 昵称包含非法字符
AVATAR_FORMAT_INVALID = 2002; // 图片格式不支持
AVATAR_TOO_LARGE = 2003; // 图片文件过大
AVATAR_SIZE_INVALID = 2004; // 图片尺寸不符合
STORAGE_UNAVAILABLE = 2005; // 文件存储服务不可用
EMAIL_ALREADY_BOUND = 2006; // 邮箱已被其他用户绑定
CURRENT_PASSWORD_INCORRECT = 2007; // 当前密码错误
PASSWORD_SAME_AS_CURRENT = 2008; // 新密码与当前密码相同
ACCOUNT_DELETED = 2009; // 账号已注销
```

#### 6.2.2 错误类层次

```
AppError (基础)
├── AuthError    — 认证/授权错误 (401/403)
└── ValidationError — 业务校验错误 (400)
```

#### 6.2.3 各层降级策略

| 层级               | 降级策略                                  |
| ------------------ | ----------------------------------------- |
| **Redis 读取**     | `try/catch` → 返回 null → 降级查 DB       |
| **Redis 写入**     | `try/catch` → warn 日志 → 不阻塞          |
| **审计日志**       | `.catch(() => {})` → 静默失败             |
| **旧文件清理**     | `.catch(err => log.warn)` → 静默失败      |
| **邮件发送**       | `try/catch` → log.warn → 不影响验证码存储 |
| **blacklistToken** | `try/catch` → 解码失败静默跳过            |

### 6.3 部署与运维

#### 6.3.1 环境变量

```bash
# JWT
JWT_SECRET=<change-in-production>      # 生产环境必须修改
JWT_ACCESS_EXPIRE=3600                 # Access Token 有效期（秒）
JWT_REFRESH_EXPIRE=604800              # Refresh Token 有效期（秒）

# MinIO
MINIO_ENDPOINT=localhost               # MinIO 服务地址
MINIO_PORT=9000                        # MinIO 端口
MINIO_BUCKET=questionnaire             # Bucket 名称
MINIO_AVATAR_PREFIX=avatars            # 头像存储前缀
MINIO_USE_SSL=false                    # 是否使用 HTTPS

# 数据库
DATABASE_URL=mysql://root:pass@localhost:3306/questionnaire

# Redis
REDIS_URL=redis://localhost:6379

# RabbitMQ
RABBITMQ_URL=amqp://localhost:5672

# 限流
REQUEST_TIMEOUT=30000                  # 请求超时
KEEP_ALIVE_TIMEOUT=72000               # Keep-Alive 超时
```

#### 6.3.2 生产环境必须修改项

1. **JWT_SECRET** — 必须更换为强随机字符串（≥32 字节）
2. **MinIO Bucket Policy** — 配置为 public-read 或将 `buildUrl` 改为预签名 URL
3. **bcrypt 轮次** — 可根据服务器性能调整（当前 10 轮）
4. **Redis 持久化** — 确保 AOF/RDB 开启，防止重启后登录状态全丢失

#### 6.3.3 启动前检查清单

- [ ] MySQL 已执行 Prisma migrate
- [ ] Redis 可连接且开启了持久化
- [ ] MinIO Bucket 已创建且 Policy 配置正确
- [ ] RabbitMQ 已启动（邮件服务依赖）
- [ ] SMTP 配置已在管理后台设置
- [ ] JWT_SECRET 已更换为非默认值

---

## 7. 依赖工具汇总

### 项目内部工具

| 工具                                                      | 文件                  | 用途                        |
| --------------------------------------------------------- | --------------------- | --------------------------- |
| `extractToken`                                            | `auth.middleware.ts`  | 从请求头提取 Bearer Token   |
| `parseAndRespond` / `parseQueryAndRespond`                | `utils/zod.ts`        | Zod 校验 + 自动错误响应     |
| `createCache` / `CacheKeys` / `CacheTTL`                  | `utils/cache.ts`      | Redis 缓存客户端 + Key 管理 |
| `createAuditLog`                                          | `utils/audit-log.ts`  | 统一审计日志写入            |
| `uploadToMinioWithKey` / `deleteFromMinio` / `extractKey` | `utils/upload.ts`     | MinIO 上传/删除/URL 解析    |
| `encrypt` / `decrypt`                                     | `utils/crypto.ts`     | SMTP 密码等敏感字段加密     |
| `buildPagination` / `paginatedResult`                     | `utils/pagination.ts` | 分页构建与封装              |
| `BizCode` / `sendSuccess` / `sendError`                   | `utils/response.ts`   | 统一响应格式与错误码管理    |

### 外部关键依赖

| 依赖                  | 用途                         |
| --------------------- | ---------------------------- |
| `jsonwebtoken`        | JWT 签发与验证               |
| `bcrypt`              | 密码哈希与校验               |
| `sharp`               | 图片压缩与元数据读取         |
| `file-type`           | 文件魔数检测                 |
| `zod`                 | 请求体/查询参数 Schema 校验  |
| `@fastify/multipart`  | multipart/form-data 文件解析 |
| `@fastify/rate-limit` | 接口限流保护                 |

---

> 本文档覆盖了 User 模块从架构到实现的全部最佳实践。建议结合实际代码阅读，重点关注 Service 层的 Cache-Aside 模式、Token 黑名单三态一致性、Zod Schema 的定义与复用方式，以及头像上传的并行处理管线设计。
