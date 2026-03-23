import { type OptionsProps, type TextProps } from "@/types";
export function setTextStatus(textProps: TextProps, text: string) {
  textProps.status = text;
}

/**
 * 添加选项
 * @param optionProps
 */
export function addOption(optionProps: OptionsProps) {
  //TODO: 处理其他选择项的情况
  (optionProps.status as string[]).push("新增选项");
  // 字符串数组
  // if (isStringArray(optionProps.status)) {
  //   const lastOption = optionProps.status[optionProps.status.length - 1];
  //   const lastDigit = lastOption!.split("").reverse()[0];
  //   // 有可能最后一项拿到的不是数字
  //   // 比如性别预设值：男、女、保密，这时候就需要手动判断
  //   if (!isNaN(Number(lastDigit))) {
  //     optionProps.status.push(`新增选项${Number(lastDigit) + 1}`);
  //   } else {
  //     optionProps.status.push(`新增选项1`);
  //   }
  // }
}

export function removeOption(optionProps: OptionsProps, index: number) {
  if (optionProps.status.length === 2) {
    return false;
  }
  optionProps.status.splice(index, 1);
  return true;
}

export function setPosition(optionProps: OptionsProps, index: number) {
  optionProps.currentStatus = index;
}

export function setSize(optionProps: OptionsProps, index: number) {
  optionProps.currentStatus = index;
}

export function setWeight(optionProps: OptionsProps, weight: number) {
  optionProps.currentStatus = weight;
}

export function setItalic(optionProps: OptionsProps, italic: number) {
  optionProps.currentStatus = italic;
}

export function setColor(textProps: TextProps, color: string) {
  textProps.status = color;
}
