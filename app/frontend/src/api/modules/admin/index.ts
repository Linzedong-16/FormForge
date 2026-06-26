/**
 * 管理员模块 API
 *
 * 封装管理后台相关 API：
 *  - 用户管理 CRUD          — POST/GET/PUT/DELETE /api/admin/users
 *  - 用户封禁/解封           — POST/DELETE /api/admin/users/:id/ban
 *  - 系统配置查询/更新       — GET/PUT /api/admin/config
 *  - SMTP 配置更新           — PUT /api/admin/config/smtp
 *  - 服务健康检查            — GET /api/health
 *
 * 所有管理接口需认证 + super_admin 权限，使用 serverClient
 */
import serverClient from "../../clients/server";
import authClient from "../../clients/auth";

// ══════════════════════════════════════════════════════════════
//  通用类型
// ══════════════════════════════════════════════════════════════

interface ApiResponse<T> {
  code: number;
  msg: string;
  data: T | null;
}

// ══════════════════════════════════════════════════════════════
//  用户管理 — 类型（对接后端 admin.service.ts）
// ══════════════════════════════════════════════════════════════

/** 创建用户请求 */
export interface CreateUserInput {
  email: string;
  username: string;
}

/** 创建用户响应 */
export interface CreateUserResult {
  id: string;
  email: string;
  username: string;
  role: string;
  status: number;
  defaultPassword: string;
  requirePasswordChange: boolean;
}

/** 用户列表查询参数 */
export interface UserListQuery {
  page?: number;
  limit?: number;
  email?: string;
  status?: number;
  ban_status?: "banned" | "active";
}

/** 用户列表条目 */
export interface UserAdminItem {
  id: string;
  email: string;
  username: string;
  role: string;
  status: number;
  created_at: string;
  last_login_at: string | null;
  isBanned: boolean;
  banRemaining: number | null;
  isDeleted: boolean;
}

