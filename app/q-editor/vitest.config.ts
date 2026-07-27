import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";
import vueJsx from "@vitejs/plugin-vue-jsx";

export default defineConfig({
  plugins: [vue(), vueJsx()],
  test: {
    environment: "happy-dom",
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    globals: true,
    setupFiles: ["./src/test-setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary", "json", "html"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.{ts,vue}"],
      exclude: [
        "node_modules",
        "e2e/**",
        "src/mock/**",
        "src/**/__tests__/**",
        "src/i18n/**",
        "src/types/**",
        "src/configs/defaultStatus/**",
        "src/configs/regionData.ts",
        "src/utils/eventBus.ts",
        "src/vite-env.d.ts",
        "src/public-path.ts",
        "src/test-setup.ts",
        "src/main.ts",
        "src/App.vue",
        "src/router/index.ts",
        "src/plugins/**",
        "src/extension/**"
      ]
    }
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@common": fileURLToPath(new URL("../../packages/common/src", import.meta.url))
    }
  }
});
