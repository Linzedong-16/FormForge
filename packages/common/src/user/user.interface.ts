// ──────────────────────────────────────────────────────────────────────────────
// 用户模块 — 前后端通用 TypeScript 类型与接口定义
//
// 本文件为前端与后端共享的类型契约，包含：
//   1. 通用响应结构
//   2. 角色/状态枚举
//   3. 认证接口请求/响应类型
//   4. 管理员接口请求/响应类型
//   5. 实体类型
//
// 后端接口实现参考：app/q-server/src/modules/user/
// 后端 API 文档参考：app/q-server/doc/auth-api.md
// ──────────────────────────────────────────────────────────────────────────────

// ============================================================
//  1. 通用响应结构
// ============================================================

/**
 * 后端统一响应结构
 *
 * 与后端 `src/utils/response.ts` 中的 `ApiResponse<T>` 保持一致
 *
 * @template T data 字段的类型，无数据时为 `null`
 */
export interface ApiResponse<T = null> {
  /** 业务数据，成功时返回具体数据，失败时为 null */
  data: T | null;
  /** 业务状态码，0 表示成功，非 0 表示失败（见 BizCode） */
  code: number;
  /** 提示信息 */
  msg: string;
}

// ============================================================
//  2. 枚举
// ============================================================

/**
 * 用户角色编码
 *
 * 对应后端 Prisma 枚举 `RoleCode`
 */
export enum UserRole {
  /** 超级管理员 — 拥有系统全部权限 */
  SuperAdmin = "super_admin",
  /** 普通用户 */
  User = "user"
}

/**
 * 注册模式
 */
export type RegistrationMode = "email_verify" | "admin_only";

/**
 * 用户状态
 *
 * 对应数据库 `users.status` 字段
 */
export enum UserStatus {
  /** 已禁用 */
  Disabled = 0,
  /** 已启用 */
  Enabled = 1
}

/**
 * 业务错误码
 *
 * 与后端 `src/utils/response.ts` 中的 `BizCode` 枚举保持一致
 */
export enum BizCode {
  /** 邮箱已被注册 */
  EmailExists = 1001,
  /** 邮箱不存在 */
  EmailNotExists = 1002,
  /** 验证码无效 */
  VerifyCodeInvalid = 1003,
  /** 验证码已过期 */
  VerifyCodeExpired = 1004,
  /** 账户已锁定 */
  AccountLocked = 1005,
  /** 账户已禁用 */
  AccountDisabled = 1006,
  /** 密码错误 */
  InvalidPassword = 1007,
  /** 系统未初始化 */
  SystemNotInitialized = 1008,
  /** 用户注册已关闭 */
  RegistrationClosed = 1009,
  /** SMTP 邮件服务未配置 */
  SmtpNotConfigured = 1010
}

// ============================================================
//  3. 实体类型
// ============================================================

/**
 * 用户信息（脱敏/公开视图）
 *
 * 对应后端 `LoginResult.user` 片段
 */
export interface UserInfo {
  /** 用户 ID（字符串形式，后端 BigInt 序列化为字符串） */
  id: string;
  /** 邮箱地址 */
  email: string;
  /** 用户名 */
  username: string;
  /**
   * 角色
   * - auth 接口（login/register）返回 `"super_admin" | "user"`
   * - admin 接口（listUsers）返回 `"admin" | "user"`
   */
  role: "super_admin" | "user" | "admin";
}

/**
 * 用户详情（管理视图）
 *
 * 对应后端 `AdminService.listUsers` 返回的条目
 */
export interface UserAdminItem extends UserInfo {
  /** 状态：0 禁用 / 1 启用 */
  status: UserStatus;
  /** 创建时间（ISO 8601，后端返回 Prisma snake_case 字段） */
  created_at: string;
  /** 最后登录时间（ISO 8601），可能为 null */
  last_login_at: string | null;
}

/**
 * Token 信息
 */
export interface TokenInfo {
  /** Access Token */
  token: string;
  /** Token 类型，固定 `"Bearer"` */
  tokenType: "Bearer";
  /** Access Token 有效期（秒） */
  expiresIn: number;
  /** Refresh Token */
  refreshToken: string;
  /** Refresh Token 有效期（秒） */
  refreshExpiresIn: number;
}

/**
 * 系统状态
 */
export interface SystemStatus {
  /** 系统是否已初始化（存在超级管理员） */
  initialized: boolean;
  /** 注册功能是否开放 */
  registrationEnabled: boolean;
  /** 注册模式 */
  registrationMode: RegistrationMode;
  /** SMTP 邮件服务是否已配置 */
  smtpConfigured: boolean;
}

// ============================================================
//  4. 认证接口 — 请求体
// ============================================================

/**
 * POST /api/auth/login — 登录请求体
 */
