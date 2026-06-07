# Vite Mock 接口开发指南

> 基于 `vite-plugin-mock` 实现无后端环境快速开发前端业务

## 目录

1. [概述](#概述)
2. [快速开始](#快速开始)
3. [核心配置](#核心配置)
4. [Mock 数据编写规范](#mock-数据编写规范)
5. [高级用法](#高级用法)
6. [环境变量控制](#环境变量控制)
7. [常见问题](#常见问题)

---

## 概述

### 什么是 Mock？

Mock 是前端开发中的一种模拟数据技术，在后端接口未完成或本地开发环境无后端服务时，通过拦截前端请求并返回模拟数据，实现前端业务的独立开发和测试。

### 为什么需要 Mock？

| 场景           | 问题                    | Mock 解决方案              |
| -------------- | ----------------------- | -------------------------- |
| 后端接口未完成 | 前端无法联调            | 前端使用 Mock 数据独立开发 |
| 后端服务未启动 | 需要启动数据库/Redis 等 | 本地 Mock 无需依赖         |
| 跨地区协作     | 网络延迟高              | 本地 Mock 响应快           |
| 测试边界条件   | 后端数据难以构造        | Mock 可控地构造任意数据    |

### 技术选型

| 方案                 | 优点                              | 缺点           |
| -------------------- | --------------------------------- | -------------- |
| **vite-plugin-mock** | 配置简单、Vite 集成好、热更新支持 | 依赖 Vite 插件 |
| MSW                  | 真实网络请求、可拦截跨域          | 配置复杂       |
| axios-mock-adapter   | 直接拦截 axios                    | 需修改请求代码 |
| json-server          | 快速搭建 REST API                 | 仅支持 CRUD    |

**本项目推荐使用 `vite-plugin-mock`**

---

## 快速开始

### 1. 安装依赖

```bash
cd d:\coding\project\questionnaireSys\app\q-editor
pnpm add vite-plugin-mock -D
```

### 2. 创建 Mock 目录结构

```bash
mkdir -p d:\coding\project\questionnaireSys\app\q-editor\src\mock\modules
```

```
src/mock/
├── index.ts              # Mock 入口，汇总所有模块
├── _utils.ts             # 工具函数
└── modules/
    ├── auth.ts           # 认证模块 Mock
    └── user.ts           # 用户模块 Mock
```

### 3. 配置 Vite

修改 `vite.config.ts`：

```typescript
import { viteMockServe } from "vite-plugin-mock";

export default defineConfig({
  plugins: [
    vue(),
    vueJsx(),
    // ... 其他插件

    // 添加 Mock 插件
    viteMockServe({
      mockPath: "./src/mock", // mock 文件目录
      enable: true, // 开发环境启用
      watchFiles: "./src/mock" // 监听文件变化
    })
  ],

  server: {
    proxy: {
      // 开发环境默认不代理到后端，使用 Mock
      "/api": {
        target: "http://localhost:8080",
        changeOrigin: true,
        // 可选：仅在非 Mock 模式时启用
        bypass(req, _pr) {
          if (process.env.VITE_MOCK === "true") {
            return req; // 走 Mock
          }
        }
      }
    }
  }
});
```

### 4. 验证安装

访问任意 API 接口，如 `http://localhost:5173/api/auth/status`，如果返回 Mock 数据则说明配置成功。

---

## 核心配置

### 完整 Vite 配置示例

```typescript
// vite.config.ts
import { viteMockServe } from "vite-plugin-mock";

export default defineConfig({
  plugins: [
    vue(),
    // ... 其他插件
    viteMockServe({
      // Mock 文件路径
      mockPath: "./src/mock",

      // 是否启用 Mock
      enable: process.env.VITE_MOCK === "true",

      // 监听文件变化（生产环境关闭）
      watchFiles: process.env.NODE_ENV === "development" ? "./src/mock" : false,

      // 是否显示命令行日志
      logger: true
    })
  ]
});
```

### 环境变量配置

创建 `.env` 文件：

```bash
# 是否启用 Mock（true=启用，false=代理到后端）
VITE_MOCK=true

# API 基础路径
VITE_API_BASE=/api
```

---

## Mock 数据编写规范

### 1. 工具函数

创建 `src/mock/_utils.ts`：

```typescript
/**
 * Mock 工具函数
 */

/**
 * 构造标准响应格式
 * @param data 返回数据
 * @param code 状态码（0=成功）
 * @param msg 消息
 */
export function createResponse<T>(data: T, code = 0, msg = "success") {
  return {
    data,
    code,
    msg
  };
}

/**
 * 模拟网络延迟
 * @param ms 延迟毫秒数
 */
export function delay(ms = 300): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 随机失败（用于测试错误处理）
 * @param rate 失败概率 0-1
 */
export function randomFail(rate = 0.1): boolean {
  return Math.random() < rate;
}

/**
 * 生成随机 ID
 */
export function generateId(): number {
  return Date.now() + Math.floor(Math.random() * 1000);
}

/**
 * 生成随机字符串
 */
export function generateString(length = 16): string {
  return Math.random().toString(36).substr(2, length);
}
```

### 2. 认证模块 Mock

创建 `src/mock/modules/auth.ts`：

```typescript
import type { MockMethod } from "vite-plugin-mock";
import { createResponse, delay, generateString } from "../_utils";

// 模拟用户数据
const mockUsers = [
  {
    id: 1,
    email: "admin@example.com",
    username: "管理员",
    role: "super_admin",
    avatarUrl: null,
    status: 1,
    createdAt: "2024-01-01T00:00:00Z"
  },
  {
    id: 2,
    email: "user@example.com",
    username: "测试用户",
    role: "user",
    avatarUrl: null,
    status: 1,
    createdAt: "2024-01-15T00:00:00Z"
  }
];

// 模拟 Token 存储
const tokenStore = new Map<string, number>();

/**
 * 生成模拟 Token
 */
function generateToken(): string {
  const token = "mock_token_" + generateString(24);
  tokenStore.set(token, Date.now() + 7200000); // 2小时过期
  return token;
}

/**
 * 验证 Token
 */
function validateToken(token: string): boolean {
  const expireAt = tokenStore.get(token);
  if (!expireAt) return false;
  return Date.now() < expireAt;
}

export const authMocks: MockMethod[] = [
  // ============================================
  // 系统状态
  // ============================================
  {
    url: "/api/auth/status",
    method: "get",
    response: () => {
      return createResponse({
        initialized: true,
        smtpConfigured: true,
        allowRegister: true,
        version: "1.0.0"
      });
    }
  },

  // ============================================
  // 用户登录
  // ============================================
  {
    url: "/api/auth/login",
    method: "post",
    response: async ({ body }) => {
      await delay(500); // 模拟网络延迟

      const { email, password } = body as { email: string; password: string };

      // 参数验证
      if (!email || !password) {
        return createResponse(null, 1001, "邮箱和密码不能为空");
      }

      // 邮箱格式验证
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return createResponse(null, 1002, "邮箱格式不正确");
      }

      // 密码长度验证
      if (password.length < 6) {
        return createResponse(null, 1003, "密码至少6位");
      }

      // 模拟登录成功
      const user = mockUsers.find(u => u.email === email) || mockUsers[1];
      const token = generateToken();

      return createResponse({
        token,
        refreshToken: generateToken(),
        expiresIn: 7200,
        user
      });
    }
  },

  // ============================================
  // 发送验证码
  // ============================================
  {
    url: "/api/auth/send-code",
    method: "post",
    response: async ({ body }) => {
      await delay(800);

      const { email, type } = body as { email: string; type: string };

      if (!email) {
        return createResponse(null, 1001, "邮箱不能为空");
      }

      if (!["register", "reset_password", "login"].includes(type)) {
        return createResponse(null, 1004, "无效的验证码类型");
      }

      console.log(`[Mock] 发送验证码到 ${email}, 类型: ${type}, 验证码: 123456`);

      return createResponse({
        expireAt: Date.now() + 60000,
        message: "验证码已发送"
      });
    }
  },

  // ============================================
  // 初始化注册（首个超级管理员）
  // ============================================
  {
    url: "/api/auth/register",
    method: "post",
    response: async ({ body }) => {
      await delay(500);

      const { email, password, username } = body as {
        email: string;
        password: string;
        username?: string;
      };

      // 检查是否已初始化
      if (mockUsers.length > 0 && email !== "admin@example.com") {
        return createResponse(null, 2001, "系统已初始化，请使用普通注册");
      }

      // 检查邮箱是否已注册
      if (mockUsers.some(u => u.email === email)) {
        return createResponse(null, 2002, "该邮箱已被注册");
      }

      // 创建新用户
      const newUser = {
        id: mockUsers.length + 1,
        email,
        username: username || email.split("@")[0],
        role: "super_admin",
        avatarUrl: null,
        status: 1,
        createdAt: new Date().toISOString()
      };

      mockUsers.push(newUser);

      return createResponse({
        token: generateToken(),
        refreshToken: generateToken(),
        expiresIn: 7200,
        user: newUser
      });
    }
  },

  // ============================================
  // 邮箱验证注册
  // ============================================
  {
    url: "/api/auth/verify-register",
    method: "post",
    response: async ({ body }) => {
      await delay(500);

      const { email, code, password, username } = body as {
        email: string;
        code: string;
        password: string;
        username?: string;
      };

      // 模拟验证码验证（实际应为 123456）
      if (code !== "123456") {
        return createResponse(null, 2003, "验证码错误或已过期");
      }

      // 检查邮箱是否已注册
      if (mockUsers.some(u => u.email === email)) {
        return createResponse(null, 2002, "该邮箱已被注册");
      }

      const newUser = {
        id: mockUsers.length + 1,
        email,
        username: username || email.split("@")[0],
        role: "user",
        avatarUrl: null,
        status: 1,
        createdAt: new Date().toISOString()
      };

      mockUsers.push(newUser);

      return createResponse({
        token: generateToken(),
        refreshToken: generateToken(),
        expiresIn: 7200,
        user: newUser
      });
    }
  },

  // ============================================
  // 刷新 Token
  // ============================================
  {
    url: "/api/auth/refresh",
    method: "post",
    response: async ({ body }) => {
      await delay(200);

      const { refreshToken } = body as { refreshToken: string };

      if (!refreshToken) {
        return createResponse(null, 1001, "Refresh Token 不能为空");
      }

      return createResponse({
        token: generateToken(),
        refreshToken: generateToken(),
        expiresIn: 7200
      });
    }
  },

  // ============================================
  // 重置密码
  // ============================================
  {
    url: "/api/auth/reset-password",
    method: "post",
    response: async ({ body }) => {
      await delay(500);

      const { email, code, password } = body as {
        email: string;
        code: string;
        password: string;
      };

      if (code !== "123456") {
        return createResponse(null, 2003, "验证码错误或已过期");
      }

      if (password.length < 8) {
        return createResponse(null, 1003, "密码至少8位");
      }

      return createResponse({
        message: "密码重置成功"
      });
    }
  },

  // ============================================
  // 登出
  // ============================================
  {
    url: "/api/auth/logout",
    method: "post",
    response: ({ headers }) => {
      const auth = headers.authorization;
      if (auth) {
        const token = auth.replace("Bearer ", "");
        tokenStore.delete(token);
      }
      return createResponse(null);
    }
  }
];
```

### 3. 用户模块 Mock

创建 `src/mock/modules/user.ts`：

```typescript
import type { MockMethod } from "vite-plugin-mock";
import { createResponse, delay, generateId } from "../_utils";

// 模拟用户列表
const userList = [
  {
    id: 1,
    email: "admin@example.com",
    username: "管理员",
    role: "super_admin",
    avatarUrl: null,
    status: 1,
    createdAt: "2024-01-01T00:00:00Z",
    lastLoginAt: "2024-06-01T10:30:00Z"
  },
  {
    id: 2,
    email: "user1@example.com",
    username: "用户1",
    role: "user",
    avatarUrl: null,
    status: 1,
    createdAt: "2024-02-15T08:00:00Z",
    lastLoginAt: "2024-06-05T14:20:00Z"
  },
  {
    id: 3,
    email: "user2@example.com",
    username: "用户2",
    role: "user",
    avatarUrl: null,
    status: 0,
    createdAt: "2024-03-20T12:00:00Z",
    lastLoginAt: null
  }
];

export const userMocks: MockMethod[] = [
  // ============================================
  // 获取当前用户信息
  // ============================================
  {
    url: "/api/user/me",
    method: "get",
    response: () => {
      return createResponse(userList[0]);
    }
  },

  // ============================================
  // 更新当前用户信息
  // ============================================
  {
    url: "/api/user/update",
    method: "put",
    response: async ({ body }) => {
      await delay(300);

      const { username, avatarUrl } = body as {
        username?: string;
        avatarUrl?: string;
      };

      const updatedUser = {
        ...userList[0],
        username: username || userList[0].username,
        avatarUrl: avatarUrl !== undefined ? avatarUrl : userList[0].avatarUrl,
        updatedAt: new Date().toISOString()
      };

      Object.assign(userList[0], updatedUser);

      return createResponse(updatedUser);
    }
  },

  // ============================================
  // 获取用户列表（管理员）
  // ============================================
  {
    url: "/api/admin/users",
    method: "get",
    response: async ({ query }) => {
      await delay(400);

      const {
        page = 1,
        pageSize = 10,
        keyword = "",
        status
      } = query as {
        page?: number;
        pageSize?: number;
        keyword?: string;
        status?: string;
      };

      let filtered = userList;

      // 关键词过滤
      if (keyword) {
        filtered = filtered.filter(u => u.email.includes(keyword) || u.username.includes(keyword));
      }

      // 状态过滤
      if (status !== undefined && status !== "") {
        filtered = filtered.filter(u => u.status === parseInt(status));
      }

      // 分页
      const start = (page - 1) * pageSize;
      const end = start + pageSize;
      const list = filtered.slice(start, end);

      return createResponse({
        list,
        total: filtered.length,
        page,
        pageSize,
        totalPages: Math.ceil(filtered.length / pageSize)
      });
    }
  },

  // ============================================
  // 创建用户（管理员）
  // ============================================
  {
    url: "/api/admin/users",
    method: "post",
    response: async ({ body }) => {
      await delay(500);

      const { email, password, username, role } = body as {
        email: string;
        password: string;
        username?: string;
        role?: string;
      };

      // 检查邮箱唯一性
      if (userList.some(u => u.email === email)) {
        return createResponse(null, 2002, "该邮箱已被注册");
      }

      const newUser = {
        id: generateId(),
        email,
        username: username || email.split("@")[0],
        role: role || "user",
        avatarUrl: null,
        status: 1,
        createdAt: new Date().toISOString(),
        lastLoginAt: null
      };

      userList.push(newUser);

      return createResponse(newUser);
    }
  },

  // ============================================
  // 更新用户（管理员）
  // ============================================
  {
    url: "/api/admin/users/:id",
    method: "put",
    response: async ({ body, params }) => {
      await delay(400);

      const { id } = params as { id: string };
      const userIndex = userList.findIndex(u => u.id === parseInt(id));

      if (userIndex === -1) {
        return createResponse(null, 3001, "用户不存在");
      }

      const updatedUser = {
        ...userList[userIndex],
        ...body,
        id: parseInt(id),
        updatedAt: new Date().toISOString()
      };

      delete (updatedUser as any).password; // 不返回密码

      userList[userIndex] = updatedUser;

      return createResponse(updatedUser);
    }
  },

  // ============================================
  // 删除用户（管理员）
  // ============================================
  {
    url: "/api/admin/users/:id",
    method: "delete",
    response: async ({ params }) => {
      await delay(300);

      const { id } = params as { id: string };
      const userIndex = userList.findIndex(u => u.id === parseInt(id));

      if (userIndex === -1) {
        return createResponse(null, 3001, "用户不存在");
      }

      // 软删除
      userList.splice(userIndex, 1);

      return createResponse({ id: parseInt(id) });
    }
  }
];
```

### 4. Mock 入口文件

创建 `src/mock/index.ts`：

```typescript
import { authMocks } from "./modules/auth";
import { userMocks } from "./modules/user";

/**
 * 汇总所有 Mock 接口
 */
export default [...authMocks, ...userMocks];
```

---

## 高级用法

### 1. 动态响应（根据请求参数返回不同数据）

```typescript
{
  url: '/api/user/:id',
  method: 'get',
  response: ({ params, query }) => {
    const { id } = params;
    const { include } = query;

    const user = getUserById(id);

    // 根据 query 参数决定返回字段
    if (include === 'profile') {
      return createResponse({
        ...user,
        profile: getProfileByUserId(id)
      });
    }

    return createResponse(user);
  }
}
```

### 2. 模拟错误响应

```typescript
{
  url: '/api/user/:id',
  method: 'get',
  response: ({ params }) => {
    const { id } = params;

    if (!isValidId(id)) {
      return createResponse(null, 4001, '无效的用户ID');
    }

    if (!userExists(id)) {
      return createResponse(null, 3001, '用户不存在');
    }

    return createResponse(getUser(id));
  }
}
```

### 3. 模拟文件上传

```typescript
{
  url: '/api/upload',
  method: 'post',
  response: async ({ body, files }) => {
    await delay(1000);

    const file = files.file;

    if (!file) {
      return createResponse(null, 4001, '未上传文件');
    }

    // 模拟文件存储
    const fileUrl = `/uploads/${Date.now()}_${file.name}`;

    return createResponse({
      url: fileUrl,
      filename: file.name,
      size: file.size,
      mimeType: file.type
    });
  }
}
```

### 4. 模拟 WebSocket 推送

```typescript
// 注意：vite-plugin-mock 不支持 WebSocket
// 如需 WebSocket Mock，建议使用 msw 或 socket.io-mock
```

### 5. Mock 延迟配置

```typescript
// 全局延迟
viteMockServe({
  mockPath: './src/mock',
  latency: 500, // 所有接口延迟 500ms
});

// 单个接口延迟（在 response 中调用 delay）
{
  url: '/api/slow',
  response: async () => {
    await delay(2000); // 模拟慢接口
    return createResponse({ message: 'Done' });
  }
}
```

---

## 环境变量控制

### 1. 创建环境配置文件

```bash
# .env.development（开发环境）
VITE_MOCK=false
VITE_API_BASE=/api

# .env.mock（Mock 模式）
VITE_MOCK=true
VITE_API_BASE=/api
```

### 2. 使用方式

```bash
# 方式一：直接设置环境变量
VITE_MOCK=true pnpm dev

# 方式二：创建 .env.local（不会被 git 提交）
echo "VITE_MOCK=true" > .env.local
pnpm dev

# 方式三：使用 cross-env（跨平台）
npx cross-env VITE_MOCK=true pnpm dev
```

### 3. 智能切换

修改 `vite.config.ts`：

```typescript
import { viteMockServe } from "vite-plugin-mock";

const mockEnabled = process.env.VITE_MOCK === "true";

export default defineConfig({
  plugins: [
    viteMockServe({
      mockPath: "./src/mock",
      enable: mockEnabled
    })
  ],

  server: {
    proxy: {
      "/api": {
        target: "http://localhost:8080",
        changeOrigin: true,
        bypass(req) {
          // Mock 模式时跳过代理
          if (mockEnabled) {
            return req;
          }
        }
      }
    }
  }
});
```

### 4. 切换脚本（package.json）

```json
{
  "scripts": {
    "dev": "vite",
    "dev:mock": "vite --mode mock",
    "dev:server": "vite --mode development"
  }
}
```

创建 `.env.mock`：

```bash
VITE_MOCK=true
```

运行 `pnpm dev:mock` 即可启用 Mock 模式。

---

## 常见问题

### Q1: Mock 接口不生效？

检查清单：

1. ✅ 是否安装了 `vite-plugin-mock`
2. ✅ 是否在 `vite.config.ts` 中正确配置
3. ✅ `enable` 选项是否为 `true`
4. ✅ 接口路径是否与前端请求一致
5. ✅ 是否重启了开发服务器

### Q2: 如何调试 Mock 接口？

```typescript
// 在 response 中添加日志
response: ({ body }) => {
  console.log('[Mock] 请求参数:', body);
  return createResponse({ ... });
}
```

### Q3: 如何模拟登录状态？

```typescript
// 在请求头中传递 Token
{
  url: '/api/user/me',
  method: 'get',
  response: ({ headers }) => {
    const token = headers.authorization;

    if (!token) {
      return createResponse(null, 401, '请先登录');
    }

    // 验证 token 并返回用户信息
    return createResponse(getUserByToken(token));
  }
}
```

### Q4: 如何模拟分页？

```typescript
{
  url: '/api/users',
  method: 'get',
  response: ({ query }) => {
    const { page = 1, pageSize = 10 } = query;
    const start = (page - 1) * pageSize;
    const end = start + pageSize;

    return createResponse({
      list: allUsers.slice(start, end),
      total: allUsers.length,
      page: parseInt(page),
      pageSize: parseInt(pageSize)
    });
  }
}
```

### Q5: 如何禁用单个 Mock 接口？

```typescript
// 方式一：注释掉
// {
//   url: '/api/disabled',
//   method: 'get',
//   response: () => createResponse(null)
// }

// 方式二：使用条件导出
const mocks = [
  // ... 其他接口
];

// 临时禁用某个接口
// if (process.env.DISABLE_xxx !== 'true') {
//   mocks.push(disabledMock);
// }

export default mocks;
```

### Q6: Mock 数据如何持久化？

由于是内存存储，刷新页面后数据会重置。如需持久化，可以使用：

```typescript
// 使用 localStorage 模拟持久化
const STORAGE_KEY = "mock_users";

const getUsers = () => {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored ? JSON.parse(stored) : defaultUsers;
};

const saveUsers = users => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(users));
};
```

---

## API 速查

### MockMethod 属性

| 属性         | 类型       | 必填 | 说明                                     |
| ------------ | ---------- | ---- | ---------------------------------------- |
| `url`        | `string`   | ✅   | 接口路径，支持参数如 `/user/:id`         |
| `method`     | `string`   | ✅   | 请求方法：`get`, `post`, `put`, `delete` |
| `response`   | `Function` | ✅   | 响应函数，返回 Mock 数据                 |
| `timeout`    | `number`   | ❌   | 延迟毫秒数                               |
| `statusCode` | `number`   | ❌   | HTTP 状态码                              |

### Response 函数参数

| 属性      | 类型     | 说明                             |
| --------- | -------- | -------------------------------- |
| `url`     | `string` | 请求 URL                         |
| `method`  | `string` | 请求方法                         |
| `headers` | `object` | 请求头                           |
| `query`   | `object` | URL query 参数                   |
| `params`  | `object` | 路径参数（`/user/:id` 的 `:id`） |
| `body`    | `object` | 请求体数据                       |
| `cookies` | `object` | Cookies                          |

---

## 总结

### 快速启动 Checklist

```bash
# 1. 安装依赖
pnpm add vite-plugin-mock -D

# 2. 配置 vite.config.ts
# 添加 viteMockServe 插件

# 3. 创建 Mock 文件
mkdir -p src/mock/modules
touch src/mock/index.ts
touch src/mock/_utils.ts
touch src/mock/modules/auth.ts
touch src/mock/modules/user.ts

# 4. 启用 Mock
echo "VITE_MOCK=true" > .env.local

# 5. 启动开发服务器
pnpm dev
```

### 最佳实践

1. **模块化组织**：按功能模块拆分 Mock 文件
2. **统一响应格式**：使用 `createResponse` 工具函数
3. **模拟延迟**：添加 `delay()` 模拟真实网络
4. **错误处理**：模拟各种错误场景
5. **环境隔离**：使用环境变量控制 Mock 开关
6. **版本管理**：Mock 数据版本与 API 文档同步

---

## 参考资料

- [vite-plugin-mock 官方文档](https://github.com/anncwb/vite-plugin-mock)
- [Vite 官方文档](https://vitejs.dev/)
- [Mock API 设计最佳实践](https://swagger.io/specification/)
