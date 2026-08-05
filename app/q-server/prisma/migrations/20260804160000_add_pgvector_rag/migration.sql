-- CreateExtension
-- pgvector 扩展：RAG 检索增强能力（007-rag-retrieval-augmentation）依赖的向量类型与索引
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateTable
-- 注意：embedding 列维度固定为 1024，对应硅基流动（SiliconFlow）中转的
-- BAAI/bge-large-zh-v1.5 模型（见 app/q-server/src/config/langchain.ts embedBatch）。
-- 架构约束：若未来切换到不同维度的 Embedding Provider，需要新增迁移调整该列维度，
-- 不能直接复用已写入的历史向量数据（维度不同无法比较余弦相似度）。
CREATE TABLE "template_embeddings" (
    "id" BIGSERIAL NOT NULL,
    "template_id" BIGINT NOT NULL,
    "chunk_type" TEXT NOT NULL,
    "chunk_index" INTEGER NOT NULL DEFAULT 0,
    "chunk_text" TEXT NOT NULL,
    "embedding" vector(1024),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "template_embeddings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_documents" (
    "id" BIGSERIAL NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "source" VARCHAR(200),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" BIGINT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_chunks" (
    "id" BIGSERIAL NOT NULL,
    "document_id" BIGINT NOT NULL,
    "chunk_index" INTEGER NOT NULL,
    "section" VARCHAR(200),
    "chunk_text" TEXT NOT NULL,
    "embedding" vector(1024),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "template_embeddings_template_id_idx" ON "template_embeddings"("template_id");

-- CreateIndex
-- IVFFlat 近似最近邻索引，lists=100 对应 research.md 建议的中小数据规模默认值
CREATE INDEX "template_embeddings_embedding_idx" ON "template_embeddings" USING ivfflat ("embedding" vector_cosine_ops) WITH (lists = 100);

-- CreateIndex
CREATE INDEX "knowledge_documents_is_active_idx" ON "knowledge_documents"("is_active");

-- CreateIndex
CREATE INDEX "knowledge_documents_created_by_idx" ON "knowledge_documents"("created_by");

-- CreateIndex
CREATE INDEX "knowledge_chunks_document_id_idx" ON "knowledge_chunks"("document_id");

-- CreateIndex
CREATE INDEX "knowledge_chunks_embedding_idx" ON "knowledge_chunks" USING ivfflat ("embedding" vector_cosine_ops) WITH (lists = 100);

-- AddForeignKey
ALTER TABLE "template_embeddings" ADD CONSTRAINT "template_embeddings_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_documents" ADD CONSTRAINT "knowledge_documents_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_chunks" ADD CONSTRAINT "knowledge_chunks_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "knowledge_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