export interface LoginRequest {
  /** 邮箱地址 */
  email: string;
  /** 登录密码 */
  password: string;
}

/**
 * POST /api/auth/register — 初始化注册请求体
 *
 * 仅在系统未初始化时可用，第一个注册者自动成为超级管理员
 */
export interface InitRegisterRequest {
  /** 管理员邮箱 */
  email: string;
  /** 密码（至少 8 位，含大小写和数字） */
  password: string;
  /** 用户名（可选，默认使用邮箱前缀） */
  username?: string;
}

/**
 * POST /api/auth/send-code — 发送验证码请求体
 */
export interface SendCodeRequest {
  /** 接收验证码的邮箱 */
  email: string;
  /** 验证码用途 */
  type: "register" | "reset_password";
}

/**
 * POST /api/auth/verify-register — 邮箱验证注册请求体
 */
export interface VerifyRegisterRequest {
  /** 邮箱地址 */
  email: string;
  /** 6 位数字验证码 */
  code: string;
  /** 密码 */
  password: string;
  /** 用户名（可选） */
  username?: string;
}

/**
 * POST /api/auth/refresh — 刷新 Token 请求体
 */
export interface RefreshTokenRequest {
  /** Refresh Token */
  refreshToken: string;
}

/**
 * POST /api/auth/reset-password — 重置密码请求体
 */
export interface ResetPasswordRequest {
  /** 邮箱地址 */
  email: string;
  /** 6 位数字验证码 */
  code: string;
  /** 新密码（至少 8 位，含大小写和数字） */
  newPassword: string;
}

// ============================================================
//  5. 认证接口 — 响应体
// ============================================================

/**
 * POST /api/auth/login — 登录成功响应
 *
 * 对应后端 `LoginResult` + `ApiResponse` 包装
 */
export interface LoginResponse extends TokenInfo {
  /** 用户信息 */
  user: UserInfo;
}

/**
 * POST /api/auth/register — 初始化注册成功响应
 */
export interface InitRegisterResponse extends TokenInfo {
  user: UserInfo;
  /** 是否为系统首个用户 */
  isFirstUser: true;
}

/**
 * POST /api/auth/verify-register — 邮箱验证注册成功响应
 */
export interface VerifyRegisterResponse extends TokenInfo {
  user: UserInfo;
}

/**
 * POST /api/auth/send-code — 发送验证码成功响应
 */
export interface SendCodeResponse {
  /** 验证码有效期（秒） */
  expireSeconds: number;
}

/**
 * GET /api/auth/status — 系统状态响应
 */
export type SystemStatusResponse = SystemStatus;

/**
 * 登录失败时返回的附加数据
 */
export interface LoginFailExtra {
  /** 剩余可尝试次数，为 0 时账户将被锁定 */
  remainAttempts: number;
}

// ============================================================
//  6. 管理员接口 — 请求体
// ============================================================

/**
 * POST /api/admin/users — 创建用户请求体
 */
export interface CreateUserRequest {
  /** 邮箱地址 */
  email: string;
  /** 用户名 */
  username: string;
  /** 角色 */
  role: "user" | "admin";
  /** 密码（可选，未提供则自动生成 12 位随机密码） */
  password?: string;
}

/**
 * PUT /api/admin/users/:id — 更新用户请求体
 *
 * 按需传入要修改的字段，未传入的字段保持不变
 */
export interface UpdateUserRequest {
  /** 用户名 */
  username?: string;
  /** 角色 */
  role?: "user" | "admin";
  /** 状态：0 禁用 / 1 启用 */
  status?: UserStatus;
}

/**
 * PUT /api/admin/config/smtp — 更新 SMTP 配置请求体
 */
export interface UpdateSmtpConfigRequest {
  /** 是否启用 SMTP 服务 */
  enabled: boolean;
  /** SMTP 服务器地址 */
  host: string;
  /** SMTP 端口 */
  port: number;
  /** SMTP 用户名 */
  username: string;
  /** SMTP 密码（可选） */
  password?: string;
  /** 发件人邮箱 */
  fromEmail: string;
}

// ============================================================
//  7. 管理员接口 — 响应体
// ============================================================

/**
 * POST /api/admin/users — 创建用户响应
 */
export interface CreateUserResponse {
  /** 用户 ID */
  id: string;
  /** 邮箱 */
  email: string;
  /** 用户名 */
  username: string;
  /** 角色 */
  role: "user" | "admin";
  /** 状态 */
  status: UserStatus;
  /** 是否提供了密码 */
  passwordProvided: boolean;
  /** 系统生成的随机密码（仅当 passwordProvided=false 时存在） */
  generatedPassword?: string;
}

/**
 * GET /api/admin/users — 用户列表查询参数
 */
