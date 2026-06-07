# Mock 开发测试文档

## 启动方式

### Mock 模式（推荐）

```bash
pnpm dev:mock
```

### 正常后端模式

```bash
pnpm dev
```

---

## 测试账号

### 1. 系统管理员（超级管理员）

| 字段 | 值                  |
| ---- | ------------------- |
| 邮箱 | `admin@example.com` |
| 密码 | `Admin@123`         |
| 角色 | `super_admin`       |
| 状态 | 启用                |

### 2. 测试用户（普通用户）

| 字段 | 值                 |
| ---- | ------------------ |
| 邮箱 | `user@example.com` |
| 密码 | `User@1234`        |
| 角色 | `user`             |
| 状态 | 启用               |

### 3. 已禁用用户（用于测试禁用状态）

| 字段 | 值                  |
| ---- | ------------------- |
| 邮箱 | `disabled@test.com` |
| 密码 | `Disabled1`         |
| 角色 | `user`              |
| 状态 | 禁用                |

---

## 验证码说明

所有需要验证码的场景，固定验证码为：**`123456`**

包括：

- 注册验证码
- 重置密码验证码

---

## 认证接口（/api/auth/\*）

### GET /api/auth/status

获取系统初始化状态

**响应示例**

```json
{
  "code": 0,
  "msg": "ok",
  "data": {
    "initialized": true,
    "registrationEnabled": true,
    "registrationMode": "email_verify",
    "smtpConfigured": true
  }
}
```

---

### POST /api/auth/login

用户登录

**请求参数**

```json
{
  "email": "admin@example.com",
  "password": "Admin@123"
}
```

**成功响应**

```json
{
  "code": 0,
  "msg": "登录成功",
  "data": {
    "token": "mock_xxx",
    "tokenType": "Bearer",
    "expiresIn": 3600,
    "refreshToken": "mock_xxx",
    "refreshExpiresIn": 604800,
    "user": {
      "id": "1",
      "email": "admin@example.com",
      "username": "系统管理员",
      "role": "super_admin"
    }
  }
}
```

**错误码**
| 错误码 | 说明 |
|--------|------|
| 400 | 邮箱和密码不能为空 |
| 401 | 邮箱或密码错误（含 remainAttempts） |
| 1006 | 账户已被禁用 |

---

### POST /api/auth/send-code

发送验证码

**请求参数**

```json
{
  "email": "test@example.com",
  "type": "register" // 或 "reset_password"
}
```

**成功响应**

```json
{
  "code": 0,
  "msg": "验证码已发送",
  "data": {
    "expireSeconds": 300
  }
}
```

**错误码**
| 错误码 | 说明 |
|--------|------|
| 400 | 邮箱和验证码类型不能为空，或类型无效 |
| 1001 | 该邮箱已被注册（register 类型时） |

---

### POST /api/auth/register

初始化注册（首个超级管理员）

**请求参数**

```json
{
  "email": "new@example.com",
  "password": "NewUser@123",
  "username": "新用户" // 可选
}
```

**成功响应**

```json
{
  "code": 0,
  "msg": "注册成功",
  "data": {
    "token": "mock_xxx",
    "tokenType": "Bearer",
    "expiresIn": 3600,
    "refreshToken": "mock_xxx",
    "refreshExpiresIn": 604800,
    "user": { ... },
    "isFirstUser": true
  }
}
```

**错误码**
| 错误码 | 说明 |
|--------|------|
| 400 | 邮箱和密码不能为空 |
| 403 | 系统已初始化，请使用邮箱验证注册 |
| 1001 | 该邮箱已被注册 |

---

### POST /api/auth/verify-register

邮箱验证注册

**请求参数**

```json
{
  "email": "new@example.com",
  "code": "123456",
  "password": "NewUser@123",
  "username": "新用户" // 可选
}
```

**成功响应**

```json
{
  "code": 0,
  "msg": "注册成功",
  "data": {
    "token": "mock_xxx",
    "tokenType": "Bearer",
    "expiresIn": 3600,
    "refreshToken": "mock_xxx",
    "refreshExpiresIn": 604800,
    "user": { ... }
  }
}
```

