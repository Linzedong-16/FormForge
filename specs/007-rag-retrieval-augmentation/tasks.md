---
description: "Task list template for feature implementation"
---

# Tasks: RAG 检索增强能力

**Input**: Design documents from `/specs/007-rag-retrieval-augmentation/`

**Prerequisites**: [plan.md](./plan.md)、[spec.md](./spec.md)、[research.md](./research.md)、[data-model.md](./data-model.md)、[contracts/](./contracts/)、[quickstart.md](./quickstart.md)

**Tests**: 本功能须遵循 constitution Principle V（Test-First / Test-Adequate Delivery）——含分支逻辑的新增业务代码（检索降级路径、alpha 权重边界、鉴权分支等）**必须**在同一 PR 内提供 Vitest（q-server）/ pytest（ai-service）单测，故下方测试任务为强制项，非可选项。

**Organization**: 任务按用户故事分组（US1 P1 生成增强 / US2 P2 语义聚类 / US3 P3 知识库问答），支持独立实现与独立验证。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可并行执行（不同文件、无依赖关系）
- **[Story]**: 任务所属用户故事（US1/US2/US3）；Setup/Foundational/Polish 阶段任务不带该标签
- 每个任务均给出精确文件路径

## Path Conventions

- q-server（Node.js/Fastify/Prisma）：`app/q-server/src/`、`app/q-server/prisma/`
- ai-service（Python/FastAPI）：`app/ai-service/src/`、`app/ai-service/tests/`
- 文档：`docs/`

---

## Phase 1: Setup（共享基础设施）

**Purpose**: 补齐实现本功能前必需但与具体用户故事无关的依赖与工具链缺口

- [x] T001 [P] 在 `app/ai-service/pyproject.toml` 的 `analysis` 分组新增 `scikit-learn>=1.4.0`（同步补充到 `all` 分组），用于 US2 场景 B 的 `HDBSCAN` 聚类（research.md §7 决策：使用 scikit-learn 内置实现，不引入独立 `hdbscan` 包）；修改后在 `app/ai-service` 目录执行 `uv sync` 刷新 `uv.lock`
- [x] T002 [P] 在 `.cspell/custom-dictionary.txt` 新增本功能引入的技术术语（如 `pgvector`、`ivfflat`、`hdbscan`、`embedding`、`chromadb`、`tiktoken`、`ilike` 等，逐一核对避免与现有词条重复），消除后续 ESLint/cspell 检查噪音

---

## Phase 2: Foundational（阻塞性前置依赖）

**Purpose**: US1（生成增强）与 US3（知识库问答）共同依赖的持久化 Embedding/检索基础设施

**⚠️ CRITICAL**: US1、US3 的实现任务必须等本阶段完成后才能开始。**US2（语义聚类）不依赖本阶段**——其实现完全在 `app/ai-service` 内部完成、不落库、不调用 q-server 的 `ai-rag` 模块，可与本阶段并行推进（仅依赖 Phase 1 的 T001）。

