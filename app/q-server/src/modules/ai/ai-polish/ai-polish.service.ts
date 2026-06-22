/**
 * AI 问卷润色服务 — SSE 流式润色
 *
 * 职责：
 *   1. 限流检查（复用 Redis rate limiter 模式）
 *   2. 构建润色 Prompt + 问卷上下文，调用 DeepSeek API
 *   3. 流式返回 SSE 事件：token / done / error
 *   4. 收集完整响应 → JSON 校验 → 返回润色结果
 *   5. 审计日志（token 用量、变更数、耗时）
 *
 * 与 ai-generate.service 的区别：
 *   - 输入是已有问卷 JSON + 用户指令（而非空白 prompt）
 *   - 输出必须保持组件类型和数量不变（润色而非重写）
 *   - 额外输出 changes[] 变更清单
 */
import type { FastifyInstance } from "fastify";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { createDeepSeekChat } from "../../../config/langchain.js";
import { buildPolishSystemPrompt } from "./prompts/polish-prompt.js";
import { validateAIResponse, logAIRawResponse } from "../schema-validator.js";
import { createAuditLog } from "../../../utils/audit-log.js";
import type { SSEEvent } from "@common/ai/ai.interface.js";
import type { AIPolishRequest } from "@common/ai/ai.interface.js";

// ─── 常量 ──────────────────────────────────────────────────────

const POLISH_TIMEOUT_MS = 60_000;
const RATE_LIMIT_MAX = 3;
const RATE_LIMIT_PREFIX = "rate:ai_polish:";

// ─── 润色服务类 ────────────────────────────────────────────────

export class AIPolishService {
  constructor(private readonly fastify: FastifyInstance) {}

  /** 原子化限流检查 */
  private async checkRateLimit(userId: bigint): Promise<boolean> {
    const key = `${RATE_LIMIT_PREFIX}${userId}`;
    try {
      await this.fastify.redis.set(key, "0", "EX", 60, "NX");
      const current = await this.fastify.redis.incr(key);
      return current <= RATE_LIMIT_MAX;
    } catch {
      this.fastify.log.warn("AI 润色限流 Redis 操作失败，降级放行");
      return true;
    }
  }

  /** 构建润色的 User Prompt（问卷 JSON + 用户指令） */
  private buildUserPrompt(req: AIPolishRequest): string {
    const surveyJSON = JSON.stringify(req.surveyContent, null, 2);
    return ["【待润色的问卷】", surveyJSON, "", "【润色指令】", req.instructions].join("\n");
  }

  /**
   * 从 AI 原始输出中提取 changes 数组
   *
   * validateAIResponse 使用 aiResponseSchema 校验基础结构，
   * changes 字段不在该 schema 中，因此需要独立解析。
   * 此方法与 schema-validator 共享相同的 JSON 解析策略。
   */
  private extractChanges(rawText: string): string[] {
    try {
      const parsed = JSON.parse(rawText.trim());
      if (parsed && Array.isArray(parsed.changes)) {
        return parsed.changes.filter((c: unknown): c is string => typeof c === "string");
      }
    } catch {
      // 尝试从 markdown 代码块中提取
      const codeBlockMatch = rawText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
      if (codeBlockMatch) {
        try {
          const parsed = JSON.parse(codeBlockMatch[1].trim());
          if (parsed && Array.isArray(parsed.changes)) {
            return parsed.changes.filter((c: unknown): c is string => typeof c === "string");
          }
        } catch {
          // 继续尝试
        }
      }

      // 尝试提取第一个 { 到最后一个 }
      const firstBrace = rawText.indexOf("{");
      const lastBrace = rawText.lastIndexOf("}");
      if (firstBrace !== -1 && lastBrace > firstBrace) {
        try {
          const parsed = JSON.parse(rawText.slice(firstBrace, lastBrace + 1));
          if (parsed && Array.isArray(parsed.changes)) {
            return parsed.changes.filter((c: unknown): c is string => typeof c === "string");
          }
        } catch {
          // 所有尝试都失败
        }
      }
    }
    return [];
  }

