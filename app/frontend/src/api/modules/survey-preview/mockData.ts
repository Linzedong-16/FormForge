/**
 * 问卷预览模块 — 模拟数据
 *
 * 基于 Prisma schema 的 ReviewStatus 枚举和 q-editor 的问卷 Status 结构，
 * 生成用于测试的问卷列表和详情数据。所有数据均为前端模拟，不依赖后端 API。
 */
import { defaultStatusMap } from "monorepo-survey-engine";
import type { Status } from "monorepo-survey-engine";

// ─── 类型定义 ────────────────────────────────────────────────

/** 审核状态（与 Prisma ReviewStatus 枚举对齐） */
export type ReviewStatus = "none" | "pending" | "approved" | "rejected";

/** 审核状态的中文标签映射 */
export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  none: "未审核",
  pending: "审核中",
  approved: "已通过",
  rejected: "已驳回"
};

/** 审核状态的颜色映射（Arco Design Tag 颜色） */
export const REVIEW_STATUS_COLORS: Record<ReviewStatus, string> = {
  none: "gray",
  pending: "orangered",
  approved: "green",
  rejected: "red"
};

/** 模拟问卷列表项 */
export interface MockSurveyItem {
  id: string;
  title: string;
  reviewStatus: ReviewStatus;
  surveyType: "personal" | "template";
  questionCount: number;
  createdAt: string;
  updatedAt: string;
  author: string;
}

/** 模拟问卷详情（含渲染组件） */
export interface MockSurveyDetail {
  id: string;
  title: string;
  description: string;
  reviewStatus: ReviewStatus;
  surveyType: "personal" | "template";
  components: Status[];
  createdAt: string;
  updatedAt: string;
  author: string;
}

// ─── 组件工厂工具函数 ────────────────────────────────────────

/** 自定义组件标题（深拷贝 defaultStatusMap 生成的 Status，修改其标题） */
function makeComponent(name: string, titleText: string, descText?: string): Status {
  const factory = defaultStatusMap[name];
  if (!factory) {
    throw new Error(`[MockData] 未知组件类型: ${name}`);
  }
  const status = factory();
  // 修改标题文本
  if (status.status.title) {
    (status.status.title as any).status = titleText;
  }
  // 修改描述文本（如果组件支持）
  if (descText && status.status.desc) {
    (status.status.desc as any).status = descText;
  }
  return status;
}

// ─── 模拟问卷列表数据 ────────────────────────────────────────

const MOCK_SURVEY_LIST: MockSurveyItem[] = [
  {
    id: "mock-survey-001",
    title: "2024 年度员工满意度调研",
    reviewStatus: "approved",
    surveyType: "template",
    questionCount: 12,
    createdAt: "2024-12-01T10:30:00Z",
    updatedAt: "2024-12-15T14:20:00Z",
    author: "张三"
  },
  {
    id: "mock-survey-002",
    title: "新产品市场调研问卷",
    reviewStatus: "pending",
    surveyType: "personal",
    questionCount: 8,
    createdAt: "2025-01-10T09:15:00Z",
    updatedAt: "2025-01-12T16:45:00Z",
    author: "李四"
  },
  {
    id: "mock-survey-003",
    title: "客户服务满意度调查",
    reviewStatus: "rejected",
    surveyType: "personal",
    questionCount: 15,
    createdAt: "2025-02-20T11:00:00Z",
    updatedAt: "2025-02-28T08:30:00Z",
    author: "王五"
  },
  {
    id: "mock-survey-004",
    title: "校园活动报名表",
    reviewStatus: "none",
    surveyType: "personal",
    questionCount: 6,
    createdAt: "2025-03-05T14:00:00Z",
    updatedAt: "2025-03-05T14:00:00Z",
    author: "赵六"
  },
  {
    id: "mock-survey-005",
    title: "社区健康状况普查",
    reviewStatus: "approved",
    surveyType: "template",
    questionCount: 20,
    createdAt: "2025-03-15T08:00:00Z",
    updatedAt: "2025-04-01T17:30:00Z",
    author: "孙七"
  },
  {
    id: "mock-survey-006",
    title: "IT 服务满意度评价",
    reviewStatus: "pending",
    surveyType: "personal",
    questionCount: 10,
    createdAt: "2025-04-10T13:20:00Z",
    updatedAt: "2025-04-12T09:10:00Z",
    author: "周八"
  },
  {
    id: "mock-survey-007",
    title: "在线课程学习反馈",
    reviewStatus: "approved",
    surveyType: "template",
    questionCount: 7,
    createdAt: "2025-04-20T10:00:00Z",
    updatedAt: "2025-05-01T15:00:00Z",
    author: "吴九"
  },
  {
    id: "mock-survey-008",
    title: "公司团建活动意向征集",
    reviewStatus: "none",
    surveyType: "personal",
    questionCount: 5,
    createdAt: "2025-05-10T16:30:00Z",
    updatedAt: "2025-05-10T16:30:00Z",
    author: "郑十"
  },
  {
    id: "mock-survey-009",
    title: "酒店入住体验评价",
    reviewStatus: "rejected",
    surveyType: "personal",
    questionCount: 9,
    createdAt: "2025-05-20T09:45:00Z",
    updatedAt: "2025-05-25T11:00:00Z",
    author: "刘一"
  },
  {
    id: "mock-survey-010",
    title: "程序员职业发展调研",
    reviewStatus: "pending",
    surveyType: "template",
    questionCount: 14,
    createdAt: "2025-06-01T08:00:00Z",
    updatedAt: "2025-06-10T18:00:00Z",
    author: "陈二"
  }
];