- [x] T003 在 `app/q-server/prisma/schema.prisma` 新增 `TemplateEmbedding`、`KnowledgeDocument`、`KnowledgeChunk` 三个模型（字段/关联/索引严格对齐 data-model.md：`TemplateEmbedding.template_id` 外键指向 `Template.id`、`onDelete: Cascade`；`KnowledgeChunk.document_id` 外键指向 `KnowledgeDocument.id`；`embedding` 字段用 `Unsupported("vector")?` 声明占位）
- [x] T004 基于 T003 执行 `pnpm --filter q-server exec prisma migrate dev --create-only --name add_pgvector_rag` 生成迁移骨架，手工编辑 `app/q-server/prisma/migrations/<timestamp>_add_pgvector_rag/migration.sql`：追加 `CREATE EXTENSION IF NOT EXISTS vector;`，将 `embedding` 列的类型改写为真实的 `vector(1536)`（对应当前默认 Provider OpenAI `text-embedding-3-small` 的维度，并在 SQL 注释中记录"切换到不同维度的 Embedding Provider 需要新增迁移调整该列维度"这一架构约束），并为 `template_embeddings.embedding`/`knowledge_chunks.embedding` 新增 IVFFlat 索引（`USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)`）（depends on T003）
- [x] T005 [P] 在 `app/q-server/src/utils/response.ts` 的 `BizCode` 枚举中，于 `AI_PARSE_FAILED = 4004,` 之后、`消息互动模块` 注释行之前，新增 ai-rag 模块错误码（4005~4010 号段，如 `RAG_TEMPLATE_NOT_FOUND`、`RAG_KNOWLEDGE_DOCUMENT_NOT_FOUND`、`RAG_EMBEDDING_UNAVAILABLE`、`RAG_QUERY_TOO_LONG` 等，具体名称与数量按 contracts/q-server-ai-rag.openapi.yaml 的错误响应场景确定），并补充中文注释说明模块归属
- [x] T006 [P] 在 `app/q-server/src/config/langchain.ts` 新增 `embedText(text: string)`/`embedBatch(texts: string[])` 函数，复用现有 `AI_PROVIDER` 环境驱动 Provider 选择与 API Key 解密/缓存模式：优先探测 DeepSeek 是否支持 Embedding 接口，不支持则降级为 OpenAI `text-embedding-3-small`；返回结果需带 provider/dimension 元信息，供上层按需处理，不硬编码维度（research.md §3）
- [x] T007 [P] 在 `app/q-server/src/modules/user/auth/auth.middleware.ts` 新增 `authenticateOrInternal(request, reply)` 中间件：复用已有 `hasValidInternalApiKey`（第 161 行）判断逻辑，命中 `X-Internal-Api-Key` 直接放行，否则回退调用现有 `authenticate`（去掉 `requireSuperAdminOrInternal` 中强制的 `requireSuperAdmin` 校验），并补充中文注释说明与 `requireSuperAdminOrInternal` 的差异
- [x] T008 [P] 新建 `app/q-server/src/modules/ai/ai-rag/ai-rag.schemas.ts`：用 Zod 定义 `SearchRequestSchema`（`query` 1~500 字符、`topK` 1~20 默认 5、`alpha` 0~1 默认 0.7，对应 FR-019/FR-005）、`CreateKnowledgeDocumentRequestSchema`（`title`≤200、`source`≤200、`content`≤50000）及对应响应体类型，字段与 contracts/q-server-ai-rag.openapi.yaml 完全对齐
- [x] T009 新建 `app/q-server/src/modules/ai/ai-rag/embedding.service.ts`：封装 `embedText`/`embedBatch`（调用 T006 产出的 `langchain.ts` 扩展），处理超长文本截断（对应 FR-019）与 Provider 调用异常捕获（记录 warn 日志后向上抛出可识别的降级错误，供 retriever/indexer 决策降级）（depends on T006）
- [x] T010 新建 `app/q-server/src/modules/ai/ai-rag/retriever.service.ts`：实现通用 `vectorSearch`/`keywordSearch`/`hybridSearch`，均接受 `scope: "template" | "knowledge"` 参数以复用同一套逻辑分别检索 `TemplateEmbedding`/`KnowledgeChunk`；`keywordSearch` 用 Prisma `contains`/`ILIKE`；`hybridSearch` 按 `score = alpha * 向量余弦相似度 + (1 - alpha) * 关键词二值得分` 合并排序；向量检索或关键词检索任一环节失败时降级为仅用另一环节并在返回结果标记 `degraded`（`vector_unavailable`/`keyword_unavailable`），两者都失败则返回空结果 `items=[]`（对应 FR-020/SC-006）；`scope="knowledge"` 检索必须 `join` 过滤 `KnowledgeDocument.is_active=true`，确保文档下线（`DELETE /knowledge/documents/{documentId}`）后其 `KnowledgeChunk` 立即不再被检索到（对应 FR-012、data-model.md「同步规则」）（depends on T003, T009）
- [x] T011 [P] 新建 `app/q-server/src/spec/ai/ai-rag/embedding.service.spec.ts`：覆盖 Provider 降级路径（DeepSeek 不支持时降级 OpenAI）、超长文本截断、调用失败时的异常语义（depends on T009）
- [x] T012 [P] 新建 `app/q-server/src/spec/ai/ai-rag/retriever.service.spec.ts`：覆盖 `alpha=0`/`alpha=1` 边界值、`scope=template`/`scope=knowledge` 两种检索域、向量检索失败降级为纯关键词、关键词检索失败降级为纯向量、两者皆失败返回空结果四条路径（depends on T010）
- [x] T013 [P] 扩展 `app/q-server/src/spec/user/auth/auth.middleware.spec.ts`：新增 `authenticateOrInternal` 用例（携带合法 `X-Internal-Api-Key` 放行、缺失/错误 Key 时回退标准 JWT 鉴权、JWT 也无效时返回 401）（depends on T007）

**Checkpoint**: Foundational 完成后，US1、US3 可开始实现；US2 全程不受本阶段阻塞

