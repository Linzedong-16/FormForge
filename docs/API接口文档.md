# API接口文档

## 1. 通用说明

### 1.1 响应格式

**注意**：当前系统存在两种响应格式，建议统一使用一种格式。

#### 格式一（testRoutes使用）：
```json
{
  "code": 200,           // 状态码，200表示成功
  "message": "操作成功",  // 提示信息
  "data": {}            // 响应数据
}
```

#### 格式二（userRoutes和uploadRoutes使用）：
```json
{
  "success": true,       // 是否成功
  "message": "操作成功",  // 提示信息
  "data": {}            // 响应数据
}
```

### 1.2 错误处理

| 状态码 | 含义 | 说明 |
|--------|------|------|
| 400 | Bad Request | 请求参数错误 |
| 401 | Unauthorized | 未授权，请重新登录 |
| 403 | Forbidden | 拒绝访问 |
| 404 | Not Found | 请求的资源不存在 |
| 500 | Internal Server Error | 服务器内部错误 |

## 2. 测试接口

### 2.1 获取用户列表

- **请求方法**：GET
- **请求路径**：/test/users
- **请求参数**：无
- **响应示例**：
```json
{
  "code": 200,
  "message": "获取用户列表成功",
  "data": [
    {
      "id": 1,
      "name": "张三",
      "email": "zhangsan@example.com",
      "age": 25,
      "role": "admin"
    },
    {
      "id": 2,
      "name": "李四",
      "email": "lisi@example.com",
      "age": 30,
      "role": "user"
    }
  ]
}
```

### 2.2 获取系统信息

- **请求方法**：GET
- **请求路径**：/test/system/info
- **请求参数**：无
- **响应示例**：
```json
{
  "code": 200,
  "message": "获取系统信息成功",
  "data": {
    "name": "测试系统",
    "version": "1.0.0",
    "description": "前后端分离测试系统",
    "uptime": "3600",
    "nodeVersion": "v18.16.0",
    "timestamp": "2023-05-20T10:00:00.000Z"
  }
}
```

### 2.3 获取随机数据

- **请求方法**：GET
- **请求路径**：/test/random
- **请求参数**：无
- **响应示例**：
```json
{
  "code": 200,
  "message": "获取随机数据成功",
  "data": {
    "number": 42,
    "string": "abcdef12345",
    "timestamp": 1684572000000,
    "boolean": true,
    "randomArray": [10, 20, 30]
  }
}
```

## 3. 用户接口

### 3.1 获取所有用户

- **请求方法**：GET
- **请求路径**：/users
- **请求参数**：无
- **响应示例**：
```json
{
  "success": true,
  "message": "获取所有用户成功",
  "data": [
    {
      "id": 1,
      "username": "admin",
      "email": "admin@example.com",
      "createdAt": "2023-05-20T10:00:00.000Z",
      "updatedAt": "2023-05-20T10:00:00.000Z"
    }
  ]
}
```

### 3.2 根据ID获取用户

- **请求方法**：GET
- **请求路径**：/users/:id
- **请求参数**：
  - id：用户ID（路径参数）
- **响应示例**：
```json
{
  "success": true,
  "message": "获取用户成功",
  "data": {
    "id": 1,
    "username": "admin",
    "email": "admin@example.com",
    "createdAt": "2023-05-20T10:00:00.000Z",
    "updatedAt": "2023-05-20T10:00:00.000Z"
  }
}
```

### 3.3 创建用户

- **请求方法**：POST
- **请求路径**：/users
- **请求参数**：
  - username：用户名（必填）
  - email：邮箱（必填）
  - password：密码（必填）
- **请求示例**：
```json
{
  "username": "testuser",
  "email": "test@example.com",
  "password": "password123"
}
```
- **响应示例**：
```json
{
  "success": true,
  "message": "创建用户成功",
  "data": {
    "id": 2,
    "username": "testuser",
    "email": "test@example.com",
    "createdAt": "2023-05-20T10:30:00.000Z",
    "updatedAt": "2023-05-20T10:30:00.000Z"
  }
}
```

### 3.4 更新用户

- **请求方法**：PUT
- **请求路径**：/users/:id
- **请求参数**：
  - id：用户ID（路径参数）
  - username：用户名（可选）
  - email：邮箱（可选）
  - password：密码（可选）
