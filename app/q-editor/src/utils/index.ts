// 工具库
import { ageStatus, careerStatus, educationStatus, genderStatus } from "@/configs/defaultStatus/initStatus";
import {
  type TextProps,
  type OptionsProps,
  isPicTitleDescStatusArr,
  isOptionsProps,
  type StatusArray,
  type ValueStatusArr,
  type PicTitleDescStatusArr,
  type TypeStatus,
  type Status,
  type Material
} from "@/types";
/**
 * 获取文本配置项的状态值
 * @param {TextProps} props - 文本配置项
 * @returns {string} 文本配置项的状态值
 * @example
 * // 用法示例
 * const title = getTextStatus(component.status.title);
 * // 返回: "单选题默认标题"
 */
export function getTextStatus(props: TextProps) {
  return props.status;
}

/**
 * 获取选项配置项的状态值
 * @param {OptionsProps} props - 选项配置项
 * @returns {import("@/types").OptionsStatusArr} 选项配置项的状态值数组
 * @example
 * // 用法示例
 * const options = getStringStatus(component.status.options);
 * // 返回: ["默认选项1", "默认选项2"]
 */
export function getStringStatus(props: OptionsProps) {
  return props.status;
}

/**
 * 获取选项配置项的当前选中状态索引
 * @param {OptionsProps} props - 选项配置项
 * @returns {number} 当前选中状态的索引
 * @example
 * // 用法示例
 * const currentPosition = getCurrentStatus(component.status.position);
 * // 返回: 0 (左对齐) 或 1 (居中对齐)
 */
export function getCurrentStatus(props: OptionsProps) {
  return props.currentStatus;
}

/**
 * 根据当前选中状态索引获取选项配置项的状态值
 * @param {OptionsProps} props - 选项配置项
 * @returns {any} 当前选中状态的值
 * @example
 * // 用法示例
 * const titleSize = getStringStatusByCurrentStatus(component.status.titleSize);
 * // 返回: "22"
 */
export function getStringStatusByCurrentStatus(props: OptionsProps) {
  return props.status[props.currentStatus];
}

export function getValueStatusByCurrentStatus(props: OptionsProps) {
  if (props && isOptionsProps(props) && (isValueStatusArray(props.status) || isPicTitleDescArray(props.status))) {
    return props.status[props.currentStatus];
  }
}

/**
 * 获取图片标题描述类型的选项配置
 * @param {OptionsProps} props - 选项配置项
 * @returns {import("@/types").PicTitleDescStatusArr | undefined} 图片标题描述类型的选项配置数组
 * @example
 * // 用法示例
 * const picOptions = getPicTitleDescStatusArr(component.status.options);
 * // 返回: [{ picTitle: "图片1", picDesc: "描述1", value: "value1" }]
 */
export function getPicTitleDescStatusArr(props: OptionsProps) {
  if (props && isPicTitleDescStatusArr(props.status)) {
    return props.status;
  }
}
export function getValueStatus(props: OptionsProps) {
  if (props && isOptionsProps(props) && (isValueStatusArray(props.status) || isPicTitleDescArray(props.status))) {
    return props.status;
  }
}

// 类型谓词函数，用于检查 status 是否为 Array<{ value: string; status: string }>
export function isValueStatusArray(status: StatusArray): status is ValueStatusArr {
  return (
    Array.isArray(status) &&
    status.length > 0 &&
    typeof status[0] === "object" &&
    "value" in status[0] &&
    "status" in status[0]
  );
}

// 类型谓词函数，用于检查 status 是否为 Array<{ picTitle: string; picDesc: string }>
export function isPicTitleDescArray(status: StatusArray): status is PicTitleDescStatusArr {
  return (
    Array.isArray(status) &&
    status.length > 0 &&
    typeof status[0] === "object" &&
    "picTitle" in status[0] &&
    "picDesc" in status[0]
  );
}

export function changeEditorIsShowStatus(status: TypeStatus, type: number) {
  if (type !== status.type.currentStatus) {
    status.title.isShow = !status.title.isShow;
    status.desc.isShow = !status.desc.isShow;
    status.position.isShow = !status.position.isShow;
    status.titleSize.isShow = !status.titleSize.isShow;
    status.descSize.isShow = !status.descSize.isShow;
    status.titleWeight.isShow = !status.titleWeight.isShow;
    status.descWeight.isShow = !status.descWeight.isShow;
    status.titleItalic.isShow = !status.titleItalic.isShow;
    status.descItalic.isShow = !status.descItalic.isShow;
    status.titleColor.isShow = !status.titleColor.isShow;
    status.descColor.isShow = !status.descColor.isShow;
  }
}

