import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";
import path from "path";

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: "jsdom",
    // logic 子模块（框架无关）已随 T019 迁移至 src/core/logic/__tests__/，改由 vitest.core.config.ts
    // （node 环境，不加载 vue 插件）独立验证，此处不再重复覆盖；adapters/vue3 适配层单测（依赖 Vue/jsdom）
    // 放在 src/adapters/vue3/__tests__/ 下，需扩展 include 覆盖
    include: ["src/__tests__/**/*.spec.ts", "src/adapters/**/__tests__/**/*.spec.ts"],
    globals: true,
    setupFiles: ["./src/__tests__/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: ["node_modules", "dist", "src/__tests__"]
    }
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src")
    }
  }
});
