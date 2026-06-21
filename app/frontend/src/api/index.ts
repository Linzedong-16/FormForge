/**
 * API 层统一导出入口
 *
 * 职责分层：
 *   clients/  — axios 实例（纯 HTTP 配置，不含业务函数）
 *   modules/  — 按领域组织的接口函数（auth / user / ...）
 *   index.ts  — 对外唯一出口
 */
export * from "./modules/auth";
export * from "./modules/user";
export * from "./modules/admin";
export * from "./modules/log";
