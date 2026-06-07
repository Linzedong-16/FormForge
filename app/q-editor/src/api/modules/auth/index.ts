/**
 * 认证模块 API
 *
 * 封装所有认证相关的 API 调用：
 * - 登录/注册
 * - Token 管理（刷新、登出）
 * - 验证码发送
 * - 密码重置
 *
 * 使用 authClient（不携带 Token）
 */
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
  VerifyRegisterResponse,
  RefreshTokenRequest,
  ResetPasswordRequest
} from "@common/user/user.interface";

import authClient from "../../clients/auth";

// ============================================================
// 系统状态
// ============================================================

/**
 * GET /api/auth/status — 获取系统状态
 * @description 判断系统是否初始化、SMTP是否配置、注册是否开放
 */
export const getSystemStatus = (): Promise<ApiResponse<SystemStatusResponse>> => authClient.get("/auth/status");

// ============================================================
// 登录
// ============================================================

/**
 * POST /api/auth/login — 用户登录
 * @param data 邮箱 + 密码
 */
export const login = (data: LoginRequest): Promise<ApiResponse<LoginResponse>> => authClient.post("/auth/login", data);

// ============================================================
// 注册
// ============================================================

/**
 * POST /api/auth/register — 初始化注册（首个超级管理员）
 * @description 仅系统未初始化时可用，第一个注册者自动成为超级管理员
 * @param data 邮箱 + 密码 + 用户名（可选）
 */
export const initRegister = (data: InitRegisterRequest): Promise<ApiResponse<InitRegisterResponse>> =>
  authClient.post("/auth/register", data);

/**
 * POST /api/auth/send-code — 发送验证码
 * @param data 邮箱 + 用途类型（register | reset_password）
 */
export const sendCode = (data: SendCodeRequest): Promise<ApiResponse<SendCodeResponse>> =>
  authClient.post("/auth/send-code", data);

/**
 * POST /api/auth/verify-register — 邮箱验证注册
 * @description 系统已初始化且SMTP已配置时，普通用户通过邮箱验证码注册
 * @param data 邮箱 + 验证码 + 密码 + 用户名（可选）
 */
export const verifyRegister = (data: VerifyRegisterRequest): Promise<ApiResponse<VerifyRegisterResponse>> =>
  authClient.post("/auth/verify-register", data);

// ============================================================
// Token 管理
// ============================================================

/**
 * POST /api/auth/refresh — 刷新 Token
 * @param data Refresh Token
 */
export const refreshToken = (data: RefreshTokenRequest): Promise<ApiResponse<LoginResponse>> =>
  authClient.post("/auth/refresh", data);

/**
 * POST /api/auth/logout — 登出
 * @description 需要携带有效 Token
 */
export const logout = (): Promise<ApiResponse<null>> => authClient.post("/auth/logout");

// ============================================================
// 密码重置
// ============================================================

/**
 * POST /api/auth/reset-password — 重置密码
 * @param data 邮箱 + 验证码 + 新密码
 */
export const resetPassword = (data: ResetPasswordRequest): Promise<ApiResponse<null>> =>
  authClient.post("/auth/reset-password", data);

// ============================================================
// 类型导出
// ============================================================

export type {
  ApiResponse,
  LoginRequest,
  LoginResponse,
  SystemStatusResponse,
  SendCodeRequest,
  SendCodeResponse,
  InitRegisterRequest,
  InitRegisterResponse,
  VerifyRegisterRequest,
  VerifyRegisterResponse,
  RefreshTokenRequest,
  ResetPasswordRequest
};
