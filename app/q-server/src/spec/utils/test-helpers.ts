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
  review: { findFirst: MockFn; updateMany: MockFn; create: MockFn };
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
  return {
    user: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    userRole: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      count: vi.fn(),
      deleteMany: vi.fn(),
    },
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
    review: {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
    },
    $transaction: vi.fn(),
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

/** 模拟一个普通问卷 */
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
  survey_type: "personal",
  review_status: "none",
  category: null,
  cover_url: null,
  download_count: 0,
  rating: null,
  created_at: new Date("2026-06-01T10:00:00.000Z"),
  updated_at: new Date("2026-06-10T10:00:00.000Z"),
  published_at: null,
  closed_at: null,
  deleted_at: null,
};

/** 模拟一个已发布的公共模板问卷 */
export const MOCK_TEMPLATE_SURVEY = {
  ...MOCK_SURVEY,
  id: BigInt(200),
  title: "客户满意度调查模板",
  survey_type: "template",
  review_status: "approved",
  is_public: 1,
  category: "customer",
  download_count: 42,
  rating: 4.5,
};

/** 模拟一个审核中的问卷 */
export const MOCK_PENDING_SURVEY = {
  ...MOCK_SURVEY,
  id: BigInt(300),
  survey_type: "template",
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
  submitter_id: BigInt(2),
  reviewer_id: null,
  status: "pending",
  submit_message: "请审核该模板",
  review_comment: null,
  submitted_at: new Date("2026-06-15T10:00:00.000Z"),
  reviewed_at: null,
  created_at: new Date("2026-06-15T10:00:00.000Z"),
  updated_at: new Date("2026-06-15T10:00:00.000Z"),
};
