# FastAPI AI 服务 — 简洁 TODO 清单

> 对应详细文档：[architecture.md](./architecture.md)（当前实现的架构与协议说明）
> 标记：`[ ]` 待执行 / `[✓]` 已完成 / `[-]` 跳过

---

## P0 — 环境与 LLM 基础

- [✓] 确认 Python ≥ 3.13，创建 Conda 环境 `form-agent`（`conda create -n form-agent python=3.13 -y`）
- [✓] 安装核心依赖：`pip install -e .`
- [✓] 复制 `.env.example` → `.env`，填入 `AI_API_KEY`、`Q_SERVER_BASE_URL` 等实际值
- [✓] 启动服务验证：`uvicorn src.main:app --port 8090 --reload`，访问 `/health` 返回 200
- [✓] 升级 LangChain 到 v1 最新稳定版（`langchain>=1.3.0`, `langchain-openai>=1.4.0`），并锁定版本
- [✓] 运行 `pip check` 确认无依赖冲突

## P0 — 目录与模块骨架

- [✓] 创建所有新增目录（`src/llm/`, `src/analysis/`, `src/utils/`, `tests/fixtures/`）
- [✓] 创建所有空 `__init__.py` 使目录成为 Python 包

## P0 — LLM 层

- [✓] 实现 `src/llm/factory.py`：根据 `AI_PROVIDER` 配置创建 ChatModel（deepseek/openai/anthropic）
- [✓] 实现 `src/llm/prompts/analysis.py`：面向自主循环的问卷分析 System Prompt（角色定位、4 个工具的用途与调用时机、循环终止条件、"禁止编造未经工具验证的数据"约束、抽样不足时的补充查询启发式规则、500 条拉取量软上限）
- [✓] 在 lifespan 启动时验证 LLM 连通性（发送 ping 并检查响应）

## P0 — Agent 注册表与路由解耦

- [✓] 实现 `src/agents/registry.py`（Agent 类型注册 + 延迟实例化）
- [✓] 重构 `src/api/routes/agent.py`：用注册表替换硬编码的 PlaceholderAgent
- [✓] 实现 `src/agents/chat_agent.py`：接入真实 LLM，替代 PlaceholderAgent
- [✓] 在 `src/agents/__init__.py` 中注册所有 Agent 类型

## P0 — SurveyAPIClient 扩展

- [✓] 在 `src/tools/survey_client.py` 中添加 `get_survey_stats()`、`get_platform_overview()`、`get_survey_structure()`、`list_survey_responses()` 方法（已删除失效的 `get_survey_responses()` 死代码）
- [✓] 内部 HTTP 请求方法新增有限次数重试（2 次，间隔递增）吸收瞬时网络抖动，重试耗尽后返回结构化错误
- [-] 确认 q-server 端 `X-Internal-Api-Key` 校验中间件已实现（跳过：代理模式下 q-server 统一鉴权，见 `requireSuperAdminOrInternal`）

## P0 — LangChain Tool 定义

- [✓] 采用 `model.bind_tools()` 自主循环模式（非 LangGraph/AgentExecutor/create_agent），声明 4 个 Function Calling 工具（`get_survey_structure`/`get_survey_stats`/`list_survey_responses`/`analyze_text_batch`），详见 [architecture.md](./architecture.md) 与 `specs/006-survey-analysis-agent-loop/`

## P0 — 问卷分析 Agent

- [✓] 实现 `src/agents/analysis_agent.py`：`model.bind_tools()` 自主 Function Calling 循环 + 双重终止条件（步数上限 + 总耗时兜底）+ 降级结论生成 + SSE 流式
- [✓] 创建 `src/api/routes/analysis.py`：`POST /api/v1/agent/analysis` + `/stream`
- [✓] 实现文本预处理与主题聚类：`src/analysis/text_processor.py`（jieba 分词 + TF-IDF 关键词 + 词频统计）、`src/analysis/topic_grouping.py`（关键词共现聚类）
- [-] 实现会话存储（跳过：当前阶段无需 Redis 缓存，会话上下文仅存活于单次请求内）

## P0 — 测试基础

- [✓] 创建 `tests/conftest.py`
- [✓] 安装测试依赖：`pytest`, `pytest-asyncio`, `pytest-httpx`, `respx`
- [✓] 创建 `tests/fixtures/survey_sample.json` 和 `stats_sample.json`
- [✓] 为 `text_processor.py`、`analysis_tools.py` 补充 pytest 单元测试（关键词提取/词频统计核心路径、4 个工具入参 Schema 校验与异常返回结构）
- [✓] 执行 quickstart.md 全部验证场景（自主分析闭环、抽样不足补充查询、步数/超时降级、工具调用失败重试）

## P0 — 环境变量

- [✓] 更新 `.env.example` 覆盖全部配置项（`agent_max_steps`、`agent_timeout_seconds` 等）

