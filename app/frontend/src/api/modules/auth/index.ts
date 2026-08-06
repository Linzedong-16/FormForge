/**
 * 认证模块 API
 *
 * 封装所有认证相关的 API 调用：登录、注册、Token 管理、验证码、密码重置
 *
 * 客户端选择策略：
 * - authClient：公开接口（登录、注册、验证码、密码重置、状态查询、Token 刷新）
 * - serverClient：需要 access_token 的接口（登出）
 */
import authClient from "../../clients/auth";
import serverClient from "../../clients/server";

// ══════════════════════════════════════════════════════════════════
//  类型（来自统一共享包 @common/user/user.interface，保持接口一致）
// ══════════════════════════════════════════════════════════════════

/** 统一 API 响应包装 */
interface ApiResponse<T> {
  code: number;
  msg: string;
  data: T | null;
}

interface LoginRequest {
  email: string;
  password: string;
}

interface TokenInfo {
  token: string;
  tokenType: "Bearer";
  expiresIn: number;
  refreshToken: string;
  refreshExpiresIn: number;
}

interface UserInfo {
  id: string;
  email: string;
  username: string;
  role: "super_admin" | "user";
}

interface LoginResponse extends TokenInfo {
  user: UserInfo;
}

interface InitRegisterRequest {
  email: string;
  password: string;
  username?: string;
}

interface InitRegisterResponse extends TokenInfo {
  user: UserInfo;
  isFirstUser: true;
}

interface SendCodeRequest {
  email: string;
  type: "register" | "reset_password";
}

interface SendCodeResponse {
  expireSeconds: number;
}

interface VerifyRegisterRequest {
  email: string;
  code: string;
  password: string;
  username?: string;
}

interface VerifyRegisterResponse extends TokenInfo {
  user: UserInfo;
}

interface RefreshTokenRequest {
  refreshToken: string;
}

interface ResetPasswordRequest {
  email: string;
  code: string;
  newPassword: string;
}

interface SystemStatusResponse {
  initialized: boolean;
  registrationEnabled: boolean;
  registrationMode: "open" | "closed" | "invite";
  smtpConfigured: boolean;
}

// ══════════════════════════════════════════════════════════════════
//  认证接口
// ══════════════════════════════════════════════════════════════════

/** GET /api/auth/status — 获取系统状态 */
export const getSystemStatus = (): Promise<ApiResponse<SystemStatusResponse>> => authClient.get("/auth/status");

/** POST /api/auth/login — 用户登录 */
export const login = (data: LoginRequest): Promise<ApiResponse<LoginResponse>> => authClient.post("/auth/login", data);

/** POST /api/auth/register — 初始化注册（首个超级管理员） */
export const initRegister = (data: InitRegisterRequest): Promise<ApiResponse<InitRegisterResponse>> =>
  authClient.post("/auth/register", data);

/** POST /api/auth/send-code — 发送验证码 */
export const sendCode = (data: SendCodeRequest): Promise<ApiResponse<SendCodeResponse>> =>
  authClient.post("/auth/send-code", data);

/** POST /api/auth/verify-register — 邮箱验证注册 */
export const verifyRegister = (data: VerifyRegisterRequest): Promise<ApiResponse<VerifyRegisterResponse>> =>
  authClient.post("/auth/verify-register", data);

/** POST /api/auth/refresh — 刷新 Token */
export const refreshToken = (data: RefreshTokenRequest): Promise<ApiResponse<LoginResponse>> =>
  authClient.post("/auth/refresh", data);

/** POST /api/auth/logout — 登出（refreshToken 可选，传入时后端会一并拉黑） */
export const logout = (data?: { refreshToken?: string }): Promise<ApiResponse<null>> =>
  serverClient.post("/auth/logout", data);

/** POST /api/auth/reset-password — 重置密码 */
export const resetPassword = (data: ResetPasswordRequest): Promise<ApiResponse<null>> =>
  authClient.post("/auth/reset-password", data);

// ══════════════════════════════════════════════════════════════════
//  类型导出
// ══════════════════════════════════════════════════════════════════

export type {
  ApiResponse,
  LoginRequest,
  LoginResponse,
  TokenInfo,
  UserInfo,
  InitRegisterRequest,
  InitRegisterResponse,
  SendCodeRequest,
  SendCodeResponse,
  VerifyRegisterRequest,
  VerifyRegisterResponse,
  RefreshTokenRequest,
  ResetPasswordRequest,
  SystemStatusResponse
};
