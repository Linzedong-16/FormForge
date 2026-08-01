# FastAPI AI 服务 — 简洁 TODO 清单

> 对应详细文档：[implementation-checklist.md](./implementation-checklist.md)
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

- [✓] 创建所有新增目录（`src/llm/`, `src/analysis/`, `src/rag/`, `src/report/`, `src/storage/`, `src/utils/`, `tests/fixtures/`, `scripts/`）
- [✓] 创建所有空 `__init__.py` 使目录成为 Python 包

## P0 — LLM 层

- [✓] 实现 `src/llm/factory.py`：根据 `AI_PROVIDER` 配置创建 ChatModel（deepseek/openai/anthropic）
- [✓] 实现 `src/llm/prompts/analysis.py`：问卷分析 System Prompt 模板
- [✓] 在 lifespan 启动时验证 LLM 连通性（发送 ping 并检查响应）

## P0 — Agent 注册表与路由解耦

- [✓] 实现 `src/agents/registry.py`（Agent 类型注册 + 延迟实例化）
- [✓] 重构 `src/api/routes/agent.py`：用注册表替换硬编码的 PlaceholderAgent
- [✓] 实现 `src/agents/chat_agent.py`：接入真实 LLM，替代 PlaceholderAgent
- [✓] 在 `src/agents/__init__.py` 中注册所有 Agent 类型

## P0 — SurveyAPIClient 扩展

- [ ] 在 `src/tools/survey_client.py` 中添加 `get_survey_stats()`、`get_platform_overview()`、`export_responses_csv()` 方法
- [ ] 确认 q-server 端 `X-Internal-Api-Key` 校验中间件已实现

## P0 — LangChain Tool 定义

- [ ] 实现 `src/tools/stats_tools.py`：注册 `get_survey_statistics` Tool（调用统计 API 并返回 JSON）
- [ ] 实现 `src/tools/text_tools.py`：注册 `extract_text_keywords` 和 `analyze_sentiment` Tool

## P0 — 问卷分析 Agent

- [ ] 实现 `src/agents/analysis_agent.py`：使用 `create_agent`（LangChain v1 API）构建分析 Agent
- [ ] 创建 `src/api/routes/analysis.py`：`POST /api/v1/agent/analysis` 路由
- [ ] 实现会话存储（Redis，TTL=3600s）

## P0 — 测试基础

- [ ] 创建 `tests/conftest.py`（async_client + mock_q_server + mock_llm fixtures）
- [ ] 安装测试依赖：`pytest`, `pytest-asyncio`, `pytest-httpx`, `respx`
- [ ] 创建 `tests/fixtures/survey_sample.json` 和 `stats_sample.json`
- [ ] 编写 Agent 接口集成测试 + 分析全流程集成测试

## P0 — 环境变量

- [✓] 更新 `.env.example` 覆盖全部配置项（JWT_SECRET、REDIS_URL 等）

---

## P1 — 安全与鉴权

- [ ] 实现 `src/utils/security.py`：JWT Token 校验（与 q-server 共享密钥）
- [ ] 添加请求限流（`slowapi` 或 Redis 计数器，10次/分钟/用户）
- [ ] 添加审计日志：每次 Agent 调用写入 q-server 的 `audit_logs`
- [ ] 实现 `src/api/deps.py`：FastAPI 依赖注入（get_current_user, get_agent 等）

## P1 — 文本预处理

- [ ] 实现 `src/analysis/text_processor.py`：jieba 分词 + 去停用词 + 高频词提取
- [ ] 编写文本预处理单元测试（标准中文样本验证）

## P1 — 审核 Agent

- [ ] 实现 `src/agents/review_agent.py`：问卷质量审核（completeness/bias/logic/wording 四个维度）
- [ ] 实现 `src/llm/prompts/review.py`：审核 System Prompt

## P1 — 分析子类型

- [ ] 实现分析 Agent 子类型路由（basic/insight/report/compare）
- [ ] 创建 `GET /api/v1/agent/types` 接口

## P1 — Redis 缓存

