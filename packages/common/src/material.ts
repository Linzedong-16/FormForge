/**
 * 问卷组件名称类型
 *
 * 对齐 q-editor 的 SurveyComName，不含 Vue 依赖，可在前后端通用。
 * 分为四大类：
 *   - 选择题类：single-select / multi-select / option-select / pic-select
 *   - 文本输入类：text-input
 *   - 个人信息类：personal-info-*
 *   - 高级题型：rate-score / date-time
 */
export type SurveyComName =
  // 选择题
  | "single-select"
  | "multi-select"
  | "option-select"
  | "single-pic-select"
  | "multi-pic-select"
  // 文本输入
  | "text-input"
  // 个人信息
  | "personal-info-name"
  | "personal-info-id"
  | "personal-info-tel"
  | "personal-info-wechat"
  | "personal-info-qq"
  | "personal-info-email"
  | "personal-info-address"
  | "personal-info-gender"
  | "personal-info-age"
  | "personal-info-education"
  | "personal-info-career"
  | "personal-info-birth"
  | "personal-info-collage"
  | "personal-info-major"
  | "personal-info-industry"
  | "personal-info-company"
  | "personal-info-position"
  // 高级题型
  | "rate-score"
  | "date-time";

/**
 * 所有业务组件类型 = 题目组件 + 纯展示组件（text-note）
 */
export type Material = SurveyComName | "text-note";

/**
 * 不计入题号的纯展示组件（text-note 不需要填写答案）
 */
export const NON_QUESTION_MATERIALS: Material[] = ["text-note"];
