/**
 * 消息钩子服务 — 供其他业务模块调用的系统通知触发入口
 *
 * 设计原则（对齐 createAuditLog 的既有失败降级哲学）：
 *   - 每个方法内部调用 MessageService.create() 写入对应类型的消息
 *   - 任一方法内部异常均被捕获并 fastify.log.warn，不向调用方（业务方法）抛出，
 *     不影响业务方法本身的成功返回——消息通知是业务操作的附加效果，不是关键路径
 *
 * 触发场景对照（见 research.md §1/§2）：
 *   - onReviewApproved/onReviewRejected  ← ReviewService.approveReview/rejectReview
 *   - onUserBanned/onUserUnbanned        ← AdminService.banUser/unbanUser
 *   - onTemplateRated                    ← TemplateService.rate（模板评分，不是"点赞"——
 *                                            项目当前没有点赞功能，见 research.md §2）
 *   - onTemplateApplied                  ← TemplateService.useTemplate（应用模板创建问卷）
 *   - onSurveyPublished                  ← SurveyCrudService.publish
 *   - onSurveyResponseMilestone          ← SurveyCrudService.submitResponse（答卷数达里程碑）
 *   - onSurveyExpiringSoon               ← message-scheduler.ts（每日扫描即将过期的问卷）
 */

import type { FastifyInstance } from "fastify";
import { MessageService } from "./message.service.js";

export class MessageHookService {
  private readonly messageService: MessageService;

  constructor(private readonly fastify: FastifyInstance) {
    this.messageService = new MessageService(fastify);
  }

  private async safeCreate(params: {
    type: Parameters<MessageService["create"]>[0]["type"];
    title: string;
    content: string;
    recipientId: bigint;
    relatedResource?: string;
    relatedResourceId?: bigint;
    logContext: string;
  }): Promise<void> {
    try {
      await this.messageService.create({
        type: params.type,
        title: params.title,
        content: params.content,
        sender_id: null,
        recipient_id: params.recipientId,
        related_resource: params.relatedResource ?? null,
        related_resource_id: params.relatedResourceId ?? null
      });
    } catch (err) {
      this.fastify.log.warn({ err, context: params.logContext }, "[message-hooks] 系统通知创建失败，不影响主业务流程");
    }
  }

  async onReviewApproved(recipientId: bigint, surveyId: bigint, surveyTitle: string): Promise<void> {
    await this.safeCreate({
      type: "operation_notify",
      title: "问卷审核通过",
      content: `您的问卷《${surveyTitle}》已通过审核，现已可以发布。`,
      recipientId,
      relatedResource: "survey",
      relatedResourceId: surveyId,
      logContext: "onReviewApproved"
    });
  }

  async onReviewRejected(recipientId: bigint, surveyId: bigint, surveyTitle: string, reason?: string): Promise<void> {
    const suffix = reason ? `驳回原因：${reason}` : "";
    await this.safeCreate({
      type: "operation_notify",
      title: "问卷审核未通过",
      content: `您的问卷《${surveyTitle}》未通过审核。${suffix}`,
      recipientId,
      relatedResource: "survey",
      relatedResourceId: surveyId,
      logContext: "onReviewRejected"
    });
  }

  async onUserBanned(recipientId: bigint, reason: string, until: Date | null): Promise<void> {
    const durationText = until ? `，解封时间：${until.toISOString()}` : "（永久封禁）";
    await this.safeCreate({
      type: "operation_notify",
      title: "账号已被封禁",
      content: `您的账号因"${reason}"被封禁${durationText}。`,
      recipientId,
      logContext: "onUserBanned"
    });
  }

  async onUserUnbanned(recipientId: bigint): Promise<void> {
    await this.safeCreate({
      type: "operation_notify",
      title: "账号已解封",
      content: "您的账号封禁已解除，现在可以正常使用。",
      recipientId,
      logContext: "onUserUnbanned"
    });
  }

  async onTemplateRated(recipientId: bigint, templateId: bigint, templateTitle: string, score: number): Promise<void> {
    await this.safeCreate({
      type: "template_like",
      title: "模板收到新评分",
      content: `您的模板《${templateTitle}》收到了一条 ${score} 分的评分。`,
      recipientId,
      relatedResource: "template",
      relatedResourceId: templateId,
      logContext: "onTemplateRated"
    });
  }

  async onTemplateApplied(recipientId: bigint, templateId: bigint, templateTitle: string): Promise<void> {
    await this.safeCreate({
      type: "template_like",
      title: "模板被应用",
      content: `您的模板《${templateTitle}》被其他用户应用创建了新问卷。`,
      recipientId,
      relatedResource: "template",
      relatedResourceId: templateId,
      logContext: "onTemplateApplied"
    });
  }

  async onSurveyPublished(recipientId: bigint, surveyId: bigint, surveyTitle: string): Promise<void> {
    await this.safeCreate({
      type: "survey_lifecycle",
      title: "问卷发布成功",
      content: `您的问卷《${surveyTitle}》已成功发布。`,
      recipientId,
      relatedResource: "survey",
      relatedResourceId: surveyId,
      logContext: "onSurveyPublished"
    });
  }

  async onSurveyResponseMilestone(
    recipientId: bigint,
    surveyId: bigint,
    surveyTitle: string,
    threshold: number
  ): Promise<void> {
    await this.safeCreate({
      type: "survey_lifecycle",
      title: "答卷数达到里程碑",
      content: `您的问卷《${surveyTitle}》答卷数已达到 ${threshold} 份。`,
      recipientId,
      relatedResource: "survey",
      relatedResourceId: surveyId,
      logContext: "onSurveyResponseMilestone"
    });
  }

  async onSurveyExpiringSoon(
    recipientId: bigint,
    surveyId: bigint,
    surveyTitle: string,
    deadline: Date
  ): Promise<void> {
    await this.safeCreate({
      type: "survey_lifecycle",
      title: "问卷即将过期",
      content: `您的问卷《${surveyTitle}》将于 ${deadline.toISOString().slice(0, 10)} 到期，请及时处理。`,
      recipientId,
      relatedResource: "survey",
      relatedResourceId: surveyId,
      logContext: "onSurveyExpiringSoon"
    });
  }
}
