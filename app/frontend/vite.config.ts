import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { resolve } from "path";
import AutoImport from "unplugin-auto-import/vite";
import Components from "unplugin-vue-components/vite";
import { ArcoResolver, ElementPlusResolver } from "unplugin-vue-components/resolvers";
import { vitePluginForArco } from "@arco-plugins/vite-vue";
import qiankun from "vite-plugin-qiankun";

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [
    vue(),
    vitePluginForArco({ style: "css" }),
    // Arco Design + Element Plus 双 UI 库自动导入
    // 两个库使用不同的 CSS 前缀（arco- / el-），可以安全共存
    AutoImport({ resolvers: [ArcoResolver(), ElementPlusResolver()] }),
    Components({ resolvers: [ArcoResolver({ sideEffect: true }), ElementPlusResolver()] }),
    // qiankun 子应用适配插件：注入生命周期桥接脚本，解决 Vite ES Module 与 qiankun eval() 的兼容问题
    qiankun("frontend", { useDevMode: command === "serve" })
  ],
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
      // 引用 monorepo 共享类型包（与 q-editor 保持一致的别名配置）
      "@common": resolve(__dirname, "../../packages/common/src")
    }
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalizedId = id.replace(/\\/g, "/");

          if (!normalizedId.includes("/node_modules/")) {
            return;
          }

          if (
            normalizedId.includes("/node_modules/vue/") ||
            normalizedId.includes("/node_modules/vue-router/") ||
            normalizedId.includes("/node_modules/pinia/") ||
            normalizedId.includes("/node_modules/vue-i18n/")
          ) {
            return "vue-core";
          }

          if (normalizedId.includes("/node_modules/@arco-design/")) {
            return "ui-arco";
          }

          if (
            normalizedId.includes("/node_modules/element-plus/") ||
            normalizedId.includes("/node_modules/@element-plus/")
          ) {
            return "ui-element";
          }

          if (normalizedId.includes("/node_modules/monorepo-survey-engine/")) {
            return "survey-engine";
          }

          return "vendor";
        }
      }
    }
  },
  server: {
    port: 5174, // 固定端口，与主应用 entry: '//localhost:5174' 对应
    cors: true, // 允许主应用（localhost:8000）跨域加载此子应用
    proxy: {
      "/api": {
        target: "http://localhost:8080",
        changeOrigin: true,
        rewrite: path => path
      }
    }
  }
}));