export interface UserListQuery {
  /** 页码，从 1 开始 */
  page: number;
  /** 每页数量（最大 100） */
  limit: number;
  /** 邮箱模糊搜索（可选） */
  email?: string;
  /** 状态筛选（可选） */
  status?: UserStatus;
}

/**
 * GET /api/admin/users — 用户列表响应
 */
export interface UserListResponse {
  /** 用户列表 */
  items: UserAdminItem[];
  /** 总数 */
  total: number;
  /** 当前页码 */
  page: number;
  /** 每页数量 */
  limit: number;
  /** 总页数 */
  totalPages: number;
}

/**
 * PUT /api/admin/users/:id — 更新用户响应
 */
export interface UpdateUserResponse {
  id: string;
  email: string;
  username: string;
  role: string;
  status: UserStatus;
}

/**
 * DELETE /api/admin/users/:id — 删除用户响应
 */
export interface DeleteUserResponse {
  /** 已删除的用户 ID */
  id: string;
  /** 是否已删除 */
  deleted: true;
}

/**
 * GET /api/admin/config — 系统配置响应
 *
 * 按分类组织的配置键值对
 */
export interface SystemConfigResponse {
  /** SMTP 相关配置 */
  smtp: Record<string, string>;
  /** 认证相关配置 */
  auth: Record<string, string>;
}

/**
 * PUT /api/admin/config/smtp — 更新 SMTP 配置响应
 */
export interface UpdateSmtpConfigResponse {
  /** 是否更新成功 */
  updated: boolean;
}

// ============================================================
//  8. 聚合类型 — 按 API 端点分组
// ============================================================

/**
 * 认证模块 API 类型映射
 *
 * 用于类型安全的前端 API 调用：
 *
 * @example
 * ```ts
 * import type { AuthApi } from "@/common/user/user.interface";
 *
 * // 请求体类型
 * const body: AuthApi["login"]["request"] = { email: "a@b.com", password: "123" };
 *
 * // 响应体类型（ApiResponse 包装）
 * const res: ApiResponse<AuthApi["login"]["response"]> = await fetch(...);
 * ```
 */
export interface AuthApi {
  /** GET /api/auth/status */
  status: {
    request: void;
    response: SystemStatusResponse;
  };
  /** POST /api/auth/login */
  login: {
    request: LoginRequest;
    response: LoginResponse;
  };
  /** POST /api/auth/send-code */
  sendCode: {
    request: SendCodeRequest;
    response: SendCodeResponse;
  };
  /** POST /api/auth/register */
  register: {
    request: InitRegisterRequest;
    response: InitRegisterResponse;
  };
  /** POST /api/auth/verify-register */
  verifyRegister: {
    request: VerifyRegisterRequest;
    response: VerifyRegisterResponse;
  };
  /** POST /api/auth/refresh */
  refresh: {
    request: RefreshTokenRequest;
    response: LoginResponse;
  };
  /** POST /api/auth/reset-password */
  resetPassword: {
    request: ResetPasswordRequest;
    /** 无数据返回 */
    response: null;
  };
  /** POST /api/auth/logout */
  logout: {
    request: void;
    /** 无数据返回 */
    response: null;
  };
}

/**
 * 管理员模块 API 类型映射
 */
export interface AdminApi {
  /** POST /api/admin/users */
  createUser: {
    request: CreateUserRequest;
    response: CreateUserResponse;
  };
  /** GET /api/admin/users */
  listUsers: {
    request: UserListQuery;
    response: UserListResponse;
  };
  /** PUT /api/admin/users/:id */
  updateUser: {
    request: UpdateUserRequest;
    response: UpdateUserResponse;
  };
  /** DELETE /api/admin/users/:id */
  deleteUser: {
    request: void;
    response: DeleteUserResponse;
  };
  /** GET /api/admin/config */
  getConfig: {
    request: void;
    response: SystemConfigResponse;
  };
  /** PUT /api/admin/config/smtp */
  updateSmtp: {
    request: UpdateSmtpConfigRequest;
    response: UpdateSmtpConfigResponse;
  };
}

// ============================================================
//  9. 健康检查
// ============================================================

/**
 * 服务健康状态
 */
export interface ServiceCheck {
  /** 是否正常 */
  ok: boolean;
  /** 延迟（毫秒，后端返回 snake_case 字段） */
  latency_ms: number;
}

/**
 * GET /api/health — 健康检查响应
 */
export interface HealthCheckResponse {
  /** 整体状态：ok | degraded */
  status: "ok" | "degraded";
  /** 服务运行时间（秒） */
  uptime: number;
  /** 各服务检查结果 */
  checks: {
    postgres: ServiceCheck;
    redis: ServiceCheck;
    rabbitmq: ServiceCheck;
  };
}
