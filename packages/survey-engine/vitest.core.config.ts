import { defineConfig } from "vitest/config";

// 用于验证 core/ 目录框架无关：不加载 @vitejs/plugin-vue 插件，运行环境为 node（而非 jsdom）
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/core/**/__tests__/**/*.spec.ts"],
    globals: true
  }
});
