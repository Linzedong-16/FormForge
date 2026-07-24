/**
 * 独立部署 (Standalone) Mock 数据层
 *
 * 为 GitHub Pages 静态演示提供所有假数据：
 *   - 用户认证信息（Token / 账号 / 角色）
 *   - 用户资料（头像 / 昵称 / 职业等）
 *   - 演示问卷（含完整组件配置）
 *   - 模板市场数据
 *   - 系统配置
 *
 * 所有数据均为写死的静态数据，不依赖任何后端服务。
 */

// ════════════════════════════════════════════════════════════════
//  1. 用户认证数据
// ════════════════════════════════════════════════════════════════

/** 演示管理员账号（一键登录使用） */
export const DEMO_ACCOUNT = {
  email: "admin@example.com",
  password: "Admin@123"
} as const;

export interface MockUser {
  id: string;
  email: string;
  username: string;
  password: string;
  role: "super_admin" | "user" | "admin";
  status: number;
}

/** 预置用户列表 */
export const users: MockUser[] = [
  {
    id: "1",
    email: "admin@example.com",
    username: "系统管理员",
    password: "Admin@123",
    role: "super_admin",
    status: 1
  },
  {
    id: "2",
    email: "user@example.com",
    username: "测试用户",
    password: "User@1234",
    role: "user",
    status: 1
  }
];

/** 固定 Mock Token */
export const MOCK_TOKEN = "mock_standalone_access_token_rpk16_demo";
export const MOCK_REFRESH_TOKEN = "mock_standalone_refresh_token_rpk16_demo";
export const MOCK_TOKEN_EXPIRES_IN = 3600;
export const MOCK_REFRESH_EXPIRES_IN = 604800;

// ════════════════════════════════════════════════════════════════
//  2. 用户资料 (Profile)
// ════════════════════════════════════════════════════════════════

/** 写死的用户头像 URL */
export const DEMO_AVATAR_URL = "https://linzex.top/upload/1759642363899.gif";

/** 演示用户资料 */
export const demoProfile = {
  userId: "1",
  email: "admin@example.com",
  username: "系统管理员",
  avatarUrl: DEMO_AVATAR_URL,
  thumbnailUrl: DEMO_AVATAR_URL,
  nickname: "管理员",
  occupation: "系统管理员",
  bio: "FormForge 低代码问卷平台管理员 | 专注于问卷设计与数据分析",
  interests: ["低代码", "问卷设计", "开源", "Vue.js", "TypeScript"],
  boundEmail: "admin@example.com",
  emailVerified: true
};

// ════════════════════════════════════════════════════════════════
//  3. 系统状态
// ════════════════════════════════════════════════════════════════

export const systemStatus = {
  initialized: true,
  registrationEnabled: true,
  registrationMode: "email_verify" as const,
  smtpConfigured: true
};

// ════════════════════════════════════════════════════════════════
//  4. 管理后台 — 用户列表
// ════════════════════════════════════════════════════════════════

interface MockAdminUser {
  id: string;
  email: string;
  username: string;
  role: string;
  status: number;
  created_at: string;
  last_login_at: string | null;
  isBanned: boolean;
  banRemaining: number | null;
  isDeleted: boolean;
}

export const adminUsers: MockAdminUser[] = [
  {
    id: "1",
    email: "admin@example.com",
    username: "系统管理员",
    role: "super_admin",
    status: 1,
    created_at: "2026-01-01T00:00:00Z",
    last_login_at: new Date().toISOString(),
    isBanned: false,
    banRemaining: null,
    isDeleted: false
  },
  {
    id: "2",
    email: "user@example.com",
    username: "测试用户",
    role: "user",
    status: 1,
    created_at: "2026-03-15T12:00:00Z",
    last_login_at: "2026-06-06T18:00:00Z",
    isBanned: false,
    banRemaining: null,
    isDeleted: false
  },
  {
    id: "3",
    email: "disabled@test.com",
    username: "已禁用用户",
    role: "user",
    status: 0,
    created_at: "2026-02-20T09:00:00Z",
    last_login_at: null,
    isBanned: false,
    banRemaining: null,
    isDeleted: false
  }
];

// ════════════════════════════════════════════════════════════════
//  5. 问卷数据 — 演示用
// ════════════════════════════════════════════════════════════════

interface MockComponent {
  id: string;
  survey_id: string;
  type: string;
  config: Record<string, unknown>;
  order_index: number;
  required: 0 | 1;
  created_at: string;
  updated_at: string;
}

