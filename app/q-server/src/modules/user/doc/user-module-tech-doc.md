# 用户模块技术说明文档

> 版本：1.0  
> 日期：2026-06-06  
> 作者：系统自动生成

---

## 目录

1. [模块概述](#1-模块概述)
2. [架构设计](#2-架构设计)
   2.1 [模块结构](#21-模块结构)
   2.2 [核心类职责](#22-核心类职责)
   2.3 [依赖关系](#23-依赖关系)
3. [接口文档](#3-接口文档)
   3.1 [认证接口](#31-认证接口)
   3.2 [管理员接口](#32-管理员接口)
4. [业务流程](#4-业务流程)
   4.1 [登录流程](#41-登录流程)
   4.2 [注册流程](#42-注册流程)
   4.3 [Token 管理](#43-token-管理)
5. [数据模型](#5-数据模型)
   5.1 [数据库表](#51-数据库表)
   5.2 [Redis Key 设计](#52-redis-key-设计)
6. [安全机制](#6-安全机制)
   6.1 [密码加密](#61-密码加密)
   6.2 [登录安全](#62-登录安全)
   6.3 [Token 安全](#63-token-安全)
7. [审计日志](#7-审计日志)
8. [使用指南](#8-使用指南)
9. [部署与配置](#9-部署与配置)

---

## 1. 模块概述

**用户模块**（User Module）是问卷系统的核心认证与授权模块，负责处理用户登录、注册、Token 管理、权限控制等核心业务。

### 1.1 功能定位

| 功能域       | 功能说明                                   |
| ------------ | ------------------------------------------ |
| **认证管理** | 用户登录、登出、Token 刷新                 |
| **注册管理** | 初始化注册（首个超级管理员）、邮箱验证注册 |
| **用户管理** | 用户 CRUD、角色分配、状态管理              |
| **系统配置** | SMTP 配置管理、注册开关控制                |
| **安全防护** | 登录失败锁定、验证码频率限制、Token 黑名单 |
| **审计日志** | 记录所有敏感操作                           |

### 1.2 技术栈

| 技术       | 版本         | 用途         |
| ---------- | ------------ | ------------ |
| Fastify    | ^4.x         | Web 框架     |
| Prisma     | ^5.x         | ORM          |
| PostgreSQL | 15+          | 数据库       |
| Redis      | 7+           | 缓存/限流    |
| JWT        | jsonwebtoken | 身份认证     |
| bcrypt     | ^5.x         | 密码加密     |
| Zod        | ^3.x         | 参数校验     |
| RabbitMQ   | 3.12+        | 异步消息队列 |

---

## 2. 架构设计

### 2.1 模块结构

```
src/modules/user/
├── auth.routes.ts        # 认证路由（公开接口）
├── auth.service.ts       # 认证服务（核心业务逻辑）
├── admin.routes.ts       # 管理员路由（需权限）
├── admin.service.ts      # 管理员服务（用户管理）
├── auth.middleware.ts    # 认证中间件
├── schemas/
│   └── user.schemas.ts   # Zod 校验规则
└── doc/
    └── user-module-tech-doc.md  # 技术文档
```

### 2.2 核心类职责

| 类名                | 文件               | 职责                           |
| ------------------- | ------------------ | ------------------------------ |
| `AuthService`       | auth.service.ts    | 登录、注册、Token 管理、验证码 |
| `AdminService`      | admin.service.ts   | 用户 CRUD、系统配置管理        |
| `authenticate`      | auth.middleware.ts | Token 校验中间件               |
| `requireSuperAdmin` | auth.middleware.ts | 超级管理员权限校验             |

### 2.3 依赖关系

```
┌─────────────────────────────────────────────────────────────┐
│                        用户模块                              │
├─────────────────────────────────────────────────────────────┤
│  auth.routes ──────► auth.service ──────► Prisma/Redis/AMQP │
│       │                   │                                 │
│       └───────────────────┴                                 │
│  admin.routes ──────► admin.service ──────► Prisma          │
│       │                      │                              │
│       └──────────────────────┘                              │
│  auth.middleware ──────► auth.service                       │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. 接口文档

### 3.1 认证接口

| HTTP方法 | 路径                        | 功能         | 认证要求 |
| -------- | --------------------------- | ------------ | -------- |
| GET      | `/api/auth/status`          | 获取系统状态 | 否       |
| POST     | `/api/auth/login`           | 用户登录     | 否       |
| POST     | `/api/auth/send-code`       | 发送验证码   | 否       |
| POST     | `/api/auth/register`        | 初始化注册   | 否       |
| POST     | `/api/auth/verify-register` | 邮箱验证注册 | 否       |
| POST     | `/api/auth/refresh`         | 刷新 Token   | 否       |
| POST     | `/api/auth/reset-password`  | 重置密码     | 否       |
| POST     | `/api/auth/logout`          | 登出         | 是       |

#### 3.1.1 GET /api/auth/status

**响应示例：**

```json
{
  "data": {
    "initialized": true,
    "registrationEnabled": true,
    "registrationMode": "email_verify",
    "smtpConfigured": true
  },
  "code": 0,
  "msg": "success"
}
```

#### 3.1.2 POST /api/auth/login

**请求体：**

```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**响应示例：**

```json
{
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "tokenType": "Bearer",
    "expiresIn": 3600,
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshExpiresIn": 604800,
    "user": {
      "id": "1",
      "email": "user@example.com",
      "username": "张三",
      "role": "user"
    }
  },
  "code": 0,
  "msg": "登录成功"
}
```

#### 3.1.3 POST /api/auth/send-code

**请求体：**

```json
{
  "email": "user@example.com",
  "type": "register"
}
```

**响应示例：**

```json
{
  "data": {
    "expireSeconds": 300
  },
  "code": 0,
  "msg": "验证码已发送"
}
```

#### 3.1.4 POST /api/auth/register（初始化注册）

**请求体：**

```json
{
  "email": "admin@example.com",
  "password": "Admin@123",
  "username": "超级管理员"
}
```

**响应示例：**

```json
{
  "data": {
    "token": "...",
    "tokenType": "Bearer",
    "expiresIn": 3600,
    "refreshToken": "...",
    "refreshExpiresIn": 604800,
    "user": {
      "id": "1",
      "email": "admin@example.com",
      "username": "超级管理员",
      "role": "super_admin"
    },
    "isFirstUser": true
  },
  "code": 0,
  "msg": "注册成功"
}
```

#### 3.1.5 POST /api/auth/verify-register（邮箱验证注册）

**请求体：**

```json
{
  "email": "user@example.com",
  "code": "123456",
  "password": "Password@123",
  "username": "李四"
}
```

#### 3.1.6 POST /api/auth/refresh

**请求体：**

```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

#### 3.1.7 POST /api/auth/reset-password

**请求体：**

```json
{
  "email": "user@example.com",
  "code": "123456",
  "newPassword": "NewPassword@123"
}
```

#### 3.1.8 POST /api/auth/logout

**请求头：** `Authorization: Bearer <token>`

---

### 3.2 管理员接口

| HTTP方法 | 路径                     | 功能                  |
| -------- | ------------------------ | --------------------- |
| POST     | `/api/admin/users`       | 创建用户              |
| GET      | `/api/admin/users`       | 用户列表（分页+搜索） |
| PUT      | `/api/admin/users/:id`   | 更新用户              |
| DELETE   | `/api/admin/users/:id`   | 删除用户（软删除）    |
| GET      | `/api/admin/config`      | 获取系统配置          |
| PUT      | `/api/admin/config/smtp` | 更新 SMTP 配置        |

#### 3.2.1 POST /api/admin/users

**请求体：**

```json
{
  "email": "newuser@example.com",
  "username": "新用户",
  "role": "user",
  "password": "Optional@123"
}
```

**响应示例：**

```json
{
  "data": {
    "id": "2",
    "email": "newuser@example.com",
    "username": "新用户",
    "role": "user",
    "status": 1,
    "passwordProvided": true
  },
  "code": 0,
  "msg": "用户创建成功"
}
```

#### 3.2.2 GET /api/admin/users

**请求参数：**

```json
{
  "page": 1,
  "limit": 20,
  "email": "keyword",
  "status": 1
}
```

**响应示例：**

```json
{
  "data": {
    "items": [
      {
        "id": "1",
        "email": "admin@example.com",
        "username": "超级管理员",
        "role": "admin",
        "status": 1,
        "created_at": "2024-01-01T00:00:00.000Z",
        "last_login_at": "2024-01-02T10:00:00.000Z"
      }
    ],
    "total": 1,
    "page": 1,
    "limit": 20,
    "totalPages": 1
  },
  "code": 0,
  "msg": "success"
}
```

#### 3.2.3 PUT /api/admin/users/:id

**请求体：**

```json
{
  "username": "更新后的用户名",
  "role": "admin",
  "status": 1
}
```

#### 3.2.4 DELETE /api/admin/users/:id

**响应示例：**

```json
{
  "data": {
    "id": "2",
    "deleted": true
  },
  "code": 0,
  "msg": "用户已删除"
}
```

#### 3.2.5 PUT /api/admin/config/smtp

**请求体：**

```json
{
  "enabled": true,
  "host": "smtp.example.com",
  "port": 587,
  "username": "smtpuser",
  "password": "smtppassword",
  "fromEmail": "noreply@example.com"
}
```

---

## 4. 业务流程

### 4.1 登录流程

```
用户登录请求
    ↓
Zod 参数校验
    ↓
检查账户是否被锁定（Redis）
    ↓
查询用户（Prisma）
    ↓
验证密码（bcrypt）
    ↓
检查账户状态
    ↓
清除失败记录 + 更新登录时间
    ↓
获取用户角色
    ↓
生成 Access/Refresh Token
    ↓
记录审计日志
    ↓
返回登录结果
```

### 4.2 注册流程

#### 4.2.1 初始化注册（首个超级管理员）

```
检查系统是否已初始化
    ↓
检查邮箱唯一性
    ↓
创建用户 + 分配超级管理员角色
    ↓
生成 Token
    ↓
记录审计日志
```

#### 4.2.2 邮箱验证注册

```
发送验证码请求
    ↓
检查 SMTP 配置
    ↓
检查发送频率（Redis）
    ↓
生成验证码并存入 Redis（5分钟有效期）
    ↓
通过 RabbitMQ 异步发送邮件
    ↓
验证注册请求
    ↓
校验验证码
    ↓
创建用户 + 分配普通用户角色
    ↓
生成 Token
    ↓
记录审计日志
```

### 4.3 Token 管理

#### 4.3.1 Token 刷新流程

```
验证 Refresh Token
    ↓
查询用户
    ↓
将旧 Refresh Token 加入黑名单
    ↓
将旧 Access Token 精准失效（通过 JTI）
    ↓
生成新的 Access/Refresh Token
    ↓
返回新 Token
```

#### 4.3.2 Token 失效机制

```
┌─────────────────────────────────────────────────────┐
│                  Token 失效机制                      │
├─────────────────────────────────────────────────────┤
│  登出 → 将 Access Token JTI 加入黑名单              │
│  刷新 → 将旧 Refresh Token 加入黑名单               │
│        将旧 Access Token JTI 加入黑名单             │
│  密码重置 → 删除用户当前 Access Token 记录           │
│  用户禁用 → 下次请求时校验用户状态                   │
└─────────────────────────────────────────────────────┘
```

---

## 5. 数据模型

### 5.1 数据库表

#### users 表

| 字段          | 类型         | 约束                        | 说明                |
| ------------- | ------------ | --------------------------- | ------------------- |
| id            | BIGINT       | PRIMARY KEY, AUTO_INCREMENT | 用户 ID             |
| email         | VARCHAR(255) | UNIQUE, NOT NULL            | 邮箱                |
| password_hash | VARCHAR(255) | NOT NULL                    | 密码哈希            |
| username      | VARCHAR(50)  | NOT NULL                    | 用户名              |
| role          | VARCHAR(20)  | NOT NULL                    | 角色标识            |
| status        | INT          | NOT NULL, DEFAULT 1         | 状态（0禁用/1启用） |
| created_at    | TIMESTAMP    | DEFAULT NOW()               | 创建时间            |
| updated_at    | TIMESTAMP    | ON UPDATE NOW()             | 更新时间            |
| deleted_at    | TIMESTAMP    | NULLABLE                    | 软删除时间          |
| last_login_at | TIMESTAMP    | NULLABLE                    | 最后登录时间        |

#### user_roles 表

| 字段      | 类型        | 约束        | 说明     |
| --------- | ----------- | ----------- | -------- |
| user_id   | BIGINT      | FOREIGN KEY | 用户 ID  |
| role_code | VARCHAR(50) | NOT NULL    | 角色编码 |

#### system_config 表

| 字段        | 类型         | 约束        | 说明   |
| ----------- | ------------ | ----------- | ------ |
| key         | VARCHAR(100) | PRIMARY KEY | 配置键 |
| value       | TEXT         | NULLABLE    | 配置值 |
| category    | VARCHAR(50)  | NOT NULL    | 分类   |
| description | VARCHAR(255) | NULLABLE    | 描述   |

#### audit_logs 表

| 字段          | 类型        | 约束                        | 说明        |
| ------------- | ----------- | --------------------------- | ----------- |
| id            | BIGINT      | PRIMARY KEY, AUTO_INCREMENT | 日志 ID     |
| user_id       | BIGINT      | FOREIGN KEY                 | 操作用户 ID |
| action        | VARCHAR(50) | NOT NULL                    | 操作类型    |
| resource_type | VARCHAR(50) | NOT NULL                    | 资源类型    |
| resource_id   | BIGINT      | NULLABLE                    | 资源 ID     |
| details       | JSON        | NULLABLE                    | 详细信息    |
| created_at    | TIMESTAMP   | DEFAULT NOW()               | 创建时间    |

### 5.2 Redis Key 设计

| Key 前缀              | 完整格式                    | TTL          | 用途                      |
| --------------------- | --------------------------- | ------------ | ------------------------- |
| `auth:verify:`        | `auth:verify:{email}`       | 5分钟        | 验证码存储                |
| `auth:login_fail:`    | `auth:login_fail:{email}`   | 15分钟       | 登录失败计数              |
| `auth:login_lock:`    | `auth:login_lock:{email}`   | 30分钟       | 账户锁定标记              |
| `auth:send_rate:`     | `auth:send_rate:{email}`    | 1分钟        | 发送频率限制              |
| `auth:jwt:blacklist:` | `auth:jwt:blacklist:{jti}`  | Token有效期  | JWT 黑名单                |
| `auth:user:access:`   | `auth:user:access:{userId}` | Access有效期 | 用户当前 Access Token JTI |

---

## 6. 安全机制

### 6.1 密码加密

使用 **bcrypt** 算法进行密码加密，配置如下：

| 参数     | 值              | 说明             |
| -------- | --------------- | ---------------- |
| 哈希轮数 | 10              | 平衡安全性与性能 |
| 存储字段 | `password_hash` | 不存储明文密码   |

### 6.2 登录安全

#### 登录失败锁定机制

```
┌─────────────────────────────────────────────┐
│ 登录失败锁定流程                             │
├─────────────────────────────────────────────┤
│ 登录失败 → 记录失败次数（Redis INCR）        │
│           ↓                                 │
│ 失败次数 >= 5 → 设置锁定标记（30分钟）        │
│           ↓                                 │
│ 登录成功 → 清除失败记录和锁定标记            │
└─────────────────────────────────────────────┘
```

**使用 Lua 脚本保证原子性：**

```lua
local count = redis.call('incr', KEYS[1])
if count == 1 then
  redis.call('expire', KEYS[1], tonumber(ARGV[1]))
end
if count >= tonumber(ARGV[2]) then
  redis.call('set', KEYS[2], ARGV[3], 'ex', tonumber(ARGV[4]))
end
return count
```

#### 验证码频率限制

| 限制项       | 值    | 说明     |
| ------------ | ----- | -------- |
| 时间窗口     | 1分钟 | 滑动窗口 |
| 最大发送次数 | 3次   | 同一邮箱 |

### 6.3 Token 安全

#### JWT 结构

```json
{
  "sub": "1", // 用户 ID
  "email": "user@example.com",
  "role": "user", // 用户角色
  "type": "access", // Token 类型（access/refresh）
  "jti": "uuid-xxx", // JWT ID（用于黑名单）
  "iat": 1704067200, // 签发时间
  "exp": 1704070800 // 过期时间
}
```

#### Token 轮换策略

| 场景       | 处理方式                       |
| ---------- | ------------------------------ |
| 刷新 Token | 旧 Refresh Token 加入黑名单    |
| 刷新 Token | 旧 Access Token JTI 加入黑名单 |
| 登出       | Access Token JTI 加入黑名单    |
| 密码重置   | 删除用户当前 Access Token 记录 |

---

## 7. 审计日志

所有敏感操作都会记录审计日志：

| 操作           | action               | resourceType    | details 内容                                            |
| -------------- | -------------------- | --------------- | ------------------------------------------------------- |
| 用户登录       | `login`              | `user`          | `{ loginTime }`                                         |
| 初始化注册     | `register`           | `user`          | `{ action: "initial_registration", isFirstUser: true }` |
| 邮箱验证注册   | `register`           | `user`          | `{ action: "email_verification_register" }`             |
| 密码重置       | `reset_password`     | `user`          | -                                                       |
| 创建用户       | `create_user`        | `user`          | `{ createdEmail, createdRole }`                         |
| 更新用户       | `update_user`        | `user`          | `{ changes }`                                           |
| 删除用户       | `delete_user`        | `user`          | `{ deletedEmail }`                                      |
| 更新 SMTP 配置 | `update_smtp_config` | `system_config` | `{ enabled, host }`                                     |

---

## 8. 使用指南

### 8.1 初始化系统

```bash
# 1. 启动依赖服务
docker-compose up -d

# 2. 运行数据库迁移
pnpm prisma migrate dev

# 3. 启动服务
pnpm start

# 4. 通过 API 创建首个超级管理员
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@example.com", "password": "Admin@123", "username": "超级管理员"}'
```

### 8.2 配置 SMTP

```bash
# 登录后获取 Token
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@example.com", "password": "Admin@123"}' \
  | jq -r '.data.token')

# 配置 SMTP
curl -X PUT http://localhost:3000/api/admin/config/smtp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "enabled": true,
    "host": "smtp.example.com",
    "port": 587,
    "username": "smtpuser",
    "password": "smtppassword",
    "fromEmail": "noreply@example.com"
  }'
```

### 8.3 开启注册

```bash
# 通过数据库直接设置（或提供配置 API）
# 启用注册
INSERT INTO system_config (key, value, category, description)
VALUES ('registration_enabled', 'true', 'auth', '是否启用注册功能')
ON CONFLICT (key) DO UPDATE SET value = 'true';
```

---

## 9. 部署与配置

### 9.1 环境变量

| 变量名               | 说明                       | 默认值                          |
| -------------------- | -------------------------- | ------------------------------- |
| `PORT`               | 服务端口                   | 3000                            |
| `DATABASE_URL`       | 数据库连接地址             | -                               |
| `REDIS_URL`          | Redis 连接地址             | redis://localhost:6379          |
| `JWT_SECRET`         | JWT 密钥                   | dev-secret-change-in-production |
| `JWT_ACCESS_EXPIRE`  | Access Token 有效期（秒）  | 3600                            |
| `JWT_REFRESH_EXPIRE` | Refresh Token 有效期（秒） | 604800                          |
| `LOG_LEVEL`          | 日志级别                   | info                            |

### 9.2 Docker 部署

```yaml
# docker-compose.yml 关键配置
services:
  q-server:
    build: .
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgresql://user:pass@postgres:5432/db
      - REDIS_URL=redis://redis:6379
      - JWT_SECRET=${JWT_SECRET}
    depends_on:
      - postgres
      - redis
      - rabbitmq
```

---

## 附录：错误码表

| 错误码 | 说明         | HTTP 状态码 |
| ------ | ------------ | ----------- |
| 1001   | 邮箱已被注册 | 409         |
| 1002   | 邮箱不存在   | 404         |
| 1003   | 验证码无效   | 400         |
| 1004   | 验证码已过期 | 400         |
| 1005   | 账户已锁定   | 423         |
| 1006   | 账户已禁用   | 403         |
| 1007   | 密码错误     | 401         |
| 1008   | 系统未初始化 | 403         |
| 1009   | 注册已关闭   | 403         |
| 1010   | SMTP 未配置  | 503         |

---

**文档版本**：v1.0  
**最后更新**：2026-06-06  
**适用范围**：用户模块技术实现说明
