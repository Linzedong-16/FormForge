// 该文件用于定义默认状态的映射表
import singleSelectDefaultStatus from "./SingleSelect";

export const defaultStatusMap: Record<string, typeof singleSelectDefaultStatus> = {
  "single-select": singleSelectDefaultStatus
};
