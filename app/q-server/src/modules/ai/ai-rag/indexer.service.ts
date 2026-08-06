/**
 * RAG 索引服务
 *
 * 职责：
 *   - indexTemplate               ：模板审核通过（或管理员手动重建）时，将模板拆分为
 *     overview（标题+描述）与 question（单题标题）两类片段，批量向量化后写入 TemplateEmbedding
 *   - deleteTemplateIndex         ：模板下线场景下清理该模板已写入的检索片段
 *   - indexKnowledgeDocument      ：管理员导入知识文档时，按章节/长度对原文切片，批量向量化后写入 KnowledgeChunk
 *   - deactivateKnowledgeDocument ：知识文档下线场景，软下线（is_active=false），片段保留但不再参与检索；
 *     "更新"知识文档内容 = 下线旧文档 + 导入新文档，不提供内容级更新方法（对应 data-model.md「同步规则」）
 *
 * 降级策略：Embedding Provider 调用失败时仅记录 warn 日志并跳过本次重建/导入，
 * 不删除已有片段、不向上抛出异常 —— 索引失败不应阻断审核通过/文档导入流程（对应 FR-020/SC-006）。
 */
import type { FastifyInstance } from "fastify";
import { AppError } from "../../../utils/errors.js";
import { BizCode, StatusCode } from "../../../utils/response.js";
import { EmbeddingService } from "./embedding.service.js";
import type { ReindexResponseData } from "./ai-rag.schemas.js";

/** 单个题目 config.title.status 的取值形状（与 ai-generate.service.ts 等模块保持一致的读取方式） */
interface ComponentTitleConfig {
  title?: { status?: string };
}

/** 待写入的单条模板片段（向量化之前） */
interface PendingChunk {
  chunkType: "overview" | "question";
  chunkIndex: number;
  chunkText: string;
}

/** 待写入的单条知识文档片段（向量化之前） */
interface PendingKnowledgeChunk {
  chunkIndex: number;
  section: string | null;
  chunkText: string;
}

/** 知识文档单个片段的最大字符数，超出后按段落边界继续切分（避免单片段过长稀释检索相关性） */
const KNOWLEDGE_CHUNK_MAX_LENGTH = 1000;

/** Markdown 标题行（1~6 级 #），用于识别知识文档的章节边界 */
const MARKDOWN_HEADING_PATTERN = /^#{1,6}\s+(.+)$/;

export class IndexerService {
  private readonly embeddingService: EmbeddingService;

  constructor(private readonly fastify: FastifyInstance) {
    this.embeddingService = new EmbeddingService(fastify);
  }

