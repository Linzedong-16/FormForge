# Phase 0 Research: RAG 检索增强能力

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

本文档记录 Technical Context 中涉及的技术选型决策，并明确标注所有与参考文档 `docs/AI增强方案-01-RAG与向量数据库集成.md`（下称"参考文档"）不一致的地方及其理由。

## 1. 服务边界：ai-service 是否直连 Postgres

**Decision**: 否决参考文档 4.2 节"ai-service 侧直连 Postgres 做检索，避免 HTTP 跳数"的提案。q-server 是持久化 RAG 数据（`TemplateEmbedding`/`KnowledgeChunk`）的唯一权属方，独占 Embedding 计算、pgvector 存储与检索三个环节；ai-service 不新增任何数据库连接串或 ORM 依赖，跨服务访问统一走既有 `X-Internal-Api-Key` HTTP 客户端模式。

**Rationale**: constitution Principle I 明确规定 ai-service 禁止直连 q-server 的 PostgreSQL/Redis/MongoDB/ClickHouse/MinIO，且 spec.md 的 FR-021/FR-022 已在 clarify 阶段将此争议正式裁定为架构约束。直连会造成两个服务共享数据库 schema 演进权，属于典型的分布式单体反模式，一旦 q-server 侧调整表结构会直接破坏 ai-service，且绕开了 q-server 现有的权限隔离与审计层。

**Alternatives considered**:

- ai-service 用独立 `pg` 连接池直连同一 PostgreSQL 实例（参考文档原方案）——拒绝：违反 Principle I，且 FR-016 的权限隔离逻辑（谁能看哪些模板/答卷）已经在 q-server 的业务层实现，直连会绕开这层校验。
- ai-service 用只读副本直连——拒绝：仍然是跨服务数据库耦合，只是换了个实例，未解决架构边界问题。

## 2. 持久化 Embedding 的计算/存储/检索权责划分

**Decision**: 三个环节全部在 q-server 内以 `ai-rag` 模块串行完成：写入模板/知识文档时同步调用 Embedding 计算并写入 pgvector 列；检索时在同一进程内做混合检索。ai-service 不为任何持久化数据发起 Embedding 计算。

**Rationale**: FR-022 明确要求计算与存储/检索不可跨服务拆分——如果 ai-service 计算 Embedding 后再通过 HTTP 把浮点数组回传给 q-server 落库，会引入不必要的网络传输量（1024 维 float 数组）与两次序列化开销，且一旦两侧模型版本/维度不一致会产生静默数据损坏风险。单一服务内完成全流程，事务边界更清晰。

**Alternatives considered**: ai-service 计算完 Embedding 后调用 q-server 的"写入原始向量"接口——拒绝：拆分计算与存储会造成两个服务对"Embedding 版本"隐性耦合（模型换了但另一侧不知道），且违反 FR-022 的字面要求。

## 3. Embedding Provider 选型

**Decision**: 复用 q-server 现有 `AI_PROVIDER` 环境驱动抽象（`src/config/langchain.ts`），新增 `embedText`/`embedBatch` 能力；优先尝试 DeepSeek 的 Embedding 接口，若探测到该 Provider 不支持 embeddings（DeepSeek 官方 API 截至目前主要提供 Chat Completion，未确认公开 Embedding 端点），自动降级为 OpenAI `text-embedding-3-small`（1536 维）。向量列维度按实际选定模型的输出维度配置，不在 schema 中硬编码参考文档给出的 1024 维。

**Rationale**: constitution Principle IX 要求所有 LLM Provider 配置必须走环境驱动抽象、禁止硬编码 provider 专属代码路径；项目现状（全代码库无任何 embedding 调用先例）意味着这是全新能力，必须一开始就纳入现有抽象而不是另起一套 Provider 管理逻辑。参考文档主张的"DeepSeek Embedding 1024 维"在当前 DeepSeek 官方 API 文档中未见对应的 embeddings 端点，属于方案文档编写时的假设，需要在实现阶段先做可用性探测，因此 Technical Context 与 data-model 均采用"维度可配置"而非硬编码。

**Alternatives considered**:

- 直接采用参考文档给出的 BGE-M3 本地部署——拒绝：需要额外的模型服务与 GPU/CPU 资源部署，超出当前 Technology Stack Constraints 允许的依赖范围，且增加运维复杂度，MVP 阶段不引入。
- 智谱 GLM Embedding——拒绝：当前 `AI_PROVIDER` 抽象未覆盖智谱适配器，引入会违反 Principle IX 的"不得硬编码 provider 专属代码路径"，需要先做适配器扩展，超出本功能范围。

## 4. 关键词检索方案

