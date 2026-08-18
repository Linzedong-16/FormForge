// ──────────────────────────────────────────────────────────────────────────────
// 兼容 Shim —— 保留外部深度导入路径 monorepo-survey-engine/logic/validator.js
//
// 背景：package.json 的 exports 通配符（"./*": "./src/*"）允许外部包直接深度导入本包内部路径。
// 经全仓库排查，app/q-server（survey-crud.service.ts、survey-rule.service.ts）通过该路径
// 导入 validateRuleSet。本文件的实际实现已迁移至 core/logic/validator.ts（T023），
// 此处仅做再导出，供外部消费方无感升级，不再包含任何实现细节。
// ──────────────────────────────────────────────────────────────────────────────

export { validateRuleSet } from "../core/logic/validator.js";
