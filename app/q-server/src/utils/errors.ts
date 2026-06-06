/**
 * 全局错误类型定义
 *
 * AppError     — 通用应用错误，携带业务状态码
 * AuthError    — 认证/授权相关错误
 * ValidationError — 参数校验错误
 */

/** 通用应用错误 */
export class AppError extends Error {
  public readonly code: number;
  public readonly statusCode: number;
  public readonly details?: unknown;

  constructor(message: string, statusCode: number, code?: number, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code ?? statusCode;
    this.details = details;
  }
}

/** 认证授权错误 */
export class AuthError extends AppError {
  constructor(message: string, statusCode: number, details?: unknown) {
    super(message, statusCode, statusCode, details);
    this.name = "AuthError";
  }
}

/** 参数校验错误 */
export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 400, 400, details);
    this.name = "ValidationError";
  }
}
