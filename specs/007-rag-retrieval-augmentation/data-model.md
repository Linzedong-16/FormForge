# Data Model: RAG 检索增强能力

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Research**: [research.md](./research.md)

本文档从 spec.md 的 Key Entities 提取具体数据结构，均为 `app/q-server` 侧的 Prisma 模型（唯一持久化归属方，见 research.md §1、§2）。命名与外键相对参考文档做了纠正（见 research.md §8）。

## 1. TemplateEmbedding（问卷模板索引片段）

对应 spec.md Key Entities「问卷模板索引片段」。由已发布问卷模板（`Template` 模型）的标题描述、题目内容切分而成的可检索文本单元。

```prisma
model TemplateEmbedding {
  id           BigInt   @id @default(autoincrement())
  template_id  BigInt // 关联 Template.id（不是 Survey.id —— Template 是完全解耦的独立模型）
  chunk_type   String // 片段类型：overview（标题+描述整体） | question（单个题目）
  chunk_index  Int      @default(0) // 同一 template 内的片段序号，overview 固定为 0
  chunk_text   String // 实际参与 Embedding 计算的原文
  embedding    Unsupported("vector")? // pgvector 列，维度由迁移 SQL 按实际模型输出维度指定
  metadata     Json     @default("{}") // 附加信息：题型分布、答卷数、评分等快照
  created_at   DateTime @default(now())
  updated_at   DateTime @updatedAt

  template Template @relation(fields: [template_id], references: [id], onDelete: Cascade)

  @@index([template_id])
  @@map("template_embeddings")
}
```

**字段说明**:

- `template_id`：外键指向 `Template.id`（`BigInt`），级联删除——模板下线时索引片段自动清理（对应 FR-002）。
- `chunk_type`：区分"整体概述"与"单题"两种切片粒度，检索时可按需过滤。
- `metadata`：冗余存储生成检索结果摘要所需的展示字段（模板标题、题型数量等），避免检索路径二次查询 `Template`/`TemplateComponent` 造成 N+1（对应 constitution Principle X 的查询性能要求）。
- `embedding`：Prisma 用 `Unsupported("vector")` 声明列类型，实际的 `vector(N)` 维度与索引（`ivfflat`）通过手写迁移 SQL 定义（`prisma migrate dev --create-only` 生成骨架后手动补充），维度值取决于 research.md §3 最终选定的 Embedding 模型输出维度。

**校验规则**（对应 FR-016/FR-019）:

- `chunk_text` 长度上限（写入前截断或拒绝超长输入，与检索请求的输入上限对应 FR-019 一致的量级）。
- 写入/更新仅限已通过 `review_status = approved` 的模板触发索引（草稿/待审模板不参与检索，避免未审核内容被检索到造成权限越界）。

**同步规则**（对应 FR-001）: `review.service.ts` 的 `approveReview` 方法在模板审核通过后，以 fire-and-forget 方式调用 `indexer.service.ts` 的 `indexTemplate(templateId)`，全量重算该模板的所有 `chunk`（先删除旧片段再写入新片段，避免历史版本残留造成检索结果重复过时，对应 Edge Case「同一份问卷被多次编辑并重新发布」）；索引失败不影响审核流程本身的成功返回。

## 2. KnowledgeChunk（知识文档片段）

对应 spec.md Key Entities「知识文档片段」。由管理员导入的问卷设计方法论、统计规范等知识文档切分而成的可检索文本单元。

```prisma
model KnowledgeDocument {
  id          BigInt   @id @default(autoincrement())
  title       String
  source      String? // 文档来源说明（如"内部方法论手册 v2"）
  is_active   Boolean  @default(true) // 下线标记：置为 false 后其片段不再参与检索
  created_by  BigInt // 关联 User.id（管理员）
  created_at  DateTime @default(now())
  updated_at  DateTime @updatedAt

  chunks KnowledgeChunk[]

  @@index([is_active])
  @@map("knowledge_documents")
}

model KnowledgeChunk {
  id          BigInt   @id @default(autoincrement())
  document_id BigInt
  chunk_index Int // 文档内的片段序号，用于还原上下文顺序
  section     String? // 所属章节标题，用于引用来源展示
  chunk_text  String
  embedding   Unsupported("vector")?
  created_at  DateTime @default(now())
  updated_at  DateTime @updatedAt

  document KnowledgeDocument @relation(fields: [document_id], references: [id], onDelete: Cascade)

  @@index([document_id])
  @@map("knowledge_chunks")
}
```

