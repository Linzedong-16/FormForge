/**
 * AI 问卷生成服务 — SSE 流式生成
 *
 * 职责：
 *   1. 限流检查（Redis rate:ai_generate:{userId}，原子 incr + expire）
 *   2. 构建 System Prompt + User Prompt，调用 DeepSeek API
 *   3. 流式返回 SSE 事件：token / component / done / error
 *   4. 收集完整响应 → JSON 校验 → 返回最终结果
 *   5. 审计日志（token 用量、生成题目数、耗时）
 *
 * 安全与性能：
 *   - 限流采用 Redis SETNX + INCR + EXPIRE 原子模式，无竞态
 *   - 支持外部 AbortSignal（客户端断开时立刻终止 LangChain 流）
 *   - 增量 JSON 解析采用计数器剪枝，防止 ReDoS
 *   - 审计日志 fire-and-forget，不阻塞响应
 */
import type { FastifyInstance } from "fastify";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { createDeepSeekChat } from "../../../config/langchain.js";
import {
  buildSystemPrompt,
  type SystemPromptOptions,
  type ReferenceSnippet
} from "../prompt-templates/system-prompt.js";
import { validateAIResponse } from "../schema-validator.js";
import { checkRateLimit } from "../../../utils/rate-limiter.js";
import { createAuditLog } from "../../../utils/audit-log.js";

// ─── 常量 ──────────────────────────────────────────────────────

/** SSE 超时（毫秒） */
const GENERATE_TIMEOUT_MS = 60_000;

/** 限流配置 */
const RATE_LIMIT_CONFIG = {
  prefix: "rate:ai_generate:",
  max: 3
} as const;

/** 增量解析：每次最多解析的组件数限制（防止恶意超大 JSON 导致 ReDoS） */
const MAX_PARSE_COMPONENTS = 50;

/** 生成前检索的历史模板参考片段数量上限 */
const RAG_REFERENCE_TOP_K = 3;
/** 生成前检索超时预算（毫秒），对应 SC-005 检索 P95 < 1s；超时/异常/空结果均直接跳过增强，不阻塞生成主流程（FR-020/SC-006） */
const RAG_RETRIEVAL_TIMEOUT_MS = 1_500;

// Re-export 共用类型（向后兼容）
export type { SSEEvent, AIGenerateRequest as GenerateOptions } from "@common/ai/ai.interface.js";
import type { SSEEvent, AIGenerateRequest } from "@common/ai/ai.interface.js";

// ─── AI 生成服务类 ─────────────────────────────────────────────

export class AIGenerateService {
  constructor(private readonly fastify: FastifyInstance) {}

  // ============================================================
  //  核心生成方法（AsyncGenerator SSE）
  // ============================================================

