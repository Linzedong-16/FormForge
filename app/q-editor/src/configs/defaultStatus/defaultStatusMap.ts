// 该文件用于定义默认状态的映射表
import singleSelectDefaultStatus from "./SingleSelect";
import picSelectDefaultStatus from "./SinglePicSelect";
import multiSelectDefaultStatus from "./MultiSelect";
import optionSelectDefaultStatus from "./OptionSelect";
import multiPicSelectDefaultStatus from "./MultiPicSelect";

import type { Status } from "@/types";

interface DefaultStatusMap {
  [key: string]: () => Status;
}

export const defaultStatusMap: DefaultStatusMap = {
  "single-select": singleSelectDefaultStatus,
  "single-pic-select": picSelectDefaultStatus,
  "multi-select": multiSelectDefaultStatus,
  "option-select": optionSelectDefaultStatus,
  "multi-pic-select": multiPicSelectDefaultStatus
};
