import { fileURLToPath, URL } from "node:url";
import { visualizer } from "rollup-plugin-visualizer";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import vueJsx from "@vitejs/plugin-vue-jsx";
import viteCompression from "vite-plugin-compression";
import { viteMockServe } from "vite-plugin-mock";
import qiankun from "vite-plugin-qiankun";
import istanbul from "vite-plugin-istanbul";

import AutoImport from "unplugin-auto-import/vite";
import Components from "unplugin-vue-components/vite";
import { ElementPlusResolver } from "unplugin-vue-components/resolvers";
import VueI18nPlugin from "@intlify/unplugin-vue-i18n/vite";

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  // Mock 开关：使用 --mode mock 时自动启用，无需依赖 .env 文件
  const mockEnabled = mode === "mock";
  // 独立部署模式：使用 --mode standalone 时启用，跳过 qiankun 子应用适配插件
  const standalone = mode === "standalone";

  return {
    plugins: [
      vue(),
      vueJsx(),
      // qiankun 子应用适配插件：
      //   - useDevMode: 开发模式下注入生命周期桥接脚本（IIFE），
      //     解决 qiankun eval() 无法处理 Vite ES Module 的根本兼容问题
      //   - 同时标记 @vite/client 等内部脚本为 ignore，避免 eval 报错
      //   - standalone 模式（独立部署演示）暂不接入 qiankun，跳过该插件注册
      ...(standalone ? [] : [qiankun("q-editor", { useDevMode: command === "serve" })]),
      visualizer({
        filename: "./dist/stats.html", // 生成可视化报告
        open: !process.env.CI, // 自动打开浏览器（CI 环境无 GUI，跳过以避免挂起/报错）
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
      // Vue I18n：保留运行时编译器，使 JS 对象 messages 可直接编译使用
      VueI18nPlugin({
        runtimeOnly: false
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
      }),

      // Mock 插件 — 开发/构建时均可使用，由 VITE_MOCK 环境变量控制
      viteMockServe({
        mockPath: "./src/mock",
        enable: command === "serve" && mockEnabled,
        watchFiles: mockEnabled,
        logger: true
      }),

      // Istanbul 覆盖率插桩 — 仅在 E2E 测试模式（mock）下启用
      ...(mockEnabled
        ? [
            istanbul({
              include: "src/**/*",
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
                "src/public-path.ts"
              ],
              extension: [".js", ".ts", ".vue"],
              requireEnv: false,
              forceBuildInstrument: false,
              cypress: false
            })
          ]
        : [])
    ],
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
        // 引用 monorepo 共享类型包
        "@common": fileURLToPath(new URL("../../packages/common/src", import.meta.url))
      }
    },
    // 依赖预打包扫描仅以真正的应用入口为起点，避免 Vite 默认爬取项目内
    // 所有 html 文件（如 monocart-report/、e2e/playwright-report/ 等测试报告产物）
    optimizeDeps: {
      entries: ["index.html"]
    },
    server: {
      port: 5173, // 固定端口，与主应用 entry: '//localhost:5173' 对应
      cors: true, // 允许主应用（localhost:8000）跨域加载此子应用
      fs: {
        // 允许 Vite dev server 访问 monorepo 根目录下的共享包
        allow: ["../..", "../../packages"]
      },
      proxy: {
        // AI 问卷生成/润色 SSE 端点 — 需要长连接，超时 90s
        "/api/surveys/generate": {
          target: "http://localhost:8080",
          changeOrigin: true,
          secure: false,
          timeout: 90_000
        },
        "/api/surveys/polish": {
          target: "http://localhost:8080",
          changeOrigin: true,
          secure: false,
          timeout: 90_000
        },
        "/api": {
          target: "http://localhost:8080",
          changeOrigin: true,
          secure: false,
          // 代理超时 — 防止后端无响应时 Vite proxy 永久挂起
          timeout: 20000, // 20s
          // Mock 模式 → 不转发到后端（由 vite-plugin-mock 拦截）
          bypass(req) {
            if (mockEnabled) return req.url;
          }
        },
        "/uploads": {
          target: "http://localhost:8080",
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
          // 压缩 Rollup 自身生成的包装/桥接代码（不影响业务代码的 terser 压缩）
          compact: true,
          manualChunks: {
            // Vue核心
            "vue-vendor": ["vue", "vue-router", "pinia"],
            // Element Plus（最大贡献者）
            "element-plus": ["element-plus"],
            // 拖拽库
            draggable: ["vuedraggable"],
            // 图标库
            icons: ["@element-plus/icons-vue", "@fortawesome/fontawesome-svg-core"]
          },
          // 产物按类型分目录，便于 Nginx/CDN 针对不同资源类型设置差异化缓存策略
          entryFileNames: "assets/js/[name]-[hash].js",
          chunkFileNames: "assets/js/[name]-[hash].js",
          assetFileNames: assetInfo => {
            const fileName = assetInfo.names[0];
            if (fileName?.endsWith(".css")) {
              return "assets/css/[name]-[hash][extname]";
            }
            return `assets/${fileName?.split(".").pop()}/[name]-[hash][extname]`;
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
  };
});
