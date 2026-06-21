import { createI18n } from "vue-i18n";
import type { App } from "vue";

// 支持的语言列表
export const SUPPORT_LOCALES = ["zh-CN", "en-US", "ja-JP"] as const;
export type SupportLocale = (typeof SUPPORT_LOCALES)[number];

// ── 各语言/命名空间翻译文件（静态 import，替代 import.meta.glob） ────────
import zhCommon from "./zh-CN/common";
import zhComponents from "./zh-CN/components";
import zhEditor from "./zh-CN/editor";
import zhMaterials from "./zh-CN/materials";
import zhPreview from "./zh-CN/preview";

import enCommon from "./en-US/common";
import enComponents from "./en-US/components";
import enEditor from "./en-US/editor";
import enMaterials from "./en-US/materials";
import enPreview from "./en-US/preview";

import jaCommon from "./ja-JP/common";
import jaComponents from "./ja-JP/components";
import jaEditor from "./ja-JP/editor";
import jaMaterials from "./ja-JP/materials";
import jaPreview from "./ja-JP/preview";

const messages: Record<string, Record<string, unknown>> = {
  "zh-CN": { common: zhCommon, components: zhComponents, editor: zhEditor, materials: zhMaterials, preview: zhPreview },
  "en-US": { common: enCommon, components: enComponents, editor: enEditor, materials: enMaterials, preview: enPreview },
  "ja-JP": { common: jaCommon, components: jaComponents, editor: jaEditor, materials: jaMaterials, preview: jaPreview }
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
  messages: messages as Parameters<typeof createI18n>[0]["messages"]
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
