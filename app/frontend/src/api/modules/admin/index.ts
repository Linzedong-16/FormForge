/**
 * 管理员模块 API
 *
 * 封装管理后台相关 API：
 *  - 系统配置查询/更新（GET/PUT /api/admin/config）
 *  - SMTP 配置更新（PUT /api/admin/config/smtp）
 *  - 服务健康检查（GET /api/health）
 *
 * 所有管理接口需认证 + super_admin 权限，使用 serverClient
 */
import serverClient from "../../clients/server";
import authClient from "../../clients/auth";

// ══════════════════════════════════════════════════════════════
//  类型
// ══════════════════════════════════════════════════════════════

interface ApiResponse<T> {
  code: number;
  msg: string;
  data: T | null;
}

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

/** AI 配置响应（对应 @common/ai/ai.interface.ts 的 AIConfigResponse） */
export interface AIConfigResponse {
  configured: boolean;
  apiKeyMasked: string;
  model: string;
  enabled: boolean;
}

/** AI 配置更新请求（对应 @common/ai/ai.interface.ts 的 UpdateAIConfigRequest） */
export interface AIConfigUpdateInput {
  apiKey: string;
  model?: string;
  enabled: boolean;
}

/** 健康检查响应 */
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
//  API
// ══════════════════════════════════════════════════════════════

/** GET /api/admin/config — 获取系统配置 */
export const getAdminConfig = (): Promise<ApiResponse<SystemConfig>> => serverClient.get("/admin/config");

/** PUT /api/admin/config/smtp — 更新 SMTP 配置 */
export const updateSmtpConfig = (data: SmtpConfigInput): Promise<ApiResponse<{ updated: boolean }>> =>
  serverClient.put("/admin/config/smtp", data);

/** GET /api/admin/config/ai — 获取 AI 配置（Key 脱敏） */
export const getAIConfig = (): Promise<ApiResponse<AIConfigResponse>> => serverClient.get("/admin/config/ai");

/** PUT /api/admin/config/ai — 更新 AI 配置（Key 加密存储） */
export const updateAIConfig = (data: AIConfigUpdateInput): Promise<ApiResponse<AIConfigResponse>> =>
  serverClient.put("/admin/config/ai", data);

// ══════════════════════════════════════════════════════════════
//  健康检查（公开接口，使用 authClient 避免 401 报错）
// ══════════════════════════════════════════════════════════════

/** GET /api/health — 服务健康检查（公开接口，无需认证） */
export const getHealthStatus = (): Promise<ApiResponse<HealthCheckResult>> => authClient.get("/health");
