/**
 * 问卷模块 API（管理后台）
 *
 * 职责：
 *   - 封装问卷 CRUD、发布/关闭/删除等 HTTP 调用
 *   - 所有 TS 类型均来自 @common/survey/survey.interface，本文件不重复定义类型
 *   - 认证由 serverClient 拦截器自动附加 Token
 */
import type { ApiResponse } from "@common/user/user.interface";
import type {
  SurveyListQuery,
  SurveyListResponse,
  SurveyDetail,
  SubmitReviewRequest,
  ApplyTemplateResponse,
  GenerateLinkRequest,
  GenerateLinkResponse
} from "@common/survey/survey.interface";
import type {
  StatsOverviewResponse,
  SurveyStatsResponse,
  AdminResponseListQuery,
  AdminResponseListResponse,
  ExportQuery
} from "@common/survey/survey-stats.interface";
import serverClient from "../../clients/server";

// ============================================================
//  问卷 CRUD
// ============================================================

/** GET /api/surveys — 获取问卷列表（分页 + 筛选） */
export const getSurveyList = (params?: SurveyListQuery): Promise<ApiResponse<SurveyListResponse>> =>
  serverClient.get("/surveys", { params });

/** GET /api/surveys/:id — 获取问卷详情 */
export const getSurveyById = (surveyId: string): Promise<ApiResponse<SurveyDetail>> =>
  serverClient.get(`/surveys/${surveyId}`);

/** DELETE /api/surveys/:id — 删除问卷（软删除） */
export const deleteSurvey = (surveyId: string): Promise<ApiResponse<null>> =>
  serverClient.delete(`/surveys/${surveyId}`);

// ============================================================
//  发布 / 关闭
// ============================================================

/** POST /api/surveys/:id/publish — 发布问卷 */
export const publishSurvey = (surveyId: string): Promise<ApiResponse<SurveyDetail>> =>
  serverClient.post(`/surveys/${surveyId}/publish`);

/** POST /api/surveys/:id/close — 关闭问卷（下线） */
export const closeSurvey = (surveyId: string): Promise<ApiResponse<SurveyDetail>> =>
  serverClient.post(`/surveys/${surveyId}/close`);

// ============================================================
//  提交审核
// ============================================================

/** POST /api/surveys/:id/submit-review — 提交问卷审核 */
export const submitReview = (
  surveyId: string,
  data: SubmitReviewRequest
): Promise<ApiResponse<ApplyTemplateResponse>> => serverClient.post(`/surveys/${surveyId}/submit-review`, data);

// ============================================================
//  生成问卷链接
// ============================================================

/** POST /api/surveys/:id/generate-link — 生成定时问卷链接 */
export const generateSurveyLink = (
  surveyId: string,
  data: GenerateLinkRequest
): Promise<ApiResponse<GenerateLinkResponse>> => serverClient.post(`/surveys/${surveyId}/generate-link`, data);

// ============================================================
//  答卷查询
// ============================================================

/** GET /api/surveys/:surveyId/responses — 答卷列表 */
export const getResponseList = (
  surveyId: string,
  params?: AdminResponseListQuery
): Promise<ApiResponse<AdminResponseListResponse>> => serverClient.get(`/surveys/${surveyId}/responses`, { params });

// ============================================================
//  统计分析
// ============================================================

/** GET /api/admin/stats/overview — 平台统计概览 */
export const getStatsOverview = (): Promise<ApiResponse<StatsOverviewResponse>> =>
  serverClient.get("/admin/stats/overview");

/** GET /api/admin/surveys/:id/stats — 单问卷详细统计 */
export const getSurveyStats = (surveyId: string): Promise<ApiResponse<SurveyStatsResponse>> =>
  serverClient.get(`/admin/surveys/${surveyId}/stats`);

/** GET /api/admin/surveys/:id/responses — 管理员答卷列表（含搜索/筛选） */
export const getAdminResponseList = (
  surveyId: string,
  params?: AdminResponseListQuery
): Promise<ApiResponse<AdminResponseListResponse>> =>
  serverClient.get(`/admin/surveys/${surveyId}/responses`, { params });

/** GET /api/admin/surveys/:id/responses/export — CSV 导出 */
export const exportResponses = (surveyId: string, params?: ExportQuery): Promise<Blob> =>
  serverClient.get(`/admin/surveys/${surveyId}/responses/export`, {
    params,
    responseType: "blob"
  });

// ============================================================
//  类型再导出
// ============================================================
export type {
  ApiResponse,
  SurveyListQuery,
  SurveyListResponse,
  SurveyDetail,
  StatsOverviewResponse,
  SurveyStatsResponse,
  AdminResponseListQuery,
  AdminResponseListResponse
};