---

## Phase 3: User Story 1 - AI 生成问卷检索历史模板增强 (Priority: P1) 🎯 MVP

**Goal**: AI 生成问卷时自动检索历史优质模板作为参考，提升生成题目的结构与风格质量

**Independent Test**: 对同一生成请求分别在"启用检索"与"禁用检索"两种条件下生成，人工比对题目结构/风格的可观察差异；触发模板重建索引接口验证 `chunkCount > 0`

### Tests for User Story 1 ⚠️

- [x] T014 [P] [US1] 新建 `app/q-server/src/spec/ai/ai-rag/indexer.service.spec.ts`：覆盖 `indexTemplate` 正常切片写入、`deleteTemplateIndex` 清理、Embedding Provider 调用失败时的降级（跳过索引但不抛异常中断审核流程）

### Implementation for User Story 1

- [x] T015 [US1] 新建 `app/q-server/src/modules/ai/ai-rag/indexer.service.ts`：实现 `indexTemplate(templateId)`（按 `overview`/`question` 两类切片模板标题+描述+题目，调用 `embedding.service` 批量向量化后写入 `TemplateEmbedding`，先删除该模板旧片段再插入新片段）与 `deleteTemplateIndex(templateId)`（对应模板下线场景）（depends on T003, T009, T010）
- [x] T016 [US1] 新建 `app/q-server/src/modules/ai/ai-rag/ai-rag.routes.ts`：实现 `POST /templates/search`（`authenticateOrInternal` 鉴权，调用 `retriever.service.hybridSearch(scope="template")`）、`POST /templates/:templateId/reindex`（`adminOnly`，调用 `indexer.service.indexTemplate`，返回 `chunkCount`）、`DELETE /templates/:templateId/index`（`adminOnly`，调用 `indexer.service.deleteTemplateIndex`）三个端点，均统一走 `reply.sendSuccess`/`sendError` 响应封装与 T005 新增的 BizCode（depends on T008, T015）
- [x] T017 [US1] 在 `app/q-server/src/routes/index.ts` 中导入并注册 `ai-rag.routes.ts`（`fastify.register(aiRagRoutes, { prefix: "/ai/rag" })`），补充与现有模块一致风格的中文注释说明路径前缀（depends on T016）
- [x] T018 [P] [US1] 新建 `app/q-server/src/spec/ai/ai-rag/ai-rag.routes.spec.ts`：覆盖 `templates/search` 成功/参数校验失败/内部服务鉴权通过/降级 `degraded` 字段透出，以及 `reindex`/`index` 删除端点的管理员鉴权与 404 场景（depends on T016）
- [x] T019 [US1] 在 `app/q-server/src/modules/review/review.service.ts` 的 `approveReview` 方法中，模板审核通过分支（`tx.template.create()` 成功、事务提交返回 `updated` 之后）追加 `this.fastify.aiRag?.indexer.indexTemplate(template.id).catch(() => {})` 风格的 fire-and-forget 调用（与文件内现有 `createAuditLog(...).catch(() => {})` 模式一致，不阻塞审核响应、索引失败不影响审核结果）（depends on T015）
- [x] T020 [P] [US1] 扩展 `app/q-server/src/spec/review/review.service.spec.ts`：新增用例验证模板审核通过后触发 `indexTemplate` 调用，以及索引调用异常时审核流程仍正常返回成功（depends on T019）
- [x] T021 [US1] 在 `app/q-server/src/modules/ai/ai-generate/ai-generate.service.ts` 中，生成问卷前调用 `retriever.service.hybridSearch(scope="template")` 检索与用户生成需求语义相关的历史模板片段，将命中结果拼入现有 Prompt 模板作为参考上下文；检索失败/超时/空结果时均直接跳过增强、按原有逻辑正常生成（对应 FR-020/SC-006，不改变生成接口对外契约）（depends on T010）
- [x] T022 [P] [US1] 扩展 `app/q-server/src/spec/ai/ai-generate/ai-generate.service.spec.ts`：新增用例验证检索结果被正确注入 Prompt、检索失败时生成流程不中断且不报错

**Checkpoint**: User Story 1（MVP）完成，可独立验证——模板审核通过自动建立索引，生成流程注入检索结果且具备降级能力

---

## Phase 4: User Story 2 - 开放题答卷语义主题聚类 (Priority: P2)

**Goal**: 对开放题答卷做语义主题聚类，替代现有关键词共现分组，提升分析可用性

