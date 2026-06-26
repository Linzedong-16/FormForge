/**
 * 浏览器指纹采集工具
 *
 * 职责：
 *   - 采集多维浏览器指纹信息（Canvas、WebGL、UA、屏幕信息等）
 *   - 对指纹进行 SHA-256 哈希后传输（保护隐私）
 *   - 多环境兼容（桌面浏览器、移动浏览器、WebView）
 *   - 指纹采集失败时提供降级策略
 *
 * 安全设计：
 *   - 前端先 SHA-256 哈希，再发给服务端
 *   - 服务端加盐二次哈希，避免彩虹表攻击
 *   - 指纹原始数据不离开浏览器
 *
 * 兼容性：
 *   - 桌面端：Canvas + WebGL + UA + 屏幕 + 时区 + 语言 + 硬件信息
 *   - iOS WebView：受限 Canvas + UA + 屏幕 + 时区 + 语言
 *   - Android WebView：受限 Canvas + UA + 屏幕 + 时区 + 语言
 *   - 移动浏览器：Canvas + UA + 屏幕 + 时区 + 语言 + 触摸支持
 */

// ─── 类型定义 ──────────────────────────────────────────────

export interface FingerprintResult {
  /** SHA-256 哈希后的指纹，发送给服务端 */
  hash: string;
  /** 指纹采集是否成功 */
  success: boolean;
  /** 环境类型 */
  env: "desktop" | "mobile" | "ios-webview" | "android-webview";
  /** 降级原因（采集失败时） */
  degradeReason?: string;
}

interface FingerprintComponents {
  canvas: string;
  webgl: string;
  userAgent: string;
  platform: string;
  screenResolution: string;
  colorDepth: string;
  timezone: string;
  language: string;
  hardwareConcurrency: string;
  deviceMemory: string;
  touchSupport: string;
  plugins: string;
  fonts: string;
}

// ─── 环境检测 ──────────────────────────────────────────────

function detectEnvironment(): FingerprintResult["env"] {
  const ua = navigator.userAgent.toLowerCase();

  // iOS WebView 检测
  if (/iphone|ipad|ipod/.test(ua)) {
    if (/safari/.test(ua) && !/crios/.test(ua) && !/fxios/.test(ua) && !/fbiOS/.test(ua)) {
      // Safari 浏览器（非 WebView）的特征：standalone 或 safari 但无 wkwebview
      if (
        (navigator as Navigator & { standalone?: boolean }).standalone !== undefined &&
        !(navigator as Navigator & { standalone?: boolean }).standalone &&
        !/wkwebview/i.test(ua)
      ) {
        return "mobile";
      }
      return "ios-webview";
    }
    return "mobile";
  }

  // Android WebView 检测
  if (/android/.test(ua)) {
    if (/wv/.test(ua) || /; wv\)/.test(ua)) {
      return "android-webview";
    }
    return "mobile";
  }

  // 移动端浏览器
  if (/mobile|android|iphone|ipad|ipod|blackberry|iemobile|opera mini/.test(ua)) {
    return "mobile";
  }

  return "desktop";
}

// ─── Canvas 指纹 ───────────────────────────────────────────

function getCanvasFingerprint(): string {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 280;
    canvas.height = 60;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "canvas_unsupported";

    // 绘制文本 + 矩形，不同浏览器/系统渲染效果不同
    ctx.textBaseline = "top";
    ctx.font = "14px Arial";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#f60";
    ctx.fillRect(125, 1, 62, 20);
    ctx.fillStyle = "#069";
    ctx.fillText("Browser Fingerprint! 浏览器指纹", 2, 15);
    ctx.fillStyle = "rgba(102, 204, 0, 0.7)";
    ctx.fillText("Browser Fingerprint! 浏览器指纹", 4, 17);

    return canvas.toDataURL();
  } catch {
    return "canvas_error";
  }
}

// ─── WebGL 指纹 ────────────────────────────────────────────

function getWebGLFingerprint(): string {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
    if (!gl) return "webgl_unsupported";

    const debugInfo = (gl as WebGLRenderingContext & { getExtension(name: string): unknown }).getExtension(
      "WEBGL_debug_renderer_info"
    );
    if (debugInfo) {
      const ext = debugInfo as { UNMASKED_VENDOR_WEBGL: number; UNMASKED_RENDERER_WEBGL: number };
      const vendor = (gl as WebGLRenderingContext).getParameter(ext.UNMASKED_VENDOR_WEBGL) as string;
      const renderer = (gl as WebGLRenderingContext).getParameter(ext.UNMASKED_RENDERER_WEBGL) as string;
      return `${vendor}~${renderer}`;
    }

    // 降级：使用 WebGL 参数组合
    const webgl = gl as WebGLRenderingContext;
    const params = [
      webgl.getParameter(WebGLRenderingContext.VERSION),
      webgl.getParameter(WebGLRenderingContext.SHADING_LANGUAGE_VERSION),
      webgl.getParameter(WebGLRenderingContext.VENDOR),
      webgl.getParameter(WebGLRenderingContext.RENDERER)
    ];
    return params.join("|");
  } catch {
    return "webgl_error";
  }
}

// ─── 字体检测 ──────────────────────────────────────────────

