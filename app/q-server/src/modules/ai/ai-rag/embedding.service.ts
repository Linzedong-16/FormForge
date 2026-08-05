/**
 * RAG 向量化服务
 *
 * 职责：
 *   1. 封装 langchain.ts 的 embedText/embedBatch，供 indexer/retriever 复用
 *   2. 超长文本截断（对应 FR-019），避免单条文本超出 Embedding 模型上下文上限
 *   3. Provider 调用异常统一捕获为可识别的降级错误（RAG_EMBEDDING_UNAVAILABLE），
 *      不在本层做重试/降级决策 —— 由上层 retriever/indexer 根据业务场景决定
 *      （如检索侧降级为纯关键词，索引侧则中止本次重建）
 */
import type { FastifyInstance } from "fastify";
import { embedBatch as embedBatchRaw, type EmbeddingResult } from "../../../config/langchain.js";
import { AppError } from "../../../utils/errors.js";
import { BizCode, StatusCode } from "../../../utils/response.js";

// ─── 常量 ──────────────────────────────────────────────────────

/**
 * 单条文本向量化前的最大字符数。
 * text-embedding-3-small 上下文上限约 8191 Token，按中文场景保守折算为字符数，
 * 超出部分直接截断而非拒绝请求，避免因个别过长片段中断整批索引/检索。
 */
const MAX_EMBED_TEXT_LENGTH = 6000;

export { type EmbeddingResult };

// ─── 向量化服务类 ──────────────────────────────────────────────

export class EmbeddingService {
  constructor(private readonly fastify: FastifyInstance) {}

  /** 单条文本向量化（embedBatch 的单条包装） */
  async embedText(text: string): Promise<EmbeddingResult> {
    const [result] = await this.embedBatch([text]);
    return result;
  }

  /**
   * 批量文本向量化
   *
   * @param texts 待向量化文本数组，超长条目会被截断（记录 warn 日志）
   * @throws AppError(RAG_EMBEDDING_UNAVAILABLE) Provider 调用失败时抛出，供上层决策降级
   */
  async embedBatch(texts: string[]): Promise<EmbeddingResult[]> {
    const truncated = texts.map(text => this.truncate(text));

    try {
      return await embedBatchRaw(this.fastify, truncated);
    } catch (err) {
      this.fastify.log.warn({ err, count: texts.length }, "RAG Embedding 调用失败");
      throw new AppError("向量化服务暂时不可用", StatusCode.INTERNAL_ERROR, BizCode.RAG_EMBEDDING_UNAVAILABLE, {
        cause: err instanceof Error ? err.message : String(err)
      });
    }
  }

  /** 超长文本截断（对应 FR-019），命中截断时记录 warn 日志便于排查召回质量问题 */
  private truncate(text: string): string {
    if (text.length <= MAX_EMBED_TEXT_LENGTH) return text;
    this.fastify.log.warn(
      { originalLength: text.length, maxLength: MAX_EMBED_TEXT_LENGTH },
      "RAG 向量化输入超长，已截断"
    );
    return text.slice(0, MAX_EMBED_TEXT_LENGTH);
  }
}