// export function updateInitStatusBeforeAdd(comStatus: Status, newMaterialName: Material) {
//   switch (newMaterialName) {
//     case "personal-info-gender": {
//       comStatus.name = "personal-info-gender";
//       comStatus.status.title!.status = "您的性别是？";
//       if (IsOptionsStatus(comStatus.status)) comStatus.status.options.status = genderStatus();
//       break;
//     }
//     case "personal-info-education": {
//       comStatus.name = "personal-info-education";
//       comStatus.status.title.status = "到目前为止，您的最高学历是？";
//       if (IsOptionsStatus(comStatus.status)) comStatus.status.options.status = educationStatus();
//       break;
//     }
//   }
// }

export function updateInitStatusBeforeAdd(comStatus: Status, newMaterialName: Material) {
  switch (newMaterialName) {
    case "personal-info-gender": {
      comStatus.name = "personal-info-gender";
      // 确保 title 属性存在
      if (comStatus.status.title) {
        comStatus.status.title.status = "您的性别是？";
      }
      // 检查是否为选项组件并确保 options 属性存在
      if ("options" in comStatus.status && comStatus.status.options) {
        comStatus.status.options.status = genderStatus();
      }
      break;
    }
    case "personal-info-education": {
      comStatus.name = "personal-info-education";
      // 确保 title 属性存在
      if (comStatus.status.title) {
        comStatus.status.title.status = "到目前为止，您的最高学历是？";
      }
      // 检查是否为选项组件并确保 options 属性存在
      if ("options" in comStatus.status && comStatus.status.options) {
        comStatus.status.options.status = educationStatus();
      }
      break;
    }
    case "personal-info-name": {
      comStatus.name = "personal-info-name";
      // 确保 title 属性存在
      if (comStatus.status.title && comStatus.status.type) {
        comStatus.status.title.status = "您的姓名是？";
        comStatus.status.type.isShow = false;
      }
      break;
    }
    case "personal-info-id": {
      comStatus.name = "personal-info-id";
      // 确保 title 属性存在
      if (comStatus.status.title && comStatus.status.type) {
        comStatus.status.title.status = "您的身份证号是？";
        comStatus.status.type.isShow = false;
      }
      break;
    }
    case "personal-info-address": {
      comStatus.name = "personal-info-address";
      // 确保 title 属性存在
      if (comStatus.status.title && comStatus.status.type) {
        comStatus.status.title.status = "您的地址是？";
        comStatus.status.type.isShow = false;
      }
      break;
    }
    case "personal-info-age": {
      comStatus.name = "personal-info-age";
      // 确保 title 属性存在
      if (comStatus.status.title) {
        comStatus.status.title.status = "您的年龄是？";
        comStatus.status.options!.status = ageStatus();
      }
      break;
    }
    case "personal-info-career": {
      comStatus.name = "personal-info-career";
      // 确保 title 属性存在
      if (comStatus.status.title) {
        comStatus.status.title.status = "您目前的职业是？";
        comStatus.status.options!.status = careerStatus();
      }
      break;
    }
    case "personal-info-collage": {
      comStatus.name = "personal-info-collage";
      // 确保 title 属性存在
      if (comStatus.status.title && comStatus.status.type) {
        comStatus.status.title.status = "您的学校是？";
        comStatus.status.type.isShow = false;
      }
      break;
    }
    case "personal-info-major": {
      comStatus.name = "personal-info-major";
      // 确保 title 属性存在
      if (comStatus.status.title && comStatus.status.type) {
        comStatus.status.title.status = "您的专业是？";
        comStatus.status.type.isShow = false;
      }
      break;
    }
    case "personal-info-industry": {
      comStatus.name = "personal-info-industry";
      // 确保 title 属性存在
      if (comStatus.status.title && comStatus.status.type) {
        comStatus.status.title.status = "您的行业是？";
        comStatus.status.type.isShow = false;
      }
      break;
    }
    case "personal-info-company": {
      comStatus.name = "personal-info-company";
      // 确保 title 属性存在
      if (comStatus.status.title && comStatus.status.type) {
        comStatus.status.title.status = "您的公司是？";
        comStatus.status.type.isShow = false;
      }
      break;
    }
    case "personal-info-position": {
      comStatus.name = "personal-info-position";
      // 确保 title 属性存在
      if (comStatus.status.title && comStatus.status.type) {
        comStatus.status.title.status = "您的职位是？";
        comStatus.status.type.isShow = false;
      }
      break;
    }
    // "date-time": markRaw(DateTime),
    // "personal-info-birth": markRaw(DateTime),
  }
}
