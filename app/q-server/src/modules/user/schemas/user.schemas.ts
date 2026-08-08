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

/** 昵称 — 1~50字符，允许中文/字母/数字/下划线/空格 */
export const nicknameSchema = z
  .string()
  .min(1, "昵称不能为空")
  .max(50, "昵称最多50个字符")
  .regex(/^[\u4e00-\u9fa5a-zA-Z0-9_\s]+$/, "昵称包含非法字符");

/** 职业 — 1~100字符 */
export const occupationSchema = z.string().min(1, "职业不能为空").max(100, "职业最多100个字符");

/** 个人介绍 — 1~500字符 */
export const bioSchema = z.string().min(1, "个人介绍不能为空").max(500, "个人介绍最多500个字符");

/** 兴趣标签数组 — 最多10个标签，单个标签1~20字符 */
export const interestsSchema = z
  .array(z.string().min(1, "标签不能为空").max(20, "单个标签最多20个字符"))
  .max(10, "兴趣标签最多10个")
  .default([]);

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
  type: z.enum(["register", "reset_password", "bind_email", "change_password"], {
    message: "验证码类型必须为 register、reset_password、bind_email 或 change_password"
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

/** POST /api/auth/logout — refreshToken 可选，传入时后端会一并拉黑，防止登出后旧 RT 仍可用于刷新 */
export const logoutSchema = z.object({
  refreshToken: z.string().min(1).optional()
});

/** POST /api/auth/reset-password */
export const resetPasswordSchema = z.object({
  email: emailSchema,
  code: verifyCodeSchema,
  newPassword: passwordSchema
});

// ══════════════════════════════════════════════════════════════════
//  用户资料接口 Schema
// ══════════════════════════════════════════════════════════════════

/** PUT /api/user/profile */
export const updateProfileSchema = z
  .object({
    nickname: nicknameSchema.optional(),
    occupation: occupationSchema.optional(),
    bio: bioSchema.optional(),
    interests: interestsSchema.optional()
  })
  .refine(data => Object.keys(data).length > 0, {
    message: "至少需要提供一个有效字段"
  });

/** POST /api/user/bind-email */
export const bindEmailSchema = z.object({
  email: emailSchema,
  code: verifyCodeSchema
});

/** PUT /api/user/change-password */
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "当前密码不能为空"),
  newPassword: passwordSchema
});

// ══════════════════════════════════════════════════════════════════
//  管理员接口 Schema
// ══════════════════════════════════════════════════════════════════

/** POST /api/admin/users — 简化版：管理员创建普通用户，仅需 username + email */
export const createUserSchema = z.object({
  email: emailSchema,
  username: usernameSchema
});

/** POST /api/admin/users/:id/ban — 封禁用户 */
export const banUserSchema = z.object({
  ban_duration: z.number().int().min(1, "封禁时长至少1分钟").max(43200, "封禁时长不能超过30天"), // 43200 分钟 = 30 天
  reason: z.string().max(500, "封禁原因最多500个字符").optional()
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
  status: z.coerce.number().int().min(0).max(1).optional(),
  ban_status: z.enum(["banned", "active"]).optional()
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
export type LogoutInput = z.infer<typeof logoutSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type UserListQueryInput = z.infer<typeof userListQuerySchema>;
export type UpdateSmtpConfigInput = z.infer<typeof updateSmtpConfigSchema>;
export type BanUserInput = z.infer<typeof banUserSchema>;

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type BindEmailInput = z.infer<typeof bindEmailSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