## P0 — q-server 协作接口

- [✓] `survey-stats.service.ts` 新增 `getSurveyStructure(surveyId)`（不做 `userId` 所有权过滤）
- [✓] `survey-stats.routes.ts` 新增 `GET /api/admin/surveys/:id`（复用 `requireSuperAdminOrInternal` 钩子）
- [✓] `packages/common/src/survey/survey-stats.interface.ts` 新增 `SurveyStructureResponse`/`QuestionStructureItem` 共享类型
- [✓] q-server 新增 `ai-proxy` 模块：`/api/ai/agent/analysis[/stream]` 代理转发至 ai-service，分析类接口要求 `requireSuperAdmin`

---

## P1 — 安全与鉴权

- [ ] 实现 `src/utils/security.py`：JWT Token 校验（当前分析接口鉴权完全依赖 q-server 代理层的 `requireSuperAdmin`，ai-service 自身对外不暴露、无需独立鉴权；仅在 ai-service 计划直接对外暴露时才需要）
- [ ] 添加审计日志：每次 Agent 调用写入 q-server 的 `audit_logs`
- [ ] 实现 `src/api/deps.py`：FastAPI 依赖注入（get_current_user, get_agent 等）

## P1 — Redis 缓存

- [ ] 安装 `redis[hiredis]` 依赖
- [ ] 在 `src/config.py` 添加 Redis 配置项
- [ ] 实现 `src/storage/redis.py`（连接池 + get_cache/set_cache + 健康检查）
- [ ] 会话历史压缩（超 N 轮时 LLM 自动摘要）——当前无跨请求会话持久化，暂无此需求

## P1 — 统计缓存

- [ ] 对 `get_survey_stats` 添加响应缓存装饰器（TTL=300s），降低 Agent 高频调用对 q-server 的压力

## P1 — 单元测试补充

- [ ] Pydantic Schema 序列化测试（`AnalysisRequest`/`AgentStreamEvent`/`AnalysisConclusion` 等）
- [ ] `SurveyAPIClient` 单元测试（mock HTTP，覆盖重试与结构化错误路径）
- [ ] LLM 工厂 / Prompt 模板单元测试（mock LLM）
- [ ] 配置 pytest-cov，核心模块覆盖率 ≥ 80%

## P1 — 部署基础

- [ ] 创建 PM2 配置文件 `ecosystem.config.cjs`（进程名 `form-agent`）
- [ ] 创建启动脚本 `scripts/start.sh` 和 `scripts/start.cmd`
- [ ] 实现 `src/utils/logger.py`（JSON 格式结构化日志）

## P1 — 分析结果持久化

- [ ] 创建 `GET /api/v1/analysis/reports`（历史分析结论列表）
- [ ] 创建 `GET /api/v1/analysis/reports/:id`（分析结论详情）
- [ ] 需先确定持久化方案（数据库表 or q-server 侧存储），当前分析结论仅通过 SSE 一次性返回，不落库

---

## P2 — 情感分析

- [ ] 实现 `src/analysis/sentiment.py`（优先情感词典方案，复杂文本降级 LLM），作为 `analyze_text_batch` 工具的能力扩展

## P2 — 多题聚合分析

- [ ] 实现跨题相关性分析、用户分群、异常检测，作为新增 Function Calling 工具接入自主循环

## P2 — PDF 报告

- [ ] 实现 `src/report/pdf_generator.py`（WeasyPrint + HTML 模板）
- [ ] 创建 `GET /api/v1/analysis/reports/:id/pdf`（依赖 P1 分析结果持久化先落地）

## P2 — Docker

- [ ] 创建 `Dockerfile`
- [ ] 添加到 `deploy/docker-compose.yml` 的 ai-service 定义（可选扩展）

## P2 — 审核 / 设计辅助 Agent

- [ ] 实现 `src/agents/review_agent.py`：问卷质量审核（completeness/bias/logic/wording 四个维度）
- [ ] 实现 `src/agents/design_agent.py`：问卷设计辅助

---

## P3 — 锦上添花

- [ ] 配置 pre-commit hook
- [ ] 添加 Prometheus 指标端点 `GET /metrics`
- [ ] Ruff 代码检查集成到 CI

---

## 验收速查

- [✓] LLM 工厂多 Provider 切换正常
- [✓] Agent 对话返回真实 LLM 内容（非 Placeholder）
- [✓] SSE 流式正常推送 `status`/`tool_call`/`tool_result`/`token`/`done` 事件
- [✓] 分析结论引用具体统计数据，不做无数据推断（Prompt 层显式约束）
- [✓] 无效 survey_id → `error` 事件 / 404，q-server 不可达 → 503（`AppError`）
- [✓] 步数/超时达到上限 → `degraded: true`，`reply` 含局限性说明
- [✓] 工具调用失败 → 有限重试后返回结构化错误，Agent 可感知并自主决策
- [ ] JWT 无效 → 401，限流生效（ai-service 自身暂无独立鉴权，见 P1）
- [ ] 单元+集成测试全通过，核心覆盖率 ≥ 80%（当前已有核心路径测试，覆盖率尚未统计）
- [✓] `.env.example` 与代码中配置项完全一致

