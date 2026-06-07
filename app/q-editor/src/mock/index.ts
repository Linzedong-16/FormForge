/**
 * Mock 入口 — 汇总所有模块
 *
 * vite-plugin-mock 会读取此文件的 default export（MockMethod[]）
 */
import { authMocks } from "./modules/auth";
import { userMocks } from "./modules/user";

export default [...authMocks, ...userMocks];
