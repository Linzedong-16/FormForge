/**
 * RAG 检索增强模块 — Fastify 装饰器插件
 *
 * 将 IndexerService/RetrieverService 挂载为 fastify.aiRag，供跨模块复用：
 *   - review.service.ts 模板审核通过后 fire-and-forget 调用 fastify.aiRag.indexer.indexTemplate
 *   - ai-generate.service.ts 生成前调用 fastify.aiRag.retriever.hybridSearch 检索参考上下文
 * 使用 fastify-plugin 包裹以打破插件封装边界，保证根实例及所有子路由都能访问同一实例
 * （与 prisma/redis/amqp 等跨模块能力的装饰方式保持一致）。
 */
import fp from "fastify-plugin";
import type { FastifyPluginAsync } from "fastify";
import { IndexerService } from "../modules/ai/ai-rag/indexer.service.js";
import { RetrieverService } from "../modules/ai/ai-rag/retriever.service.js";

declare module "fastify" {
  interface FastifyInstance {
    aiRag: {
      indexer: IndexerService;
      retriever: RetrieverService;
    };
  }
}

const aiRagPlugin: FastifyPluginAsync = async fastify => {
  fastify.decorate("aiRag", {
    indexer: new IndexerService(fastify),
    retriever: new RetrieverService(fastify)
  });
};

export default fp(aiRagPlugin, { name: "ai-rag" });
