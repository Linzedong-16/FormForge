import type { VueComType } from "./common";

export interface BaseProps {
  id: string;
  isShow: boolean;
  name: string;
  editCom: VueComType;
  isUse?: boolean;
}

export type StringStatusArr = string[];
export type ValueStatusArr = Array<{ value: string; status: string }>;
export type PicTitleDescStatusArr = Array<{
  picTitle: string;
  picDesc: string;
  value: string;
}>;

// 级联选项节点（树形，深度最高 4 级），用于多级联动题的自定义模式
export interface CascaderOptionItem {
  label: string;
  value: string;
  children?: CascaderOptionItem[];
}
export type CascaderStatusArr = CascaderOptionItem[];

export interface TextProps extends BaseProps {
  status: string;
}
export type OptionsStatusArr = StringStatusArr | ValueStatusArr | PicTitleDescStatusArr | CascaderStatusArr;
export interface OptionsProps extends BaseProps {
  status: OptionsStatusArr;
  currentStatus: number;
}

// 公共的设置项，每个组件都有的设置项
export interface BaseStatus {
  title: TextProps;
  desc: TextProps;
  position: OptionsProps;
  titleSize: OptionsProps;
  descSize: OptionsProps;
  titleWeight: OptionsProps;
  descWeight: OptionsProps;
  titleItalic: OptionsProps;
  descItalic: OptionsProps;
  titleColor: TextProps;
  descColor: TextProps;
}

// 因为不是所有业务组件都有 options 这个设置项
export interface OptionsStatus extends BaseStatus {
  options: OptionsProps;
}

// 矩阵单选题的设置项：matrixRows 行（评价维度）、matrixColumns 列（评价等级），均为字符串数组
export interface MatrixStatus extends BaseStatus {
  matrixRows: OptionsProps;
  matrixColumns: OptionsProps;
}

// 滑块题的设置项：sliderConfig.status 为 [最小值, 最大值, 步长] 的字符串数组
export interface SliderStatus extends BaseStatus {
  sliderConfig: OptionsProps;
}

// 排序题的设置项：transferItems.status 为待排序选项的字符串数组
export interface TransferStatus extends BaseStatus {
  transferItems: OptionsProps;
}
// 备注组件的设置项
export interface TypeStatus extends BaseStatus {
  type: OptionsProps;
}

// 多级联动题的设置项：cascaderOptions 复用 OptionsProps，isUse 表示是否自定义模式，
// status 在自定义模式下为级联树（CascaderStatusArr）
export interface CascaderStatus extends BaseStatus {
  cascaderOptions: OptionsProps;
}

/**
 * 判断是否为字符串数组
 * @param status
 * @returns
 */
export function isStringArray(status: OptionsStatusArr): status is string[] {
  return Array.isArray(status) && typeof status[0] === "string";
}

// 确定 status 是 { value: string; status: string } 这种类型的数组
export function isValueStatusArr(status: OptionsStatusArr): status is ValueStatusArr {
  return Array.isArray(status) && typeof status[0] === "object" && "value" in status[0] && "status" in status[0];
}

// 确定 status 是 { picTitle: string; picDesc: string; value: string } 这种类型的数组
export function isPicTitleDescStatusArr(status: OptionsStatusArr): status is PicTitleDescStatusArr {
  return (
    Array.isArray(status) &&
    typeof status[0] === "object" &&
    "picTitle" in status[0] &&
    "picDesc" in status[0] &&
    "value" in status[0]
  );
}

export type PicLink = { link: string; index: number };
export function isPicLink(obj: object): obj is PicLink {
  return "link" in obj && "index" in obj;
}

// 确定 status 是级联节点数组（含 label + value，且无 status/picTitle，以区别于其它形态）
export function isCascaderArr(status: OptionsStatusArr): status is CascaderStatusArr {
  return (
    Array.isArray(status) &&
    typeof status[0] === "object" &&
    "label" in status[0] &&
    "value" in status[0] &&
    !("status" in status[0]) &&
    !("picTitle" in status[0])
  );
}

export function isRateScoreDesc(payload: object): payload is { index: number; val: string } {
  return "index" in payload && "val" in payload;
}

export function isOptionsProps(props: TextProps | OptionsProps): props is OptionsProps {
  return props && Array.isArray(props.status);
}

export type StatusArray = StringStatusArr | ValueStatusArr | PicTitleDescStatusArr | CascaderStatusArr;

// 判断是否为选项组件的设置项
export function IsOptionsStatus(status: BaseStatus): status is OptionsStatus {
  return "options" in status;
}

export function IsTypeStatus(status: BaseStatus): status is TypeStatus {
  return "type" in status;
}
