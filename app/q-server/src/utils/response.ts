/**
 * 全局统一响应工具
 *
 * 所有接口返回的 JSON 数据结构：
 *   { data: T | null, code: number, msg: string }
 *
 * 使用方式：
 *   import { success, fail } from "../utils/response.js";
 *   reply.send(success(userData));
 *   reply.send(fail(404, "用户不存在"));
 */

// ─── 类型定义 ────────────────────────────────────────────────

/** 统一响应结构 */
export interface ApiResponse<T = unknown> {
  data: T | null;
  code: number;
  msg: string;
}

/** 预设的 HTTP 业务状态码 */
export enum StatusCode {
  /** 成功 */
  OK = 0,
  /** 参数校验失败 */
  BAD_REQUEST = 400,
  /** 未登录 / Token 无效 */
  UNAUTHORIZED = 401,
  /** 无权限 */
  FORBIDDEN = 403,
  /** 资源不存在 */
  NOT_FOUND = 404,
  /** 资源冲突（如重复创建） */
  CONFLICT = 409,
  /** 请求过于频繁 */
  RATE_LIMITED = 429,
  /** 服务器内部错误 */
  INTERNAL_ERROR = 500
}

/** 认证模块业务错误码 */
export enum BizCode {
  /** 邮箱已被注册 */
  EMAIL_EXISTS = 1001,
  /** 邮箱不存在 */
  EMAIL_NOT_EXISTS = 1002,
  /** 验证码无效 */
  VERIFY_CODE_INVALID = 1003,
  /** 验证码已过期 */
  VERIFY_CODE_EXPIRED = 1004,
  /** 账户已锁定 */
  ACCOUNT_LOCKED = 1005,
  /** 账户已禁用 */
  ACCOUNT_DISABLED = 1006,
  /** 密码错误 */
  INVALID_PASSWORD = 1007,
  /** 系统未初始化 */
  SYSTEM_NOT_INITIALIZED = 1008,
  /** 注册已关闭 */
  REGISTRATION_CLOSED = 1009,
  /** SMTP 未配置 */
  SMTP_NOT_CONFIGURED = 1010
}

// ─── 构建函数 ────────────────────────────────────────────────

/**
 * 构建成功响应
 * @param data  返回的数据
 * @param msg   提示信息（默认 "ok"）
 * @param code  业务状态码（默认 0）
 */
export function success<T = unknown>(data: T, msg = "ok", code: number = StatusCode.OK): ApiResponse<T> {
  return { data, code, msg };
}

/**
 * 构建失败响应
 * @param code  业务状态码
 * @param msg   错误提示信息
 * @param data  可选的附加数据（通常为 null）
 */
export function fail<T = unknown>(code: number, msg: string, data: T | null = null): ApiResponse<T> {
  return { data, code, msg };
}

// ─── 常用快捷方法 ────────────────────────────────────────────

/** 参数错误 */
export function badRequest(msg = "参数错误") {
  return fail(StatusCode.BAD_REQUEST, msg);
}

/** 未登录 */
export function unauthorized(msg = "请先登录") {
  return fail(StatusCode.UNAUTHORIZED, msg);
}

/** 无权限 */
export function forbidden(msg = "无权限访问") {
  return fail(StatusCode.FORBIDDEN, msg);
}

/** 资源不存在 */
export function notFound(msg = "资源不存在") {
  return fail(StatusCode.NOT_FOUND, msg);
}

/** 服务器错误 */
export function serverError(msg = "服务器内部错误") {
  return fail(StatusCode.INTERNAL_ERROR, msg);
}
