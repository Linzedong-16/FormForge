/**
 * 用户模块 API
 *
 * 封装用户资料相关 API：资料查询、更新、头像上传
 * 所有接口均需认证（Bearer Token），使用 serverClient
 */
import serverClient from "../../clients/server";

// ══════════════════════════════════════════════════════════════
//  类型定义（对接后端 /api/user/profile 响应）
// ══════════════════════════════════════════════════════════════

interface ApiResponse<T> {
  code: number;
  msg: string;
  data: T | null;
}

/** 用户资料响应（对应后端 UserProfileResponse） */
export interface UserProfile {
  userId: string;
  email: string;
  username: string;
  /** 头像 URL */
  avatarUrl: string | null;
  /** 昵称 */
  nickname: string | null;
  /** 职业 */
  occupation: string | null;
  /** 个人简介 */
  bio: string | null;
  /** 兴趣爱好 */
  interests: string[];
  /** 绑定邮箱 */
  boundEmail: string | null;
  /** 邮箱是否已验证 */
  emailVerified: boolean;
}

/** 用户资料更新请求体 */
export interface UpdateProfileInput {
  nickname?: string;
  occupation?: string;
  bio?: string;
  interests?: string[];
}

// ══════════════════════════════════════════════════════════════
//  API
// ══════════════════════════════════════════════════════════════

/** GET /api/user/profile — 获取用户资料 */
export const getProfile = (): Promise<ApiResponse<UserProfile>> => serverClient.get("/user/profile");

/** PUT /api/user/profile — 更新用户资料 */
export const updateProfile = (data: UpdateProfileInput): Promise<ApiResponse<UserProfile>> =>
  serverClient.put("/user/profile", data);

/** POST /api/user/avatar — 上传头像（multipart/form-data） */
export const uploadAvatar = (formData: FormData): Promise<ApiResponse<{ url: string }>> =>
  serverClient.post("/user/avatar", formData, {
    headers: { "Content-Type": "multipart/form-data" }
  });

/** GET /api/user/me — 获取当前用户基本信息 */
export const getCurrentUser = (): Promise<ApiResponse<UserProfile>> => serverClient.get("/user/me");