interface MockSurvey {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  status: 0 | 1 | 2; // 0=草稿, 1=已发布, 2=已关闭
  page_size: number;
  total_questions: number;
  responses_count: number;
  is_public: 0 | 1;
  access_code: string | null;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  closed_at: string | null;
  components: MockComponent[];
  review_status: string;
}

const NOW = new Date().toISOString();

/** 构建演示组件配置的工厂函数 */
function makeDemoComponents(surveyId: string): MockComponent[] {
  return [
    // 标题组件
    {
      id: `${surveyId}_comp_01`,
      survey_id: surveyId,
      type: "text_note",
      config: {
        type: { currentStatus: 0, status: [0, 1], isShow: false, name: "text-type-editor" },
        title: { status: "2026 年度员工满意度调查", isShow: true, name: "title-editor" },
        desc: { status: "", isShow: true, name: "desc-editor" },
        position: { currentStatus: 1, status: ["左对齐", "居中"], isShow: true, name: "position-editor" },
        titleSize: { currentStatus: 2, status: ["22", "20", "18"], isShow: true, name: "size-editor" },
        descSize: { currentStatus: 0, status: ["16", "14", "12"], isShow: true, name: "size-editor" },
        titleWeight: { currentStatus: 0, status: ["粗体", "正常"], isShow: true, name: "weight-editor" },
        descWeight: { currentStatus: 1, status: ["粗体", "正常"], isShow: true, name: "weight-editor" },
        titleItalic: { currentStatus: 1, status: ["斜体", "正常"], isShow: true, name: "italic-editor" },
        descItalic: { currentStatus: 1, status: ["斜体", "正常"], isShow: true, name: "italic-editor" },
        titleColor: { status: "#18181b", isShow: true, name: "color-editor" },
        descColor: { status: "#909399", isShow: true, name: "color-editor" }
      },
      order_index: 0,
      required: 1,
      created_at: NOW,
      updated_at: NOW
    },
    // 描述段落
    {
      id: `${surveyId}_comp_02`,
      survey_id: surveyId,
      type: "text_note",
      config: {
        type: { currentStatus: 1, status: [0, 1], isShow: false, name: "text-type-editor" },
        title: { status: "", isShow: true, name: "title-editor" },
        desc: { status: "感谢您抽出时间参与本次调查，您的反馈对我们至关重要！", isShow: true, name: "desc-editor" },
        position: { currentStatus: 1, status: ["左对齐", "居中"], isShow: true, name: "position-editor" },
        titleSize: { currentStatus: 0, status: ["22", "20", "18"], isShow: true, name: "size-editor" },
        descSize: { currentStatus: 0, status: ["16", "14", "12"], isShow: true, name: "size-editor" },
        titleWeight: { currentStatus: 1, status: ["粗体", "正常"], isShow: true, name: "weight-editor" },
        descWeight: { currentStatus: 1, status: ["粗体", "正常"], isShow: true, name: "weight-editor" },
        titleItalic: { currentStatus: 1, status: ["斜体", "正常"], isShow: true, name: "italic-editor" },
        descItalic: { currentStatus: 1, status: ["斜体", "正常"], isShow: true, name: "italic-editor" },
        titleColor: { status: "#18181b", isShow: true, name: "color-editor" },
        descColor: { status: "#71717a", isShow: true, name: "color-editor" }
      },
      order_index: 1,
      required: 0,
      created_at: NOW,
      updated_at: NOW
    },
    // 单选题
    {
      id: `${surveyId}_comp_03`,
      survey_id: surveyId,
      type: "single_select",
      config: {
        type: { currentStatus: 2, status: [2, 3, 10, 4], isShow: false, name: "text-type-editor" },
        title: { status: "您对目前工作环境的满意程度？", isShow: true, name: "title-editor" },
        desc: { status: "", isShow: true, name: "desc-editor" },
        options: {
          status: ["非常满意", "比较满意", "一般", "不太满意"],
          currentStatus: 0,
          isShow: true,
          name: "options-editor"
        },
        position: { currentStatus: 0, status: ["左对齐", "居中"], isShow: true, name: "position-editor" },
        titleSize: { currentStatus: 0, status: ["22", "20", "18"], isShow: true, name: "size-editor" },
        descSize: { currentStatus: 0, status: ["16", "14", "12"], isShow: true, name: "size-editor" },
        titleWeight: { currentStatus: 0, status: ["粗体", "正常"], isShow: true, name: "weight-editor" },
        descWeight: { currentStatus: 1, status: ["粗体", "正常"], isShow: true, name: "weight-editor" },
        titleItalic: { currentStatus: 1, status: ["斜体", "正常"], isShow: true, name: "italic-editor" },
        descItalic: { currentStatus: 1, status: ["斜体", "正常"], isShow: true, name: "italic-editor" },
        titleColor: { status: "#18181b", isShow: true, name: "color-editor" },
        descColor: { status: "#909399", isShow: true, name: "color-editor" }
      },
      order_index: 2,
      required: 1,
      created_at: NOW,
      updated_at: NOW
    },
    // 多选题
    {
      id: `${surveyId}_comp_04`,
      survey_id: surveyId,
      type: "multi_select",
      config: {
        type: { currentStatus: 3, status: [2, 3, 10, 4], isShow: false, name: "text-type-editor" },
        title: { status: "您希望公司在哪些方面做出改善？（可多选）", isShow: true, name: "title-editor" },
        desc: { status: "", isShow: true, name: "desc-editor" },
        options: {
          status: ["薪资福利", "晋升机制", "工作氛围", "培训学习", "弹性工作"],
          currentStatus: 0,
          isShow: true,
          name: "options-editor"
        },
        position: { currentStatus: 0, status: ["左对齐", "居中"], isShow: true, name: "position-editor" },
        titleSize: { currentStatus: 0, status: ["22", "20", "18"], isShow: true, name: "size-editor" },
        descSize: { currentStatus: 0, status: ["16", "14", "12"], isShow: true, name: "size-editor" },
        titleWeight: { currentStatus: 0, status: ["粗体", "正常"], isShow: true, name: "weight-editor" },
        descWeight: { currentStatus: 1, status: ["粗体", "正常"], isShow: true, name: "weight-editor" },
        titleItalic: { currentStatus: 1, status: ["斜体", "正常"], isShow: true, name: "italic-editor" },
        descItalic: { currentStatus: 1, status: ["斜体", "正常"], isShow: true, name: "italic-editor" },
        titleColor: { status: "#18181b", isShow: true, name: "color-editor" },
        descColor: { status: "#909399", isShow: true, name: "color-editor" }
      },
      order_index: 3,
      required: 1,
      created_at: NOW,
      updated_at: NOW
    },
    // 文本输入
    {
      id: `${surveyId}_comp_05`,
      survey_id: surveyId,
      type: "text_input",
      config: {
        type: { currentStatus: 4, status: [4], isShow: false, name: "text-type-editor" },
        title: { status: "请留下您的其他建议或意见", isShow: true, name: "title-editor" },
        desc: { status: "", isShow: true, name: "desc-editor" },
        placeholder: { status: "请在此输入...", isShow: true, name: "text-input-type-editor" },
        position: { currentStatus: 0, status: ["左对齐", "居中"], isShow: true, name: "position-editor" },
        titleSize: { currentStatus: 0, status: ["22", "20", "18"], isShow: true, name: "size-editor" },
        descSize: { currentStatus: 0, status: ["16", "14", "12"], isShow: true, name: "size-editor" },
        titleWeight: { currentStatus: 0, status: ["粗体", "正常"], isShow: true, name: "weight-editor" },
        descWeight: { currentStatus: 1, status: ["粗体", "正常"], isShow: true, name: "weight-editor" },
        titleItalic: { currentStatus: 1, status: ["斜体", "正常"], isShow: true, name: "italic-editor" },
        descItalic: { currentStatus: 1, status: ["斜体", "正常"], isShow: true, name: "italic-editor" },
        titleColor: { status: "#18181b", isShow: true, name: "color-editor" },
        descColor: { status: "#909399", isShow: true, name: "color-editor" }
      },
      order_index: 4,
      required: 0,
      created_at: NOW,
      updated_at: NOW
    }
  ];
}