**Independent Test**: 对比"关键词共现分组"与"语义聚类分组"两种结果的人工比对准确性；对样本量不足的题目验证返回 `insufficient_data=True`

> 本阶段不依赖 Phase 2 Foundational（q-server `ai-rag` 模块），仅依赖 Phase 1 的 T001（`scikit-learn` 依赖），可与 Phase 2/3 并行推进。

### Tests for User Story 2 ⚠️

- [x] T023 [P] [US2] 新建 `app/ai-service/tests/test_rag_embedder.py`：覆盖正常 Embedding 调用、Provider 调用失败/超时时的异常捕获与降级返回
- [x] T024 [P] [US2] 新建 `app/ai-service/tests/test_rag_clusterer.py`：覆盖正常聚类输出 `clusters`/`noise_count`、样本量不足时返回 `insufficient_data=True` 且 `clusters=[]`、情感打分失败时降级为 `sentiment_score=0.0`

### Implementation for User Story 2

- [x] T025 [P] [US2] 新建 `app/ai-service/src/rag/embedder.py`：直接调用当前配置的 AI Provider Embedding 接口，对一批开放题答卷原文做**一次性、不持久化**的向量化计算（research.md §1/§2/§10），调用失败时捕获异常并返回可识别的失败标记而非抛出
- [x] T026 [US2] 新建 `app/ai-service/src/rag/clusterer.py`：基于 `scikit-learn` 的 `HDBSCAN` 对 `embedder.py` 产出的向量做聚类，为每个簇生成 `label`/`representative_text`/`sample_count`，并复用现有 LLM 调用能力对代表句做情感打分（`sentiment_score` 范围 `[-1, 1]`）；样本量低于聚类最小可用阈值时返回 `insufficient_data=True`（对应 FR-010）；未归类样本计入 `noise_count`（对应 FR-011）（depends on T025）
- [x] T027 [US2] 在 `app/ai-service/src/tools/analysis_tools.py` 新增 `semantic_cluster_tool`（第 5 个工具），入参 `SemanticClusterInput`（`survey_id`/`question_component_id`），内部通过现有 `SurveyAPIClient` 拉取该题目全部开放题答卷原文，依次调用 `embedder.py`/`clusterer.py`，输出 `SemanticClusterResult`；Embedding 调用失败时按 contracts/ai-service-rag-tools.md 约定返回 `insufficient_data=True` 并记录 warn 级日志，不中断 `AnalysisAgent` 整体流程（对应 FR-020/SC-006）（depends on T025, T026）
- [x] T028 [P] [US2] 扩展 `app/ai-service/tests/test_analysis_tools.py`：新增 `semantic_cluster_tool` 的正常路径、样本不足路径、Embedding 失败降级路径三组用例

**Checkpoint**: User Story 2 完成，可独立验证语义聚类能力，且与 US1/US3 无耦合

---

## Phase 5: User Story 3 - 问卷设计助手知识库可追溯问答 (Priority: P3)

**Goal**: 问卷设计助手基于预先建设的知识库回答问题，并提供可追溯引用来源

**Independent Test**: 预置知识文档后提问，验证回答中出现的引用来源（`citation` 事件）与文档内容对应；对知识库未覆盖的问题验证回答如实说明"未找到相关依据"且不出现引用事件

> ⚠️ 本阶段的 `indexer.service.ts`/`ai-rag.routes.ts` 修改建立在 US1（T015/T016）已创建的文件基础上追加内容，**不可与 US1 并行修改同一文件**，需等 US1 完成后再开始对应任务。

### Tests for User Story 3 ⚠️

- [x] T029 [P] [US3] 扩展 `app/q-server/src/spec/ai/ai-rag/indexer.service.spec.ts`：新增 `indexKnowledgeDocument` 用例（正常切片写入、Embedding 失败降级）与 `deactivateKnowledgeDocument` 用例（正常下线后 `is_active=false`、重复下线同一文档保持幂等、文档不存在时抛出可识别错误）
- [x] T030 [P] [US3] 扩展 `app/q-server/src/spec/ai/ai-rag/ai-rag.routes.spec.ts`：新增 `knowledge/search`/`knowledge/documents`（POST）/`knowledge/documents/:documentId`（DELETE）三端点用例（检索命中/未命中、管理员导入鉴权、参数校验失败、下线成功、重复下线幂等、下线不存在文档返回 404、非管理员访问返回 403）
- [x] T031 [P] [US3] 新建 `app/ai-service/tests/test_rag_client.py`：覆盖 `RagClient.search_knowledge` 正常返回、调用失败/超时时返回空结果并标记降级（不抛异常）
- [x] T032 [P] [US3] 新建 `app/ai-service/tests/test_chat_agent.py`：覆盖 `citation` SSE 事件在命中知识片段时正确发出、未命中/检索失败时跳过 `citation` 事件且回答文本如实说明未找到依据、`citation` 事件出现在 `token` 之后 `done` 之前的顺序约束

