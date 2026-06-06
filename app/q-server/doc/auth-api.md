# 用户认证模块 API 文档

> **模块版本**: v1.0  
> **生成日期**: 2026-06-06  
> **Base URL**: `http://<host>:<port>/api`

---

## 目录

1. [通用说明](#1-通用说明)
2. [认证接口 /api/auth](#2-认证接口-apiauth)
3. [管理接口 /api/admin](#3-管理接口-apiadmin)
4. [健康检查 /api/health](#4-健康检查-apihealth)
5. [错误码参考](#5-错误码参考)

---

## 1. 通用说明

### 1.1 响应格式

所有接口返回统一的 JSON 结构：

```json
{
  "data": null,
  "code": 0,
  "msg": "ok"
}
```

| 字段 | 类型        | 说明                        |
| ---- | ----------- | --------------------------- |
| data | any \| null | 业务数据，失败时通常为 null |
| code | number      | 业务状态码，0 表示成功      |
| msg  | string      | 提示信息                    |

### 1.2 认证方式

需要认证的接口在请求头携带 Bearer Token：

```
Authorization: Bearer <access_token>
```

Access Token 有效期 1 小时，过期后使用 Refresh Token 刷新。

### 1.3 请求体格式

所有 POST/PUT 接口使用 `Content-Type: application/json`。

---

## 2. 认证接口 /api/auth

### 2.1 获取系统状态

```
GET /api/auth/status
```

**说明**：无需登录，返回系统初始化状态、注册开关、SMTP 配置情况。

**响应示例**：

```json
{
  "data": {
    "initialized": true,
    "registrationEnabled": false,
    "registrationMode": "admin_only",
    "smtpConfigured": false
  },
  "code": 0,
  "msg": "ok"
}
```

| 字段                | 类型    | 说明                                     |
| ------------------- | ------- | ---------------------------------------- |
| initialized         | boolean | 是否已存在超级管理员（系统是否初始化）   |
| registrationEnabled | boolean | 注册功能是否开放                         |
| registrationMode    | string  | `email_verify`（邮箱验证）/ `admin_only` |
| smtpConfigured      | boolean | SMTP 邮件服务是否已配置                  |

---

### 2.2 用户登录

```
POST /api/auth/login
```

**请求体**：

```json
{
  "email": "admin@example.com",
  "password": "Admin123!"
}
```

| 参数     | 类型   | 必填 | 说明     |
| -------- | ------ | ---- | -------- |
| email    | string | 是   | 邮箱地址 |
| password | string | 是   | 登录密码 |

**成功响应**（code=0）：

```json
{
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "tokenType": "Bearer",
    "expiresIn": 3600,
    "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
    "refreshExpiresIn": 604800,
    "user": {
      "id": "1",
      "email": "admin@example.com",
      "username": "管理员",
      "role": "super_admin"
    }
  },
  "code": 0,
  "msg": "登录成功"
}
```

| 字段             | 类型   | 说明                     |
| ---------------- | ------ | ------------------------ |
| token            | string | Access Token (1h)        |
| tokenType        | string | 固定 "Bearer"            |
| expiresIn        | number | Access Token 有效期(秒)  |
| refreshToken     | string | Refresh Token (7天)      |
| refreshExpiresIn | number | Refresh Token 有效期(秒) |
| user.id          | string | 用户 ID                  |
| user.email       | string | 邮箱                     |
| user.username    | string | 用户名                   |
| user.role        | string | `super_admin` \| `user`  |

**错误响应**：

| code | msg                              | 说明              |
| ---- | -------------------------------- | ----------------- |
| 401  | 邮箱或密码错误                   | 含 remainAttempts |
| 1005 | 登录失败次数过多，请30分钟后再试 | 账户已临时锁定    |
| 1006 | 账户已被禁用，请联系管理员       | 账户状态为停用    |

---

### 2.3 发送验证码

```
POST /api/auth/send-code
```

**请求体**：

```json
{
  "email": "user@example.com",
  "type": "register"
}
```

| 参数  | 类型   | 必填 | 说明                                             |
| ----- | ------ | ---- | ------------------------------------------------ |
| email | string | 是   | 接收验证码的邮箱                                 |
| type  | string | 是   | `register`（注册）/ `reset_password`（重置密码） |

**成功响应**：

```json
{
  "data": {
    "expireSeconds": 300
  },
  "code": 0,
  "msg": "验证码已发送"
}
```

**错误响应**：

| code | msg                            | 说明               |
| ---- | ------------------------------ | ------------------ |
| 1009 | 暂未开放注册，请联系管理员     | 注册功能关闭       |
| 1010 | 邮件服务暂未配置，请联系管理员 | SMTP 未配置        |
| 409  | 该邮箱已被注册                 | 邮箱已存在         |
| 429  | 发送过于频繁，请1分钟后再试    | 频率限制(3次/分钟) |

---

### 2.4 初始化注册（首个超级管理员）

```
POST /api/auth/register
```

**说明**：仅在系统未初始化（无超级管理员）时可调用。第一个注册者自动成为超级管理员。

**请求体**：

```json
{
  "email": "admin@example.com",
  "password": "Admin123!",
  "username": "系统管理员"
}
```

| 参数     | 类型   | 必填 | 说明                            |
| -------- | ------ | ---- | ------------------------------- |
| email    | string | 是   | 管理员邮箱                      |
| password | string | 是   | 密码（至少8位，含大小写和数字） |
| username | string | 否   | 用户名（默认取邮箱前缀）        |

**成功响应**：

```json
{
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "tokenType": "Bearer",
    "expiresIn": 3600,
    "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
    "refreshExpiresIn": 604800,
    "user": {
      "id": "1",
      "email": "admin@example.com",
      "username": "系统管理员",
      "role": "super_admin"
    },
    "isFirstUser": true
  },
  "code": 0,
  "msg": "注册成功"
}
```

**错误响应**：

| code | msg                                          | 说明             |
| ---- | -------------------------------------------- | ---------------- |
| 403  | 系统已初始化，请使用邮箱验证注册或联系管理员 | 已存在超级管理员 |
| 1001 | 该邮箱已被注册                               | 邮箱已存在       |

---

### 2.5 邮箱验证注册

```
POST /api/auth/verify-register
```

**说明**：先调用 `/auth/send-code` 获取验证码，再调用此接口完成注册。

**请求体**：

```json
{
  "email": "user@example.com",
  "code": "123456",
  "password": "User123!",
  "username": "新用户"
}
```

| 参数     | 类型   | 必填 | 说明      |
| -------- | ------ | ---- | --------- |
| email    | string | 是   | 邮箱地址  |
| code     | string | 是   | 6位验证码 |
| password | string | 是   | 密码      |
| username | string | 否   | 用户名    |

**成功响应**：

```json
{
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "user": {
      "id": "2",
      "email": "user@example.com",
      "username": "新用户",
      "role": "user"
    }
  },
  "code": 0,
  "msg": "注册成功"
}
```

**错误响应**：

| code | msg                      | 说明         |
| ---- | ------------------------ | ------------ |
| 1003 | 验证码错误               | 验证码不匹配 |
| 1004 | 验证码已过期，请重新获取 | 超过5分钟    |

---

### 2.6 刷新 Token

```
POST /api/auth/refresh
```

**请求体**：

```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

**成功响应**：结构与登录成功相同（新 Token + 新 Refresh Token），旧 Refresh Token 即时失效。

**错误**：`401 — Refresh Token 无效或已过期`

---

### 2.7 登出

```
POST /api/auth/logout
Authorization: Bearer <access_token>
```

**说明**：将当前 Access Token 加入黑名单，使其即时失效。

**成功响应**：

```json
{
  "data": null,
  "code": 0,
  "msg": "已退出登录"
}
```

---

## 3. 管理接口 /api/admin

> **权限要求**：所有接口均需 `super_admin` 角色，Header 中携带 `Authorization: Bearer <token>`。

### 3.1 创建用户

```
POST /api/admin/users
```

**请求体**：

```json
{
  "email": "newuser@example.com",
  "username": "新用户",
  "role": "user",
  "password": "User123!"
}
```

| 参数     | 类型   | 必填 | 说明                                             |
| -------- | ------ | ---- | ------------------------------------------------ |
| email    | string | 是   | 邮箱                                             |
| username | string | 是   | 用户名                                           |
| role     | string | 是   | `user`（普通用户）/ `admin`（管理员）            |
| password | string | 否   | 密码（未提供则自动生成12位随机密码，响应中返回） |

**成功响应**：

```json
{
  "data": {
    "id": "3",
    "email": "newuser@example.com",
    "username": "新用户",
    "role": "user",
    "status": 1,
    "passwordProvided": false,
    "generatedPassword": "aB3$kL9mN2pQ"
  },
  "code": 0,
  "msg": "用户创建成功"
}
```

---

### 3.2 获取用户列表

```
GET /api/admin/users?page=1&limit=20&email=&status=
```

| 参数   | 类型   | 必填 | 默认值 | 说明                      |
| ------ | ------ | ---- | ------ | ------------------------- |
| page   | number | 否   | 1      | 页码                      |
| limit  | number | 否   | 20     | 每页数量（最大100）       |
| email  | string | 否   | -      | 邮箱模糊搜索              |
| status | number | 否   | -      | 状态筛选（0禁用 / 1启用） |

**成功响应**：

```json
{
  "data": {
    "items": [
      {
        "id": "1",
        "email": "admin@example.com",
        "username": "管理员",
        "role": "admin",
        "status": 1,
        "created_at": "2026-06-06T10:00:00.000Z",
        "last_login_at": "2026-06-06T12:00:00.000Z"
      }
    ],
    "total": 42,
    "page": 1,
    "limit": 20,
    "totalPages": 3
  },
  "code": 0,
  "msg": "ok"
}
```

---

### 3.3 更新用户

```
PUT /api/admin/users/:id
```

**路径参数**：`id` — 用户 ID

**请求体**（按需传入要修改的字段）：

```json
{
  "username": "新名称",
  "role": "user",
  "status": 1
}
```

| 参数     | 类型   | 必填 | 说明             |
| -------- | ------ | ---- | ---------------- |
| username | string | 否   | 新用户名         |
| role     | string | 否   | `user` / `admin` |
| status   | number | 否   | 0 禁用 / 1 启用  |

---

### 3.4 删除用户

```
DELETE /api/admin/users/:id
```

**说明**：软删除（设置 `deleted_at`），不会物理删除记录。不能删除自己。

**成功响应**：

```json
{
  "data": {
    "id": "3",
    "deleted": true
  },
  "code": 0,
  "msg": "用户已删除"
}
```

---

### 3.5 获取系统配置

```
GET /api/admin/config
```

**成功响应**：

```json
{
  "data": {
    "smtp": {
      "smtp_enabled": "true",
      "smtp_host": "smtp.example.com",
      "smtp_port": "587",
      "smtp_username": "noreply@example.com",
      "smtp_password": "",
      "smtp_from_email": "noreply@example.com"
    },
    "auth": {
      "registration_enabled": "true",
      "registration_mode": "admin_only",
      "jwt_secret": "",
      "jwt_access_expire": "3600",
      "jwt_refresh_expire": "604800"
    }
  },
  "code": 0,
  "msg": "ok"
}
```

---

### 3.6 更新 SMTP 配置

```
PUT /api/admin/config/smtp
```

**请求体**：

```json
{
  "enabled": true,
  "host": "smtp.example.com",
  "port": 587,
  "username": "noreply@example.com",
  "password": "your-smtp-password",
  "fromEmail": "noreply@example.com"
}
```

| 参数      | 类型    | 必填 | 说明          |
| --------- | ------- | ---- | ------------- |
| enabled   | boolean | 是   | 是否启用 SMTP |
| host      | string  | 是   | SMTP 服务器   |
| port      | number  | 是   | SMTP 端口     |
| username  | string  | 是   | SMTP 用户名   |
| password  | string  | 否   | SMTP 密码     |
| fromEmail | string  | 是   | 发件人邮箱    |

---

## 4. 健康检查 /api/health

```
GET /api/health
```

**说明**：无需认证，探测 PostgreSQL、Redis、RabbitMQ 连通性。

**成功响应**：

```json
{
  "data": {
    "status": "ok",
    "uptime": 12345.67,
    "checks": {
      "postgres": { "ok": true, "latency_ms": 2 },
      "redis": { "ok": true, "latency_ms": 1 },
      "rabbitmq": { "ok": true, "latency_ms": 5 }
    }
  },
  "code": 0,
  "msg": "ok"
}
```

某服务异常时 `status` 变为 `"degraded"`，`code` 为 500。

---

## 5. 错误码参考

### 5.1 HTTP 状态码

| code | 说明                |
| ---- | ------------------- |
| 0    | 成功                |
| 400  | 参数校验失败        |
| 401  | 未登录 / Token 无效 |
| 403  | 无权限              |
| 404  | 资源不存在          |
| 409  | 资源冲突            |
| 429  | 请求过于频繁        |
| 500  | 服务器内部错误      |

### 5.2 业务错误码

| code | 常量名                 | 说明                     |
| ---- | ---------------------- | ------------------------ |
| 1001 | EMAIL_EXISTS           | 邮箱已被注册             |
| 1002 | EMAIL_NOT_EXISTS       | 邮箱不存在               |
| 1003 | VERIFY_CODE_INVALID    | 验证码无效               |
| 1004 | VERIFY_CODE_EXPIRED    | 验证码已过期             |
| 1005 | ACCOUNT_LOCKED         | 账户已锁定（防暴力破解） |
| 1006 | ACCOUNT_DISABLED       | 账户已禁用               |
| 1007 | INVALID_PASSWORD       | 密码错误                 |
| 1008 | SYSTEM_NOT_INITIALIZED | 系统未初始化             |
| 1009 | REGISTRATION_CLOSED    | 用户注册已关闭           |
| 1010 | SMTP_NOT_CONFIGURED    | SMTP 邮件服务未配置      |

### 5.3 登录安全

| 规则                 | 参数         |
| -------------------- | ------------ |
| 连续失败锁定阈值     | 5 次         |
| 失败计数窗口         | 15 分钟      |
| 锁定时间             | 30 分钟      |
| 验证码有效期         | 5 分钟       |
| 验证码发送频率限制   | 1分钟最多3次 |
| Access Token 有效期  | 1 小时       |
| Refresh Token 有效期 | 7 天         |

---

## 附录：接口速查表

| 方法   | 路径                      | 认证   | 说明           |
| ------ | ------------------------- | ------ | -------------- |
| GET    | /api/health               | 否     | 健康检查       |
| GET    | /api/auth/status          | 否     | 系统状态       |
| POST   | /api/auth/login           | 否     | 用户登录       |
| POST   | /api/auth/send-code       | 否     | 发送验证码     |
| POST   | /api/auth/register        | 否     | 初始化注册     |
| POST   | /api/auth/verify-register | 否     | 邮箱验证注册   |
| POST   | /api/auth/refresh         | 否     | 刷新 Token     |
| POST   | /api/auth/logout          | Bearer | 登出           |
| POST   | /api/admin/users          | Bearer | 创建用户       |
| GET    | /api/admin/users          | Bearer | 用户列表       |
| PUT    | /api/admin/users/:id      | Bearer | 更新用户       |
| DELETE | /api/admin/users/:id      | Bearer | 删除用户       |
| GET    | /api/admin/config         | Bearer | 获取系统配置   |
| PUT    | /api/admin/config/smtp    | Bearer | 更新 SMTP 配置 |

---

**文档版本**: v1.0  
**生成日期**: 2026-06-06
