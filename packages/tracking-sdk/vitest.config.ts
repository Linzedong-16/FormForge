import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // 使用 happy-dom 模拟浏览器环境（Tracker 依赖 window/document/navigator）
    environment: "happy-dom",
    include: ["src/**/*.spec.ts"]
  }
});
