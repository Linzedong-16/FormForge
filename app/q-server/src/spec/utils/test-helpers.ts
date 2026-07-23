/**
 * 单元测试公共工具 —— Mock 工厂 & 辅助函数
 */

import { vi } from "vitest";

// ─── 基础类型 ────────────────────────────────────────────────

/** vitest mock 函数类型（避免跨包推断依赖 @vitest/spy） */
type MockFn = ReturnType<typeof vi.fn>;

// ─── Mock 接口定义 ───────────────────────────────────────────

interface PrismaMock {
  user: { findFirst: MockFn; findUnique: MockFn; findMany: MockFn; create: MockFn; update: MockFn; count: MockFn };
  userRole: { findFirst: MockFn; findMany: MockFn; create: MockFn; count: MockFn; deleteMany: MockFn };
  systemConfig: { findUnique: MockFn; findMany: MockFn; upsert: MockFn };
  auditLog: { create: MockFn };
  survey: { findFirst: MockFn; findUnique: MockFn; findMany: MockFn; create: MockFn; update: MockFn; count: MockFn };
  surveyComponent: { findMany: MockFn; createMany: MockFn; deleteMany: MockFn };
  template: { findFirst: MockFn; findUnique: MockFn; findMany: MockFn; create: MockFn; update: MockFn; count: MockFn };
  templateComponent: { findMany: MockFn; createMany: MockFn };
  templateRating: { findFirst: MockFn; upsert: MockFn; aggregate: MockFn };
  review: { findFirst: MockFn; findUnique: MockFn; findMany: MockFn; update: MockFn; create: MockFn; count: MockFn };
  message: {
    findFirst: MockFn;
    findUnique: MockFn;
    findMany: MockFn;
    create: MockFn;
    update: MockFn;
    updateMany: MockFn;
    deleteMany: MockFn;
    count: MockFn;
    groupBy: MockFn;
  };
  messageBroadcastState: { upsert: MockFn; findMany: MockFn; findUnique: MockFn };
  mediaAsset: {
    findFirst: MockFn;
    findUnique: MockFn;
    findMany: MockFn;
    create: MockFn;
    update: MockFn;
    delete: MockFn;
    count: MockFn;
  };
  userProfile: { findFirst: MockFn; findUnique: MockFn; update: MockFn; upsert: MockFn };
  $transaction: MockFn;
}

interface RedisMock {
  get: MockFn;
  set: MockFn;
  del: MockFn;
  incr: MockFn;
  expire: MockFn;
  exists: MockFn;
  ping: MockFn;
  eval: MockFn;
  scan: MockFn;
  pipeline: MockFn;
}

interface AmqpMock {
  channel: { assertQueue: MockFn; deleteQueue: MockFn; sendToQueue: MockFn };
}

interface ReplyMock {
  send: MockFn;
  status: MockFn;
  sendSuccess: MockFn;
  sendFail: MockFn;
  sendBadRequest: MockFn;
  sendUnauthorized: MockFn;
  sendForbidden: MockFn;
  sendNotFound: MockFn;
  sendServerError: MockFn;
}

// ─── Prisma Mock ──────────────────────────────────────────────

/** 创建一个最小化的 Prisma mock */
export function createPrismaMock(): PrismaMock {
  const userMock = {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
  };
  const userRoleMock = {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    count: vi.fn(),
    deleteMany: vi.fn(),
  };

  // $transaction 回调模式：调用 fn(tx)，tx 复用 prisma 各方法的实现
  const $transaction = vi.fn((fnOrArray: unknown) => {
    if (typeof fnOrArray === "function") {
      return fnOrArray({
        user: { create: userMock.create },
        userRole: { create: userRoleMock.create },
        systemConfig: {},
        auditLog: {},
      });
    }
    return Promise.all(fnOrArray as Array<Promise<unknown>>);
  });

  return {
    user: userMock,
    userRole: userRoleMock,
    systemConfig: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
    survey: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    surveyComponent: {
      findMany: vi.fn(),
      createMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    template: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    templateComponent: {
      findMany: vi.fn(),
      createMany: vi.fn(),
    },
    templateRating: {
      findFirst: vi.fn(),
      upsert: vi.fn(),
      aggregate: vi.fn(),
    },
    review: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
      count: vi.fn()
    },
    message: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
    },
    messageBroadcastState: {
      upsert: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    mediaAsset: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    userProfile: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
    },
    $transaction,
  };
}

// ─── Redis Mock ───────────────────────────────────────────────

/** 创建一个 Redis mock */
export function createRedisMock(): RedisMock {
  return {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    incr: vi.fn(),
    expire: vi.fn(),
    exists: vi.fn(),
    ping: vi.fn(),
    eval: vi.fn(),
    scan: vi.fn(),
    pipeline: vi.fn(),
  };
}

