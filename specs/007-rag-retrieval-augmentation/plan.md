# Implementation Plan: RAG 检索增强能力

**Branch**: `007-rag-retrieval-augmentation` | **Date**: 2026-08-04 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/007-rag-retrieval-augmentation/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

为问卷系统引入检索增强生成（RAG）能力，覆盖三个场景：① AI 生成问卷时检索历史优质模板作为动态 Few-shot 注入生成过程；② 开放题答卷做语义主题聚类替代现有关键词共现分组；③ 问卷设计助手基于知识库做可追溯问答。

技术路线遵循 constitution Principle I 与 spec 澄清结论（FR-021/FR-022）：**持久化的 Embedding 计算、pgvector 存储与检索全部由 `q-server` 独立完成**（新增 `ai-rag` 模块），对外通过既有 HTTP + `X-Internal-Api-Key` 鉴权模式暴露；`ai-service` 不新增任何数据库直连通道，仅在语义聚类场景（场景 B）内部按次调用 Embedding 模型做临时、不落库的计算，其余两个场景（A、C）均通过调用 q-server 暴露的检索接口获取结果。检索策略采用向量余弦相似度（pgvector）与关键词精确匹配（Postgres `ILIKE`，复用项目现有 `contains` 检索约定）的加权混合检索。

## Technical Context

**Language/Version**: q-server 侧 Node.js ≥22.17 + TypeScript 5.9（`strict: true`）；ai-service 侧 Python ≥3.11

**Primary Dependencies**:

- q-server：Fastify 5、Prisma 7 + `@prisma/adapter-pg`（新增 `Unsupported("vector(N)")` 字段与 pgvector 扩展的原生 SQL 迁移）、Zod v4、`@langchain/openai`/`@langchain/anthropic`（复用 `src/config/langchain.ts` 的 Provider/Key 管理模式扩展 Embedding 调用）
- ai-service：FastAPI ≥0.115、LangChain ≥1.3、`httpx`（复用 `SurveyAPIClient` 的内部调用模式）、新增 `scikit-learn`（内置 `HDBSCAN`，用于场景 B 聚类）与情感打分依赖（复用现有 LLM 调用或 `snownlp`，具体见 research.md）

**Storage**: PostgreSQL（现有实例）+ `pgvector` 扩展（本功能首次引入，需新增迁移启用扩展与 `vector` 类型字段 + IVFFlat 索引）；关键词检索复用现有 Prisma `contains`/`ILIKE` 模式，不引入 `tsvector`/GIN（详见 research.md 的选型理由）

**Testing**: q-server 用 Vitest（`app/q-server/src/spec/**/*.spec.ts`），ai-service 用 pytest（`app/ai-service/tests/test_*.py`），均遵循项目现有 mock 约定（Prisma/Redis mock、`monkeypatch` 降级测试）

**Target Platform**: 现有 Linux 服务器部署（q-server + ai-service 双进程，通过内部 HTTP 契约通信）

**Project Type**: Monorepo Web 应用（本功能只涉及 `app/q-server` 与 `app/ai-service` 两个后端包，不涉及 `app/frontend`/`app/q-editor` 的新增页面，仅新增/复用既有管理后台调用入口）

**Performance Goals**: 依据 SC-005，95% 的检索类请求（相似模板查询、设计助手问答检索环节）P95 响应时间 < 1s；参考文档给出的 pgvector IVFFlat 检索延迟目标 P99 < 100ms 作为内部检索层性能预算的子目标

**Constraints**:

- FR-021/FR-022：持久化 Embedding 的计算/存储/检索不得跨服务拆分，全部归属 q-server；ai-service 不得新增数据库直连通道
- FR-016：向量化数据的检索必须遵循现有数据访问权限与隔离规则，不得跨用户/跨权限边界返回
- FR-017：上线前必须记录向量化存储内容的数据留存周期与 PII 处理方式（对应 constitution Principle IX 的 RAG 数据留存文档要求）
- FR-019：检索请求输入长度与返回数量必须设置合理上限
- FR-020/SC-006：检索或索引环节故障/超时时，三大核心场景必须能降级跳过，不得整体失败

