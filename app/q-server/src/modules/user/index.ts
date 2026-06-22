/**
 * 用户模块 — 统一导出入口
 *
 * 模块组织：
 *   auth/       认证（登录、注册、Token、验证码、中间件）
 *   profile/    用户资料（资料 CRUD、头像上传、邮箱绑定、密码修改、账号注销）
 *   admin/      管理员功能（用户管理、系统配置）
 *   user-crud/  当前用户信息查询与更新
 *   schemas/    共享 Zod Schema 定义
 */
export { AuthService } from "./auth/auth.service.js";
export type { LoginResult, SystemStatus } from "./auth/auth.service.js";
export { authenticate, requireSuperAdmin, extractToken } from "./auth/auth.middleware.js";
export { default as authRoutes } from "./auth/auth.routes.js";

export { ProfileService } from "./profile/profile.service.js";
export type { UserProfileResponse } from "./profile/profile.service.js";
export { AvatarService } from "./profile/avatar.service.js";
export type { AvatarUploadResult } from "./profile/avatar.service.js";
export { default as profileRoutes } from "./profile/profile.routes.js";

export { AdminService } from "./admin/admin.service.js";
export type { CreateUserInput, UpdateUserInput, UserListQuery } from "./admin/admin.service.js";
export { default as adminRoutes } from "./admin/admin.routes.js";

export { UserService } from "./user-crud/user-crud.service.js";
export type { UserProfile, UpdateUserProfileInput } from "./user-crud/user-crud.service.js";
export { default as userCrudRoutes } from "./user-crud/user-crud.routes.js";

// Schema & Type 重导出
export {
  emailSchema,
  usernameSchema,
  passwordSchema,
  verifyCodeSchema,
  loginSchema,
  sendCodeSchema,
  registerSchema,
  verifyRegisterSchema,
  refreshTokenSchema,
  resetPasswordSchema,
  updateProfileSchema,
  bindEmailSchema,
  changePasswordSchema,
  createUserSchema,
  updateUserSchema,
  userListQuerySchema,
  updateSmtpConfigSchema
} from "./schemas/user.schemas.js";
export type {
  LoginInput,
  SendCodeInput,
  RegisterInput,
  VerifyRegisterInput,
  RefreshTokenInput,
  ResetPasswordInput,
  UpdateProfileInput,
  BindEmailInput,
  ChangePasswordInput,
  UserListQueryInput,
  UpdateSmtpConfigInput
} from "./schemas/user.schemas.js";
