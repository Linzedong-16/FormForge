import { fileURLToPath, URL } from "node:url";
import { visualizer } from "rollup-plugin-visualizer";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import vueJsx from "@vitejs/plugin-vue-jsx";
import vueDevTools from "vite-plugin-vue-devtools";
import inspect from "vite-plugin-inspect";
import viteCompression from "vite-plugin-compression";

import AutoImport from "unplugin-auto-import/vite";
import Components from "unplugin-vue-components/vite";
import { ElementPlusResolver } from "unplugin-vue-components/resolvers";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    vueJsx(),
    vueDevTools(),
    inspect(),
    visualizer({
      filename: "./dist/stats.html", // 生成可视化报告
      open: true, // 自动打开浏览器
      gzipSize: true, // 显示gzip后的体积
      brotliSize: true, // 显示brotli压缩后的体积
      template: "treemap", // 使用树图模板（更适合分析大文件）
      projectRoot: process.cwd()
    }),
    // 自动导入Element Plus组件
    Components({
      resolvers: [ElementPlusResolver()]
    }),
    // 自动导入Element Plus API
    AutoImport({
      resolvers: [ElementPlusResolver()]
    }),
    // Gzip 压缩
    // viteCompression({
    //   algorithm: "gzip",
    //   ext: ".gz",
    //   threshold: 10240, // 10KB 以上才压缩
    //   deleteOriginFile: false, // 保留原文件
    //   verbose: true // 输出压缩日志
    // }),
    // Brotli 压缩（比 Gzip 压缩率更高）
    viteCompression({
      algorithm: "brotliCompress",
      ext: ".br",
      threshold: 10240,
      deleteOriginFile: false,
      verbose: true
    })
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url))
    }
  },
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
        secure: false
        // rewrite: path => path.replace(/^\/api/, "")
      },
      "/uploads": {
        target: "http://localhost:3000",
        changeOrigin: true,
        secure: false
      }
    }
  },

  build: {
    cssCodeSplit: true, // CSS代码分割
    cssMinify: true, // CSS压缩
    rollupOptions: {
      output: {
        manualChunks: {
          // Vue核心
          "vue-vendor": ["vue", "vue-router", "pinia"],
          // Element Plus（最大贡献者）
          "element-plus": ["element-plus"],
          // 拖拽库
          draggable: ["vuedraggable"],
          // 图标库
          icons: ["@element-plus/icons-vue", "@fortawesome/fontawesome-svg-core"]
        }
      }
    },
    chunkSizeWarningLimit: 500, // 警告阈值
    minify: "terser", // 使用 terser 来支持移除 console
    sourcemap: false,
    // 生产环境移除 console.log 和 debugger
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true
      }
    }
  }
});