**Scale/Scope**: 覆盖 3 个用户故事（P1 生成增强 / P2 语义聚类 / P3 知识库问答）；SC-004 要求建立至少 20 条查询评测集验证 Top-5 命中率 ≥ 80%

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                                        | 评估                                                                                                                                                                                                                                                                                                                                                            | 结论                                                            |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| I. Monorepo Module Boundary Integrity            | 持久化 RAG 能力（Embedding 计算/pgvector 存储/检索）完整落在 `q-server`（新增 `ai-rag` 模块），`ai-service` 不直连 q-server 的 PostgreSQL；跨服务调用（场景 C）复用既有 `X-Internal-Api-Key` HTTP 客户端模式，无新增耦合方式；场景 B 的 ai-service 内嵌 Embedding 调用直接对接外部 AI Provider（不经 q-server DB），不违反边界。                                | PASS                                                            |
| II. Strict Type Safety & Schema-First Validation | 新增路由入参用 Zod（`ai-rag.schemas.ts`），ai-service 新工具入参用 Pydantic（复用 `analysis_tools.py` 现有写法）。                                                                                                                                                                                                                                              | PASS                                                            |
| III. Unified API Contract & Response Envelope    | 新增 6 个 q-server REST 端点统一走 `{ data, code, msg }` 封装（`reply.sendSuccess`），业务错误码在 `BizCode` 新增独立模块号段；本 PR 内同步更新 `docs/API接口文档.md`（当前该文档未覆盖任何 AI 模块端点，属于既存缺口，本功能新增部分将按 constitution 要求补齐，不视为放大既有缺口）。                                                                         | PASS（需在实现 PR 中落实文档同步）                              |
| IV. Security-by-Default                          | 检索端点鉴权：管理员操作（索引重建/知识库维护）走 `authenticate + requireSuperAdmin`；检索/查询类端点面向登录用户开放，同时需被 ai-service 场景 C 以内部服务身份调用，新增 `authenticateOrInternal` 中间件（复用现有 `requireSuperAdminOrInternal` 的判断模式，去掉管理员强制要求）；限流复用 `@fastify/rate-limit`；用户输入长度上限对应 FR-019。              | PASS                                                            |
| V. Test-First / Test-Adequate Delivery           | 新增 `embedding.service`/`indexer.service`/`retriever.service`（q-server）与 `embedder.py`/`clusterer.py`/`semantic_cluster_tool`（ai-service）均属含分支逻辑的业务代码，须在同 PR 内提供 Vitest/pytest 单测（含降级路径、alpha 权重边界值等）。                                                                                                                | PASS（约束将在 tasks 阶段落实为具体测试任务）                   |
| VI. Observability & Structured Logging           | 复用 Pino/`logging` 结构化日志与 trace/request ID 传播；检索故障降级路径需记录 warn 级日志但不中断主流程。                                                                                                                                                                                                                                                      | PASS                                                            |
| VII. Code Style & Static Analysis Compliance     | 新增代码需通过 ESLint/Prettier/cspell（q-server）与 ruff（ai-service）零警告检查；新术语（如 `pgvector`、`hdbscan`、`ivfflat`）需补充到项目 cspell 自定义词典。                                                                                                                                                                                                 | PASS                                                            |
| IX. AI/LLM Integration Governance                | Embedding Provider 通过环境驱动、复用 `AI_PROVIDER` 抽象扩展（而非硬编码单一供应商）；新增 RAG 能力上线前必须完成 FR-017 要求的数据留存与 PII 处理文档（见 data-model.md「数据留存与 PII」章节）；SSE 场景新增 `citation` 事件类型，属于对既有 `token/tool_call/done/error` 词表的扩展而非替代，与 `AnalysisAgent` 已有的 `status`/`tool_result` 扩展模式一致。 | PASS（gate 条件：FR-017 留存文档必须随 Phase 1 产出物一并交付） |

未触发 Principle VIII（本功能不涉及 `frontend`/`q-editor` 微前端集成）与 Principle X（本功能不涉及 ClickHouse 埋点管道或 admin 分析缓存 TTL），故不适用。

**结论**：无需 Complexity Tracking 中的违规豁免条目；所有 Gate 均可通过，FR-017 的留存文档要求已在 Phase 1 的 `data-model.md` 中一并落实。

### Post-Design Re-check（Phase 1 完成后复核）

Phase 1 产出物（research.md/data-model.md/contracts/quickstart.md）完成后重新复核，未发现新增违规或需要变更设计的问题：

- **Principle III**：`contracts/q-server-ai-rag.openapi.yaml` 已明确 6 个端点全部复用 `ApiResponseEnvelope`（`{data, code, msg}`）并给出新增 BizCode 号段（4005 起，延续现有 AI 模块 4001-4004 号段，不新开独立号段），原表中"需在实现 PR 中落实文档同步"的待办不变（文档同步仍留待实现阶段，设计阶段已明确契约内容）。
- **Principle IV**：`authenticateOrInternal`/`adminOnly` 两种鉴权模式已在 contracts 中逐端点标注，与 research.md §9 的中间件设计一致，无需求变化。
- **Principle IX**：FR-017 的 gate 条件已满足——data-model.md「数据留存与 PII」章节与 research.md §10 已完整记录留存周期与 PII 处理结论；`citation` SSE 事件契约已在 `contracts/ai-service-rag-tools.md` 中明确为词表扩展而非替代。原表中该 Principle 的结论由"gate 条件待满足"确认为"已满足"。
- 其余 Principle（I/II/V/VI/VII）在 Phase 1 设计中均未出现需要调整原判断的新信息，维持 PASS。

