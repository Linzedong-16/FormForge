// 组件名称类型
export type { SurveyComName, Material } from "./material.js";
export { NON_QUESTION_MATERIALS } from "./material.js";

// 组件结构类型（传输格式）
export type {
  StringOptionsArr,
  ValueStatusArr,
  PicTitleDescArr,
  OptionsStatusArr,
  SerializedTextProp,
  SerializedOptionsProp,
  SurveyComponentStatus,
  SurveyComponentPayload
} from "./component.js";

// API 请求/响应类型（旧版接口，已废弃，仅保留兼容）
export type {
  GenerateSurveyRequest,
  GenerateSurveyResponse,
  GetSurveyOnlineResponse,
  GetSurveyDetailResponse,
  LegacySurveyListItem,
  GetSurveysResponse,
  SurveyAnswerValue,
  SurveyAnswers,
  SubmitAnswersRequest,
  SubmitAnswersResponse
} from "./api.js";

/// 导出 用户模块前后端通用接口
export * from "./user/user.interface.js";

/// 导出 问卷模块前后端通用接口
export * from "./survey/survey.interface.js";

/// 导出 问卷统计模块前后端通用接口
export * from "./survey/survey-stats.interface.js";

/// 导出 问卷文件模块前后端通用接口
export * from "./survey/survey-file.interface.js";

/// 导出 AI 生成模块前后端通用接口
export * from "./ai/ai.interface.js";

/// 导出 日志查询模块前后端通用接口
export * from "./log/log.interface.js";

/// 导出 埋点监控模块前后端通用接口
export * from "./track/track.interface.js";

/// 导出 审核模块前后端通用接口（ReviewStatus/SurveyType 已由 survey 模块导出，此处不重复）
export type {
  ReviewListItem,
  ReviewDetail,
  ReviewComponentItem,
  ReviewListQuery,
  ReviewListResponse,
  ApproveReviewRequest,
  RejectReviewRequest,
  ReviewActionResponse
} from "./review/review.interface.js";

/// 导出 消息互动模块前后端通用接口
export * from "./message/message.interface.js";
