/**
 * IndexerService 单元测试
 *
 * 覆盖：indexTemplate 正常切片写入（overview + question 片段）、
 *       deleteTemplateIndex 清理、Embedding Provider 调用失败时的降级（跳过索引但不抛异常）
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { IndexerService } from "../../../modules/ai/ai-rag/indexer.service.js";
import { AppError } from "../../../utils/errors.js";
import { BizCode } from "../../../utils/response.js";
import { createFastifyMock } from "../../utils/test-helpers.js";

// Embedding Provider 调用属于 EmbeddingService 职责，这里隔离掉真实向量化调用，
// 只关注 IndexerService 自身的切片/写入/降级逻辑
const embedBatchMock = vi.fn();
vi.mock("../../../modules/ai/ai-rag/embedding.service.js", () => ({
  EmbeddingService: class {
    embedBatch(...args: unknown[]) {
      return embedBatchMock(...args);
    }
  }
}));

const MOCK_TEMPLATE_WITH_COMPONENTS = {
  id: BigInt(200),
  title: "客户满意度调查模板",
  description: "用于收集客户反馈",
  components: [
    { config: { title: { status: "您的性别是？" } } },
    { config: { title: { status: "请留下您的建议" } } },
    { config: { title: { status: "  " } } } // 空白标题应被跳过，不生成片段
  ]
};

describe("IndexerService", () => {
  let fastify: ReturnType<typeof createFastifyMock>;
  let service: IndexerService;
  let executeRawUnsafeMock: ReturnType<typeof vi.fn>;
  let deleteManyMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fastify = createFastifyMock();
    executeRawUnsafeMock = vi.fn();
    deleteManyMock = vi.fn();
    fastify.prisma.template = { findUnique: vi.fn() };
    fastify.prisma.templateEmbedding = { deleteMany: deleteManyMock };
    // $transaction 直接以 fastify.prisma 自身作为 tx 传给回调，模拟事务内复用同一批 mock 方法
    fastify.prisma.$transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        templateEmbedding: { deleteMany: deleteManyMock },
        $executeRawUnsafe: executeRawUnsafeMock
      })
    );
    service = new IndexerService(fastify);
    vi.clearAllMocks();
    embedBatchMock.mockResolvedValue([
      { vector: [0.1, 0.2], provider: "deepseek", dimension: 2 },
      { vector: [0.3, 0.4], provider: "deepseek", dimension: 2 },
      { vector: [0.5, 0.6], provider: "deepseek", dimension: 2 }
    ]);
  });

  describe("indexTemplate", () => {
    it("正常场景 → 按 overview+question 切片，删除旧片段后写入新片段", async () => {
      fastify.prisma.template.findUnique.mockResolvedValue(MOCK_TEMPLATE_WITH_COMPONENTS);

      const result = await service.indexTemplate(BigInt(200));

      // overview(1) + 两条非空标题的 question(2) = 3 片段，空白标题的题目被跳过
      expect(result.chunkCount).toBe(2 + 1);
      expect(embedBatchMock).toHaveBeenCalledWith(["客户满意度调查模板\n用于收集客户反馈", "您的性别是？", "请留下您的建议"]);
      expect(deleteManyMock).toHaveBeenCalledWith({ where: { template_id: BigInt(200) } });
      expect(executeRawUnsafeMock).toHaveBeenCalledTimes(3);

      // metadata.title 必须携带模板标题，供 retriever.service.ts 展示使用
      const firstInsertArgs = executeRawUnsafeMock.mock.calls[0]!;
      expect(firstInsertArgs[6]).toBe(JSON.stringify({ title: "客户满意度调查模板" }));
    });

    it("模板不存在 → 抛出 AppError(RAG_TEMPLATE_NOT_FOUND)", async () => {
      fastify.prisma.template.findUnique.mockResolvedValue(null);

      await expect(service.indexTemplate(BigInt(999))).rejects.toMatchObject({
        code: BizCode.RAG_TEMPLATE_NOT_FOUND
      });
      await expect(service.indexTemplate(BigInt(999))).rejects.toBeInstanceOf(AppError);
    });

    it("Embedding Provider 调用失败 → 跳过索引重建，不抛异常，不删除旧片段", async () => {
      fastify.prisma.template.findUnique.mockResolvedValue(MOCK_TEMPLATE_WITH_COMPONENTS);
      embedBatchMock.mockRejectedValue(new Error("向量化服务暂时不可用"));

      const result = await service.indexTemplate(BigInt(200));

      expect(result).toEqual({ chunkCount: 0 });
      expect(deleteManyMock).not.toHaveBeenCalled();
      expect(fastify.log.warn).toHaveBeenCalled();
    });
  });

  describe("deleteTemplateIndex", () => {
    it("清理指定模板的检索片段", async () => {
      await service.deleteTemplateIndex(BigInt(200));

      expect(deleteManyMock).toHaveBeenCalledWith({ where: { template_id: BigInt(200) } });
    });
  });

  describe("indexKnowledgeDocument", () => {
    it("正常场景 → 按 Markdown 标题切分章节，向量化后写入 knowledge_chunks 表", async () => {
      const content = "# 第一章\n介绍内容\n\n# 第二章\n更多内容";

      const result = await service.indexKnowledgeDocument(BigInt(500), content);

      expect(result.chunkCount).toBe(2);
      expect(embedBatchMock).toHaveBeenCalledWith(["介绍内容", "更多内容"]);
      expect(executeRawUnsafeMock).toHaveBeenCalledTimes(2);

      const firstInsertArgs = executeRawUnsafeMock.mock.calls[0]!;
      expect(firstInsertArgs[1]).toBe(BigInt(500)); // document_id
      expect(firstInsertArgs[3]).toBe("第一章"); // section
      expect(firstInsertArgs[4]).toBe("介绍内容"); // chunk_text
    });

    it("无 Markdown 标题的纯文本 → 整篇作为单个无章节片段（section 为 null）", async () => {
      embedBatchMock.mockResolvedValue([{ vector: [0.1, 0.2], provider: "deepseek", dimension: 2 }]);

      const result = await service.indexKnowledgeDocument(BigInt(500), "纯文本内容，无标题");

      expect(result.chunkCount).toBe(1);
      const insertArgs = executeRawUnsafeMock.mock.calls[0]!;
      expect(insertArgs[3]).toBeNull();
      expect(insertArgs[4]).toBe("纯文本内容，无标题");
    });

    it("Embedding Provider 调用失败 → 跳过本次导入，不抛异常、不写入片段", async () => {
      embedBatchMock.mockRejectedValue(new Error("向量化服务暂时不可用"));

      const result = await service.indexKnowledgeDocument(BigInt(500), "任意内容");

      expect(result).toEqual({ chunkCount: 0 });
      expect(executeRawUnsafeMock).not.toHaveBeenCalled();
      expect(fastify.log.warn).toHaveBeenCalled();
    });
  });

  describe("deactivateKnowledgeDocument", () => {
    it("正常场景 → 找到文档后置 is_active=false", async () => {
      const updateMock = vi.fn();
      fastify.prisma.knowledgeDocument = {
        findUnique: vi.fn().mockResolvedValue({ id: BigInt(500), is_active: true }),
        update: updateMock
      };

      await service.deactivateKnowledgeDocument(BigInt(500));

      expect(updateMock).toHaveBeenCalledWith({
        where: { id: BigInt(500) },
        data: { is_active: false }
      });
    });

    it("重复下线同一文档 → 保持幂等，不抛异常", async () => {
      const updateMock = vi.fn();
      fastify.prisma.knowledgeDocument = {
        findUnique: vi.fn().mockResolvedValue({ id: BigInt(500), is_active: false }),
        update: updateMock
      };

      await service.deactivateKnowledgeDocument(BigInt(500));
      await service.deactivateKnowledgeDocument(BigInt(500));

      expect(updateMock).toHaveBeenCalledTimes(2);
    });

    it("文档不存在 → 抛出 AppError(RAG_KNOWLEDGE_DOCUMENT_NOT_FOUND)", async () => {
      fastify.prisma.knowledgeDocument = {
        findUnique: vi.fn().mockResolvedValue(null),
        update: vi.fn()
      };

      await expect(service.deactivateKnowledgeDocument(BigInt(999))).rejects.toMatchObject({
        code: BizCode.RAG_KNOWLEDGE_DOCUMENT_NOT_FOUND
      });
      await expect(service.deactivateKnowledgeDocument(BigInt(999))).rejects.toBeInstanceOf(AppError);
    });
  });
});