**最终结论**：无新增 Complexity Tracking 条目，可进入 `/speckit-tasks` 阶段。

## Project Structure

### Documentation (this feature)

```text
specs/007-rag-retrieval-augmentation/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
│   ├── q-server-ai-rag.openapi.yaml
│   └── ai-service-rag-tools.md
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
app/q-server/
├── prisma/
│   ├── schema.prisma                      # 新增 TemplateEmbedding / KnowledgeChunk 模型
│   └── migrations/
│       └── <timestamp>_add_pgvector_rag/  # 启用 pgvector 扩展 + 建表 + IVFFlat 索引（原生 SQL）
└── src/
    ├── config/
    │   └── langchain.ts                    # 扩展：新增 Embedding 调用能力（复用现有 Key 解密/缓存模式）
    └── modules/
        ├── ai/
        │   ├── ai-rag/                     # 新增模块
        │   │   ├── ai-rag.routes.ts        # 6 个端点：search-templates / search-knowledge /
        │   │   │                           # reindex-template / index-knowledge-document /
        │   │   │                           # delete-template-index / delete-knowledge-document
        │   │   ├── ai-rag.schemas.ts       # Zod 请求/响应 schema
        │   │   ├── embedding.service.ts    # embedText / embedBatch
        │   │   ├── indexer.service.ts      # indexTemplate / deleteTemplateIndex / indexKnowledgeDocument / deactivateKnowledgeDocument
        │   │   └── retriever.service.ts    # vectorSearch / keywordSearch / hybridSearch
        │   └── ai-generate/
        │       └── ai-generate.service.ts  # 修改：生成前调用 retriever.service 注入检索结果
        ├── review/
        │   └── review.service.ts           # 修改：approveReview 审核通过后 fire-and-forget 触发 indexer.service.indexTemplate
        └── user/auth/
            └── auth.middleware.ts          # 新增 authenticateOrInternal（复用 requireSuperAdminOrInternal 模式）
    └── spec/
        └── ai/ai-rag/                      # 新增测试目录，镜像 modules/ai/ai-rag/

app/ai-service/
└── src/
    ├── rag/                                # 填充既有空占位目录（仅限场景 B 的临时计算，不做持久化）
    │   ├── embedder.py                     # 直接调用 AI Provider Embedding 接口，结果不落库
    │   └── clusterer.py                    # HDBSCAN 聚类 + 代表句/情感打分
    ├── tools/
    │   ├── analysis_tools.py               # 新增 semantic_cluster_tool（第 5 个工具）
    │   └── rag_client.py                   # 新增：调用 q-server search-knowledge/search-templates 的
    │                                        # 内部 HTTP 客户端（复用 survey_client.py 的实现模式）
    └── agents/
        └── chat_agent.py                   # 升级为可调用 q-server search-knowledge 的 RAG Agent，
                                             # 新增 citation SSE 事件
└── tests/
    ├── test_rag_embedder.py
    ├── test_rag_clusterer.py
    └── test_analysis_tools.py              # 扩展：新增 semantic_cluster_tool 的用例

docs/
└── API接口文档.md                          # 修改：补齐 ai-rag 6 个端点的文档（同 PR 内完成）
```

**Structure Decision**: 沿用现有 monorepo 分层——q-server 内以「模块（`modules/ai/ai-rag`）三件套（routes/schemas/service）」的既有约定新增 RAG 能力，作为唯一的持久化 Embedding/检索实现；ai-service 侧仅在 `rag/`（原空占位目录）内新增无状态、不持久化的 Embedding+聚类工具，并新增一个内部 HTTP 客户端（`rag_client.py`）供 `chat_agent.py` 调用 q-server 的检索端点。不采用参考文档 4.2 节提出的「ai-service 直连 Postgres」双路径检索方案（该方案违反 constitution Principle I，已在 clarify 阶段通过 FR-021/FR-022 否决）。

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

无违规条目需要豁免。唯一值得记录的架构取舍——ai-service 与 q-server 各自维护一份独立的 Embedding 调用实现（而非共享一份代码）——不构成 constitution 违规，因为两者服务的目的完全不同（q-server 侧用于持久化索引/检索；ai-service 侧仅用于场景 B 的一次性、不落库计算），且两者均未跨越 Principle I 划定的服务边界，故不计入本表。
