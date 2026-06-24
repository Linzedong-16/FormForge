// ──────────────────────────────────────────────────────────────────────────────
// 用户模块 — 前后端通用 TypeScript 类型与接口定义
//
// 本文件为前端与后端共享的类型契约，包含：
//   1. 通用响应结构
//   2. 角色/状态枚举
//   3. 认证接口请求/响应类型
//   4. 用户资料接口请求/响应类型
//   5. 管理员接口请求/响应类型
//   6. 实体类型
//   7. 聚合 API 类型映射
//
// 后端接口实现参考：app/q-server/src/modules/user/
// 后端 Schema 参考：  app/q-server/src/modules/user/schemas/user.schemas.ts
// ──────────────────────────────────────────────────────────────────────────────

// ============================================================
//  1. 通用响应结构
// ============================================================

/**
 * POST /api/admin/users/:id/ban — 封禁用户请求体
 */
export interface BanUserRequest {
  /** 封禁时长（分钟），范围 1-43200（30 天） */
  ban_duration: number;
  /** 封禁原因（可选，最大 500 字符） */
  reason?: string;
}

/**
 * POST /api/admin/users/:id/ban — 封禁用户响应
 */
export interface BanUserResponse {
  /** 用户 ID */
  id: string;
  /** 用户名 */
  username: string;
  /** 是否已封禁 */
  isBanned: boolean;
  /** 封禁剩余秒数 */
  banRemaining: number;
  /** 封禁到期时间（ISO 8601） */
  bannedUntil: string;
}

/**
 * DELETE /api/admin/users/:id/ban — 解除封禁响应
 */
export interface UnbanUserResponse {
  /** 用户 ID */
  id: string;
  /** 用户名 */
  username: string;
  /** 是否已封禁 */
  isBanned: false;
}

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
  SmtpNotConfigured = 1010,

  // ── 用户资料模块 (2001~2009) ──────────────────────────────
  /** 昵称包含非法字符 */
  NicknameInvalid = 2001,
  /** 图片格式不支持 */
  AvatarFormatInvalid = 2002,
  /** 图片文件过大 */
  AvatarTooLarge = 2003,
  /** 图片尺寸不符合要求 */
  AvatarSizeInvalid = 2004,
  /** 文件存储服务不可用 */
  StorageUnavailable = 2005,
  /** 邮箱已被其他用户绑定 */
  EmailAlreadyBound = 2006,
  /** 当前密码错误 */
  CurrentPasswordIncorrect = 2007,
  /** 新密码与当前密码相同 */
  PasswordSameAsCurrent = 2008,
  /** 账号已注销 */
  AccountDeleted = 2009,

  // ── 用户管理模块 (2010~2019) ──────────────────────────────
  /** 账号已被封禁 */
  AccountBanned = 2010,
  /** 不能封禁超级管理员 */
  CannotBanSuperAdmin = 2011,
  /** 封禁时长超限 */
  BanDurationExceeded = 2012
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
   * - 系统仅支持两种角色：`super_admin` 和 `user`
   * - 对应数据库 RoleCode 枚举
   */
  role: "super_admin" | "user";
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
  /** 是否处于封禁状态 */
  isBanned: boolean;
  /** 封禁剩余秒数，null = 未封禁 */
  banRemaining: number | null;
  /** 是否已被软删除 */
  isDeleted: boolean;
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
 *
 * type 字段对应后端 Zod enum：
 *   register | reset_password | bind_email | change_password
 */
