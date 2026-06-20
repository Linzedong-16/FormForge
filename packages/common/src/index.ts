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