  /**
   * 流式生成问卷 JSON
   *
   * @param userId       当前用户 ID
   * @param options      生成选项
   * @param clientSignal 客户端断开信号（AbortSignal），用于及时终止 LangChain 流
   * @yields SSE 事件
   */
  async *generate(userId: bigint, options: AIGenerateRequest, clientSignal?: AbortSignal): AsyncGenerator<SSEEvent> {
    const startTime = Date.now();

    // 1. 限流检查
    const allowed = await checkRateLimit(this.fastify, userId, RATE_LIMIT_CONFIG);
    if (!allowed) {
      yield {
        event: "error",
        data: { message: `请求过于频繁，请稍后再试（每分钟最多 ${RATE_LIMIT_CONFIG.max} 次）` }
      };
      return;
    }

    // 2. 检查 AI 配置（含模块级缓存）
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

    // 3. 检索历史模板片段作为参考上下文（生成前 RAG 增强，对应 FR-020/SC-006：
    //    检索失败/超时/空结果均直接跳过增强，按原有逻辑正常生成，不影响生成主流程）
    const referenceSnippets = await this.retrieveReferenceSnippets(options.prompt);

    // 4. 构建 Prompt
    const systemPromptOptions: SystemPromptOptions = {
      count: options.count ?? 10,
      language: options.language ?? "zh-CN",
      referenceSnippets
    };
    const systemContent = buildSystemPrompt(systemPromptOptions);

    const messages = [new SystemMessage(systemContent), new HumanMessage(options.prompt)];

    // 5. 合并超时信号 + 客户端断连信号
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), GENERATE_TIMEOUT_MS);

    // 客户端断开时通知内部超时控制器
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
    let componentCount = 0;
    let tokenCount = 0;
    let lastChunkMetadata: Record<string, unknown> | undefined;

    try {
      const stream = await chatModel.stream(messages, {
        signal: timeoutController.signal
      });

      for await (const chunk of stream) {
        const text = typeof chunk.content === "string" ? chunk.content : "";
        if (!text) continue;

        fullText += text;
        tokenCount++;

        // 捕获最后一块的 response_metadata（含 tokenUsage）
        if (chunk.response_metadata) {
          lastChunkMetadata = chunk.response_metadata as Record<string, unknown>;
        }

        // 推送原始 token
        yield { event: "token", data: { text } };

        // 增量解析组件（有上限保护，防止 DoS）
        if (componentCount < MAX_PARSE_COMPONENTS) {
          const componentEvents = this.tryParseNewComponents(fullText, componentCount);
          for (const ev of componentEvents) {
            yield ev;
            componentCount++;
            if (componentCount >= MAX_PARSE_COMPONENTS) break;
          }
        }
      }
    } catch (err: unknown) {
      const isAborted = err instanceof Error && err.name === "AbortError";
      if (isAborted && clientSignal?.aborted) {
        yield { event: "error", data: { message: "生成已被取消" } };
      } else if (isAborted) {
        yield { event: "error", data: { message: "AI 生成超时，请稍后重试" } };
      } else {
        const msg = err instanceof Error ? err.message : "AI 服务暂时不可用";
        yield { event: "error", data: { message: msg } };
        this.fastify.log.error({ err, userId: String(userId) }, "AI 问卷生成异常");
      }
      return;
    } finally {
      // 统一清理：定时器 + 事件监听器
      clearTimeout(timeoutId);
      if (clientSignal) {
        clientSignal.removeEventListener("abort", onClientDisconnect);
      }
    }

    // 6. 校验最终 JSON
    const validationResult = validateAIResponse(fullText);
    const generatedCount = validationResult.data.components.length;

    // 7. 推送 done 事件（含简化预览 + 完整组件数据）
    yield {
      event: "done",
      data: {
        ...validationResult.data,
        components: validationResult.data.components.map(c => ({
          type: c.type,
          title: (c.config as Record<string, { status: string }>)?.title?.status ?? ""
        })),
        // 完整组件数据（含 config），供前端 Status[] 转换
        _rawComponents: validationResult.data.components,
        _warnings: validationResult.warnings,
        _rawCount: generatedCount
      }
    };

    // 8. 审计日志（异步 fire-and-forget）
    const elapsed = Date.now() - startTime;
    // 优先取 API 返回的精确 token 用量，降级为 chunk 计数
    const tokenUsage = lastChunkMetadata?.tokenUsage as { totalTokens?: number } | undefined;
    const reportedTokens = tokenUsage?.totalTokens ?? tokenCount;
    createAuditLog(this.fastify, userId, "ai_generate_survey", "survey", null, {
      prompt_length: options.prompt.length,
      generated_components: generatedCount,
      token_count: reportedTokens,
      elapsed_ms: elapsed,
      has_warnings: validationResult.warnings.length > 0
    }).catch(() => {});

    this.fastify.log.info(
      {
        userId: String(userId),
        elapsed_ms: elapsed,
        components: generatedCount,
        tokens: tokenCount,
        warnings: validationResult.warnings.length
      },
      "AI 问卷生成完成"
    );
  }

  // ============================================================
  //  RAG 生成前检索增强
  // ============================================================

  /**
   * 生成前检索与用户需求语义相关的历史模板片段，作为 Prompt 参考上下文
   *
   * 降级策略（对应 FR-020/SC-006）：fastify.aiRag 未装饰、检索超时（RAG_RETRIEVAL_TIMEOUT_MS）、
   * 检索异常、命中为空，均直接返回空数组，跳过增强但不影响生成主流程正常进行。
   */
  private async retrieveReferenceSnippets(prompt: string): Promise<ReferenceSnippet[]> {
    const retriever = this.fastify.aiRag?.retriever;
    if (!retriever) return [];

    try {
      const result = await Promise.race([
        retriever.hybridSearch("template", prompt, { topK: RAG_REFERENCE_TOP_K }),
        new Promise<null>(resolve => setTimeout(() => resolve(null), RAG_RETRIEVAL_TIMEOUT_MS))
      ]);

      if (!result) {
        this.fastify.log.warn("RAG 生成前检索超时，跳过增强");
        return [];
      }

      return result.items.map(item => ({ title: item.source.title, snippet: item.snippet }));
    } catch (err) {
      this.fastify.log.warn({ err }, "RAG 生成前检索异常，跳过增强");
      return [];
    }
  }

  // ============================================================
  //  增量解析辅助函数
  // ============================================================

  /**
   * 从累积文本中增量提取已完成 JSON 的组件
   *
   * 安全设计：
   *   - 限制输入文本长度（防止大文本正则回溯）
   *   - 使用简单字符串扫描代替复杂正则（防止 ReDoS）
   *   - 限制单次解析组件数量上限
   */
  private tryParseNewComponents(fullText: string, currentCount: number): SSEEvent[] {
    const events: SSEEvent[] = [];

    // 防御：文本过长时跳过增量解析（最终会有完整校验）
    if (fullText.length > 100_000) return events;

    // 找到 components 数组的起始位置
    const arrStart = fullText.indexOf('"components"');
    if (arrStart === -1) return events;

    const bracketStart = fullText.indexOf("[", arrStart);
    if (bracketStart === -1) return events;

    // 简单状态机扫描：跟踪括号嵌套深度找到完整 JSON 对象
    // 比正则安全，不会产生指数级回溯
    const results = this.scanJSONObjects(fullText.slice(bracketStart + 1), currentCount);
    return results;
  }

  /**
   * 安全地扫描 JSON 对象数组
   *
   * 用括号深度计数器代替正则，完全避免 ReDoS。
   */
  private scanJSONObjects(text: string, startIndex: number): SSEEvent[] {
    const events: SSEEvent[] = [];
    let depth = 0;
    let inString = false;
    let escape = false;
    let objStart = -1;
    let objCount = 0;

    for (let i = 0; i < text.length && objCount < MAX_PARSE_COMPONENTS; i++) {
      const ch = text[i];

      // 字符串状态跟踪
      if (inString) {
        if (escape) {
          escape = false;
        } else if (ch === "\\") {
          escape = true;
        } else if (ch === '"') {
          inString = false;
        }
        continue;
      }

      if (ch === '"') {
        inString = true;
        continue;
      }

      if (ch === "{") {
        if (depth === 0) objStart = i;
        depth++;
      } else if (ch === "}") {
        depth--;
        if (depth === 0 && objStart !== -1) {
          // 找到一个完整对象
          objCount++;
          if (objCount > startIndex) {
            try {
              const obj = JSON.parse(text.slice(objStart, i + 1));
              if (obj.type && obj.config) {
                const title = obj.config?.title?.status ?? "";
                events.push({
                  event: "component",
                  data: { index: objCount - 1, type: obj.type, title }
                });
              }
            } catch {
              // 不完整/无效 JSON，继续
            }
          }
          objStart = -1;
        }
      }
    }

    return events;
  }
}
