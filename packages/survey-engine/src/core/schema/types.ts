// 核心 Schema 类型定义（框架无关）。
// 本文件汇总了原 src/types/material.ts、src/types/editProps.ts 中不依赖 VueComType 的部分，
// 以及为"纯 JSON Schema"新增的 LowCodeSchema/SchemaComponent/FieldConfig 系列类型（data-model.md §1-3）。
// 严禁在本文件内出现任何前端框架（Vue/React 等）的 import——core/ 边界的强约束依据即此文件。
// 注：logic/types.ts 已随 core/ 拆分迁移至同级的 core/logic/ 目录（T020），路径由 "../../logic/types.js" 改为 "../logic/types.js"
import type { QuestionLogicConfig } from "../logic/types.js";

// ═══════════════════════════════════════════════════════════════════════════════
// 稳定引用键：规则引擎与 Schema 均以此作为题目的跨结构稳定引用（对应 DB 的 client_key 列）
// 定义在此处（而非 logic/types.ts）以避免 core/schema 与 core/logic 之间的循环依赖方向问题
// ═══════════════════════════════════════════════════════════════════════════════
export type ClientKey = string;

// ═══════════════════════════════════════════════════════════════════════════════
// 题型/编辑组件标识（原 src/types/material.ts 中不依赖 VueComType 的部分）
// ═══════════════════════════════════════════════════════════════════════════════

// 题目类型
export type SurveyComName =
  | "single-select"
  | "multi-select"
  | "option-select"
  | "single-pic-select"
  | "multi-pic-select"
  | "text-input"
  | "personal-info-name"
  | "personal-info-id"
  | "personal-info-tel"
  | "personal-info-wechat"
  | "personal-info-qq"
  | "personal-info-email"
  | "personal-info-address"
  | "personal-info-gender"
  | "personal-info-age"
  | "personal-info-education"
  | "personal-info-career"
  | "rate-score"
  | "date-time"
  | "cascader"
  | "matrix-single"
  | "slider"
  | "transfer"
  | "personal-info-birth"
  | "personal-info-collage"
  | "personal-info-major"
  | "personal-info-industry"
  | "personal-info-company"
  | "personal-info-position"
  | "signature";

// 业务组件类型(题目类型 + 非题目类型)
// "computed-field" 为派生计算字段伪题型：不由填写者直接输入，答案由其他题目计算得出，
// 与 text-note 一样不计入 useSurveyNo() 的题目序号统计（不是"填写者作答"意义上的题目）
export type Material = SurveyComName | "text-note" | "computed-field";

// 编辑组件类型
export type EditComName =
  | "title-editor"
  | "desc-editor"
  | "position-editor"
  | "size-editor"
  | "weight-editor"
  | "italic-editor"
  | "text-input-type-editor"
  | "text-type-editor"
  | "pic-options-editor"
  | "date-time-type-editor"
  | "rate-text-editor"
  | "cascader-options-editor"
  | "matrix-options-editor"
  | "slider-config-editor"
  | "options-editor"
  | "signature-config-editor";

export type componentName = Material | EditComName;

const SurveyComNameArr: SurveyComName[] = [
  "single-select",
  "multi-select",
  "option-select",
  "single-pic-select",
  "multi-pic-select",
  "text-input",
  "personal-info-name",
  "personal-info-id",
  "personal-info-tel",
  "personal-info-wechat",
  "personal-info-qq",
  "personal-info-email",
  "personal-info-address",
  "personal-info-gender",
  "personal-info-age",
  "personal-info-education",
  "personal-info-career",
  "rate-score",
  "date-time",
  "cascader",
  "matrix-single",
  "slider",
  "transfer",
  "personal-info-birth",
  "personal-info-collage",
  "personal-info-major",
  "personal-info-industry",
  "personal-info-company",
  "personal-info-position",
  "signature"
];

export function isSurveyComName(value: string): value is SurveyComName {
  return SurveyComNameArr.includes(value as SurveyComName);
}

const useForPDFComNameArr: Material[] = [
  "single-select",
  "multi-select",
  "single-pic-select",
  "multi-pic-select",
  "text-input",
  "text-note",
  "personal-info-name",
  "personal-info-id",
  "personal-info-tel",
  "personal-info-wechat",
  "personal-info-qq",
  "personal-info-email",
  "personal-info-address",
  "personal-info-gender",
  "personal-info-age",
  "personal-info-education",
  "personal-info-career",
  "personal-info-collage",
  "personal-info-major",
  "personal-info-industry",
  "personal-info-company",
  "personal-info-position"
];

export function isUseForPDF(value: string): value is SurveyComName {
  return useForPDFComNameArr.includes(value as SurveyComName);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 字段级配置的取值形态（原 src/types/editProps.ts 中从未依赖 VueComType 的部分）
// ═══════════════════════════════════════════════════════════════════════════════

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

export type OptionsStatusArr = StringStatusArr | ValueStatusArr | PicTitleDescStatusArr | CascaderStatusArr;

// ═══════════════════════════════════════════════════════════════════════════════
// FieldConfig：字段级配置（对应现有 BaseProps/TextProps/OptionsProps，去除组件引用）
// ═══════════════════════════════════════════════════════════════════════════════

export interface BaseFieldConfig {
  id: string;
  isShow: boolean;
  name: string;
  /** 替代现有 BaseProps.editCom: VueComType，字符串标识该字段使用哪个编辑器组件 */
  editComName: EditComName;
  isUse?: boolean;
}

export interface TextFieldConfig extends BaseFieldConfig {
  status: string;
}

export interface OptionsFieldConfig extends BaseFieldConfig {
  status: OptionsStatusArr;
  currentStatus: number;
}

export type FieldConfig = TextFieldConfig | OptionsFieldConfig;

// ═══════════════════════════════════════════════════════════════════════════════
// SchemaComponent / LowCodeSchema：题目与问卷顶层容器（对应现有 Status）
// ═══════════════════════════════════════════════════════════════════════════════

export interface SchemaComponent {
  /** 题型字符串标识，替代现有 Status.type 承担的"选哪个组件渲染"职责 */
  name: Material;
  /** 题目唯一 id（现有字段，语义不变） */
  id: string;
  /** 稳定引用键，供规则引擎 client_key 语义使用（FR-009） */
  clientKey?: ClientKey;
  /** 题目的字段级配置集合，key 为字段名（title/desc/position/...），value 为 FieldConfig */
  status: Record<string, FieldConfig>;
  /** 可选的规则配置（可见性/跳转/选项联动/派生字段） */
  logic?: QuestionLogicConfig;
  /**
   * 旧格式兼容标记（compat.ts 专用，非题目业务字段）：经 toSchemaComponent 转换后恒为 2，
   * 供 isLegacyComponent 判定幂等性；手工构造的新格式题目对象可不设置该字段
   */
  schemaVersion?: 2;
}

export interface LowCodeSchema {
  /** Schema 结构版本号，新格式恒为 2；缺失时按旧格式（1）处理，见 core/schema/compat.ts */
  schemaVersion: 2;
  /** 题目列表，顺序即问卷展示顺序 */
  components: SchemaComponent[];
}
