/**
 * MessageHookService 单元测试
 *
 * 覆盖：9 个钩子方法各自调用 MessageService.create 时传入的 type/recipient_id/
 * related_resource 是否正确；异常被捕获不向调用方抛出
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MessageHookService } from "../../modules/message/message-hooks.service.js";
import { MessageService } from "../../modules/message/message.service.js";
import { createFastifyMock } from "../utils/test-helpers.js";

vi.mock("../../modules/message/message.service.js", () => {
  return {
    MessageService: vi.fn().mockImplementation(function MockMessageService(this: { create: ReturnType<typeof vi.fn> }) {
      this.create = vi.fn();
    })
  };
});

const RECIPIENT_ID = BigInt(2);

describe("MessageHookService", () => {
  let fastify: ReturnType<typeof createFastifyMock>;
  let hooks: MessageHookService;
  let createMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fastify = createFastifyMock();
    vi.mocked(MessageService).mockClear();
    hooks = new MessageHookService(fastify);
    // 取出被 mock 的 MessageService 实例上的 create 方法
    createMock = (MessageService as unknown as ReturnType<typeof vi.fn>).mock.results[0].value.create;
    createMock.mockReset().mockResolvedValue({ id: BigInt(1), created_at: new Date() });
  });

  it("onReviewApproved — 创建 operation_notify 类型消息", async () => {
    await hooks.onReviewApproved(RECIPIENT_ID, BigInt(100), "测试问卷");

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "operation_notify",
        recipient_id: RECIPIENT_ID,
        related_resource: "survey",
        related_resource_id: BigInt(100),
        sender_id: null
      })
    );
  });

  it("onReviewRejected — 内容包含驳回原因", async () => {
    await hooks.onReviewRejected(RECIPIENT_ID, BigInt(100), "测试问卷", "内容违规");

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: "operation_notify", content: expect.stringContaining("内容违规") })
    );
  });

  it("onUserBanned — 创建 operation_notify 类型消息", async () => {
    await hooks.onUserBanned(RECIPIENT_ID, "违反社区规范", null);

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: "operation_notify", recipient_id: RECIPIENT_ID })
    );
  });

  it("onUserUnbanned — 创建 operation_notify 类型消息", async () => {
    await hooks.onUserUnbanned(RECIPIENT_ID);

    expect(createMock).toHaveBeenCalledWith(expect.objectContaining({ type: "operation_notify" }));
  });

  it("onTemplateRated — 创建 template_like 类型消息，文案为评分而非点赞", async () => {
    await hooks.onTemplateRated(RECIPIENT_ID, BigInt(200), "客户满意度模板", 5);

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "template_like",
        related_resource: "template",
        related_resource_id: BigInt(200),
        content: expect.stringContaining("评分")
      })
    );
  });

  it("onTemplateApplied — 创建 template_like 类型消息", async () => {
    await hooks.onTemplateApplied(RECIPIENT_ID, BigInt(200), "客户满意度模板");

    expect(createMock).toHaveBeenCalledWith(expect.objectContaining({ type: "template_like" }));
  });

  it("onSurveyPublished — 创建 survey_lifecycle 类型消息", async () => {
    await hooks.onSurveyPublished(RECIPIENT_ID, BigInt(100), "测试问卷");

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: "survey_lifecycle", related_resource: "survey" })
    );
  });

  it("onSurveyResponseMilestone — 内容包含里程碑阈值", async () => {
    await hooks.onSurveyResponseMilestone(RECIPIENT_ID, BigInt(100), "测试问卷", 50);

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: "survey_lifecycle", content: expect.stringContaining("50") })
    );
  });

  it("onSurveyExpiringSoon — 创建 survey_lifecycle 类型消息", async () => {
    await hooks.onSurveyExpiringSoon(RECIPIENT_ID, BigInt(100), "测试问卷", new Date("2026-08-01"));

    expect(createMock).toHaveBeenCalledWith(expect.objectContaining({ type: "survey_lifecycle" }));
  });

  it("MessageService.create 抛出异常时被捕获，不向调用方抛出", async () => {
    createMock.mockRejectedValue(new Error("数据库连接失败"));

    await expect(hooks.onReviewApproved(RECIPIENT_ID, BigInt(100), "测试问卷")).resolves.toBeUndefined();
    expect(fastify.log.warn).toHaveBeenCalled();
  });
});
