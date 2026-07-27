/**
 * 浏览器指纹采集工具单元测试
 *
 * 测试范围：
 *   1. getFingerprint 成功采集
 *   2. getFingerprint 降级策略
 *   3. getFallbackFingerprint
 *   4. 环境检测
 *   5. Canvas/WebGL 指纹采集
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock crypto.subtle.digest
const mockDigest = vi.fn();

beforeEach(() => {
  // 模拟 crypto.subtle.digest
  const mockBuffer = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32]);
  mockDigest.mockResolvedValue(mockBuffer.buffer);

  vi.stubGlobal("crypto", {
    subtle: {
      digest: mockDigest
    }
  });

  // 模拟 Canvas
  const mockCtx = {
    textBaseline: "",
    font: "",
    fillStyle: "",
    fillRect: vi.fn(),
    fillText: vi.fn(),
    measureText: vi.fn().mockReturnValue({ width: 100 })
  };

  const mockCanvas = {
    width: 0,
    height: 0,
    getContext: vi.fn().mockReturnValue(mockCtx),
    toDataURL: vi.fn().mockReturnValue("data:image/png;base64,mockCanvasData")
  };

  vi.stubGlobal("HTMLCanvasElement", class {
    getContext = vi.fn().mockReturnValue(mockCtx);
    toDataURL = vi.fn().mockReturnValue("data:image/png;base64,mockCanvasData");
  });

  vi.stubGlobal("document", {
    createElement: vi.fn().mockReturnValue(mockCanvas)
  });

  // 模拟 navigator
  vi.stubGlobal("navigator", {
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
    platform: "Win32",
    language: "zh-CN",
    hardwareConcurrency: 8,
    maxTouchPoints: 0,
    plugins: []
  });

  // 模拟 screen
  vi.stubGlobal("screen", {
    width: 1920,
    height: 1080,
    colorDepth: 24
  });

  // 模拟 Intl
  vi.stubGlobal("Intl", {
    DateTimeFormat: vi.fn().mockReturnValue({
      resolvedOptions: vi.fn().mockReturnValue({ timeZone: "Asia/Shanghai" })
    })
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getFingerprint", () => {
  it("应成功采集指纹并返回哈希", async () => {
    const { getFingerprint } = await import("../fingerprint");
    const result = await getFingerprint();
    expect(result.success).toBe(true);
    expect(result.hash).toBeTruthy();
    expect(result.hash.length).toBe(64); // SHA-256 = 64 hex chars
    expect(result.env).toBeDefined();
  });

  it("应返回 sha256 哈希", async () => {
    const { getFingerprint } = await import("../fingerprint");
    const result = await getFingerprint();
    expect(result.hash).toBeTruthy();
    expect(typeof result.hash).toBe("string");
    expect(result.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("应检测环境类型", async () => {
    const { getFingerprint } = await import("../fingerprint");
    const result = await getFingerprint();
    expect(["desktop", "mobile", "ios-webview", "android-webview"]).toContain(result.env);
  });
});

describe("getFallbackFingerprint", () => {
  it("应返回降级指纹", async () => {
    const { getFallbackFingerprint } = await import("../fingerprint");
    const result = await getFallbackFingerprint();
    expect(result.success).toBe(true);
    expect(result.hash).toBeTruthy();
    expect(result.degradeReason).toBe("fallback");
  });
});

describe("Canvas 指纹采集失败降级", () => {
  it("Canvas 不可用时应仍能返回指纹", async () => {
    // 模拟 Canvas getContext 返回 null
    vi.stubGlobal("document", {
      createElement: vi.fn().mockReturnValue({
        width: 0,
        height: 0,
        getContext: vi.fn().mockReturnValue(null),
        toDataURL: vi.fn().mockReturnValue("data:image/png;base64,mockCanvasData")
      })
    });

    const { getFingerprint } = await import("../fingerprint");
    const result = await getFingerprint();
    expect(result.success).toBe(true);
    expect(result.hash).toBeTruthy();
  });
});

describe("WebGL 不可用时的降级", () => {
  it("WebGL 不可用时仍应返回有效指纹", async () => {
    // 模拟 WebGL 不可用
    const mockCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn().mockReturnValue(null),
      toDataURL: vi.fn().mockReturnValue("data:image/png;base64,mockCanvasData")
    };

    vi.stubGlobal("document", {
      createElement: vi.fn().mockReturnValue(mockCanvas)
    });

    const { getFingerprint } = await import("../fingerprint");
    const result = await getFingerprint();
    expect(result.success).toBe(true);
  });
});

describe("环境检测", () => {
  it("桌面端应返回 desktop", async () => {
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
      platform: "Win32",
      language: "zh-CN",
      hardwareConcurrency: 8,
      maxTouchPoints: 0,
      plugins: []
    });

    const { getFingerprint } = await import("../fingerprint");
    const result = await getFingerprint();
    expect(result.env).toBe("desktop");
  });

  it("移动端应返回 mobile", async () => {
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
      platform: "iPhone",
      language: "zh-CN",
      hardwareConcurrency: 6,
      maxTouchPoints: 5,
      plugins: []
    });

    const { getFingerprint } = await import("../fingerprint");
    const result = await getFingerprint();
    expect(["mobile", "ios-webview"]).toContain(result.env);
  });
});

describe("指纹一致性", () => {
  it("相同输入应产生相同指纹", async () => {
    const { getFingerprint } = await import("../fingerprint");
    const result1 = await getFingerprint();
    const result2 = await getFingerprint();
    expect(result1.hash).toBe(result2.hash);
  });
});