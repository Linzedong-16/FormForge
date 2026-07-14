/**
 * useColorBlind 组合式函数单元测试
 *
 * 测试范围：
 *   1. useColorBlind 返回 { mode, setColorBlindMode }
 *   2. mode 默认值为 "normal"
 *   3. setColorBlindMode("protanopia") 设置模式并更新 localStorage
 *   4. setColorBlindMode("deuteranopia") 设置模式
 *   5. setColorBlindMode("tritanopia") 设置模式
 *   6. setColorBlindMode("achromatopsia") 设置模式
 *   7. setColorBlindMode 无效值不做任何变更
 *   8. document.documentElement 属性同步
 *   9. 多次调用返回同一实例（单例）
 *  10. setColorBlindMode("normal") 重置回正常模式
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const STORAGE_KEY = "color-blind-mode";

describe("useColorBlind — 全量单元测试", () => {
  beforeEach(() => {
    // 清理 localStorage
    localStorage.removeItem(STORAGE_KEY);
    // 清理 DOM 中的 data-color-blind 属性
    document.documentElement.removeAttribute("data-color-blind");
    // 重置模块缓存，确保每次测试从干净状态开始
    vi.resetModules();
  });

  // ════════════════════════════════════════════════════════════
  //   1. useColorBlind 返回 { mode, setColorBlindMode }
  // ════════════════════════════════════════════════════════════
  describe("返回值结构", () => {
    it("useColorBlind 应返回 { mode, setColorBlindMode }", async () => {
      const { useColorBlind } = await import("../useColorBlind");
      const cb = useColorBlind();

      expect(cb).toHaveProperty("mode");
      expect(cb).toHaveProperty("setColorBlindMode");
      expect(typeof cb.setColorBlindMode).toBe("function");
    });
  });

  // ════════════════════════════════════════════════════════════
  //   2. mode 默认值为 "normal"
  // ════════════════════════════════════════════════════════════
  describe("mode 默认值", () => {
    it("默认值应为 'normal'", async () => {
      const { useColorBlind } = await import("../useColorBlind");
      const { mode } = useColorBlind();

      expect(mode.value).toBe("normal");
    });
  });

  // ════════════════════════════════════════════════════════════
  //   3. setColorBlindMode("protanopia")
  // ════════════════════════════════════════════════════════════
  describe("setColorBlindMode — 有效模式", () => {
    it("setColorBlindMode('protanopia') 应设置 mode 并更新 localStorage", async () => {
      const { useColorBlind } = await import("../useColorBlind");
      const { mode, setColorBlindMode } = useColorBlind();

      setColorBlindMode("protanopia");
      expect(mode.value).toBe("protanopia");
      expect(localStorage.getItem(STORAGE_KEY)).toBe("protanopia");
    });

    // ════════════════════════════════════════════════════════════
    //   4. setColorBlindMode("deuteranopia")
    // ════════════════════════════════════════════════════════════
    it("setColorBlindMode('deuteranopia') 应设置 mode", async () => {
      const { useColorBlind } = await import("../useColorBlind");
      const { mode, setColorBlindMode } = useColorBlind();

      setColorBlindMode("deuteranopia");
      expect(mode.value).toBe("deuteranopia");
      expect(localStorage.getItem(STORAGE_KEY)).toBe("deuteranopia");
    });

    // ════════════════════════════════════════════════════════════
    //   5. setColorBlindMode("tritanopia")
    // ════════════════════════════════════════════════════════════
    it("setColorBlindMode('tritanopia') 应设置 mode", async () => {
      const { useColorBlind } = await import("../useColorBlind");
      const { mode, setColorBlindMode } = useColorBlind();

      setColorBlindMode("tritanopia");
      expect(mode.value).toBe("tritanopia");
      expect(localStorage.getItem(STORAGE_KEY)).toBe("tritanopia");
    });

    // ════════════════════════════════════════════════════════════
    //   6. setColorBlindMode("achromatopsia")
    // ════════════════════════════════════════════════════════════
    it("setColorBlindMode('achromatopsia') 应设置 mode", async () => {
      const { useColorBlind } = await import("../useColorBlind");
      const { mode, setColorBlindMode } = useColorBlind();

      setColorBlindMode("achromatopsia");
      expect(mode.value).toBe("achromatopsia");
      expect(localStorage.getItem(STORAGE_KEY)).toBe("achromatopsia");
    });
  });

  // ════════════════════════════════════════════════════════════
  //   7. setColorBlindMode 无效值不做任何变更
  // ════════════════════════════════════════════════════════════
  describe("setColorBlindMode — 无效值", () => {
    it("无效值应不改变 mode", async () => {
      const { useColorBlind } = await import("../useColorBlind");
      const { mode, setColorBlindMode } = useColorBlind();

      const originalMode = mode.value;
      setColorBlindMode("invalid-mode" as any);
      expect(mode.value).toBe(originalMode);
    });

    it("无效值应不修改 localStorage", async () => {
      const { useColorBlind } = await import("../useColorBlind");
      const { setColorBlindMode } = useColorBlind();

      // 先设置一个有效值
      setColorBlindMode("protanopia");
      expect(localStorage.getItem(STORAGE_KEY)).toBe("protanopia");

      // 再设置无效值，localStorage 应保持不变
      setColorBlindMode("not-a-real-mode" as any);
      expect(localStorage.getItem(STORAGE_KEY)).toBe("protanopia");
    });

    it("空字符串应被视为无效", async () => {
      const { useColorBlind } = await import("../useColorBlind");
      const { mode, setColorBlindMode } = useColorBlind();

      setColorBlindMode("" as any);
      expect(mode.value).toBe("normal");
    });
  });

  // ════════════════════════════════════════════════════════════
  //   8. document.documentElement 属性同步
  // ════════════════════════════════════════════════════════════
  describe("document.documentElement 属性", () => {
    it("导入后默认应设置 data-color-blind='normal'", async () => {
      const { useColorBlind } = await import("../useColorBlind");
      // 使用 useColorBlind 触发模块加载
      useColorBlind();

      expect(document.documentElement.getAttribute("data-color-blind")).toBe("normal");
    });

    it("setColorBlindMode('protanopia') 应设置 data-color-blind='protanopia'", async () => {
      const { useColorBlind } = await import("../useColorBlind");
      const { setColorBlindMode } = useColorBlind();

      setColorBlindMode("protanopia");
      expect(document.documentElement.getAttribute("data-color-blind")).toBe("protanopia");
    });

    it("setColorBlindMode('deuteranopia') 应设置 data-color-blind='deuteranopia'", async () => {
      const { useColorBlind } = await import("../useColorBlind");
      const { setColorBlindMode } = useColorBlind();

      setColorBlindMode("deuteranopia");
      expect(document.documentElement.getAttribute("data-color-blind")).toBe("deuteranopia");
    });

    it("setColorBlindMode('tritanopia') 应设置 data-color-blind='tritanopia'", async () => {
      const { useColorBlind } = await import("../useColorBlind");
      const { setColorBlindMode } = useColorBlind();

      setColorBlindMode("tritanopia");
      expect(document.documentElement.getAttribute("data-color-blind")).toBe("tritanopia");
    });

    it("setColorBlindMode('achromatopsia') 应设置 data-color-blind='achromatopsia'", async () => {
      const { useColorBlind } = await import("../useColorBlind");
      const { setColorBlindMode } = useColorBlind();

      setColorBlindMode("achromatopsia");
      expect(document.documentElement.getAttribute("data-color-blind")).toBe("achromatopsia");
    });

    it("多次切换模式时属性应正确更新", async () => {
      const { useColorBlind } = await import("../useColorBlind");
      const { setColorBlindMode } = useColorBlind();

      setColorBlindMode("protanopia");
      expect(document.documentElement.getAttribute("data-color-blind")).toBe("protanopia");

      setColorBlindMode("deuteranopia");
      expect(document.documentElement.getAttribute("data-color-blind")).toBe("deuteranopia");
    });
  });

  // ════════════════════════════════════════════════════════════
  //   9. 单例模式
  // ════════════════════════════════════════════════════════════
  describe("单例模式", () => {
    it("多次调用 useColorBlind 应返回同一个 mode ref", async () => {
      const { useColorBlind } = await import("../useColorBlind");
      const cb1 = useColorBlind();
      const cb2 = useColorBlind();

      expect(cb1.mode).toBe(cb2.mode);
    });

    it("多次调用 useColorBlind 应返回同一个 setColorBlindMode 函数", async () => {
      const { useColorBlind } = await import("../useColorBlind");
      const cb1 = useColorBlind();
      const cb2 = useColorBlind();

      expect(cb1.setColorBlindMode).toBe(cb2.setColorBlindMode);
    });

    it("通过一个实例设置模式，另一个实例应同步感知", async () => {
      const { useColorBlind } = await import("../useColorBlind");
      const cb1 = useColorBlind();
      const cb2 = useColorBlind();

      cb1.setColorBlindMode("protanopia");
      expect(cb2.mode.value).toBe("protanopia");

      cb1.setColorBlindMode("tritanopia");
      expect(cb2.mode.value).toBe("tritanopia");
    });
  });

  // ════════════════════════════════════════════════════════════
  //  10. setColorBlindMode("normal") 重置回正常模式
  // ════════════════════════════════════════════════════════════
  describe("重置回 normal", () => {
    it("从其他模式切回 normal 应正确更新 mode", async () => {
      const { useColorBlind } = await import("../useColorBlind");
      const { mode, setColorBlindMode } = useColorBlind();

      setColorBlindMode("protanopia");
      expect(mode.value).toBe("protanopia");

      setColorBlindMode("normal");
      expect(mode.value).toBe("normal");
    });

    it("切回 normal 应更新 localStorage", async () => {
      const { useColorBlind } = await import("../useColorBlind");
      const { setColorBlindMode } = useColorBlind();

      setColorBlindMode("protanopia");
      setColorBlindMode("normal");
      expect(localStorage.getItem(STORAGE_KEY)).toBe("normal");
    });

    it("切回 normal 应更新 data-color-blind 属性", async () => {
      const { useColorBlind } = await import("../useColorBlind");
      const { setColorBlindMode } = useColorBlind();

      setColorBlindMode("protanopia");
      setColorBlindMode("normal");
      expect(document.documentElement.getAttribute("data-color-blind")).toBe("normal");
    });
  });
});