**字段说明**:

- 拆分为 `KnowledgeDocument`（文档级元信息）+ `KnowledgeChunk`（片段级检索单元）两个模型，而非参考文档扁平化的单一 `KnowledgeChunk` 表，原因：文档的新增/更新/删除（FR-012）是管理员操作的最小单元，需要独立的生命周期状态（`is_active`）与审计字段（`created_by`），拆分后便于 `ai-rag.routes.ts` 的 `index-knowledge`/删除接口分别对"文档"和"片段"寻址。
- `is_active = false` 即软下线（对应 FR-012「删除」需求与 Edge Case「知识库文档内容更新后，旧版本引用是否会继续出现」）：由 `DELETE /knowledge/documents/{documentId}` 端点触发（见 contracts/q-server-ai-rag.openapi.yaml），检索查询必须 `WHERE document.is_active = true`，下线后旧内容立即不再被检索到，无需物理删除即可满足"不得再引用旧内容"的要求；管理员如需彻底清理再触发物理删除级联 `chunks`。「更新」知识文档内容通过"下线旧文档 + 调用 `POST /knowledge/documents` 导入新文档"组合完成，不提供单独的内容级更新接口。

**校验规则**: 同 `TemplateEmbedding`，`chunk_text` 长度上限；`section` 允许为空（非结构化文档可能无章节标记）。

## 3. 检索请求与结果（运行时结构，非持久化模型）

对应 spec.md Key Entities「检索请求与结果」。以 Zod（`ai-rag.schemas.ts`）定义，不落库。

```ts
// 请求
{
  query: string;          // 查询文本，长度上限对应 FR-019（如 <= 500 字符）
  scope?: "template" | "knowledge"; // 检索范围
  topK?: number;           // 返回数量上限，默认 5，硬上限如 20（FR-019）
  alpha?: number;          // 语义/关键词权重，默认 0.7（FR-005），范围 [0, 1]
}

// 结果
{
  items: Array<{
    id: string;
    score: number;        // 综合相关度得分
    vectorScore: number;
    keywordScore: number;
    snippet: string;       // 展示用摘要
    source: { type: "template" | "knowledge"; refId: string; title: string };
  }>;
  degraded?: "vector_unavailable" | "keyword_unavailable" | "none"; // 对应 FR-020 降级标记
}
```

## 4. 语义主题聚类结果（运行时结构，非持久化模型）

对应 spec.md Key Entities「语义主题聚类结果」。产生于 ai-service 场景 B，不持久化（research.md §2），由 `semantic_cluster_tool` 返回给 `AnalysisAgent`。

```python
class SemanticClusterItem(BaseModel):
    label: str  # 主题标签/代表性描述
    representative_text: str  # 代表性原文
    sample_count: int  # 簇内样本数
    sentiment_score: float  # 情感倾向评分，范围 [-1, 1]


class SemanticClusterResult(BaseModel):
    clusters: list[SemanticClusterItem]
    noise_count: int  # 未能归类的噪声样本数（对应 FR-011）
    insufficient_data: bool  # 样本量不足时为 True（对应 FR-010），此时 clusters 为空
```

## 5. 引用来源（运行时结构，非持久化模型）

对应 spec.md Key Entities「引用来源」。附加在设计助手（`ChatAgent`）回答中的 SSE `citation` 事件负载内。

```python
class Citation(BaseModel):
    document_title: str
    section: str | None
    chunk_id: str
    snippet: str  # 用于用户核实的原文片段
```

## 数据留存与 PII

（constitution Principle IX 强制记录项，详见 research.md §10 的完整决策与理由，此处摘要）

- `TemplateEmbedding`/`KnowledgeDocument`/`KnowledgeChunk` 均为管理员维护的结构化内容，默认不含个人身份信息；留存周期与其对应的 `Template`/知识文档源记录同生命周期，源记录删除/下线时同步清理。
- 场景 B 的答卷文本 Embedding 计算为一次性、不持久化，不产生新的存储实体或留存周期。
