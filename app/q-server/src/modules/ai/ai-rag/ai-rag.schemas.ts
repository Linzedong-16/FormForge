/**
 * AI RAG 检索增强模块 — Zod 校验 Schema
 *
 * 字段定义严格对齐 contracts/q-server-ai-rag.openapi.yaml：
 *   - searchRequestSchema：POST /templates/search、/knowledge/search 共用请求体
 *   - createKnowledgeDocumentRequestSchema：POST /knowledge/documents 请求体
 */
import { z } from "zod";

// ─── 请求体 ────────────────────────────────────────────────────

/** 混合检索请求体（对应 FR-003/FR-005/FR-007/FR-013/FR-019） */
export const searchRequestSchema = z.object({
  /** 查询文本，上限对应 FR-019 */
  query: z.string().min(1, "查询内容不能为空").max(500, "查询内容最多500个字符"),
  /** 返回结果数量上限 */
  topK: z.number().int().min(1).max(20).default(5),
  /** 语义/关键词混合权重，0 表示纯关键词，1 表示纯向量（对应 FR-005） */
  alpha: z.number().min(0).max(1).default(0.7)
});

export type SearchRequestInput = z.infer<typeof searchRequestSchema>;

/** 知识文档导入请求体（对应 FR-012） */
export const createKnowledgeDocumentRequestSchema = z.object({
  title: z.string().min(1, "文档标题不能为空").max(200, "文档标题最多200个字符"),
  source: z.string().max(200, "来源说明最多200个字符").optional(),
  /** 原始文档全文，后端按章节/长度切片后写入 KnowledgeChunk */
  content: z.string().min(1, "文档内容不能为空").max(50000, "文档内容最多50000个字符")
});

export type CreateKnowledgeDocumentInput = z.infer<typeof createKnowledgeDocumentRequestSchema>;

/** 知识文档 ID 路径参数校验（对应 DELETE /knowledge/documents/:documentId） */
export const knowledgeDocumentIdSchema = z
  .string()
  .regex(/^\d+$/, "知识文档 ID 必须为数字")
  .transform(val => BigInt(val));

// ─── 响应体类型（供 service/routes 层复用，非运行时校验） ────────

/** 检索降级标记：向量检索或关键词检索单侧失败时透出（对应 FR-020） */
export type SearchDegradedReason = "vector_unavailable" | "keyword_unavailable" | null;

/** 单条检索结果 */
export interface SearchResultItem {
  id: string;
  score: number;
  vectorScore: number;
  keywordScore: number;
  snippet: string;
  source: {
    type: "template" | "knowledge";
    refId: string;
    title: string;
  };
}

/** 检索接口响应数据 */
export interface SearchResponseData {
  items: SearchResultItem[];
  degraded: SearchDegradedReason;
}

/** 模板重建索引响应数据 */
export interface ReindexResponseData {
  chunkCount: number;
}

/** 知识文档导入响应数据 */
export interface CreateKnowledgeDocumentResponseData {
  documentId: string;
  chunkCount: number;
}
