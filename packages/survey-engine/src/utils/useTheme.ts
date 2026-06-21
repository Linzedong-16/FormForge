import { ref } from "vue";

// 亮暗主题切换（shadcn 风格）——通过给 <html> 添加/移除 .dark 类驱动 CSS 变量体系
const STORAGE_KEY = "q-editor-theme";

// 模块级单例状态，确保全局共享同一份主题状态
const isDark = ref(false);

// 将当前主题应用到 <html>（.dark 类驱动 theme-dark.scss 中的变量覆盖）
function applyTheme(dark: boolean) {
  const root = document.documentElement;
  if (dark) {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
}

// 初始化：读取本地存储的主题偏好并应用（模块加载时执行一次，刷新后保持）
const saved = localStorage.getItem(STORAGE_KEY);
isDark.value = saved === "dark";
applyTheme(isDark.value);

// 切换主题；传入布尔值则直接设置，否则取反
function toggleTheme(val?: boolean) {
  isDark.value = typeof val === "boolean" ? val : !isDark.value;
  localStorage.setItem(STORAGE_KEY, isDark.value ? "dark" : "light");
  applyTheme(isDark.value);
}

export function useTheme() {
  return { isDark, toggleTheme };
}
