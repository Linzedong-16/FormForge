/**
 * AI RAG 检索增强模块 — 路由定义（模板检索域 + 知识库检索域）
 *
 * 挂载前缀：/ai/rag（在 routes/index.ts 中注册，最终路径 /api/ai/rag）
 * 接口契约见 specs/007-rag-retrieval-augmentation/contracts/q-server-ai-rag.openapi.yaml：
 *   - POST   /templates/search                  authenticateOrInternal（登录用户或内部服务均可调用）
 *   - POST   /templates/:templateId/reindex      adminOnly（仅超级管理员）
 *   - DELETE /templates/:templateId/index        adminOnly（仅超级管理员）
 *   - POST   /knowledge/search                   authenticateOrInternal（登录用户或内部服务均可调用）
 *   - POST   /knowledge/documents                adminOnly（仅超级管理员，导入知识文档）
 *   - DELETE /knowledge/documents/:documentId     adminOnly（仅超级管理员，软下线知识文档）
 * indexer/retriever 服务实例统一从 fastify.aiRag 装饰器获取（见 plugins/ai-rag.ts），
 * 与 review.service.ts 等其他模块复用同一实例，避免重复 new。
 */
import type { FastifyPluginAsync, FastifyReply } from "fastify";
import { authenticate, requireSuperAdmin, authenticateOrInternal } from "../../user/auth/auth.middleware.js";
import { templateIdSchema } from "../../template/template.schemas.js";
import {
  searchRequestSchema,
  createKnowledgeDocumentRequestSchema,
  knowledgeDocumentIdSchema
} from "./ai-rag.schemas.js";
import type { CreateKnowledgeDocumentResponseData } from "./ai-rag.schemas.js";
import { parseAndRespond } from "../../../utils/zod.js";

/** 解析并校验模板 ID，非法格式返回 400 */
function parseTemplateId(id: string, reply: FastifyReply): bigint | null {
  const result = templateIdSchema.safeParse(id);
  if (!result.success) {
    reply.status(400).send({ data: null, code: 400, msg: "模板 ID 格式错误" });
    return null;
  }
  return result.data;
}

/** 解析并校验知识文档 ID，非法格式返回 400 */
function parseDocumentId(id: string, reply: FastifyReply): bigint | null {
  const result = knowledgeDocumentIdSchema.safeParse(id);
  if (!result.success) {
    reply.status(400).send({ data: null, code: 400, msg: "知识文档 ID 格式错误" });
    return null;
  }
  return result.data;
}

const aiRagRoutes: FastifyPluginAsync = async fastify => {
  // ════════════════════════════════════════════════════════════
  // POST /templates/search — 混合检索历史模板片段（FR-003/FR-007）
  // ════════════════════════════════════════════════════════════
  fastify.post(
    "/templates/search",
    {
      preHandler: authenticateOrInternal,
      config: { rateLimit: { max: 30, timeWindow: "1 minute" } }
    },
    async (request, reply) => {
      const body = parseAndRespond(searchRequestSchema.safeParse(request.body), reply);
      if (!body) return;

      const result = await fastify.aiRag.retriever.hybridSearch("template", body.query, {
        topK: body.topK,
        alpha: body.alpha
      });
      return reply.sendSuccess(result);
    }
  );

  // ════════════════════════════════════════════════════════════
  // POST /templates/:templateId/reindex — 管理员手动重建模板索引（FR-002）
  // ════════════════════════════════════════════════════════════
  fastify.post(
    "/templates/:templateId/reindex",
    {
      preHandler: [authenticate, requireSuperAdmin],
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } }
    },
    async (request, reply) => {
      const { templateId } = request.params as { templateId: string };
      const id = parseTemplateId(templateId, reply);
      if (id === null) return;

      const result = await fastify.aiRag.indexer.indexTemplate(id);
      return reply.sendSuccess(result);
    }
  );

  // ════════════════════════════════════════════════════════════
  // DELETE /templates/:templateId/index — 管理员清理模板索引（模板下线场景）
  // ════════════════════════════════════════════════════════════
  fastify.delete(
    "/templates/:templateId/index",
    {
      preHandler: [authenticate, requireSuperAdmin],
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } }
    },
    async (request, reply) => {
      const { templateId } = request.params as { templateId: string };
      const id = parseTemplateId(templateId, reply);
      if (id === null) return;

      await fastify.aiRag.indexer.deleteTemplateIndex(id);
      return reply.sendSuccess(null);
    }
  );

  // ════════════════════════════════════════════════════════════
  // POST /knowledge/search — 混合检索知识库片段（FR-013/FR-007）
  // ════════════════════════════════════════════════════════════
  fastify.post(
    "/knowledge/search",
    {
      preHandler: authenticateOrInternal,
      config: { rateLimit: { max: 30, timeWindow: "1 minute" } }
    },
    async (request, reply) => {
      const body = parseAndRespond(searchRequestSchema.safeParse(request.body), reply);
      if (!body) return;

      const result = await fastify.aiRag.retriever.hybridSearch("knowledge", body.query, {
        topK: body.topK,
        alpha: body.alpha
      });
      return reply.sendSuccess(result);
    }
  );

  // ════════════════════════════════════════════════════════════
  // POST /knowledge/documents — 管理员导入知识文档（FR-012）
  // ════════════════════════════════════════════════════════════
  fastify.post(
    "/knowledge/documents",
    {
      preHandler: [authenticate, requireSuperAdmin],
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } }
    },
    async (request, reply) => {
      const body = parseAndRespond(createKnowledgeDocumentRequestSchema.safeParse(request.body), reply);
      if (!body) return;

      const document = await fastify.prisma.knowledgeDocument.create({
        data: { title: body.title, source: body.source, created_by: request.user!.userId }
      });

      const { chunkCount } = await fastify.aiRag.indexer.indexKnowledgeDocument(document.id, body.content);

      const result: CreateKnowledgeDocumentResponseData = {
        documentId: document.id.toString(),
        chunkCount
      };
      return reply.sendSuccess(result);
    }
  );

  // ════════════════════════════════════════════════════════════
  // DELETE /knowledge/documents/:documentId — 管理员软下线知识文档（FR-012）
  // ════════════════════════════════════════════════════════════
  fastify.delete(
    "/knowledge/documents/:documentId",
    {
      preHandler: [authenticate, requireSuperAdmin],
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } }
    },
    async (request, reply) => {
      const { documentId } = request.params as { documentId: string };
      const id = parseDocumentId(documentId, reply);
      if (id === null) return;

      await fastify.aiRag.indexer.deactivateKnowledgeDocument(id);
      return reply.sendSuccess(null);
    }
  );
};

export default aiRagRoutes;
