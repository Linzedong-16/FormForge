/**
 * 数据脱敏工具
 *
 * 在事件属性序列化阶段自动执行，阻断敏感信息泄露。
 *
 * @module utils/sanitize
 */

/** 需要完全移除的属性名黑名单（包含关键词即匹配） */
const BLOCKLIST_PATTERNS = [
  "password",
  "passwd",
  "secret",
  "token",
  "apikey",
  "api_key",
  "auth",
  "credential",
  "privatekey",
  "private_key"
];

/** 需要脱敏的属性名黑名单（保留但替换值） */
const REDACT_PATTERNS = [
  "email",
  "phone",
  "mobile",
  "tel",
  "idcard",
  "id_card",
  "idnumber",
  "address",
  "name",
  "realname",
  "real_name"
];

/** 身份证号正则（18 位） */
const ID_CARD_RE = /\b[1-9]\d{5}(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx]\b/g;

/** 手机号正则（中国大陆 11 位） */
const PHONE_RE = /\b1[3-9]\d{9}\b/g;

/** 邮箱正则 */
const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;

/** 脱敏替换值 */
const REDACTED = "[REDACTED]";

/**
 * 递归脱敏对象中的敏感字段。
 *
 * 处理策略：
 * 1. 命中 blocklist → 删除属性
 * 2. 命中 redact list → 替换值为 [REDACTED]
 * 3. 字符串值 → 正则匹配身份证/手机号/邮箱 → 替换
 *
 * @param obj - 待脱敏的对象
 * @param depth - 当前递归深度（防止栈溢出）
 * @returns 脱敏后的对象
 *
 * @example
 * ```ts
 * const sanitized = sanitizeObject({
 *   password: 'abc123',
 *   email: 'user@example.com',
 *   description: 'call me at 13800138000'
 * });
 * // => { description: 'call me at [REDACTED]' }
 * ```
 */
export function sanitizeObject(obj: unknown, depth = 0): unknown {
  if (depth > 5 || obj === null || obj === undefined) return obj;

  if (typeof obj === "string") {
    return sanitizeString(obj);
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item, depth + 1));
  }

  if (typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      const lowerKey = key.toLowerCase().replace(/[_-]/g, "");

      // 命中 blocklist → 删除
      if (BLOCKLIST_PATTERNS.some(p => lowerKey.includes(p))) {
        continue;
      }

      // 命中 redact → 替换
      if (REDACT_PATTERNS.some(p => lowerKey.includes(p))) {
        result[key] = REDACTED;
        continue;
      }

      result[key] = sanitizeObject(value, depth + 1);
    }
    return result;
  }

  return obj;
}

/**
 * 对单个字符串值进行正则脱敏。
 *
 * @param value - 待检查的字符串
 * @returns 脱敏后的字符串
 */
function sanitizeString(value: string): string {
  let result = value;
  result = result.replace(ID_CARD_RE, REDACTED);
  result = result.replace(PHONE_RE, REDACTED);
  result = result.replace(EMAIL_RE, REDACTED);
  return result;
}

/**
 * 对 URL 中的敏感查询参数进行清洗。
 *
 * 移除 token, code, sign, signature, access_token 等参数的值。
 *
 * @param url - 完整 URL 字符串
 * @returns 清洗后的 URL
 *
 * @example
 * ```ts
 * const clean = sanitizeUrl('https://example.com/page?token=abc&id=123');
 * // => 'https://example.com/page?token=[REDACTED]&id=123'
 * ```
 */
export function sanitizeUrl(url: string): string {
  const SENSITIVE_PARAMS = ["token", "code", "sign", "signature", "access_token", "refresh_token", "apikey", "api_key"];

  try {
    const parsed = new URL(url);
    for (const param of SENSITIVE_PARAMS) {
      if (parsed.searchParams.has(param)) {
        parsed.searchParams.set(param, REDACTED);
      }
    }
    return parsed.toString();
  } catch {
    // URL 解析失败（非标准 URL），直接返回原值
    return url;
  }
}

/**
 * 检查事件属性中是否包含疑似答卷内容的关键字段。
 *
 * 问卷系统的核心安全要求：答卷文本内容绝不能上报到埋点系统。
 * 此函数检测 properties 中是否可能包含用户填写的文本答案。
 *
 * @param properties - 事件属性对象
 * @returns 如果包含疑似答卷内容则返回 true
 */
export function containsSurveyContent(properties: Record<string, unknown>): boolean {
  const SURVEY_CONTENT_INDICATORS = [
    "answer",
    "response",
    "text_value",
    "user_input",
    "comment",
    "feedback",
    "open_text",
    "fill_text"
  ];

  for (const key of Object.keys(properties)) {
    const lowerKey = key.toLowerCase();
    if (SURVEY_CONTENT_INDICATORS.some(ind => lowerKey.includes(ind))) {
      return true;
    }
  }
  return false;
}