**Decision**: 采用 PostgreSQL `ILIKE`/`contains` 子串匹配作为关键词检索的 MVP 实现，复用项目现有 `template.service.ts` 等模块已经在用的 Prisma `contains` 检索模式，不引入 `tsvector` + GIN 全文索引方案。

**Rationale**: 全代码库检索确认项目当前无任何 `tsvector`/`to_tsvector`/中文分词中间件（如 `pg_jieba`/`zhparser`）先例；引入全文检索需要额外的 Postgres 扩展与分词配置，属于新增技术栈决策，超出本次 RAG 功能的核心范围。`ILIKE` 对 FR-003 场景 3 所举例的"NPS"、"eNPS"等专有名词精确命中需求已经足够，且与现有代码风格一致，符合 constitution "合理使用现有中间件和工具"的要求（CLAUDE.md 后端规范）。

**Alternatives considered**: 引入 `tsvector` + GIN 索引 + 中文分词扩展——拒绝：新增基础设施依赖且需要额外的分词效果验证，评估后收益（相对于 `ILIKE`）在 MVP 阶段不足以证明额外复杂度；可在后续迭代根据 SC-004 评测集的实际命中率数据决定是否升级。

## 5. 混合检索权重与降级策略

**Decision**: 混合检索得分 = α × 向量余弦相似度 + (1-α) × 关键词匹配得分（命中记 1，未命中记 0，按此简化避免引入 BM25 计算库），α 默认 0.7，通过配置项可调（对应 FR-005）。当向量检索或关键词检索任一环节报错/超时（复用现有超时预算模式），直接降级为仅使用另一环节的结果；若两者都失败，返回空结果并让上层调用方（生成/分析/问答流程）走无检索的原有降级路径（对应 FR-006/FR-020/SC-006）。

**Rationale**: 参考文档给出的 BM25 权重方案需要额外的 BM25 计算库或 Postgres 扩展（如 `pg_search`），当前项目无此依赖，若引入超出 Primary Dependencies 的最小变更范围；简化为二值关键词得分可以先满足 FR-004 的"结合语义与关键词"要求，后续可按 SC-004 评测结果决定是否升级为真正的 BM25。

**Alternatives considered**: 完整实现 BM25——拒绝，暂不引入新依赖；固定权重不可调——拒绝，直接违反 FR-005 的显式要求。

## 6. ai-service 侧 chromadb/rag 依赖组处理

**Decision**: `app/ai-service/pyproject.toml` 中已预留的 `rag` optional-dependencies 分组（`chromadb`、`tiktoken`）在本功能中**不启用 chromadb**。场景 B 的语义聚类只需要临时的 Embedding 向量数组（Python list/`numpy` array）用于 HDBSCAN 输入，不需要任何向量数据库；`tiktoken` 若后续需要做 token 计数预算控制可保留使用，但非本功能强制依赖。

**Rationale**: 启用 chromadb 意味着在 ai-service 内引入一个持久化向量存储，这与 FR-021/FR-022 确立的"ai-service 不持久化 Embedding"架构决策直接冲突。保留该依赖组定义但不激活，避免未来有人误以为该 extra 是"已启用并在用"的持久化方案。

**Alternatives considered**: 用 chromadb 做进程内临时缓存（不落盘）——拒绝：HDBSCAN 直接消费内存中的向量数组即可，引入 chromadb 只是增加依赖面，没有实际收益。

## 7. 语义聚类算法与情感打分

**Decision**: 聚类算法采用 `scikit-learn` 自带的 `HDBSCAN`（scikit-learn ≥1.3 已内置该实现，无需额外依赖包），避免额外引入独立的 `hdbscan` PyPI 包及其编译依赖。情感倾向评分复用现有 LLM 调用能力（通过一次批量 prompt 让模型对簇内代表句打情感分），不引入额外的情感分析模型依赖（如 `snownlp`），以减少新增依赖面并保持与 Principle IX"通过统一 Provider 抽象调用 LLM"的一致性。

**Rationale**: 参考文档 3.4 节已确定 HDBSCAN 优于 K-Means（无需预设簇数，能识别噪声点，天然满足 FR-011 的"噪声标记"要求）；选择 scikit-learn 内置实现而非独立 `hdbscan` 包是为了避免引入需要 C 扩展编译的额外依赖，降低部署风险。

**Alternatives considered**: 独立 `hdbscan` PyPI 包——拒绝，scikit-learn 内置版本功能等价且已在 Python 生态广泛验证，减少一个第三方依赖；专用情感分析模型——拒绝，复用 LLM 调用可复用现有超时/降级/Provider 切换基础设施。

