# 用户模块前端实现说明文档

> 版本：1.0  
> 日期：2026-06-06  
> 适用范围：q-editor 前端项目

---

## 目录

1. [模块概述](#1-模块概述)
2. [架构设计](#2-架构设计)
   2.1 [目录结构](#21-目录结构)
   2.2 [技术栈](#22-技术栈)
   2.3 [模块依赖关系](#23-模块依赖关系)
3. [功能实现](#3-功能实现)
   3.1 [登录页面](#31-登录页面)
   3.2 [注册页面](#32-注册页面)
   3.3 [路由守卫](#33-路由守卫)
4. [接口调用规范](#4-接口调用规范)
   4.1 [API 客户端配置](#41-api-客户端配置)
   4.2 [认证接口定义](#42-认证接口定义)
   4.3 [请求/响应类型](#43-请求响应类型)
5. [数据流转流程](#5-数据流转流程)
   5.1 [登录流程](#51-登录流程)
   5.2 [注册流程](#52-注册流程)
   5.3 [Token 管理](#53-token-管理)
6. [组件划分](#6-组件划分)
   6.1 [页面组件](#61-页面组件)
   6.2 [表单组件](#62-表单组件)
   6.3 [公共组件](#63-公共组件)
7. [交互逻辑](#7-交互逻辑)
   7.1 [表单校验](#71-表单校验)
   7.2 [验证码发送](#72-验证码发送)
   7.3 [登录/注册切换](#73-登录注册切换)
8. [状态管理](#8-状态管理)
9. [待实现功能](#9-待实现功能)
10. [开发指南](#10-开发指南)

---

## 1. 模块概述

**用户模块前端**负责实现问卷系统的用户认证界面，包括登录、注册、密码重置等功能。该模块与后端 `q-server` 的用户模块对接，实现完整的用户认证流程。

### 1.1 功能范围

| 功能         | 状态        | 说明                      |
| ------------ | ----------- | ------------------------- |
| 登录页面     | ✅ 已实现   | 邮箱+密码登录             |
| 注册页面     | ✅ 已实现   | 邮箱验证注册              |
| 密码重置     | 🔄 UI已实现 | 需对接后端API             |
| Token 管理   | ✅ 文档完善 | 队列+锁机制、提前刷新方案 |
| 路由守卫     | ⏳ 待实现   | 需实现权限校验            |
| 用户状态管理 | ✅ 文档完善 | Pinia Store 完整方案      |
| API 客户端   | ✅ 文档完善 | authClient + serverClient |
| 并发刷新机制 | ✅ 文档完善 | 队列+锁实现方案           |

### 1.2 与后端对接关系

```
┌─────────────────────────────────────────────────────────────┐
│                    前端 (q-editor)                           │
├─────────────────────────────────────────────────────────────┤
│  login/index.vue ──► LoginForm.vue ──► auth API             │
│                     RegisterForm.vue                         │
└─────────────────────────────────────────────────────────────┘
                            ↓ HTTP
┌─────────────────────────────────────────────────────────────┐
│                    后端 (q-server)                           │
├─────────────────────────────────────────────────────────────┤
│  /api/auth/status    → 系统状态                              │
│  /api/auth/login     → 用户登录                              │
│  /api/auth/register  → 初始化注册                            │
│  /api/auth/send-code → 发送验证码                            │
│  /api/auth/verify-register → 邮箱验证注册                    │
│  /api/auth/refresh   → Token刷新                             │
│  /api/auth/logout    → 登出                                  │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. 架构设计

### 2.1 目录结构

```
app/q-editor/src/
├── views/
│   └── login/                    # 登录模块
│       ├── index.vue             # 登录页面入口
│       └── component/
│           ├── LoginForm.vue     # 登录表单组件
│           └── RegisterForm.vue  # 注册表单组件
│
├── api/
│   ├── index.ts                  # API 导出入口
│   └── clients/
│       ├── auth.ts               # 认证 API 客户端（登录/注册/刷新Token）
│       └── server.ts             # 业务请求客户端（需Token认证）
│
├── router/
│   └── index.ts                  # 路由配置
│
├── stores/                       # Pinia 状态管理
│   └── useUser.ts                # 用户状态 Store
│
├── assets/
│   └── css/
│       └── login-theme.scss      # 登录页主题样式
│
├── utils/
│   └── index.ts                  # 工具函数
│
└── types/                        # 类型定义
    └── user.ts                   # 用户相关类型
```

**API 客户端职责区分：**

| 文件                    | 职责                            | 是否携带Token | 是否处理401 |
| ----------------------- | ------------------------------- | ------------- | ----------- |
| `api/clients/auth.ts`   | 认证接口（登录/注册/刷新Token） | ❌            | ❌          |
| `api/clients/server.ts` | 业务接口（用户/问卷等）         | ✅            | ✅          |

### 2.2 技术栈

| 技术         | 版本 | 用途        |
| ------------ | ---- | ----------- |
| Vue 3        | ^3.x | 前端框架    |
| TypeScript   | ^5.x | 类型安全    |
| Vue Router   | ^4.x | 路由管理    |
| Pinia        | ^2.x | 状态管理    |
| Element Plus | ^2.x | UI 组件库   |
| Axios        | ^1.x | HTTP 客户端 |
| Vite         | ^5.x | 构建工具    |

### 2.3 模块依赖关系

```
┌─────────────────────────────────────────────────────────────┐
│                      页面层                                  │
│  login/index.vue                                             │
│       ├── LoginForm.vue                                      │
│       └── RegisterForm.vue                                   │
└─────────────────────────────────────────────────────────────┘
            ↓ 调用                    ↓ 状态更新
┌─────────────────────────────────────────────────────────────┐
│                      服务层                                  │
│  api/clients/auth.ts ────────────▶ 登录/注册/刷新Token      │
│  api/clients/server.ts ──────────▶ 业务请求（携带Token）     │
│  stores/useUser.ts ◀────────────── Token状态管理             │
└─────────────────────────────────────────────────────────────┘
            ↓ 不携带Token                    ↓ 携带Token
┌─────────────────────────────────────────────────────────────┐
│                      后端 API                                │
│  /api/auth/* ──▶ 认证接口（无需Token）                        │
│  /api/user/* ──▶ 用户接口（需Token）                          │
│  /api/survey/* ──▶ 问卷接口（需Token）                        │
└─────────────────────────────────────────────────────────────┘
```

**认证流程中的客户端选择：**

| 场景         | 使用客户端     | 说明                          |
| ------------ | -------------- | ----------------------------- |
| 登录/注册    | `authClient`   | 不携带Token，直接提交账号密码 |
| 刷新Token    | `authClient`   | 使用 refreshToken 接口        |
| 获取用户信息 | `serverClient` | 携带Token，401时自动刷新重试  |
| 问卷CRUD     | `serverClient` | 携带Token，401时自动刷新重试  |

---

## 3. 功能实现

### 3.1 登录页面

**文件路径：** `src/views/login/index.vue`

#### 页面结构

```vue
<template>
  <div class="login-page">
    <!-- 左上角 Logo -->
    <div class="login-logo">...</div>

    <!-- 主内容区 -->
    <div class="login-container">
      <!-- 左侧轮播图 -->
      <div class="carousel-section">
        <el-carousel>...</el-carousel>
      </div>

      <!-- 右侧表单区 -->
      <div class="form-section">
        <LoginForm v-if="!isRegister" />
        <RegisterForm v-else />
      </div>
    </div>

    <!-- 底部版权 -->
    <div class="login-footer">...</div>
  </div>
</template>
```

#### 核心逻辑

```typescript
// 登录/注册切换状态
const isRegister = ref(false);

// 轮播图数据
const carouselItems = [
  { id: 1, title: "更多应用场景", desc: "满足您的各类调研需求" },
  { id: 2, title: "智能数据分析", desc: "AI驱动的调研分析报告" }
  // ...
];
```

#### 样式主题

使用 `login-theme.scss` 定义主题变量：

```scss
:root {
  --login-primary: #18181b; // 主色（shadcn风格）
  --login-primary-light: #71717a; // 主色浅色
  --login-bg: #ffffff; // 背景色
  --login-text: #18181b; // 文字色
  --login-text-muted: #71717a; // 辅助文字色
  --login-border: #e4e4e7; // 边框色
}
```

### 3.2 注册页面

**文件路径：** `src/views/login/component/RegisterForm.vue`

#### 表单字段

| 字段            | 类型   | 校验规则                      |
| --------------- | ------ | ----------------------------- |
| email           | string | 必填 + 邮箱格式               |
| password        | string | 必填 + 最少6位 + 字母数字组合 |
| confirmPassword | string | 必填 + 与password一致         |
| captcha         | string | 必填 + 6位长度                |

#### 验证码逻辑

```typescript
// 验证码倒计时
const countDown = ref(0);

// 发送验证码
const sendCaptcha = () => {
  if (!canSendCaptcha.value) return;

  countDown.value = 60; // 60秒倒计时
  ElMessage.success("验证码已发送至您的邮箱");

  const timer = setInterval(() => {
    countDown.value--;
    if (countDown.value <= 0) clearInterval(timer);
  }, 1000);
};
```

### 3.3 路由守卫

**当前状态：** 路由配置已完成，守卫逻辑待实现

```typescript
// router/index.ts
const router = createRouter({
  routes: [
    { path: "/", name: "land", component: LandView },
    { path: "/login", name: "login", component: LoginView },
    { path: "/home", name: "home", component: Layout }
    // ...其他路由
  ]
});

// 待实现：路由守卫
// router.beforeEach((to, from, next) => {
//   const userStore = useUserStore();
//   if (to.meta.requiresAuth && !userStore.isLoggedIn) {
//     next({ name: 'login' });
//   } else {
//     next();
//   }
// });
```

---

## 4. 接口调用规范

### 4.1 API 客户端配置

本项目使用**两个独立的 Axios 实例**来区分不同的请求场景：

#### 4.1.1 认证客户端 (auth.ts)

**文件路径：** `src/api/clients/auth.ts`

**职责：** 专门用于认证相关接口（登录、注册、发送验证码、刷新Token、登出等）

**特点：**

- 这些接口在用户登录前调用，**不需要携带 Token**
- 刷新 Token 接口用于获取新的 Access Token

```typescript
import axios from "axios";

const authClient = axios.create({
  baseURL: "/api",
  timeout: 50000
});

/** 响应拦截器 */
authClient.interceptors.response.use(
  res => res.data,
  err => Promise.reject(err)
);
```

#### 4.1.2 业务请求客户端 (server.ts)

**文件路径：** `src/api/clients/server.ts`

**职责：** 用于所有需要认证的业务请求（用户信息、问卷管理等）

**特点：**

- 所有请求都**需要携带 Authorization Token**
- 需要处理 401 错误并触发 Token 刷新（带队列+锁机制）
- 刷新成功后自动重试失败的请求

```typescript
import axios, { type AxiosRequestConfig, type AxiosResponse } from "axios";
import { useUserStore } from "@/stores/useUser";

const serverClient = axios.create({
  baseURL: "/api",
  timeout: 50000
});

/**
 * 请求拦截器：自动添加 Authorization 头
 */
serverClient.interceptors.request.use(
  (config: AxiosRequestConfig) => {
    const userStore = useUserStore();
    if (userStore.accessToken) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${userStore.accessToken}`;
    }
    return config;
  },
  error => Promise.reject(error)
);

/**
 * 响应拦截器：处理 401 错误并触发 Token 刷新
 */
serverClient.interceptors.response.use(
  (response: AxiosResponse) => response.data,
  async error => {
    const originalRequest = error.config as AxiosRequestConfig & { _retry?: boolean };

    // 处理 401 Unauthorized 错误
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true; // 标记已重试，防止无限循环

      try {
        const userStore = useUserStore();
        const newToken = await userStore.refreshAccessToken();

        if (newToken) {
          // 使用新 Token 重试原请求
          originalRequest.headers = originalRequest.headers || {};
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          return serverClient(originalRequest);
        }
      } catch (refreshError) {
        // 刷新失败，重定向到登录页
        window.location.href = "/login";
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export default serverClient;
```

#### 4.1.3 两种客户端对比

| 特性          | authClient (auth.ts)  | serverClient (server.ts) |
| ------------- | --------------------- | ------------------------ |
| 用途          | 认证相关接口          | 业务请求接口             |
| 携带 Token    | ❌ 不需要             | ✅ 需要                  |
| 处理 401 刷新 | ❌ 不处理             | ✅ 处理                  |
| 重试机制      | ❌ 不需要             | ✅ 需要                  |
| 接口示例      | 登录、注册、刷新Token | 用户信息、问卷CRUD       |

### 4.2 认证接口定义（使用 authClient）

**文件路径：** `src/api/clients/auth.ts`

这些接口**不使用 Token 认证**，因为它们本身就是用于获取 Token 的：

```typescript
import authClient from "./auth";
import type {
  ApiResponse,
  LoginRequest,
  LoginResponse,
  SystemStatusResponse,
  SendCodeRequest,
  SendCodeResponse,
  InitRegisterRequest,
  InitRegisterResponse,
  VerifyRegisterRequest,
  RefreshTokenRequest,
  ResetPasswordRequest
} from "@common/user/user.interface";

/** 获取系统状态 */
export const getSystemStatus = (): Promise<ApiResponse<SystemStatusResponse>> => authClient.get("/auth/status");

/** 用户登录 */
export const login = (data: LoginRequest): Promise<ApiResponse<LoginResponse>> => authClient.post("/auth/login", data);

/** 发送验证码 */
export const sendCode = (data: SendCodeRequest): Promise<ApiResponse<SendCodeResponse>> =>
  authClient.post("/auth/send-code", data);

/** 初始化注册（首个超级管理员） */
export const initRegister = (data: InitRegisterRequest): Promise<ApiResponse<InitRegisterResponse>> =>
  authClient.post("/auth/register", data);

/** 邮箱验证注册 */
export const verifyRegister = (data: VerifyRegisterRequest): Promise<ApiResponse<LoginResponse>> =>
  authClient.post("/auth/verify-register", data);

/** 刷新 Token */
export const refreshToken = (data: RefreshTokenRequest): Promise<ApiResponse<LoginResponse>> =>
  authClient.post("/auth/refresh", data);

/** 登出 */
export const logout = (): Promise<ApiResponse<null>> => authClient.post("/auth/logout");

/** 重置密码 */
export const resetPassword = (data: ResetPasswordRequest): Promise<ApiResponse<null>> =>
  authClient.post("/auth/reset-password", data);
```

### 4.3 业务接口定义（使用 serverClient）

**文件路径：** `src/api/clients/server.ts`

这些接口**需要 Token 认证**，使用 serverClient 自动携带 Authorization 头：

```typescript
import serverClient from "./server";
import type { ApiResponse, UserInfo, UpdateUserRequest } from "@common/user/user.interface";

/** 获取当前用户信息 */
export const getCurrentUser = (): Promise<ApiResponse<UserInfo>> => serverClient.get("/user/me");

/** 更新用户信息 */
export const updateUser = (data: UpdateUserRequest): Promise<ApiResponse<UserInfo>> =>
  serverClient.put("/user/update", data);

/** 获取用户列表（管理员） */
export const getUserList = (params?: {
  page?: number;
  pageSize?: number;
}): Promise<ApiResponse<{ list: UserInfo[]; total: number }>> => serverClient.get("/user/list", { params });

/** 其他业务接口... */
```

### 4.4 请求/响应类型

使用 `packages/common` 中的共享类型：

```typescript
// 从共享包导入类型
import type {
  ApiResponse,
  LoginRequest,
  LoginResponse,
  SystemStatusResponse,
  BizCode
} from "@common/user/user.interface";

// 类型使用示例（认证接口 - 使用 authClient）
const handleLogin = async () => {
  const res: ApiResponse<LoginResponse> = await login({
    email: "user@example.com",
    password: "password123"
  });

  if (res.code === BizCode.EmailNotExists) {
    // 处理邮箱不存在错误
  }
};

// 业务接口示例（使用 serverClient，自动携带Token）
const handleGetUser = async () => {
  const res: ApiResponse<UserInfo> = await getCurrentUser();
  // serverClient 会自动添加 Authorization 头
  // 如果遇到 401，会自动触发 Token 刷新并重试
};
```

---

## 5. 数据流转流程

### 5.1 登录流程

```
┌─────────────────────────────────────────────────────────────┐
│                      登录流程                                │
├─────────────────────────────────────────────────────────────┤
│  1. 用户输入邮箱+密码                                        │
│      ↓                                                       │
│  2. 前端表单校验（Element Plus FormRules）                   │
│      ↓                                                       │
│  3. 调用 login API                                           │
│      POST /api/auth/login                                    │
│      ↓                                                       │
│  4. 后端验证密码 + 检查锁定                                  │
│      ↓                                                       │
│  5. 返回 Token + 用户信息                                    │
│      ↓                                                       │
│  6. 前端存储 Token（localStorage/Pinia）                     │
│      ↓                                                       │
│  7. 更新用户状态 Store                                       │
│      ↓                                                       │
│  8. 跳转到 /home                                             │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 注册流程

```
┌─────────────────────────────────────────────────────────────┐
│                      注册流程                                │
├─────────────────────────────────────────────────────────────┤
│  1. 前端调用 GET /api/auth/status                           │
│      ↓                                                       │
│  2. 判断系统状态                                             │
│      ├── 未初始化 → 显示初始化注册表单                       │
│      └── 已初始化 + SMTP已配置 → 显示邮箱验证注册            │
│      └── 已初始化 + SMTP未配置 → 提示联系管理员              │
│      ↓                                                       │
│  3. 初始化注册路径                                           │
│      POST /api/auth/register → 直接获取Token                 │
│      ↓                                                       │
│  4. 邮箱验证注册路径                                         │
│      POST /api/auth/send-code → 发送验证码                   │
│      POST /api/auth/verify-register → 验证并注册             │
│      ↓                                                       │
│  5. 存储 Token + 跳转                                        │
└─────────────────────────────────────────────────────────────┘
```

### 5.3 Token 管理

```
┌─────────────────────────────────────────────────────────────┐
│                    Token 管理流程                            │
├─────────────────────────────────────────────────────────────┤
│  存储：                                                      │
│  ├── localStorage: refreshToken（持久化）                    │
│  ├── sessionStorage: accessToken（会话级）                   │
│  └── Pinia Store: 用户信息、Token 状态、过期时间              │
│                                                              │
│  刷新策略：                                                   │
│  ├── 主动刷新：Access Token 过期前5分钟自动刷新               │
│  └── 被动刷新：请求返回401时触发刷新（带队列+锁机制）         │
│      ↓                                                       │
│  POST /api/auth/refresh                                      │
│      ↓                                                       │
│  更新 localStorage + sessionStorage + Pinia Store            │
│                                                              │
│  清除：                                                      │
│  ├── 登出：POST /api/auth/logout                             │
│  ├── 清除 localStorage + sessionStorage                      │
│  ├── 清除 Pinia Store                                        │
│  └── 跳转到 /login                                           │
└─────────────────────────────────────────────────────────────┘
```

### 5.4 Token 并发刷新机制（队列+锁）

当多个请求同时触发 Token 过期时，需要使用队列+锁机制避免重复刷新：

```
┌─────────────────────────────────────────────────────────────┐
│                 Token 并发刷新流程图                          │
├─────────────────────────────────────────────────────────────┤
│  请求A (401)        请求B (401)        请求C (401)          │
│       ↓                  ↓                  ↓                │
│  ┌─────────────────────────────────────────────┐            │
│  │         isRefreshing = false?               │            │
│  └─────────────────────────────────────────────┘            │
│       ↓ YES           ↓ NO                ↓ NO               │
│  设置 isRefreshing   加入队列           加入队列              │
│       ↓           (refreshQueue)      (refreshQueue)        │
│  发起刷新请求                                                │
│       ↓                                                      │
│  获取新 Token                                                │
│       ↓                                                      │
│  更新 Token 存储                                             │
│       ↓                                                      │
│  通知队列中所有请求                                          │
│       ↓                                                      │
│  设置 isRefreshing = false                                   │
│       ↓                                                      │
│  队列请求使用新 Token 重试                                    │
└─────────────────────────────────────────────────────────────┘
```

**设计要点：**

| 机制                | 作用                      | 实现方式                |
| ------------------- | ------------------------- | ----------------------- |
| `isRefreshing` 锁   | 防止并发重复刷新          | Pinia ref 状态标志      |
| `refreshQueue` 队列 | 存储等待中的请求回调      | Pinia ref 数组          |
| `_retry` 标记       | 标记请求是否已重试过      | Axios config 自定义属性 |
| 提前刷新            | Token 过期前5分钟自动刷新 | 定时器 + expiresAt 计算 |

---

## 6. 组件划分

### 6.1 页面组件

| 组件        | 路径                     | 职责                   |
| ----------- | ------------------------ | ---------------------- |
| `LoginView` | `views/login/index.vue`  | 登录页面入口，布局管理 |
| `LandView`  | `views/land/index.vue`   | Landing Page，引导入口 |
| `Layout`    | `views/Layout/index.vue` | 主布局容器，需权限     |

### 6.2 表单组件

| 组件           | 路径                               | 职责                |
| -------------- | ---------------------------------- | ------------------- |
| `LoginForm`    | `login/component/LoginForm.vue`    | 登录表单，邮箱+密码 |
| `RegisterForm` | `login/component/RegisterForm.vue` | 注册表单，邮箱验证  |

### 6.3 公共组件

| 组件          | 路径                                | 职责         |
| ------------- | ----------------------------------- | ------------ |
| `Header`      | `components/Common/Header.vue`      | 顶部导航栏   |
| `UserProfile` | `components/Common/UserProfile.vue` | 用户信息展示 |

---

## 7. 交互逻辑

### 7.1 表单校验

使用 Element Plus 的 FormRules 进行校验：

```typescript
// LoginForm.vue
const loginRules: FormRules = {
  email: [
    { required: true, message: "请输入邮箱", trigger: "blur" },
    { type: "email", message: "请输入正确的邮箱格式", trigger: "blur" }
  ],
  password: [
    { required: true, message: "请输入密码", trigger: "blur" },
    { min: 6, message: "密码长度不能少于6位", trigger: "blur" }
  ]
};

// RegisterForm.vue
const registerRules: FormRules = {
  password: [
    { required: true, message: "请输入密码", trigger: "blur" },
    { min: 6, message: "密码长度不能少于6位", trigger: "blur" },
    { pattern: /^(?=.*[A-Za-z])(?=.*\d)/, message: "密码需包含字母和数字", trigger: "blur" }
  ],
  confirmPassword: [
    { required: true, message: "请确认密码", trigger: "blur" },
    {
      validator: (rule, value, callback) => {
        if (value !== registerForm.password) {
          callback(new Error("两次输入的密码不一致"));
        } else {
          callback();
        }
      },
      trigger: "blur"
    }
  ]
};
```

### 7.2 验证码发送

```typescript
// 60秒倒计时控制
const countDown = ref(0);

// 发送条件校验
const canSendCaptcha = computed(() => {
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(registerForm.email);
  return emailValid && countDown.value === 0;
});

// 发送验证码
const sendCaptcha = async () => {
  if (!canSendCaptcha.value) {
    ElMessage.warning("请先输入正确的邮箱");
    return;
  }

  // 调用后端 API（待实现）
  // await sendCode({ email: registerForm.email, type: "register" });

  countDown.value = 60;
  ElMessage.success("验证码已发送至您的邮箱");

  const timer = setInterval(() => {
    countDown.value--;
    if (countDown.value <= 0) clearInterval(timer);
  }, 1000);
};
```

### 7.3 登录/注册切换

```vue
<!-- login/index.vue -->
<template>
  <LoginForm v-if="!isRegister" @switch-to-register="isRegister = true" />
  <RegisterForm v-else @switch-to-login="isRegister = false" />
</template>

<script setup>
const isRegister = ref(false);
</script>
```

---

## 8. 状态管理

### 8.1 用户 Store（待实现）

```typescript
// src/stores/useUser.ts（待实现）

import { defineStore } from "pinia";
import { ref, computed } from "vue";
import type { UserInfo, LoginResponse } from "@common/user/user.interface";
import { login, logout, refreshToken, getSystemStatus } from "@/api/clients/auth";

export const useUserStore = defineStore("user", () => {
  // 状态
  const user = ref<UserInfo | null>(null);
  const accessToken = ref<string | null>(null);
  const refreshTokenValue = ref<string | null>(null);
  const systemStatus = ref<SystemStatusResponse | null>(null);
  const tokenExpiresAt = ref<number | null>(null); // Token过期时间戳

  // 并发刷新控制（队列+锁）
  const isRefreshing = ref(false); // 刷新锁
  const refreshQueue = ref<Array<(token: string) => void>>([]); // 等待队列

  // 计算属性
  const isLoggedIn = computed(() => !!accessToken.value && !!user.value);
  const isSuperAdmin = computed(() => user.value?.role === "super_admin");

  // Token是否即将过期（提前5分钟刷新）
  const isTokenExpiring = computed(() => {
    if (!tokenExpiresAt.value) return false;
    return Date.now() >= tokenExpiresAt.value - 5 * 60 * 1000;
  });

  // 方法
  const setTokens = (data: LoginResponse) => {
    accessToken.value = data.token;
    refreshTokenValue.value = data.refreshToken;
    user.value = data.user;

    // 计算Token过期时间（假设Token有效期为1小时）
    tokenExpiresAt.value = Date.now() + 60 * 60 * 1000;

    // 持久化
    localStorage.setItem("refreshToken", data.refreshToken);
    sessionStorage.setItem("accessToken", data.token);
    localStorage.setItem("tokenExpiresAt", String(tokenExpiresAt.value));
  };

  const clearTokens = () => {
    accessToken.value = null;
    refreshTokenValue.value = null;
    user.value = null;
    tokenExpiresAt.value = null;

    localStorage.removeItem("refreshToken");
    sessionStorage.removeItem("accessToken");
    localStorage.removeItem("tokenExpiresAt");
  };

  const handleLogin = async (email: string, password: string) => {
    const res = await login({ email, password });
    if (res.code === 0) {
      setTokens(res.data);
    }
    return res;
  };

  const handleLogout = async () => {
    await logout();
    clearTokens();
  };

  /**
   * 刷新 Access Token（带队列+锁机制）
   * @returns 新的 Access Token 或 null
   */
  const refreshAccessToken = async (): Promise<string | null> => {
    // 如果正在刷新，加入等待队列
    if (isRefreshing.value) {
      return new Promise(resolve => {
        refreshQueue.value.push(resolve);
      });
    }

    const storedRefreshToken = localStorage.getItem("refreshToken");
    if (!storedRefreshToken) return null;

    isRefreshing.value = true;
    try {
      const res = await refreshToken({ refreshToken: storedRefreshToken });
      if (res.code === 0) {
        setTokens(res.data);

        // 通知队列中所有等待的请求
        refreshQueue.value.forEach(resolve => resolve(res.data.token));
        refreshQueue.value = [];

        return res.data.token;
      } else {
        // 刷新失败，清空队列并重定向登录
        refreshQueue.value = [];
        clearTokens();
        window.location.href = "/login";
        return null;
      }
    } catch (error) {
      refreshQueue.value = [];
      clearTokens();
      window.location.href = "/login";
      return null;
    } finally {
      isRefreshing.value = false;
    }
  };

  /**
   * 检查并自动刷新 Token（提前5分钟）
   */
  const checkAndRefreshToken = async () => {
    if (isTokenExpiring.value && !isRefreshing.value) {
      await refreshAccessToken();
    }
  };

  /**
   * 从本地存储恢复状态
   */
  const restoreState = () => {
    const storedRefreshToken = localStorage.getItem("refreshToken");
    const storedAccessToken = sessionStorage.getItem("accessToken");
    const storedExpiresAt = localStorage.getItem("tokenExpiresAt");

    if (storedRefreshToken && storedAccessToken) {
      refreshTokenValue.value = storedRefreshToken;
      accessToken.value = storedAccessToken;
      tokenExpiresAt.value = storedExpiresAt ? Number(storedExpiresAt) : null;
    }
  };

  const fetchSystemStatus = async () => {
    const res = await getSystemStatus();
    if (res.code === 0) {
      systemStatus.value = res.data;
    }
    return res;
  };

  return {
    user,
    accessToken,
    refreshTokenValue,
    systemStatus,
    tokenExpiresAt,
    isLoggedIn,
    isSuperAdmin,
    isRefreshing,
    setTokens,
    clearTokens,
    handleLogin,
    handleLogout,
    refreshAccessToken,
    checkAndRefreshToken,
    restoreState,
    fetchSystemStatus
  };
});
```

---

## 9. 待实现功能

### 9.1 功能清单

| 功能            | 优先级 | 说明                           |
| --------------- | ------ | ------------------------------ |
| 实现 server.ts  | P0     | 实现业务请求客户端（含Token）  |
| 实现 useUser.ts | P0     | 实现用户状态 Pinia Store       |
| 路由守卫        | P0     | 实现权限校验和登录拦截         |
| 错误处理        | P1     | 统一处理 BizCode 错误码        |
| 密码重置        | P1     | 对接 reset-password API        |
| 表单对接        | P1     | LoginForm/RegisterForm 对接API |
| 提前刷新机制    | P2     | Token 过期前5分钟自动刷新      |

**说明：** 文档中已提供完整的 `auth.ts`、`server.ts`、`useUser.ts` 实现方案，开发者可根据文档直接编码实现。

### 9.2 实现步骤建议

```
Step 1: 实现 server.ts（业务请求客户端）
  ├── 创建 axios 实例
  ├── 实现请求拦截器（添加 Authorization）
  └── 实现响应拦截器（处理 401 + 队列+锁）

Step 2: 实现 useUser.ts（用户状态管理）
  ├── 实现 Token 存储和用户信息管理
  ├── 实现队列+锁机制（isRefreshing + refreshQueue）
  ├── 实现 refreshAccessToken 方法（带并发控制）
  └── 实现 restoreState 方法（页面刷新恢复状态）

Step 3: 实现路由守卫
  ├── 添加路由 meta 标记需要权限的路由
  ├── 实现 beforeEach 守卫逻辑
  └── 在路由前置守卫中恢复用户状态

Step 4: 对接表单组件
  ├── LoginForm 对接 login API
  ├── RegisterForm 对接 send-code + verify-register API
  └── 根据系统状态动态显示注册表单

Step 5: 实现提前刷新机制
  ├── 在 setTokens 中计算并存储 tokenExpiresAt
  ├── 实现 isTokenExpiring 计算属性
  └── 在路由守卫或请求前检查并触发提前刷新

Step 6: 错误处理优化
  ├── 统一处理 BizCode 错误码
  └── 添加友好的错误提示
```

### 9.3 Token 并发刷新机制实现要点

| 实现要点            | 说明                       | 代码位置                  |
| ------------------- | -------------------------- | ------------------------- |
| `isRefreshing` 锁   | 防止多个请求同时发起刷新   | `stores/useUser.ts`       |
| `refreshQueue` 队列 | 存储等待刷新的请求回调     | `stores/useUser.ts`       |
| `_retry` 标记       | 防止请求无限重试           | `api/clients/server.ts`   |
| Promise 等待        | 并发请求等待刷新完成       | `refreshAccessToken` 方法 |
| 队列通知            | 刷新成功后通知所有等待请求 | `refreshAccessToken` 方法 |

**关键流程：**

1. **请求触发 401** → 检查 `_retry` 标记
2. **首次请求** → 设置 `_retry = true` → 调用 `refreshAccessToken`
3. **refreshAccessToken** → 检查 `isRefreshing`
4. **未刷新中** → 设置 `isRefreshing = true` → 发起刷新请求
5. **刷新成功** → 更新 Token → 通知队列 → 清空队列 → 设置 `isRefreshing = false`
6. **队列请求** → 获取新 Token → 重试原请求
7. **刷新失败** → 清空队列 → 清除 Token → 重定向登录

---

## 10. 开发指南

### 10.1 本地开发

```bash
# 启动前端开发服务器
cd app/q-editor
pnpm dev

# 启动后端服务（需要先启动 Docker）
cd app/q-server
docker-compose up -d
pnpm dev
```

### 10.2 API 调试

前端开发服务器配置了代理，可直接调用后端 API：

```typescript
// vite.config.ts 中的代理配置
server: {
  proxy: {
    '/api': {
      target: 'http://localhost:3000',
      changeOrigin: true
    }
  }
}
```

### 10.3 类型导入

从共享包导入类型：

```typescript
// 使用 @common 别名导入
import type { ApiResponse, LoginResponse } from "@common/user/user.interface";
```

### 10.4 测试账号

```bash
# 初始化系统（创建首个超级管理员）
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@test.com", "password": "Admin@123", "username": "管理员"}'

# 登录测试
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@test.com", "password": "Admin@123"}'
```

---

## 附录：错误码处理

| 错误码 | 说明         | 前端处理建议                 |
| ------ | ------------ | ---------------------------- |
| 1001   | 邮箱已被注册 | 提示用户更换邮箱或直接登录   |
| 1002   | 邮箱不存在   | 提示用户检查邮箱或注册新账号 |
| 1003   | 验证码无效   | 提示用户重新输入             |
| 1004   | 验证码已过期 | 提示用户重新获取验证码       |
| 1005   | 账户已锁定   | 提示用户等待30分钟后重试     |
| 1006   | 账户已禁用   | 提示用户联系管理员           |
| 1007   | 密码错误     | 提示用户检查密码             |
| 1008   | 系统未初始化 | 显示初始化注册表单           |
| 1009   | 注册已关闭   | 提示用户联系管理员           |
| 1010   | SMTP 未配置  | 提示用户联系管理员创建账号   |

---

**文档版本**：v1.0  
**最后更新**：2026-06-06  
**适用范围**：q-editor 前端用户模块开发
