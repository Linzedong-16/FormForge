# 问卷答题结果分析 Agent — 可行性评估报告

> **文档版本**：v1.0
> **编制日期**：2026-08-01
> **适用范围**：FormForge 开源问卷平台 — AI 分析服务扩展
> **对应目录**：`app/ai-service/`

---

## 目录

1. [项目背景与目标](#1-项目背景与目标)
2. [现有系统架构概览](#2-现有系统架构概览)
3. [ai-service 当前能力盘点](#3-ai-service-当前能力盘点)
4. [核心数据链路分析](#4-核心数据链路分析)
5. [分析 Agent 技术方案设计](#5-分析-agent-技术方案设计)
6. [关键技术风险与对策](#6-关键技术风险与对策)
7. [部署架构与运维考量](#7-部署架构与运维考量)
8. [实施阶段规划](#8-实施阶段规划)
9. [综合可行性结论](#9-综合可行性结论)

---

## 1. 项目背景与目标

### 1.1 项目定位

FormForge 是一个开源低代码问卷/表单构建平台，技术栈为 Node.js/Fastify + TypeScript + PostgreSQL。核心后端 `q-server` 不基于 FastAPI，因此 AI Agent 分析能力设计为**独立的、可选的扩展服务**，由用户自行评估是否部署。

### 1.2 分析 Agent 的目标

构建一个基于 LLM 的问卷答题结果分析 Agent，实现以下能力：

- **统计解读**：对单选题/多选题的选项分布进行自然语言解读
- **趋势分析**：识别答卷数据的日趋势、异常波动
- **文本洞察**：对开放式文本题进行主题提取、情感分析
- **综合报告**：生成包含图表建议、改进方向的结构化分析报告
- **对比分析**：支持多问卷对比、多时段对比

### 1.3 架构原则

- **独立部署**：ai-service 作为独立进程运行，不侵入核心 q-server 代码
- **内网通信**：通过 HTTP 调用 q-server 内网 API 获取数据
- **可选扩展**：用户按需部署，不部署不影响核心问卷功能
- **Provider 无关**：支持 DeepSeek / OpenAI / Anthropic 多种 LLM 后端

---

## 2. 现有系统架构概览

### 2.1 整体架构

```
┌─────────────────────────────────────────────────────────┐
│                     用户浏览器                            │
├─────────────────────────────────────────────────────────┤
│  main-app (微前端基座)                                    │
│   ├── q-editor (问卷编辑器)                               │
│   └── frontend (管理后台)                                 │
├─────────────────────────────────────────────────────────┤
│                    q-server (Fastify :3000)              │
│   ├── 问卷 CRUD      ├── 答卷提交/查询                    │
│   ├── AI 问卷生成     ├── AI 内容润色                      │
│   ├── 统计分析        ├── 审核管理                         │
│   └── 消息/模板/埋点/物料 ...                             │
├─────────────────────────────────────────────────────────┤
│   PostgreSQL │ Redis │ RabbitMQ │ MinIO │ MongoDB │ CH   │
└─────────────────────────────────────────────────────────┘
```

### 2.2 技术栈总览

| 层级            | 技术选型                                                   |
| --------------- | ---------------------------------------------------------- |
| 核心后端        | Fastify 5 + TypeScript + Prisma 7                          |
| 数据库          | PostgreSQL 16（主库）、Redis 7（缓存）、ClickHouse（埋点） |
| AI 后端（扩展） | FastAPI 0.138 + Python 3.13 + LangChain 1.3                |
| 前端            | Vue 3 + Element Plus + Arco Design + Pinia                 |
| 包管理          | pnpm 10.12 (monorepo)                                      |
| 部署            | Docker Compose + PM2                                       |

### 2.3 问卷数据模型（Prisma Schema 摘要）

```
Survey (问卷表)
  ├── id, title, description, status (0=草稿/1=发布/2=关闭)
  ├── user_id (FK → User)
  ├── review_status, deadline, responses_count
  └── SurveyComponent[]  (题目列表)

SurveyComponent (题目组件表)
  ├── id, survey_id (FK → Survey)
  ├── type (single_select / multi_select / text_input / rate_score / ...)
  ├── config (JSON: 题目标题 + 选项 + 校验规则)
  └── Answer[]  (该题的所有答案)

Response (答卷表)
  ├── id, survey_id (FK → Survey)
  ├── user_id / anonymous_id
  ├── status (0=未完成/1=已提交), submitted_at
  └── Answer[]  (该答卷的所有答案)

Answer (答案表)
  ├── id, response_id (FK → Response), component_id (FK → SurveyComponent)
  ├── value  (单值文本: 单选结果、文本输入、评分)
  └── values (JSON 数组: 多选结果)
```

**13 种题型完整覆盖**：单选、多选、下拉选择、图片单选、图片多选、文本输入、日期时间、评分、多级联动、矩阵单选、滑块、排序、电子签名。

---

## 3. ai-service 当前能力盘点

### 3.1 项目元信息

| 属性        | 值                        |
| ----------- | ------------------------- |
| 项目名称    | `form-agent`              |
| 版本号      | 0.1.0                     |
| Python 要求 | ≥ 3.11（当前使用 3.13）   |
| 构建系统    | Hatchling                 |
| 环境管理    | Conda (`environment.yml`) |
| 端口        | 8090                      |

### 3.2 已完成模块（✅）

| 模块         | 文件                         | 说明                                             |
| ------------ | ---------------------------- | ------------------------------------------------ |
| FastAPI 入口 | `src/main.py`                | 应用创建、lifespan、CORS、路由注册               |
| 配置中心     | `src/config.py`              | pydantic-settings，多 Provider 支持，.env 加载   |
| 数据模型     | `src/models/schemas.py`      | Agent 对话、问卷生成/审核、健康检查 Schema       |
| Agent 基类   | `src/agents/base.py`         | `BaseAgent` 抽象类 + `PlaceholderAgent` 占位实现 |
| Agent 路由   | `src/api/routes/agent.py`    | `POST /api/v1/agent/chat` + SSE 流式             |
| 健康检查     | `src/api/routes/health.py`   | 含 q-server 下游连通性探测                       |
| API 客户端   | `src/tools/survey_client.py` | 封装 q-server HTTP 调用（问卷/答卷/日志）        |
| 测试         | `tests/test_health.py`       | pytest + httpx ASGITransport                     |
| 使用指南     | `doc/guide.md`               | 环境安装、启动命令、接口地址                     |

### 3.3 依赖清单（pyproject.toml）

**核心依赖（已安装）**：

| 包名                | 版本    | 用途                                                           |
| ------------------- | ------- | -------------------------------------------------------------- |
| fastapi             | 0.138.0 | Web 框架                                                       |
| uvicorn[standard]   | 0.49.0  | ASGI 服务器                                                    |
| httpx               | 0.28.1  | 异步 HTTP 客户端（调用 q-server）                              |
| pydantic            | 2.13.4  | 数据校验                                                       |
| pydantic-settings   | 2.14.2  | 配置管理                                                       |
| python-dotenv       | 1.2.2   | .env 加载                                                      |
| langchain           | 1.3.x   | LLM 抽象层（v1 稳定版）                                        |
| langchain-openai    | 1.4.x   | OpenAI 兼容 API 适配                                           |
| langchain-community | 0.4.x   | 社区工具集（官方已宣布逐步淘汰，建议迁移至各 Provider 独立包） |

**可选依赖（按需安装）**：

| 分组     | 包名                            | 用途                | 安装命令                       |
| -------- | ------------------------------- | ------------------- | ------------------------------ |
| agent    | langgraph ≥ 1.2.0               | Agent 工作流编排    | `pip install -e ".[agent]"`    |
| analysis | pandas, numpy, jieba, wordcloud | 数据分析 + 中文分词 | `pip install -e ".[analysis]"` |
| rag      | chromadb, tiktoken              | 向量数据库 + 嵌入   | `pip install -e ".[rag]"`      |
| report   | weasyprint, matplotlib          | PDF 报表导出        | `pip install -e ".[report]"`   |

### 3.4 待完成模块（❌）

- **LLM 接入**：PlaceholderAgent 替换为真实的 ChatModel 驱动
- **分析 Agent**：实现 `agent_type: "analysis"` 的分析逻辑
- **LangGraph 编排**：多步推理工作流
- **RAG 知识库**：问卷设计最佳实践的知识检索
- **PDF 导出**：分析结果的结构化报表
- **用户鉴权**：ai-service 自身的 API 认证

---

## 4. 核心数据链路分析

### 4.1 数据获取路径

```
路径 A（推荐，已有基础）：ai-service → HTTP → q-server API → Prisma → PostgreSQL
  优点：复用 q-server 已有统计 API，不重复造轮子，运维简单
  缺点：多一次网络跳转（内网延迟 < 5ms，可忽略）

路径 B（未来可选）：ai-service → asyncpg/Prisma → PostgreSQL（直连）
  优点：减少跳转，查询灵活
  缺点：增加数据库连接，需同步 Prisma Schema 变更
```

**当前阶段建议采用路径 A**，因为 q-server 的 `SurveyStatsService` 已经实现了完整的统计分析能力（详见 4.2 节）。

### 4.2 q-server 统计分析 API（可复用）

`SurveyStatsService`（[survey-stats.service.ts](../../q-server/src/modules/survey/survey-stats/survey-stats.service.ts)，800+ 行生产级代码）已提供：

| 接口       | 路径                                          | 说明                         |
| ---------- | --------------------------------------------- | ---------------------------- |
| 平台概览   | `GET /api/admin/stats/overview`               | 问卷总数、答卷总数、日趋势   |
| 单问卷统计 | `GET /api/admin/surveys/:id/stats`            | 完成率 + 逐题分布 + 文本抽样 |
| 答卷列表   | `GET /api/admin/surveys/:id/responses`        | 分页 + 搜索 + 日期筛选       |
| CSV 导出   | `GET /api/admin/surveys/:id/responses/export` | 原始答卷 CSV                 |

**逐题统计分析能力（已实现）**：

| 题型分类                     | 聚合方式                               | 输出字段                         |
| ---------------------------- | -------------------------------------- | -------------------------------- |
| 单选/下拉/图片单选/日期/级联 | `GROUP BY value`                       | label, count, percentage         |
| 多选/图片多选/排序           | `jsonb_array_elements_text` 展开后聚合 | label, count, percentage         |
| 评分/滑块                    | `AVG/MIN/MAX + GROUP BY`               | average, min, max, 分布          |
| 文本输入/签名                | `LIMIT 10` 抽样                        | sample_answers[]                 |
| 矩阵单选                     | JSON 解析 + 行×列维度聚合              | label (行→列), count, percentage |

### 4.3 Token 消耗预估

以典型场景（20 题问卷，200 份答卷）为例：

| 数据项                       | 预估 Token        |
| ---------------------------- | ----------------- |
| 统计摘要（结构化 JSON）      | ~2,000 tokens     |
| 文本题样本（10 条 × 100 字） | ~1,000 tokens     |
| 系统指令 + Prompt 模板       | ~1,000 tokens     |
| 用户问题 + 对话历史          | ~500 tokens       |
| **单次分析输入合计**         | **~4,500 tokens** |
| 分析结论输出                 | ~800 tokens       |
| **单次分析总计**             | **~5,300 tokens** |

对于 DeepSeek-V3（64K 上下文），纯统计摘要模式可轻松承载 500+ 题的大型问卷。大文本题场景需特殊处理（见 6.1 节）。

### 4.4 缓存策略

q-server 的统计接口已实现 Redis 缓存（Cache-Aside 模式，TTL 5 分钟），ai-service 可直接受益，避免重复的分析查询击穿到数据库。

---

## 5. 分析 Agent 技术方案设计

### 5.1 Agent 架构

```
POST /api/v1/agent/analysis
  │
  ├── [1] 参数校验：survey_id + question + analysis_type
  │
  ├── [2] 数据获取
  │   ├── SurveyAPIClient.get_survey_detail(survey_id)  → 问卷结构
  │   ├── SurveyAPIClient.get_survey_stats(survey_id)   → 统计摘要
  │   └── SurveyAPIClient.get_text_samples(survey_id)   → 文本抽样
  │
  ├── [3] Prompt 组装
  │   ├── System: 分析角色 + 约束规则
  │   ├── Context: 问卷结构 + 统计摘要 + 文本样本
  │   └── User: 自然语言问题
  │
  ├── [4] LLM 推理（LangChain ChatModel）
  │   └── 支持 SSE 流式输出
  │
  └── [5] 响应返回
      ├── analysis: 分析文本
      ├── citations: 引用的数据点
      └── suggestions: 改进建议（可选）
```

### 5.2 Agent 类型细化

当前 `AgentChatRequest.agent_type` 支持 `design / review / analysis`，建议将 `analysis` 细化为：

| agent_type         | 能力                                     | 推荐模型                        |
| ------------------ | ---------------------------------------- | ------------------------------- |
| `analysis_basic`   | 基础统计问答（"A 选项占比多少"）         | deepseek-chat                   |
| `analysis_insight` | 深度洞察（"用户满意度低的原因"）         | deepseek-chat / gpt-4o          |
| `analysis_report`  | 综合报告（含建议、改进方向、可视化建议） | deepseek-chat / claude-sonnet-5 |
| `analysis_compare` | 多问卷/多时段对比分析                    | deepseek-chat / gpt-4o          |

### 5.3 LangChain Tool 体系

#### 已有 Tool（`SurveyAPIClient` 现有方法）

```python
# 可直接注册为 LangChain Tool
- get_survey_detail(survey_id: str) -> dict       # 获取问卷结构
- get_survey_responses(survey_id: str) -> dict     # 获取答卷数据
- list_surveys(page: int, page_size: int) -> dict  # 问卷列表
```

#### 需新增 Tool

```python
# 需在 SurveyAPIClient 和 q-server 中新增
- get_survey_stats(survey_id: str) -> dict         # 调用统计 API
- export_responses_csv(survey_id: str) -> str      # 获取 CSV 原始数据
- get_text_samples(survey_id: str, component_id: str, limit: int) -> list[str]
- get_platform_overview() -> dict                  # 平台级概览
```

### 5.4 Prompt 工程策略

**System Prompt 核心要素**：

```
你是一个专业的问卷数据分析师。你的任务是：
1. 基于提供的统计数据，给出准确、有洞察的分析
2. 所有数据引用必须标注来源（如"根据数据显示，选项A占比XX%"）
3. 不做无数据支撑的推测，区分"事实陈述"和"分析推断"
4. 当数据不足以回答问题时，明确指出并建议补充什么数据
5. 分析结构：数据事实 → 趋势/模式识别 → 可能原因 → 改进建议
```

**分析维度模板**：

| 维度     | 适用题型       | Prompt 指令                                  |
| -------- | -------------- | -------------------------------------------- |
| 选项分布 | 单选/多选/下拉 | "分析选项分布的集中度，是否有明显的偏好趋势" |
| 数值趋势 | 评分/滑块      | "分析评分的中心趋势和离散程度，识别极端值"   |
| 文本主题 | 文本输入       | "提取高频关键词和主题，评估情感倾向"         |
| 时间趋势 | 全部           | "分析日趋势，识别突增/突降的异常时间点"      |
| 完成率   | 全部           | "分析答卷完成率，识别可能导致中断的题目"     |

---

## 6. 关键技术风险与对策

### ⚠️ 风险 1：大文本题 Token 溢出

**场景**：问卷包含多道开放式文本题，每份答卷 500+ 字，100 份答卷 = 50K tokens，超出模型上下文窗口。

**概率**：中（取决于问卷设计）

**影响**：中等（分析截断或拒绝服务）

**对策**：

1. **预处理降维**（推荐，阶段 3 实现）：用 jieba 分词 + TF-IDF 提取关键短语，仅传 Top-K 代表性文本
2. **嵌入检索**（阶段 6 实现）：文本通过 embedding 存入 ChromaDB，分析时按语义相关性检索 Top-N
3. **用户提示**：当文本总量超过阈值时，前端提示用户缩小范围或选择采样分析
4. **分段分析**：将文本按问题拆分，对每道文本题独立分析后汇总

### ⚠️ 风险 2：LLM 幻觉与统计造假

**场景**：Agent 编造不存在的统计数据（如"75%的用户选择了选项 B"，但实际为 60%）。

**概率**：中（当前 LLM 的共性问题）

**影响**：高（分析报告失去可信度）

**对策**：

1. **数据引用约束**：System Prompt 强制要求引用具体数值，标注数据来源
2. **后校验机制**：解析 Agent 输出中的数值声明，与原始统计摘要对比，偏差 > 5% 时标记
3. **置信度标注**：前端展示分析结论时，标注"AI 生成，仅供参考"及置信度等级
4. **可溯源展示**：关键数据旁边展示原始分布图表，用户可自行校验

### ⚠️ 风险 3：跨服务认证与安全

**场景**：ai-service 需要访问 q-server 的管理员级 API，涉及跨服务认证。

**概率**：高（架构必然涉及）

**影响**：中等（内网环境风险可控）

**对策**：

1. **内部 API Key**：在 `system_configs` 表中存储专用的 `ai-service-internal-key`，q-server 中间件校验
2. **网络隔离**：ai-service 与 q-server 部署在同一内网，不暴露到公网
3. **用户级鉴权**：ai-service 前端请求需要携带 JWT Token，透传到 q-server 校验
4. **审计日志**：所有 Agent 分析调用记录到 `audit_logs`，包含用户 ID、问卷 ID、分析类型

### ⚠️ 风险 4：并发性能

**场景**：多用户同时请求分析，LLM API 调用阻塞导致超时。

**概率**：中（取决于用户量）

**影响**：低（可通过排队和缓存缓解）

**对策**：

1. **结果缓存**：同一问卷的分析结果按用户问题 hash 缓存至 Redis，TTL = 5 分钟
2. **请求排队**：使用 FastAPI BackgroundTasks 或 Celery 做异步任务队列
3. **LLM 连接池**：httpx AsyncClient 使用连接池，控制并发数
4. **限流**：按用户维度限制分析请求频率（如 10 次/分钟）

---

## 7. 部署架构与运维考量

### 7.1 部署拓扑

前端只与 q-server 通信，ai-service 作为内部微服务由 q-server 代理转发，对外不可见。

```
                       ┌──────────────┐
                       │   用户浏览器   │
                       └──────┬───────┘
                              │ HTTPS /api/*
                       ┌──────▼───────┐
                       │  Nginx/Caddy │
                       └──────┬───────┘
                              │
                       ┌──────▼───────────────────────────────┐
                       │  q-server (Fastify :3000)             │
                       │  ├── /api/auth         认证           │
                       │  ├── /api/surveys      问卷 CRUD      │
                       │  ├── /api/admin/stats  统计分析        │
                       │  └── /api/ai/*  ──代理转发──┐         │
                       └──────┬───────────────────────│───────┘
                              │                       │
                       ┌──────▼───────┐     ┌────────▼───────┐
                       │ PG/Redis/MQ/ │     │  ai-service     │
                       │ MinIO/CH/MG  │     │  (FastAPI:8090) │
                       └──────────────┘     └────────┬───────┘
                                                     │
                                           ┌─────────▼──────┐
                                           │  LLM API (外网) │
                                           │ DeepSeek/OpenAI │
                                           └────────────────┘
```

**代理转发规则**：

| 前端请求                         | q-server 动作                                         |
| -------------------------------- | ----------------------------------------------------- |
| `GET /api/ai/health`             | → 转发 `GET http://localhost:8090/health`             |
| `POST /api/ai/agent/chat`        | → 转发 `POST http://localhost:8090/api/v1/agent/chat` |
| `POST /api/ai/agent/chat/stream` | → 转发（保留 SSE 流）                                 |
| `GET /api/ai/agent/types`        | → 转发 `GET http://localhost:8090/api/v1/agent/types` |

**优势**：前端单一入口、复用 q-server JWT 鉴权、ai-service 无需暴露公网端口。

### 7.2 环境要求

| 组件     | 要求                                      | 说明                        |
| -------- | ----------------------------------------- | --------------------------- |
| Python   | ≥ 3.11（推荐 3.13）                       | Conda 环境 `form-agent`     |
| 系统内存 | ≥ 512 MB（基础）/ 2 GB（含 RAG）          | ChromaDB 向量检索需额外内存 |
| 磁盘     | ≥ 1 GB（基础）/ 5 GB（含模型缓存）        | 不含 LLM 模型本地部署场景   |
| 网络     | 内网可达 q-server :3000，外网可达 LLM API |                             |

### 7.3 启动命令

```bash
# Conda 环境
conda env create -f environment.yml
conda activate form-agent

# 安装基础依赖
pip install -e .

# 安装分析功能依赖
pip install -e ".[analysis]"

# 启动服务
uvicorn src.main:app --host 0.0.0.0 --port 8090 --reload
```

### 7.4 健康检查端点

- `GET /health` — ai-service 自身健康 + q-server 连通性
- `GET /docs` — Swagger API 文档
- `GET /redoc` — ReDoc API 文档

---

## 8. 实施阶段规划

| 阶段 | 名称           | 内容                                                  | 预估工期 | 状态      | 前置依赖 |
| ---- | -------------- | ----------------------------------------------------- | -------- | --------- | -------- |
| 1    | 框架搭建       | FastAPI 骨架 + 配置 + 路由 + 客户端 + 测试            | 2 天     | ✅ 已完成 | —        |
| 2    | LLM 接入       | 替换 PlaceholderAgent，接入 DeepSeek/OpenAI ChatModel | 1-2 天   | ❌ 待实施 | 阶段 1   |
| 3    | 分析 Agent MVP | 统计摘要 → Prompt → 推理 → 结果返回                   | 2-3 天   | ❌ 待实施 | 阶段 2   |
| 4    | 文本预处理     | jieba 分词 + 情感分析 + 高频词提取                    | 1-2 天   | ❌ 待实施 | 阶段 3   |
| 5    | 多步编排       | LangGraph 工作流（获取数据→分析→校验→汇总）           | 2-3 天   | ❌ 待实施 | 阶段 3   |
| 6    | RAG 知识库     | ChromaDB + 问卷设计最佳实践文档嵌入                   | 2-3 天   | ❌ 待实施 | 阶段 2   |
| 7    | PDF 报告       | WeasyPrint/Matplotlib 生成分析报表                    | 1-2 天   | ❌ 待实施 | 阶段 3   |
| 8    | 安全加固       | 用户鉴权 + 审计日志 + 限流 + 输入校验                 | 1-2 天   | ❌ 待实施 | 阶段 3   |
| 9    | 前端集成       | 管理后台添加"AI 分析"面板 + SSE 流式展示              | 2-3 天   | ❌ 待实施 | 阶段 3   |

---

## 9. 综合可行性结论

### 9.1 各维度评估

| 评估维度         | 评分       | 说明                                                             |
| ---------------- | ---------- | ---------------------------------------------------------------- |
| **技术可行性**   | ⭐⭐⭐⭐⭐ | 数据模型完美支撑全部 13 种题型；q-server 统计 API 已实现逐题聚合 |
| **数据可获取性** | ⭐⭐⭐⭐⭐ | SurveyAPIClient 已封装 HTTP 调用；Redis 缓存减少重复查询         |
| **LLM 适配度**   | ⭐⭐⭐⭐☆  | 分析场景天然适合 LLM；需控制大文本场景的 Token 消耗              |
| **架构解耦性**   | ⭐⭐⭐⭐⭐ | 独立进程 + 独立端口 + 可选部署；不侵入核心问卷功能               |
| **安全可控性**   | ⭐⭐⭐⭐☆  | 内网通信 + API Key + 审计日志；需完善用户级鉴权                  |
| **运维复杂度**   | ⭐⭐⭐☆☆   | 新增 Python 运行时 + Conda 环境；监控/日志需独立配置             |
| **扩展弹性**     | ⭐⭐⭐⭐⭐ | 可选依赖分组设计；按需安装 pandas/chromadb 等重型依赖            |

### 9.2 总体结论

> **高度可行，建议推进。**

**核心论证**：

1. **基础设施已就绪 70%**：FastAPI 框架、Pydantic 模型、HTTP 客户端、配置中心、SSE 流式、健康检查全部可用，减少至少 3 天重复搭建工作量
2. **数据层完美对齐**：PostgreSQL 的 `Survey → SurveyComponent → Answer` 模型覆盖 13 种题型，q-server 的 `SurveyStatsService`（800 行生产代码）已完成逐题分布/聚合/抽样，Agent 只需消费摘要数据
3. **唯一阻塞项可控**：阶段 2（LLM 接入）是唯一阻塞环节，预计 1-2 天完成，属于纯工程实现，无架构障碍
4. **风险均有工程化对策**：大文本溢出（预处理降维）、LLM 幻觉（数据校验+置信度标注）、安全（内网隔离+审计）均已制定缓解方案

**MVP 实现路径**：从当前状态出发，完成阶段 2（LLM 接入）+ 阶段 3（分析 Agent MVP），约 5 个工作日即可交付"输入问题 → 输出分析结论"的核心闭环。

---

> **编制**：AI 会话工程分析
> **审核状态**：待人工审核
> **下一步**：参考 [implementation-checklist.md](./implementation-checklist.md) 进行实施