## 8. `TemplateEmbedding` 命名与外键纠正

**Decision**: 参考文档 5.1 节提议的 `SurveyEmbedding`（外键 `survey_id → Survey`）在本功能中更名为 **`TemplateEmbedding`**，外键改为 `template_id → Template.id`。

**Rationale**: 核对 `app/q-server/prisma/schema.prisma` 第 128-155 行可知，项目中 `Template` 模型明确注释为"方案B：完全解耦，独立于 Survey 表"，拥有独立的 `review_status`（默认 `approved`）与可选的 `source_survey_id` 追溯字段。spec.md FR-001 描述的"已发布的问卷模板"在真实数据模型中对应的正是 `Template`，而非用户填写问卷所用的 `Survey` 表。沿用参考文档字面的 `SurveyEmbedding`/`survey_id` 命名会与真实业务概念错位，故在 data-model.md 中采用纠正后的命名。

**Alternatives considered**: 保留 `SurveyEmbedding` 命名但实际引用 `Template.id`——拒绝，命名与外键语义不一致会造成后续维护者误解，直接采用准确命名成本更低。

## 9. `authenticateOrInternal` 中间件新增

**Decision**: 新增 `authenticateOrInternal` 中间件（位于 `app/q-server/src/modules/user/auth/auth.middleware.ts`），逻辑上是现有 `requireSuperAdminOrInternal`（第 178 行）的姊妹函数：优先检查 `X-Internal-Api-Key` 头是否等于 `AI_SERVICE_INTERNAL_KEY`，命中则跳过用户鉴权放行；未命中则回退到普通 `authenticate`（不强制 `requireSuperAdmin`）。用于 `search-templates`/`search-knowledge` 这类"登录用户与内部服务均可访问"的只读检索端点。

**Rationale**: CLAUDE.md 明确要求"所有后端代码都必须合理使用目前项目已有的中间件和工具"；现有 `requireSuperAdminOrInternal` 的判断结构已验证可行，但其面向的是管理员操作场景，直接复用会对普通登录用户的检索请求错误地要求管理员权限。新增一个只替换"回退鉴权级别"的姊妹函数是对既有模式的最小化扩展，而非引入新的鉴权范式。

**Alternatives considered**: 让 ai-service 场景 C 的调用方一律以"内部服务身份"访问、检索端点只做 `X-Internal-Api-Key` 单一鉴权，登录用户走另一套端点——拒绝，会导致同一检索能力维护两份路由/schema，增加不必要的重复代码。

## 10. FR-017 数据留存与 PII 处理方式（Principle IX 强制记录项）

**Decision**:

- **留存内容**：`TemplateEmbedding` 存储问卷模板的标题/描述/题目文本及其向量，`KnowledgeChunk` 存储管理员上传的知识文档切片文本及向量；两者均为管理员/系统维护的结构化内容，不涉及个人身份信息。
- **答卷文本的处理**：场景 B（语义聚类）读取答卷开放题原文用于**一次性、不持久化**的 Embedding 计算，计算完成后向量数组随请求生命周期结束即释放，不写入任何数据库或缓存；聚类结果中的"代表原文"字段直接引用现有 `Response`/`Answer` 表已存储的答卷文本（该文本的留存策略与访问权限沿用现有答卷数据规则，不因本功能新增额外留存）。
- **留存周期**：`TemplateEmbedding`/`KnowledgeChunk` 与其对应的 `Template`/知识文档记录同生命周期——源记录被删除或下线索引时，通过 FR-002 提供的删除接口同步清理向量记录，不做超期自动过期（因为模板/知识库属于长期可复用资产）。
- **PII 判断结论**：问卷模板与知识文档内容默认不含填写人身份信息；若模板标题/描述中意外包含個人信息（如管理员误将联系方式写入模板描述），遵循现有内容审核流程（`review_status`/`Review` 模型）人工把关，不在本功能内新增自动化 PII 检测（超出当前 spec 范围）。

**Rationale**: constitution Principle IX 要求"任何在 ai-service 中新增的 RAG/向量存储或 agentic 能力，合并前必须记录数据留存与 PII 处理方式"；FR-017 提出同等要求。由于本功能的持久化存储完全落在 q-server（而非 ai-service），此记录同样适用并作为 gate 条件在 Constitution Check 中标注。

**Alternatives considered**: 对答卷文本做匿名化脱敏后再计算 Embedding——评估后认为不必要，因为该计算不持久化、且已限定在现有答卷访问权限范围内（FR-016），额外脱敏会增加复杂度而不显著降低风险；保留作为后续若答卷文本需要持久化索引时的强制要求。