/** 统计答题型组件数量（排除 text_note 等展示型组件） */
function countQuestions(components: MockComponent[]): number {
  return components.filter(c => c.type !== "text_note").length;
}

/** 预置演示问卷 */
export function createDemoSurveys(): MockSurvey[] {
  const survey1Id = "demo_10001";
  const survey2Id = "demo_10002";
  const survey3Id = "demo_10003";

  return [
    {
      id: survey1Id,
      user_id: "1",
      title: "2026 年度员工满意度调查",
      description: "感谢您抽出时间参与本次调查，您的反馈对我们至关重要",
      status: 1,
      page_size: 10,
      total_questions: countQuestions(makeDemoComponents(survey1Id)),
      responses_count: 3,
      is_public: 1,
      access_code: null,
      created_at: NOW,
      updated_at: NOW,
      published_at: NOW,
      closed_at: null,
      components: makeDemoComponents(survey1Id),
      review_status: "approved"
    },
    {
      id: survey2Id,
      user_id: "1",
      title: "产品用户体验反馈问卷",
      description: "帮助我们改进产品体验，您的意见对我们非常重要",
      status: 1,
      page_size: 10,
      total_questions: 4,
      responses_count: 8,
      is_public: 1,
      access_code: null,
      created_at: NOW,
      updated_at: NOW,
      published_at: NOW,
      closed_at: null,
      components: makeDemoComponents(survey2Id),
      review_status: "approved"
    },
    {
      id: survey3Id,
      user_id: "1",
      title: "新功能需求调研（草稿）",
      description: "收集用户对新功能的需求和优先级",
      status: 0,
      page_size: 10,
      total_questions: 2,
      responses_count: 0,
      is_public: 0,
      access_code: null,
      created_at: NOW,
      updated_at: NOW,
      published_at: null,
      closed_at: null,
      components: makeDemoComponents(survey3Id).slice(0, 3),
      review_status: "none"
    }
  ];
}