- [ ] 安装 `redis[hiredis]` 依赖
- [ ] 在 `src/config.py` 添加 Redis 配置项
- [ ] 实现 `src/storage/redis.py`（连接池 + get_cache/set_cache + 健康检查）

## P1 — 统计缓存与重试

- [ ] 在 SurveyAPIClient 中添加请求重试（tenacity，3次+指数退避）
- [ ] 对 `get_survey_stats` 添加响应缓存装饰器（TTL=300s）

## P1 — 单元测试

- [ ] Pydantic Schema 序列化测试
- [ ] SurveyAPIClient / stats_tools / text_tools 单元测试（mock HTTP）
- [ ] LLM 工厂 / Prompt 模板单元测试（mock LLM）
- [ ] 配置 pytest-cov，核心模块覆盖率 ≥ 80%

## P1 — 部署基础

- [ ] 创建 PM2 配置文件 `ecosystem.config.cjs`（进程名 `form-agent`）
- [ ] 创建启动脚本 `scripts/start.sh` 和 `scripts/start.cmd`
- [ ] 实现 `src/utils/logger.py`（JSON 格式结构化日志）

## P1 — 前端对接

- [ ] 创建 `GET /api/v1/analysis/reports`（历史报告列表）
- [ ] 创建 `GET /api/v1/analysis/reports/:id`（报告详情）

---

## P2 — RAG 知识库

- [ ] 安装 `chromadb`, `tiktoken` 依赖
- [ ] 实现 `src/rag/vector_store.py`（ChromaDB 向量存储管理）
- [ ] 实现 `src/rag/embeddings.py`（嵌入模型管理）
- [ ] 实现 `src/rag/retriever.py`（语义检索器）
- [ ] 准备问卷设计最佳实践文档放入 `src/rag/documents/`

## P2 — 情感分析

- [ ] 实现 `src/analysis/sentiment.py`（优先情感词典方案，复杂文本降级 LLM）

## P2 — 多题聚合分析

- [ ] 实现 `src/analysis/aggregator.py`（相关性分析 + 用户分群 + 异常检测）

## P2 — PDF 报告

- [ ] 实现 `src/report/pdf_generator.py`（WeasyPrint + HTML 模板）
- [ ] 创建报告模板 `src/report/templates/analysis_report.html`
- [ ] 创建 `GET /api/v1/analysis/reports/:id/pdf`

## P2 — SQLAlchemy ORM（按需）

- [ ] 安装 `sqlalchemy[asyncio]`, `asyncpg`, `alembic`
- [ ] 创建 `src/storage/database.py`（异步引擎 + session 依赖注入）
- [ ] 初始化 Alembic 迁移
- [ ] 定义 ORM 模型（会话记录、分析结果）

## P2 — Docker

- [ ] 创建 `Dockerfile`
- [ ] 添加到 `deploy/docker-compose.yml` 的 ai-service 定义（可选扩展）

## P2 — 会话历史压缩

- [ ] 实现对话历史摘要压缩（超 N 轮时 LLM 自动摘要）

## P2 — 设计辅助 Agent

- [ ] 实现 `src/agents/design_agent.py`
- [ ] 实现 `src/llm/prompts/design.py`

---

## P3 — 锦上添花

- [ ] 配置 pre-commit hook
- [ ] 配置动态热重载（从 q-server system_configs 读取配置）
- [ ] 添加 Prometheus 指标端点 `GET /metrics`
- [ ] Ruff 代码检查集成到 CI

---

## 验收速查

- [ ] LLM 工厂多 Provider 切换正常
- [ ] Agent 对话返回真实 LLM 内容（非 Placeholder）
- [ ] SSE 流式正常推送 token/tool_call/tool_result/done 事件
- [ ] 分析结论引用具体统计数据，不做无数据推断
- [ ] 无效 survey_id → 404，q-server 不可达 → 503
- [ ] JWT 无效 → 401，限流生效
- [ ] 单元+集成测试全通过，核心覆盖率 ≥ 80%
- [ ] `.env.example` 与代码中配置项完全一致
