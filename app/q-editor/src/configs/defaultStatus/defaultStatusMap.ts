// 该文件用于定义默认状态的映射表
import singleSelectDefaultStatus from "./SingleSelect";
import picSelectDefaultStatus from "./SinglePicSelect";

export const defaultStatusMap: Record<string, typeof singleSelectDefaultStatus | typeof picSelectDefaultStatus> = {
  "single-select": singleSelectDefaultStatus,
  "single-pic-select": picSelectDefaultStatus
};
