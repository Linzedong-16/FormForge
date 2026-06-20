// 该文件提供具体的数据库操作方法的支持

import { db } from "./db";
import type { SurveyDBData } from "@/types";

/** 统一错误日志前缀 */
const LOG_PREFIX = "[IndexedDB]";

/** 包装 Dexie 操作，添加统一的错误日志 */
function wrap<T>(operation: string, fn: () => Promise<T>): Promise<T> {
  return fn().catch(err => {
    console.error(`${LOG_PREFIX} ${operation} 失败:`, err);
    throw err;
  });
}

// 保存数据
export async function saveSurvey(data: SurveyDBData) {
  return wrap("saveSurvey", () => db.surveys.add(data));
}

// 查询所有数据
export async function getAllSurvey() {
  return wrap("getAllSurvey", () => db.surveys.toArray());
}

// 根据 id 查询某一条数据
export async function getSurveyById(id: number) {
  return wrap("getSurveyById", () => db.surveys.get(id));
}

// 根据 id 删除某一条数据
export async function deleteSurveyById(id: number) {
  return wrap("deleteSurveyById", () => db.surveys.delete(id));
}

// 根据 id 更新某一条数据
export async function updateSurveyById(id: number, data: Partial<SurveyDBData>) {
  return wrap("updateSurveyById", () => db.surveys.update(id, data));
}
