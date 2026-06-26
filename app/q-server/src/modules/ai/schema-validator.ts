/**
 * AI 问卷生成 — 输出 JSON 校验与容错解析
 *
 * 职责：
 *   1. 从 AI 原始文本中提取 JSON（处理 markdown 代码块包裹等异常）
 *   2. Zod schema 校验顶层结构
 *   3. 逐组件校验 type 有效性，过滤无效组件
 *   4. 返回 { valid components, warnings[] }
 */
import type { FastifyInstance } from "fastify";
import { aiResponseSchema, VALID_COMPONENT_TYPES, type AIComponent } from "./ai-generate/ai-generate.schemas.js";
import type { ValidationResult } from "@common/ai/ai.interface.js";

// Re-export 共用类型（向后兼容）
export type { ValidationResult };

// ─── AI 原始输出日志工具 ────────────────────────────────────────

/** 日志截断长度（字符） */
const LOG_MAX_LENGTH = 8000;

/**
 * 将 AI 流式输出的完整原始文本写入日志，用于排障
 */
export function logAIRawResponse(fastify: FastifyInstance, userId: bigint, action: string, rawText: string): void {
  const truncated =
    rawText.length > LOG_MAX_LENGTH
      ? rawText.slice(0, LOG_MAX_LENGTH) + `...（共 ${rawText.length} 字符，已截断）`
      : rawText;

  fastify.log.info(
    { userId: String(userId), action, textLength: rawText.length, rawText: truncated },
    `AI ${action} 原始输出（共 ${rawText.length} 字符）`
  );
}

// ─── 公共 JSON 解析 ────────────────────────────────────────────

/**
 * 从 AI 原始文本中提取 JSON 对象的解析结果
 *
 * 三级容错策略：
 *   1. 直接 JSON.parse() 尝试解析
 *   2. 若失败，正则提取 markdown 代码块中的 JSON
 *   3. 若仍失败，找到第一个 { 和最后一个 } 之间的内容
 *
 * 此函数供 validateAIResponse 和 extractChanges 等场景复用，
 * 避免 JSON 解析逻辑重复。
 *
 * @param rawText  AI 返回的原始文本
 * @returns 解析后的对象，若完全无法解析则返回 null
 */
export function parseJSONFromRawText(rawText: string): Record<string, unknown> | null {
  // 步骤 1：直接解析
  try {
    const parsed = JSON.parse(rawText.trim());
    // 处理 DeepSeek 将 JSON 输出为字符串值的情况
    if (typeof parsed === "string" && parsed.trim().startsWith("{")) {
      try {
        return JSON.parse(parsed);
      } catch {
        // 二次解析失败，继续容错
      }
    } else if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // 继续容错
  }

  // 步骤 2：markdown 代码块提取
  const codeBlockMatch = rawText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1].trim());
    } catch {
      // 继续
    }
  }

  // 步骤 3：提取第一个 { 到最后一个 }
  const firstBrace = rawText.indexOf("{");
  const lastBrace = rawText.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(rawText.slice(firstBrace, lastBrace + 1));
    } catch {
      // 所有尝试均失败
    }
  }

  return null;
}

// ─── 核心函数 ──────────────────────────────────────────────────

/**
 * 从 AI 原始文本中提取并校验 JSON
 *
 * 容错策略：
 *   1. 直接 JSON.parse() 尝试解析
 *   1.5 若解析结果是字符串且以 { 开头，再 parse 一次（DeepSeek 偶发将 JSON 输出为字符串值）
 *   2. 若失败，正则提取 markdown 代码块中的 JSON
 *   3. 若仍失败，尝试找到第一个 { 和最后一个 } 之间的内容
 *   4. Zod 校验整体结构 → 过滤无效组件 → 返回有效部分
 *
 * @param rawText  AI 返回的原始文本
 * @returns 校验结果（始终包含 data，校验失败时 data.components 为空数组）
 */
export function validateAIResponse(rawText: string): ValidationResult {
  const warnings: string[] = [];
  const parsed = parseJSONFromRawText(rawText);

  // 完全无法解析
  if (!parsed) {
    return {
      data: { title: "", description: "", components: [] },
      warnings: ["AI 返回内容无法解析为 JSON，请重试"]
    };
  }

  // 检查是否是从字符串展开的
  if (rawText.trim().startsWith('"')) {
    try {
      const firstPass = JSON.parse(rawText.trim());
      if (typeof firstPass === "string" && firstPass.trim().startsWith("{")) {
        warnings.push("AI 输出被包裹为 JSON 字符串，已自动展开");
      }
    } catch {
      // 非字符串包裹
    }
  }

  // 检查是否是从 markdown 提取的
  if (/```(?:json)?\s*\n/.test(rawText)) {
    warnings.push("AI 输出被包裹在 markdown 代码块中，已自动提取 JSON");
  } else if (rawText.indexOf("{") > 0 || rawText.lastIndexOf("}") < rawText.length - 1) {
    warnings.push("AI 输出包含非 JSON 内容，已自动提取 JSON 部分");
  }

  // Zod 校验 + 过滤无效组件
  const zodResult = aiResponseSchema.safeParse(parsed);
  if (!zodResult.success) {
    return attemptRepair(
      parsed,
      zodResult.error.issues.map(i => i.message)
    );
  }

  const data = zodResult.data;

  // 过滤无效组件
  const validComponents: AIComponent[] = [];
  for (let i = 0; i < data.components.length; i++) {
    const comp = data.components[i];
    if (!VALID_COMPONENT_TYPES.includes(comp.type as (typeof VALID_COMPONENT_TYPES)[number])) {
      warnings.push(`第 ${i + 1} 个组件类型 "${comp.type}" 无效，已跳过`);
      continue;
    }
    validComponents.push(comp);
  }

  if (validComponents.length === 0 && data.components.length > 0) {
    warnings.push("所有组件类型均无效，请检查 AI 输出");
  }

  return {
    data: { ...data, components: validComponents },
    warnings
  };
}

// ─── 内部函数 ──────────────────────────────────────────────────

/**
 * 尝试修复 AI 返回的部分无效 JSON
 *
 * 常见问题：
 *   - title 为空字符串 → 跳过（警告）
 *   - components 不是数组 → 用空数组替代
 *   - components 中有 null/非对象 → 过滤
 */
function attemptRepair(obj: Record<string, unknown>, issues: string[]): ValidationResult {
  const warnings = [...issues];

  const title = typeof obj.title === "string" && obj.title.trim() ? obj.title.trim() : "";
  const description = typeof obj.description === "string" ? obj.description : "";

  let components: AIComponent[] = [];
  if (Array.isArray(obj.components)) {
    components = obj.components
      .filter((c): c is Record<string, unknown> => c !== null && typeof c === "object")
      .map(c => ({
        type: typeof c.type === "string" ? c.type : "",
        config: typeof c.config === "object" && c.config !== null ? (c.config as Record<string, unknown>) : {}
      }))
      .filter(c => VALID_COMPONENT_TYPES.includes(c.type as (typeof VALID_COMPONENT_TYPES)[number]));
  }

  if (components.length === 0) {
    warnings.push("未解析到有效组件");
  }
  if (!title) {
    warnings.push("问卷标题缺失");
  }

  return {
    data: { title: title || "未命名问卷", description, components },
    warnings
  };
}