- **请求示例**：
```json
{
  "username": "updateduser",
  "email": "updated@example.com"
}
```
- **响应示例**：
```json
{
  "success": true,
  "message": "更新用户成功",
  "data": {
    "id": 2,
    "username": "updateduser",
    "email": "updated@example.com",
    "createdAt": "2023-05-20T10:30:00.000Z",
    "updatedAt": "2023-05-20T11:00:00.000Z"
  }
}
```

### 3.5 删除用户

- **请求方法**：DELETE
- **请求路径**：/users/:id
- **请求参数**：
  - id：用户ID（路径参数）
- **响应示例**：
```json
{
  "success": true,
  "message": "删除用户成功",
  "data": null
}
```

### 3.6 上传用户头像

- **请求方法**：POST
- **请求路径**：/users/:id/avatar
- **请求参数**：
  - id：用户ID（路径参数）
  - avatar：头像文件（FormData）
- **响应示例**：
```json
{
  "success": true,
  "message": "上传头像成功",
  "data": {
    "filename": "avatar-1234567890.jpg",
    "originalName": "myavatar.jpg",
    "mimetype": "image/jpeg",
    "size": 102400,
    "path": "/uploads/avatar-1234567890.jpg"
  }
}
```

## 4. 文件上传接口

### 4.1 上传单个文件

- **请求方法**：POST
- **请求路径**：/upload
- **请求参数**：
  - file：文件（FormData）
- **响应示例**：
```json
{
  "success": true,
  "message": "文件上传成功",
  "data": {
    "filename": "file-1234567890.txt",
    "originalName": "document.txt",
    "mimetype": "text/plain",
    "size": 1024,
    "path": "/uploads/file-1234567890.txt"
  }
}
```

### 4.2 上传多个文件

- **请求方法**：POST
- **请求路径**：/upload/multiple
- **请求参数**：
  - files：文件数组（FormData，最多10个文件）
- **响应示例**：
```json
{
  "success": true,
  "message": "文件上传成功",
  "data": [
    {
      "filename": "file-1234567890.txt",
      "originalName": "document1.txt",
      "mimetype": "text/plain",
      "size": 1024,
      "path": "/uploads/file-1234567890.txt"
    },
    {
      "filename": "file-0987654321.txt",
      "originalName": "document2.txt",
      "mimetype": "text/plain",
      "size": 2048,
      "path": "/uploads/file-0987654321.txt"
    }
  ]
}
```

## 5. 消息互动接口

> **注意**：本节记录的是 `q-server`（问卷系统后端）的消息模块接口，与上文 1-4 节描述的
> 早期示例服务是两套不同的后端。本模块统一使用项目当前的规范响应结构
> `{ code: number, msg: string, data: T | null }`（`code === 0` 表示成功），而不是本文档
> 1.1 节里的两种历史格式——新增接口均遵循这一规范，1.1 节描述的历史格式仅适用于早期示例接口。

所有接口均需在请求头携带 `Authorization: Bearer <accessToken>`。

### 5.1 获取消息列表

- **请求方法**：GET
- **请求路径**：/api/messages
- **请求参数**（Query）：
  - page：页码，默认 1
  - page_size：每页条数，默认 20，最大 50
  - type：消息类型，可选，逗号分隔多个（`operation_notify`/`template_like`/`survey_lifecycle`/`user_admin_comm`/`admin_broadcast`）
  - is_read：是否已读，可选（`true`/`false`）
- **响应示例**：
```json
{
  "code": 0,
  "msg": "ok",
  "data": {
    "items": [
      {
        "id": "9001",
        "type": "operation_notify",
        "title": "问卷审核通过",
        "content": "您的问卷《2026员工满意度调研》已通过审核，现已可以发布。",
        "sender": { "id": null, "name": "系统通知" },
        "is_read": false,
        "related_resource": "survey",
        "related_resource_id": "100",
        "created_at": "2026-07-01T10:00:00.000Z",
        "read_at": null
      }
    ],
    "total": 1,
    "page": 1,
    "page_size": 20,
    "total_pages": 1
  }
}
```

### 5.2 获取未读消息计数

- **请求方法**：GET
- **请求路径**：/api/messages/unread-count
- **请求参数**：无
- **响应示例**：
```json
{
  "code": 0,
  "msg": "ok",
  "data": {
    "unread_total": 3,
    "by_type": {
      "operation_notify": 2,
      "template_like": 0,
      "survey_lifecycle": 0,
      "user_admin_comm": 1,
      "admin_broadcast": 0
    }
  }
}
```

