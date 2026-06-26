/**
 * 亮暗主题 — 持久化管理 Composable
 *
 * 职责：
 *   1. 使用 useStorage 封装持久化用户的主题选择
 *   2. 首次访问时回退到系统偏好（prefers-color-scheme）
 *   3. 切换时同步更新 document.body 的 arco-theme 属性（触发 Arco 主题变量）
 *   4. 提供跨组件共享的响应式 isDark 状态（模块级单例）
 */

import { ref, computed } from "vue";
import { getStorageItem, setStorageItem } from "./useStorage";

// ─── 常量 ──────────────────────────────────────────────────────

const STORAGE_KEY = "app-theme";
const DARK_CLASS = "dark";
const LIGHT_CLASS = "light";

// ─── 模块级单例（跨组件共享）────────────────────────────────────

/** 当前是否为暗色模式 */
const isDark = ref(false);

/** 主题是否已初始化（避免 onMounted 时重复执行） */
let initialized = false;

// ─── 内部函数 ──────────────────────────────────────────────────

/** 从持久化存储读取，无记录时回退系统偏好 */
function resolveInitialTheme(): boolean {
  const stored = getStorageItem<string>(STORAGE_KEY);
  if (stored === DARK_CLASS) return true;
  if (stored === LIGHT_CLASS) return false;
  // 无记录 → 检测系统偏好
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

/** 将主题应用到 DOM */
function applyTheme(dark: boolean): void {
  if (dark) {
    document.body.setAttribute("arco-theme", "dark");
  } else {
    document.body.removeAttribute("arco-theme");
  }
}

// ─── API ───────────────────────────────────────────────────────

/**
 * 初始化主题（app 启动时调用一次）
 *
 * 从 localStorage 恢复上次选择，无记录时使用系统偏好。
 * 此函数幂等：多次调用只有第一次生效。
 */
export function initTheme(): void {
  if (initialized) return;
  initialized = true;
  isDark.value = resolveInitialTheme();
  applyTheme(isDark.value);
}

/** 切换主题 */
export function toggleTheme(): void {
  isDark.value = !isDark.value;
  applyTheme(isDark.value);
  setStorageItem(STORAGE_KEY, isDark.value ? DARK_CLASS : LIGHT_CLASS);
}

/** 显式设置为暗色/亮色 */
export function setTheme(dark: boolean): void {
  if (isDark.value === dark) return;
  isDark.value = dark;
  applyTheme(dark);
  setStorageItem(STORAGE_KEY, dark ? DARK_CLASS : LIGHT_CLASS);
}

/** 响应式主题状态（组件中通过 useTheme() 获取） */
export function useTheme() {
  // 确保首次使用时已初始化
  if (!initialized) {
    initTheme();
  }

  return {
    isDark: computed(() => isDark.value),
    toggleTheme,
    setTheme
  };
}
