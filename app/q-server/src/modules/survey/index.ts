/**
 * 问卷模块 — 统一导出入口
 *
 * 模块组织：
 *   survey-crud/   问卷 CRUD（创建、列表、详情、更新、删除、发布、关闭、模板申请）
 *   survey-rule/   动态规则完整性校验（循环依赖 / 悬空引用 / 非法跳转目标预检）
 *   file/          问卷文件管理（上传、查询、删除、级联清理）
 *   upload/        文件上传路由（图片上传、签名上传）
 */
export { SurveyService } from "./survey-crud/survey-crud.service.js";
export { SurveyRuleService } from "./survey-rule/survey-rule.service.js";
export { SurveyFileService } from "./file/file.service.js";
export { default as surveyCrudRoutes } from "./survey-crud/survey-crud.routes.js";
export { default as surveyRuleRoutes } from "./survey-rule/survey-rule.routes.js";
export { default as fileRoutes } from "./file/file.routes.js";
export { default as uploadRoutes } from "./upload/upload.routes.js";

// Schema & Type 重导出
export {
  createSurveySchema,
  updateSurveySchema,
  surveyListQuerySchema,
  publishSurveySchema,
  closeSurveySchema,
  applyTemplateSchema,
  surveyIdSchema
} from "./survey-crud/survey-crud.schemas.js";
export type {
  CreateSurveyInput,
  UpdateSurveyInput,
  SurveyListQueryInput,
  ApplyTemplateInput
} from "./survey-crud/survey-crud.schemas.js";