// ─── AMQP (RabbitMQ) Mock ──────────────────────────────────────

/** 创建一个 AMQP mock */
export function createAmqpMock(): AmqpMock {
  return {
    channel: {
      assertQueue: vi.fn(),
      deleteQueue: vi.fn(),
      sendToQueue: vi.fn(),
    },
  };
}

// ─── Fastify Mock ─────────────────────────────────────────────

/** 创建一个包含 prisma / redis / amqp 的 FastifyInstance mock */
export function createFastifyMock() {
  return {
    prisma: createPrismaMock(),
    redis: createRedisMock(),
    amqp: createAmqpMock(),
    log: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

// ─── Fastify Reply Mock ───────────────────────────────────────

/** 创建一个最小化的 FastifyReply mock */
export function createReplyMock(): ReplyMock {
  return {
    send: vi.fn().mockReturnThis(),
    status: vi.fn().mockReturnThis(),
    sendSuccess: vi.fn().mockReturnThis(),
    sendFail: vi.fn().mockReturnThis(),
    sendBadRequest: vi.fn().mockReturnThis(),
    sendUnauthorized: vi.fn().mockReturnThis(),
    sendForbidden: vi.fn().mockReturnThis(),
    sendNotFound: vi.fn().mockReturnThis(),
    sendServerError: vi.fn().mockReturnThis(),
  };
}

// ─── Fastify Request Mock ─────────────────────────────────────

/** 创建一个最小化的 FastifyRequest mock */
export function createRequestMock(overrides?: Record<string, unknown>) {
  return {
    headers: {} as Record<string, string | undefined>,
    body: {} as unknown,
    params: {} as Record<string, string>,
    query: {} as Record<string, string>,
    server: createFastifyMock(),
    user: undefined,
    ...overrides,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

// ─── 测试用固定数据 ───────────────────────────────────────────

/** 模拟一个普通用户 */
export const MOCK_USER = {
  id: BigInt(2),
  email: "user@example.com",
  password_hash: "$2b$10$hashedpassword1234567890abcdef",
  username: "测试用户",
  role: "user",
  avatar_url: null,
  status: 1,
  created_at: new Date("2026-01-01"),
  updated_at: new Date("2026-06-01"),
  last_login_at: null,
  deleted_at: null,
};

/** 模拟一个超级管理员 */
export const MOCK_ADMIN = {
  ...MOCK_USER,
  id: BigInt(1),
  email: "admin@example.com",
  username: "系统管理员",
  role: "admin",
};

// ─── 问卷模块测试用固定数据 ───────────────────────────────────

/** 模拟一个普通问卷（方案B：不再有 survey_type 等模板字段） */
export const MOCK_SURVEY = {
  id: BigInt(100),
  user_id: BigInt(2),
  title: "2026 年度员工满意度调查",
  description: "了解员工满意度",
  status: 0,
  page_size: 10,
  total_questions: 2,
  responses_count: 0,
  is_public: 0,
  access_code: null,
  review_status: "none",
  created_at: new Date("2026-06-01T10:00:00.000Z"),
  updated_at: new Date("2026-06-10T10:00:00.000Z"),
  published_at: null,
  closed_at: null,
  deleted_at: null,
};

/** 模拟一个已上架的公共模板（方案B：独立于 Survey 的 Template 表） */
export const MOCK_TEMPLATE = {
  id: BigInt(200),
  user_id: BigInt(2),
  title: "客户满意度调查模板",
  description: "用于收集客户反馈",
  category: "customer",
  cover_url: null,
  download_count: 42,
  rating: 4.5,
  review_status: "approved",
  source_survey_id: BigInt(100),
  created_at: new Date("2026-06-01T10:00:00.000Z"),
  updated_at: new Date("2026-06-10T10:00:00.000Z"),
};

/** 模拟一个审核中的问卷 */
export const MOCK_PENDING_SURVEY = {
  ...MOCK_SURVEY,
  id: BigInt(300),
  review_status: "pending",
  is_public: 1,
};

/** 模拟问卷组件 */
export const MOCK_COMPONENT = {
  id: BigInt(1001),
  survey_id: BigInt(100),
  type: "text_note",
  config: {
    title: { status: "问卷标题", isShow: true, name: "title-editor" },
    type: { currentStatus: 0, status: [0, 1], isShow: false, name: "text-type-editor" }
  },
  order_index: 0,
  required: 0,
  created_at: new Date("2026-06-01T10:00:00.000Z"),
  updated_at: new Date("2026-06-10T10:00:00.000Z"),
};

/** 模拟一个已软删除的问卷 */
export const MOCK_DELETED_SURVEY = {
  ...MOCK_SURVEY,
  id: BigInt(400),
  deleted_at: new Date("2026-06-15T10:00:00.000Z"),
};

/** 模拟审核记录 */
export const MOCK_REVIEW = {
  id: BigInt(5001),
  survey_id: BigInt(300),
  template_id: null,
  submitter_id: BigInt(2),
  reviewer_id: null,
  review_type: "survey",
  status: "pending",
  submit_message: "请审核该问卷",
  review_comment: null,
  submitted_at: new Date("2026-06-15T10:00:00.000Z"),
  reviewed_at: null,
  created_at: new Date("2026-06-15T10:00:00.000Z"),
  updated_at: new Date("2026-06-15T10:00:00.000Z"),
};

/** 模拟审核详情（含关联数据） */
export const MOCK_REVIEW_DETAIL = {
  ...MOCK_REVIEW,
  survey: {
    id: BigInt(300),
    title: "客户满意度调查模板",
    description: "用于收集客户反馈",
    category: "customer",
    components: [
      {
        id: BigInt(1001),
        type: "single-select",
        config: { title: { status: "您的性别是？", isShow: true } },
        order_index: 0,
        required: 1 as const
      },
      {
        id: BigInt(1002),
        type: "text-input",
        config: { title: { status: "请留下您的建议", isShow: true } },
        order_index: 1,
        required: 0 as const
      }
    ]
  },
  template: null,
  submitter: {
    id: BigInt(2),
    username: "测试用户"
  },
  reviewer: null
};

/** 模拟已审核通过的审核记录 */
export const MOCK_APPROVED_REVIEW = {
  ...MOCK_REVIEW,
  id: BigInt(5002),
  survey_id: BigInt(200),
  status: "approved",
  reviewer_id: BigInt(1),
  review_comment: "内容合规，同意上架",
  reviewed_at: new Date("2026-06-16T10:00:00.000Z"),
};

/** 模拟已驳回的审核记录 */
export const MOCK_REJECTED_REVIEW = {
  ...MOCK_REVIEW,
  id: BigInt(5003),
  survey_id: BigInt(301),
  status: "rejected",
  reviewer_id: BigInt(1),
  review_comment: "问卷第3题包含敏感词汇，请修改后重新提交",
  reviewed_at: new Date("2026-06-16T11:00:00.000Z"),
};

// ─── 消息模块测试用固定数据 ───────────────────────────────────

/** 模拟一条系统通知消息（未读，接收者为普通用户） */
export const MOCK_MESSAGE = {
  id: BigInt(9001),
  type: "operation_notify",
  title: "问卷审核通过",
  content: "您的问卷《测试问卷》已通过审核。",
  sender_id: null,
  recipient_id: BigInt(2),
  target_role: null,
  related_resource: "survey",
  related_resource_id: BigInt(100),
  is_read: false,
  read_at: null,
  created_at: new Date("2026-07-01T10:00:00.000Z"),
  updated_at: new Date("2026-07-01T10:00:00.000Z"),
  deleted_at: null,
  sender: null,
};

/** 模拟一条广播消息（recipient_id 为 null，面向全体用户） */
export const MOCK_BROADCAST = {
  id: BigInt(9100),
  type: "admin_broadcast",
  title: "系统维护通知",
  content: "平台将于今晚进行维护升级。",
  sender_id: BigInt(1),
  recipient_id: null,
  target_role: "all",
  related_resource: null,
  related_resource_id: null,
  is_read: false,
  read_at: null,
  created_at: new Date("2026-07-05T10:00:00.000Z"),
  updated_at: new Date("2026-07-05T10:00:00.000Z"),
  deleted_at: null,
  sender: { username: "系统管理员", role: "super_admin" },
  broadcastStates: [] as { user_id: bigint; is_read: boolean; is_hidden: boolean; read_at: Date | null }[],
};

// ─── 物料管理模块测试用固定数据 ─────────────────────────────────

/** 模拟一条物料（图片资源）记录 */
export const MOCK_MEDIA_ASSET = {
  id: BigInt(5001),
  survey_id: BigInt(100),
  user_id: BigInt(2),
  resource_type: "image",
  file_url: "http://localhost:9000/questionnaire/media-assets/uuid.png",
  file_key: "media-assets/uuid.png",
  file_name: "cover.png",
  mime_type: "image/png",
  file_size: BigInt(2048),
  file_type: "survey_option_image",
  review_status: "pending",
  reviewed_by: null,
  reviewed_at: null,
  review_comment: null,
  created_at: new Date("2026-07-01T08:00:00.000Z"),
  updated_at: new Date("2026-07-01T08:00:00.000Z"),
};

