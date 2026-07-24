import { fileURLToPath, URL } from "node:url";
// 打包体积分析插件：默认注释掉，避免每次构建都自动打开 stats.html 分析页面
// import { visualizer } from "rollup-plugin-visualizer";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import vueJsx from "@vitejs/plugin-vue-jsx";
import viteCompression from "vite-plugin-compression";
import { viteMockServe } from "vite-plugin-mock";
import qiankun from "vite-plugin-qiankun";
import istanbul from "vite-plugin-istanbul";
import legacy from "@vitejs/plugin-legacy";

import AutoImport from "unplugin-auto-import/vite";
import Components from "unplugin-vue-components/vite";
import { ElementPlusResolver } from "unplugin-vue-components/resolvers";
import VueI18nPlugin from "@intlify/unplugin-vue-i18n/vite";

/**
 * 从 Rollup 模块 id 中提取真实的 npm 包名，用于 manualChunks 动态分组
 *
 * pnpm 的依赖结构是 node_modules/.pnpm/<pkg>@<version>/node_modules/<pkg>/...，
 * 必须取"最后一个" node_modules 之后的路径段才是真实包名，否则会被 .pnpm 中间层污染
 */
function getPackageName(id: string): string | null {
  const normalized = id.replace(/\\/g, "/");
  const idx = normalized.lastIndexOf("/node_modules/");
  if (idx === -1) return null;
  const segments = normalized.slice(idx + "/node_modules/".length).split("/");
  return segments[0].startsWith("@") ? `${segments[0]}/${segments[1]}` : segments[0];
}

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  // Mock 开关：使用 --mode mock 时自动启用，无需依赖 .env 文件
  const mockEnabled = mode === "mock";
  // 独立部署模式：使用 --mode standalone 时启用，跳过 qiankun 子应用适配插件
  const standalone = mode === "standalone";

  return {
    // 独立部署模式：设置 base 为 GitHub Pages 子路径
    // 支持通过 VITE_BASE 环境变量覆盖（workflow_dispatch 手动触发时可自定义子路径），未设置时使用默认值
    base: process.env.VITE_BASE ?? (standalone ? "/q-editor/" : "/"),
    plugins: [
      vue(),
      vueJsx(),
      // qiankun 子应用适配插件：
      //   - useDevMode: 开发模式下注入生命周期桥接脚本（IIFE），
      //     解决 qiankun eval() 无法处理 Vite ES Module 的根本兼容问题
      //   - 同时标记 @vite/client 等内部脚本为 ignore，避免 eval 报错
      //   - standalone 模式（独立部署演示）暂不接入 qiankun，跳过该插件注册
      ...(standalone ? [] : [qiankun("q-editor", { useDevMode: command === "serve" })]),
      // 传统浏览器兼容：仅覆盖 EdgeHTML 内核旧版 Edge（12-18），显式排除 IE11——
      // Vue 3 响应式系统基于 ES6 Proxy 重写，Proxy 无法 polyfill，IE11 下 Vue 3 本身就无法运行，
      // 该插件解决不了这个问题，故目标浏览器范围里必须不含 IE11
      legacy({
        targets: ["Edge 12-18", "not IE 11"],
        // 仅在生产构建时生效，dev server 走原生 ESM 不受影响
        renderLegacyChunks: true,
        modernPolyfills: false
      }),
      // 打包体积分析：默认注释掉，避免每次构建自动打开 stats.html 分析页面；
      // 需要分析体积时手动取消注释并同时打开上方 import
      // visualizer({
      //   filename: "./dist/stats.html", // 生成可视化报告
      //   open: !process.env.CI, // 自动打开浏览器（CI 环境无 GUI，跳过以避免挂起/报错）
      //   gzipSize: true, // 显示gzip后的体积
      //   brotliSize: true, // 显示brotli压缩后的体积
      //   template: "treemap", // 使用树图模板（更适合分析大文件）
      //   projectRoot: process.cwd()
      // }),
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

      // Mock 插件 — 仅在 dev + mock 模式下启用
      // standalone 模式使用独立的客户端 axios 适配器 Mock，不需要此插件
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
          // 函数式动态分包：按真实包名兜底覆盖所有 node_modules 依赖，
          // 避免像对象白名单那样，只命中列出的几个库、其余全部落入主入口 chunk
          manualChunks(id, { getModuleInfo }) {
            const pkgName = getPackageName(id);
            // pinia 通过 @vue/devtools-api -> @vue/devtools-kit 间接依赖 birpc/hookable/perfect-debounce，
            // 且 vue 包装包本身依赖 @vue/runtime-dom、@vue/compiler-dom、@vue/shared 等 @vue/* 子包——
            // 这条链路上的任何一环若落入 vendor 兜底，都会与 vendor 中直接引用 vue 的第三方包
            // （@vueuse/*、vuedraggable、monorepo 内共享组件包等）形成 vendor <-> vue-vendor 循环 chunk
            const isVueEcosystem = (p: string | null) =>
              !!p &&
              (p.startsWith("@vue/") ||
                [
                  "vue",
                  "vue-router",
                  "pinia",
                  "pinia-plugin-persistedstate",
                  "vue-demi",
                  "birpc",
                  "hookable",
                  "perfect-debounce"
                ].includes(p));
            // 按包名将模块归类到具体分组，与下方分组规则保持一致；
            // 仅接收"真实包名"，不处理 !pkgName 的虚拟模块（由调用方单独处理，避免递归）
            const classify = (p: string | null): string | undefined => {
              if (!p) return undefined;
              if (isVueEcosystem(p)) return "vue-vendor";
              if (p === "element-plus" || p === "@element-plus/icons-vue") return "element-plus";
              if (p.startsWith("@fortawesome/")) return "icons";
              if (p === "vue-i18n" || p.startsWith("@intlify/")) return "i18n";
              return "vendor";
            };
            // 非 node_modules 的业务代码交给 Rollup 默认策略——
            // 路由已按需懒加载（见 router/index.ts 的 () => import(...)），
            // 各页面/组件天然拆分为独立异步 chunk，无需手动干预
            if (!pkgName) {
              // Rollup 为 CJS 互操作合成的共享辅助模块（如 getAugmentedNamespace）没有真实包名——
              // 这类模块会被多个分组同时依赖（例如 vue 自身的 CJS 包装需要它包装 @vue/compiler-dom 等子包，
              // vuedraggable 的 CJS 包装也需要它包装 sortablejs），Rollup 只会实例化一份，
              // 若被兜底放进 vendor，就会与本就存在的 vendor -> vue-vendor 依赖边组成循环 chunk。
              // 因此按其调用方所属分组就近归组：只要有调用方属于 vue-vendor，就归入 vue-vendor，
              // 使 vendor 侧对该辅助模块的引用退化为单向的 vendor -> vue-vendor，消除循环
              const importerGroups = new Set(
                (getModuleInfo(id)?.importers ?? [])
                  .map(importerId => classify(getPackageName(importerId)))
                  .filter((g): g is string => !!g)
              );
              if (importerGroups.has("vue-vendor")) return "vue-vendor";
              if (importerGroups.size === 1) return [...importerGroups][0];
              return undefined;
            }

            // Element Plus 体积最大的单一依赖，单独成块
            // Font Awesome 图标库
            // 拖拽库：不单独成块——vuedraggable 的间接依赖会被兜底规则分进 vendor，
            // 若继续单独分组会与 vendor/vue-vendor 形成循环 chunk（Rollup Circular chunk 警告），
            // 循环 chunk 会导致浏览器执行顺序不确定，命中变量 TDZ 报 ReferenceError，直接归入 vendor 兜底
            // i18n 运行时
            // 兜底：其余第三方依赖（axios/dexie/qrcode/uuid/mitt/web-vitals 等）
            // 统一归入 vendor，避免漏网之鱼继续堆进主入口 chunk
            return classify(pkgName);
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
