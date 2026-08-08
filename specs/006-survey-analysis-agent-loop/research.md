# Phase 0 Research: 问卷分析 Agent 自主循环方案设计

**Input**: [plan.md](./plan.md) Technical Context | **Spec**: [spec.md](./spec.md)

> spec.md 的 Assumptions 一节已对绝大多数模糊点给出行业惯例的合理默认值，故本文档不存在 `[NEEDS CLARIFICATION]` 遗留项。以下按 Technical Context 中涉及的技术选型/依赖/集成点逐一记录研究结论，供 Phase 1 设计与后续 `/speckit-tasks` 引用。

## R1：LangChain Function Calling 循环的编排方式

- **Decision**：采用显式 `while step < agent_max_steps` 循环 + `model.bind_tools([...])` + 手动维护 `messages` 列表（`HumanMessage`/`AIMessage`/`ToolMessage`），不引入 LangGraph。
- **Rationale**：LangGraph（`pyproject.toml` 的 `agent` 可选依赖组，`langgraph>=1.2.0`）面向多节点状态图编排，适合更复杂的分支/并行工作流；本方案是单一线性循环（推理→工具→再推理→…→结论），显式 `while` 循环足以表达全部控制流，且更易审阅、调试与单测（不涉及图编译/状态机概念），符合"不引入超出需求的复杂度"原则。若未来需要更复杂的分支决策（如并行工具调用聚合），可再评估升级为 LangGraph。
- **Alternatives considered**：
  - LangGraph `StateGraph`：控制流更规范但引入额外抽象成本，且团队当前循环逻辑简单，收益不明显。
  - LangChain `AgentExecutor`（旧版 Agent 抽象）：已被 LangChain 官方标记为过渡方案，v1.x 推荐直接用 `bind_tools` + 手写循环，避免依赖已弱维护的封装层。

## R2：DeepSeek 的 Function Calling 兼容性

- **Decision**：继续通过 `langchain_openai.ChatOpenAI`（`llm/factory.py` 已实现）接入 DeepSeek，`bind_tools()` 直接调用，无需额外适配层。
- **Rationale**：DeepSeek API 兼容 OpenAI Function Calling 协议（`tools`/`tool_calls` 字段格式一致），`langchain-openai` 的 `ChatOpenAI.bind_tools()` 本身就是按 OpenAI 协议序列化 tool schema，现有 `create_chat_model()` 已通过 `base_url=settings.ai_base_url` 指向 DeepSeek 端点，天然兼容，无需改动 `llm/factory.py`。
- **Alternatives considered**：为 DeepSeek 单独实现 Function Calling 适配层——不必要，因为 DeepSeek 官方文档明确声明其 API 是 OpenAI 兼容的，现状代码结构已验证了这一点（`create_chat_model()` 仅切换 `base_url`/`api_key`）。

## R3：工具调用失败的重试策略

- **Decision**：q-server 内部接口调用失败（网络异常/超时/5xx）时，在 `survey_client.py` 层做**有限次数**（建议 2 次，间隔递增）的自动重试；重试耗尽后仍失败，则将结构化错误 `{error: true, message: "..."}` 作为 `ToolMessage` 内容返回给模型，由模型自主决定下一步（换工具/放弃并说明局限性），不在工具层做"静默吞掉错误"或"无限重试"。
- **Rationale**：直接对应 FR-010（工具失败必须可被模型感知并自主处理）与附录 G Phase 3 中提到的 `tenacity` 重试能力（`todo-list.md` 已规划但未启用）。有限重试可以吸收瞬时网络抖动，避免"一次超时就直接放弃整条分析"，同时不会像无限重试一样拖慢整体响应、消耗 `agent_max_steps` 之外的隐藏时间预算。
- **Alternatives considered**：
  - 完全不重试，失败即报错给模型：实现最简单，但对偶发网络抖动过于敏感，会不必要地增加降级结论的触发概率。
  - 无限重试直到成功：违反 SC-002（60 秒时限）与 FR-004（步数上限的确定性），可能导致请求长时间挂起。

## R4：文本分析规模与性能边界

