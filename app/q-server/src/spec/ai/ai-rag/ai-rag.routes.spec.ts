/**
 * AI RAG 检索增强路由 — 集成测试
 *
 * 复用 media-asset.routes.spec.ts 已验证过的"真实 Fastify 实例 + 真实
 * authenticate/requireSuperAdmin/authenticateOrInternal 中间件 + 真实
 * error-handler/response 插件"集成测试方式：本模块的鉴权分支（登录用户/内部
 * 服务/超级管理员）与 AppError → HTTP 状态码映射，都是需要真实验证的部分，
 * 而不应被 mock 掉。
 *
 * fastify.aiRag.indexer/retriever 通过手动 decorate 注入 mock 对象
 * （而非 vi.mock 服务模块），因为路由层只依赖 plugins/ai-rag.ts 装饰出的接口，
 * 无需关心 IndexerService/RetrieverService 内部实现。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify from "fastify";
import jwt from "jsonwebtoken";
import errorHandlerPlugin from "../../../plugins/error-handler.js";
import responsePlugin from "../../../plugins/response.js";
import aiRagRoutes from "../../../modules/ai/ai-rag/ai-rag.routes.js";
import { AppError } from "../../../utils/errors.js";
import { BizCode, StatusCode } from "../../../utils/response.js";
import { createPrismaMock, createRedisMock, MOCK_USER, MOCK_ADMIN } from "../../utils/test-helpers.js";

function createToken(userId: string, role: "super_admin" | "user"): string {
  return jwt.sign(
    { sub: userId, email: `${userId}@example.com`, role, type: "access", jti: `${userId}-jti` },
    process.env.JWT_SECRET!,
    { expiresIn: 3600 }
  );
}

describe("ai-rag.routes", () => {
  let app: ReturnType<typeof Fastify>;
  let hybridSearchMock: ReturnType<typeof vi.fn>;
  let indexTemplateMock: ReturnType<typeof vi.fn>;
  let deleteTemplateIndexMock: ReturnType<typeof vi.fn>;
  let indexKnowledgeDocumentMock: ReturnType<typeof vi.fn>;
  let deactivateKnowledgeDocumentMock: ReturnType<typeof vi.fn>;
  let prisma: ReturnType<typeof createPrismaMock>;

  const ORIGINAL_INTERNAL_KEY = process.env.AI_SERVICE_INTERNAL_KEY;

  afterEach(() => {
    process.env.AI_SERVICE_INTERNAL_KEY = ORIGINAL_INTERNAL_KEY;
  });

  beforeEach(async () => {
    app = Fastify({ logger: false });

    prisma = createPrismaMock();
    prisma.user.findFirst.mockImplementation(async ({ where }: { where: { id: bigint } }) =>
      where.id === MOCK_ADMIN.id ? MOCK_ADMIN : MOCK_USER
    );

    const redis = createRedisMock();
    redis.exists.mockResolvedValue(0); // 不在 JWT 黑名单
    const pipelineMock = {
      exists: vi.fn().mockReturnThis(),
      ttl: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([])
    };
    redis.pipeline.mockReturnValue(pipelineMock);

    hybridSearchMock = vi.fn();
    indexTemplateMock = vi.fn();
    deleteTemplateIndexMock = vi.fn();
    indexKnowledgeDocumentMock = vi.fn();
    deactivateKnowledgeDocumentMock = vi.fn();

    app.decorate("prisma", prisma);
    app.decorate("redis", redis);
    app.decorate("aiRag", {
      indexer: {
        indexTemplate: indexTemplateMock,
        deleteTemplateIndex: deleteTemplateIndexMock,
        indexKnowledgeDocument: indexKnowledgeDocumentMock,
        deactivateKnowledgeDocument: deactivateKnowledgeDocumentMock
      },
      retriever: { hybridSearch: hybridSearchMock }
    });

    await app.register(errorHandlerPlugin);
    await app.register(responsePlugin);
    await app.register(aiRagRoutes, { prefix: "/ai/rag" });
    await app.ready();
  });

  // ════════════════════════════════════════════════════════════
  // POST /templates/search
  // ════════════════════════════════════════════════════════════
  describe("POST /templates/search", () => {
    it("已登录用户携带合法请求体 → 200，透传 hybridSearch 结果", async () => {
      hybridSearchMock.mockResolvedValue({
        items: [
          {
            id: "1",
            score: 0.9,
            vectorScore: 0.9,
            keywordScore: 0.8,
            snippet: "您的性别是？",
            source: { type: "template", refId: "200", title: "客户满意度调查模板" }
          }
        ],
        degraded: null
      });

      const res = await app.inject({
        method: "POST",
        url: "/ai/rag/templates/search",
        headers: { authorization: `Bearer ${createToken("2", "user")}` },
        payload: { query: "客户满意度", topK: 5, alpha: 0.7 }
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data.items).toHaveLength(1);
      expect(body.data.degraded).toBeNull();
      expect(hybridSearchMock).toHaveBeenCalledWith("template", "客户满意度", { topK: 5, alpha: 0.7 });
    });

    it("query 为空字符串 → 400 参数校验失败", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/ai/rag/templates/search",
        headers: { authorization: `Bearer ${createToken("2", "user")}` },
        payload: { query: "" }
      });

      expect(res.statusCode).toBe(400);
      expect(hybridSearchMock).not.toHaveBeenCalled();
    });

    it("未登录且未携带内部服务 Key → 401", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/ai/rag/templates/search",
        payload: { query: "客户满意度" }
      });

      expect(res.statusCode).toBe(401);
    });

    it("携带合法 X-Internal-Api-Key → 内部服务鉴权通过，无需 JWT", async () => {
      process.env.AI_SERVICE_INTERNAL_KEY = "internal-secret";
      hybridSearchMock.mockResolvedValue({ items: [], degraded: null });

      const res = await app.inject({
        method: "POST",
        url: "/ai/rag/templates/search",
        headers: { "x-internal-api-key": "internal-secret" },
        payload: { query: "客户满意度" }
      });

      expect(res.statusCode).toBe(200);
      expect(hybridSearchMock).toHaveBeenCalled();
    });

    it("向量检索单侧失败 → degraded 字段透出降级原因", async () => {
      hybridSearchMock.mockResolvedValue({ items: [], degraded: "vector_unavailable" });

      const res = await app.inject({
        method: "POST",
        url: "/ai/rag/templates/search",
        headers: { authorization: `Bearer ${createToken("2", "user")}` },
        payload: { query: "客户满意度" }
      });

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).data.degraded).toBe("vector_unavailable");
    });
  });

  // ════════════════════════════════════════════════════════════
  // POST /templates/:templateId/reindex
  // ════════════════════════════════════════════════════════════
  describe("POST /templates/:templateId/reindex", () => {
    it("未登录 → 401", async () => {
      const res = await app.inject({ method: "POST", url: "/ai/rag/templates/200/reindex" });
      expect(res.statusCode).toBe(401);
    });

    it("已登录但非超级管理员 → 403", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/ai/rag/templates/200/reindex",
        headers: { authorization: `Bearer ${createToken("2", "user")}` }
      });
      expect(res.statusCode).toBe(403);
    });

    it("超级管理员 → 200，返回 chunkCount", async () => {
      indexTemplateMock.mockResolvedValue({ chunkCount: 3 });

      const res = await app.inject({
        method: "POST",
        url: "/ai/rag/templates/200/reindex",
        headers: { authorization: `Bearer ${createToken("1", "super_admin")}` }
      });

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).data.chunkCount).toBe(3);
      expect(indexTemplateMock).toHaveBeenCalledWith(BigInt(200));
    });

    it("模板 ID 非数字 → 400", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/ai/rag/templates/abc/reindex",
        headers: { authorization: `Bearer ${createToken("1", "super_admin")}` }
      });

      expect(res.statusCode).toBe(400);
      expect(indexTemplateMock).not.toHaveBeenCalled();
    });

    it("模板不存在 → 404（IndexerService 抛出 AppError 由全局错误处理器捕获）", async () => {
      indexTemplateMock.mockRejectedValue(new AppError("模板不存在", StatusCode.NOT_FOUND, BizCode.RAG_TEMPLATE_NOT_FOUND));

      const res = await app.inject({
        method: "POST",
        url: "/ai/rag/templates/999/reindex",
        headers: { authorization: `Bearer ${createToken("1", "super_admin")}` }
      });

      expect(res.statusCode).toBe(404);
      expect(JSON.parse(res.body).code).toBe(BizCode.RAG_TEMPLATE_NOT_FOUND);
    });
  });

  // ════════════════════════════════════════════════════════════
  // DELETE /templates/:templateId/index
  // ════════════════════════════════════════════════════════════
  describe("DELETE /templates/:templateId/index", () => {
    it("未登录 → 401", async () => {
      const res = await app.inject({ method: "DELETE", url: "/ai/rag/templates/200/index" });
      expect(res.statusCode).toBe(401);
    });

    it("已登录但非超级管理员 → 403", async () => {
      const res = await app.inject({
        method: "DELETE",
        url: "/ai/rag/templates/200/index",
        headers: { authorization: `Bearer ${createToken("2", "user")}` }
      });
      expect(res.statusCode).toBe(403);
    });

    it("超级管理员 → 200，清理索引成功", async () => {
      deleteTemplateIndexMock.mockResolvedValue(undefined);

      const res = await app.inject({
        method: "DELETE",
        url: "/ai/rag/templates/200/index",
        headers: { authorization: `Bearer ${createToken("1", "super_admin")}` }
      });

      expect(res.statusCode).toBe(200);
      expect(deleteTemplateIndexMock).toHaveBeenCalledWith(BigInt(200));
    });

    it("模板 ID 非数字 → 400", async () => {
      const res = await app.inject({
        method: "DELETE",
        url: "/ai/rag/templates/abc/index",
        headers: { authorization: `Bearer ${createToken("1", "super_admin")}` }
      });

      expect(res.statusCode).toBe(400);
      expect(deleteTemplateIndexMock).not.toHaveBeenCalled();
    });
  });

  // ════════════════════════════════════════════════════════════
  // POST /knowledge/search
  // ════════════════════════════════════════════════════════════
  describe("POST /knowledge/search", () => {
    it("已登录用户携带合法请求体 → 200，透传 hybridSearch 结果，检索域为 knowledge", async () => {
      hybridSearchMock.mockResolvedValue({
        items: [
          {
            id: "1042",
            score: 0.85,
            vectorScore: 0.9,
            keywordScore: 0.7,
            snippet: "……建议采用 5 点或 7 点 Likert 量表……",
            source: { type: "knowledge", refId: "500", title: "问卷设计方法论手册 v2" }
          }
        ],
        degraded: null
      });

      const res = await app.inject({
        method: "POST",
        url: "/ai/rag/knowledge/search",
        headers: { authorization: `Bearer ${createToken("2", "user")}` },
        payload: { query: "量表题设计规范", topK: 5, alpha: 0.7 }
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data.items).toHaveLength(1);
      expect(hybridSearchMock).toHaveBeenCalledWith("knowledge", "量表题设计规范", { topK: 5, alpha: 0.7 });
    });

    it("未检索到相关知识片段 → 200，items 为空数组", async () => {
      hybridSearchMock.mockResolvedValue({ items: [], degraded: null });

      const res = await app.inject({
        method: "POST",
        url: "/ai/rag/knowledge/search",
        headers: { authorization: `Bearer ${createToken("2", "user")}` },
        payload: { query: "不存在的主题" }
      });

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).data.items).toEqual([]);
    });

    it("query 为空字符串 → 400 参数校验失败", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/ai/rag/knowledge/search",
        headers: { authorization: `Bearer ${createToken("2", "user")}` },
        payload: { query: "" }
      });

      expect(res.statusCode).toBe(400);
      expect(hybridSearchMock).not.toHaveBeenCalled();
    });

    it("未登录且未携带内部服务 Key → 401", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/ai/rag/knowledge/search",
        payload: { query: "量表题设计规范" }
      });

      expect(res.statusCode).toBe(401);
    });

    it("携带合法 X-Internal-Api-Key → 内部服务鉴权通过，无需 JWT", async () => {
      process.env.AI_SERVICE_INTERNAL_KEY = "internal-secret";
      hybridSearchMock.mockResolvedValue({ items: [], degraded: null });

      const res = await app.inject({
        method: "POST",
        url: "/ai/rag/knowledge/search",
        headers: { "x-internal-api-key": "internal-secret" },
        payload: { query: "量表题设计规范" }
      });

      expect(res.statusCode).toBe(200);
      expect(hybridSearchMock).toHaveBeenCalled();
    });
  });

  // ════════════════════════════════════════════════════════════
  // POST /knowledge/documents
  // ════════════════════════════════════════════════════════════
  describe("POST /knowledge/documents", () => {
    it("未登录 → 401", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/ai/rag/knowledge/documents",
        payload: { title: "问卷设计方法论手册 v2", content: "……正文内容……" }
      });
      expect(res.statusCode).toBe(401);
    });

    it("已登录但非超级管理员 → 403", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/ai/rag/knowledge/documents",
        headers: { authorization: `Bearer ${createToken("2", "user")}` },
        payload: { title: "问卷设计方法论手册 v2", content: "……正文内容……" }
      });
      expect(res.statusCode).toBe(403);
    });

    it("超级管理员携带合法请求体 → 200，创建文档并写入索引，返回 documentId/chunkCount", async () => {
      prisma.knowledgeDocument.create.mockResolvedValue({ id: BigInt(500) });
      indexKnowledgeDocumentMock.mockResolvedValue({ chunkCount: 4 });

      const res = await app.inject({
        method: "POST",
        url: "/ai/rag/knowledge/documents",
        headers: { authorization: `Bearer ${createToken("1", "super_admin")}` },
        payload: { title: "问卷设计方法论手册 v2", source: "内部培训资料", content: "……正文内容……" }
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body).data;
      expect(body.documentId).toBe("500");
      expect(body.chunkCount).toBe(4);
      expect(prisma.knowledgeDocument.create).toHaveBeenCalledWith({
        data: { title: "问卷设计方法论手册 v2", source: "内部培训资料", created_by: MOCK_ADMIN.id }
      });
      expect(indexKnowledgeDocumentMock).toHaveBeenCalledWith(BigInt(500), "……正文内容……");
    });

    it("title 为空 → 400 参数校验失败，不创建文档", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/ai/rag/knowledge/documents",
        headers: { authorization: `Bearer ${createToken("1", "super_admin")}` },
        payload: { title: "", content: "……正文内容……" }
      });

      expect(res.statusCode).toBe(400);
      expect(prisma.knowledgeDocument.create).not.toHaveBeenCalled();
    });

    it("content 为空 → 400 参数校验失败，不创建文档", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/ai/rag/knowledge/documents",
        headers: { authorization: `Bearer ${createToken("1", "super_admin")}` },
        payload: { title: "问卷设计方法论手册 v2", content: "" }
      });

      expect(res.statusCode).toBe(400);
      expect(prisma.knowledgeDocument.create).not.toHaveBeenCalled();
    });
  });

  // ════════════════════════════════════════════════════════════
  // DELETE /knowledge/documents/:documentId
  // ════════════════════════════════════════════════════════════
  describe("DELETE /knowledge/documents/:documentId", () => {
    it("未登录 → 401", async () => {
      const res = await app.inject({ method: "DELETE", url: "/ai/rag/knowledge/documents/500" });
      expect(res.statusCode).toBe(401);
    });

    it("已登录但非超级管理员 → 403", async () => {
      const res = await app.inject({
        method: "DELETE",
        url: "/ai/rag/knowledge/documents/500",
        headers: { authorization: `Bearer ${createToken("2", "user")}` }
      });
      expect(res.statusCode).toBe(403);
    });

    it("超级管理员 → 200，软下线成功", async () => {
      deactivateKnowledgeDocumentMock.mockResolvedValue(undefined);

      const res = await app.inject({
        method: "DELETE",
        url: "/ai/rag/knowledge/documents/500",
        headers: { authorization: `Bearer ${createToken("1", "super_admin")}` }
      });

      expect(res.statusCode).toBe(200);
      expect(deactivateKnowledgeDocumentMock).toHaveBeenCalledWith(BigInt(500));
    });

    it("重复下线同一文档 → 保持幂等，两次均返回 200", async () => {
      deactivateKnowledgeDocumentMock.mockResolvedValue(undefined);

      const first = await app.inject({
        method: "DELETE",
        url: "/ai/rag/knowledge/documents/500",
        headers: { authorization: `Bearer ${createToken("1", "super_admin")}` }
      });
      const second = await app.inject({
        method: "DELETE",
        url: "/ai/rag/knowledge/documents/500",
        headers: { authorization: `Bearer ${createToken("1", "super_admin")}` }
      });

      expect(first.statusCode).toBe(200);
      expect(second.statusCode).toBe(200);
      expect(deactivateKnowledgeDocumentMock).toHaveBeenCalledTimes(2);
    });

    it("文档不存在 → 404（IndexerService 抛出 AppError 由全局错误处理器捕获）", async () => {
      deactivateKnowledgeDocumentMock.mockRejectedValue(
        new AppError("知识文档不存在", StatusCode.NOT_FOUND, BizCode.RAG_KNOWLEDGE_DOCUMENT_NOT_FOUND)
      );

      const res = await app.inject({
        method: "DELETE",
        url: "/ai/rag/knowledge/documents/999",
        headers: { authorization: `Bearer ${createToken("1", "super_admin")}` }
      });

      expect(res.statusCode).toBe(404);
      expect(JSON.parse(res.body).code).toBe(BizCode.RAG_KNOWLEDGE_DOCUMENT_NOT_FOUND);
    });

    it("文档 ID 非数字 → 400", async () => {
      const res = await app.inject({
        method: "DELETE",
        url: "/ai/rag/knowledge/documents/abc",
        headers: { authorization: `Bearer ${createToken("1", "super_admin")}` }
      });

      expect(res.statusCode).toBe(400);
      expect(deactivateKnowledgeDocumentMock).not.toHaveBeenCalled();
    });
  });
});