export interface SendCodeRequest {
  /** 接收验证码的邮箱 */
  email: string;
  /** 验证码用途 */
  type: "register" | "reset_password" | "bind_email" | "change_password";
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
//  6. 用户资料接口 — 请求/响应体
// ============================================================

/**
 * GET /api/user/profile — 用户完整资料响应
 *
 * 对应后端 `profile.service.ts` 中的 `UserProfileResponse`
 * 首访用户（UserProfile 不存在）返回默认值，不报错
 */
export interface UserProfileResponse {
  /** 用户 ID */
  userId: string;
  /** 邮箱 */
  email: string;
  /** 用户名 */
  username: string;
  /** 头像 URL */
  avatarUrl: string | null;
  /** 昵称 */
  nickname: string | null;
  /** 职业 */
  occupation: string | null;
  /** 个人介绍 */
  bio: string | null;
  /** 兴趣标签列表 */
  interests: string[];
  /** 已绑定邮箱 */
  boundEmail: string | null;
  /** 邮箱是否已验证 */
  emailVerified: boolean;
}

/**
 * PUT /api/user/profile — 更新用户资料请求体
 *
 * 所有字段均为可选，至少提供一个
 *
 * 对应后端 Zod Schema `updateProfileSchema`
 */
export interface UpdateProfileRequest {
  /** 昵称（1~50字符） */
  nickname?: string;
  /** 职业（1~100字符） */
  occupation?: string;
  /** 个人介绍（1~500字符） */
  bio?: string;
  /** 兴趣标签列表（最多10个，单个1~20字符） */
  interests?: string[];
}

/**
 * PUT /api/user/profile — 更新资料成功响应
 */
export type UpdateProfileResponse = Pick<UserProfileResponse, "nickname" | "occupation" | "bio" | "interests">;

/**
 * POST /api/user/avatar — 头像上传成功响应
 *
 * 对应后端 `avatar.service.ts` 中的 `AvatarUploadResult`
 */
export interface AvatarUploadResult {
  /** 原图 URL（800x800） */
  avatarUrl: string;
  /** 缩略图 URL（200x200） */
  thumbnailUrl: string;
}

/**
 * POST /api/user/bind-email — 绑定邮箱请求体
 *
 * 需要先调用 POST /api/auth/send-code（type = "bind_email"）获取验证码
 *
 * 对应后端 Zod Schema `bindEmailSchema`
 */
export interface BindEmailRequest {
  /** 要绑定的邮箱 */
  email: string;
  /** 6 位数字验证码 */
  code: string;
}

/**
 * POST /api/user/bind-email — 绑定邮箱成功响应
 */
export interface BindEmailResponse {
  /** 绑定的邮箱 */
  email: string;
  /** 邮箱是否已验证 */
  verified: boolean;
}

/**
 * PUT /api/user/change-password — 修改密码请求体
 *
 * 对应后端 Zod Schema `changePasswordSchema`
 */
export interface ChangePasswordRequest {
  /** 当前密码 */
  currentPassword: string;
  /** 新密码（至少 8 位，含大小写和数字） */
  newPassword: string;
}

/**
 * DELETE /api/user/account — 注销账号成功响应
 */
export interface DeleteAccountResponse {
  /** 注销时间（ISO 8601） */
  deletedAt: string;
}

// ============================================================
//  7. 当前用户接口 — 请求/响应体
// ============================================================

/**
 * GET /api/user/me — 当前用户信息响应
 *
 * 对应后端 `user.service.ts` 中的 `UserProfile`
 */
export interface CurrentUserResponse {
  /** 用户 ID */
  id: string;
  /** 邮箱 */
  email: string;
  /** 用户名 */
  username: string;
  /** 角色 */
  role: string;
  /** 状态：0 禁用 / 1 启用 */
  status: number;
  /** 创建时间（ISO 8601） */
  created_at: string;
  /** 最后登录时间（ISO 8601），可能为 null */
  last_login_at: string | null;
}

/**
 * PUT /api/user/update — 更新当前用户信息请求体
 *
 * username 与 password 至少提供一个
 */
export interface UpdateCurrentUserRequest {
  /** 用户名（1~50字符，可选） */
  username?: string;
  /** 新密码（至少 8 位，可选） */
  password?: string;
}

// ============================================================
//  8. 管理员接口 — 请求体
// ============================================================

/**
 * POST /api/admin/users — 创建用户请求体
 *
 * 简化版：仅需用户名 + 邮箱，角色固定为 user，密码默认 Aa123456
 */
export interface CreateUserRequest {
  /** 邮箱地址 */
  email: string;
  /** 用户名（1-50字符） */
  username: string;
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
//  9. 管理员接口 — 响应体
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
  /** 角色，固定 "user" */
  role: "user";
  /** 状态 */
  status: UserStatus;
  /** 默认密码明文（仅在创建响应中返回一次） */
  defaultPassword: string;
  /** 是否需要首次登录修改密码 */
  requirePasswordChange: boolean;
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
  /** 封禁状态筛选（可选）：banned=仅封禁 / active=仅活跃 */
  ban_status?: "banned" | "active";
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
  /** 删除操作人 ID */
  deletedBy: string;
  /** 删除时间（ISO 8601） */
  deletedAt: string;
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
//  10. 聚合类型 — 按 API 端点分组
// ============================================================

/**
 * 认证模块 API 类型映射
 *
 * 用于类型安全的前端 API 调用：
 *
 * @example
 * ```ts
 * import type { AuthApi } from "@common/user/user.interface";
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
 * 用户资料模块 API 类型映射
 *
 * @example
 * ```ts
 * import type { ProfileApi } from "@common/user/user.interface";
 * // 类型安全的资料更新
 * const body: ProfileApi["updateProfile"]["request"] = { nickname: "新昵称" };
 * ```
 */
export interface ProfileApi {
  /** GET /api/user/profile — 获取用户资料 */
  getProfile: {
    request: void;
    response: UserProfileResponse;
  };
  /** PUT /api/user/profile — 更新用户资料 */
  updateProfile: {
    request: UpdateProfileRequest;
    response: UpdateProfileResponse;
  };
  /** POST /api/user/avatar — 上传头像 */
  uploadAvatar: {
    request: FormData;
    response: AvatarUploadResult;
  };
  /** POST /api/user/bind-email — 绑定邮箱 */
  bindEmail: {
    request: BindEmailRequest;
    response: BindEmailResponse;
  };
  /** PUT /api/user/change-password — 修改密码 */
  changePassword: {
    request: ChangePasswordRequest;
    /** 无数据返回 */
    response: null;
  };
  /** DELETE /api/user/account — 注销账号 */
  deleteAccount: {
    request: void;
    response: DeleteAccountResponse;
  };
}

/**
 * 当前用户模块 API 类型映射
 */
export interface UserApi {
  /** GET /api/user/me — 获取当前用户信息 */
  getCurrentUser: {
    request: void;
    response: CurrentUserResponse;
  };
  /** PUT /api/user/update — 更新当前用户信息 */
  updateCurrentUser: {
    request: UpdateCurrentUserRequest;
    response: CurrentUserResponse;
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
  /** POST /api/admin/users/:id/ban */
  banUser: {
    request: BanUserRequest;
    response: BanUserResponse;
  };
  /** DELETE /api/admin/users/:id/ban */
  unbanUser: {
    request: void;
    response: UnbanUserResponse;
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
//  11. 健康检查
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
