/**
 * Playwright 全局 Setup — 覆盖率收集初始化
 *
 * 使用 ESM 兼容的 import.meta.url 替代 __dirname
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const coverageDir = path.resolve(__dirname, ".coverage");

async function globalSetup() {
  // 清理上一次的覆盖率数据
  if (fs.existsSync(coverageDir)) {
    fs.rmSync(coverageDir, { recursive: true, force: true });
  }
  fs.mkdirSync(coverageDir, { recursive: true });
}

export default globalSetup;