  /**
   * 重建指定模板的检索索引：先向量化，成功后再删除旧片段并写入新片段（避免向量化失败时误删存量索引）
   *
   * @throws AppError(RAG_TEMPLATE_NOT_FOUND) 模板不存在时抛出（供管理员手动重建接口返回 404）
   */
  async indexTemplate(templateId: bigint): Promise<ReindexResponseData> {
    const template = await this.fastify.prisma.template.findUnique({
      where: { id: templateId },
      include: { components: { orderBy: { order_index: "asc" } } }
    });
    if (!template) {
      throw new AppError("模板不存在", StatusCode.NOT_FOUND, BizCode.RAG_TEMPLATE_NOT_FOUND);
    }

    const chunks = this.buildChunks(template.title, template.description, template.components);

    let vectors: number[][];
    try {
      const results = await this.embeddingService.embedBatch(chunks.map(c => c.chunkText));
      vectors = results.map(r => r.vector);
    } catch (err) {
      this.fastify.log.warn({ err, templateId: templateId.toString() }, "RAG 模板索引向量化失败，跳过本次重建");
      return { chunkCount: 0 };
    }

    await this.fastify.prisma.$transaction(async tx => {
      await tx.templateEmbedding.deleteMany({ where: { template_id: templateId } });
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i]!;
        const vectorLiteral = `[${vectors[i]!.join(",")}]`;
        // metadata.title 供 retriever.service.ts 展示用，写入方约定：所有片段统一携带模板标题
        await tx.$executeRawUnsafe(
          `INSERT INTO template_embeddings (template_id, chunk_type, chunk_index, chunk_text, embedding, metadata, updated_at)
           VALUES ($1, $2, $3, $4, $5::vector, $6::jsonb, NOW())`,
          templateId,
          chunk.chunkType,
          chunk.chunkIndex,
          chunk.chunkText,
          vectorLiteral,
          JSON.stringify({ title: template.title })
        );
      }
    });

    return { chunkCount: chunks.length };
  }

  /** 清理指定模板的检索片段（模板下线场景） */
  async deleteTemplateIndex(templateId: bigint): Promise<void> {
    await this.fastify.prisma.templateEmbedding.deleteMany({ where: { template_id: templateId } });
  }

  /** 将模板拆分为 overview（标题+描述）与 question（单题标题）两类待索引片段 */
  private buildChunks(
    title: string,
    description: string | null,
    components: Array<{ config: unknown }>
  ): PendingChunk[] {
    const chunks: PendingChunk[] = [
      { chunkType: "overview", chunkIndex: 0, chunkText: [title, description ?? ""].filter(Boolean).join("\n") }
    ];

    components.forEach((component, index) => {
      const questionTitle = (component.config as ComponentTitleConfig)?.title?.status ?? "";
      if (questionTitle.trim()) {
        chunks.push({ chunkType: "question", chunkIndex: index, chunkText: questionTitle });
      }
    });

    return chunks;
  }

  /**
   * 导入知识文档：按章节/长度对原文切片，批量向量化后写入 KnowledgeChunk
   *
   * 前提：documentId 对应的 KnowledgeDocument 记录已由路由层预先创建（title/source/created_by），
   * 本方法只负责切片与写入片段，不重复校验文档是否存在
   */
  async indexKnowledgeDocument(documentId: bigint, content: string): Promise<ReindexResponseData> {
    const chunks = this.buildKnowledgeChunks(content);

    let vectors: number[][];
    try {
      const results = await this.embeddingService.embedBatch(chunks.map(c => c.chunkText));
      vectors = results.map(r => r.vector);
    } catch (err) {
      this.fastify.log.warn({ err, documentId: documentId.toString() }, "RAG 知识文档索引向量化失败，跳过本次导入");
      return { chunkCount: 0 };
    }

    await this.fastify.prisma.$transaction(async tx => {
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i]!;
        const vectorLiteral = `[${vectors[i]!.join(",")}]`;
        await tx.$executeRawUnsafe(
          `INSERT INTO knowledge_chunks (document_id, chunk_index, section, chunk_text, embedding, updated_at)
           VALUES ($1, $2, $3, $4, $5::vector, NOW())`,
          documentId,
          chunk.chunkIndex,
          chunk.section,
          chunk.chunkText,
          vectorLiteral
        );
      }
    });

    return { chunkCount: chunks.length };
  }

  /**
   * 软下线知识文档：置 is_active=false，KnowledgeChunk 保留但不再参与检索（retriever.service.ts 已按
   * is_active=true 过滤）。重复下线同一文档保持幂等，不抛异常；文档不存在时抛出可被路由层识别为 404 的错误
   *
   * @throws AppError(RAG_KNOWLEDGE_DOCUMENT_NOT_FOUND) 文档不存在时抛出
   */
  async deactivateKnowledgeDocument(documentId: bigint): Promise<void> {
    const document = await this.fastify.prisma.knowledgeDocument.findUnique({ where: { id: documentId } });
    if (!document) {
      throw new AppError("知识文档不存在", StatusCode.NOT_FOUND, BizCode.RAG_KNOWLEDGE_DOCUMENT_NOT_FOUND);
    }

    await this.fastify.prisma.knowledgeDocument.update({
      where: { id: documentId },
      data: { is_active: false }
    });
  }

  /** 将知识文档原文按 Markdown 标题切分章节，章节内容超长时再按段落边界继续切分 */
  private buildKnowledgeChunks(content: string): PendingKnowledgeChunk[] {
    const sections = this.splitIntoSections(content);

    const chunks: PendingKnowledgeChunk[] = [];
    let chunkIndex = 0;
    for (const { section, text } of sections) {
      for (const piece of this.splitByLength(text, KNOWLEDGE_CHUNK_MAX_LENGTH)) {
        chunks.push({ chunkIndex: chunkIndex++, section, chunkText: piece });
      }
    }
    return chunks;
  }

  /** 按 Markdown 标题行（# ~ ######）划分章节；无标题时整篇文档视为一个无章节片段 */
  private splitIntoSections(content: string): Array<{ section: string | null; text: string }> {
    const sections: Array<{ section: string | null; text: string }> = [];
    let currentSection: string | null = null;
    let currentLines: string[] = [];

    const flush = () => {
      const text = currentLines.join("\n").trim();
      if (text) sections.push({ section: currentSection, text });
      currentLines = [];
    };

    for (const line of content.split(/\r?\n/)) {
      const headingMatch = line.match(MARKDOWN_HEADING_PATTERN);
      if (headingMatch) {
        flush();
        currentSection = headingMatch[1]!.trim();
        continue;
      }
      currentLines.push(line);
    }
    flush();

    return sections;
  }

  /** 章节文本超过 maxLength 时按空行分隔的段落边界继续切分，尽量避免在句中截断 */
  private splitByLength(text: string, maxLength: number): string[] {
    if (text.length <= maxLength) return [text];

    const paragraphs = text.split(/\n{2,}/);
    const pieces: string[] = [];
    let buffer = "";

    for (const paragraph of paragraphs) {
      const candidate = buffer ? `${buffer}\n\n${paragraph}` : paragraph;
      if (candidate.length > maxLength && buffer) {
        pieces.push(buffer);
        buffer = paragraph;
      } else {
        buffer = candidate;
      }
    }
    if (buffer) pieces.push(buffer);

    return pieces;
  }
}
