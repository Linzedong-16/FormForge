/**
 * EmbeddingService 单元测试
 *
 * 覆盖：超长文本截断（FR-019）、Provider 调用成功透传、
 *       Provider 调用失败时统一包装为 RAG_EMBEDDING_UNAVAILABLE
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { EmbeddingService } from "../../../modules/ai/ai-rag/embedding.service.js";
import { AppError } from "../../../utils/errors.js";
import { BizCode } from "../../../utils/response.js";
import { createFastifyMock } from "../../utils/test-helpers.js";

// 隔离真实 Provider 调用：DeepSeek/OpenAI 降级逻辑属于 langchain.ts 自身职责，
// EmbeddingService 只负责截断 + 异常包装，因此这里直接 mock embedBatch
const embedBatchMock = vi.fn();
vi.mock("../../../config/langchain.js", () => ({
  embedBatch: (...args: unknown[]) => embedBatchMock(...args)
}));

describe("EmbeddingService", () => {
  let fastify: ReturnType<typeof createFastifyMock>;
  let service: EmbeddingService;

  beforeEach(() => {
    fastify = createFastifyMock();
    service = new EmbeddingService(fastify);
    vi.clearAllMocks();
  });

  describe("embedBatch", () => {
    it("正常调用 → 透传 Provider 返回结果", async () => {
      const texts = ["第一段文本", "第二段文本"];
      embedBatchMock.mockResolvedValue([
        { vector: [0.1, 0.2], provider: "siliconflow", dimension: 2 },
        { vector: [0.3, 0.4], provider: "siliconflow", dimension: 2 }
      ]);

      const result = await service.embedBatch(texts);

      expect(embedBatchMock).toHaveBeenCalledWith(fastify, texts);
      expect(result).toHaveLength(2);
      expect(result[0]!.provider).toBe("siliconflow");
    });

    it("超长文本 → 截断后再调用 Provider，并记录 warn 日志", async () => {
      const longText = "字".repeat(6500); // 超过 MAX_EMBED_TEXT_LENGTH=6000
      embedBatchMock.mockResolvedValue([{ vector: [0.1], provider: "siliconflow", dimension: 1 }]);

      await service.embedBatch([longText]);

      const [, calledTexts] = embedBatchMock.mock.calls[0] as [unknown, string[]];
      expect(calledTexts[0]).toHaveLength(6000);
      expect(fastify.log.warn).toHaveBeenCalledWith(
        expect.objectContaining({ originalLength: 6500, maxLength: 6000 }),
        "RAG 向量化输入超长，已截断"
      );
    });

    it("未超长文本 → 原样传递，不记录截断日志", async () => {
      embedBatchMock.mockResolvedValue([{ vector: [0.1], provider: "siliconflow", dimension: 1 }]);

      await service.embedBatch(["短文本"]);

      expect(fastify.log.warn).not.toHaveBeenCalled();
    });

    it("Provider 调用失败 → 抛出 AppError(RAG_EMBEDDING_UNAVAILABLE)", async () => {
      embedBatchMock.mockRejectedValue(new Error("网络超时"));

      await expect(service.embedBatch(["文本"])).rejects.toMatchObject({
        code: BizCode.RAG_EMBEDDING_UNAVAILABLE
      });
      await expect(service.embedBatch(["文本"])).rejects.toBeInstanceOf(AppError);
      expect(fastify.log.warn).toHaveBeenCalled();
    });
  });

  describe("embedText", () => {
    it("单条文本 → 返回 embedBatch 的第一个结果", async () => {
      embedBatchMock.mockResolvedValue([{ vector: [0.5, 0.6], provider: "siliconflow", dimension: 2 }]);

      const result = await service.embedText("单条查询文本");

      expect(embedBatchMock).toHaveBeenCalledWith(fastify, ["单条查询文本"]);
      expect(result.vector).toEqual([0.5, 0.6]);
    });
  });
});
