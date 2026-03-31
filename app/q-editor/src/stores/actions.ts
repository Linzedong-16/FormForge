import {
  isPicTitleDescStatusArr,
  isRateScoreDesc,
  isStringArray,
  type OptionsProps,
  type PicLink,
  type TextProps
} from "@/types";
export function setTextStatus(textProps: TextProps, text: string) {
  textProps.status = text;
}

/**
 * 添加选项
 * @param optionProps
 */
export function addOption(optionProps: OptionsProps) {
  if (isStringArray(optionProps.status)) {
    const lastOption = optionProps.status[optionProps.status.length - 1];
    const lastDigit = lastOption!.split("").reverse()[0];
    // 有可能最后一项拿到的不是数字
    // 比如性别预设值：男、女、保密，这时候就需要手动判断

    // 多选题直接使用选项内容作为唯一标识，并不是bug，而是设计选择，如果重复内容就会导致选项关联问题，可以间接提示用户修改
    if (!isNaN(Number(lastDigit))) {
      optionProps.status.push(`新增选项${Number(lastDigit) + 1}`);
    } else {
      optionProps.status.push(`新增选项1`);
    }
  } else if (isPicTitleDescStatusArr(optionProps.status)) {
    optionProps.status.push({ picTitle: "图片标题", picDesc: "图片描述", value: "" });
  }
}

export function removeOption(optionProps: OptionsProps, index: number) {
  if (optionProps.status.length === 2) {
    return false;
  }
  optionProps.status.splice(index, 1);
  return true;
}

// TODO: 优化为 setCurrentStatus
export function setCurrentStatus(optionProps: OptionsProps, index: number) {
  optionProps.currentStatus = index;
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

export function setPicLinkByIndex(optionProps: OptionsProps, payload: PicLink) {
  if (isPicTitleDescStatusArr(optionProps.status)) {
    // 使用非空断言操作符，因为已通过类型检查确保元素存在
    optionProps.status[payload.index]!.value = payload.link;
  }
}

export function setIsUse(optionProps: OptionsProps, isUse: boolean) {
  optionProps.isUse = isUse;
}

export function setRateScoreDesc(optionProps: OptionsProps, payload: { index: number; val: string }) {
  if (isRateScoreDesc(optionProps.status)) {
    optionProps.status[payload.index] = payload.val;
  }
}
