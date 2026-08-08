/**
 * RAG 混合检索服务
 *
 * 职责：
 *   - vectorSearch  ：pgvector 余弦相似度检索（原生 SQL，Prisma 不支持 vector 类型查询）
 *   - keywordSearch ：复用项目现有 Prisma `contains`（Postgres ILIKE 语义）关键词检索模式（research.md §4）
 *   - hybridSearch  ：score = α × 向量相似度 + (1-α) × 关键词命中（二值 0/1），α 默认 0.7（research.md §5）
 *
 * 降级策略（对应 FR-006/FR-020）：向量检索或关键词检索任一侧调用失败时，
 * 直接降级为仅使用另一侧结果并透出 degraded 标记；两侧都失败则返回空结果。
 * `scope=knowledge` 时必须 JOIN 过滤 `knowledge_documents.is_active = true`，
 * 已下线知识文档的片段不参与检索（对应 FR-012）。
 */
import type { FastifyInstance } from "fastify";
import { Prisma } from "../../../generated/prisma/client.js";
import { EmbeddingService } from "./embedding.service.js";
import type { SearchResultItem, SearchResponseData, SearchDegradedReason } from "./ai-rag.schemas.js";

export type RetrievalScope = "template" | "knowledge";

/** 单侧检索（向量/关键词）返回的候选片段，尚未做混合加权 */
interface RetrievalCandidate {
  id: string;
  refId: string;
  title: string;
  chunkText: string;
  /** 向量检索为余弦相似度 [0,1]；关键词检索命中记 1、未命中不会出现在结果里 */
  score: number;
}

// ─── 常量 ──────────────────────────────────────────────────────

/** 候选池扩大倍数：混合排序前需要比 topK 更多的候选，才能让两侧结果充分交叉排序 */
const CANDIDATE_MULTIPLIER = 4;
/** 候选池上限，防止 topK 异常偏大时产生过重的检索查询 */
const MAX_CANDIDATES = 100;
/** 展示摘要的最大字符数 */
const SNIPPET_LENGTH = 120;

export class RetrieverService {
  private readonly embeddingService: EmbeddingService;

  constructor(private readonly fastify: FastifyInstance) {
    this.embeddingService = new EmbeddingService(fastify);
  }

  /**
   * 混合检索：向量相似度 + 关键词命中加权排序
   *
   * @param scope 检索范围：template（模板片段）| knowledge（知识库片段）
   * @param query 查询文本（长度校验由上层 Zod Schema 完成）
   * @param options topK 返回数量上限（默认 5）、alpha 语义/关键词权重（默认 0.7）
   */
  async hybridSearch(
    scope: RetrievalScope,
    query: string,
    options?: { topK?: number; alpha?: number }
  ): Promise<SearchResponseData> {
    const topK = options?.topK ?? 5;
    const alpha = options?.alpha ?? 0.7;
    const candidateLimit = Math.min(topK * CANDIDATE_MULTIPLIER, MAX_CANDIDATES);

    let vectorRows: RetrievalCandidate[] = [];
    let vectorFailed = false;
    try {
      const { vector } = await this.embeddingService.embedText(query);
      vectorRows = await this.vectorSearch(scope, vector, candidateLimit);
    } catch (err) {
      vectorFailed = true;
      this.fastify.log.warn({ err, scope }, "RAG 向量检索失败，降级为纯关键词检索");
    }

    let keywordRows: RetrievalCandidate[] = [];
    let keywordFailed = false;
    try {
      keywordRows = await this.keywordSearch(scope, query, candidateLimit);
    } catch (err) {
      keywordFailed = true;
      this.fastify.log.warn({ err, scope }, "RAG 关键词检索失败，降级为纯向量检索");
    }

    if (vectorFailed && keywordFailed) {
      return { items: [], degraded: "vector_unavailable" };
    }

    const degraded: SearchDegradedReason = vectorFailed
      ? "vector_unavailable"
      : keywordFailed
        ? "keyword_unavailable"
        : null;

    const items = this.mergeCandidates(scope, vectorRows, keywordRows, alpha).slice(0, topK);
    return { items, degraded };
  }