  /**
   * 流式润色问卷
   *
   * @param userId       当前用户 ID
   * @param request      润色请求
   * @param clientSignal 客户端断连信号
   * @yields SSE 事件
   */
  async *polish(userId: bigint, request: AIPolishRequest, clientSignal?: AbortSignal): AsyncGenerator<SSEEvent> {
    const startTime = Date.now();

    // 1. 限流
    const allowed = await this.checkRateLimit(userId);
    if (!allowed) {
      yield {
        event: "error",
        data: { message: `请求过于频繁，请稍后再试（每分钟最多 ${RATE_LIMIT_MAX} 次）` }
      };
      return;
    }

    // 2. 检查 AI 配置
    let chatModel: Awaited<ReturnType<typeof createDeepSeekChat>>;
    try {
      chatModel = await createDeepSeekChat(this.fastify);
    } catch (err) {
      yield {
        event: "error",
        data: { message: err instanceof Error ? err.message : "AI 服务未配置" }
      };
      return;
    }

    // 3. 构建 Prompt
    const systemContent = buildPolishSystemPrompt({
      aspects: request.aspects,
      language: request.language
    });
    const userContent = this.buildUserPrompt(request);

    const messages = [new SystemMessage(systemContent), new HumanMessage(userContent)];

    // 4. 超时 + 客户端断连信号合并
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), POLISH_TIMEOUT_MS);

    const onClientDisconnect = () => timeoutController.abort();
    if (clientSignal) {
      if (clientSignal.aborted) {
        clearTimeout(timeoutId);
        yield { event: "error", data: { message: "客户端已断开连接" } };
        return;
      }
      clientSignal.addEventListener("abort", onClientDisconnect, { once: true });
    }

    let fullText = "";
    let tokenCount = 0;

    try {
      const stream = await chatModel.stream(messages, { signal: timeoutController.signal });

      for await (const chunk of stream) {
        const text = typeof chunk.content === "string" ? chunk.content : "";
        if (!text) continue;

        fullText += text;
        tokenCount++;
        yield { event: "token", data: { text } };
      }
    } catch (err: unknown) {
      const isAborted = err instanceof Error && err.name === "AbortError";
      if (isAborted && clientSignal?.aborted) {
        yield { event: "error", data: { message: "润色已被取消" } };
      } else if (isAborted) {
        yield { event: "error", data: { message: "AI 润色超时，请稍后重试" } };
      } else {
        const msg = err instanceof Error ? err.message : "AI 服务暂时不可用";
        yield { event: "error", data: { message: msg } };
        this.fastify.log.error({ err, userId: String(userId) }, "AI 问卷润色异常");
      }
      return;
    } finally {
      clearTimeout(timeoutId);
      if (clientSignal) {
        clientSignal.removeEventListener("abort", onClientDisconnect);
      }
    }

    // 5. 输出原始响应日志（排障用），再进行校验
    logAIRawResponse(this.fastify, userId, "polish", fullText);
    const validationResult = validateAIResponse(fullText);
    // changes 字段独立解析（aiResponseSchema 不包含 changes，需从原始 JSON 中提取）
    const changes = this.extractChanges(fullText);
    const changeCount = changes.length;

    // 6. done 事件（摘要 + 完整原始数据双通道，对齐 generate 格式）
    yield {
      event: "done",
      data: {
        title: validationResult.data.title,
        description: validationResult.data.description,
        // 摘要：仅 type + title，SSE 帧轻量传输
        components: validationResult.data.components.map(c => ({
          type: c.type,
          title: (c.config as Record<string, { status: string }>)?.title?.status ?? ""
        })),
        changes,
        // 完整组件数据（含 config），供前端 aiComponentsToStatus 转换
        _rawComponents: validationResult.data.components,
        _warnings: validationResult.warnings
      }
    };

    // 7. 审计日志
    const elapsed = Date.now() - startTime;
    createAuditLog(this.fastify, userId, "ai_polish_survey", "survey", null, {
      component_count: request.surveyContent.components.length,
      instructions_length: request.instructions.length,
      changes_count: changeCount,
      token_count: tokenCount,
      elapsed_ms: elapsed,
      has_warnings: validationResult.warnings.length > 0
    }).catch(() => {});

    this.fastify.log.info(
      {
        userId: String(userId),
        elapsed_ms: elapsed,
        components: request.surveyContent.components.length,
        changes: changeCount,
        tokens: tokenCount
      },
      "AI 问卷润色完成"
    );
  }
}
