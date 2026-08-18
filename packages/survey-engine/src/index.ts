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
// componentMap 已随 T013 迁移到 adapters/vue3/（原 configs/componentMap.ts 已删除），
// 此处改为指向新路径，对外导出符号名称与用法保持不变
export { componentMap } from "./adapters/vue3/componentMap";

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
  openNewTab
} from "./utils/index";
// restoreComponentStatus 已随 T014 迁移到 adapters/vue3/（避免循环依赖），此处改为指向新路径
export { restoreComponentStatus } from "./adapters/vue3/restoreComponentStatus";

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
// UndoManager 已随 T030 迁移到 core/orchestration/，此处改为指向新路径，对外导出符号名称不变
export { UndoManager } from "./core/orchestration/undoManager";
export type { Snapshot } from "./core/orchestration/undoManager";

// ═══ 事件总线 ═════════════════════════════════════════════════════════════════
export { default as emitter } from "./utils/eventBus";
export type { Events } from "./types/eventBus";

// ═══ API ══════════════════════════════════════════════════════════════════════
export { uploadImage } from "./api/upload";

// ═══ 动态表单引擎 —— 显示/隐藏、跳转、选项联动、派生字段、发布校验等规则子模块 ═══
// 纯规则引擎符号（框架无关）已随 T020-T023 迁移至 core/logic/；useRuleRuntime 依赖 vue，
// 已迁移至 adapters/vue3/useRuleRuntime（T024），此处按来源拆分为两个导出块，对外符号名称不变
export {
  normalizeAnswerValue,
  resolveVisibility,
  resolveJump,
  resolveOptionPool,
  computeDerivedField,
  validateRuleSet
} from "./core/logic";
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
  RuleValidationResult
} from "./core/logic";

export { useRuleRuntime } from "./adapters/vue3/useRuleRuntime";
export type { RuleRuntimeComponent, UseRuleRuntimeOptions, UseRuleRuntimeReturn } from "./adapters/vue3/useRuleRuntime";