  /** 向量相似度检索：pgvector `<=>` 余弦距离，需原生 SQL（Prisma 不支持 vector 类型的查询构建） */
  async vectorSearch(scope: RetrievalScope, queryVector: number[], limit: number): Promise<RetrievalCandidate[]> {
    const vectorLiteral = `[${queryVector.join(",")}]`;

    if (scope === "template") {
      const rows = await this.fastify.prisma.$queryRawUnsafe<
        Array<{ id: bigint; template_id: bigint; chunk_text: string; metadata: Prisma.JsonValue; score: number }>
      >(
        `SELECT id, template_id, chunk_text, metadata, 1 - (embedding <=> $1::vector) AS score
         FROM template_embeddings
         WHERE embedding IS NOT NULL
         ORDER BY embedding <=> $1::vector
         LIMIT $2`,
        vectorLiteral,
        limit
      );
      return rows.map(r => ({
        id: r.id.toString(),
        refId: r.template_id.toString(),
        title: this.extractTitle(r.metadata),
        chunkText: r.chunk_text,
        score: r.score
      }));
    }

    const rows = await this.fastify.prisma.$queryRawUnsafe<
      Array<{ id: bigint; document_id: bigint; chunk_text: string; title: string; score: number }>
    >(
      `SELECT kc.id, kc.document_id, kc.chunk_text, kd.title, 1 - (kc.embedding <=> $1::vector) AS score
       FROM knowledge_chunks kc
       JOIN knowledge_documents kd ON kd.id = kc.document_id
       WHERE kc.embedding IS NOT NULL AND kd.is_active = true
       ORDER BY kc.embedding <=> $1::vector
       LIMIT $2`,
      vectorLiteral,
      limit
    );
    return rows.map(r => ({
      id: r.id.toString(),
      refId: r.document_id.toString(),
      title: r.title,
      chunkText: r.chunk_text,
      score: r.score
    }));
  }

  /** 关键词检索：Prisma `contains` + `mode: insensitive`（等价 Postgres ILIKE，research.md §4），命中记二值分 1 */
  async keywordSearch(scope: RetrievalScope, query: string, limit: number): Promise<RetrievalCandidate[]> {
    if (scope === "template") {
      const rows = await this.fastify.prisma.templateEmbedding.findMany({
        where: { chunk_text: { contains: query, mode: "insensitive" } },
        select: { id: true, template_id: true, chunk_text: true, metadata: true },
        take: limit
      });
      return rows.map(r => ({
        id: r.id.toString(),
        refId: r.template_id.toString(),
        title: this.extractTitle(r.metadata),
        chunkText: r.chunk_text,
        score: 1
      }));
    }

    const rows = await this.fastify.prisma.knowledgeChunk.findMany({
      where: {
        chunk_text: { contains: query, mode: "insensitive" },
        document: { is_active: true }
      },
      select: { id: true, document_id: true, chunk_text: true, document: { select: { title: true } } },
      take: limit
    });
    return rows.map(r => ({
      id: r.id.toString(),
      refId: r.document_id.toString(),
      title: r.document.title,
      chunkText: r.chunk_text,
      score: 1
    }));
  }

  /** 合并向量/关键词候选，按 α 加权计算综合得分并排序 */
  private mergeCandidates(
    scope: RetrievalScope,
    vectorRows: RetrievalCandidate[],
    keywordRows: RetrievalCandidate[],
    alpha: number
  ): SearchResultItem[] {
    const merged = new Map<string, SearchResultItem & { vectorScore: number; keywordScore: number }>();

    for (const v of vectorRows) {
      merged.set(v.id, {
        id: v.id,
        score: 0,
        vectorScore: v.score,
        keywordScore: 0,
        snippet: this.buildSnippet(v.chunkText),
        source: { type: scope, refId: v.refId, title: v.title }
      });
    }
    for (const k of keywordRows) {
      const existing = merged.get(k.id);
      if (existing) {
        existing.keywordScore = k.score;
      } else {
        merged.set(k.id, {
          id: k.id,
          score: 0,
          vectorScore: 0,
          keywordScore: k.score,
          snippet: this.buildSnippet(k.chunkText),
          source: { type: scope, refId: k.refId, title: k.title }
        });
      }
    }

    const items = Array.from(merged.values()).map(item => ({
      ...item,
      score: alpha * item.vectorScore + (1 - alpha) * item.keywordScore
    }));

    return items.sort((a, b) => b.score - a.score);
  }

  /** 从 TemplateEmbedding.metadata 中提取展示用模板标题（写入方需保证包含 title 字段，见 indexer.service.ts） */
  private extractTitle(metadata: Prisma.JsonValue): string {
    if (metadata && typeof metadata === "object" && "title" in metadata) {
      const title = (metadata as Record<string, unknown>).title;
      return typeof title === "string" ? title : "";
    }
    return "";
  }

  /** 截取展示摘要 */
  private buildSnippet(text: string): string {
    const trimmed = text.trim();
    return trimmed.length > SNIPPET_LENGTH ? `${trimmed.slice(0, SNIPPET_LENGTH)}...` : trimmed;
  }
}
