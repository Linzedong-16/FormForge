# AI 一键生成问卷 — 技术对接方案

> 版本：1.0
> 日期：2026-06-21
> 范围：`app/q-server` + `app/q-editor`
> AI 服务：DeepSeek API（via LangChain）

---

## 目录

1. [需求概述](#1-需求概述)
2. [整体数据流](#2-整体数据流)
3. [DeepSeek API 对接](#3-deepseek-api-对接)
4. [后端接口设计](#4-后端接口设计)
5. [Prompt 模板设计](#5-prompt-模板设计)
6. [前端改造方案](#6-前端改造方案)
7. [后端架构](#7-后端架构)
8. [关键设计决策](#8-关键设计决策)
9. [Prompt Engineering 要点](#9-prompt-engineering-要点)
10. [实施步骤](#10-实施步骤)
11. [费用估算](#11-费用估算)
12. [API Key 安全存储方案](#12-api-key-安全存储方案)

---

## 1. 需求概述

在问卷编辑器内提供"AI 一键生成问卷"能力：用户输入自然语言描述（如"生成一份员工满意度调查问卷"），系统调用 DeepSeek 大模型生成结构化的问卷 JSON，经前端模板合并后直接渲染到编辑器画布中。

### 1.1 核心能力

- 自然语言 → 结构化问卷 JSON
- SSE 流式响应，前端渐进渲染
- 生成结果与现有 `defaultStatusMap` 模板合并，补全编辑属性
- 支持中途取消生成

### 1.2 已有基础设施

| 项目                 | 状态                         | 位置                                                         |
| -------------------- | ---------------------------- | ------------------------------------------------------------ |
| LangChain 框架       | 已接入（OpenAI / Anthropic） | `app/q-server/src/config/langchain.ts`                       |
| AI-GenPanel 占位组件 | 已有空壳                     | `app/q-editor/src/extension/components/AI-GenPanel.vue`      |
| 扩展 API 目录        | 已有空文件                   | `app/q-editor/src/extension/apis/index.ts`                   |
| 组件默认状态映射     | 完整（16 种题型）            | `app/q-editor/src/configs/defaultStatus/defaultStatusMap.ts` |
| 序列化/反序列化工具  | 完整                         | `app/q-editor/src/api/modules/survey/index.ts`               |

---

## 2. 整体数据流

```
┌─ 前端 AI-GenPanel ───────────────────────────────────────────────────┐
│                                                                       │
│  1. 用户输入需求（自然语言）                                            │
│     例: "帮我生成一份客户满意度调查，涵盖产品质量、                    │
│           客服态度、物流速度、价格合理性"                               │
│                                                                       │
│  2. 发送 POST /api/surveys/generate (SSE)                             │
│     body: { prompt: "...", count: 10 }                                │
│                                                                       │
│      ↓                                                                │
│                                                                       │
│  ┌─ q-server 后端 ───────────────────────────────────────────────┐    │
│  │                                                                │    │
│  │  3. 构建 System Prompt（组件类型目录 + JSON Schema + 示例）      │    │
│  │  4. 调用 DeepSeek API (via LangChain ChatOpenAI)               │    │
│  │  5. 流式返回 JSON 片段 → SSE → 前端渐进渲染                     │    │
│  │  6. 解析最终 JSON → Zod 校验结构完整性                           │    │
│  │                                                                │    │
│  └────────────────────────────────────────────────────────────────┘    │
│     SSE stream                                                        │
│      ↓                                                                │
│  7. 前端接收 JSON → mergeWithDefault() 补全 Status 模板               │
│  8. EventBus.emit("ai:insert", components) → 编辑器画布渲染            │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
```

---

## 3. DeepSeek API 对接

### 3.1 API 兼容性

DeepSeek API 完全兼容 OpenAI Chat Completions 格式，可直接使用 LangChain 的 `ChatOpenAI` 类对接。

### 3.2 langchain.ts 新增配置

在现有文件 [langchain.ts](file:///d:/coding/project/questionnaireSys/app/q-server/src/config/langchain.ts) 中新增 `createDeepSeekChat` 工厂函数。API Key 不再硬编码，改为运行时从 `system_configs` 表读取解密后的值（详见[第 12 章](#12-api-key-安全存储方案)）。

| 配置项           | 值                             | 来源                         |
| ---------------- | ------------------------------ | ---------------------------- |
| `baseURL`        | `https://api.deepseek.com/v1`  | 常量                         |
| `apiKey`         | 运行时从 `system_configs` 读取 | DB（AES-256-GCM 加密存储）   |
| 默认模型         | `deepseek-chat`                | DB `ai_model` 字段，兜底常量 |
| 默认 temperature | `0.7`                          | 常量                         |

### 3.3 模型选择

| 模型            | 特点                   | 适用场景                     | 推荐     |
| --------------- | ---------------------- | ---------------------------- | -------- |
| `deepseek-chat` | 标准对话模型，高性价比 | 问卷生成（结构化 JSON 输出） | **推荐** |

问卷生成不需要深度推理，选择 `deepseek-chat` 即可满足需求。

### 3.4 环境变量

API Key 通过后台管理系统上传至 `system_configs` 表（AES-256-GCM 加密），无需环境变量注入。

部署唯一需确保的环境变量：`CRYPTO_ENCRYPTION_KEY`（64 位 hex 字符串，用于 AES-256-GCM 加解密，已在 SMTP 密码加密时配置）。

---

## 4. 后端接口设计

### 4.1 新增路由

**`POST /api/surveys/generate`**

#### 请求体

```typescript
{
  prompt: string;       // 用户自然语言描述，必填
  count?: number;       // 期望题目数，可选，默认 10，范围 5-20
  language?: string;    // 问卷语言，可选，默认 "zh-CN"
}
```

#### 响应格式（SSE 流式）

```
Content-Type: text/event-stream

event: token
data: {"text":"{"}

event: token
data: {"text":"\"title\":"}

... 逐 token 推送 ...

event: component
data: {"index":0,"type":"single-select","title":"您的性别是？"}

event: done
data: {"title":"...","description":"...","components":[...]}

event: error
data: {"message":"AI 服务暂时不可用，请稍后重试"}
```

#### SSE 事件类型

| 事件        | 说明                        | data 内容                                |
| ----------- | --------------------------- | ---------------------------------------- |
| `token`     | 原始 token 片段（逐字推送） | `{"text":"..."}`                         |
| `component` | 解析出一完整组件时推送      | `{"index":0,"type":"...","title":"..."}` |
| `done`      | 生成完成                    | 完整的问卷 JSON                          |
| `error`     | 生成失败                    | `{"message":"..."}`                      |

#### 超时与限流

| 配置项     | 值                          |
| ---------- | --------------------------- |
| 请求超时   | 60 秒                       |
| 单用户限流 | 3 次/分钟                   |
| 限流 Key   | `rate:ai_generate:{userId}` |

### 4.2 校验规则（Zod Schema）

```typescript
const generateSurveySchema = z.object({
  prompt: z.string().min(5, "需求描述至少5个字符").max(2000, "需求描述最多2000个字符"),
  count: z.number().int().min(5).max(20).optional(),
  language: z.enum(["zh-CN", "en-US", "ja-JP"]).optional()
});
```

### 4.3 容错策略

| 异常                                         | 处理方式                                                         |
| -------------------------------------------- | ---------------------------------------------------------------- |
| AI 返回非 JSON（如包裹在 markdown 代码块中） | 尝试用正则提取 JSON，失败则重试 1 次（附加"只输出纯 JSON"指令）  |
| JSON 结构部分无效                            | 过滤无效组件，返回有效部分 + 警告信息                            |
| DeepSeek API 超时/不可用                     | 返回 `event: error`，提示"AI 服务暂时不可用"                     |
| 用户中途取消                                 | 前端 `AbortController.abort()` → 后端捕获 `aborted` 信号停止流式 |

---

## 5. Prompt 模板设计

System Prompt 是方案的核心，需包含四部分：**角色定义 + 组件类型目录 + JSON Schema 约束 + 设计规范 + Few-shot 示例**。

### 5.1 角色定义

```
你是一个专业的问卷设计助手。你擅长根据用户的需求描述，生成结构化的问卷 JSON。
你的输出将被直接用于一个低代码问卷编辑系统，因此必须严格遵循指定的数据格式。
```

### 5.2 组件类型目录

```
【可用题型】

■ 选择题型
  - single-select：单选题（options.status 为字符串数组）
  - multi-select：多选题（options.status 为字符串数组）
  - single-pic-select：图片单选题（options.status 为 {picTitle, picDesc, value} 数组）
  - multi-pic-select：图片多选题（options.status 为 {picTitle, picDesc, value} 数组）
  - option-select：下拉选择（options.status 为字符串数组）

■ 高级题型
  - rate-score：评分题（options.status 为字符串数组，如["1分","2分","3分","4分","5分"]）
  - date-time：日期时间选择（无 options）
  - slider：滑块题（options.status 为 [最小值, 最大值, 步长]，如[0,100,1]）
  - transfer：排序题（options.status 为字符串数组）
  - cascader：多级联动（options.status 为树形选项数组）

■ 输入题型
  - text-input：文本输入（无需 options 字段）
  - text-note：说明文字/分节标题（无需 options 字段，仅展示提示语）

■ 个人信息（18种，使用系统内置选项）
  - personal-info-name / personal-info-gender / personal-info-age
  - personal-info-education / personal-info-career / personal-info-tel
  - personal-info-email / personal-info-address / personal-info-id
  - personal-info-wechat / personal-info-qq
  - personal-info-collage / personal-info-major
  - personal-info-industry / personal-info-company / personal-info-position

  个人信息组件无需设置 options，系统已有标准选项。
  仅在确需收集特定个人信息时使用，不要滥用。
```

### 5.3 JSON Schema 约束

````
【输出格式】

你必须输出一个纯 JSON 对象，结构如下：

{
  "title": "问卷标题（字符串）",
  "description": "问卷说明/前言（字符串，可为空）",
  "components": [
    {
      "type": "组件类型（必须为上述可用类型之一）",
      "config": {
        "title": { "status": "题目标题文字", "isShow": true },
        "desc": { "status": "题目补充说明", "isShow": true },
        "options": {
          "status": ["选项1", "选项2", "选项3"],
          "isShow": true
        }
      }
    }
  ]
}

【字段说明】
- title.status：必填，题目的标题文字
- desc.status：可选（可为空字符串），题目的补充说明
- title.isShow / desc.isShow：boolean，是否显示该字段，标题通常为 true
- options.status：选择题必填，字符串数组或对象数组
  - 普通选择题："选项A", "选项B" ...]
  - 图片选择题：[{picTitle:"图片标题", picDesc:"图片描述", value:""}, ...]
  - slider：[最小值, 最大值, 步长]
- options.isShow：boolean，options 面板是否显示，通常为 true
- text-input 和 text-note 不需要 options 字段
- 个人信息组件不需要 options 字段

【输出规则】
1. 只输出纯 JSON，不要包裹在 ```json 代码块中，不要添加任何解释文字
2. 每个组件 type 必须是可用题型中列出的有效类型
3. 选择题 options.status 至少 2 个选项，最多 10 个选项
4. 每个选项用简洁中文表达，2-8 个字为宜
5. 组件按问卷逻辑顺序排列（先易后难、主题聚焦）
6. 题目数量严格按照用户要求（默认 8-12 道）
7. 语言与用户输入保持一致
````

### 5.4 问卷设计规范

```
【设计规范】
- 先易后难：简单、不敏感的人口统计问题放在前面
- 主题聚焦：相同主题的问题放在一起，形成自然分组
- 选项完整：选择题选项应覆盖常见情况，必要时包含"其他"
- 避免诱导：选项措辞中立，不暗示"正确"答案
- 逻辑递进：从事实到态度，从通用到具体
- 适当使用 text-note：在主题切换处插入说明组件作为分节标题
- 题型多样：根据问题性质选择最合适的题型
  · 单选题：互斥选项（性别、年龄段、是否题）
  · 多选题：非互斥选项（使用的功能、关注的问题）
  · 评分题：满意度、重要程度等需要量化的题
  · 文本输入：需要自由发挥的开放性问题
- 不要在一份问卷中使用所有题型，按需选择

【禁止事项】
- 不要生成真实姓名、电话号码等示例数据
- 不要包含政治敏感、违法、歧视性内容
- 不要使用 rating 或 scale 等不存在的组件类型
```

### 5.5 Few-shot 示例

**示例 1：员工满意度调查**

```json
{
  "title": "2026年度员工满意度调查",
  "description": "感谢您参与本次调查，您的反馈将帮助我们改进工作环境和管理方式。本问卷匿名填写，请如实作答。",
  "components": [
    {
      "type": "single-select",
      "config": {
        "title": { "status": "您所在的部门是？", "isShow": true },
        "desc": { "status": "", "isShow": false },
        "options": { "status": ["研发部", "市场部", "销售部", "人力资源部", "财务部", "其他"], "isShow": true }
      }
    },
    {
      "type": "single-select",
      "config": {
        "title": { "status": "您在本公司的工作年限？", "isShow": true },
        "desc": { "status": "", "isShow": false },
        "options": { "status": ["1年以内", "1-3年", "3-5年", "5-10年", "10年以上"], "isShow": true }
      }
    },
    {
      "type": "text-note",
      "config": {
        "title": { "status": "一、工作环境与氛围", "isShow": true },
        "desc": { "status": "", "isShow": false }
      }
    },
    {
      "type": "rate-score",
      "config": {
        "title": { "status": "您对目前的工作环境满意吗？", "isShow": true },
        "desc": { "status": "1分非常不满意，5分非常满意", "isShow": true },
        "options": { "status": ["1分", "2分", "3分", "4分", "5分"], "isShow": true }
      }
    },
    {
      "type": "single-select",
      "config": {
        "title": { "status": "您与同事之间的协作是否顺畅？", "isShow": true },
        "desc": { "status": "", "isShow": false },
        "options": { "status": ["非常顺畅", "比较顺畅", "一般", "不太顺畅", "很不顺畅"], "isShow": true }
      }
    },
    {
      "type": "text-note",
      "config": {
        "title": { "status": "二、薪酬与福利", "isShow": true },
        "desc": { "status": "", "isShow": false }
      }
    },
    {
      "type": "rate-score",
      "config": {
        "title": { "status": "您对目前的薪酬水平满意吗？", "isShow": true },
        "desc": { "status": "1分非常不满意，5分非常满意", "isShow": true },
        "options": { "status": ["1分", "2分", "3分", "4分", "5分"], "isShow": true }
      }
    },
    {
      "type": "multi-select",
      "config": {
        "title": { "status": "您最希望公司改善哪些福利？", "isShow": true },
        "desc": { "status": "可多选", "isShow": true },
        "options": {
          "status": ["五险一金", "带薪年假", "餐补交通补", "培训机会", "团建活动", "弹性工作制", "其他"],
          "isShow": true
        }
      }
    },
    {
      "type": "text-note",
      "config": {
        "title": { "status": "三、发展与建议", "isShow": true },
        "desc": { "status": "", "isShow": false }
      }
    },
    {
      "type": "single-select",
      "config": {
        "title": { "status": "您认为公司提供的发展机会如何？", "isShow": true },
        "desc": { "status": "", "isShow": false },
        "options": { "status": ["机会很多", "有一定机会", "机会一般", "机会较少", "几乎没有机会"], "isShow": true }
      }
    },
    {
      "type": "text-input",
      "config": {
        "title": { "status": "您对公司有什么建议或意见？", "isShow": true },
        "desc": { "status": "请畅所欲言，您的每一条建议都会被认真对待", "isShow": true }
      }
    }
  ]
}
```

**示例 2：产品反馈调查**

```json
{
  "title": "新产品使用体验反馈",
  "description": "感谢您使用我们的新产品！请花几分钟分享您的使用体验。",
  "components": [
    {
      "type": "single-select",
      "config": {
        "title": { "status": "您使用本产品多长时间了？", "isShow": true },
        "desc": { "status": "", "isShow": false },
        "options": { "status": ["不到1周", "1-4周", "1-3个月", "3个月以上"], "isShow": true }
      }
    },
    {
      "type": "multi-select",
      "config": {
        "title": { "status": "您最常使用哪些功能？", "isShow": true },
        "desc": { "status": "可多选", "isShow": true },
        "options": { "status": ["功能A", "功能B", "功能C", "功能D", "功能E"], "isShow": true }
      }
    },
    {
      "type": "rate-score",
      "config": {
        "title": { "status": "整体而言，您给本产品打几分？", "isShow": true },
        "desc": { "status": "1分最低，5分最高", "isShow": true },
        "options": { "status": ["1分", "2分", "3分", "4分", "5分"], "isShow": true }
      }
    },
    {
      "type": "single-select",
      "config": {
        "title": { "status": "您会将本产品推荐给朋友吗？", "isShow": true },
        "desc": { "status": "", "isShow": false },
        "options": { "status": ["一定会", "可能会", "不确定", "可能不会", "一定不会"], "isShow": true }
      }
    },
    {
      "type": "text-input",
      "config": {
        "title": { "status": "您认为产品最需要改进的地方是？", "isShow": true },
        "desc": { "status": "请具体说明", "isShow": true }
      }
    }
  ]
}
```

---

## 6. 前端改造方案

### 6.1 AI-GenPanel 组件

文件位置：[AI-GenPanel.vue](file:///d:/coding/project/questionnaireSys/app/q-editor/src/extension/components/AI-GenPanel.vue)

#### 状态设计

| 状态                | 类型                      | 说明                               |
| ------------------- | ------------------------- | ---------------------------------- |
| `prompt`            | `string`                  | 用户输入的需求描述                 |
| `generating`        | `boolean`                 | 是否正在生成中                     |
| `partialTitle`      | `string`                  | 已生成的问卷标题（渐进展示）       |
| `partialComponents` | `Status[]`                | 已解析完成的组件（渐进渲染）       |
| `partialText`       | `string`                  | 当前累积的原始文本（用于展示进度） |
| `error`             | `string \| null`          | 错误信息                           |
| `abortController`   | `AbortController \| null` | 取消控制器                         |

#### UI 布局

```
┌─ AI 生成问卷 ────────────────────────────┐
│                                           │
│  ┌─────────────────────────────────────┐  │
│  │ 描述你想要的问卷内容...              │  │
│  │                                     │  │
│  │ 例：生成一份客户满意度调查，涵盖      │  │
│  │ 产品质量、服务态度、物流速度          │  │
│  └─────────────────────────────────────┘  │
│                                           │
│  期望题目数：[▼ 10题]                     │
│                                           │
│  [ 🤖 一键生成 ]   [ 取消 ]               │
│                                           │
│  ── 生成进度 ─────────────────────────    │
│  已生成 5 道题...                         │
│  ═══════════════░░░░  50%                │
│                                           │
│  [ 插入到编辑器 ] (生成完成后可用)         │
│                                           │
└───────────────────────────────────────────┘
```

#### 核心流程

```
1. 用户输入 prompt → 点击"一键生成"
2. 调用 SSE 接口：
   const eventSource = fetchEventSource("/api/surveys/generate", {
     method: "POST",
     body: JSON.stringify({ prompt, count }),
     signal: abortController.signal,
     onmessage(msg) {
       switch(msg.event) {
         case "token" → partialText += data.text
         case "component" → partialComponents.push(component)
         case "done" → complete(data)
         case "error" → showError(data.message)
       }
     }
   });
3. 生成完成后，用户点击"插入到编辑器"
4. 调用 mergeWithDefault() 补全 Status 模板
5. EventBus.emit("ai:insert", mergedComponents)
```

### 6.2 模板合并策略

AI 返回的组件只含 `type` + 精简 `config`（无 `editCom`/`id`/`name`/`position`/`size` 等编辑属性）。前端从 `defaultStatusMap` 获取完整模板，深合并 AI 内容：

```typescript
// app/q-editor/src/extension/apis/index.ts

import { defaultStatusMap } from "@/configs/defaultStatus/defaultStatusMap";
import { v4 as uuidv4 } from "uuid";
import type { Status } from "@/types";

interface AIGeneratedComponent {
  type: string;
  config: Record<string, unknown>;
}

interface AIGeneratedResult {
  title: string;
  description: string;
  components: AIGeneratedComponent[];
}

/**
 * 将 AI 生成的精简 JSON 合并为完整的 Status[]
 * AI 只输出 type + config（title/desc/options），
 * 本函数从 defaultStatusMap 获取该类型的完整 Status 模板并深度合并。
 */
function mergeWithDefault(result: AIGeneratedResult): {
  title: string;
  description: string;
  components: Status[];
} {
  const mergedComponents = result.components
    .map(comp => {
      const template = defaultStatusMap[comp.type]?.();
      if (!template) {
        console.warn(`未知组件类型: ${comp.type}，跳过`);
        return null;
      }

      // 深合并：AI 的 config 覆盖模板的 status
      const mergedStatus = deepMerge(template.status, comp.config);

      return {
        ...template,
        id: uuidv4(),
        status: mergedStatus
      } as Status;
    })
    .filter(Boolean) as Status[];

  return {
    title: result.title,
    description: result.description,
    components: mergedComponents
  };
}
```

### 6.3 与编辑器交互

通过 EventBus 发送生成结果：

```
AI-GenPanel → EventBus.emit("ai:insert", { title, components })

EditorView/index.vue:
  onMounted → EventBus.on("ai:insert", (data) => {
    // 第一个 text-note 组件同步标题
    store.setTextStatus(store.coms[0].status.title, data.title);
    // 追加生成的所有组件
    data.components.forEach(c => store.addCom(c));
    // 滚动到底部
    EventBus.emit("scrollToBottom");
    ElMessage.success(`已插入 ${data.components.length} 道题目`);
  });
```

---

## 7. 后端架构

### 7.1 新增文件清单

```
app/q-server/src/modules/survey/
├── survey.routes.ts          [修改] 新增 POST /surveys/generate 路由
├── survey.service.ts         [修改] 新增 generate() 方法
├── survey.schemas.ts         [修改] 新增 generateSurveySchema
├── ai/
│   ├── prompt-templates.ts   [新增] System Prompt 模板
│   └── schema-validator.ts   [新增] AI 输出 JSON 校验
```

### 7.2 核心类与方法

**`SurveyService.generate()`**

```
入参：
  userId: bigint
  prompt: string
  options: { count?: number; language?: string }

出参：
  AsyncGenerator<SSEEvent>

流程：
  1. 限流检查（Redis：rate:ai_generate:{userId}）
  2. 构建 messages：
     [
       { role: "system", content: buildSystemPrompt(options) },
       { role: "user",   content: prompt }
     ]
  3. 调用 createDeepSeekChat().stream(messages)
  4. 遍历 stream chunks：
     a. 每个 chunk → yield { event: "token", data: { text } }
     b. 累积完整响应文本
     c. 尝试增量解析 JSON，成功则 yield { event: "component", data }
  5. 收集完整后 → Zod 校验
  6. 校验通过 → yield { event: "done", data: validatedResult }
  7. 校验失败 → 过滤无效组件 + yield { event: "done", data: partial }
  8. finally → 审计日志
```

**`buildSystemPrompt()`**

来自 `ai/prompt-templates.ts`，根据传入的 `count` / `language` 参数化控制 Prompt 中的题目数量约束和语言要求。

**`validateAIResponse()`**

来自 `ai/schema-validator.ts`：

1. 尝试 `JSON.parse()` → 若失败则尝试正则提取
2. Zod schema 校验顶层结构（title/description/components）
3. 逐组件校验 type 是否为有效类型
4. 过滤无效组件，返回 { valid: Component[], warnings: string[] }

### 7.3 langchain.ts 新增

```typescript
export const createDeepSeekChat = (options?: ChatModelOptions) =>
  new ChatOpenAI({
    model: options?.model ?? "deepseek-chat",
    temperature: options?.temperature ?? 0.7,
    apiKey: process.env.DEEPSEEK_API_KEY,
    configuration: {
      baseURL: "https://api.deepseek.com/v1"
    }
  });
```

### 7.4 路由注册

```typescript
// survey.routes.ts
fastify.post(
  "/surveys/generate",
  {
    config: {
      rateLimit: { max: 3, timeWindow: "1 minute" }
    }
  },
  async (request, reply) => {
    const body = generateSurveySchema.parse(request.body);

    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive"
    });

    try {
      for await (const event of surveyService.generate(request.user.userId, body)) {
        reply.raw.write(`event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`);
      }
    } catch (err) {
      reply.raw.write(`event: error\ndata: ${JSON.stringify({ message: "生成失败" })}\n\n`);
    }
    reply.raw.end();
  }
);
```

---

## 8. 关键设计决策

| 决策点       | 选择                          | 理由                                                                                   |
| ------------ | ----------------------------- | -------------------------------------------------------------------------------------- |
| AI 输出格式  | 精简 JSON（仅 type + config） | 前端有完整 `defaultStatusMap`，AI 无需知道 `editCom`/`id`/`position`/`name` 等内部字段 |
| 流式方式     | SSE（Server-Sent Events）     | 比 WebSocket 轻量，单向推送足够                                                        |
| 模板合并位置 | 前端 `deepMerge`              | 保持前后端职责清晰，后端只负责调用 AI                                                  |
| 模型         | `deepseek-chat`               | 性价比最优，问卷生成不需要深度推理                                                     |
| 限流         | 服务端 3次/分钟/用户          | 保护 API 费用，避免滥用                                                                |
| 缓存策略     | 不缓存 AI 结果                | 每次生成结果不同，无缓存意义                                                           |
| 审计         | 写 `audit_logs`               | 记录 token 用量、生成题目数、耗时                                                      |

---

## 9. Prompt Engineering 要点

| 要点                   | 说明                                                           | 优先级                       |
| ---------------------- | -------------------------------------------------------------- | ---------------------------- |
| **强调 JSON 纯度**     | System Prompt 中反复强调"只输出纯 JSON，不要包裹在代码块中"    | **最高** — DeepSeek 常见问题 |
| **Few-shot 示例**      | 提供 2 个完整的问卷 JSON 示例，显著提升输出质量                | **高**                       |
| **字段最小化**         | 只让 AI 输出必要字段（type/config），减少 token 消耗和出错概率 | **高**                       |
| **中文 System Prompt** | 用中文编写 Prompt，减少语言切换带来的格式不稳定                | **中**                       |
| **选项数量约束**       | 明确"每个选择题 3-6 个选项"，防止极端情况                      | **中**                       |
| **个人信息特殊处理**   | 明确告知个人信息组件已有固定选项，不要自定义                   | **中**                       |
| **禁止项明确**         | 列出禁止生成的题型/内容，防止 AI 幻觉                          | **中**                       |
| **text-note 引导**     | 鼓励 AI 在主题切换处插入 `text-note` 作为分节标题              | **低**                       |

---

## 10. 实施步骤

### P0 — 后端核心 + 密钥管理（预计 4-5h）

| 步骤 | 内容                                                          | 涉及文件                                    |
| ---- | ------------------------------------------------------------- | ------------------------------------------- |
| 0a   | 新增 `updateAIConfigSchema` Zod Schema                        | `user.schemas.ts`                           |
| 0b   | `AdminService` 新增 `updateAIConfig()` + `getConfig()` 扩展   | `admin.service.ts`                          |
| 0c   | 新增 `PUT /admin/config/ai` 路由                              | `admin.routes.ts`                           |
| 0d   | `langchain.ts` 新增 `getDeepSeekApiKey()` **异步**读取 + 解密 | `src/config/langchain.ts`                   |
| 1    | 编写 System Prompt 模板 + Few-shot 示例                       | `src/modules/survey/ai/prompt-templates.ts` |
| 2    | 实现 JSON Schema 校验（Zod + 容错解析）                       | `src/modules/survey/ai/schema-validator.ts` |
| 3    | 实现 `SurveyService.generate()` SSE 方法                      | `src/modules/survey/survey.service.ts`      |
| 4    | 新增 `POST /surveys/generate` SSE 路由                        | `src/modules/survey/survey.routes.ts`       |
| 5    | 新增 `generateSurveySchema` Zod Schema                        | `src/modules/survey/survey.schemas.ts`      |

### P1 — 前端集成（预计 3-4h）

| 步骤 | 内容                                            | 涉及文件                                   |
| ---- | ----------------------------------------------- | ------------------------------------------ |
| 6    | 实现 `mergeWithDefault()` 模板合并工具          | `src/extension/apis/index.ts`              |
| 7    | 实现 SSE 消费 + 渐进渲染                        | `src/extension/apis/index.ts`              |
| 8    | 实现 AI-GenPanel UI（输入框 + 进度 + 插入按钮） | `src/extension/components/AI-GenPanel.vue` |
| 9    | EventBus 集成：监听 `ai:insert` 事件            | `src/views/EditorView/index.vue`           |
| 10   | 前端 `SystemSettingsView.vue` 新增 AI 配置卡片  | `SystemSettingsView.vue`                   |

### P2 — 完善与测试（预计 2h）

| 步骤 | 内容                       | 涉及文件            |
| ---- | -------------------------- | ------------------- |
| 11   | 限流配置（Redis 3次/分钟） | `survey.routes.ts`  |
| 12   | 审计日志 + 错误降级        | `survey.service.ts` |
| 13   | 联调测试 + 边界场景验证    | -                   |

---

## 11. 费用估算

**DeepSeek API 定价（参考）：**

| 项目                 | 单价             |
| -------------------- | ---------------- |
| `deepseek-chat` 输入 | ¥1 / 百万 tokens |
| `deepseek-chat` 输出 | ¥2 / 百万 tokens |

**单次生成消耗估算（10 题问卷）：**

| 项目          | Token 数          | 费用        |
| ------------- | ----------------- | ----------- |
| System Prompt | ~2,500 tokens     | ¥0.0025     |
| 用户输入      | ~200 tokens       | ¥0.0002     |
| AI 输出       | ~1,500 tokens     | ¥0.003      |
| **单次合计**  | **~4,200 tokens** | **~¥0.006** |

**日/月成本预估：**

| 日活用户 | 人均生成次数 | 日成本 | 月成本 |
| -------- | ------------ | ------ | ------ |
| 50       | 5 次         | ¥1.5   | ¥45    |
| 100      | 5 次         | ¥3     | ¥90    |
| 500      | 5 次         | ¥15    | ¥450   |

成本极低，主要开销在 System Prompt 的固定 token 上。Few-shot 示例是主要 token 消耗来源，可在生产环境精简为 1 个示例以降低成本。

---

## 12. API Key 安全存储方案

### 12.1 需求背景

DeepSeek API Key（`sk-xxxxxxxx`）不能硬编码在前端代码或环境变量中，需通过后台管理系统上传并安全存储。需求约束如下：

| 维度         | 要求                                                          |
| ------------ | ------------------------------------------------------------- |
| **安全**     | 存储态加密，传输态 HTTPS，访问态权限管控                      |
| **持久化**   | 服务重启后不丢失，跟随数据库备份/恢复                         |
| **可管理**   | 通过后台 UI 上传、更新、啟用/停用，有操作审计                 |
| **读写频率** | 极低频（管理员配置一次后长期不变，仅 AI 生成时读取一次）      |
| **集成**     | 与现有 `system_configs` 表 + `encrypt/decrypt` 工具链无缝衔接 |

### 12.2 存储方案对比：PostgreSQL vs Redis

#### 方案A：PostgreSQL（`system_configs` 表 + AES-256-GCM 加密）

| 优点                 | 说明                                                                    |
| -------------------- | ----------------------------------------------------------------------- |
| **零表结构变更**     | `system_configs` 表已存在，SMTP 密码已通过此方式安全存储                |
| **加密工具现成**     | `crypto.ts` 已封装 `encrypt()` / `decrypt()`，AES-256-GCM 算法          |
| **持久化天然**       | 跟随数据库备份，不会因 Redis 重启/清空丢失                              |
| **审计链路完整**     | `audit_logs` 表已记录 `update_smtp_config`，复用同一模式写入审计        |
| **权限控制成熟**     | `admin.routes.ts` 已实现 `super_admin` 角色保护 + `authenticate` 中间件 |
| **前端 UI 框架就绪** | `SystemSettingsView.vue` 已预留"其他配置"卡片，仅需增加表单项           |
| **读取高效**         | 读频率极低（仅 AI 生成时），无需额外缓存层                              |

| 缺点               | 缓解                                                                     |
| ------------------ | ------------------------------------------------------------------------ |
| 数据库明文泄露风险 | 已通过 AES-256-GCM 加密消除，密钥由 `CRYPTO_ENCRYPTION_KEY` 环境变量控制 |
| 读取需一次 DB 查询 | 读频率极低，影响可忽略                                                   |

#### 方案B：Redis（独立 Key + AES 加密）

| 优点         | 说明                |
| ------------ | ------------------- |
| 读取速度极快 | 内存操作，μs 级延迟 |
| 天然 TTL     | 可设置 Key 过期时间 |

| 缺点                | 说明                                                                      |
| ------------------- | ------------------------------------------------------------------------- |
| **持久化不可靠**    | 当前 Redis 配置无持久化策略（无 AOF/RDB 确认），重启即丢失                |
| **备份复杂**        | 需额外配置 Redis 持久化 + 备份策略                                        |
| **数据不一致风险**  | 多实例部署时需考虑 Key 同步                                               |
| **运维复杂度**      | 需确认运维团队已配置 Redis 持久化且可恢复                                 |
| **无原生审计**      | 需自行实现变更日志                                                        |
| **违背 Redis 定位** | 项目中 Redis 定位为缓存层（Cache-Aside 模式，所有方法含 TTL），不是主存储 |

### 12.3 推荐方案：PostgreSQL `system_configs` + AES-256-GCM

**理由总结：**

1. **现有基础设施即用** — SMTP 密码已走完全相同的链路（`system_configs` → `encrypt()`/`decrypt()` → `admin.routes.ts` → `audit_logs`），API Key 只需在同一条路上复制一份配置项
2. **持久化零风险** — PostgreSQL 有完善的备份/恢复流程，不存在 Redis 重启丢失的隐患
3. **安全等级一致** — API Key 与 SMTP 密码同属敏感凭证，同样的 AES-256-GCM 加密策略 + `super_admin` 管控
4. **Redis 定位清晰** — 项目架构文档明确 Redis 为 Cache-Aside 缓存层，不是主存储
5. **读写频率极低** — API Key 读取频率（每次 AI 生成 1 次）远低于 Redis 存在的意义（高频热数据缓存），DB 直接读取完全足够

### 12.4 存储架构设计

```
┌─ app/frontend (后台管理) ─────────────────────────────────────────┐
│                                                                     │
│  SystemSettingsView.vue                                             │
│  ┌─ AI 服务配置 (新增卡片) ────────────────────────────────────┐   │
│  │                                                               │   │
│  │  DeepSeek API Key:  [sk-●●●●●●●●●●●●●●●●●●]  [显示/隐藏]    │   │
│  │  默认模型:          [deepseek-chat ▾]                         │   │
│  │  启用 AI 生成:      [开关]                                    │   │
│  │                                                               │   │
│  │  [保存配置]  [重置]                                           │   │
│  └───────────────────────────────────────────────────────────────┘   │
│     ↓ PUT /api/admin/config/ai                                      │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘

┌─ q-server 后端 ─────────────────────────────────────────────────────┐
│                                                                     │
│  admin.routes.ts: PUT /admin/config/ai                              │
│    → authenticate + requireSuperAdmin 中间件                        │
│    → adminService.updateAIConfig(adminId, body)                     │
│                                                                     │
│  admin.service.ts: updateAIConfig()                                 │
│    → verifySuperAdmin(adminId)                                      │
│    → encrypt(apiKey)   ← AES-256-GCM                                │
│    → prisma.systemConfig.upsert({ key: "ai_enabled", ... })         │
│    → prisma.systemConfig.upsert({ key: "ai_api_key", value: enc })  │
│    → prisma.systemConfig.upsert({ key: "ai_model", ... })           │
│    → cache.del("config:ai")                                         │
│    → createAuditLog("update_ai_config")                             │
│                                                                     │
│  langchain.ts: createDeepSeekChat()                                 │
│    → getConfig("ai")[ai_api_key] → decrypt() → apiKey               │
│                                                                     │
│  ┌─ system_configs 表 ────────────────────────────────────────┐     │
│  │  key          │ value                     │ category       │     │
│  │  ──────────── │ ───────────────────────── │ ────────────── │     │
│  │  ai_enabled   │ true                      │ ai             │     │
│  │  ai_api_key   │ <AES-256-GCM 密文>       │ ai             │     │
│  │  ai_model     │ deepseek-chat             │ ai             │     │
│  │  smtp_enabled │ true                      │ smtp           │     │
│  │  smtp_host    │ smtp.example.com          │ smtp           │     │
│  │  ...          │ ...                       │ ...            │     │
│  └────────────────────────────────────────────────────────────┘     │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘

安全边界：

  CRYPTO_ENCRYPTION_KEY (环境变量，仅运维掌握)
       │
       ▼
  ┌───────────────┐     ┌──────────────────┐     ┌─────────────────┐
  │ system_configs │ ←── │ AES-256-GCM       │ ──→ │ langchain.ts    │
  │ (ai_api_key)   │     │ encrypt/decrypt   │     │ (运行中解密)     │
  │ 存储态: 密文   │     │ 内存态: 明文      │     │ 使用时解密      │
  └───────────────┘     └──────────────────┘     └─────────────────┘
```

### 12.5 数据流与安全边界

```
上传 (写入):                           读取 (使用):

管理员输入明文 API Key                  langchain.ts 调用 createDeepSeekChat()
       │                                      │
       ▼                                      ▼
HTTPS → q-server                        getConfig("ai") → 密文
       │                                      │
       ▼                                      ▼
encrypt(apiKey) → 密文                  decrypt(密文) → 明文
       │                                      │
       ▼                                      ▼
system_configs.upsert()                 new ChatOpenAI({ apiKey: 明文 })
       │                                      │
       ▼                                      ▼
createAuditLog()                        内存态明文，进程结束即消失
```

**安全边界要点：**

- 明文仅在**进程内存**中存在，不写入日志、不返回前端
- 前端回显时显示 `sk-●●●●●●●●●●●●●●` 脱敏格式（仅保留前 3 位 + 后 3 位）
- `CRYPTO_ENCRYPTION_KEY` 与 API Key 分离存储（运维掌握加密密钥，管理员掌握 API Key）
- GET `/admin/config` 接口返回时 API Key 已脱敏，密码类字段不返回

### 12.6 接口规范

#### 写入：`PUT /api/admin/config/ai`

```
权限：super_admin
超时：10s

请求体：
{
  enabled: boolean;              // 启停开关，必填
  apiKey?: string;               // API Key，留空表示不修改（首次必填）
  model?: string;                // 模型名称，默认 "deepseek-chat"
}

校验规则 (Zod)：
- apiKey: 选填，若填则 min(20).max(200)，正则 /^sk-[a-zA-Z0-9]+$/
- model: 选填，enum(["deepseek-chat", "deepseek-reasoner"])
- enabled: 必填 boolean

响应：
{
  code: 0,
  msg: "AI 配置已更新",
  data: {
    updated: true,
    config: {
      ai_enabled: "true",
      ai_api_key: "sk-d●●●●●●●●●●●●●●●●●●b2",
      ai_model: "deepseek-chat"
    }
  }
}
```

#### 读取：`GET /api/admin/config/ai`（或复用 `GET /api/admin/config`）

```
权限：super_admin

响应 data.ai 对象：
{
  ai_enabled: "true",
  ai_api_key: "sk-d●●●●●●●●●●●●●●●●●●b2",  // 脱敏回显
  ai_model: "deepseek-chat"
}
```

### 12.7 服务端实现要点

**`admin.service.ts` — 新增方法：**

```typescript
async updateAIConfig(adminId: bigint, input: {
  enabled: boolean;
  apiKey?: string;
  model?: string;
}) {
  await this.verifySuperAdmin(adminId);

  const entries: Array<{ key: string; value: string; description: string }> = [
    {
      key: "ai_enabled",
      value: String(input.enabled),
      description: "是否启用 AI 生成问卷功能"
    }
  ];

  if (input.model) {
    entries.push({
      key: "ai_model",
      value: input.model,
      description: "AI 默认模型"
    });
  }

  // API Key 加密存储（仅当用户提供了新 Key 时覆盖）
  if (input.apiKey) {
    entries.push({
      key: "ai_api_key",
      value: encrypt(input.apiKey),
      description: "DeepSeek API Key（AES-256-GCM 加密）"
    });
  }

  // 事务批量 upsert
  await this.fastify.prisma.$transaction(
    entries.map(e =>
      this.fastify.prisma.systemConfig.upsert({
        where: { key: e.key },
        update: { value: e.value },
        create: { ...e, category: "ai" }
      })
    )
  );

  // 失效配置缓存
  await this.cache.del("config:ai");

  // 审计日志（不记录 Key 内容）
  createAuditLog(this.fastify, adminId, "update_ai_config", "system_config", null, {
    enabled: input.enabled,
    model: input.model,
    key_updated: !!input.apiKey
  }).catch(() => {});

  return { updated: true };
}
```

**`langchain.ts` — 读取解密后的 Key：**

```typescript
// 新增函数：从 system_configs 读取并解密 DeepSeek API Key
import type { FastifyInstance } from "fastify";
import { decrypt } from "../utils/crypto.js";

export async function getDeepSeekApiKey(fastify: FastifyInstance): Promise<string | null> {
  const config = await fastify.prisma.systemConfig.findUnique({
    where: { key: "ai_api_key" }
  });
  if (!config?.value) return null;
  return decrypt(config.value);
}

// 原 createDeepSeekChat 改为 async，运行时动态获取 Key
export const createDeepSeekChat = async (fastify: FastifyInstance, options?: ChatModelOptions) => {
  const apiKey = await getDeepSeekApiKey(fastify);
  if (!apiKey) throw new Error("DeepSeek API Key 未配置");

  return new ChatOpenAI({
    model: options?.model ?? "deepseek-chat",
    temperature: options?.temperature ?? 0.7,
    apiKey,
    configuration: { baseURL: "https://api.deepseek.com/v1" }
  });
};
```

**`admin.routes.ts` — 新增路由：**

```typescript
// PUT /admin/config/ai — 更新 AI 配置
fastify.put("/config/ai", async (request, reply) => {
  const body = parseAndRespond(updateAIConfigSchema.safeParse(request.body), reply);
  if (!body) return;

  const adminId = request.user!.userId;
  const result = await adminService.updateAIConfig(adminId, body);
  return reply.sendSuccess(result, "AI 配置已更新");
});
```

**`user.schemas.ts` — 新增 Schema：**

```typescript
export const updateAIConfigSchema = z.object({
  enabled: z.boolean(),
  apiKey: z
    .string()
    .min(20)
    .max(200)
    .regex(/^sk-[a-zA-Z0-9]+$/, "无效的 API Key 格式")
    .optional(),
  model: z.enum(["deepseek-chat", "deepseek-reasoner"]).optional()
});
```

### 12.8 前端集成

`SystemSettingsView.vue` 中在"其他配置"卡片区域新增 AI 配置表单，复用现有 SMTP 配置的 `a-card` / `a-form` 组件模式。

**状态设计：**

| 状态             | 类型      | 说明                          |
| ---------------- | --------- | ----------------------------- |
| `aiForm.enabled` | `boolean` | 启停开关                      |
| `aiForm.apiKey`  | `string`  | API Key（密码框，回显脱敏值） |
| `aiForm.model`   | `string`  | 模型选择                      |
| `aiSaving`       | `boolean` | 保存中状态                    |
| `aiShowKey`      | `boolean` | 是否显示完整 Key              |

**脱敏回显逻辑：**

```typescript
// 从 GET /admin/config 拿到密文后，后端不解密，前端显示脱敏占位
// 脱敏规则：保留前3位 + 后3位，中间用 ● 填充到总长20字符
function maskApiKey(key: string): string {
  if (key.length <= 8) return "●●●●●●●●";
  return key.slice(0, 3) + "●".repeat(Math.min(14, key.length - 6)) + key.slice(-3);
}
```

**API 扩展：**

`app/frontend/src/api/modules/admin/index.ts` 新增：

```typescript
export interface AIConfigInput {
  enabled: boolean;
  apiKey?: string;
  model?: string;
}

export const updateAIConfig = (data: AIConfigInput): Promise<ApiResponse<{ updated: boolean }>> =>
  serverClient.put("/admin/config/ai", data);
```

### 12.9 安全审查清单

| 检查项           | 措施                                                                    |
| ---------------- | ----------------------------------------------------------------------- |
| API Key 存储态   | AES-256-GCM 加密，密钥由 `CRYPTO_ENCRYPTION_KEY` 环境变量控制           |
| API Key 传输态   | HTTPS 强制，Nginx/网关层 TLS 1.2+                                       |
| API Key 日志安全 | 不写入应用日志，审计日志仅记录 `key_updated: true/false`                |
| API Key 回显     | 前端回显脱敏，GET 接口返回脱敏值                                        |
| 权限控制         | 仅 `super_admin` 角色可读写 AI 配置                                     |
| 前端泄露         | 前端代码和构建产物中无硬编码 Key                                        |
| 备份安全         | 数据库备份文件含密文，需独立保护备份文件访问权限                        |
| 环境变量         | `CRYPTO_ENCRYPTION_KEY` 和 `DEEPSEEK_API_KEY`（若同时存在）不提交到 Git |

---
