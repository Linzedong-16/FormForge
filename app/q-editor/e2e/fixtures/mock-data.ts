/**
 * Mock 数据常量 — 与 src/mock/ 中的 Mock 数据保持一致
 */

/** 测试用户 */
export const TEST_USERS = {
  admin: {
    email: "admin@example.com",
    password: "Admin@123",
    username: "系统管理员",
    role: "super_admin"
  },
  normal: {
    email: "user@example.com",
    password: "User@1234",
    username: "测试用户",
    role: "user"
  },
  disabled: {
    email: "disabled@test.com",
    password: "Disabled1",
    username: "已禁用"
  }
} as const;

/** Demo 问卷 */
export const DEMO_SURVEY = {
  id: "10001",
  title: "2026 年度员工满意度调查",
  description: "感谢您抽出时间参与本次调查，您的反馈对我们至关重要",
  questionCount: 3 // 单选题 + 多选题 + 文本输入
};

/** 动态规则测试问卷 — 覆盖显示/隐藏、选项联动、跳题结束、派生计算字段四类动态表单能力，与 DEMO_SURVEY 相互独立 */
export const DYNAMIC_SURVEY = {
  id: "10002",
  title: "动态规则能力验证问卷",
  questionKeys: {
    willing: "q_willing",
    reason: "q_reason",
    region: "q_region",
    city: "q_city",
    eligibility: "q_eligibility",
    afterEligibility: "q_after_eligibility",
    scoreA: "q_score_a",
    scoreB: "q_score_b",
    totalVisible: "q_total_visible",
    totalHidden: "q_total_hidden"
  },
  questionTitles: {
    willing: "您是否愿意参与后续深度访谈？",
    reason: "请简单说明您的顾虑或期待",
    region: "您目前所在的地区？",
    city: "请选择您所在的城市",
    eligibility: "您是否符合本次活动的报名资格？",
    afterEligibility: "请填写您的报名联系方式",
    scoreA: "请为方案A打分（0-100）",
    scoreB: "请为方案B打分（0-100）",
    totalVisible: "两项打分总和（可见）",
    totalHidden: "两项打分总和（隐藏，仅供校验）"
  }
};

/** 路由路径 */
export const ROUTES = {
  land: "/",
  login: "/login",
  home: "/home",
  materials: "/materials",
  selectGroup: "/select-group",
  singleSelect: "/single-select",
  multiSelect: "/multi-select",
  optionSelect: "/option-select",
  singlePicSelect: "/single-pic-select",
  multiPicSelect: "/multi-pic-select",
  inputGroup: "/input-group",
  textInput: "/text-input",
  advancedGroup: "/advanced-group",
  dateTime: "/date-time",
  rateScore: "/rate-score",
  cascader: "/cascader",
  matrixSingle: "/matrix-single",
  slider: "/slider",
  transfer: "/transfer",
  noteGroup: "/note-group",
  textNote: "/text-note",
  personalInfoGroup: "/personal-info-group",
  contactGroup: "/contact-group",
  editor: "/editor",
  editorSurveyType: "/editor/survey-type",
  editorOutline: "/editor/outline",
  editorTemplateMarket: "/editor/template-market",
  preview: (id: string) => `/preview/${id}`,
  survey: (id: string) => `/survey/${id}`,
  settings: "/settings"
} as const;

/** 页面标题/关键文本 */
export const PAGE_TEXTS = {
  loginTitle: "登录",
  registerTitle: "注册",
  homeTitle: "首页",
  settingsTitle: "个人设置",
  materialsTitle: "素材库",
  editorTitle: "编辑器"
} as const;

/** 问卷组件类型 */
export const COMPONENT_TYPES = {
  singleSelect: "single_select",
  multiSelect: "multi_select",
  optionSelect: "option_select",
  singlePicSelect: "single_pic_select",
  multiPicSelect: "multi_pic_select",
  textInput: "text_input",
  textNote: "text_note",
  dateTime: "date_time",
  rateScore: "rate_score",
  cascader: "cascader",
  matrixSingle: "matrix_single",
  slider: "slider",
  transfer: "transfer",
  signature: "signature"
} as const;

/** 超时时间 */
export const TIMEOUTS = {
  short: 2_000,
  medium: 5_000,
  long: 15_000,
  navigation: 20_000
} as const;
