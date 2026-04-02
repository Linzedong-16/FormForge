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
}

/**
 * 问卷数据库返回数据
 */
export interface SurveyDBReturnData extends SurveyDBData {
  id: number;
}
