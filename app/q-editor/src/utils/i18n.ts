// 用于在非 Vue 组件环境中获取国际化翻译的工具函数
import { i18n } from "@/i18n";

/**
 * 获取国际化翻译文本
 * @param key 翻译键，格式为 'namespace.key.subKey'
 * @returns 翻译后的文本
 */
export function t(key: string): string {
  // 使用类型断言避免 TypeScript 类型实例化过深问题
  const global = i18n.global as unknown as { t: (key: string) => string };
  return global.t(key);
}
