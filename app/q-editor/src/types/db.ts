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
}

/**
 * 问卷数据库返回数据
 */
export interface SurveyDBReturnData extends SurveyDBData {
  id: number;
}