/** 全局可变问卷存储（支持创建/编辑/删除） */
export const surveyStore: MockSurvey[] = createDemoSurveys();

// ════════════════════════════════════════════════════════════════
//  6. 答卷数据
// ════════════════════════════════════════════════════════════════

interface MockResponse {
  id: string;
  survey_id: string;
  user_id: string | null;
  anonymous_id: string | null;
  status: 0 | 1;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
  answers: Array<{ component_id: string; value?: string; values?: string[] }>;
}

export const responseStore: MockResponse[] = [
  {
    id: "resp_01",
    survey_id: "demo_10001",
    user_id: null,
    anonymous_id: "anon_01",
    status: 1,
    submitted_at: NOW,
    created_at: NOW,
    updated_at: NOW,
    answers: [
      { component_id: "demo_10001_comp_03", value: "非常满意" },
      { component_id: "demo_10001_comp_04", values: ["薪资福利", "弹性工作"] },
      { component_id: "demo_10001_comp_05", value: "希望增加团建活动" }
    ]
  }
];

// ════════════════════════════════════════════════════════════════
//  7. 模板数据
// ════════════════════════════════════════════════════════════════

interface MockTemplate {
  id: string;
  title: string;
  description: string;
  category: string;
  usage_count: number;
  avg_rating: number;
  author_name: string;
  created_at: string;
  components: MockComponent[];
}

export const templateStore: MockTemplate[] = [
  {
    id: "tpl_001",
    title: "员工满意度调查模板",
    description: "适用于企业年度员工满意度调查，包含工作环境、薪资福利、晋升机制等维度",
    category: "hr",
    usage_count: 1280,
    avg_rating: 4.7,
    author_name: "FormForge 官方",
    created_at: "2026-01-15T00:00:00Z",
    components: makeDemoComponents("tpl_001")
  },
  {
    id: "tpl_002",
    title: "客户反馈收集模板",
    description: "适用于收集客户对产品或服务的反馈意见",
    category: "customer",
    usage_count: 890,
    avg_rating: 4.5,
    author_name: "FormForge 官方",
    created_at: "2026-02-20T00:00:00Z",
    components: makeDemoComponents("tpl_002")
  },
  {
    id: "tpl_003",
    title: "活动报名表单模板",
    description: "适用于各类线上线下活动的报名信息收集",
    category: "event",
    usage_count: 650,
    avg_rating: 4.3,
    author_name: "FormForge 官方",
    created_at: "2026-03-10T00:00:00Z",
    components: makeDemoComponents("tpl_003")
  },
  {
    id: "tpl_004",
    title: "学术研究调查模板",
    description: "适用于学术研究场景的标准化问卷模板",
    category: "education",
    usage_count: 420,
    avg_rating: 4.6,
    author_name: "FormForge 官方",
    created_at: "2026-04-05T00:00:00Z",
    components: makeDemoComponents("tpl_004")
  },
  {
    id: "tpl_005",
    title: "市场调研问卷模板",
    description: "适用于产品市场调研和竞品分析场景",
    category: "market",
    usage_count: 760,
    avg_rating: 4.4,
    author_name: "FormForge 官方",
    created_at: "2026-05-12T00:00:00Z",
    components: makeDemoComponents("tpl_005")
  }
];

