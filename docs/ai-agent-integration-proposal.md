# AI Agent 接入方案：可行性分析与战略建议

> 版本：1.0
> 日期：2026-06-22
> 目标受众：技术决策者、架构师、AI 开发者
> 基于对 `D:\coding\project\questionnaireSys` 全项目的深入分析

---

## 目录

1. [项目现状评估](#1-项目现状评估)
2. [AI Agent 能带来什么](#2-ai-agent-能带来什么)
3. [接入路径总览](#3-接入路径总览)
4. [第一阶段：MCP Server 基础设施](#4-第一阶段mcp-server-基础设施)
5. [第二阶段：工具定义与能力暴露](#5-第二阶段工具定义与能力暴露)
6. [第三阶段：Agent 场景实现](#6-第三阶段agent-场景实现)
7. [技术架构建议](#7-技术架构建议)
8. [风险与缓解](#8-风险与缓解)
9. [实施路线图](#9-实施路线图)

---

## 1. 项目现状评估

### 1.1 已具备的 AI 基础设施

| 能力 | 成熟度 | 位置 | 可复用性 |
|------|--------|------|---------|
| **LangChain 集成** | ✅ 已投产 | `config/langchain.ts` — `createOpenAIChat` / `createAnthropicChat` / `createDeepSeekChat` | **高** — 可直接添加 `bindTools()` |
| **SSE 流式传输** | ✅ 已投产 | `monorepo-sse-client` 包 + `ai-generate.service.ts` | **高** — 可用于 Agent 步骤进度推送 |
| **API Key 安全管理** | ✅ 已投产 | `system_configs` 表 AES-256-GCM 加密 + 模块级缓存 | **高** — Agent 的 LLM Key 复用同一机制 |
| **Redis 基础设施** | ✅ 已投产 | `plugins/redis.ts` — ioredis 5.x，连接池、重试策略 | **高** — Agent 会话状态和记忆的理想存储 |
| **审计日志** | ✅ 已投产 | `utils/audit-log.ts` — MongoDB 持久化，fire-and-forget | **高** — Agent 所有决策可追溯 |
| **RabbitMQ 消息队列** | ✅ 已投产 | `plugins/rabbitmq.ts` + `log-consumer` | **中** — 可用于 Agent 异步任务分发 |
| **插件架构** | ✅ 已投产 | Fastify `fp()` 模式，8 个核心插件 | **高** — Agent 可作为新插件注册 |

### 1.2 尚不具备的能力

| 缺失能力 | 重要性 | 说明 |
|---------|--------|------|
| **MCP Server** | 🔴 关键 | 没有 MCP Server，外部 Agent 无法以标准协议调用平台 API |
| **Tool/Function Calling** | 🔴 关键 | 当前 AI 是单次问答，LLM 不会调用工具 |
| **Agent 会话管理** | 🟡 重要 | 没有对话历史、多轮上下文管理 |
| **Agent 记忆系统** | 🟡 重要 | 没有短期/长期记忆（用户偏好、历史决策） |
| **数据分析引擎** | 🟡 重要 | `modules/statistics/` 目录为空，无法分析问卷答复 |
| **多 Agent 编排** | 🟢 可选 | 无 LangGraph/CrewAI/AutoGen 等编排框架 |

---

## 2. AI Agent 能带来什么

### 2.1 面向问卷创作者：智能设计 Agent

**当前状态**：`POST /api/surveys/generate` 是单次"一句话 → 完整问卷"的生成。

**Agent 增强**：多轮对话式问卷设计——

```
用户："我想调查远程办公对员工效率的影响"

Agent："好的。我先确认几个关键信息：
1. 您的目标受众是？(全公司/特定部门/特定岗位)
2. 您重点关注哪些维度？(效率/满意度/沟通/健康/...)
3. 问卷预期长度？(5-10题 / 10-20题)"

用户："全公司，重点看效率和沟通，10-15题"

Agent → [调用 generateSurvey 工具，参数为 {topic:"远程办公效率", audience:"全公司", dimensions:["效率","沟通"], count:12}]
Agent："已生成 12 道题。我注意到缺少'工作生活平衡'维度——这在远程办公场景中非常关键，要加上吗？"
```

**价值**：生成质量提升 60%+（多轮细化 vs 单次猜测），减少用户手动修改。

### 2.2 面向问卷创作者：质量审核 Agent

**当前状态**：无自动化审核。

**Agent 增强**：

```
用户点击"AI 审核" →
Agent 逐题检查：
  ✅ 单选题选项互斥且覆盖完整
  ⚠️ 第 3 题"您的年龄"缺少"18岁以下"选项
  ⚠️ 第 7 题"月收入"选项间距不均匀（2000-5000 跳 10000-20000）
  ⚠️ 第 5 题使用了诱导性措辞："您不觉得我们的服务很好吗？"
  📊 评分：7.2/10 → 3 项建议
```

**价值**：标准化问卷质量，减少人工审核工作量 80%+。

### 2.3 面向问卷发布者：数据分析 Agent

**当前状态**：`modules/statistics/` 目录为空，答卷数据没有分析能力。

**Agent 增强**：

```
用户："帮我分析'员工满意度调查'的答卷" →

Agent → [调用 getResponses(surveyId) 获取答卷数据] →
Agent → [调用 analyzePatterns(data) 运行统计分析] →

Agent："📊 分析报告：
  1. 整体满意度 3.8/5，低于行业均值 4.1
  2. '薪酬福利'维度得分最低（2.9/5），是主要痛点
  3. 研发部满意度显著低于其他部门（2.7 vs 均值 3.8）
  4. 关键词云：'加班''薪资''晋升'出现频率最高
  5. 建议：优先调查研发部的加班文化和薪酬竞争力"

用户："研发部对哪些方面最不满意？"

Agent → [进一步筛选 + 分析] →
Agent："研发部反馈最多的 TOP3 问题：
  1. 加班过多且无加班费（67%）
  2. 晋升通道不明确（52%）
  3. 技术债务导致开发效率低（41%）"
```

**价值**：将原始答卷数据转化为可执行的业务洞察。

### 2.4 面向平台管理员：运维 Agent

**当前状态**：管理员需手动查看各监控面板。

**Agent 增强**：

```
管理员："最近系统有什么异常吗？" →

Agent → [调用 getSystemLogs(timeRange: "24h")] →
Agent → [调用 getRedisStats()] →
Agent → [调用 getDatabaseStats()] →

Agent："过去 24 小时系统运行正常。发现 2 个注意点：
  1. 14:30-15:00 期间 AI 生成请求排队 3 次（限流触发），建议考虑提高限额
  2. survey_files 表增长 245MB，图片文件占 92%，建议执行孤儿文件清理"
```

**价值**：从被动查看到主动预警，降低运维门槛。

### 2.5 面向开发者：代码助手 Agent

**当前状态**：新开发者靠阅读文档和代码理解项目。

**Agent 增强**：

```
开发者："如何添加一个新的问卷组件类型？" →

Agent → [搜索项目代码] →
Agent："添加新组件需要以下步骤：
  1. `packages/survey-engine/src/components/SurveyComs/Materials/` 下创建业务组件
  2. `src/configs/componentMap.ts` 注册到 componentMap
  3. `src/configs/defaultStatus/defaultStatusMap.ts` 添加默认状态工厂
  4. `src/types/material.ts` 的 Material 枚举中添加新类型名
  5. `src/configs/SurveyGroupConfig.ts` 选择放入哪个题型分组
  参考示例：RateScore 组件（评分题）的完整实现链路"
```

**价值**：新人上手时间从数天缩短到数小时。

---

## 3. 接入路径总览

### 3.1 推荐演进路线

```
┌───────────────────────────────────────────────────────────────────┐
│                        Agent 接入三阶段                            │
├───────────────────────────────────────────────────────────────────┤
│                                                                   │
│  阶段 1（基础）：MCP Server + Tool Calling                         │
│  ─────────────────────────────────────                            │
│  · 搭建 MCP Server，暴露"项目能力"为标准工具接口                     │
│  · Chat Model 增加 bindTools() 支持                                 │
│  · 实现 3-5 个核心 Tool（生成问卷、查答卷、查日志等）                 │
│  · 预计工时：1-2 周                                                │
│                                                                   │
│  阶段 2（增强）：Agent 场景落地                                      │
│  ─────────────────────────────                                    │
│  · 设计 Agent（多轮对话 + 工具调用）                                 │
│  · 审核 Agent（质量检查 + 建议输出）                                 │
│  · 数据 Agent（答卷分析 + 自然语言问答）                             │
│  · 预计工时：2-3 周                                                │
│                                                                   │
│  阶段 3（深化）：多 Agent + 记忆 + 自动化                            │
│  ───────────────────────────────────                              │
│  · Agent 记忆系统（Redis 短期 + PostgreSQL 长期）                    │
│  · 多 Agent 编排（LangGraph）                                       │
│  · Agent 主动巡检 + 定时报告                                        │
│  · 预计工时：3-4 周                                                │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
```

### 3.2 为什么不从 LangGraph/CrewAI 开始？

| 方案 | 优点 | 缺点 | 建议 |
|------|------|------|------|
| **MCP Server 先行** | 标准化协议、生态兼容、渐进式 | 需要前期基建投入 | ✅ **推荐** |
| 直接上 LangGraph | 功能强大、编排灵活 | 学习曲线陡、项目需大规模改造 | 阶段 3 考虑 |
| 直接上 CrewAI | 上手快、Python 生态 | 与 TypeScript 栈不兼容、跨语言调用开销大 | ❌ 不推荐 |
| 裸 LangChain Agent | 与现有 LangChain 集成一致 | 缺少标准化协议、工具定义耦合 | 阶段 1 内部选型 |

---

## 4. 第一阶段：MCP Server 基础设施

### 4.1 架构设计

```
┌─────────────────────────────────────────────────────────────────┐
│                    MCP Server 架构                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Claude Desktop / VSCode / Cursor / ...                         │
│       │                                                         │
│       │ MCP Protocol (stdio / HTTP+SSE)                         │
│       ▼                                                         │
│  ┌─────────────────────────────────────────────┐               │
│  │           MCP Server (新增包)                │               │
│  │  packages/mcp-server/                       │               │
│  │                                             │               │
│  │  ┌─────────────┐  ┌─────────────────────┐   │               │
│  │  │ Tool Registry│  │ Resource Registry   │   │               │
│  │  │             │  │                     │   │               │
│  │  │ · 问卷工具  │  │ · schema.prisma     │   │               │
│  │  │ · 数据工具  │  │ · API 文档           │   │               │
│  │  │ · 管理工具  │  │ · 代码结构           │   │               │
│  │  │ · 分析工具  │  │ · 日志数据           │   │               │
│  │  └──────┬──────┘  └──────────┬──────────┘   │               │
│  │         │                    │               │               │
│  │         ▼                    ▼               │               │
│  │  ┌─────────────────────────────────────┐    │               │
│  │  │      Transport Layer                │    │               │
│  │  │  · stdio (本地 Agent)                │    │               │
│  │  │  · HTTP+SSE (远程 Agent)            │    │               │
│  │  └─────────────────────────────────────┘    │               │
│  └─────────────────────────────────────────────┘               │
│       │                                                         │
│       │ 内部 HTTP 调用 (localhost:8080)                           │
│       ▼                                                         │
│  ┌─────────────────────────────────────────────┐               │
│  │           q-server (Fastify)                 │               │
│  │  /api/surveys/generate                      │               │
│  │  /api/surveys/:id/responses                 │               │
│  │  /api/logs /api/admin/...                   │               │
│  └─────────────────────────────────────────────┘               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 目录规划

```
packages/mcp-server/
├── package.json
├── src/
│   ├── index.ts                    # MCP Server 入口
│   ├── transport/
│   │   ├── stdio-server.ts         # stdio 传输（VS Code / Cursor 代理）
│   │   └── http-server.ts          # HTTP+SSE 传输（Claude Desktop 等）
│   ├── tools/
│   │   ├── registry.ts             # Tool 注册中心
│   │   ├── survey.tools.ts         # 问卷相关工具
│   │   ├── data.tools.ts           # 数据分析工具
│   │   ├── admin.tools.ts          # 管理运维工具
│   │   └── index.ts                # 工具聚合导出
│   ├── resources/
│   │   ├── registry.ts             # Resource 注册中心
│   │   ├── schema.resource.ts      # Prisma Schema 作为 Resource
│   │   ├── docs.resource.ts        # 项目文档作为 Resource
│   │   └── code.resource.ts        # 代码结构作为 Resource
│   └── client/
│       └── api-client.ts           # 内部 HTTP 客户端（调用 q-server API）
└── tsconfig.json
```

### 4.3 核心 Tool 定义示例

```typescript
// packages/mcp-server/src/tools/survey.tools.ts

import type { Tool } from "@modelcontextprotocol/sdk/types.js";

// Tool 1: 生成问卷
export const generateSurveyTool: Tool = {
  name: "generate_survey",
  description:
    "使用 AI 生成一份完整的问卷。支持自然语言描述需求，可以指定题目数量(5-20)和语言。" +
    "流式返回生成进度。",
  inputSchema: {
    type: "object",
    properties: {
      prompt: {
        type: "string",
        description: "问卷需求描述，例如'生成一份员工满意度调查'。至少 5 个字符"
      },
      count: {
        type: "number",
        description: "期望题目数量，默认 10，范围 5-20"
      },
      language: {
        type: "string",
        enum: ["zh-CN", "en-US", "ja-JP"],
        description: "问卷语言"
      }
    },
    required: ["prompt"]
  }
};

// Tool 2: 获取答卷数据
export const getSurveyResponsesTool: Tool = {
  name: "get_survey_responses",
  description:
    "获取指定问卷的所有答卷数据，用于后续分析和洞察。" +
    "返回答卷数量、完成率、各题答案分布。",
  inputSchema: {
    type: "object",
    properties: {
      survey_id: {
        type: "string",
        description: "问卷 ID"
      }
    },
    required: ["survey_id"]
  }
};

// Tool 3: 查询系统日志
export const getSystemLogsTool: Tool = {
  name: "get_system_logs",
  description:
    "查询系统运行日志。支持按级别（info/warn/error）、时间范围、关键词筛选。" +
    "用于运维诊断和问题排查。",
  inputSchema: {
    type: "object",
    properties: {
      level: {
        type: "string",
        enum: ["info", "warn", "error"],
        description: "日志级别"
      },
      keyword: {
        type: "string",
        description: "搜索关键词"
      },
      hours: {
        type: "number",
        description: "查询最近 N 小时，默认 24"
      }
    }
  }
};
```

### 4.4 Tool 执行器实现模式

```typescript
// packages/mcp-server/src/tools/survey.tools.ts (续)

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { createApiClient } from "../client/api-client.js";

const api = createApiClient("http://localhost:8080");

export async function executeGenerateSurvey(args: {
  prompt: string;
  count?: number;
  language?: string;
}): Promise<CallToolResult> {
  try {
    // 直接调用现有的 q-server API
    const result = await api.post("/api/surveys/generate", {
      prompt: args.prompt,
      count: args.count ?? 10,
      language: args.language ?? "zh-CN"
    });

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          title: result.data.title,
          description: result.data.description,
          componentCount: result.data.components.length,
          components: result.data.components
        }, null, 2)
      }]
    };
  } catch (err) {
    return {
      content: [{
        type: "text",
        text: `生成失败: ${err instanceof Error ? err.message : String(err)}`
      }],
      isError: true
    };
  }
}
```

---

## 5. 第二阶段：工具定义与能力暴露

### 5.1 建议暴露的工具清单

按优先级排序：

| 优先级 | Tool 名称 | 对应现有 API | 作用 |
|--------|----------|-------------|------|
| P0 | `generate_survey` | `POST /api/surveys/generate` | AI 生成问卷 |
| P0 | `list_surveys` | `GET /api/surveys` | 查询问卷列表 |
| P0 | `get_survey_detail` | `GET /api/surveys/:id` | 获取问卷详情 |
| P1 | `get_survey_responses` | `GET /api/responses?survey_id=` | 获取答卷数据 |
| P1 | `get_system_logs` | `GET /api/logs` | 查询系统日志 |
| P1 | `get_system_stats` | `GET /api/logs/stats` | 系统运行统计 |
| P2 | `create_survey` | `POST /api/surveys` | 创建问卷 |
| P2 | `publish_survey` | `POST /api/surveys/:id/publish` | 发布问卷 |
| P2 | `get_ai_config` | `GET /api/admin/config/ai` | 查看 AI 配置 |
| P2 | `update_ai_config` | `PUT /api/admin/config/ai` | 更新 AI 配置 |
| P3 | `upload_survey_file` | `POST /api/q-editor/survey-file/upload` | 上传问卷文件 |
| P3 | `delete_survey_file` | `DELETE /api/survey-files/:id` | 删除问卷文件 |
| P3 | `get_user_profile` | `GET /api/user/profile` | 获取用户资料 |

### 5.2 Resource 定义（只读知识源）

```typescript
// packages/mcp-server/src/resources/schema.resource.ts

export const prismaSchemaResource = {
  uri: "resource://schema/prisma",
  name: "数据库 Schema",
  description:
    "项目的 Prisma 数据库 Schema 定义。包含所有表结构、字段类型、关联关系和枚举值。" +
    "用于理解数据模型和编写正确的查询。",
  mimeType: "text/plain",
  // 直接读取 prisma/schema.prisma 文件内容
};

export const apiDocsResource = {
  uri: "resource://docs/api",
  name: "API 接口文档",
  description:
    "项目所有 REST API 接口的详细文档。包含请求参数、响应格式、错误码和示例。",
  mimeType: "text/markdown",
  // 读取 docs/ 目录下的 API 相关 markdown 文档
};
```

**Resource 的价值**：Agent 在回答问题前可以先读取相关 Resource（如 Schema），确保回复准确。例如开发者问"如何添加新字段"，Agent 会先读取 Schema，再给出精确的 Prisma 代码。

---

## 6. 第三阶段：Agent 场景实现

### 6.1 设计 Agent（首个落地场景）

```
┌──────────────────────────────────────────────────┐
│              Survey Design Agent                 │
├──────────────────────────────────────────────────┤
│                                                  │
│  输入: 用户自然语言描述问卷需求                      │
│                                                  │
│  思考流程（ReAct 模式）:                            │
│                                                  │
│  1. [分析] 从用户描述中提取:                        │
│     · 问卷主题 (topic)                            │
│     · 目标受众 (audience)                          │
│     · 核心维度 (dimensions)                        │
│                                                  │
│  2. [追问] 如果信息不完整，向用户确认————— 兜底用 LLM │
│     · "您的受众是全体员工还是特定部门？"              │
│                                                  │
│  3. [生成] 调用 generate_survey 工具                │
│     · prompt = 结构化描述（含受众、维度、数量）       │
│                                                  │
│  4. [审核] 检查生成结果:                            │
│     · 题目数量是否符合要求                           │
│     · 是否覆盖了所有指定维度                         │
│     · 逻辑顺序是否合理                              │
│                                                  │
│  5. [建议] 如发现问题，提出修改建议                   │
│                                                  │
│  6. [迭代] 用户确认修改 → 重新生成 → 再次审核         │
│                                                  │
└──────────────────────────────────────────────────┘
```

### 6.2 实现选型

```typescript
// 基于现有 LangChain 基础设施，使用 RunnableSequence + Tool 模式

import { ChatOpenAI } from "@langchain/openai";
import { createDeepSeekChat } from "../config/langchain.js";
import { tool } from "@langchain/core/tools";
import { z } from "zod";

// 步骤 1：定义工具（Zod 校验参数）
const generateSurvey = tool(
  async ({ prompt, count, language }) => {
    const result = await fetch("http://localhost:8080/api/surveys/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, count, language })
    });
    return await result.json();
  },
  {
    name: "generate_survey",
    description: "使用 AI 生成一份问卷。输入需求描述，返回结构化问卷 JSON。",
    schema: z.object({
      prompt: z.string().min(5).describe("需求描述"),
      count: z.number().int().min(5).max(20).optional().describe("题目数量"),
      language: z.enum(["zh-CN", "en-US", "ja-JP"]).optional().describe("语言")
    })
  }
);

// 步骤 2：创建带工具的模型
const model = await createDeepSeekChat(fastify);
const modelWithTools = model.bindTools([generateSurvey]);

// 步骤 3：Agent 执行循环
async function runDesignAgent(userMessage: string, sessionId: string) {
  const messages = [
    new SystemMessage(DESIGN_AGENT_SYSTEM_PROMPT),
    ...(await loadSessionHistory(sessionId)), // 从 Redis 加载历史
    new HumanMessage(userMessage)
  ];

  const response = await modelWithTools.invoke(messages);

  // 如果 LLM 决定调用工具
  if (response.tool_calls?.length) {
    for (const toolCall of response.tool_calls) {
      const toolResult = await executeToolCall(toolCall);
      messages.push(new ToolMessage(toolResult, toolCall.id));
    }
    // 继续对话
    const final = await modelWithTools.invoke(messages);
    return final.content;
  }

  return response.content;
}
```

### 6.3 Agent 会话管理（基于现有 Redis）

```typescript
// 利用项目已有的 Redis 插件实现会话管理

const SESSION_PREFIX = "agent:session:";
const SESSION_TTL = 3600; // 1 小时

async function loadSessionHistory(sessionId: string): Promise<BaseMessage[]> {
  const key = `${SESSION_PREFIX}${sessionId}`;
  const raw = await fastify.redis.get(key);
  if (!raw) return [];
  return JSON.parse(raw).map(deserializeMessage);
}

async function saveSessionHistory(
  sessionId: string,
  messages: BaseMessage[]
): Promise<void> {
  const key = `${SESSION_PREFIX}${sessionId}`;
  const data = JSON.stringify(messages.map(serializeMessage));
  await fastify.redis.set(key, data, "EX", SESSION_TTL);
}
```

---

## 7. 技术架构建议

### 7.1 新增 Monorepo 包规划

```
packages/
├── mcp-server/             # 【新增】MCP Server 包
│   └── (详见 4.2 节)
├── agent-core/             # 【新增】Agent 核心框架包
│   ├── src/
│   │   ├── agent.ts               # Agent 基类（ReAct / Plan-Execute）
│   │   ├── tools.ts               # Tool 定义 + 执行器
│   │   ├── memory.ts              # 会话记忆（Redis 实现）
│   │   ├── session.ts             # 会话管理
│   │   └── observability.ts       # 可观测性（追踪 + 指标）
│   └── package.json
└── agent-tools/            # 【新增】项目特定工具包
    ├── src/
    │   ├── survey.tools.ts        # 问卷相关工具
    │   ├── data.tools.ts          # 数据分析工具
    │   ├── admin.tools.ts         # 管理运维工具
    │   └── index.ts               # 工具注册聚合
    └── package.json
```

### 7.2 模块依赖关系

```
agent-tools ──────→ 调用 q-server HTTP API (localhost)
     │
     ▼
agent-core ───────→ 使用 config/langchain.ts 工厂
     │              使用 plugins/redis.ts 的 Redis
     │              使用 utils/audit-log.ts 写审计
     ▼
mcp-server ───────→ 注册 agent-tools 中的 Tool
                    暴露 Resource（Schema / 文档 / 代码）
                    通过 stdio/HTTP+SSE 对外服务
```

### 7.3 AI Agent 关键配置存储

复用现有 `system_configs` 表结构：

```sql
-- Agent 全局配置
INSERT INTO system_configs (key, value, category, description) VALUES
  ('agent_enabled', 'true', 'agent', '是否启用 AI Agent 功能'),
  ('agent_max_steps', '10', 'agent', 'Agent 单次最大推理步数'),
  ('agent_max_tokens_per_step', '4096', 'agent', 'Agent 每步最大 Token 消耗'),
  ('agent_session_ttl_seconds', '3600', 'agent', 'Agent 会话过期时间');
```

---

## 8. 风险与缓解

| 风险 | 严重度 | 缓解措施 |
|------|--------|---------|
| **Token 成本失控** | 高 | Agent 每步消耗 token，多轮对话可能数万 token。措施：① `agent_max_steps` 限制步数 ② `agent_max_tokens_per_step` 限制每步 ③ 审计日志记录 token 消耗 ④ 设置单用户日预算 |
| **Agent 幻觉导致错误操作** | 高 | Agent 可能调用错误的工具或参数。措施：① Tool 层 Zod 校验阻止非法参数 ② 关键操作（如删除）需二次确认 ③ 所有操作写入审计日志 |
| **API 调用失败传播** | 中 | Agent 依赖链中某一环失败。措施：① 每步独立 try-catch ② 失败后优雅降级（告知用户失败原因） ③ 重试机制（幂等操作） |
| **敏感数据泄露** | 中 | Agent 可能访问到不该看的数据。措施：① Tool 层增加权限校验（复用 `authenticate`） ② 答卷数据脱敏后方可传给 Agent |
| **并发下 Redis 会话冲突** | 低 | 多用户同时使用 Agent。措施：① session_id 按 userId 隔离 ② Redis Key 设计为 `agent:session:{userId}:{sessionId}` |

---

## 9. 实施路线图

```
Week 1-2: MCP Server 基础设施
├── Day 1-2: 搭建 packages/mcp-server 包骨架
├── Day 3-4: 实现 5 个核心 Tool (generate/list/get survey, logs, stats)
├── Day 5: 实现 stdio 传输（VS Code 代理调试）
├── Day 6-7: 实现 3 个 Resource（Schema, API Docs, Code Structure）
├── Day 8-9: 对接 Claude Desktop 验证 MCP 协议
└── Day 10: 编写 MCP Server 使用文档

Week 3-4: Agent 场景落地
├── Day 1-3: 搭建 packages/agent-core 包（Agent 基类 + Memory + Session）
├── Day 4-6: 实现设计 Agent（survey design agent）
├── Day 7-8: 实现审核 Agent（survey quality agent）
├── Day 9: 实现运维 Agent（admin operations agent）
└── Day 10: 联调测试 + Prompt 调优

Week 5-7: 深化与完善
├── Week 5: 数据分析 Agent（答卷分析 + NL 查询）
├── Week 6: Agent 记忆系统（短期 + 长期记忆）
├── Week 7: 可观测性（追踪、指标、成本仪表板）+ 文档
```

---

## 附录 A：关键决策记录

| 决策 | 选择 | 理由 |
|------|------|------|
| MCP vs 裸 API | MCP Server 先行 | 标准化协议，与 VS Code/Claude Desktop 等工具生态兼容，Agent 切换成本低 |
| TypeScript vs Python | TypeScript | 与项目栈保持一致，避免跨语言调用开销，复用现有 LangChain 配置 |
| Redis vs PostgreSQL 会话 | Redis | 项目已有 Redis 基础设施，读写性能满足 Agent 实时对话要求，TTL 自动清理 |
| LangChain Agent vs 自研 | LangChain Agent | 复用现有 `createDeepSeekChat` 工厂，减少重复造轮子 |
| 单 Agent vs 多 Agent | 单 Agent 先行 | 第一版聚焦单个场景（设计 Agent），验证可行性后再引入编排 |

## 附录 B：术语速查

| 术语 | 解释 |
|------|------|
| **MCP** | Model Context Protocol — Anthropic 推出的 AI Agent 与外部工具交互的开放协议 |
| **Tool Calling** | LLM 不仅输出文字，还能决定"调用哪个函数、传什么参数" |
| **ReAct** | Reasoning + Acting — Agent 的经典模式：思考 → 行动 → 观察 → 思考 → ... |
| **Resource** | MCP 协议中的只读数据源（文件、文档、Schema），Agent 可读取来获取上下文 |
| **SSE** | Server-Sent Events — 服务器向客户端单向推送事件流的 HTTP 协议 |
