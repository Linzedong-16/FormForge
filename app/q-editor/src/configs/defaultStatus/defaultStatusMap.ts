// 该文件用于定义默认状态的映射表
import singleSelectDefaultStatus from "./selector/SingleSelect";
import picSelectDefaultStatus from "./selector/SinglePicSelect";
import multiSelectDefaultStatus from "./selector/MultiSelect";
import optionSelectDefaultStatus from "./selector/OptionSelect";
import multiPicSelectDefaultStatus from "./selector/MultiPicSelect";
import textNodeDefaultStatus from "./remark/TextNote";
import textInputDefaultStatus from "./input/TextInput";

import type { Status } from "@/types";

interface DefaultStatusMap {
  [key: string]: () => Status;
}

export const defaultStatusMap: DefaultStatusMap = {
  // 选择题组件
  "single-select": singleSelectDefaultStatus,
  "single-pic-select": picSelectDefaultStatus,
  "multi-select": multiSelectDefaultStatus,
  "option-select": optionSelectDefaultStatus,
  "multi-pic-select": multiPicSelectDefaultStatus,
  // 备注组件
  "text-node": textNodeDefaultStatus,
  // 输入框组件
  "text-input": textInputDefaultStatus,
  // 个人信息组件
  "personal-info-gender": singleSelectDefaultStatus,
  "personal-info-education": singleSelectDefaultStatus
};
