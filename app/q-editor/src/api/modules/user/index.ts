/**
 * 用户模块 API
 *
 * 封装所有用户业务相关的 API 调用：
 * - 用户信息（当前用户、管理员）
 * - 用户管理（管理员CRUD）
 *
 * 业务接口使用 serverClient（携带Token + 401自动刷新）
 */
import type {
  ApiResponse,
  UserInfo,
  UserAdminItem,
  UserListResponse,
  UserListQuery,
  CreateUserRequest,
  CreateUserResponse,
  UpdateUserRequest,
  UpdateUserResponse,
  DeleteUserResponse
} from "@common/user/user.interface";

import serverClient from "../../clients/server";

// ============================================================
// 当前用户
// ============================================================

/**
 * GET /api/user/me — 获取当前用户信息
 */
export const getCurrentUser = (): Promise<ApiResponse<UserInfo>> => serverClient.get("/user/me");

/**
 * PUT /api/user/update — 更新当前用户信息
 * @param data 要更新的字段（username / password）
 */
export const updateCurrentUser = (data: { username?: string; password?: string }): Promise<ApiResponse<UserInfo>> =>
  serverClient.put("/user/update", data);

// ============================================================
// 用户管理（管理员）
// ============================================================

/**
 * GET /api/admin/users — 获取用户列表
 * @param params 查询参数（page, limit, email?, status?）
 */
export const getUserList = (params?: UserListQuery): Promise<ApiResponse<UserListResponse>> =>
  serverClient.get("/admin/users", { params });

/**
 * POST /api/admin/users — 创建用户
 * @param data 邮箱 + 用户名 + 角色 + 密码（可选）
 */
export const createUser = (data: CreateUserRequest): Promise<ApiResponse<CreateUserResponse>> =>
  serverClient.post("/admin/users", data);

/**
 * PUT /api/admin/users/:id — 更新用户
 * @param id 用户ID
 * @param data 要更新的字段（username / role / status）
 */
export const updateUser = (id: string, data: UpdateUserRequest): Promise<ApiResponse<UpdateUserResponse>> =>
  serverClient.put(`/admin/users/${id}`, data);

/**
 * DELETE /api/admin/users/:id — 删除用户
 * @param id 用户ID
 */
export const deleteUser = (id: string): Promise<ApiResponse<DeleteUserResponse>> =>
  serverClient.delete(`/admin/users/${id}`);

// ============================================================
// 类型导出
// ============================================================

export type {
  ApiResponse,
  UserInfo,
  UserAdminItem,
  UserListResponse,
  UserListQuery,
  CreateUserRequest,
  CreateUserResponse,
  UpdateUserRequest,
  UpdateUserResponse,
  DeleteUserResponse
};