### 5.3 标记单条消息已读

- **请求方法**：PUT
- **请求路径**：/api/messages/:id/read
- **响应示例**：
```json
{
  "code": 0,
  "msg": "ok",
  "data": { "id": "9001", "is_read": true, "read_at": "2026-07-01T12:00:00.000Z" }
}
```
- **权限**：仅消息接收者本人可标记；非本人消息返回 403。

### 5.4 全部标记已读

- **请求方法**：PUT
- **请求路径**：/api/messages/read-all
- **请求参数**（Body，可选）：
  - type：仅标记该类型，不传则标记全部
- **响应示例**：
```json
{
  "code": 0,
  "msg": "ok",
  "data": { "marked_count": 3 }
}
```

### 5.5 软删除消息

- **请求方法**：DELETE
- **请求路径**：/api/messages/:id
- **响应示例**：
```json
{
  "code": 0,
  "msg": "ok",
  "data": { "id": "9001", "deleted": true }
}
```
- **权限**：仅消息接收者本人可删除；仅影响自己的可见性，不影响其他接收者（如广播消息）。

### 5.6 发送消息（用户 → 管理员 / 管理员回复）

- **请求方法**：POST
- **请求路径**：/api/messages/send
- **请求参数**（Body）：
  - content：消息内容，1-2000 字符，必填
  - related_resource：关联资源类型，可选（`survey`/`template`/`review`）
  - related_resource_id：关联资源 ID，可选
  - reply_to_message_id：管理员回复用户咨询时携带，指向原始咨询消息 id，可选
- **校验规则**：
  - 发送频率限制：10 次/分钟/用户
  - `type` 由服务端固定为 `user_admin_comm`，接口不接受客户端指定，从根源杜绝伪造系统通知或用户间私信
  - 携带 `reply_to_message_id` 时，调用者必须是 `super_admin` 角色，否则返回 403
- **响应示例**：
```json
{
  "code": 0,
  "msg": "消息已发送",
  "data": { "id": "9101", "created_at": "2026-07-10T12:05:00.000Z" }
}
```
- **错误响应 429（频率超限）**：
```json
{
  "code": 429,
  "msg": "发送过于频繁，请稍后再试",
  "data": null
}
```

### 5.7 管理员广播消息

- **请求方法**：POST
- **请求路径**：/api/admin/messages/broadcast
- **权限**：仅 `super_admin`（`authenticate` + `requireSuperAdmin`）
- **请求参数**（Body）：
  - title：广播标题，1-200 字符，必填
  - content：广播内容，1-2000 字符，必填
  - target_role：目标范围，可选，默认 `all`（`all`/`user`/`super_admin`）
- **校验规则**：
  - 发送频率限制：3 次/天/管理员账号
  - 广播消息不落地到每个接收者一条记录，仅写入 1 条 `recipient_id=null` 的消息行 + 按需惰性创建的 `MessageBroadcastState`，避免大规模用户量下的写放大
- **响应示例**：
```json
{
  "code": 0,
  "msg": "广播已发布",
  "data": { "id": "9200", "estimated_recipients": 486 }
}
```
- **错误响应 429（频率超限）**：
```json
{
  "code": 429,
  "msg": "广播过于频繁，请稍后再试",
  "data": null
}
```

### 5.8 管理员查看已发送广播列表

- **请求方法**：GET
- **请求路径**：/api/admin/messages/sent
- **权限**：仅 `super_admin`（`authenticate` + `requireSuperAdmin`）
- **请求参数**（Query）：
  - page：页码，默认 1
  - page_size：每页条数，默认 20
- **响应示例**：
```json
{
  "code": 0,
  "msg": "ok",
  "data": {
    "items": [
      {
        "id": "9200",
        "title": "系统维护通知",
        "content": "今晚 22:00-23:00 系统维护",
        "target_role": "all",
        "estimated_recipients": 486,
        "created_at": "2026-07-01T00:00:00.000Z"
      }
    ],
    "total": 1,
    "page": 1,
    "page_size": 20
  }
}
```
- **说明**：`estimated_recipients` 为发布时刻的目标角色用户数快照对应的"当前"统计口径（每次查询按 `target_role` 实时统计用户数），并非发布瞬间的历史快照。

