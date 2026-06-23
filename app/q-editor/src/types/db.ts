import type { Status } from "./common";

/**
 * 问卷数据库数据
 */
export interface SurveyDBData {
  createDate: number;
  updateDate: number;
  title: string;
  surveyCount: number;
  coms: Status[];
  // 分页配置：每页展示的组件数量（10 / 20 / 50）
  pageSize: number;
  /** 同步状态：是否已同步到远程数据库 */
  syncStatus?: "synced" | "unsynced";
  /** 远程问卷 ID（BigInt → string），首次同步后由后端返回 */
  remote_survey_id?: string;
  /** 审核状态（从远程同步）：none / pending / approved / rejected */
  review_status?: string;
}

/**
 * 问卷数据库返回数据
 */
export interface SurveyDBReturnData extends SurveyDBData {
  id: number;
}
