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