function getFontFingerprint(): string {
  try {
    const testFonts = [
      "Arial",
      "Times New Roman",
      "Courier New",
      "Georgia",
      "Verdana",
      "Comic Sans MS",
      "Trebuchet MS",
      "Impact",
      "monospace",
      "sans-serif",
      "Microsoft YaHei",
      "SimSun",
      "SimHei",
      "PingFang SC",
      "Hiragino Sans GB",
      "STHeiti"
    ];

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return "font_unsupported";

    const baseFont = "monospace";
    const testString = "mmmmmmmmmmlli";
    const baseSize = 72;
    canvas.width = 400;
    canvas.height = 30;

    ctx.font = `${baseSize}px ${baseFont}`;
    const baseWidth = ctx.measureText(testString).width;

    const detected = testFonts.filter(font => {
      ctx.font = `${baseSize}px '${font}', ${baseFont}`;
      const width = ctx.measureText(testString).width;
      return Math.abs(width - baseWidth) > 1;
    });

    return detected.sort().join(",");
  } catch {
    return "font_error";
  }
}

// ─── 插件检测 ──────────────────────────────────────────────

function getPluginsFingerprint(): string {
  try {
    const plugins = Array.from(navigator.plugins || []);
    return plugins
      .map(p => p.name)
      .sort()
      .join(",");
  } catch {
    return "plugins_error";
  }
}

// ════════════════════════════════════════════════════════════
//  主采集函数
// ════════════════════════════════════════════════════════════

/**
 * 采集浏览器指纹的各维度数据
 */
function collectFingerprintComponents(): FingerprintComponents {
  return {
    canvas: getCanvasFingerprint(),
    webgl: getWebGLFingerprint(),
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    screenResolution: `${screen.width}x${screen.height}x${screen.colorDepth}`,
    colorDepth: String(screen.colorDepth),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    language: navigator.language,
    hardwareConcurrency: String(navigator.hardwareConcurrency || 0),
    deviceMemory: String((navigator as Navigator & { deviceMemory?: number }).deviceMemory || 0),
    touchSupport: String(navigator.maxTouchPoints || 0),
    plugins: getPluginsFingerprint(),
    fonts: getFontFingerprint()
  };
}

/**
 * 使用 SHA-256 对指纹数据进行哈希
 *
 * 使用 Web Crypto API 的 SubtleCrypto.digest
 */
async function sha256(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(data));
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

// ════════════════════════════════════════════════════════════
//  公开 API
// ════════════════════════════════════════════════════════════

/**
 * 采集浏览器指纹并返回哈希结果
 *
 * 使用示例：
 * ```ts
 * import { getFingerprint } from "@/utils/fingerprint";
 * const fp = await getFingerprint();
 * if (fp.success) {
 *   // 将 fp.hash 发送给服务端
 * } else {
 *   // 指纹采集失败，使用降级策略
 * }
 * ```
 *
 * 降级策略：
 *   - Canvas 采集失败：使用 UA + 屏幕 + 时区组合
 *   - WebGL 采集失败：跳过 GPU 信息
 *   - 完全失败：返回 success: false，前端使用 IP 降级
 */
export async function getFingerprint(): Promise<FingerprintResult> {
  const env = detectEnvironment();

  try {
    const components = collectFingerprintComponents();

    // 检查关键指纹组件是否有效
    const hasCanvasError = components.canvas === "canvas_error" || components.canvas === "canvas_unsupported";
    const hasWebGLError = components.webgl === "webgl_error" || components.webgl === "webgl_unsupported";

    // 构建指纹字符串（排除错误组件）
    const validParts: string[] = [];
    if (!hasCanvasError) validParts.push(components.canvas);
    if (!hasWebGLError) validParts.push(components.webgl);
    validParts.push(
      components.userAgent,
      components.platform,
      components.screenResolution,
      components.colorDepth,
      components.timezone,
      components.language,
      components.hardwareConcurrency,
      components.deviceMemory,
      components.touchSupport,
      components.plugins
    );
    // 字体检测较慢，仅在桌面端使用
    if (env === "desktop") {
      validParts.push(components.fonts);
    }

    const fingerprint = validParts.join("###");
    const hash = await sha256(fingerprint);

    return { hash, success: true, env };
  } catch (err) {
    // 完全失败：降级策略
    const degradeReason = err instanceof Error ? err.message : String(err);

    try {
      // 降级：仅使用 UA + 屏幕 + 时区 + 语言（最稳定的浏览器信息）
      const fallback = [
        navigator.userAgent,
        `${screen.width}x${screen.height}`,
        Intl.DateTimeFormat().resolvedOptions().timeZone,
        navigator.language
      ].join("###");
      const hash = await sha256(fallback);

      return { hash, success: true, env, degradeReason };
    } catch {
      return { hash: "", success: false, env, degradeReason: "fingerprint_completely_failed" };
    }
  }
}

/**
 * 获取降级指纹（仅使用最基础的浏览器信息）
 *
 * 当 Canvas/WebGL 指纹采集失败时使用
 * 使用 IP + User-Agent 组合作为备选方案
 */
export async function getFallbackFingerprint(): Promise<FingerprintResult> {
  const env = detectEnvironment();
  try {
    const fallback = [
      navigator.userAgent,
      `${screen.width}x${screen.height}`,
      Intl.DateTimeFormat().resolvedOptions().timeZone,
      navigator.language,
      String(navigator.hardwareConcurrency || 0)
    ].join("###");
    const hash = await sha256(fallback);
    return { hash, success: true, env, degradeReason: "fallback" };
  } catch {
    return { hash: "", success: false, env, degradeReason: "fallback_failed" };
  }
}