### Implementation for User Story 3

- [x] T033 [US3] 在 `app/q-server/src/modules/ai/ai-rag/indexer.service.ts` 追加两个方法（对应 FR-012「新增、更新、删除」维护能力）：`indexKnowledgeDocument(documentId, content)`（按章节/长度对知识文档原文切片写入 `KnowledgeChunk`）与 `deactivateKnowledgeDocument(documentId)`（将 `KnowledgeDocument.is_active` 置为 `false` 软下线，`KnowledgeChunk` 保留但不再参与检索；文档不存在时抛出可被路由层识别为 404 的错误；重复下线同一文档需幂等，不抛异常）；「更新」知识文档内容通过"先调用 `deactivateKnowledgeDocument` 下线旧文档，再调用 `indexKnowledgeDocument` 导入新文档"组合完成，不新增独立的内容级更新方法（依赖 US1 阶段已创建的文件，需在 US1 完成后开始）（depends on T015, T003）
- [x] T034 [US3] 在 `app/q-server/src/modules/ai/ai-rag/ai-rag.routes.ts` 追加三个端点：`POST /knowledge/search`（`authenticateOrInternal`，调用 `retriever.service.hybridSearch(scope="knowledge")`）、`POST /knowledge/documents`（`adminOnly`，调用 `indexer.service.indexKnowledgeDocument`，返回 `documentId`/`chunkCount`）与 `DELETE /knowledge/documents/:documentId`（`adminOnly`，调用 `indexer.service.deactivateKnowledgeDocument`，对应 contracts/q-server-ai-rag.openapi.yaml 的 `/knowledge/documents/{documentId}`，文档不存在返回 404）（依赖 US1 阶段已创建的文件，需在 US1 完成后开始）（depends on T016, T033, T008）
- [x] T035 [P] [US3] 新建 `app/ai-service/src/tools/rag_client.py`：实现 `RagClient.search_knowledge`/`RagClient.search_templates`，复用 `survey_client.py`（`SurveyAPIClient`）的 `httpx` 异步客户端 + `X-Internal-Api-Key` 头鉴权 + 现有超时/重试配置模式；调用失败（超时/5xx/网络错误）时返回空结果列表并标记降级，不向上抛出异常（对应 FR-020）
- [x] T036 [US3] 升级 `app/ai-service/src/agents/chat_agent.py` 为 RAG Agent：回答前调用 `rag_client.search_knowledge` 获取知识库片段并注入 LLM 上下文；在对应内容的 `token` 事件之后、`done` 事件之前发出 `citation` SSE 事件（词表在既有 `status`/`token`/`tool_call`/`tool_result`/`done`/`error` 基础上扩展，非替代）；检索为空或调用失败时跳过 `citation` 事件、回答文本如实说明未找到相关依据，不得编造引用来源（对应 FR-013/FR-014/FR-015/FR-020）（depends on T035）

**Checkpoint**: 三个用户故事全部完成，均可独立验证

---

## Final Phase: Polish & Cross-Cutting Concerns

**Purpose**: 跨故事的收尾事项

- [x] T037 [P] 在 `docs/API接口文档.md` 补齐 ai-rag 模块 6 个端点的文档（请求/响应示例、鉴权方式、BizCode 说明），对齐 contracts/q-server-ai-rag.openapi.yaml（constitution Principle III 要求同 PR 内完成）
- [ ] T038（需人工/真实环境执行，见下方说明）依据 quickstart.md「评测集验证」章节，人工准备至少 20 条覆盖三个场景的查询评测集并计算 Top-5 命中率，确认 ≥ 80%（对应 SC-004）；未达标时按 research.md §4/§5 调整 `alpha` 权重或关键词检索方案
- [ ] T039（需人工/真实环境执行，见下方说明）完整走读 quickstart.md 的三个场景（P1/P2/P3）与「降级验证」章节，确认 Embedding Provider 不可用时 `degraded` 字段正确透出且三大场景均不整体失败（对应 FR-020/SC-006）

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**：无前置依赖，可立即开始
- **Foundational (Phase 2)**：依赖 Setup 完成；**阻塞 US1、US3**，**不阻塞 US2**
- **User Story 1 (Phase 3)**：依赖 Foundational 完成
- **User Story 2 (Phase 4)**：仅依赖 T001，可与 Foundational/US1/US3 并行
- **User Story 3 (Phase 5)**：依赖 Foundational 完成 **且** 依赖 US1 的 T015/T016（`indexer.service.ts`/`ai-rag.routes.ts` 必须先由 US1 创建，US3 在其基础上追加，两者不可并行修改同一文件）
- **Polish (Final Phase)**：依赖所有已实现的用户故事完成

