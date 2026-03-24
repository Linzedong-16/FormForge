import { isPicTitleDescStatusArr, isStringArray, type OptionsProps, type PicLink, type TextProps } from "@/types";
export function setTextStatus(textProps: TextProps, text: string) {
  textProps.status = text;
}

/**
 * 添加选项
 * @param optionProps
 */
export function addOption(optionProps: OptionsProps) {
  if (isStringArray(optionProps.status)) {
    optionProps.status.push("新选项");
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