---

## 前端实现需求（待自行对接）

> 当前 Agent **完全没有可视化界面**。以下是前端对接分析 Agent 时需要实现的需求规格，仅作为需求文档，不包含实现代码。

### 1. 请求入口

统一通过 q-server 代理调用，**不要**直连 ai-service：

- 同步：`POST /api/ai/agent/analysis`
- 流式（推荐）：`POST /api/ai/agent/analysis/stream`

请求体：

```json
{
  "survey_id": "字符串，必填，问卷 ID",
  "focus": "字符串，可选，分析侧重点，留空表示全面分析",
  "session_id": "字符串，可选，延续已有会话时传入，新会话留空"
}
```

**鉴权前提**：该接口要求登录且具备超级管理员权限（`requireSuperAdmin`），前端入口应仅对超级管理员角色可见/可点击，非超管账号调用会被 q-server 拒绝（401/403）。

### 2. SSE 流式消费

`POST /api/ai/agent/analysis/stream` 响应为 `text/event-stream`，需要用支持读取流式响应体的方式发起请求（浏览器原生 `EventSource` 不支持自定义请求方法与请求体，需用 `fetch` + `ReadableStream` 手动按 `event:`/`data:` 分帧解析，或使用现成的 SSE 解析库）。

事件按 `event: {name}\ndata: {json}\n\n` 格式逐条到达，需要处理以下 6 种事件（详见 [architecture.md](./architecture.md) 第 5 节）：

| 事件          | 数据结构                                             | 前端展示建议                                                                                                                                                                        |
| ------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `status`      | `{ text }`                                           | 顶部/侧边的阶段性提示条（如"正在理解问卷结构..."），可用 loading 态展示                                                                                                             |
| `tool_call`   | `{ name, args, step }`                               | 展示"工具调用轨迹"（如时间线/步骤列表），显示第几步调用了哪个工具、传了什么参数，帮助用户理解 Agent 的分析过程、建立信任                                                            |
| `tool_result` | `{ name, step, summary }`                            | 与对应 `tool_call` 关联展示，显示该次调用拿到的结果摘要                                                                                                                             |
| `token`       | `{ text }`                                           | 逐字/逐词追加到结论文本区域，实现打字机流式渲染效果                                                                                                                                 |
| `done`        | `{ session_id, reply, tool_calls, steps, degraded }` | 流结束标志：展示完整 `reply`（应已通过 token 事件逐步渲染完成，`done.reply` 可用于兜底校验/复制/导出）；`tool_calls`/`steps` 可用于生成"共执行 N 步分析、调用了 M 次工具"的摘要信息 |
| `error`       | `{ message }`                                        | 请求级错误（如 survey_id 无效），应终止流式渲染并展示错误提示，而非继续等待                                                                                                         |

### 3. 降级状态展示

当 `done.data.degraded === true` 时，说明分析在达到步数上限或超时后被强制收尾，`reply` 正文已包含"可能不完整"的局限性说明文字。前端**必须**额外用视觉手段强调这一状态（如警示色标签"分析未完全展开，结论可能不完整"），不能让用户误以为这是一次完整、可靠的分析。

### 4. 工具调用轨迹的呈现粒度

`tool_call.args` 与 `tool_result.summary` 是面向调试/透明度的辅助信息，不是分析结论本身。建议默认收起（如"查看分析过程"折叠面板），避免喧宾夺主；核心内容始终是 `token` 流式渲染出的结论文本。

### 5. 会话延续（可选能力）

`session_id` 字段支持在同一会话内追问（例如"刚才的分析里，第3题的具体分布是什么？"），但**当前后端未实现跨请求的会话状态持久化**——每次请求都是独立的一次完整自主循环，`session_id` 目前仅用于日志关联，不会自动带入上一轮的对话历史。若要支持"追问"体验，需要后端先实现会话存储（见本文档 P1 backlog 的 Redis 缓存章节），前端不应假设传入 `session_id` 就能获得上下文记忆效果。

### 6. 错误与网络中断处理

- 长时间无任何事件到达（网络问题或服务假死）时，前端应有超时兜底提示（后端 `agent_timeout_seconds` 默认 60 秒，前端超时阈值建议略大于该值，例如 75-90 秒）
- 用户主动关闭页面/取消分析时，应中止 `fetch` 请求（`AbortController`），避免资源泄漏；q-server 代理层已支持客户端断开时中止上游请求
- 429（限流，10 次/分钟）与 503（ai-service 不可达）需要有区别于普通业务错误的提示文案
