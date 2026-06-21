import { createI18n } from "vue-i18n";
import type { App } from "vue";

// 支持的语言列表
export const SUPPORT_LOCALES = ["zh-CN", "en-US", "ja-JP"] as const;
export type SupportLocale = (typeof SUPPORT_LOCALES)[number];

// 动态聚合各语言、各命名空间的翻译文件（src/i18n/{locale}/{namespace}.ts）
const loadLocaleMessages = () => {
  // 仅匹配二级路径（语言目录/命名空间文件），不含本入口 index.ts
  // import.meta.glob 为 Vite 专有 API，在独立包中需通过类型断言消除 TS 报错
  type GlobImport = (
    pattern: string,
    opts?: { eager?: boolean }
  ) => Record<string, { default: Record<string, unknown> }>;
  const glob = (import.meta as unknown as { glob: GlobImport }).glob;
  const modules = glob("./*/*.ts", { eager: true });
  const messages: Record<string, Record<string, unknown>> = {};

  for (const path in modules) {
    const parts = path.split("/"); // ['.', 'zh-CN', 'common.ts']
    const locale = parts[1];
    if (!locale) continue;
    const namespace = parts[2]?.replace(/\.ts$/, "") ?? "common";
    const mod = modules[path] as { default: Record<string, unknown> };
    (messages[locale] ??= {})[namespace] = mod.default;
  }

  return messages;
};

// 读取本地存储的语言偏好，非法则回退默认中文
const savedLocale = localStorage.getItem("locale");
const defaultLocale: SupportLocale =
  savedLocale && (SUPPORT_LOCALES as readonly string[]).includes(savedLocale)
    ? (savedLocale as SupportLocale)
    : "zh-CN";

export const i18n = createI18n({
  legacy: false, // Composition API 模式
  locale: defaultLocale,
  fallbackLocale: "en-US",
  messages: loadLocaleMessages() as Parameters<typeof createI18n>[0]["messages"]
});

// 安装到应用
export const setupI18n = (app: App) => {
  app.use(i18n);
};

// 切换语言并持久化（校验合法性，防止非法值）
export const setLocale = (locale: SupportLocale) => {
  if (!(SUPPORT_LOCALES as readonly string[]).includes(locale)) return;
  // legacy:false 下 global.locale 为 WritableComputedRef
  (i18n.global.locale as unknown as { value: string }).value = locale;
  localStorage.setItem("locale", locale);
  document.documentElement.setAttribute("lang", locale);
};

// 初始化 <html lang>
document.documentElement.setAttribute("lang", defaultLocale);
