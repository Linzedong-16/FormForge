-- 修正历史遗留问题：template_embeddings / knowledge_chunks 的 embedding 列
-- 实际物理维度仍是 1536（早期按 OpenAI 方案手动建表遗留），
-- 但 007-rag-retrieval-augmentation 实际接入的 Embedding Provider
-- 是硅基流动（SiliconFlow）中转的 BAAI/bge-large-zh-v1.5，输出向量为 1024 维，
-- 导致写入时报错 `expected 1536 dimensions, not 1024`。
-- 两表当前均无数据，直接调整列类型，无需迁移历史向量。
DROP INDEX IF EXISTS "template_embeddings_embedding_idx";
ALTER TABLE "template_embeddings" ALTER COLUMN "embedding" TYPE vector(1024);
CREATE INDEX "template_embeddings_embedding_idx" ON "template_embeddings" USING ivfflat ("embedding" vector_cosine_ops) WITH (lists = 100);

DROP INDEX IF EXISTS "knowledge_chunks_embedding_idx";
ALTER TABLE "knowledge_chunks" ALTER COLUMN "embedding" TYPE vector(1024);
CREATE INDEX "knowledge_chunks_embedding_idx" ON "knowledge_chunks" USING ivfflat ("embedding" vector_cosine_ops) WITH (lists = 100);
