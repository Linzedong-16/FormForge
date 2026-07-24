/**
 * 独立部署 Mock 注入入口
 *
 * 在 standalone 构建模式下，通过 axios 请求拦截器将
 * 所有 /api/* 请求的 adapter 替换为 mock 适配器，
 * 实现纯客户端的 Mock API 服务。
 *
 * 调用时机：main.ts 中 render() 函数，Vue 应用初始化前。
 *
 * ⚠ 此模块仅在 import.meta.env.MODE === 'standalone' 时被动态加载，
 *   不会增加正常模式下的 bundle 体积。
 */
import type { AxiosInstance } from "axios";
import { standaloneMockAdapter } from "./adapter";
import { log } from "./data";

/**
 * 为指定的 axios 实例注入 standalone mock 适配器
 *
 * 实现原理：
 *   通过请求拦截器在 config 上设置 adapter 字段，
 *   axios 会优先使用 config.adapter 而非实例默认的 HTTP adapter。
 *   这样不需要修改 axios 实例的创建代码，完全无侵入。
 */
function injectMockAdapter(instance: AxiosInstance, name: string) {
  instance.interceptors.request.use(config => {
    // 拼接 baseURL + url 得到完整的请求路径
    // axios 的 baseURL 会在 dispatch 阶段自动拼接，但拦截器阶段需要手动处理
    const fullUrl = (config.baseURL ?? "") + (config.url ?? "");
    if (fullUrl.startsWith("/api")) {
      config.adapter = standaloneMockAdapter;
    }
    return config;
  });

  log(`${name} 已注入 standalone mock 适配器`);
}

/**
 * 初始化 Standalone Mock 系统
 *
 * 需要在此模块被导入时立即调用（side-effect），
 * 因为 authClient 和 serverClient 模块在应用启动前已被其他模块引用。
 *
 * 通过拦截器方式注入的好处：
 *   1. 不需要修改 auth.ts / server.ts 的代码
 *   2. mock 数据拦截在每个请求级别生效
 *   3. 非 /api/* 请求不受影响（如静态资源 CDN 加载）
 */
export async function setupStandaloneMock(): Promise<void> {
  console.log(
    "%c[Standalone Mock] %c🎯 静态演示模式已激活 — 所有 API 请求将使用本地 Mock 数据",
    "color:#f59e0b;font-weight:bold;font-size:14px",
    "color:inherit"
  );

  // 动态导入 axios 实例，确保在模块初始化后注入
  const [authModule, serverModule] = await Promise.all([
    import("../api/clients/auth"),
    import("../api/clients/server")
  ]);

  injectMockAdapter(authModule.default, "authClient");
  injectMockAdapter(serverModule.default, "serverClient");

  log("Standalone Mock 系统初始化完成 ✅");
}