**错误码**
| 错误码 | 说明 |
|--------|------|
| 400 | 邮箱、验证码和密码不能为空 |
| 1003 | 验证码错误 |
| 1004 | 验证码已过期 |
| 1001 | 该邮箱已被注册 |

---

### POST /api/auth/refresh

刷新 Token

**请求参数**

```json
{
  "refreshToken": "mock_xxx"
}
```

**成功响应**

```json
{
  "code": 0,
  "msg": "Token 刷新成功",
  "data": {
    "token": "mock_xxx",
    "tokenType": "Bearer",
    "expiresIn": 3600,
    "refreshToken": "mock_xxx",
    "refreshExpiresIn": 604800,
    "user": { ... }
  }
}
```

---

### POST /api/auth/reset-password

重置密码

**请求参数**

```json
{
  "email": "user@example.com",
  "code": "123456",
  "newPassword": "NewPass@123"
}
```

**成功响应**

```json
{
  "code": 0,
  "msg": "密码重置成功",
  "data": null
}
```

---

### POST /api/auth/logout

退出登录

**成功响应**

```json
{
  "code": 0,
  "msg": "已退出登录",
  "data": null
}
```

---

## 用户管理接口（/api/admin/\*）

### GET /api/admin/users

获取用户列表

**查询参数**
| 参数 | 类型 | 说明 |
|------|------|------|
| page | number | 页码，默认 1 |
| limit | number | 每页条数，默认 20 |
| email | string | 邮箱过滤 |
| status | string | 状态过滤（0 或 1） |

**成功响应**

```json
{
  "code": 0,
  "msg": "ok",
  "data": {
    "items": [
      {
        "id": "1",
        "email": "admin@example.com",
        "username": "系统管理员",
        "role": "admin",
        "status": 1,
        "created_at": "2026-01-01T00:00:00Z",
        "last_login_at": "2026-06-07T08:30:00Z"
      }
    ],
    "total": 3,
    "page": 1,
    "limit": 20,
    "totalPages": 1
  }
}
```

---

### POST /api/admin/users

创建用户

**请求参数**

```json
{
  "email": "new@example.com",
  "username": "新用户",
  "role": "user",
  "password": "NewUser@123" // 可选，不传则自动生成
}
```

**成功响应**

```json
{
  "code": 0,
  "msg": "用户创建成功",
  "data": {
    "id": "4",
    "email": "new@example.com",
    "username": "新用户",
    "role": "user",
    "status": 1,
    "created_at": "2026-06-07T...Z",
    "last_login_at": null,
    "passwordProvided": true
  }
}
```

---

### PUT /api/admin/users/:id

更新用户

**路径参数**
| 参数 | 说明 |
|------|------|
| id | 用户 ID |

**请求参数**

```json
{
  "username": "更新后的用户名",
  "role": "admin",
  "status": 1
}
```

---

### DELETE /api/admin/users/:id

删除用户

**路径参数**
| 参数 | 说明 |
|------|------|
| id | 用户 ID |

---

### GET /api/admin/config

获取系统配置

**成功响应**

```json
{
  "code": 0,
  "msg": "ok",
  "data": {
    "smtp": { ... },
    "auth": { ... }
  }
}
```

---

### PUT /api/admin/config/smtp

更新 SMTP 配置

**请求参数**

```json
{
  "enabled": true,
  "host": "smtp.example.com",
  "port": "587",
  "username": "noreply@example.com",
  "fromEmail": "noreply@example.com"
}
```

---

## 响应格式说明

所有接口响应统一使用以下格式：

```typescript
{
  code: number; // 0 表示成功，其他为失败
  msg: string; // 提示信息
  data: any | null; // 响应数据
}
```

---

## 调试日志

Mock 会在浏览器控制台输出调试日志，格式为：

```
[Mock] GET /api/auth/status
[Mock] POST /api/auth/login { email: "...", password: "***" }
```
