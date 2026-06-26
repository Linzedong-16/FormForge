/**
 * AI 模块 — 前后端通用 TypeScript 类型声明
 *
 * 职责：
 *   - 定义 AI 生成/润色相关的请求体、响应体、SSE 事件结构
 *   - 定义 AI 输出校验相关的组件类型白名单与校验结果
 *   - 确保前后端接口定义一致，降低模块间耦合
 *
 * 后端实现：app/q-server/src/modules/ai/
 * 前端使用：app/q-editor/src/extension/components/AI-GenPanel.vue
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

export type ValidComponentType = (typeof VALID_COMPONENT_TYPES)[number];

// ══════════════════════════════════════════════════════════════
//  2. 通用 AI 输出结构（生成 & 润色共用）
// ══════════════════════════════════════════════════════════════

/** AI 输出的单个问卷组件 */
export interface AIComponent {
  type: string;
  config: Record<string, unknown>;
}

/** AI 输出的完整问卷结构 */
export interface AIResponse {
  title: string;
  description: string;
  components: AIComponent[];
}

/** AI 输出校验结果（校验层"永不抛异常"） */
export interface ValidationResult {
  data: AIResponse;
  warnings: string[];
}

// ══════════════════════════════════════════════════════════════
//  3. SSE 流式事件（生成 & 润色共用）
// ══════════════════════════════════════════════════════════════

/** SSE 流式事件 */
export interface SSEEvent {
  event: "token" | "component" | "done" | "error";
  data: unknown;
}

// ══════════════════════════════════════════════════════════════
//  4. AI 生成问卷（POST /api/surveys/generate）
// ══════════════════════════════════════════════════════════════

/** 生成问卷请求体 */
export interface AIGenerateRequest {
  prompt: string;
  count?: number;
  language?: "zh-CN" | "en-US" | "ja-JP";
}

// ══════════════════════════════════════════════════════════════
//  5. AI 润色问卷（POST /api/surveys/polish）— 新增
// ══════════════════════════════════════════════════════════════

/** 润色维度 */
export type AIPolishAspect = "order" | "wording" | "options" | "structure" | "length";

/** 所有可选润色维度 */
export const AI_POLISH_ASPECTS: AIPolishAspect[] = ["order", "wording", "options", "structure", "length"];

/** 润色维度的中文标签 */
export const AI_POLISH_ASPECT_LABELS: Record<AIPolishAspect, string> = {
  order: "题目排序",
  wording: "措辞优化",
  options: "选项完善",
  structure: "结构优化",
  length: "长度调整"
};

/** 待润色的问卷内容 */
export interface SurveyContent {
  title: string;
  description: string;
  components: AIComponent[];
}

/** 润色问卷请求体 */
export interface AIPolishRequest {
  /** 待润色的问卷内容 */
  surveyContent: SurveyContent;
  /** 用户润色指令 */
  instructions: string;
  /** 指定的润色维度（不传则全维度润色） */
  aspects?: AIPolishAspect[];
  /** 问卷语言 */
  language?: "zh-CN" | "en-US" | "ja-JP";
}

// ══════════════════════════════════════════════════════════════
//  6. AI 配置管理（管理员接口，PUT /api/admin/config/ai）
// ══════════════════════════════════════════════════════════════

/** 更新 AI 配置请求体 */
export interface UpdateAIConfigRequest {
  apiKey: string;
  model?: string;
  enabled: boolean;
}

/** AI 配置响应 */
export interface AIConfigResponse {
  configured: boolean;
  apiKeyMasked: string;
  model: string;
  enabled: boolean;
}
