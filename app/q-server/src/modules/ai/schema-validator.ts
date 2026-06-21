/**
 * AI 问卷生成 — 输出 JSON 校验与容错解析
 *
 * 职责：
 *   1. 从 AI 原始文本中提取 JSON（处理 markdown 代码块包裹等异常）
 *   2. Zod schema 校验顶层结构
 *   3. 逐组件校验 type 有效性，过滤无效组件
 *   4. 返回 { valid components, warnings[] }
 */
import { aiResponseSchema, VALID_COMPONENT_TYPES, type AIComponent } from "./ai-generate.schemas.js";
import type { ValidationResult } from "@common/ai/ai.interface.js";

// Re-export 共用类型（向后兼容）
export type { ValidationResult };

// ─── 核心函数 ──────────────────────────────────────────────────

/**
 * 从 AI 原始文本中提取并校验 JSON
 *
 * 容错策略：
 *   1. 直接 JSON.parse() 尝试解析
 *   2. 若失败，正则提取 markdown 代码块中的 JSON
 *   3. 若仍失败，尝试找到第一个 { 和最后一个 } 之间的内容
 *   4. Zod 校验整体结构 → 过滤无效组件 → 返回有效部分
 *
 * @param rawText  AI 返回的原始文本
 * @returns 校验结果（始终包含 data，校验失败时 data.components 为空数组）
 */
export function validateAIResponse(rawText: string): ValidationResult {
  const warnings: string[] = [];
  let parsed: unknown;

  // 步骤 1：尝试直接解析
  try {
    parsed = JSON.parse(rawText.trim());
  } catch {
    // 步骤 2：尝试从 markdown 代码块中提取
    const codeBlockMatch = rawText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (codeBlockMatch) {
      try {
        parsed = JSON.parse(codeBlockMatch[1].trim());
        warnings.push("AI 输出被包裹在 markdown 代码块中，已自动提取 JSON");
      } catch {
        // 继续下一步
      }
    }

    // 步骤 3：尝试提取第一个 { 到最后一个 } 之间的内容
    if (!parsed) {
      const firstBrace = rawText.indexOf("{");
      const lastBrace = rawText.lastIndexOf("}");
      if (firstBrace !== -1 && lastBrace > firstBrace) {
        try {
          parsed = JSON.parse(rawText.slice(firstBrace, lastBrace + 1));
          warnings.push("AI 输出包含非 JSON 内容，已自动提取 JSON 部分");
        } catch {
          // 所有尝试均失败
        }
      }
    }

    // 完全无法解析
    if (!parsed) {
      return {
        data: { title: "", description: "", components: [] },
        warnings: ["AI 返回内容无法解析为 JSON，请重试"]
      };
    }
  }

  // 步骤 4：Zod 校验 + 过滤无效组件
  const zodResult = aiResponseSchema.safeParse(parsed);
  if (!zodResult.success) {
    // 顶层结构校验失败时，尝试修复
    return attemptRepair(
      parsed as Record<string, unknown>,
      zodResult.error.issues.map(i => i.message)
    );
  }

  const data = zodResult.data;

  // 步骤 5：过滤无效组件
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
