/**
 * AI 问卷生成 — 前后端通用 TypeScript 类型声明
 *
 * 职责：
 *   - 定义 AI 生成相关的请求体、响应体、SSE 事件结构
 *   - 定义 AI 输出校验相关的组件类型白名单与校验结果
 *   - 确保前后端接口定义一致，降低模块间耦合
 *
 * 后端实现：app/q-server/src/modules/ai/
 * 前端使用：app/q-editor/src/components/Common/Header.vue（AI 生成面板）
 */

// ══════════════════════════════════════════════════════════════
//  1. 组件类型白名单
// ══════════════════════════════════════════════════════════════

/**
 * AI 可生成的有效组件类型列表
 *
 * 与后端 prompt-templates/system-prompt.ts 中的"可用题型"保持严格一致。
 * 后端 schema-validator 使用此白名单过滤 AI 输出的无效组件类型。
 */
export const VALID_COMPONENT_TYPES = [
  // 选择题型
  "single-select",
  "multi-select",
  "single-pic-select",
  "multi-pic-select",
  "option-select",
  // 高级题型
  "rate-score",
  "date-time",
  "slider",
  "transfer",
  "cascader",
  // 输入题型
  "text-input",
  "text-note",
  // 个人信息（18 种）
  "personal-info-name",
  "personal-info-gender",
  "personal-info-age",
  "personal-info-education",
  "personal-info-career",
  "personal-info-tel",
  "personal-info-email",
  "personal-info-address",
  "personal-info-id",
  "personal-info-wechat",
  "personal-info-qq",
  "personal-info-collage",
  "personal-info-major",
  "personal-info-industry",
  "personal-info-company",
  "personal-info-position",
  "personal-info-birth"
] as const;

/**
 * 有效组件类型的字面量联合类型
 *
 * @example
 *   function assertValidType(type: string): ValidComponentType {
 *     if (!VALID_COMPONENT_TYPES.includes(type as any)) throw new Error("无效组件类型");
 *     return type as ValidComponentType;
 *   }
 */
export type ValidComponentType = (typeof VALID_COMPONENT_TYPES)[number];

// ══════════════════════════════════════════════════════════════
//  2. API 请求/响应
// ══════════════════════════════════════════════════════════════

/**
 * POST /api/surveys/generate — AI 生成问卷请求体
 *
 * 前端在 Header.vue 的 AI 生成面板中构造此对象并发起 SSE 请求。
 */
export interface AIGenerateRequest {
  /** 用户自然语言描述（5-2000 字符） */
  prompt: string;
  /** 期望题目数（5-20，默认由后端决定） */
  count?: number;
  /** 问卷语言（默认 zh-CN） */
  language?: "zh-CN" | "en-US" | "ja-JP";
}

// ══════════════════════════════════════════════════════════════
//  3. AI 原始输出结构
// ══════════════════════════════════════════════════════════════

/**
 * AI 输出的单个问卷组件
 *
 * 注意：
 *   - type 为前端组件名称（kebab-case），如 "single-select"、"text-input"
 *   - config 为前端组件的完整 status 对象序列化后的 Record
 *   - 后端仅做格式校验和类型白名单过滤，不关心 config 内部结构
 */
export interface AIComponent {
  /** 组件类型（kebab-case） */
  type: string;
  /** 组件配置属性集合（前端 status 对象序列化） */
  config: Record<string, unknown>;
}

/**
 * AI 输出的完整问卷结构
 *
 * 对应 AI System Prompt 要求的输出格式：
 *   { title, description, components: [...] }
 */
export interface AIResponse {
  /** 问卷标题 */
  title: string;
  /** 问卷说明/前言（可为空） */
  description: string;
  /** 问卷组件列表 */
  components: AIComponent[];
}

// ══════════════════════════════════════════════════════════════
//  4. SSE 流式事件
// ══════════════════════════════════════════════════════════════

/**
 * SSE 流式事件
 *
 * 后端通过 AsyncGenerator 逐条产出，前端通过 EventSource / fetch + ReadableStream 消费。
 *
 * 事件类型：
 *   - token      AI 逐字输出的 token（可展示打字机效果）
 *   - component  单个组件解析完成
 *   - done       生成完毕，data 中包含最终的 ValidationResult
 *   - error      生成过程中发生错误
 */
export interface SSEEvent {
  event: "token" | "component" | "done" | "error";
  data: unknown;
}

// ══════════════════════════════════════════════════════════════
//  5. 校验结果
// ══════════════════════════════════════════════════════════════

/**
 * AI 输出校验结果
 *
 * 后端 schema-validator 的 validateAIResponse() 返回值。
 * 校验层"永不抛异常"，始终返回此结构。
 *
 * @example
 *   // 正常情况
 *   { data: { title: "员工满意度", description: "", components: [...] }, warnings: [] }
 *   // 异常情况
 *   { data: { title: "未命名问卷", description: "", components: [] }, warnings: ["无法解析 JSON"] }
 */
export interface ValidationResult {
  /** 校验通过的有效数据（最坏情况 components 为空数组） */
  data: AIResponse;
  /** 校验过程中的警告信息（类型无效、格式异常等） */
  warnings: string[];
}

// ══════════════════════════════════════════════════════════════
//  6. AI 配置管理（管理员接口）
// ══════════════════════════════════════════════════════════════

/**
 * PUT /api/admin/config/ai — 更新 AI 配置请求体
 *
 * 前端管理员设置页面构造此对象。
 */
export interface UpdateAIConfigRequest {
  /** DeepSeek API Key（必填，sk- 开头） */
  apiKey: string;
  /** 模型名称（可选，默认 deepseek-chat） */
  model?: string;
  /** 是否启用 AI 生成功能 */
  enabled: boolean;
}

/**
 * GET /api/admin/config/ai — AI 配置响应
 *
 * API Key 脱敏返回，绝不泄露明文。
 */
export interface AIConfigResponse {
  /** 是否已配置（存在有效 API Key） */
  configured: boolean;
  /** 脱敏后的 API Key（如 sk-****abcd），未配置时为空 */
  apiKeyMasked: string;
  /** 模型名称 */
  model: string;
  /** 是否启用 */
  enabled: boolean;
}
