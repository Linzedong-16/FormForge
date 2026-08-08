/**
 * RetrieverService 单元测试
 *
 * 覆盖：scope=template/knowledge 检索域、alpha=0/1 边界权重、
 *       向量检索失败降级为纯关键词、关键词检索失败降级为纯向量、两侧均失败返回空结果
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { RetrieverService } from "../../../modules/ai/ai-rag/retriever.service.js";
import { createFastifyMock } from "../../utils/test-helpers.js";

// EmbeddingService.embedText 是 RetrieverService 的直接依赖，
// 单测中隔离掉真实向量化调用，只关注混合检索的排序/降级逻辑
const embedTextMock = vi.fn();
vi.mock("../../../modules/ai/ai-rag/embedding.service.js", () => ({
  EmbeddingService: class {
    embedText(...args: unknown[]) {
      return embedTextMock(...args);
    }
  }
}));

describe("RetrieverService", () => {
  let fastify: ReturnType<typeof createFastifyMock>;
  let service: RetrieverService;

  beforeEach(() => {
    fastify = createFastifyMock();
    fastify.prisma.$queryRawUnsafe = vi.fn();
    fastify.prisma.templateEmbedding = { findMany: vi.fn() };
    fastify.prisma.knowledgeChunk = { findMany: vi.fn() };
    service = new RetrieverService(fastify);
    vi.clearAllMocks();
    embedTextMock.mockResolvedValue({ vector: [0.1, 0.2, 0.3], provider: "deepseek", dimension: 3 });
  });

  // ============================================================
  //  scope=template / scope=knowledge 检索域
  // ============================================================

  describe("hybridSearch — 检索域", () => {
    it("scope=template → 查询 template_embeddings，命中结果携带 source.type=template", async () => {
      fastify.prisma.$queryRawUnsafe.mockResolvedValue([
        { id: BigInt(1), template_id: BigInt(10), chunk_text: "模板片段内容", metadata: { title: "满意度模板" }, score: 0.9 }
      ]);
      fastify.prisma.templateEmbedding.findMany.mockResolvedValue([]);

      const result = await service.hybridSearch("template", "满意度");

      expect(fastify.prisma.$queryRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining("FROM template_embeddings"),
        expect.any(String),
        expect.any(Number)
      );
      expect(result.items[0]!.source).toEqual({ type: "template", refId: "10", title: "满意度模板" });
      expect(result.degraded).toBeNull();
    });

    it("scope=knowledge → 查询 knowledge_chunks 并 JOIN 过滤 is_active（FR-012）", async () => {
      fastify.prisma.$queryRawUnsafe.mockResolvedValue([
        { id: BigInt(2), document_id: BigInt(20), chunk_text: "知识片段内容", title: "产品手册", score: 0.8 }
      ]);
      fastify.prisma.knowledgeChunk.findMany.mockResolvedValue([]);

      const result = await service.hybridSearch("knowledge", "产品");

      expect(fastify.prisma.$queryRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining("kd.is_active = true"),
        expect.any(String),
        expect.any(Number)
      );
      expect(result.items[0]!.source).toEqual({ type: "knowledge", refId: "20", title: "产品手册" });
    });
  });

  // ============================================================
  //  alpha 边界值
  // ============================================================

  describe("hybridSearch — alpha 权重边界", () => {
    beforeEach(() => {
      // 同一条 id=1 命中向量与关键词两侧，用于观察 alpha 对排序/得分的影响
      fastify.prisma.$queryRawUnsafe.mockResolvedValue([
        { id: BigInt(1), template_id: BigInt(10), chunk_text: "命中片段", metadata: {}, score: 0.6 }
      ]);
      fastify.prisma.templateEmbedding.findMany.mockResolvedValue([
        { id: BigInt(1), template_id: BigInt(10), chunk_text: "命中片段", metadata: {} }
      ]);
    });

    it("alpha=0 → 纯关键词权重，score 等于关键词二值分 1", async () => {
      const result = await service.hybridSearch("template", "命中", { alpha: 0 });

      expect(result.items[0]!.score).toBe(1);
    });

    it("alpha=1 → 纯向量权重，score 等于向量相似度 0.6", async () => {
      const result = await service.hybridSearch("template", "命中", { alpha: 1 });

      expect(result.items[0]!.score).toBeCloseTo(0.6);
    });
  });

  // ============================================================
  //  降级策略（FR-006/FR-020）
  // ============================================================

  describe("hybridSearch — 降级策略", () => {
    it("向量检索失败 → 降级为纯关键词，degraded=vector_unavailable", async () => {
      embedTextMock.mockRejectedValue(new Error("Embedding 服务不可用"));
      fastify.prisma.templateEmbedding.findMany.mockResolvedValue([
        { id: BigInt(1), template_id: BigInt(10), chunk_text: "关键词命中", metadata: {} }
      ]);

      const result = await service.hybridSearch("template", "关键词");

      expect(result.degraded).toBe("vector_unavailable");
      expect(result.items).toHaveLength(1);
      expect(fastify.prisma.$queryRawUnsafe).not.toHaveBeenCalled();
    });

    it("关键词检索失败 → 降级为纯向量，degraded=keyword_unavailable", async () => {
      fastify.prisma.$queryRawUnsafe.mockResolvedValue([
        { id: BigInt(1), template_id: BigInt(10), chunk_text: "向量命中", metadata: {}, score: 0.7 }
      ]);
      fastify.prisma.templateEmbedding.findMany.mockRejectedValue(new Error("DB 查询失败"));

      const result = await service.hybridSearch("template", "向量");

      expect(result.degraded).toBe("keyword_unavailable");
      expect(result.items).toHaveLength(1);
    });

    it("两侧均失败 → 返回空结果，degraded=vector_unavailable", async () => {
      embedTextMock.mockRejectedValue(new Error("Embedding 服务不可用"));
      fastify.prisma.templateEmbedding.findMany.mockRejectedValue(new Error("DB 查询失败"));

      const result = await service.hybridSearch("template", "任意查询");

      expect(result.items).toEqual([]);
      expect(result.degraded).toBe("vector_unavailable");
    });
  });
});
