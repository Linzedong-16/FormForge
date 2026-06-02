import type { Material } from "./material.js";

// ── 选项数组的三种形态 ────────────────────────────────────────────────────────

/** 纯文本选项列表，如 ['选项A', '选项B'] */
export type StringOptionsArr = string[];

/** 带当前选中状态的选项列表，用于下拉选择等 */
export type ValueStatusArr = Array<{ value: string; status: string }>;

/** 带图片、标题、描述的选项列表，用于图片选择题 */
export type PicTitleDescArr = Array<{ picTitle: string; picDesc: string; value: string }>;

export type OptionsStatusArr = StringOptionsArr | ValueStatusArr | PicTitleDescArr;

// ── 属性节点（网络传输格式，不含 Vue 组件引用）────────────────────────────────

/**
 * 文本类属性节点（对应 q-editor 的 TextProps）
 * editCom 在前端为 Vue 组件引用，序列化后为不透明对象，后端不应读取此字段。
 */
export interface SerializedTextProp {
  id: string;
  isShow: boolean;
  name: string;
  editCom?: unknown;
  isUse?: boolean;
  /** 当前文本值 */
  status: string;
}

/**
 * 选项类属性节点（对应 q-editor 的 OptionsProps）
 */
export interface SerializedOptionsProp {
  id: string;
  isShow: boolean;
  name: string;
  editCom?: unknown;
  isUse?: boolean;
  /** 选项列表 */
  status: OptionsStatusArr;
  /** 当前选中项的索引 */
  currentStatus: number;
}

/**
 * 组件的 status 字段：由若干具名配置属性组成的 Map
 * key 为属性名（如 'title'、'options'、'type' 等），value 为对应属性节点
 */
export type SurveyComponentStatus = Record<string, SerializedTextProp | SerializedOptionsProp>;

// ── 组件传输格式 ──────────────────────────────────────────────────────────────

/**
 * 前后端传输时的问卷组件格式（对应 q-editor 的 Status 接口）
 *
 * 说明：
 * - `type` 在前端为 Vue 组件实例，JSON 序列化后为不透明对象；
 *   后端将其存为 JSON 字符串，前端通过 `restoreComponentStatus()` 还原为 Vue 组件。
 *   后端逻辑不应依赖此字段，应使用 `name` 判断组件类型。
 * - `status` 存储所有可编辑属性，key 固定见各组件 defaultStatus 定义。
 */
export interface SurveyComponentPayload {
  /** Vue 组件序列化值（后端视为不透明数据） */
  type: unknown;
  /** 组件名称，唯一标识组件类型，后端应以此字段判断题目种类 */
  name: Material;
  /** 组件实例 UUID */
  id: string;
  /** 组件配置属性集合 */
  status: SurveyComponentStatus;
}
