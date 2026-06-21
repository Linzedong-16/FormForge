import { ref } from "vue";

// 色弱模式类型（normal 为关闭）
export type ColorBlindMode = "normal" | "protanopia" | "deuteranopia" | "tritanopia" | "achromatopsia";

const STORAGE_KEY = "color-blind-mode";
const VALID_MODES: ColorBlindMode[] = ["normal", "protanopia", "deuteranopia", "tritanopia", "achromatopsia"];

// 模块级单例状态，全局共享
const mode = ref<ColorBlindMode>("normal");

// 将当前色弱模式写到 <html data-color-blind>，由 color-blind.scss 驱动配色覆盖
function applyMode(m: ColorBlindMode) {
  document.documentElement.setAttribute("data-color-blind", m);
}

// 初始化：从本地存储恢复（模块加载时执行一次）
const saved = localStorage.getItem(STORAGE_KEY) as ColorBlindMode | null;
if (saved && VALID_MODES.includes(saved)) {
  mode.value = saved;
}
applyMode(mode.value);

// 设置色弱模式（校验合法性，持久化）
function setColorBlindMode(m: ColorBlindMode) {
  if (!VALID_MODES.includes(m)) return;
  mode.value = m;
  localStorage.setItem(STORAGE_KEY, m);
  applyMode(m);
}

export function useColorBlind() {
  return { mode, setColorBlindMode };
}
