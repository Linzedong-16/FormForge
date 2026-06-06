import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // 测试文件匹配模式
    include: ["src/spec/**/*.spec.ts"],

    // 全局 setup — mock 原生模块
    setupFiles: ["src/spec/setup.ts"],

    // 环境变量（测试用）
    env: {
      JWT_SECRET: "test-secret-key-for-unit-tests",
      JWT_ACCESS_EXPIRE: "3600",
      JWT_REFRESH_EXPIRE: "604800"
    },

    // 覆盖率配置
    coverage: {
      provider: "v8",
      include: ["src/modules/user/**/*.ts"],
      reportsDirectory: "coverage"
    }
  }
});
