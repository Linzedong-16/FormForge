import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";
import path from "path";

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: "jsdom",
    // logic 子模块的单测放在 src/logic/__tests__/ 下，需扩展 include 覆盖该目录
    include: ["src/__tests__/**/*.spec.ts", "src/logic/__tests__/**/*.spec.ts"],
    globals: true,
    setupFiles: ["./src/__tests__/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: ["node_modules", "dist", "src/__tests__", "src/logic/__tests__"]
    }
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src")
    }
  }
});
