// 该文件提供具体的数据库操作方法的支持

import { db } from "./db";
import type { SurveyDBData, SurveyDBReturnData } from "@/types";

/** 统一错误日志前缀 */
const LOG_PREFIX = "[IndexedDB]";

/** 模块级日志收集（用于退出登录时上报操作信息） */
export interface IndexedDBLogEntry {
  timestamp: string;
  action: string;
  success: boolean;
  detail?: string;
}

export const operationLogs: IndexedDBLogEntry[] = [];

/** 记录操作日志 */
function log(action: string, success: boolean, detail?: string) {
  const entry: IndexedDBLogEntry = {
    timestamp: new Date().toISOString(),
    action,
    success,
    detail
  };
  operationLogs.push(entry);
  const status = success ? "成功" : "失败";
  if (success) {
    console.log(`${LOG_PREFIX} ${action} ${status}${detail ? `: ${detail}` : ""}`);
  } else {
    console.error(`${LOG_PREFIX} ${action} ${status}${detail ? `: ${detail}` : ""}`);
  }
}

/** 获取当前日志并重置 */
export function flushLogs(): IndexedDBLogEntry[] {
  const logs = [...operationLogs];
  operationLogs.length = 0;
  return logs;
}

/** 包装 Dexie 操作，添加统一的错误日志 */
function wrap<T>(operation: string, fn: () => Promise<T>): Promise<T> {
  return fn()
    .then(result => {
      log(operation, true);
      return result;
    })
    .catch(err => {
      log(operation, false, err instanceof Error ? err.message : String(err));
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

// ══════════════════════════════════════════════════════════════
//  数据隔离：退出登录时清空 IndexedDB
// ══════════════════════════════════════════════════════════════

/**
 * 获取未同步问卷的数量
 *
 * 未同步定义：remote_survey_id 为空字符串/null/undefined，
 * 或 syncStatus 不为 "synced"
 */
export async function getUnsyncedSurveyCount(): Promise<number> {
  try {
    const all = await db.surveys.toArray();
    const unsynced = all.filter(s => !s.remote_survey_id || s.remote_survey_id === "" || s.syncStatus !== "synced");
    log("getUnsyncedSurveyCount", true, `未同步问卷数: ${unsynced.length}`);
    return unsynced.length;
  } catch (err) {
    log("getUnsyncedSurveyCount", false, err instanceof Error ? err.message : String(err));
    return 0;
  }
}

/**
 * 获取未同步问卷的标题列表（用于展示给用户）
 */
export async function getUnsyncedSurveyTitles(): Promise<{ title: string; id: number }[]> {
  try {
    const all = (await db.surveys.toArray()) as SurveyDBReturnData[];
    const unsynced = all
      .filter(s => !s.remote_survey_id || s.remote_survey_id === "" || s.syncStatus !== "synced")
      .map(s => ({ title: s.title || "未命名问卷", id: s.id }));
    log("getUnsyncedSurveyTitles", true, `未同步问卷: ${unsynced.map(u => u.title).join("、") || "无"}`);
    return unsynced;
  } catch (err) {
    log("getUnsyncedSurveyTitles", false, err instanceof Error ? err.message : String(err));
    return [];
  }
}

/**
 * 清空 IndexedDB 中所有问卷数据
 *
 * 登出时调用，确保新用户登录后不会看到旧用户的本地残留数据。
 * 使用 Dexie 的 clear() 方法高效清空整张表。
 *
 * @returns 清空操作是否成功
 */
export async function clearAllSurveys(): Promise<boolean> {
  try {
    const count = await db.surveys.count();
    await db.surveys.clear();
    log("clearAllSurveys", true, `已清除 ${count} 条本地问卷记录`);
    return true;
  } catch (err) {
    log("clearAllSurveys", false, err instanceof Error ? err.message : String(err));
    return false;
  }
}
