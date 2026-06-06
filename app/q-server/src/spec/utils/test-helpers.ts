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
