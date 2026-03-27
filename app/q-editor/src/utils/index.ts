// 工具库
import {
  type TextProps,
  type OptionsProps,
  isPicTitleDescStatusArr,
  isOptionsProps,
  type StatusArray,
  type ValueStatusArr,
  type PicTitleDescStatusArr
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