/** 用户列表分页响应 */
export interface UserListResult {
  items: UserAdminItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/** 更新用户请求 */
export interface UpdateUserInput {
  username?: string;
  role?: "user" | "super_admin";
  status?: number;
}

/** 更新用户响应 */
export interface UpdateUserResult {
  id: string;
  email: string;
  username: string;
  role: string;
  status: number;
}

/** 删除用户响应 */
export interface DeleteUserResult {
  id: string;
  deleted: boolean;
  deletedBy: string;
  deletedAt: string;
}

/** 封禁用户请求 */
export interface BanUserInput {
  ban_duration: number; // 分钟
  reason?: string;
}

/** 封禁用户响应 */
export interface BanUserResult {
  id: string;
  username: string;
  isBanned: boolean;
  banRemaining: number;
  bannedUntil: string;
}

/** 解封用户响应 */
export interface UnbanUserResult {
  id: string;
  username: string;
  isBanned: false;
}

// ══════════════════════════════════════════════════════════════
//  系统配置 — 类型
// ══════════════════════════════════════════════════════════════

/** 系统配置（按 category 分组的 key-value） */
export type SystemConfig = Record<string, Record<string, string>>;

/** SMTP 配置更新请求 */
export interface SmtpConfigInput {
  enabled: boolean;
  host: string;
  port: number;
  username: string;
  password?: string;
  fromEmail: string;
}

/** AI 配置响应 */
export interface AIConfigResponse {
  configured: boolean;
  apiKeyMasked: string;
  model: string;
  enabled: boolean;
}

/** AI 配置更新请求 */
export interface AIConfigUpdateInput {
  apiKey: string;
  model?: string;
  enabled: boolean;
}

/** 健康检查结果 */
export interface HealthCheckResult {
  status: "ok" | "degraded";
  uptime: number;
  checks: Record<string, HealthServiceCheck>;
}

export interface HealthServiceCheck {
  ok: boolean;
  latency_ms?: number;
  error?: string;
}

// ══════════════════════════════════════════════════════════════
//  用户管理 API
// ══════════════════════════════════════════════════════════════

/** POST /api/admin/users — 创建用户（仅需 email + username，密码默认 Aa123456） */
export const createUser = (data: CreateUserInput): Promise<ApiResponse<CreateUserResult>> =>
  serverClient.post("/admin/users", data);

/** GET /api/admin/users — 获取用户列表（分页 + 搜索 + 封禁筛选） */
export const listUsers = (params: UserListQuery = {}): Promise<ApiResponse<UserListResult>> =>
  serverClient.get("/admin/users", { params });

/** PUT /api/admin/users/:id — 更新用户信息 */
export const updateUser = (id: string, data: UpdateUserInput): Promise<ApiResponse<UpdateUserResult>> =>
  serverClient.put(`/admin/users/${id}`, data);

/** DELETE /api/admin/users/:id — 软删除用户 */
export const deleteUser = (id: string): Promise<ApiResponse<DeleteUserResult>> =>
  serverClient.delete(`/admin/users/${id}`);

/** POST /api/admin/users/:id/ban — 封禁用户 */
export const banUser = (id: string, data: BanUserInput): Promise<ApiResponse<BanUserResult>> =>
  serverClient.post(`/admin/users/${id}/ban`, data);

/** DELETE /api/admin/users/:id/ban — 解除封禁 */
export const unbanUser = (id: string): Promise<ApiResponse<UnbanUserResult>> =>
  serverClient.delete(`/admin/users/${id}/ban`);

// ══════════════════════════════════════════════════════════════
//  系统配置 API
// ══════════════════════════════════════════════════════════════

/** GET /api/admin/config — 获取系统配置 */
export const getAdminConfig = (): Promise<ApiResponse<SystemConfig>> => serverClient.get("/admin/config");

/** PUT /api/admin/config/smtp — 更新 SMTP 配置 */
export const updateSmtpConfig = (data: SmtpConfigInput): Promise<ApiResponse<{ updated: boolean }>> =>
  serverClient.put("/admin/config/smtp", data);

/** GET /api/admin/config/ai — 获取 AI 配置 */
export const getAIConfig = (): Promise<ApiResponse<AIConfigResponse>> => serverClient.get("/admin/config/ai");

/** PUT /api/admin/config/ai — 更新 AI 配置 */
export const updateAIConfig = (data: AIConfigUpdateInput): Promise<ApiResponse<AIConfigResponse>> =>
  serverClient.put("/admin/config/ai", data);

// ══════════════════════════════════════════════════════════════
//  健康检查（公开接口，使用 authClient 避免 401 报错）
// ══════════════════════════════════════════════════════════════

/** GET /api/health — 服务健康检查 */
export const getHealthStatus = (): Promise<ApiResponse<HealthCheckResult>> => authClient.get("/health");

// ══════════════════════════════════════════════════════════════
//  DeepSeek API 用量查询
// ══════════════════════════════════════════════════════════════

/** 余额信息 */
export interface DeepSeekBalance {
  currency: string;
  total_balance: string;
  granted_balance: string;
  topped_up_balance: string;
}

/** 用量数据点 */
export interface DeepSeekUsagePoint {
  date: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  request_count: number;
}

/** 用量查询响应 */
export interface DeepSeekUsageResponse {
  balance: {
    is_available: boolean;
    balance_infos: DeepSeekBalance[];
  } | null;
  usage_summary: {
    total_prompt_tokens: number;
    total_completion_tokens: number;
    total_tokens: number;
    total_requests: number;
  };
  daily_usage: DeepSeekUsagePoint[];
  estimated_cost: {
    input_cost: number;
    output_cost: number;
    total_cost: number;
    currency: string;
  };
  queried_at: string;
}

/** GET /api/admin/ai/usage — 查询 DeepSeek 余额 + Token 用量 */
export const getAIUsage = (params?: {
  start_date?: string;
  end_date?: string;
}): Promise<ApiResponse<DeepSeekUsageResponse>> => serverClient.get("/admin/ai/usage", { params });
