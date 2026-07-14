/**
 * useTheme 组合式函数单元测试
 *
 * 测试范围：
 *   1. useTheme 返回 { isDark, toggleTheme }
 *   2. isDark 是 ref<boolean>
 *   3. toggleTheme() 无参切换亮/暗
 *   4. toggleTheme(true) 设置暗色模式
 *   5. toggleTheme(false) 设置亮色模式
 *   6. localStorage 持久化
 *   7. document.documentElement.classList 同步
 *   8. 多次调用 useTheme 返回同一实例（单例）
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// 由于模块在导入时会产生副作用（读取 localStorage 并应用主题），
// 需要在 beforeEach 中先清理环境，再通过 vi.resetModules 重新导入
const STORAGE_KEY = "q-editor-theme";

describe("useTheme — 全量单元测试", () => {
  beforeEach(() => {
    // 清理 localStorage
    localStorage.removeItem(STORAGE_KEY);
    // 清理 DOM 中的 dark class
    document.documentElement.classList.remove("dark");
    // 重置模块缓存，确保每次测试从干净状态开始
    vi.resetModules();
  });

  // ════════════════════════════════════════════════════════════
  //   1. useTheme 返回 { isDark, toggleTheme }
  // ════════════════════════════════════════════════════════════
  describe("返回值结构", () => {
    it("useTheme 应返回 { isDark, toggleTheme }", async () => {
      const { useTheme } = await import("../useTheme");
      const theme = useTheme();

      expect(theme).toHaveProperty("isDark");
      expect(theme).toHaveProperty("toggleTheme");
      expect(typeof theme.toggleTheme).toBe("function");
    });
  });

  // ════════════════════════════════════════════════════════════
  //   2. isDark 是 ref<boolean>
  // ════════════════════════════════════════════════════════════
  describe("isDark 类型", () => {
    it("isDark 应为 ref，值为 boolean", async () => {
      const { useTheme } = await import("../useTheme");
      const { isDark } = useTheme();

      expect(typeof isDark.value).toBe("boolean");
    });

    it("默认值（无 localStorage）应为 false", async () => {
      const { useTheme } = await import("../useTheme");
      const { isDark } = useTheme();

      expect(isDark.value).toBe(false);
    });
  });

  // ════════════════════════════════════════════════════════════
  //   3. toggleTheme() 无参切换
  // ════════════════════════════════════════════════════════════
  describe("toggleTheme() — 无参切换", () => {
    it("从亮色切到暗色", async () => {
      const { useTheme } = await import("../useTheme");
      const { isDark, toggleTheme } = useTheme();

      expect(isDark.value).toBe(false);
      toggleTheme();
      expect(isDark.value).toBe(true);
    });

    it("从暗色切回亮色", async () => {
      const { useTheme } = await import("../useTheme");
      const { isDark, toggleTheme } = useTheme();

      // 先切到暗色
      toggleTheme();
      expect(isDark.value).toBe(true);
      // 再切回亮色
      toggleTheme();
      expect(isDark.value).toBe(false);
    });

    it("连续切换多次", async () => {
      const { useTheme } = await import("../useTheme");
      const { isDark, toggleTheme } = useTheme();

      toggleTheme(); // dark
      toggleTheme(); // light
      toggleTheme(); // dark
      expect(isDark.value).toBe(true);
    });
  });

  // ════════════════════════════════════════════════════════════
  //   4. toggleTheme(true) 设置暗色模式
  // ════════════════════════════════════════════════════════════
  describe("toggleTheme(true) — 强制暗色", () => {
    it("toggleTheme(true) 应将 isDark 设为 true", async () => {
      const { useTheme } = await import("../useTheme");
      const { isDark, toggleTheme } = useTheme();

      toggleTheme(true);
      expect(isDark.value).toBe(true);
    });

    it("已经是暗色时 toggleTheme(true) 仍保持暗色", async () => {
      const { useTheme } = await import("../useTheme");
      const { isDark, toggleTheme } = useTheme();

      toggleTheme(true);
      toggleTheme(true);
      expect(isDark.value).toBe(true);
    });
  });

  // ════════════════════════════════════════════════════════════
  //   5. toggleTheme(false) 设置亮色模式
  // ════════════════════════════════════════════════════════════
  describe("toggleTheme(false) — 强制亮色", () => {
    it("toggleTheme(false) 应将 isDark 设为 false", async () => {
      const { useTheme } = await import("../useTheme");
      const { isDark, toggleTheme } = useTheme();

      // 先设为暗色
      toggleTheme(true);
      expect(isDark.value).toBe(true);
      // 再强制亮色
      toggleTheme(false);
      expect(isDark.value).toBe(false);
    });

    it("已经是亮色时 toggleTheme(false) 仍保持亮色", async () => {
      const { useTheme } = await import("../useTheme");
      const { isDark, toggleTheme } = useTheme();

      toggleTheme(false);
      toggleTheme(false);
      expect(isDark.value).toBe(false);
    });
  });

  // ════════════════════════════════════════════════════════════
  //   6. localStorage 持久化
  // ════════════════════════════════════════════════════════════
  describe("localStorage 持久化", () => {
    it("切到暗色时应写入 'dark'", async () => {
      const { useTheme } = await import("../useTheme");
      const { toggleTheme } = useTheme();

      toggleTheme();
      expect(localStorage.getItem(STORAGE_KEY)).toBe("dark");
    });

    it("切到亮色时应写入 'light'", async () => {
      const { useTheme } = await import("../useTheme");
      const { toggleTheme } = useTheme();

      // 先切暗再切亮
      toggleTheme();
      toggleTheme();
      expect(localStorage.getItem(STORAGE_KEY)).toBe("light");
    });

    it("toggleTheme(true) 应写入 'dark'", async () => {
      const { useTheme } = await import("../useTheme");
      const { toggleTheme } = useTheme();

      toggleTheme(true);
      expect(localStorage.getItem(STORAGE_KEY)).toBe("dark");
    });

    it("toggleTheme(false) 应写入 'light'", async () => {
      const { useTheme } = await import("../useTheme");
      const { toggleTheme } = useTheme();

      toggleTheme(false);
      expect(localStorage.getItem(STORAGE_KEY)).toBe("light");
    });
  });

  // ════════════════════════════════════════════════════════════
  //   7. document.documentElement.classList 同步
  // ════════════════════════════════════════════════════════════
  describe("document.documentElement.classList", () => {
    it("暗色模式时应包含 'dark' class", async () => {
      const { useTheme } = await import("../useTheme");
      const { toggleTheme } = useTheme();

      toggleTheme(true);
      expect(document.documentElement.classList.contains("dark")).toBe(true);
    });

    it("亮色模式时应移除 'dark' class", async () => {
      const { useTheme } = await import("../useTheme");
      const { toggleTheme } = useTheme();

      // 先暗后亮
      toggleTheme(true);
      toggleTheme(false);
      expect(document.documentElement.classList.contains("dark")).toBe(false);
    });

    it("toggleTheme() 无参切换时 class 同步变化", async () => {
      const { useTheme } = await import("../useTheme");
      const { toggleTheme } = useTheme();

      toggleTheme(); // dark
      expect(document.documentElement.classList.contains("dark")).toBe(true);
      toggleTheme(); // light
      expect(document.documentElement.classList.contains("dark")).toBe(false);
    });
  });

  // ════════════════════════════════════════════════════════════
  //   8. 单例模式
  // ════════════════════════════════════════════════════════════
  describe("单例模式", () => {
    it("多次调用 useTheme 应返回同一个 isDark ref", async () => {
      const { useTheme } = await import("../useTheme");
      const theme1 = useTheme();
      const theme2 = useTheme();

      expect(theme1.isDark).toBe(theme2.isDark);
    });

    it("多次调用 useTheme 应返回同一个 toggleTheme 函数", async () => {
      const { useTheme } = await import("../useTheme");
      const theme1 = useTheme();
      const theme2 = useTheme();

      expect(theme1.toggleTheme).toBe(theme2.toggleTheme);
    });

    it("通过一个实例切换主题，另一个实例应同步感知", async () => {
      const { useTheme } = await import("../useTheme");
      const theme1 = useTheme();
      const theme2 = useTheme();

      theme1.toggleTheme(true);
      expect(theme2.isDark.value).toBe(true);

      theme1.toggleTheme(false);
      expect(theme2.isDark.value).toBe(false);
    });
  });
});