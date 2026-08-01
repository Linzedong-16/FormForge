# FastAPI AI 服务拆分 — 完整实现清单

> **文档版本**：v1.0
> **编制日期**：2026-08-01
> **适用范围**：`app/ai-service/` 全部实现工作
> **前置阅读**：[feasibility-assessment.md](./feasibility-assessment.md)

---

## 目录

1. [清单使用说明](#1-清单使用说明)
2. [环境基础搭建](#2-环境基础搭建)
3. [依赖升级与锁定](#3-依赖升级与锁定)
4. [数据库连接与 ORM 配置](#4-数据库连接与-orm-配置)
5. [项目目录结构规范](#5-项目目录结构规范)
6. [核心功能模块实现](#6-核心功能模块实现)
7. [代码解耦与模块化](#7-代码解耦与模块化)
8. [安全与鉴权体系](#8-安全与鉴权体系)
9. [Agent 业务单元开发](#9-agent-业务单元开发)
10. [分析与报告引擎](#10-分析与报告引擎)
11. [测试体系搭建](#11-测试体系搭建)
12. [部署与运维配置](#12-部署与运维配置)
13. [前端对接接口规范](#13-前端对接接口规范)
14. [验收检查清单](#14-验收检查清单)

---

## 1. 清单使用说明

### 1.1 状态标记约定

| 标记  | 含义               |
| ----- | ------------------ |
| `[ ]` | 待执行             |
| `[✓]` | 已完成             |
| `[~]` | 进行中             |
| `[!]` | 受阻/需决策        |
| `[-]` | 已跳过（注明原因） |

### 1.2 执行顺序

清单按**拓扑依赖序**排列，前一项是后一项的前置条件。建议严格按编号顺序执行，跨分组的并行项已明确标注"可并行"。

### 1.3 优先级定义

| 优先级 | 含义                 | 典型项                 |
| ------ | -------------------- | ---------------------- |
| P0     | 阻塞项，必须最先完成 | LLM 接入、路由注册     |
| P1     | 核心功能，MVP 必需   | 分析 Agent、文本预处理 |
| P2     | 增强功能，影响体验   | RAG、PDF 导出          |
| P3     | 锦上添花，可延后     | 性能优化、监控面板     |

---

## 2. 环境基础搭建

### 2.1 Python 运行时环境

- [ ] **2.1.1** 确认 Python 版本 ≥ 3.11（推荐 3.13）

  ```bash
  python --version  # 应输出 Python 3.13.x
  ```

  - 优先级 P0
  - 若版本不符，使用 Conda 安装：`conda install python=3.13`

- [ ] **2.1.2** 创建/确认 Conda 虚拟环境

  ```bash
  conda env list | grep form-agent
  # 若不存在则从头创建（不使用已有的 environment.yml，因为环境名已变更）：
  conda create -n form-agent python=3.13 -y
  conda activate form-agent
  ```

  - 优先级 P0
  - 验证：`conda activate form-agent` 无报错

- [ ] **2.1.3** 安装核心依赖（pyproject.toml 定义的基础依赖）

  ```bash
  conda activate form-agent
  pip install -e .
  ```

  - 优先级 P0
  - 验证：`python -c "import fastapi; print(fastapi.__version__)"` 输出版本号

- [ ] **2.1.4** 配置 `.env` 文件

  ```bash
  # 基于模板创建
  cp .env.example .env
  # 编辑 .env 填入实际值（AI_API_KEY、Q_SERVER_API_KEY 等）
  ```

  - 优先级 P0
  - `.env` 已在 `.gitignore` 中，确保不会提交

- [ ] **2.1.5** 验证基础服务启动

  ```bash
  uvicorn src.main:app --host 0.0.0.0 --port 8090 --reload
  # 访问 http://localhost:8090/health 返回 200
  # 访问 http://localhost:8090/docs 可看到 Swagger UI
  ```

  - 优先级 P0

### 2.2 开发工具配置

- [ ] **2.2.1** 配置 Ruff 代码检查（pyproject.toml 已有基础配置）

  ```bash
  pip install ruff
  # 检查
  ruff check src/
  # 自动修复
  ruff check --fix src/
  ```

  - 优先级 P1

- [ ] **2.2.2** 配置 pre-commit hook（可选，团队统一时启用）

  ```bash
  pip install pre-commit
  # 在 ai-service 根目录创建 .pre-commit-config.yaml
  ```

  - 优先级 P3

---

## 3. 依赖升级与锁定

### 3.1 LangChain 生态升级评估

> **目标版本**：langchain ≥ 1.3.0（v1 最新稳定版），langchain-openai ≥ 1.4.0
> **实际安装**：langchain 1.3.14 / langchain-openai 1.4.1 / langgraph 1.2.10（已完成升级）
> **重要说明**：LangChain 已于 2025 年 10 月发布 v1 稳定版，API 发生重大变更（`AgentExecutor` 废弃、`create_tool_calling_agent` → `create_agent`、Tool 用 `@tool` 装饰器）。本项目从 0.3.x 已迁移至 1.x。

- [ ] **3.1.1** 评估当前安装版本

  ```bash
  pip show langchain langchain-openai langchain-community
  ```

  - 优先级 P0
  - 记录实际安装版本，用于兼容性分析

- [ ] **3.1.2** 查阅 LangChain 版本变更日志（Breaking Changes）
  - 优先级 P0
  - 关注点：`ChatModel` API 变更、`Tool` 定义方式、`AgentExecutor` 废弃与替代
  - 参考：<https://github.com/langchain-ai/langchain/releases>
- [ ] **3.1.3** 升级到目标版本并锁定

  ```bash
  # 升级到最新 v1 稳定版
  pip install --upgrade "langchain>=1.3.0" "langchain-openai>=1.4.0" "langchain-community>=0.4.0"
  # 锁定版本
  pip freeze | grep -E "langchain|langgraph" >> constraints.txt
  ```

  - 优先级 P0
  - 验证：`python -c "from langchain_openai import ChatOpenAI; print('OK')"` 无报错

- [ ] **3.1.4** 更新 `pyproject.toml` 版本约束

  ```toml
  # 更新为具体下限版本
  "langchain>=1.3.0",
  "langchain-openai>=1.4.0",
  "langchain-community>=0.4.0",
  ```

  - 优先级 P0

### 3.2 可选依赖升级

- [ ] **3.2.1** 安装 analysis 分组依赖（P0，分析 Agent 的核心依赖）

  ```bash
  pip install -e ".[analysis]"
  ```

  - 包含：pandas、numpy、jieba、wordcloud

- [ ] **3.2.2** 安装 agent 分组依赖（P1，LangGraph 工作流）
  ```bash
  pip install -e ".[agent]"
  ```
- [ ] **3.2.3** 安装 rag 分组依赖（P2，知识库检索）
  ```bash
  pip install -e ".[rag]"
  ```
- [ ] **3.2.4** 安装 report 分组依赖（P2，PDF 导出）
  ```bash
  pip install -e ".[report]"
  ```

### 3.3 依赖冲突检查

- [ ] **3.3.1** 运行 pip check 确认无冲突

  ```bash
  pip check
  ```

  - 优先级 P0
  - 若有冲突，记录冲突包并逐一解决

---

## 4. 数据库连接与 ORM 配置

### 4.1 数据库连接方案决策

> **前提说明**：ai-service 的核心数据来源于 q-server 的 HTTP API，而非直接访问数据库。但以下场景需要独立的数据库连接：
>
> - Agent 会话历史持久化
> - 分析结果缓存
> - 用户反馈/评分数据存储
> - RAG 知识库文档管理

- [ ] **4.1.1** 确认数据库连接策略
  - 优先级 P0
  - **推荐方案 A**（轻量）：数据访问全部通过 q-server HTTP API，ai-service 仅用 Redis 做缓存与会话管理。不需要独立的 ORM。
  - **方案 B**（独立）：ai-service 直连 PostgreSQL，使用 SQLAlchemy + asyncpg 做独立数据存储。
  - **决策依据**：若只需会话缓存 + 结果缓存，选 A；若需要独立持久化（分析历史、反馈评分），选 B。
  - 当前建议：**阶段 2-3 用方案 A，阶段 6+ 按需引入方案 B**。

### 4.2 Redis 连接配置（方案 A）

- [ ] **4.2.1** 添加 Redis 客户端依赖

  ```bash
  pip install redis[hiredis]>=5.2.0
  ```

  - 优先级 P1（若阶段 1-2 无缓存需求则 P2）
  - 更新 `pyproject.toml` 的 dependencies

- [ ] **4.2.2** 在 `src/config.py` 中添加 Redis 配置项

  ```python
  # Redis 配置
  redis_url: str = "redis://localhost:6379/1"   # 使用 db=1 与 q-server 隔离
  redis_password: str = ""
  redis_max_connections: int = 10
  ```

  - 优先级 P1

- [ ] **4.2.3** 创建 Redis 连接管理模块 `src/storage/redis.py`

  ```python
  # 核心功能：
  # - create_redis_pool() → 异步连接池
  # - get_cache(key) / set_cache(key, value, ttl)
  # - 连接健康检查
  ```

  - 优先级 P1

### 4.3 SQLAlchemy ORM 配置（方案 B，按需启用）

- [ ] **4.3.1** 添加异步数据库依赖

  ```bash
  pip install sqlalchemy[asyncio]>=2.0.30 asyncpg>=0.29.0 alembic>=1.13.0
  ```

  - 优先级 P2
  - 更新 `pyproject.toml` 的 dependencies

- [ ] **4.3.2** 在 `src/config.py` 中添加数据库配置项

  ```python
  database_url: str = "postgresql+asyncpg://user:pass@localhost:5433/formforge"
  database_pool_size: int = 5
  database_echo: bool = False  # 生产环境关闭 SQL 日志
  ```

  - 优先级 P2

- [ ] **4.3.3** 创建数据库引擎模块 `src/storage/database.py`

  ```python
  # 核心功能：
  # - create_async_engine() → SQLAlchemy 异步引擎
  # - get_session() → async session 依赖注入
  # - 引擎生命周期管理（FastAPI lifespan 中启动/关闭）
  ```

  - 优先级 P2

- [ ] **4.3.4** 创建 Alembic 迁移配置

  ```bash
  alembic init src/storage/migrations
  # 编辑 alembic.ini 指向正确的数据库 URL
  # 编辑 env.py 使用 SQLAlchemy 异步引擎
  ```

  - 优先级 P2

- [ ] **4.3.5** 定义 ORM Base 模型基类 `src/storage/models/base.py`

  ```python
  from sqlalchemy.orm import DeclarativeBase

  class Base(DeclarativeBase):
      pass
  ```

  - 优先级 P2

---

## 5. 项目目录结构规范

### 5.1 目标目录结构

以下为 ai-service 完成全部阶段后的目标结构。标记说明：`[已有]` = 已创建，`[新增]` = 需创建。

```
app/ai-service/
├── .env                              # [已有] 环境变量（不入库）
├── .env.example                      # [已有] 环境变量模板
├── environment.yml                   # [已有] Conda 环境定义
├── pyproject.toml                    # [已有] 项目元信息 + 依赖
├── constraints.txt                   # [新增] 依赖版本锁定文件
├── alembic.ini                       # [新增] 数据库迁移配置（方案 B）
│
├── doc/                              # [已有] 文档目录
│   ├── guide.md                      # [已有] 使用指南
│   ├── feasibility-assessment.md     # [新增] 可行性评估报告
│   └── implementation-checklist.md   # [新增] 本清单
│
├── src/                              # [已有] 源码根目录
│   ├── __init__.py                   # [已有]
│   ├── main.py                       # [已有] FastAPI 入口
│   ├── config.py                     # [已有] 配置管理
│   │
│   ├── api/                          # [已有] API 层
│   │   ├── __init__.py               # [已有]
│   │   ├── deps.py                   # [新增] 依赖注入（get_agent, get_redis 等）
│   │   └── routes/                   # [已有] 路由目录
│   │       ├── __init__.py           # [已有]
│   │       ├── health.py             # [已有] 健康检查
│   │       ├── agent.py              # [已有] Agent 对话（需重构扩展）
│   │       ├── analysis.py           # [新增] 问卷分析路由
│   │       └── report.py             # [新增] 分析报告管理路由
│   │
│   ├── models/                       # [已有] 数据模型层
│   │   ├── __init__.py               # [已有]
│   │   ├── schemas.py                # [已有] 请求/响应 Schema（需扩展）
│   │   └── domain.py                 # [新增] 领域模型（分析结果、报告等）
│   │
│   ├── agents/                       # [已有] Agent 层
│   │   ├── __init__.py               # [已有]
│   │   ├── base.py                   # [已有] Agent 抽象基类
│   │   ├── chat_agent.py             # [新增] 通用对话 Agent（替代 Placeholder）
│   │   ├── analysis_agent.py         # [新增] 问卷分析 Agent
│   │   ├── review_agent.py           # [新增] 问卷审核 Agent
│   │   ├── design_agent.py           # [新增] 问卷设计辅助 Agent
│   │   └── registry.py               # [新增] Agent 注册表（agent_type → Agent 实例）
│   │
│   ├── tools/                        # [已有] 工具层（LangChain Tool）
│   │   ├── __init__.py               # [已有]
│   │   ├── survey_client.py          # [已有] q-server API 客户端（需扩展）
│   │   ├── stats_tools.py            # [新增] 统计分析工具
│   │   └── text_tools.py             # [新增] 文本处理工具（分词、情感分析）
│   │
│   ├── llm/                          # [新增] LLM 层
│   │   ├── __init__.py
│   │   ├── factory.py                # [新增] ChatModel 工厂（按 provider 创建）
│   │   ├── prompts/                  # [新增] Prompt 模板目录
│   │   │   ├── __init__.py
│   │   │   ├── analysis.py           # [新增] 分析 Prompt
│   │   │   ├── review.py             # [新增] 审核 Prompt
│   │   │   └── design.py             # [新增] 设计 Prompt
│   │   └── tracing.py                # [新增] LLM 调用追踪（LangSmith/LangFuse 集成）
│   │
│   ├── analysis/                     # [新增] 分析引擎层
│   │   ├── __init__.py
│   │   ├── text_processor.py         # [新增] 文本预处理（jieba 分词、高频词）
│   │   ├── sentiment.py              # [新增] 情感分析
│   │   ├── aggregator.py             # [新增] 多题聚合分析
│   │   └── comparator.py             # [新增] 多问卷对比分析
│   │
│   ├── rag/                          # [新增] RAG 知识库层（阶段 6）
│   │   ├── __init__.py
│   │   ├── vector_store.py           # [新增] ChromaDB 向量存储管理
│   │   ├── embeddings.py             # [新增] 嵌入模型管理
│   │   ├── retriever.py              # [新增] 检索器
│   │   └── documents/                # [新增] 知识文档目录
│   │       └── survey_best_practices.md
│   │
│   ├── report/                       # [新增] 报告引擎层（阶段 7）
│   │   ├── __init__.py
│   │   ├── pdf_generator.py          # [新增] PDF 报告生成
│   │   └── templates/                # [新增] 报告模板
│   │       └── analysis_report.html
│   │
│   ├── storage/                      # [新增] 持久化层
│   │   ├── __init__.py
│   │   ├── redis.py                  # [新增] Redis 连接管理（方案 A）
│   │   ├── database.py               # [新增] 数据库引擎（方案 B）
│   │   └── models/                   # [新增] ORM 模型（方案 B）
│   │       ├── __init__.py
│   │       ├── base.py               # [新增] Base 声明基类
│   │       ├── session.py            # [新增] Agent 会话模型
│   │       └── analysis_result.py    # [新增] 分析结果模型
│   │
│   └── utils/                        # [新增] 工具函数层
│       ├── __init__.py
│       ├── security.py               # [新增] 鉴权工具（JWT 校验、API Key 校验）
│       ├── response.py               # [新增] 统一响应格式化
│       └── logger.py                 # [新增] 日志配置
│
├── tests/                            # [已有] 测试目录
│   ├── __init__.py                   # [已有]
│   ├── conftest.py                   # [新增] 全局 fixtures
│   ├── test_health.py                # [已有] 健康检查测试
│   ├── test_agent.py                 # [新增] Agent 接口测试
│   ├── test_analysis.py              # [新增] 分析功能测试
│   ├── test_tools.py                 # [新增] 工具函数测试
│   └── fixtures/                     # [新增] 测试 fixtures
│       ├── survey_sample.json        # 样本问卷数据
│       └── response_sample.json      # 样本答卷数据
│
└── scripts/                          # [新增] 运维脚本
    ├── seed_knowledge_base.py         # RAG 知识库初始化脚本
    └── migrate.py                     # 数据库迁移脚本
```

### 5.2 目录创建命令（一次性执行）

- [ ] **5.2.1** 创建新增目录结构（可并行）

  ```bash
  mkdir -p src/api
  mkdir -p src/llm/prompts
  mkdir -p src/analysis
  mkdir -p src/rag/documents
  mkdir -p src/report/templates
  mkdir -p src/storage/models
  mkdir -p src/utils
  mkdir -p tests/fixtures
  mkdir -p scripts
  ```

  - 优先级 P0
  - 已存在的目录不会报错

- [ ] **5.2.2** 创建空 `__init__.py` 文件（使目录成为 Python 包，可并行）

  ```bash
  touch src/llm/__init__.py \
        src/llm/prompts/__init__.py \
        src/analysis/__init__.py \
        src/rag/__init__.py \
        src/report/__init__.py \
        src/storage/__init__.py \
        src/utils/__init__.py
  ```

  - 优先级 P0

---

## 6. 核心功能模块实现

### 6.1 LLM 层 — 模型工厂与 Provider 抽象

- [ ] **6.1.1** 实现 `src/llm/factory.py` — ChatModel 工厂

  ```python
  """
  LLM 工厂模块

  功能：
  - 根据 config.ai_provider 创建对应的 ChatModel 实例
  - 支持 deepseek / openai / anthropic 三种 Provider
  - 统一 ChatModel 接口，业务代码不感知 Provider 差异
  """
  from langchain_openai import ChatOpenAI
  from .config import settings

  def create_chat_model(
      temperature: float | None = None,
      max_tokens: int | None = None,
  ) -> ChatOpenAI:
      """创建 ChatModel 实例（DeepSeek / OpenAI 均兼容 OpenAI API 格式）"""
      return ChatOpenAI(
          model=settings.ai_model,
          api_key=settings.ai_api_key,
          base_url=settings.ai_base_url,
          temperature=temperature or settings.ai_temperature,
          max_tokens=max_tokens or settings.ai_max_tokens,
      )

  # 模块级单例（避免重复创建）
  _default_model: ChatOpenAI | None = None

  def get_default_model() -> ChatOpenAI:
      global _default_model
      if _default_model is None:
          _default_model = create_chat_model()
      return _default_model
  ```

  - 优先级 P0
  - 需处理 Anthropic 的特殊情况（消息格式差异），创建 `create_anthropic_model()` 分支

- [ ] **6.1.2** 实现 Provider 自动检测

  ```python
  # 根据 ai_provider 配置自动选择适配器
  PROVIDER_MAP = {
      "deepseek": ("https://api.deepseek.com/v1", ChatOpenAI),
      "openai": ("https://api.openai.com/v1", ChatOpenAI),
      "anthropic": ("https://api.anthropic.com", ChatAnthropic),  # 需 langchain-anthropic ≥ 0.2.0（v1 配套版本）
  }
  ```

  - 优先级 P0

- [ ] **6.1.3** 验证 LLM 连通性

  ```python
  # 在 lifespan 启动时调用
  async def verify_llm_connection():
      model = get_default_model()
      response = await model.ainvoke("ping, reply with 'pong' only")
      assert "pong" in response.content.lower()
  ```

  - 优先级 P0

### 6.2 Prompt 模板体系

- [ ] **6.2.1** 实现 `src/llm/prompts/analysis.py` — 分析 Prompt

  ```python
  """
  问卷分析 Prompt 模板

  核心要素：
  - 角色定义：专业问卷数据分析师
  - 数据约束：强制引用具体数值，不做无数据推断
  - 输出格式：数据事实 → 趋势识别 → 可能原因 → 改进建议
  """
  ANALYSIS_SYSTEM_PROMPT = """你是一个专业的问卷数据分析师...
  [完整的 System Prompt 内容]"""

  def build_analysis_prompt(
      survey_structure: dict,
      stats_summary: dict,
      user_question: str,
  ) -> list[dict]:
      """组装分析对话的消息列表"""
      ...
  ```

  - 优先级 P0

- [ ] **6.2.2** 实现 `src/llm/prompts/review.py` — 审核 Prompt

  ```python
  # 问卷质量审核 System Prompt + 组装函数
  ```

  - 优先级 P1

- [ ] **6.2.3** 实现 `src/llm/prompts/design.py` — 设计辅助 Prompt

  ```python
  # 问卷设计优化建议 System Prompt + 组装函数
  ```

  - 优先级 P2

### 6.3 SurveyAPIClient 扩展

- [ ] **6.3.1** 在 `src/tools/survey_client.py` 中添加统计 API 方法

  ```python
  async def get_survey_stats(self, survey_id: str) -> dict:
      """调用 GET /api/admin/surveys/:id/stats"""
      return await self._request("GET", f"/api/admin/surveys/{survey_id}/stats")

  async def get_platform_overview(self) -> dict:
      """调用 GET /api/admin/stats/overview"""
      return await self._request("GET", "/api/admin/stats/overview")

  async def export_responses_csv(self, survey_id: str) -> str:
      """调用 GET /api/admin/surveys/:id/responses/export（返回 CSV 文本）"""
      ...
  ```

  - 优先级 P0
  - 注意：这些接口需要管理员认证，需在 `.env` 中配置 `Q_SERVER_API_KEY`

- [ ] **6.3.2** 添加请求重试与超时控制

  ```python
  from tenacity import retry, stop_after_attempt, wait_exponential

  @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=1, max=10))
  async def _request_with_retry(self, method: str, path: str, **kwargs) -> dict:
      ...
  ```

  - 优先级 P1

- [ ] **6.3.3** 添加响应缓存装饰器

  ```python
  # 对 get_survey_stats 等读多写少的接口做短期缓存（5 分钟）
  @cache_result(ttl=300)
  async def get_survey_stats(self, survey_id: str) -> dict:
      ...
  ```

  - 优先级 P1

### 6.4 LangChain Tool 注册

- [ ] **6.4.1** 实现 `src/tools/stats_tools.py` — 统计类 Tool

  ```python
  from langchain.tools import tool

  @tool
  async def get_survey_statistics(survey_id: str) -> str:
      """获取指定问卷的完整统计分析数据，包括各题选项分布、评分统计、文本抽样等。

      Args:
          survey_id: 问卷的数字 ID

      Returns:
          JSON 格式的统计分析结果
      """
      result = await survey_client.get_survey_stats(survey_id)
      return json.dumps(result, ensure_ascii=False, indent=2)
  ```

  - 优先级 P0

- [ ] **6.4.2** 实现 `src/tools/text_tools.py` — 文本处理 Tool

  ```python
  @tool
  async def extract_text_keywords(texts: list[str], top_k: int = 20) -> str:
      """对文本列表进行分词并提取高频关键词。

      Args:
          texts: 文本字符串列表
          top_k: 返回前 K 个高频词
      """
      ...

  @tool
  async def analyze_sentiment(texts: list[str]) -> str:
      """对文本列表进行情感分析，返回正面/中性/负面的比例。
      """
      ...
  ```

  - 优先级 P1

---

## 7. 代码解耦与模块化

### 7.1 当前存在的问题

| 问题                              | 涉及文件                    | 严重程度                         |
| --------------------------------- | --------------------------- | -------------------------------- |
| `PlaceholderAgent` 硬编码在路由中 | `routes/agent.py:20`        | 中                               |
| `SurveyAPIClient` 单例直接导入    | `tools/survey_client.py:84` | 低（可接受）                     |
| 配置 `Settings` 单例直接导入      | `config.py:49`              | 低（pydantic-settings 惯用模式） |
| Agent 路由与业务逻辑耦合          | `routes/agent.py`           | 中                               |
| 缺少依赖注入机制                  | 全局                        | 中                               |

### 7.2 解耦措施

- [ ] **7.2.1** 实现 Agent 注册表 `src/agents/registry.py`

  ```python
  """
  Agent 注册表

  功能：
  - 维护 agent_type → Agent 实例的映射
  - 支持运行时注册新 Agent 类型
  - 延迟初始化（首次调用时才创建实例）
  """
  from collections.abc import Callable
  from .base import BaseAgent

  _registry: dict[str, Callable[[], BaseAgent]] = {}

  def register_agent(agent_type: str, factory: Callable[[], BaseAgent]):
      """注册 Agent 类型"""
      _registry[agent_type] = factory

  def get_agent(agent_type: str) -> BaseAgent:
      """获取 Agent 实例（延迟创建）"""
      factory = _registry.get(agent_type)
      if not factory:
          raise ValueError(f"未知的 Agent 类型: {agent_type}")
      return factory()

  def list_agents() -> list[str]:
      """列出所有已注册的 Agent 类型"""
      return list(_registry.keys())
  ```

  - 优先级 P0
  - 在 `src/agents/__init__.py` 中调用 `register_agent` 注册所有 Agent

- [ ] **7.2.2** 重构 `routes/agent.py`，使用注册表获取 Agent

  ```python
  # 之前：硬编码 PlaceholderAgent
  _agent = PlaceholderAgent()

  # 之后：从注册表获取
  from ..agents.registry import get_agent
  from ..api.deps import validate_session

  @router.post("/chat")
  async def agent_chat(req: AgentChatRequest):
      agent = get_agent(req.agent_type)
      result = await agent.chat(req.message, req.session_id)
      return AgentChatResponse(**result)
  ```

  - 优先级 P0

- [ ] **7.2.3** 实现 `src/api/deps.py` — FastAPI 依赖注入

  ```python
  """
  FastAPI 依赖注入模块

  提供：
  - get_current_user: 当前用户身份（JWT 解析或透传）
  - get_agent: 按类型获取 Agent 实例
  - get_redis_client: 获取 Redis 连接
  - get_survey_client: 获取 SurveyAPIClient 实例
  """
  from fastapi import Depends, Header, HTTPException
  from ..agents.registry import get_agent as _get_agent

  async def get_agent_instance(agent_type: str = "analysis"):
      """依赖注入：获取 Agent 实例"""
      try:
          return _get_agent(agent_type)
      except ValueError as e:
          raise HTTPException(status_code=400, detail=str(e))
  ```

  - 优先级 P1

### 7.3 配置解耦

- [ ] **7.3.1** 区分运行时配置与编译时配置
  - 运行时配置（环境变量）：AI_API_KEY、Q_SERVER_BASE_URL 等 — 保持 `.env` 注入
  - 编译时配置（代码常量）：Prompt 模板、超时时间等 — 抽取到对应模块的常量定义
  - 优先级 P2
- [ ] **7.3.2** 添加配置热重载（可选）

  ```python
  # 对于 system_configs 中的 AI 配置项，支持运行时动态读取
  async def get_dynamic_config(key: str) -> str:
      """从 q-server system_configs 动态获取配置"""
      # 调用 q-server API 读取配置
      ...
  ```

  - 优先级 P3

---

## 8. 安全与鉴权体系

### 8.1 内部服务认证（ai-service → q-server）

- [ ] **8.1.1** 配置 `X-Internal-Api-Key` Header
  - 在 q-server 的 `system_configs` 表中添加 `ai-service-internal-key` 配置项
  - ai-service 在 `.env` 中配置 `Q_SERVER_API_KEY`
  - SurveyAPIClient 每次请求携带该 Header
  - 优先级 P0（已有基础实现，需确认 q-server 端校验逻辑）
- [ ] **8.1.2** q-server 端添加内部 API Key 校验中间件（若未实现）

  ```typescript
  // 在 q-server 的路由中校验 X-Internal-Api-Key
  fastify.addHook("preHandler", async (request, reply) => {
    const internalKey = request.headers["x-internal-api-key"];
    if (internalKey) {
      const expectedKey = await getSystemConfig("ai-service-internal-key");
      if (internalKey !== expectedKey) {
        return reply.status(401).send({ msg: "内部 API Key 无效" });
      }
      // 内部调用通过，跳过用户认证
      return;
    }
  });
  ```

  - 优先级 P0
  - 需与 q-server 团队协调

### 8.2 外部 API 认证（用户 → ai-service）

- [ ] **8.2.1** 实现 JWT Token 校验 `src/utils/security.py`

  ```python
  """
  安全模块

  功能：
  - 校验前端传来的 JWT Token（与 q-server 共享密钥）
  - 提取用户 ID 和角色
  """
  import jwt
  from fastapi import Header, HTTPException
  from ..config import settings

  async def get_current_user(
      authorization: str = Header(..., description="Bearer <token>")
  ) -> dict:
      """校验 JWT Token 并返回用户信息"""
      try:
          token = authorization.replace("Bearer ", "")
          payload = jwt.decode(
              token,
              settings.jwt_secret,  # 需与 q-server 共享 secret
              algorithms=["HS256"],
          )
          return {"user_id": payload["sub"], "role": payload.get("role")}
      except jwt.ExpiredSignatureError:
          raise HTTPException(status_code=401, detail="Token 已过期")
      except jwt.InvalidTokenError:
          raise HTTPException(status_code=401, detail="Token 无效")
  ```

  - 优先级 P1
  - 需在 `.env` 中添加 `JWT_SECRET` 配置项（与 q-server 的值一致）

- [ ] **8.2.2** 添加请求限流

  ```python
  # 使用 slowapi 或自定义 Redis 计数器
  from slowapi import Limiter
  from slowapi.util import get_remote_address

  limiter = Limiter(key_func=get_remote_address)

  # 在路由上使用
  @router.post("/agent/chat")
  @limiter.limit("10/minute")  # 每用户每分钟最多 10 次
  async def agent_chat(req: AgentChatRequest, request: Request):
      ...
  ```

  - 优先级 P1

- [ ] **8.2.3** 添加审计日志

  ```python
  # 每次 Agent 调用记录到 q-server 的 audit_logs
  async def log_agent_call(
      user_id: int,
      agent_type: str,
      survey_id: str | None,
      question: str,
      tokens_used: int,
  ):
      await survey_client._request("POST", "/api/admin/audit-logs", json={
          "action": "ai_agent_call",
          "resource_type": "ai_analysis",
          "resource_id": survey_id,
          "details": {
              "agent_type": agent_type,
              "question": question[:200],
              "tokens_used": tokens_used,
          },
      })
  ```

  - 优先级 P1

---

## 9. Agent 业务单元开发

### 9.1 通用对话 Agent（替代 PlaceholderAgent）

- [ ] **9.1.1** 实现 `src/agents/chat_agent.py`

  ```python
  """
  通用对话 Agent

  驱动方式：LangChain ChatModel + 基础 Tool Calling
  替换 PlaceholderAgent，接入真正的 LLM 推理
  """
  from langchain_openai import ChatOpenAI
  from ..llm.factory import get_default_model

  class ChatAgent(BaseAgent):
      name = "chat"
      description = "通用 AI 对话 Agent"

      def __init__(self):
          self.model = get_default_model()

      async def chat(self, message: str, session_id: str | None = None) -> dict:
          response = await self.model.ainvoke(message)
          return {
              "session_id": session_id or self._generate_session_id(),
              "reply": response.content,
              "tool_calls": [],
              "steps": 1,
          }

      async def chat_stream(self, message: str, session_id: str | None = None):
          async for chunk in self.model.astream(message):
              yield {"event": "token", "data": {"text": chunk.content}}
          yield {"event": "done", "data": {}}
  ```

  - 优先级 P0
  - 在 `agents/__init__.py` 中注册：`register_agent("chat", lambda: ChatAgent())`

### 9.2 问卷分析 Agent

- [ ] **9.2.1** 实现 `src/agents/analysis_agent.py`

  ```python
  """
  问卷答题结果分析 Agent

  工作流：
  1. 接收 survey_id + 用户问题
  2. 调用 SurveyAPIClient 获取统计摘要
  3. 组装分析 Prompt（System + Context + User Question）
  4. LLM 推理 → 流式返回分析结论
  5. 结果校验（关键数值与原始数据对比）
  """
  from langchain.agents import create_agent
  from ..tools.stats_tools import get_survey_statistics
  from ..tools.text_tools import extract_text_keywords
  from ..llm.prompts.analysis import ANALYSIS_SYSTEM_PROMPT

  class AnalysisAgent(BaseAgent):
      name = "analysis"
      description = "问卷答题结果分析 Agent"

      def __init__(self):
          self.model = get_default_model()
          self.tools = [get_survey_statistics, extract_text_keywords]
          self.agent = self._build_agent()

      def _build_agent(self):
          """LangChain v1 API：使用 create_agent 替代已废弃的 AgentExecutor"""
          prompt = ChatPromptTemplate.from_messages([
              ("system", ANALYSIS_SYSTEM_PROMPT),
              ("human", "{input}"),
              ("placeholder", "{agent_scratchpad}"),
          ])
          agent = create_agent(self.model, self.tools, system_prompt=ANALYSIS_SYSTEM_PROMPT)
          return agent

      async def chat(self, message: str, session_id: str | None = None) -> dict:
          result = await self.agent.ainvoke({"messages": [{"role": "user", "content": message}]})
          # LangChain v1 的 create_agent 直接返回包含 messages 的结果
          last_message = result["messages"][-1]
          return {
              "session_id": session_id or self._generate_session_id(),
              "reply": last_message.content,
              "tool_calls": [],  # 从 result["messages"] 中提取 ToolMessage
              "steps": sum(1 for m in result["messages"] if m.type == "tool"),
          }
  ```

  - 优先级 P0

- [ ] **9.2.2** 实现分析 Agent 的子类型路由

  ```python
  # 在 routes/analysis.py 中
  ANALYSIS_AGENTS = {
      "basic": BasicAnalysisAgent,     # 基础统计解读
      "insight": InsightAnalysisAgent, # 深度洞察
      "report": ReportAnalysisAgent,   # 综合报告
      "compare": CompareAnalysisAgent, # 对比分析
  }
  ```

  - 优先级 P1

### 9.3 问卷审核 Agent

- [ ] **9.3.1** 实现 `src/agents/review_agent.py`

  ```python
  """
  问卷质量审核 Agent

  审核维度（可配置）：
  - completeness: 题目完整性（是否有缺失必填项、选项不完整）
  - bias: 选项偏差（是否有引导性问题、选项不平衡）
  - logic: 逻辑一致性（跳转逻辑是否合理）
  - wording: 措辞质量（是否有歧义、专业术语使用是否恰当）
  """
  ```

  - 优先级 P1

### 9.4 会话管理

- [ ] **9.4.1** 实现会话存储（Redis 方案 A）

  ```python
  # 存储结构：session:{session_id} → JSON {history: [...], agent_type: "...", created_at: "..."}
  # TTL: settings.agent_session_ttl (默认 3600 秒)
  ```

  - 优先级 P0

- [ ] **9.4.2** 添加会话历史压缩（防止对话过长）

  ```python
  # 当对话历史超过 N 轮时，对较早轮次做摘要压缩
  # 使用 LLM 生成对话摘要，替代原始消息
  ```

  - 优先级 P2

---

## 10. 分析与报告引擎

### 10.1 文本预处理管道

- [ ] **10.1.1** 实现 `src/analysis/text_processor.py` — jieba 分词 + 高频词

  ```python
  """
  文本预处理模块

  管道：原始文本 → jieba 分词 → 去停用词 → 词频统计 → Top-K 关键词
  """
  import jieba
  from collections import Counter

  # 中文停用词表（可外置到配置文件）
  STOP_WORDS = set(["的", "了", "在", "是", "我", "有", "和", ...])

  def extract_keywords(texts: list[str], top_k: int = 20) -> list[tuple[str, int]]:
      """提取高频关键词"""
      all_words = []
      for text in texts:
          words = jieba.cut(text)
          all_words.extend(w for w in words if w not in STOP_WORDS and len(w) > 1)
      counter = Counter(all_words)
      return counter.most_common(top_k)
  ```

  - 优先级 P1
  - **注意**：jieba 分词需要加载词典文件，首次调用有初始化开销

- [ ] **10.1.2** 实现 `src/analysis/sentiment.py` — 情感分析

  ```python
  """
  情感分析模块

  方法：
  - 方案 A：基于情感词典（SnowNLP / 自建词典）— 离线可用，无 API 费用
  - 方案 B：基于 LLM 批量分析 — 更准确，有 API 费用
  - 当前建议：优先方案 A，对复杂文本降级到方案 B
  """
  ```

  - 优先级 P2

### 10.2 多题聚合分析

- [ ] **10.2.1** 实现 `src/analysis/aggregator.py`

  ```python
  """
  多题聚合分析模块

  功能：
  - 相关性分析：识别不同题目之间的回答模式关联
  - 用户分群：基于答案模式对答卷人聚类
  - 异常检测：识别异常答卷（全选相同选项、答题过快等）
  """
  ```

  - 优先级 P2

### 10.3 PDF 报告导出

- [ ] **10.3.1** 实现 `src/report/pdf_generator.py`

  ```python
  """
  PDF 报告生成器

  技术栈：WeasyPrint + HTML 模板 + Matplotlib 图表
  输入：分析结果 JSON
  输出：结构化 PDF 报告（含封面、图表、建议）
  """
  from weasyprint import HTML

  async def generate_pdf_report(
      analysis_result: dict,
      charts: list[bytes],  # Matplotlib 生成的图表 PNG
  ) -> bytes:
      template = render_template("analysis_report.html", data=analysis_result)
      return HTML(string=template).write_pdf()
  ```

  - 优先级 P2
  - **注意**：WeasyPrint 在 Windows 上需要额外安装 GTK 依赖

---

## 11. 测试体系搭建

### 11.1 测试框架配置

- [ ] **11.1.1** 创建 `tests/conftest.py` — 全局 Fixtures

  ```python
  """
  测试全局配置

  提供：
  - async_client: 带 ASGITransport 的 httpx 异步客户端
  - mock_q_server: 模拟 q-server 响应的 respx/pytest-httpx fixture
  - mock_llm: 模拟 LLM 调用（避免测试中消耗 API 额度）
  - sample_survey_data: 标准测试问卷数据
  """
  import pytest
  from httpx import ASGITransport, AsyncClient
  from src.main import app

  @pytest.fixture
  async def async_client():
      transport = ASGITransport(app=app)
      async with AsyncClient(transport=transport, base_url="http://test") as c:
          yield c

  @pytest.fixture
  def mock_q_server(respx_mock):
      """模拟 q-server 的统计 API 响应"""
      respx_mock.get("http://localhost:8080/api/admin/surveys/1/stats").respond(
          json={"code": 0, "data": {...}}
      )
  ```

  - 优先级 P0

- [ ] **11.1.2** 安装测试依赖

  ```bash
  pip install pytest>=8.0 pytest-asyncio>=0.24 pytest-httpx>=0.30 respx>=0.21
  ```

  - 优先级 P0
  - 更新 `pyproject.toml` 的 `[project.optional-dependencies]`：
    ```toml
    test = ["pytest>=8.0", "pytest-asyncio>=0.24", "pytest-httpx>=0.30", "respx>=0.21"]
    ```

### 11.2 单元测试

- [ ] **11.2.1** 配置模型测试 `tests/test_models.py`

  ```python
  """Pydantic 模型序列化/反序列化测试"""
  # 覆盖所有 Schema：APIResponse, AgentChatRequest, AgentChatResponse, etc.
  ```

  - 优先级 P1

- [ ] **11.2.2** 工具函数测试 `tests/test_tools.py`

  ```python
  """SurveyAPIClient / stats_tools / text_tools 单元测试"""
  # 使用 mock_q_server fixture 模拟 HTTP 响应
  ```

  - 优先级 P1

- [ ] **11.2.3** LLM 层测试 `tests/test_llm.py`

  ```python
  """LLM 模型工厂 / Prompt 模板测试"""
  # 使用 mock LLM 避免 API 调用
  ```

  - 优先级 P1

- [ ] **11.2.4** 文本处理测试 `tests/test_text_processor.py`

  ```python
  """jieba 分词 / 关键词提取 / 情感分析测试"""
  # 使用标准中文文本样本验证准确性
  ```

  - 优先级 P1

### 11.3 集成测试

- [ ] **11.3.1** Agent 接口测试 `tests/test_agent.py`

  ```python
  """端到端 Agent 对话集成测试"""
  # 覆盖：同步对话 / SSE 流式 / 不同 agent_type / 错误处理
  ```

  - 优先级 P0

- [ ] **11.3.2** 分析接口测试 `tests/test_analysis.py`

  ```python
  """问卷分析全流程集成测试"""
  # 使用 sample_survey_data + mock_q_server + mock LLM
  ```

  - 优先级 P0

### 11.4 测试覆盖率

- [ ] **11.4.1** 配置 pytest-cov 覆盖率

  ```bash
  pip install pytest-cov>=5.0
  pytest --cov=src --cov-report=html --cov-report=term
  ```

  - 优先级 P1
  - 目标：核心模块（agents/llm/tools）覆盖率 ≥ 80%

### 11.5 测试 Fixtures 数据

- [ ] **11.5.1** 创建 `tests/fixtures/survey_sample.json`
  - 包含完整的多题型问卷结构（单选/多选/评分/文本/矩阵）
  - 优先级 P0
- [ ] **11.5.2** 创建 `tests/fixtures/stats_sample.json`
  - 包含完整的统计分析结果（各题分布 + 数值聚合 + 文本抽样）
  - 优先级 P0

---

## 12. 部署与运维配置

### 12.1 进程管理

- [ ] **12.1.1** 创建 PM2 配置文件 `ecosystem.config.cjs`

  ```javascript
  module.exports = {
    apps: [
      {
        name: "form-agent",
        script: "uvicorn",
        args: "src.main:app --host 0.0.0.0 --port 8090",
        interpreter: "none", // 使用系统 Python
        env: {
          CONDA_ENV: "form-agent"
        },
        max_memory_restart: "512M",
        error_file: "./logs/ai-error.log",
        out_file: "./logs/ai-out.log"
      }
    ]
  };
  ```

  - 优先级 P1

- [ ] **12.1.2** 创建 Conda 环境激活脚本 `scripts/start.sh`

  ```bash
  #!/bin/bash
  source "$(conda info --base)/etc/profile.d/conda.sh"
  conda activate form-agent
  uvicorn src.main:app --host 0.0.0.0 --port 8090
  ```

  - 优先级 P1
  - Windows 用户创建对应的 `scripts/start.cmd`

### 12.2 Docker 化

- [ ] **12.2.1** 创建 `Dockerfile`

  ```dockerfile
  FROM python:3.13-slim

  WORKDIR /app

  # 安装系统依赖（WeasyPrint 需要）
  RUN apt-get update && apt-get install -y --no-install-recommends \
      libpango-1.0-0 libpangocairo-1.0-0 libgdk-pixbuf2.0-0 \
      && rm -rf /var/lib/apt/lists/*

  # 安装 Python 依赖
  COPY pyproject.toml .
  RUN pip install --no-cache-dir -e ".[analysis,agent]"

  COPY src/ ./src/

  EXPOSE 8090
  CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8090"]
  ```

  - 优先级 P2

- [ ] **12.2.2** 在 `deploy/docker-compose.yml` 中添加 ai-service 定义（可选扩展，已创建骨架）

  ```yaml
  ai-service:
    build: ../ai-service
    ports:
      - "8090:8090"
    environment:
      - Q_SERVER_BASE_URL=http://q-server:3000
      - AI_API_KEY=${AI_API_KEY}
    depends_on:
      - q-server
  ```

  - 优先级 P2

### 12.3 日志与监控

- [ ] **12.3.1** 实现 `src/utils/logger.py` — 结构化日志

  ```python
  """
  结构化日志配置

  使用 Python logging + JSON 格式输出（生产环境）
  开发环境使用彩色控制台输出
  """
  import logging
  import sys

  def setup_logger(level: str = "INFO") -> logging.Logger:
      logger = logging.getLogger("form-agent")
      handler = logging.StreamHandler(sys.stdout)
      handler.setFormatter(
          logging.Formatter(
              '{"time": "%(asctime)s", "level": "%(levelname)s", "module": "%(name)s", "message": "%(message)s"}'
          )
      )
      logger.addHandler(handler)
      logger.setLevel(getattr(logging, level.upper()))
      return logger
  ```

  - 优先级 P1

- [ ] **12.3.2** 添加关键指标监控端点 `GET /metrics`

  ```python
  # Prometheus 格式指标（可选，P3）
  # - 请求量、延迟、错误率
  # - Agent 调用次数、Token 消耗
  # - q-server 连通性状态
  ```

  - 优先级 P3

### 12.4 环境变量完整清单

- [ ] **12.4.1** 更新 `.env.example`，确保覆盖所有配置项

  ```env
  # ── 服务配置 ──
  APP_NAME=Q Survey AI Service
  HOST=0.0.0.0
  PORT=8090
  DEBUG=false

  # ── q-server 内网 API ──
  Q_SERVER_BASE_URL=http://localhost:3000
  Q_SERVER_API_KEY=ai-service-internal-key-change-me

  # ── AI 模型配置 ──
  AI_PROVIDER=deepseek
  AI_MODEL=deepseek-chat
  AI_API_KEY=sk-your-key-here
  AI_BASE_URL=https://api.deepseek.com/v1
  AI_TEMPERATURE=0.7
  AI_MAX_TOKENS=4096

  # ── JWT 鉴权（需与 q-server 共享 secret）──
  JWT_SECRET=your-jwt-secret-shared-with-q-server

  # ── Redis ──
  REDIS_URL=redis://localhost:6379/1
  REDIS_PASSWORD=

  # ── Agent 配置 ──
  AGENT_MAX_STEPS=10
  AGENT_SESSION_TTL=3600

  # ── 日志 ──
  LOG_LEVEL=INFO
  ```

  - 优先级 P0

---

## 13. 前端对接接口规范

前端不直接调 ai-service，通过 q-server 代理转发。路径映射规则：`/api/ai/*` → `http://localhost:8090/api/v1/*`（前缀 `/api/ai` 替换为 `/api/v1`）。

### 13.1 接口汇总

| 方法   | 前端请求路径                           | 代理转发到 (ai-service 内部)           | 说明                | 优先级 |
| ------ | -------------------------------------- | -------------------------------------- | ------------------- | ------ |
| `GET`  | `(开发调试直连 :8090/docs)`            | —                                      | Swagger API 文档    | P0     |
| `POST` | `POST /api/ai/agent/chat`              | `POST /api/v1/agent/chat`              | Agent 同步对话      | P0     |
| `POST` | `POST /api/ai/agent/chat/stream`       | `POST /api/v1/agent/chat/stream`       | Agent SSE 流式对话  | P0     |
| `GET`  | `GET /api/ai/agent/types`              | `GET /api/v1/agent/types`              | 可用 Agent 类型列表 | P0     |
| `POST` | `POST /api/ai/agent/analysis`          | `POST /api/v1/agent/analysis`          | 问卷分析（新建）    | P0     |
| `GET`  | `GET /api/ai/analysis/reports`         | `GET /api/v1/analysis/reports`         | 历史分析报告列表    | P1     |
| `GET`  | `GET /api/ai/analysis/reports/:id`     | `GET /api/v1/analysis/reports/:id`     | 分析报告详情        | P1     |
| `GET`  | `GET /api/ai/analysis/reports/:id/pdf` | `GET /api/v1/analysis/reports/:id/pdf` | 下载 PDF 报告       | P2     |

### 13.2 请求/响应格式

- [ ] **13.2.1** 问卷分析请求格式

  ```json
  POST /api/v1/agent/analysis
  {
    "survey_id": "123456",
    "question": "这份问卷的满意度整体如何？哪些方面需要改进？",
    "analysis_type": "insight",
    "session_id": null
  }
  ```

  - 优先级 P0

- [ ] **13.2.2** 问卷分析响应格式

  ```json
  {
    "code": 0,
    "msg": "ok",
    "data": {
      "session_id": "sess_abc123",
      "reply": "根据统计数据分析，整体满意度评分为 4.2/5，...",
      "citations": [
        { "label": "满意度平均分", "value": "4.2/5", "source": "rate_score_1" },
        { "label": "正面评价占比", "value": "72.5%", "source": "text_input_3" }
      ],
      "tool_calls": [{ "tool": "get_survey_statistics", "result": "..." }],
      "steps": 3,
      "tokens_used": 4850
    }
  }
  ```

  - 优先级 P0

### 13.3 SSE 流式格式

- [ ] **13.3.1** 统一 SSE 事件格式（与 q-server AI 接口保持一致）

  ```
  event: token
  data: {"text": "根据"}

  event: token
  data: {"text": "统计"}

  event: tool_call
  data: {"tool": "get_survey_statistics", "args": {"survey_id": "123"}}

  event: tool_result
  data: {"tool": "get_survey_statistics", "result": "..."}

  event: done
  data: {"tokens_used": 4850, "steps": 3}
  ```

  - 优先级 P0

---

## 14. 验收检查清单

### 14.1 阶段 2 验收（LLM 接入，P0）

- [ ] LLM 工厂能根据配置创建不同 Provider 的 ChatModel
- [ ] `POST /api/v1/agent/chat` 返回真实 LLM 生成内容（非 Placeholder）
- [ ] SSE 流式对话正常推送 token 事件
- [ ] 配置项 `AI_PROVIDER` 切换（deepseek → openai）无需改代码
- [ ] LLM 连接失败时返回友好的错误信息（而非 500 堆栈）

### 14.2 阶段 3 验收（分析 Agent MVP，P0）

- [ ] `POST /api/v1/agent/analysis` 能接收 `survey_id` + `question` 并返回分析结论
- [ ] 分析结论引用具体的统计数据（百分比、均值等）
- [ ] 分析 Agent 能正确调用 `get_survey_statistics` Tool
- [ ] SSE 流式模式下分析过程可见（数据获取 → 推理 → 结论）
- [ ] 不存在的 survey_id 返回 404
- [ ] q-server 不可达时返回 503 并有明确提示

### 14.3 阶段 4 验收（文本预处理，P1）

- [ ] 中文文本分词准确率 > 90%（标准测试集）
- [ ] 高频词提取 Top-20 耗时 < 200ms（100 条文本）
- [ ] 情感分析能区分正面/中性/负面三类

### 14.4 阶段 5 验收（多步编排，P1）

- [ ] 分析流程支持多步推理（如"先分析满意度 → 识别低分题目 → 分析低分原因"）
- [ ] Agent 中间步骤可视化（tool_call / tool_result 事件）
- [ ] 推理步数不超过 `AGENT_MAX_STEPS` 限制

### 14.5 阶段 6 验收（RAG，P2）

- [ ] 能基于上传的问卷设计文档回答专业问题
- [ ] RAG 检索延迟 < 500ms（1000 文档片段的 ChromaDB）
- [ ] 检索相关性 > 80%（人工评估 Top-3 结果）

### 14.6 阶段 8 验收（安全，P1）

- [ ] 无有效 JWT Token 时接口返回 401
- [ ] 单用户限流生效（如 10 次/分钟）
- [ ] Agent 调用记录写入审计日志
- [ ] 输入包含恶意 Prompt 时不被注入执行

### 14.7 整体验收

- [ ] 所有单元测试通过
- [ ] 所有集成测试通过
- [ ] 代码覆盖率 ≥ 80%（核心模块）
- [ ] `ruff check` 无报错
- [ ] Swagger UI 中所有接口可交互测试
- [ ] `.env.example` 与实际配置项完全一致

---

> **编制**：AI 会话工程分析
> **审核状态**：待人工审核
> **下一步**：按编号顺序逐项执行，完成后更新复选框状态
