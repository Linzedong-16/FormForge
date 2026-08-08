# Quickstart: RAG 检索增强能力验证指南

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Data Model**: [data-model.md](./data-model.md) | **Contracts**: [contracts/](./contracts/)

本指南给出端到端验证三个用户故事（P1 生成增强 / P2 语义聚类 / P3 知识库问答）的最小可运行步骤，不包含实现代码，具体模型/服务/迁移细节见 data-model.md 与 contracts/。

## 前置条件

1. PostgreSQL 实例已启用 `pgvector` 扩展（`CREATE EXTENSION IF NOT EXISTS vector;`，随本功能迁移一并执行）。
2. `app/q-server` 环境变量已配置至少一个可用的 Embedding Provider（`AI_PROVIDER` 及对应 API Key，见 research.md §3）。
3. `app/q-server` 与 `app/ai-service` 均已配置 `AI_SERVICE_INTERNAL_KEY`（用于 `authenticateOrInternal` 中间件与 `rag_client.py` 的内部调用鉴权）。
4. 数据库中已存在至少若干条 `review_status = approved` 的 `Template` 记录（P1 场景依赖）与若干条包含开放题答卷的 `Response`/`Answer` 记录（P2 场景依赖）。

## 环境启动

```bash
# q-server：执行 pgvector 迁移并启动服务
cd app/q-server
pnpm prisma migrate deploy
pnpm dev

# ai-service：启动服务（另一终端）
cd app/ai-service
uv run fastapi dev
```

## 场景 P1：生成增强 —— 检索历史模板并注入生成流程

1. 管理员对若干已审核通过的 `Template` 触发索引重建（对应 contracts/q-server-ai-rag.openapi.yaml 的 `POST /api/ai/rag/templates/{templateId}/reindex`），确认响应 `code=0` 且 `data.chunkCount > 0`。
2. 调用既有 AI 生成问卷接口（`ai-generate` 模块），观察生成结果中的题目风格/结构是否体现出对已索引模板的参考（可通过对比"关闭检索"与"启用检索"两次生成结果的差异间接验证，因为 RAG 增强不改变生成接口的对外契约）。
3. **预期结果**：生成请求正常返回（不因检索环节引入而报错或显著变慢，符合 SC-005 的 P95 < 1s 检索预算）；对同一主题的重复生成請求，题目相似度/合理性有可观察的提升趋势。

## 场景 P2：语义聚类 —— 开放题答卷主题聚类

1. 准备一个开放题题目下有足够数量答卷文本的问卷（样本量需达到聚类算法的最小可用阈值，见 contracts/ai-service-rag-tools.md 的 `insufficient_data` 说明）。
2. 触发 `AnalysisAgent` 调用 `semantic_cluster_tool`（对应 contracts/ai-service-rag-tools.md），传入 `survey_id`/`question_component_id`。
3. **预期结果（正常路径）**：返回 `SemanticClusterResult`，`clusters` 非空，每个簇含 `label`/`representative_text`/`sample_count`/`sentiment_score`；`noise_count` 反映未归类样本数（FR-011）。
4. **预期结果（样本不足路径）**：将目标改为答卷数极少的题目，重复步骤 2，确认返回 `insufficient_data=True` 且 `clusters=[]`，而不是报错或整体失败（FR-010/FR-020）。

## 场景 P3：知识库问答 —— 可追溯引用

1. 管理员导入一份知识文档（对应 contracts/q-server-ai-rag.openapi.yaml 的 `POST /api/ai/rag/knowledge/documents`），确认响应 `data.chunkCount > 0`。
2. 在问卷设计助手（`ChatAgent`）中提出一个该文档能覆盖的问题，观察 SSE 事件流。
3. **预期结果**：在 `token` 事件之后、`done` 事件之前出现至少一个 `citation` 事件（对应 contracts/ai-service-rag-tools.md），其 `document_title`/`snippet` 可与刚导入的文档内容对应上。
4. 提出一个知识库完全未覆盖的问题，确认：不出现任何编造的 `citation` 事件，回答文本中如实说明未找到相关依据（FR-015）。
5. 将该知识文档置为下线（`is_active=false`，通过管理端删除/下线操作触发），重复步骤 2 中的原问题，确认不再出现该文档的引用（Edge Case：知识库文档内容更新后旧版本不应继续被引用）。

## 降级验证（对应 FR-020/SC-006）

1. 临时使 Embedding Provider 不可用（如将 API Key 置为无效值并重启 q-server），重复场景 P1/P3 的检索请求，确认：
   - `search-templates`/`search-knowledge` 返回 `code=0`，`data.degraded="vector_unavailable"`，`data.items` 基于关键词检索结果返回（而非直接报错）。
   - 场景 P1 的生成流程与场景 P3 的问答流程仍能正常完成（跳过语义增强部分），不整体失败。
2. 恢复配置后重复验证，确认 `degraded` 字段恢复为 `null`。

## 评测集验证（对应 SC-004）

1. 准备至少 20 条覆盖三个场景的查询评测集（人工标注每条查询的预期相关结果）。
2. 逐条调用对应检索端点，计算 Top-5 命中率。
3. **预期结果**：整体 Top-5 命中率 ≥ 80%；未达标时依据 research.md §4/§5 中记录的可调整项（`alpha` 权重、关键词检索方案）进行调优，无需改变架构设计。