### User Story Dependencies

- **US1（P1）**：无跨故事依赖，Foundational 完成后即可独立推进
- **US2（P2）**：无跨故事依赖，甚至无需等待 Foundational，只依赖 Setup 的 T001
- **US3（P3）**：文件层面依赖 US1 先完成（`indexer.service.ts`/`ai-rag.routes.ts` 追加式修改），业务逻辑上与 US1/US2 相互独立、可分别验证

### Parallel Opportunities

- Setup 阶段 T001/T002 可并行
- Foundational 阶段 T005/T006/T007/T008 可并行（互不修改同一文件）；T011/T012/T013 三个测试任务可并行
- US2（Phase 4）可与 Foundational（Phase 2）、US1（Phase 3）全程并行推进（不同团队成员/不同时间段）
- US1 内 T014（测试）、US2 内 T023/T024（测试）、US3 内 T029/T030/T031/T032（测试）均可先行并行编写
- US3 内 T035（`rag_client.py`）可与 T033/T034（q-server 侧）并行，因为分属不同服务/不同文件

---

## Parallel Example: Foundational Phase

```bash
# Foundational 阶段可并行的独立文件任务：
Task: "在 app/q-server/src/utils/response.ts 新增 ai-rag 模块 BizCode"
Task: "在 app/q-server/src/config/langchain.ts 新增 embedText/embedBatch"
Task: "在 app/q-server/src/modules/user/auth/auth.middleware.ts 新增 authenticateOrInternal"
Task: "新建 app/q-server/src/modules/ai/ai-rag/ai-rag.schemas.ts"
```

## Parallel Example: User Story 2（与其他阶段并行）

```bash
# US2 全程可与 Foundational/US1 并行，团队可另行分配：
Task: "新建 app/ai-service/src/rag/embedder.py"
Task: "新建 app/ai-service/tests/test_rag_embedder.py"
# embedder.py 完成后：
Task: "新建 app/ai-service/src/rag/clusterer.py"
Task: "新建 app/ai-service/tests/test_rag_clusterer.py"
```

---

## Implementation Strategy

### MVP First（User Story 1）

1. 完成 Phase 1: Setup
2. 完成 Phase 2: Foundational（关键路径，阻塞 US1/US3）
3. 完成 Phase 3: User Story 1
4. **停下并验证**：按 quickstart.md 场景 P1 独立验证生成增强效果与降级路径
5. 视情况发布/演示（MVP）

### Incremental Delivery

1. Setup + Foundational 完成 → 基础设施就位
2. 加入 US1 → 独立验证 → 发布/演示（MVP）
3. 加入 US2（可提前或并行完成）→ 独立验证 → 发布/演示
4. 加入 US3（需在 US1 之后）→ 独立验证 → 发布/演示
5. 每个故事均在不破坏已有故事的前提下增量交付价值

### Parallel Team Strategy

多人协作时：

1. 团队共同完成 Setup + Foundational
2. Foundational 完成后：
   - 开发者 A：User Story 1（同时是 US3 的前置阻塞方，需优先完成 T015/T016）
   - 开发者 B：User Story 2（可提前于 Foundational 完成前就开始，仅依赖 T001）
   - 开发者 C：待 US1 的 T015/T016 完成后接手 User Story 3
3. 各故事完成后独立集成验证

---

## Notes

- **[P]** 任务 = 不同文件、无依赖关系
- **[Story]** 标签用于将任务追溯到具体用户故事
- 每个用户故事均应可独立完成与独立验证
- 按 constitution Principle V 要求，含分支逻辑的新增业务代码必须先写测试并确认失败，再实现使其通过
- 建议每完成一个任务或一组逻辑相关任务后提交一次
- 可在任一 Checkpoint 处停下独立验证对应故事
- 避免：模糊任务描述、同文件并行冲突（尤其是 T015/T016 与 T033/T034 之间）、破坏故事独立性的跨故事强耦合
