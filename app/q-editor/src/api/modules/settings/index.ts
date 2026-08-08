/**
 * 个人设置模块 API
 *
 * 封装用户 personal settings 相关的 API 调用：
 * - 用户资料查询/更新
 * - 头像上传
 * - 邮箱绑定
 * - 密码修改
 * - 账号注销
 *
 * 所有接口均需登录，统一使用 serverClient（自动携带 Token + 401 自动刷新重试）
 */

import type {
  ApiResponse,
  UserProfileResponse,
  UpdateProfileRequest,
  UpdateProfileResponse,
  AvatarUploadResult,
  BindEmailRequest,
  BindEmailResponse,
  ChangePasswordRequest,
  DeleteAccountResponse
} from "@common/user/user.interface";

import serverClient from "../../clients/server";

// ============================================================
//  GET /api/user/profile — 获取用户资料（含表单回显数据）
// ============================================================
export const getProfile = (): Promise<ApiResponse<UserProfileResponse>> => serverClient.get("/user/profile");

// ============================================================
//  PUT /api/user/profile — 更新用户资料
// ============================================================
export const updateProfile = (data: UpdateProfileRequest): Promise<ApiResponse<UpdateProfileResponse>> =>
  serverClient.put("/user/profile", data);

// ============================================================
//  POST /api/user/avatar — 上传头像（multipart/form-data）
// ============================================================
export const uploadAvatar = (blob: Blob, filename: string): Promise<ApiResponse<AvatarUploadResult>> => {
  const formData = new FormData();
  formData.append("file", blob, filename);

  // 走 serverClient，自动附加 Authorization + 401 自动刷新重试
  return serverClient.post("/user/avatar", formData, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 30000
  });
};

// ============================================================
//  POST /api/user/bind-email — 绑定邮箱
// ============================================================
export const bindEmail = (data: BindEmailRequest): Promise<ApiResponse<BindEmailResponse>> =>
  serverClient.post("/user/bind-email", data);

// ============================================================
//  PUT /api/user/change-password — 修改密码
// ============================================================
export const changePassword = (data: ChangePasswordRequest): Promise<ApiResponse<null>> =>
  serverClient.put("/user/change-password", data);

// ============================================================
//  DELETE /api/user/account — 注销账号
// ============================================================
export const deleteAccount = (): Promise<ApiResponse<DeleteAccountResponse>> => serverClient.delete("/user/account");

// ============================================================
// 类型导出
// ============================================================

export type {
  ApiResponse,
  UserProfileResponse,
  UpdateProfileRequest,
  UpdateProfileResponse,
  AvatarUploadResult,
  BindEmailRequest,
  BindEmailResponse,
  ChangePasswordRequest,
  DeleteAccountResponse
};
