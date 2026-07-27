/**
 * 埋点监控仪表盘 —— 共享筛选状态
 *
 * 在概览/错误/性能/用量四个面板之间共享时间范围、应用、环境三个筛选条件。
 * 概览、实时快照、漏斗三个接口不支持 environment 筛选（见 research.md §7），
 * 由各自的面板自行决定是否读取 environment（并在界面上标注"汇总全部环境"）。
 */
import { reactive } from "vue";
import type { TimeRange, Environment, TrackingAppId } from "@/api/modules/analytics";

export interface AnalyticsFilterState {
  range: TimeRange;
  appId?: TrackingAppId;
  environment: Environment;
}

/** 单例共享状态：所有调用方拿到同一份筛选状态，天然联动 */
const filters = reactive<AnalyticsFilterState>({
  range: "24h",
  appId: undefined,
  environment: "production"
});

export function useAnalyticsFilters() {
  function setRange(range: TimeRange) {
    filters.range = range;
  }

  function setAppId(appId: TrackingAppId | undefined) {
    filters.appId = appId;
  }

  function setEnvironment(environment: Environment) {
    filters.environment = environment;
  }

  return { filters, setRange, setAppId, setEnvironment };
}