// ─── 模拟问卷详情数据（含渲染用组件） ────────────────────────

/** 为每份问卷预生成组件详情（组件在模块加载时创建，含正确的 Vue 组件引用） */
function buildMockDetails(): Map<string, MockSurveyDetail> {
  const map = new Map<string, MockSurveyDetail>();

  // ── 问卷 001：员工满意度调研（丰富组件） ──
  map.set("mock-survey-001", {
    id: "mock-survey-001",
    title: "2024 年度员工满意度调研",
    description: "旨在了解员工对公司福利、工作环境、职业发展等方面的满意程度，为公司决策提供数据支撑。",
    reviewStatus: "approved",
    surveyType: "template",
    components: [
      makeComponent(
        "text-note",
        "尊敬的同事，您好！本问卷旨在了解您对公司的真实感受，所有回答将严格保密，请放心填写。"
      ),
      makeComponent("single-select", "您对当前的工作环境是否满意？", "请根据实际情况选择最符合的一项"),
      makeComponent("rate-score", "请为您的工作生活平衡度打分", "1-5 分，1 分表示非常不满意，5 分表示非常满意"),
      makeComponent("multi-select", "您认为公司在哪些方面需要改进？（多选）", "可同时选择多项"),
      makeComponent("text-input", "请简要描述您对公司发展的建议", "开放式回答，字数不限"),
      makeComponent("single-select", "您未来一年内是否有离职计划？"),
      makeComponent("date-time", "请选择您入职的时间"),
      makeComponent("slider", "您愿意向朋友推荐本公司吗？"),
      makeComponent("multi-select", "您最看重的工作福利有哪些？（多选）"),
      makeComponent("option-select", "您所在的部门？"),
      makeComponent("text-input", "其他想对公司说的话"),
      makeComponent("signature", "请在此处签名确认")
    ],
    createdAt: "2024-12-01T10:30:00Z",
    updatedAt: "2024-12-15T14:20:00Z",
    author: "张三"
  });

  // ── 问卷 002：新产品市场调研（中等组件） ──
  map.set("mock-survey-002", {
    id: "mock-survey-002",
    title: "新产品市场调研问卷",
    description: "针对即将发布的新产品进行市场偏好调研，收集目标用户群体的需求与反馈。",
    reviewStatus: "pending",
    surveyType: "personal",
    components: [
      makeComponent("text-note", "感谢您参与本次新产品调研！您的意见将直接影响产品设计方向。"),
      makeComponent("single-select", "您的年龄段是？"),
      makeComponent("single-pic-select", "以下哪款产品外观最吸引您？"),
      makeComponent("multi-select", "您希望产品具备哪些核心功能？（多选）"),
      makeComponent("rate-score", "请为现有竞品的满意度打分"),
      makeComponent("text-input", "您愿意为该产品支付的价格范围？"),
      makeComponent("cascader", "您所在的城市区域？"),
      makeComponent("option-select", "您是从哪个渠道了解到本产品的？")
    ],
    createdAt: "2025-01-10T09:15:00Z",
    updatedAt: "2025-01-12T16:45:00Z",
    author: "李四"
  });

  // ── 问卷 003：客户服务满意度（简单问卷） ──
  map.set("mock-survey-003", {
    id: "mock-survey-003",
    title: "客户服务满意度调查",
    description: "针对近期客户服务体验进行满意度回访，发现问题并优化服务流程。",
    reviewStatus: "rejected",
    surveyType: "personal",
    components: [
      makeComponent("text-note", "尊敬的客户，感谢您选择我们的服务！请花 2 分钟时间填写本问卷，帮助我们做得更好。"),
      makeComponent("single-select", "您对本次服务的整体满意度？"),
      makeComponent("rate-score", "请为客服人员的专业度打分"),
      makeComponent("rate-score", "请为问题解决效率打分"),
      makeComponent("multi-select", "您通过哪些渠道联系过我们？（多选）"),
      makeComponent("text-input", "请描述您遇到的问题"),
      makeComponent("date-time", "服务时间")
    ],
    createdAt: "2025-02-20T11:00:00Z",
    updatedAt: "2025-02-28T08:30:00Z",
    author: "王五"
  });

  // ── 问卷 004：报名表（最小问卷） ──
  map.set("mock-survey-004", {
    id: "mock-survey-004",
    title: "校园活动报名表",
    description: "校园文化节活动报名收集。",
    reviewStatus: "none",
    surveyType: "personal",
    components: [
      makeComponent("text-note", "欢迎报名参加 2025 年校园文化节！请填写以下信息完成报名。"),
      makeComponent("text-input", "您的姓名"),
      makeComponent("text-input", "学号"),
      makeComponent("single-select", "所在学院"),
      makeComponent("option-select", "报名项目"),
      makeComponent("text-input", "联系方式")
    ],
    createdAt: "2025-03-05T14:00:00Z",
    updatedAt: "2025-03-05T14:00:00Z",
    author: "赵六"
  });

  // ── 问卷 005：健康普查 ──
  map.set("mock-survey-005", {
    id: "mock-survey-005",
    title: "社区健康状况普查",
    description: "响应卫健委号召，开展社区居民年度健康状况普查，为公共卫生决策提供数据基础。",
    reviewStatus: "approved",
    surveyType: "template",
    components: [
      makeComponent("text-note", "本问卷由社区卫生服务中心发起，所有信息仅用于公共卫生统计，不会泄露个人隐私。"),
      makeComponent("text-input", "姓名"),
      makeComponent("single-select", "性别"),
      makeComponent("date-time", "出生日期"),
      makeComponent("text-input", "身份证号"),
      makeComponent("single-select", "您的文化程度？"),
      makeComponent("single-select", "您的职业类型？"),
      makeComponent("multi-select", "您是否有以下慢性病史？（多选）", "如无请跳过"),
      makeComponent("rate-score", "请为您目前的健康状况自评打分"),
      makeComponent("slider", "您每周的运动频率？（0-7 天）"),
      makeComponent("single-select", "您是否吸烟？"),
      makeComponent("single-select", "您的睡眠质量如何？"),
      makeComponent("matrix-single", "请对以下生活指标进行评价"),
      makeComponent("text-input", "其他需要说明的健康问题"),
      makeComponent("signature", "电子签名确认")
    ],
    createdAt: "2025-03-15T08:00:00Z",
    updatedAt: "2025-04-01T17:30:00Z",
    author: "孙七"
  });

  return map;
}

/** 预生成的模拟详情 Map */
const MOCK_DETAIL_MAP = buildMockDetails();

// ─── 导出 API ──────────────────────────────────────────────────

/** 获取模拟问卷列表 */
export function getMockSurveyList(): MockSurveyItem[] {
  return [...MOCK_SURVEY_LIST];
}

/**
 * 按审核状态筛选问卷列表
 * @param status 审核状态，传入 null 或 undefined 表示不筛选
 */
export function filterMockSurveys(status: ReviewStatus | null): MockSurveyItem[] {
  if (!status) return getMockSurveyList();
  return MOCK_SURVEY_LIST.filter(item => item.reviewStatus === status);
}

/** 根据 ID 获取模拟问卷详情（含渲染组件） */
export function getMockSurveyDetail(id: string): MockSurveyDetail | null {
  return MOCK_DETAIL_MAP.get(id) ?? null;
}

/** 模拟异步加载延迟（模拟网络请求） */
export function mockDelay(ms = 300): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
