import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  resolve: {
    alias: {
      // 与 tsconfig.json 的 paths 保持一致——Vitest（基于 Vite）不会自动读取
      // tsconfig paths，需要显式声明，否则任何从 @common 导入运行时值（而非纯类型）
      // 的模块在测试环境下都无法解析（生产构建侧的等价修复见 package.json 的
      // build 脚本新增的 tsc-alias 步骤）
      "@common": resolve(__dirname, "../../packages/common/src")
    }
  },
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
