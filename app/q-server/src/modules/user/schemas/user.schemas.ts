/**
 * 用户模块 — Zod Schema 定义
 *
 * "定义一次 Schema，校验 + 类型推导 + 复用 三合一"
 */

import { z } from "zod";
import { paginationSchema as basePaginationSchema } from "../../../utils/pagination.js";

// ══════════════════════════════════════════════════════════════════
//  基础校验规则（可跨接口复用）
// ══════════════════════════════════════════════════════════════════

/** 邮箱 — 非空 + RFC 5322 格式 */
export const emailSchema = z.string().min(1, "邮箱不能为空").email("请输入有效的邮箱地址");

/** 用户名 — 1~50字符，允许中文/字母/数字/下划线/短横线 */
export const usernameSchema = z
  .string()
  .min(1, "用户名不能为空")
  .max(50, "用户名最多50个字符")
  .regex(/^[\u4e00-\u9fa5a-zA-Z0-9_-]+$/, "用户名只能包含中文、字母、数字、下划线和短横线");

/** 密码强度 — ≥8位，含大小写字母和数字 */
export const passwordSchema = z
  .string()
  .min(8, "密码至少8位")
  .max(128, "密码最多128位")
  .regex(/[A-Z]/, "密码需包含大写字母")
  .regex(/[a-z]/, "密码需包含小写字母")
  .regex(/\d/, "密码需包含数字");

/** 6位数字验证码 */
export const verifyCodeSchema = z
  .string()
  .length(6, "验证码为6位数字")
  .regex(/^\d{6}$/, "验证码必须为6位数字");

/** 分页参数 — 复用 utils/pagination.ts，别名 pageSize → limit 保持向后兼容 */
export const paginationSchema = basePaginationSchema
  .extend({
    limit: z.coerce.number().int().min(1).max(100).default(20)
  })
  .omit({ pageSize: true });

// ══════════════════════════════════════════════════════════════════
//  认证接口 Schema
// ══════════════════════════════════════════════════════════════════

/** POST /api/auth/login */
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "密码不能为空")
});

/** POST /api/auth/send-code */
export const sendCodeSchema = z.object({
  email: emailSchema,
  type: z.enum(["register", "reset_password"], {
    message: "验证码类型必须为 register 或 reset_password"
  })
});

/** POST /api/auth/register（初始化注册） */
export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  username: usernameSchema.optional()
});

/** POST /api/auth/verify-register */
export const verifyRegisterSchema = z.object({
  email: emailSchema,
  code: verifyCodeSchema,
  password: passwordSchema,
  username: usernameSchema.optional()
});

/** POST /api/auth/refresh */
export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, "Refresh Token 不能为空")
});

/** POST /api/auth/reset-password */
export const resetPasswordSchema = z.object({
  email: emailSchema,
  code: verifyCodeSchema,
  newPassword: passwordSchema
});

/** POST /api/auth/logout */
export const logoutSchema = z.object({});

// ══════════════════════════════════════════════════════════════════
//  管理员接口 Schema
// ══════════════════════════════════════════════════════════════════

/** POST /api/admin/users */
export const createUserSchema = z.object({
  email: emailSchema,
  username: usernameSchema,
  role: z.enum(["user", "admin"], {
    message: "角色必须为 user 或 admin"
  }),
  password: passwordSchema.optional()
});

/** PUT /api/admin/users/:id */
export const updateUserSchema = z.object({
  username: usernameSchema.optional(),
  role: z.enum(["user", "admin"]).optional(),
  status: z.number().int().min(0).max(1).optional()
});

/** GET /api/admin/users */
export const userListQuerySchema = paginationSchema.extend({
  email: z.string().optional(),
  status: z.coerce.number().int().min(0).max(1).optional()
});

/** PUT /api/admin/config/smtp */
export const updateSmtpConfigSchema = z.object({
  enabled: z.boolean(),
  host: z.string().min(1, "SMTP 服务器地址不能为空").max(255),
  port: z.number().int().min(1).max(65535, "端口号必须在 1-65535 之间"),
  username: z.string().min(1, "SMTP 用户名不能为空"),
  password: z.string().optional(),
  fromEmail: emailSchema
});

// ══════════════════════════════════════════════════════════════════
//  类型导出（从 Schema 自动推导，与手写接口类型等价）
// ══════════════════════════════════════════════════════════════════

export type LoginInput = z.infer<typeof loginSchema>;
export type SendCodeInput = z.infer<typeof sendCodeSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type VerifyRegisterInput = z.infer<typeof verifyRegisterSchema>;
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type UserListQueryInput = z.infer<typeof userListQuerySchema>;
export type UpdateSmtpConfigInput = z.infer<typeof updateSmtpConfigSchema>;