- **Decision**：`analyze_text_batch` 单次调用的 `texts` 列表在调用方（Agent 编排层）负责做数量上限截断（建议与 `list_survey_responses` 的单次分页 `page_size`≤100 对齐，单次分析全生命周期总拉取量软上限 500 条，见 spec.md 附录 A.4 卡点 6），工具本身不强制截断输入但应在文档中声明"调用方需保证输入规模合理"。
- **Rationale**：jieba 分词 + TF-IDF 关键词提取属于 CPU 密集型本地计算，无网络往返延迟，但文本量线性增长时耗时也线性增长；由 Agent 编排层（而非工具内部）控制输入规模，可以让"是否需要多批次调用工具"这一决策留在模型的自主判断范围内，符合"LLM 自主决定信息是否充足"的核心架构决策，而不是把截断策略硬编码进工具本身。
- **Alternatives considered**：在工具内部强制截断 `texts` 长度——会让模型无法感知"实际只处理了部分数据"，可能导致结论中出现看似基于全量数据、实则基于截断样本的误导性表述，违反 SC-004（数字可追溯）。

## R5：主题归类（topic_grouping）的 MVP 技术选型

- **Decision**：采用"基于共现关键词的轻量聚类"（无 embedding、无网络调用），即：先用 TF-IDF 提取每条文本的关键词集合，再按关键词重合度做简单分组，组标签取该组内权重最高的关键词。
- **Rationale**：spec.md 附录 E 已明确排除 embedding-based 语义聚类（依赖尚未启用的 ChromaDB/RAG 能力），MVP 阶段优先保证"本地计算、无额外网络调用与延迟"，与本方案"避免多余工具调用/延迟"的设计原则一致；关键词共现聚类实现简单、无需训练/模型加载，可快速验证"主题归类"这一能力闸口是否满足 User Story 1 的验收标准。
- **Alternatives considered**：KMeans/HDBSCAN + sentence embedding——效果更好但引入模型加载/向量计算开销与新依赖（ChromaDB），超出当前 MVP 范围，已记录为附录 G Phase 5 的后续增强项。

## R6：q-server 新增接口的实现位置

- **Decision**：新增 `GET /api/admin/surveys/:id` 挂载在**既有** `survey-stats` 模块（`app/q-server/src/modules/survey/survey-stats/`），而非新建模块或改动 `survey-crud` 模块。
- **Rationale**：`survey-stats.routes.ts` 已经是"内部凭证可访问的问卷只读查询"这一职责的现有承载模块（`requireSuperAdminOrInternal` 中间件已在模块级 `addHook` 挂载，`/surveys/:id/stats`、`/surveys/:id/responses` 均遵循相同模式），新增接口只需在 `SurveyStatsService` 补充一个 `getSurveyStructure()` 方法并注册一条路由，无需改动鉴权链路或新建目录，是改动面最小、与既有代码组织方式最一致的选择。
- **Alternatives considered**：
  - 改造 `survey-crud.routes.ts` 的既有 `GET /api/surveys/:id`，放宽其鉴权——会破坏"C 端用户仅能查询自己拥有的问卷"这一既有业务语义（该路由当前按 `userId` 过滤所有权），不可取。
  - 新建独立模块（如 `admin-survey-structure`）——为单个只读接口新建模块目录，违反最小改动原则，且与 `survey-stats` 模块的既有职责边界重叠。

## R7：SSE 事件词表扩展的向后兼容性

- **Decision**：在现有 `AgentStreamEvent`（`token`/`tool_call`/`tool_result`/`done`/`error`）基础上新增 `status` 事件，`tool_call`/`tool_result` 的 `data` 字段补充具体结构（见 Phase 1 `contracts/sse-events.md`），不修改既有字段命名或语义。
- **Rationale**：q-server `ai-proxy.routes.ts` 对 `/stream` 路径采用逐块字节透传（不解析 SSE 内容），因此任何新增 `event` 名称或 `data` 字段结构对 q-server 侧完全透明，无需改动转发层代码，已在 spec.md 附录 F.2 中确认。Constitution Principle IX 要求的强制词表（`token`/`tool_call`/`done`/`error`）保持不变，`status`/`tool_result` 属于兼容性扩展。
- **Alternatives considered**：复用 `tool_call` 事件本身承载状态提示（不新增 `status` 事件）——会让前端难以区分"阶段性文字提示"与"结构化工具调用参数"，损害前端可读性，故拒绝。

---

**Output**：以上 7 项研究结论均已给出明确 Decision，无遗留 `[NEEDS CLARIFICATION]` 项，可进入 Phase 1 设计。
