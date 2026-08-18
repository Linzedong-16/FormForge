import type { VueComType } from "./common.js";
import type { componentName } from "../core/schema/types.js";

// Material/SurveyComName/EditComName/componentName/isSurveyComName/isUseForPDF 等不依赖 VueComType 的
// 定义已下沉到 core/schema/types.ts（core/ 边界要求该文件不得出现任何框架 import），
// 此处重新导出以保持现有内部 import 路径不破坏（research.md R1）。
export * from "../core/schema/types.js";

// 标签页类型（依赖 VueComType，保留在适配层类型文件中）
export interface TabInfo {
  label: string;
  name: string;
  icon: VueComType;
  view: VueComType;
}

export type ComponentMap = {
  [key in componentName]: VueComType;
};
