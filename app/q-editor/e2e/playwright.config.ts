import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Playwright E2E 测试配置
 *
 * 使用 Mock 模式启动 Vite dev server，无需依赖后端服务
 * 集成 monocart-reporter 生成覆盖率报告
 */
export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : 4,
  timeout: 60_000,
  expect: {
    timeout: 10_000
  },

  globalSetup: path.resolve(__dirname, "global-setup.ts"),
  globalTeardown: path.resolve(__dirname, "global-teardown.ts"),

  reporter: [
    ["html", { outputFolder: "playwright-report", open: "never" }],
    ["json", { outputFile: "test-results/results.json" }],
    ["list"]
  ],

  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 15_000,
    navigationTimeout: 30_000
  },

  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"]
      }
    }
  ],

  webServer: {
    command: "pnpm dev:mock",
    url: "http://localhost:5173",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    cwd: ".."
  },

  // 输出目录
  outputDir: "test-results/"
});
