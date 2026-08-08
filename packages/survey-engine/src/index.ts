// ──────────────────────────────────────────────────────────────────────────────
// 问卷低代码渲染引擎 — 统一导出入口
//
// 本包封装了完整的问卷渲染能力，可被 q-editor、frontend 等前端项目共享使用。
//
// 包含三大类导出：
//   1. 组件注册表 — componentMap（Material 业务组件 + EditItem 编辑组件）
//   2. 核心 Store — useEditorStore（问卷编辑器/渲染器状态管理）
//   3. 类型系统 — Status / OptionsStatus / SurveyDBData 等所有 TS 类型
//   4. 工具函数 — getTextStatus / restoreComponentStatus 等渲染辅助函数
//   5. 配置 — SurveyGroupConfig / regionData / defaultStatusMap
//
// 使用示例：
//   import { componentMap, useEditorStore } from "monorepo-survey-engine";
// ──────────────────────────────────────────────────────────────────────────────

// ═══ 组件注册表 ═══════════════════════════════════════════════════════════════
export { componentMap } from "./configs/componentMap";

// ═══ 题型面板配置 ═════════════════════════════════════════════════════════════
export { getSurveyComsList } from "./configs/SurveyGroupConfig";

// ═══ 地域数据 ═════════════════════════════════════════════════════════════════
export { regionData } from "./configs/regionData";
export type { RegionNode } from "./configs/regionData";

// ═══ 默认状态配置 ═════════════════════════════════════════════════════════════
export { defaultStatusMap } from "./configs/defaultStatus/defaultStatusMap";
export { initStore } from "./configs/defaultStatus/initStatus";

// ═══ Store ════════════════════════════════════════════════════════════════════
export { useEditorStore } from "./stores/useEditor";

// ═══ 工具函数 ═════════════════════════════════════════════════════════════════
export {
  getTextStatus,
  getStringStatus,
  getCurrentStatus,
  getStringStatusByCurrentStatus,
  getValueStatusByCurrentStatus,
  getPicTitleDescStatusArr,
  getValueStatus,
  isValueStatusArray,
  isPicTitleDescArray,
  changeEditorIsShowStatus,
  updateInitStatusBeforeAdd,
  formatDate,
  restoreComponentStatus,
  openNewTab
} from "./utils/index";

export { useSurveyNo } from "./utils/hooks";

// ═══ 类型 ═════════════════════════════════════════════════════════════════════
export type {
  // common.ts
  VueComType,
  Status,
  // editProps.ts
  BaseProps,
  StringStatusArr,
  ValueStatusArr,
  PicTitleDescStatusArr,
  CascaderOptionItem,
  CascaderStatusArr,
  TextProps,
  OptionsProps,
  BaseStatus,
  OptionsStatus,
  MatrixStatus,
  SliderStatus,
  SignatureStatus,
  TransferStatus,
  TypeStatus,
  CascaderStatus,
  // material.ts
  TabInfo,
  SurveyComName,
  Material,
  EditComName,
  ComponentMap,
  // editor.ts
  MaterialItem,
  MaterialItemList,
  MaterialGroup,
  DefaultStatusMap,
  // db.ts
  SurveyDBData,
  SurveyDBReturnData,
  // store.ts
  UpdateStatus,
  GetLink,
  Actions,
  MaterialStore,
  EditorStore,
  QuizData
} from "./types";

// ═══ 类型谓词 ═════════════════════════════════════════════════════════════════
export {
  isSurveyComName,
  isUseForPDF,
  isStringArray,
  isValueStatusArr,
  isPicTitleDescStatusArr,
  isCascaderArr,
  isPicLink,
  isRateScoreDesc,
  isOptionsProps,
  canUsedForPDF
} from "./types";

// ═══ i18n 消息（供外部项目合并翻译，解决问卷组件 useI18n() 调用） ═══════════
export { engineMessages } from "./i18n/messages";

// ═══ 撤销/重做 ════════════════════════════════════════════════════════════════
export { UndoManager } from "./utils/undoManager";
export type { Snapshot } from "./utils/undoManager";

// ═══ 事件总线 ═════════════════════════════════════════════════════════════════
export { default as emitter } from "./utils/eventBus";
export type { Events } from "./types/eventBus";

// ═══ API ══════════════════════════════════════════════════════════════════════
export { uploadImage } from "./api/upload";

// ═══ 动态表单引擎 —— 显示/隐藏、跳转、选项联动、派生字段、发布校验等规则子模块 ═══
export {
  normalizeAnswerValue,
  useRuleRuntime,
  resolveVisibility,
  resolveJump,
  resolveOptionPool,
  computeDerivedField,
  validateRuleSet
} from "./logic";
export type {
  ClientKey,
  ComparisonOperator,
  LogicCombinator,
  RawAnswerValue,
  NormalizedValue,
  Condition,
  ConditionGroup,
  VisibilityAction,
  VisibilityRule,
  QuestionVisibilityConfig,
  JumpTargetType,
  JumpTarget,
  JumpRule,
  QuestionJumpConfig,
  OptionDependencyMapping,
  ComputedFieldFormula,
  ComputedFieldConfig,
  QuestionLogicConfig,
  RuleViolationType,
  RuleViolation,
  RuleValidationResult,
  RuleRuntimeComponent,
  UseRuleRuntimeOptions,
  UseRuleRuntimeReturn
} from "./logic";