// ════════════════════════════════════════════════════════════════
//  8. 系统配置
// ════════════════════════════════════════════════════════════════

export const systemConfig = {
  smtp: {
    smtp_enabled: "true",
    smtp_host: "smtp.example.com",
    smtp_port: "587",
    smtp_username: "noreply@example.com",
    smtp_password: "***",
    smtp_from_email: "noreply@example.com"
  },
  auth: {
    registration_enabled: "true",
    registration_mode: "email_verify",
    jwt_secret: "***",
    jwt_access_expire: "3600",
    jwt_refresh_expire: "604800"
  }
};

// ════════════════════════════════════════════════════════════════
//  9. 消息数据
// ════════════════════════════════════════════════════════════════

/** 收件箱单条消息（字段与 @common/message/message.interface 的 MessageListItem 保持一致） */
export interface MockMessage {
  id: string;
  type: "operation_notify" | "template_like" | "survey_lifecycle" | "user_admin_comm" | "admin_broadcast";
  title: string;
  content: string;
  sender: { id: string | null; name: string };
  is_read: boolean;
  related_resource: "survey" | "template" | "review" | null;
  related_resource_id: string | null;
  created_at: string;
  read_at: string | null;
}

/** 演示消息数据（收件箱），覆盖 5 种消息类型，已读/未读混合展示 */
export const messageStore: MockMessage[] = [
  {
    id: "msg_001",
    type: "survey_lifecycle",
    title: "问卷审核通过",
    content: "您的问卷《2026 年度员工满意度调查》已通过审核并发布成功。",
    sender: { id: null, name: "系统通知" },
    is_read: false,
    related_resource: "survey",
    related_resource_id: "demo_10001",
    created_at: "2026-07-22T09:12:00Z",
    read_at: null
  },
  {
    id: "msg_002",
    type: "template_like",
    title: "模板收到新点赞",
    content: "您的模板《员工满意度调查模板》收到了一个新的点赞。",
    sender: { id: "2", name: "测试用户" },
    is_read: false,
    related_resource: "template",
    related_resource_id: "tpl_001",
    created_at: "2026-07-21T16:40:00Z",
    read_at: null
  },
  {
    id: "msg_003",
    type: "operation_notify",
    title: "密码修改成功",
    content: "您的账户密码已修改成功，如非本人操作请及时联系管理员。",
    sender: { id: null, name: "系统通知" },
    is_read: true,
    related_resource: null,
    related_resource_id: null,
    created_at: "2026-07-19T08:05:00Z",
    read_at: "2026-07-19T08:10:00Z"
  },
  {
    id: "msg_004",
    type: "admin_broadcast",
    title: "系统维护通知",
    content: "FormForge 平台将于本周日 02:00-04:00 进行例行维护，期间可能出现短暂访问中断，请提前保存工作。",
    sender: { id: null, name: "管理员广播" },
    is_read: false,
    related_resource: null,
    related_resource_id: null,
    created_at: "2026-07-18T14:00:00Z",
    read_at: null
  },
  {
    id: "msg_005",
    type: "user_admin_comm",
    title: "关于问卷审核标准的咨询回复",
    content: "您好，关于您咨询的问卷审核标准问题，我们已更新帮助文档，请查阅「问卷发布指南」章节。",
    sender: { id: "1", name: "系统管理员" },
    is_read: true,
    related_resource: "review",
    related_resource_id: "demo_10002",
    created_at: "2026-07-15T11:30:00Z",
    read_at: "2026-07-15T12:00:00Z"
  }
];

// ════════════════════════════════════════════════════════════════
//  10. 工具函数
// ════════════════════════════════════════════════════════════════

/** 生成唯一 ID */
export function uid(): string {
  return `standalone_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** 成功响应 */
export function ok<T>(data: T, msg = "ok") {
  return { data, code: 0, msg };
}

/** 失败响应 */
export function fail(code: number, msg: string) {
  return { data: null, code, msg };
}

/** 控制台 Mock 日志 */
export function log(label: string, ...args: unknown[]) {
  console.log(`%c[Standalone Mock] %c${label}`, "color:#f59e0b;font-weight:bold", "color:inherit", ...args);
}
