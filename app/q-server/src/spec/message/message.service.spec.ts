/**
 * MessageService 单元测试
 *
 * 覆盖：收件箱查询（分页/类型/已读筛选，含广播消息合并）、未读计数（缓存命中/未命中、
 * by_type 细分）、标记已读（幂等、非本人拒绝、缓存失效）、全部标记已读、软删除、
 * create() 的 type 白名单防御性校验（修复 M1）
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MessageService } from "../../modules/message/message.service.js";
import { AppError } from "../../utils/errors.js";
import { BizCode } from "../../utils/response.js";
import { createFastifyMock, MOCK_MESSAGE, MOCK_BROADCAST } from "../utils/test-helpers.js";

const USER_ID = BigInt(2);
const OTHER_USER_ID = BigInt(3);
const USER_ROLE = "user";

describe("MessageService", () => {
  let fastify: ReturnType<typeof createFastifyMock>;
  let service: MessageService;

  beforeEach(() => {
    fastify = createFastifyMock();
    service = new MessageService(fastify);
    vi.clearAllMocks();
  });

  // ============================================================
  //  create
  // ============================================================

  describe("create", () => {
    it("创建一条系统通知消息", async () => {
      fastify.prisma.message.create.mockResolvedValue({ id: MOCK_MESSAGE.id, created_at: MOCK_MESSAGE.created_at });

      const result = await service.create({
        type: "operation_notify",
        title: "标题",
        content: "内容",
        recipient_id: USER_ID
      });

      expect(result.id).toBe(MOCK_MESSAGE.id);
      expect(fastify.prisma.message.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ type: "operation_notify", recipient_id: USER_ID }) })
      );
    });

    it("写入成功后失效接收者的未读计数缓存", async () => {
      fastify.prisma.message.create.mockResolvedValue({ id: MOCK_MESSAGE.id, created_at: MOCK_MESSAGE.created_at });
      fastify.redis.del.mockResolvedValue(1);

      await service.create({ type: "operation_notify", title: "标题", content: "内容", recipient_id: USER_ID });

      expect(fastify.redis.del).toHaveBeenCalledWith(expect.stringContaining(`msg:unread:${USER_ID}`));
    });

    it("传入越界的 type 直接拒绝，不写入数据库（防御性白名单校验，修复 M1）", async () => {
      await expect(
        service.create({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          type: "not_a_real_type" as any,
          title: "标题",
          content: "内容",
          recipient_id: USER_ID
        })
      ).rejects.toMatchObject({ statusCode: 500, code: BizCode.SYSTEM_MESSAGE_TYPE_FORBIDDEN });

      expect(fastify.prisma.message.create).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  //  list
  // ============================================================

  describe("list", () => {
    const baseQuery = { page: 1, page_size: 20, type: undefined, is_read: undefined };

    it("返回非广播消息的分页列表", async () => {
      fastify.prisma.message.findMany.mockResolvedValue([MOCK_MESSAGE]);
      fastify.prisma.message.count.mockResolvedValue(1);

      const result = await service.list(USER_ID, USER_ROLE, { ...baseQuery, type: ["operation_notify"] });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].id).toBe(String(MOCK_MESSAGE.id));
      expect(result.items[0].sender.name).toBe("系统通知");
      expect(result.total).toBe(1);
    });

    it("合并展示当前用户可见的广播消息", async () => {
      fastify.prisma.message.findMany.mockImplementation((args: { where: { recipient_id: unknown } }) => {
        // 广播分支的 where.recipient_id === null；非广播分支为具体 userId
        if (args.where.recipient_id === null) return Promise.resolve([MOCK_BROADCAST]);
        return Promise.resolve([MOCK_MESSAGE]);
      });
      fastify.prisma.message.count.mockResolvedValue(1);

      const result = await service.list(USER_ID, USER_ROLE, baseQuery);

      const ids = result.items.map(i => i.id);
      expect(ids).toContain(String(MOCK_MESSAGE.id));
      expect(ids).toContain(String(MOCK_BROADCAST.id));
      const broadcastItem = result.items.find(i => i.id === String(MOCK_BROADCAST.id));
      expect(broadcastItem?.sender.name).toBe("平台管理员");
    });

    it("按 type 筛选时不查询广播分支", async () => {
      fastify.prisma.message.findMany.mockResolvedValue([MOCK_MESSAGE]);
      fastify.prisma.message.count.mockResolvedValue(1);

      await service.list(USER_ID, USER_ROLE, { ...baseQuery, type: ["operation_notify"] });

      // findMany 应只被调用一次（非广播分支），因为 type 筛选不包含 admin_broadcast
      const calls = fastify.prisma.message.findMany.mock.calls;
      expect(calls.every(([args]: [{ where: { recipient_id: unknown } }]) => args.where.recipient_id === USER_ID)).toBe(
        true
      );
    });

    it("按 is_read 筛选未读消息", async () => {
      fastify.prisma.message.findMany.mockResolvedValue([]);
      fastify.prisma.message.count.mockResolvedValue(0);

      await service.list(USER_ID, USER_ROLE, { ...baseQuery, is_read: false });

      expect(fastify.prisma.message.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ is_read: false }) })
      );
    });
  });

  // ============================================================
  //  getUnreadCount
  // ============================================================

  describe("getUnreadCount", () => {
    it("缓存未命中时查询数据库并回填缓存，返回值含 by_type", async () => {
      fastify.redis.get.mockResolvedValue(null);
      fastify.redis.set.mockResolvedValue("OK");
      fastify.prisma.message.groupBy.mockResolvedValue([{ type: "operation_notify", _count: { _all: 3 } }]);
      fastify.prisma.message.findMany.mockResolvedValue([]);

      const result = await service.getUnreadCount(USER_ID, USER_ROLE);

      expect(result.unread_total).toBe(3);
      expect(result.by_type.operation_notify).toBe(3);
      expect(result.by_type.admin_broadcast).toBe(0);
      expect(fastify.redis.set).toHaveBeenCalled();
    });

    it("缓存命中时直接返回缓存值，不查询数据库", async () => {
      fastify.redis.get.mockResolvedValue(
        JSON.stringify({
          unread_total: 5,
          by_type: {
            operation_notify: 2,
            template_like: 0,
            survey_lifecycle: 0,
            user_admin_comm: 3,
            admin_broadcast: 0
          }
        })
      );

      const result = await service.getUnreadCount(USER_ID, USER_ROLE);

      expect(result.unread_total).toBe(5);
      expect(fastify.prisma.message.groupBy).not.toHaveBeenCalled();
    });

    it("未读计数包含当前用户未读的广播消息", async () => {
      fastify.redis.get.mockResolvedValue(null);
      fastify.redis.set.mockResolvedValue("OK");
      fastify.prisma.message.groupBy.mockResolvedValue([]);
      fastify.prisma.message.findMany.mockResolvedValue([{ ...MOCK_BROADCAST, broadcastStates: [] }]);

      const result = await service.getUnreadCount(USER_ID, USER_ROLE);

      expect(result.unread_total).toBe(1);
      expect(result.by_type.admin_broadcast).toBe(1);
    });
  });

  // ============================================================
  //  markRead
  // ============================================================

  describe("markRead", () => {
    it("标记非本人的非广播消息已读", async () => {
      fastify.prisma.message.findFirst.mockResolvedValue({ ...MOCK_MESSAGE, is_read: false });
      fastify.prisma.message.update.mockResolvedValue({});
      fastify.redis.del.mockResolvedValue(1);

      const result = await service.markRead(USER_ID, USER_ROLE, MOCK_MESSAGE.id);

      expect(result.is_read).toBe(true);
      expect(fastify.prisma.message.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: MOCK_MESSAGE.id }, data: expect.objectContaining({ is_read: true }) })
      );
      expect(fastify.redis.del).toHaveBeenCalled();
    });

    it("重复标记已读是幂等的（不重复调用 update）", async () => {
      fastify.prisma.message.findFirst.mockResolvedValue({ ...MOCK_MESSAGE, is_read: true });

      await service.markRead(USER_ID, USER_ROLE, MOCK_MESSAGE.id);

      expect(fastify.prisma.message.update).not.toHaveBeenCalled();
    });

    it("非本人消息标记已读被拒绝（403）", async () => {
      fastify.prisma.message.findFirst.mockResolvedValue({ ...MOCK_MESSAGE, recipient_id: OTHER_USER_ID });

      await expect(service.markRead(USER_ID, USER_ROLE, MOCK_MESSAGE.id)).rejects.toMatchObject({ statusCode: 403 });
    });

    it("消息不存在返回 404", async () => {
      fastify.prisma.message.findFirst.mockResolvedValue(null);

      await expect(service.markRead(USER_ID, USER_ROLE, BigInt(99999))).rejects.toMatchObject({
        statusCode: 404,
        code: BizCode.MESSAGE_NOT_FOUND
      });
    });

    it("标记广播消息已读时 upsert MessageBroadcastState，不改动共享的 Message 记录", async () => {
      fastify.prisma.message.findFirst.mockResolvedValue(MOCK_BROADCAST);
      fastify.prisma.messageBroadcastState.upsert.mockResolvedValue({});

      await service.markRead(USER_ID, USER_ROLE, MOCK_BROADCAST.id);

      expect(fastify.prisma.messageBroadcastState.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { message_id_user_id: { message_id: MOCK_BROADCAST.id, user_id: USER_ID } }
        })
      );
      expect(fastify.prisma.message.update).not.toHaveBeenCalled();
    });

    it("角色不在广播目标范围内时拒绝标记已读", async () => {
      fastify.prisma.message.findFirst.mockResolvedValue({ ...MOCK_BROADCAST, target_role: "super_admin" });

      await expect(service.markRead(USER_ID, USER_ROLE, MOCK_BROADCAST.id)).rejects.toMatchObject({ statusCode: 403 });
    });
  });

  // ============================================================
  //  markAllRead
  // ============================================================

  describe("markAllRead", () => {
    it("全部标记已读，返回标记数量", async () => {
      fastify.prisma.message.updateMany.mockResolvedValue({ count: 4 });
      fastify.prisma.message.findMany.mockResolvedValue([]);

      const result = await service.markAllRead(USER_ID, USER_ROLE);

      expect(result.marked_count).toBe(4);
    });

    it("按类型筛选时只标记该类型", async () => {
      fastify.prisma.message.updateMany.mockResolvedValue({ count: 2 });

      await service.markAllRead(USER_ID, USER_ROLE, "operation_notify");

      expect(fastify.prisma.message.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ type: "operation_notify" }) })
      );
      // type 筛选为非广播类型时不应触碰广播分支
      expect(fastify.prisma.message.findMany).not.toHaveBeenCalled();
    });

    it("无新消息时重复调用返回 marked_count: 0，不报错", async () => {
      fastify.prisma.message.updateMany.mockResolvedValue({ count: 0 });
      fastify.prisma.message.findMany.mockResolvedValue([]);

      const result = await service.markAllRead(USER_ID, USER_ROLE);

      expect(result.marked_count).toBe(0);
    });
  });

  // ============================================================
  //  softDelete
  // ============================================================

  describe("softDelete", () => {
    it("软删除非广播消息", async () => {
      fastify.prisma.message.findFirst.mockResolvedValue(MOCK_MESSAGE);
      fastify.prisma.message.update.mockResolvedValue({});

      const result = await service.softDelete(USER_ID, USER_ROLE, MOCK_MESSAGE.id);

      expect(result.deleted).toBe(true);
      expect(fastify.prisma.message.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ deleted_at: expect.any(Date) }) })
      );
    });

    it("软删除广播消息只影响当前用户（upsert MessageBroadcastState.is_hidden）", async () => {
      fastify.prisma.message.findFirst.mockResolvedValue(MOCK_BROADCAST);
      fastify.prisma.messageBroadcastState.upsert.mockResolvedValue({});

      await service.softDelete(USER_ID, USER_ROLE, MOCK_BROADCAST.id);

      expect(fastify.prisma.messageBroadcastState.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ is_hidden: true })
        })
      );
      expect(fastify.prisma.message.update).not.toHaveBeenCalled();
    });

    it("非本人消息删除被拒绝（403）", async () => {
      fastify.prisma.message.findFirst.mockResolvedValue({ ...MOCK_MESSAGE, recipient_id: OTHER_USER_ID });

      await expect(service.softDelete(USER_ID, USER_ROLE, MOCK_MESSAGE.id)).rejects.toMatchObject({ statusCode: 403 });
    });
  });

  // ============================================================
  //  sendMessage（用户故事 2）
  // ============================================================

  describe("sendMessage", () => {
    const ADMIN_ID = BigInt(1);
    const ADMIN_ROLE = "super_admin";

    beforeEach(() => {
      fastify.redis.set.mockResolvedValue("OK");
      fastify.redis.incr.mockResolvedValue(1); // 默认未超限
      fastify.prisma.message.create.mockResolvedValue({ id: BigInt(9001), created_at: new Date() });
      fastify.redis.del.mockResolvedValue(1);
    });

    it("普通用户发送咨询 → 全体管理员各收到一条", async () => {
      fastify.prisma.user.findMany.mockResolvedValue([{ id: ADMIN_ID }, { id: BigInt(4) }]);

      const result = await service.sendMessage(USER_ID, USER_ROLE, { content: "我有一个问题" });

      expect(result.id).toBe("9001");
      expect(fastify.prisma.message.create).toHaveBeenCalledTimes(2);
      expect(fastify.prisma.message.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ type: "user_admin_comm", sender_id: USER_ID }) })
      );
    });

    it("管理员携带 reply_to_message_id 回复 → 仅发给原发送者", async () => {
      fastify.prisma.message.findFirst.mockResolvedValue({ id: BigInt(9000), sender_id: USER_ID, type: "user_admin_comm" });

      const result = await service.sendMessage(ADMIN_ID, ADMIN_ROLE, {
        content: "已为您处理",
        reply_to_message_id: 9000
      });

      expect(result.id).toBe("9001");
      expect(fastify.prisma.message.create).toHaveBeenCalledTimes(1);
      expect(fastify.prisma.message.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ recipient_id: USER_ID }) })
      );
    });

    it("非管理员携带 reply_to_message_id 被拒绝（403）", async () => {
      await expect(
        service.sendMessage(USER_ID, USER_ROLE, { content: "内容", reply_to_message_id: 9000 })
      ).rejects.toMatchObject({ statusCode: 403 });
    });

    it("请求体夹带 type 字段被忽略，创建的消息 type 仍为 user_admin_comm（修复 M1）", async () => {
      fastify.prisma.user.findMany.mockResolvedValue([{ id: ADMIN_ID }]);

      // SendMessageInput 类型本身不含 type 字段，但即使运行时对象被构造出多余字段，
      // service 内部也硬编码写入 user_admin_comm，不会读取调用方传入的任何 type
      await service.sendMessage(USER_ID, USER_ROLE, {
        content: "内容",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...({ type: "operation_notify" } as any)
      });

      expect(fastify.prisma.message.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ type: "user_admin_comm" }) })
      );
    });

    it("超出频率限制返回 429", async () => {
      fastify.redis.incr.mockResolvedValue(999);

      await expect(service.sendMessage(USER_ID, USER_ROLE, { content: "内容" })).rejects.toMatchObject({
        statusCode: 429
      });
      expect(fastify.prisma.message.create).not.toHaveBeenCalled();
    });

    it("消息内容中的手机号被脱敏为 ***", async () => {
      fastify.prisma.user.findMany.mockResolvedValue([{ id: ADMIN_ID }]);

      await service.sendMessage(USER_ID, USER_ROLE, { content: "我的手机号是13800138000，请联系我" });

      expect(fastify.prisma.message.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ content: expect.not.stringContaining("13800138000") }) })
      );
    });

    it("消息内容中的脚本标签被剔除", async () => {
      fastify.prisma.user.findMany.mockResolvedValue([{ id: ADMIN_ID }]);

      await service.sendMessage(USER_ID, USER_ROLE, { content: "<script>alert(1)</script>你好" });

      expect(fastify.prisma.message.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ content: "alert(1)你好" }) })
      );
    });
  });

  // ============================================================
  //  broadcast / listSent（用户故事 3）
  // ============================================================

  describe("broadcast", () => {
    const ADMIN_ID = BigInt(1);

    beforeEach(() => {
      fastify.redis.set.mockResolvedValue("OK");
      fastify.redis.incr.mockResolvedValue(1);
      fastify.prisma.message.create.mockResolvedValue({ id: BigInt(9200), created_at: new Date() });
      fastify.prisma.user.count.mockResolvedValue(486);
    });

    it("管理员发布广播 — 写入单条 recipient_id=NULL 记录", async () => {
      const result = await service.broadcast(ADMIN_ID, { title: "系统维护通知", content: "今晚维护", target_role: "all" });

      expect(result.id).toBe("9200");
      expect(result.estimated_recipients).toBe(486);
      expect(fastify.prisma.message.create).toHaveBeenCalledTimes(1);
      expect(fastify.prisma.message.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ type: "admin_broadcast", recipient_id: null, target_role: "all" })
        })
      );
    });

    it("超出频率限制（3 次/天）返回 429", async () => {
      fastify.redis.incr.mockResolvedValue(999);

      await expect(
        service.broadcast(ADMIN_ID, { title: "标题", content: "内容", target_role: "all" })
      ).rejects.toMatchObject({ statusCode: 429, code: BizCode.BROADCAST_RATE_LIMITED });
      expect(fastify.prisma.message.create).not.toHaveBeenCalled();
    });

    it("请求体夹带 type 字段被忽略，创建的消息 type 仍为 admin_broadcast（修复 M1）", async () => {
      await service.broadcast(ADMIN_ID, {
        title: "标题",
        content: "内容",
        target_role: "all",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...({ type: "operation_notify" } as any)
      });

      expect(fastify.prisma.message.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ type: "admin_broadcast" }) })
      );
    });

    it("广播内容同样经过内容安全处理", async () => {
      await service.broadcast(ADMIN_ID, { title: "标题", content: "联系电话13800138000", target_role: "all" });

      expect(fastify.prisma.message.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ content: expect.not.stringContaining("13800138000") }) })
      );
    });
  });

  describe("listSent", () => {
    const ADMIN_ID = BigInt(1);

    it("仅返回当前管理员自己发出的广播", async () => {
      fastify.prisma.message.findMany.mockResolvedValue([
        { id: BigInt(9200), title: "标题", content: "内容", target_role: "all", created_at: new Date() }
      ]);
      fastify.prisma.message.count.mockResolvedValue(1);
      fastify.prisma.user.count.mockResolvedValue(10);

      const result = await service.listSent(ADMIN_ID, { page: 1, page_size: 20 });

      expect(result.items).toHaveLength(1);
      expect(fastify.prisma.message.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { sender_id: ADMIN_ID, type: "admin_broadcast" } })
      );
    });
  });

  // ============================================================
  //  广播健壮性（修复 C2：状态持久化在 PostgreSQL，不依赖 Redis）
  // ============================================================

  describe("广播已读/隐藏状态的持久化健壮性", () => {
    it("markRead/softDelete 只操作 MessageBroadcastState（PostgreSQL），完全不触碰 Redis", async () => {
      fastify.prisma.message.findFirst.mockResolvedValue(MOCK_BROADCAST);
      fastify.prisma.messageBroadcastState.upsert.mockResolvedValue({});

      await service.markRead(USER_ID, USER_ROLE, MOCK_BROADCAST.id);
      await service.softDelete(USER_ID, USER_ROLE, MOCK_BROADCAST.id);

      // 广播状态写入路径完全不经过 Redis set/incr（未读计数缓存失效走的是 del，
      // 状态本身的读写只经过 messageBroadcastState.upsert）
      expect(fastify.redis.set).not.toHaveBeenCalled();
      expect(fastify.redis.incr).not.toHaveBeenCalled();
      expect(fastify.prisma.messageBroadcastState.upsert).toHaveBeenCalledTimes(2);
    });

    it("即使 Redis 完全不可用（未读计数缓存读写失败），广播已读状态判定依然正确", async () => {
      fastify.redis.get.mockRejectedValue(new Error("Redis 连接失败"));
      fastify.redis.set.mockRejectedValue(new Error("Redis 连接失败"));
      fastify.prisma.message.groupBy.mockResolvedValue([]);
      // 广播已被当前用户标记已读（体现在 MessageBroadcastState，而不是 Redis）
      fastify.prisma.message.findMany.mockResolvedValue([
        { ...MOCK_BROADCAST, broadcastStates: [{ user_id: USER_ID, is_read: true, is_hidden: false, read_at: new Date() }] }
      ]);

      const result = await service.getUnreadCount(USER_ID, USER_ROLE);

      // 未读计数缓存读写失败，但底层查询（Cache-Aside 的回源分支）仍能正确计算出
      // 该广播已读，不计入未读——证明状态来源是 PostgreSQL 而非 Redis
      expect(result.by_type.admin_broadcast).toBe(0);
    });
  });
});
