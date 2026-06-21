# Survey 模块完整学习指导文档

> 版本：v1.0 | 最后更新：2026-06-21

---

## 目录

1. [模块概述](#1-模块概述)
2. [架构设计分析](#2-架构设计分析)
   - 2.1 [模块定位与分层](#21-模块定位与分层)
   - 2.2 [文件结构](#22-文件结构)
   - 2.3 [数据流图](#23-数据流图)
   - 2.4 [模块间交互关系](#24-模块间交互关系)
3. [接口详细说明](#3-接口详细说明)
   - 3.1 [问卷 CRUD 接口](#31-问卷-crud-接口)
   - 3.2 [问卷发布/关闭接口](#32-问卷发布关闭接口)
   - 3.3 [模板申请接口](#33-模板申请接口)
   - 3.4 [答卷管理接口](#34-答卷管理接口)
   - 3.5 [文件上传接口](#35-文件上传接口)
4. [代码实现详细解析](#4-代码实现详细解析)
   - 4.1 [问卷创建流程](#41-问卷创建流程)
   - 4.2 [问卷列表与缓存策略](#42-问卷列表与缓存策略)
   - 4.3 [问卷更新与 TOCTOU 防护](#43-问卷更新与-toctou-防护)
   - 4.4 [软删除与公共模板保护](#44-软删除与公共模板保护)
   - 4.5 [状态机：发布/关闭](#45-状态机发布关闭)
   - 4.6 [模板申请与审核记录](#46-模板申请与审核记录)
   - 4.7 [答卷权限模型](#47-答卷权限模型)
   - 4.8 [文件上传管道](#48-文件上传管道)
   - 4.9 [Zod Schema 设计模式](#49-zod-schema-设计模式)
5. [性能优化策略](#5-性能优化策略)
6. [落地实践逻辑](#6-落地实践逻辑)
   - 6.1 [业务场景案例](#61-业务场景案例)
   - 6.2 [异常处理机制](#62-异常处理机制)
   - 6.3 [部署与运维](#63-部署与运维)
7. [依赖工具汇总](#7-依赖工具汇总)

---

## 1. 模块概述

Survey 模块是问卷系统的**核心业务模块**，负责问卷的完整生命周期管理。模块遵循以下设计原则：

| 原则             | 说明                                                                             |
| ---------------- | -------------------------------------------------------------------------------- |
| **事务一致性**   | 问卷+组件的创建/更新均在 Prisma `$transaction` 内完成，保证原子性                |
| **TOCTOU 防护**  | 所有涉及权限校验的写操作在事务内重新查询，防止竞态条件                           |
| **公共模板保护** | 已审核模板不可直接修改/删除，只能先复制为个人问卷                                |
| **类型安全**     | Zod Schema → TypeScript 自动推导 + 前后端共享类型定义                            |
| **性能优先**     | Cache-Aside 缓存、列表搜索不回源、批量 `createMany`/`deleteMany`、事务级组件替换 |
| **权限分级**     | 答卷查看双权限（所有者 + 提交者），杜绝越权访问                                  |

---

## 2. 架构设计分析

### 2.1 模块定位与分层

```
┌─────────────────────────────────────────────────────────┐
│                     HTTP Request                        │
└────────────────────────┬────────────────────────────────┘
                         │ /api/surveys/*  /api/q-editor/*
                         ▼
┌─────────────────────────────────────────────────────────┐
│  Routes 层 (路由 + 限流 + 校验)                           │
│  survey.routes.ts          upload.routes.ts              │
│  ┌──────────────┬──────────────┬────────────────────┐   │
│  │ authenticate │ rateLimit    │ Zod parseAndRespond│   │
│  └──────────────┴──────────────┴────────────────────┘   │
├─────────────────────────────────────────────────────────┤
│  Service 层 (纯业务逻辑)                                  │
│  SurveyService                                           │
│  ┌──────────────┬──────────────┬────────────────────┐   │
│  │ $transaction │ Cache-Aside  │ AuditLog           │   │
│  │ (TOCTOU)     │ (列表+详情)   │ (fire-and-forget)  │   │
│  └──────────────┴──────────────┴────────────────────┘   │
├─────────────────────────────────────────────────────────┤
│  共享层 (packages/common)                                │
│  survey.interface.ts — 枚举/接口前后端通用                │
├─────────────────────────────────────────────────────────┤
│  Data 层                                                 │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐             │
│  │ Prisma   │  │  Redis   │  │  MinIO    │             │
│  │ (MySQL)  │  │ (Cache)  │  │ (Storage) │             │
│  └──────────┘  └──────────┘  └───────────┘             │
└─────────────────────────────────────────────────────────┘
```

### 2.2 文件结构

```
app/q-server/src/modules/survey/
├── doc/
│   └── survey-module-technical-guide.md    # 技术文档
│
├── survey.routes.ts                        # 问卷路由（/api/surveys、/api/responses）
├── survey.schemas.ts                       # Zod Schema 定义 + 类型导出
├── survey.service.ts                       # 核心业务逻辑
└── upload.routes.ts                        # 文件上传路由（/api/q-editor/upload）
```

### 2.3 数据流图

```mermaid
sequenceDiagram
    participant Client
    participant Route as Routes
    participant MW as Auth Middleware
    participant Svc as SurveyService
    participant Cache as Redis
    participant DB as MySQL/Prisma
    participant FS as MinIO

    Note over Client,FS: 创建问卷 (create)
    Client->>Route: POST /api/surveys
    Route->>MW: authenticate
    MW-->>Route: request.user
    Route->>Svc: create(userId, input)
    Svc->>DB: $transaction
    activate DB
    DB->>DB: INSERT survey
    DB->>DB: createMany components
    DB-->>Svc: created survey
    deactivate DB
    Svc->>Cache: delByPattern(survey:list:userId:*)
    Svc->>DB: 审计日志 (异步)
    Svc-->>Client: survey_id + title + status

    Note over Client,FS: 问卷列表 (list)
    Client->>Route: GET /api/surveys?page=1&status=0
    Route->>Svc: list(userId, query)
    Svc->>Cache: GET survey:list:{userId}:{page}:{size}:{status}:
    alt 缓存命中 & 非搜索
        Cache-->>Svc: 直接返回
    else 缓存未命中或关键词搜索
        Svc->>DB: findMany + count 并行
        DB-->>Svc: items + total
        Svc->>Cache: SET (非搜索模式)
    end
    Svc-->>Client: { surveys[], total, page, page_size }

    Note over Client,FS: 更新问卷 (update)
    Client->>Route: PUT /api/surveys/:id
    Route->>Svc: update(userId, surveyId, input)
    Svc->>DB: $transaction
    activate DB
    DB->>DB: findFirst (TOCTOU 重新查询)
    DB->>DB: 公共模板保护检查
    DB->>DB: UPDATE survey
    DB->>DB: deleteMany + createMany components (全量替换)
    DB-->>Svc: done
    deactivate DB
    Svc->>Cache: del(详情) + delByPattern(列表)
    Svc->>DB: 审计日志 (异步)
    Svc-->>Client: 完整的 SurveyDetail

    Note over Client,FS: 文件上传 (upload)
    Client->>Route: POST /api/q-editor/upload (multipart)
    Route->>Route: bodyLimit 10MB (框架级)
    Route->>Route: MIME 类型校验
    Route->>Route: 读取 Buffer + 大小校验
    Route->>FS: uploadToMinio(buffer, "images", filename, mime)
    FS-->>Route: imageUrl
    Route-->>Client: { imageUrl }
```

### 2.4 模块间交互关系

```mermaid
flowchart TB
    subgraph SurveyModule["Survey 模块"]
        SR[survey.routes.ts]
        SS[survey.service.ts]
        UR[upload.routes.ts]
        Sch[survey.schemas.ts]
    end

    subgraph UserModule["User 模块"]
        AuthM[auth.middleware.ts]
    end

    subgraph Common["共享层"]
        SI[survey.interface.ts]
    end

    subgraph Utils["项目工具层"]
        Cache[Cache Client]
        Upload[Upload Utils]
        Audit[Audit Log]
        Pagination[Pagination]
        Response[Response/BizCode]
    end

    subgraph Infra["基础设施"]
        Prisma[(Prisma/MySQL)]
        Redis[(Redis)]
        MinIO[(MinIO)]
    end

    SR --> AuthM
    UR --> AuthM
    SR --> SS
    SR --> Sch
    UR --> Upload
    SS --> Cache
    SS --> Prisma
    SS --> Audit
    SS --> Pagination
    SS --> SI
    Sch --> SI
```

**关键交互说明：**

- **survey.routes.ts** 与 **upload.routes.ts** 挂载于不同前缀（`/api` 和 `/api/q-editor`），在 `routes/index.ts` 中分别注册
- Survey 模块复用 User 模块的 `authenticate` 中间件，不自行实现认证
- 前后端共享类型定义在 `packages/common/src/survey/survey.interface.ts`，编译时强类型保证

---

## 3. 接口详细说明

### 3.1 问卷 CRUD 接口

挂载前缀：`/api/surveys`，全部需要认证。

| 方法     | 路径           | 限流      | 说明                        |
| -------- | -------------- | --------- | --------------------------- |
| `POST`   | `/surveys`     | 30次/分钟 | 创建问卷 + 批量创建组件     |
| `GET`    | `/surveys`     | 60次/分钟 | 分页列表（含搜索+缓存）     |
| `GET`    | `/surveys/:id` | 60次/分钟 | 问卷详情（含组件列表+缓存） |
| `PUT`    | `/surveys/:id` | 30次/分钟 | 更新问卷 + 全量替换组件     |
| `DELETE` | `/surveys/:id` | 20次/分钟 | 软删除问卷                  |

---

#### `POST /api/surveys` — 创建问卷

**请求体：**

```json
{
  "title": "2026年度员工满意度调查",
  "description": "本问卷旨在了解...",
  "page_size": 10,
  "is_public": 0,
  "status": 0,
  "access_code": null,
  "components": [
    {
      "type": "single_select",
      "config": { "title": "您的性别" },
      "order_index": 0,
      "required": 1
    },
    {
      "type": "text_note",
      "config": { "title": "感谢参与" },
      "order_index": 1,
      "required": 0
    }
  ]
}
```

| 参数          | 类型    | 约束            | 说明                  |
| ------------- | ------- | --------------- | --------------------- |
| `title`       | string  | 1~500字符       | 问卷标题              |
| `description` | string  | 可选，≤2000字符 | 问卷描述              |
| `page_size`   | number  | 1~50，默认10    | 每页题目数            |
| `is_public`   | 0\|1    | 可选            | 是否公开              |
| `status`      | 0\|1\|2 | 可选，默认0     | 0草稿/1已发布/2已关闭 |
| `access_code` | string  | 可选，≤50字符   | 访问密码              |
| `components`  | array   | 最少0个         | 组件列表              |

**响应：**

```json
{
  "code": 0,
  "msg": "创建成功",
  "data": {
    "survey_id": "123",
    "title": "2026年度员工满意度调查",
    "status": 0,
    "created_at": "2026-06-21T10:00:00.000Z"
  }
}
```

**核心逻辑：**

- 事务内 `create` survey + `createMany` components（批量写入，非逐条 INSERT）
- `text_note` 类组件不计入 `total_questions`
- 创建后失效列表缓存

---

#### `GET /api/surveys` — 问卷列表

**查询参数：**

```
/api/surveys?page=1&page_size=10&status=0&keyword=满意度
```

| 参数        | 类型   | 约束           | 说明         |
| ----------- | ------ | -------------- | ------------ |
| `page`      | number | ≥1，默认1      | 页码         |
| `page_size` | number | 1~100，默认10  | 每页条数     |
| `status`    | number | 0\|1\|2，可选  | 过滤状态     |
| `keyword`   | string | ≤200字符，可选 | 标题模糊搜索 |

**响应：**

```json
{
  "code": 0,
  "data": {
    "surveys": [
      {
        "id": "123",
        "user_id": "1",
        "title": "员工满意度调查",
        "description": "本问卷...",
        "status": 0,
        "page_size": 10,
        "total_questions": 15,
        "responses_count": 0,
        "is_public": 0,
        "survey_type": "personal",
        "review_status": "none",
        "category": null,
        "cover_url": null,
        "download_count": 0,
        "rating": null,
        "created_at": "2026-06-21T10:00:00.000Z",
        "updated_at": "2026-06-21T10:00:00.000Z",
        "published_at": null,
        "closed_at": null
      }
    ],
    "total": 1,
    "page": 1,
    "page_size": 10
  }
}
```

**缓存策略：**

- 关键词搜索不使用缓存（命中率极低）
- 非搜索时使用 `CacheKeys.surveyList(userId, page, page_size, status, "")`，TTL 300s

---

#### `GET /api/surveys/:id` — 问卷详情

**响应：** 与列表项结构相似，额外包含 `access_code` 和 `components` 数组。

```json
{
  "data": {
    "id": "123",
    "...": "同列表项字段",
    "access_code": null,
    "components": [
      {
        "id": "1",
        "survey_id": "123",
        "type": "single_select",
        "config": { "title": "您的性别" },
        "order_index": 0,
        "required": 1,
        "created_at": "...",
        "updated_at": "..."
      }
    ]
  }
}
```

**权限校验：** `user_id = userId AND deleted_at IS NULL`，确保只能访问自己的问卷。

---

#### `PUT /api/surveys/:id` — 更新问卷

**请求体：** 所有字段可选。

```json
{
  "title": "新标题",
  "status": 0,
  "components": [ ... ]
}
```

**核心逻辑：**

1. 事务内 `findFirst`（TOCTOU 防护 — 防止两次操作间数据被并发修改）
2. 公共模板保护：`survey_type === "template" && review_status === "approved"` → 拒绝，提示"先复制为个人问卷"
3. 原为已审核模板且组件变更时，`review_status` 自动降为 `"none"`（需要重新审核）
4. 组件更新采用**全量替换**策略：`deleteMany` → `createMany`
5. 安全审计：审计日志记录 `updated_fields` 和 `components_updated` 标志
6. 缓存清理：`invalidateCache(surveyId, userId)`

---

#### `DELETE /api/surveys/:id` — 软删除问卷

**响应：**

```json
{ "code": 0, "msg": "删除成功", "data": null }
```

**核心逻辑：**

```typescript
// 三级分支处理
if (existing.survey_type === "template" && existing.review_status === "approved") {
  // 公共模板：不修改远程数据，返回成功让前端清除本地数据
  isTemplateApproved = true;
  return;
}
if (existing.review_status === "pending") {
  // 审核中的模板：关闭审核记录
  await tx.review.updateMany({ ... set { status: "rejected" } });
}
// 所有情况：设置 deleted_at + review_status = "none"
await tx.survey.update({ data: { review_status: "none", deleted_at: new Date() } });
```

---

### 3.2 问卷发布/关闭接口

| 方法   | 路径                   | 限流      | 说明                      |
| ------ | ---------------------- | --------- | ------------------------- |
| `POST` | `/surveys/:id/publish` | 10次/分钟 | 发布问卷（草稿→已发布）   |
| `POST` | `/surveys/:id/close`   | 10次/分钟 | 关闭问卷（已发布→已关闭） |

#### 状态机

```mermaid
stateDiagram-v2
    [*] --> Draft: 创建问卷
    Draft --> Published: publish (status=0→1)
    Published --> Closed: close (status=1→2)
    Closed --> [*]
    note right of Published: 已关闭的问卷无法重新发布
```

#### 发布校验

```typescript
// TOCTOU 防护 — 事务内校验
await this.fastify.prisma.$transaction(async tx => {
  const existing = await tx.survey.findFirst({
    where: { id: surveyId, user_id: userId, deleted_at: null }
  });
  if (!existing) throw new AppError("问卷不存在", 404);
  if (existing.status === 1) throw new AppError("问卷已发布，无需重复操作", 409);
  if (existing.status === 2) throw new AppError("已关闭的问卷无法发布", 409);

  await tx.survey.update({
    data: { status: 1, published_at: new Date() }
  });
});
```

#### 关闭校验

```typescript
if (existing.status === 2) throw new AppError("问卷已关闭，无需重复操作", 409);
if (existing.status === 0) throw new AppError("草稿状态的问卷无需关闭", 409);

await tx.survey.update({
  data: { status: 2, closed_at: new Date() }
});
```

---

### 3.3 模板申请接口

#### `POST /api/surveys/:id/apply-template` — 申请共享模板

**请求体：**

```json
{
  "components": [ ... ],
  "submit_message": "该问卷经过精心设计...",
  "category": "education"
}
```

| 参数             | 类型   | 约束                                                 | 说明         |
| ---------------- | ------ | ---------------------------------------------------- | ------------ |
| `components`     | array  | 可选                                                 | 新的组件列表 |
| `submit_message` | string | 可选，≤500字符                                       | 提交说明     |
| `category`       | enum   | "education"/"market"/"hr"/"customer"/"event"/"other" | 模板分类     |

**响应：**

```json
{
  "code": 0,
  "msg": "模板申请已提交，等待管理员审核",
  "data": {
    "review_id": "456",
    "status": "pending"
  }
}
```

**核心逻辑：**

1. 查询问卷存在性
2. 事务内防并发：检查是否已有审核中的申请 → 409 拒绝
3. 更新问卷：`survey_type = "template"` + `review_status = "pending"` + `is_public = 1` + `category`
4. 如有组件变更，同步 `replaceComponents`
5. 创建审核记录（`review` 表）

---

### 3.4 答卷管理接口

| 方法     | 路径             | 限流      | 说明                   |
| -------- | ---------------- | --------- | ---------------------- |
| `GET`    | `/responses/:id` | 60次/分钟 | 答卷详情（含答案列表） |
| `DELETE` | `/responses/:id` | 20次/分钟 | 删除答卷               |

#### 答卷权限模型

```typescript
// 双重权限校验：所有者 OR 提交者
const isOwner = surveyUserId === userId; // 问卷所有者
const isSubmitter = response.user_id === userId; // 答卷提交者
if (!isOwner && !isSubmitter) {
  throw new AppError("无权查看/删除该答卷", 403);
}
```

---

### 3.5 文件上传接口

挂载前缀：`/api/q-editor`，需要认证。

#### `POST /api/q-editor/upload` — 上传图片

**请求：** `multipart/form-data`，字段名 `file`

**支持格式：** jpg / png / gif / webp / svg / bmp

**限制：**

- bodyLimit: 10MB（Fastify 框架级，读取 Buffer 前就拒绝超大文件）
- 读取后二次校验：`buffer.length > 10MB` → 拒绝

**响应：**

```json
{
  "code": 0,
  "msg": "上传成功",
  "data": { "imageUrl": "http://localhost:9000/questionnaire/images/uuid.png" }
}
```

**与头像上传的区别：**

| 维度       | 头像上传 (avatar.service.ts)     | 文件上传 (upload.routes.ts) |
| ---------- | -------------------------------- | --------------------------- |
| 魔数校验   | file-type 库                     | 仅 MIME 字符串              |
| 压缩处理   | sharp 800+200 双规格             | 原始文件                    |
| 存储前缀   | `avatars/`                       | `images/`                   |
| 对象键     | 预计算 key（\_original/\_thumb） | UUID + 原始扩展名           |
| 旧文件清理 | 异步删除旧头像                   | 不清理                      |

---

## 4. 代码实现详细解析

### 4.1 问卷创建流程

```
POST /api/surveys
  │
  ├─ Route 层: parseAndRespond(createSurveySchema.safeParse(body))
  │   └─ Zod 校验: title 1-500 / description ≤2000 / page_size 1-50 / components[]
  │
  └─ Service 层: create(userId, input)
      │
      ├─ $transaction(async tx => {
      │   ├─ tx.survey.create({
      │   │     user_id, title, description, status, page_size,
      │   │     total_questions: countQuestions(components),
      │   │     is_public, access_code, survey_type: "personal",
      │   │     review_status: "none"
      │   │   })
      │   └─ tx.surveyComponent.createMany({
      │         data: components.map(...)  // 批量写入，非逐条 INSERT
      │       })
      │ })
      │
      ├─ 审计日志 (fire-and-forget)
      ├─ 失效列表缓存: delByPattern(survey:list:userId:*)
      └─ 返回: { survey_id, title, status, created_at }
```

**`countQuestions` 算法：**

```typescript
const NON_QUESTION_TYPES = new Set(["text_note"]);

function countQuestions(components): number {
  return components.filter(c => !NON_QUESTION_TYPES.has(c.type)).length;
}
```

---

### 4.2 问卷列表与缓存策略

```typescript
async list(userId: bigint, query: SurveyListQueryInput): Promise<SurveyListResponse> {
  const { page, page_size, status, keyword } = query;

  const where: Record<string, unknown> = {
    user_id: userId,
    deleted_at: null
  };
  if (status !== undefined) where.status = status;
  if (keyword) where.title = { contains: keyword };

  const executeQuery = async () => {
    // findMany + count 并行查询，减少 DB 往返
    const [items, total] = await Promise.all([
      this.fastify.prisma.survey.findMany({ ... }),
      this.fastify.prisma.survey.count({ where })
    ]);
    return { surveys: items.map(toSurveyListItem), total, page, page_size };
  };

  // 搜索请求不缓存（keyword 多变，缓存命中率极低）
  if (keyword) {
    return executeQuery();
  }

  // 非搜索使用 Cache-Aside
  const cacheKey = CacheKeys.surveyList(userId, page, page_size, String(status ?? "all"), "");
  return this.cache.getOrSet(cacheKey, executeQuery, CacheTTL.SURVEY);
}
```

**缓存键设计：**

```
survey:list:{userId}:{page}:{page_size}:{status}:{keyword}
survey:list:1:1:10:0:
survey:list:1:2:10:all:
```

**失效策略：** 任何问卷写操作后，使用 `delByPattern(survey:list:{userId}:*)` 批量清除该用户所有列表缓存。

---

### 4.3 问卷更新与 TOCTOU 防护

TOCTOU (Time-of-Check-Time-of-Use) 是并发场景下的经典竞态问题：在"权限检查"与"数据操作"之间，数据可能已被其他事务修改。

```typescript
async update(userId, surveyId, input) {
  await this.fastify.prisma.$transaction(async tx => {
    // ✅ 在事务内重新查询，消除 TOCTOU 窗口
    const existing = await tx.survey.findFirst({
      where: { id: surveyId, user_id: userId, deleted_at: null }
    });
    if (!existing) throw new AppError("问卷不存在", 404);

    // ✅ 公共模板保护检查
    if (existing.survey_type === "template" && existing.review_status === "approved") {
      throw new AppError("公共模板不可直接修改，请先复制为个人问卷", 403);
    }

    // 更新元数据...
    await tx.survey.update({ where: { id: surveyId, user_id: userId }, data: updateData });

    // ✅ 组件全量替换（deleteMany + createMany）
    if (components) {
      await this.replaceComponents(tx, surveyId, components);
    }
  });

  // 事务外：异步审计 + 失效缓存
  await this.invalidateCache(surveyId, userId);
  return this.getById(userId, surveyId); // 重新读取以获取最新数据
}
```

**全量替换 vs 增量更新：**

- 全量替换语义简单、无删除遗漏、无顺序冲突
- `deleteMany` + `createMany` 一次事务完成，组件顺序由 `order_index` 精确控制

---

### 4.4 软删除与公共模板保护

```mermaid
flowchart TD
    A[DELETE /api/surveys/:id] --> B{$transaction}
    B --> C{findFirst 存在?}
    C -->|No| D[404 问卷不存在]
    C -->|Yes| E{is_public_template?}
    E -->|Yes| F[仅返回成功<br/>不修改远程数据]
    E -->|No| G{review_status?}
    G -->|pending| H[关闭审核记录<br/>status=rejected]
    G -->|none/approved/rejected| I[直接软删除]
    H --> I
    I --> J[UPDATE survey<br/>deleted_at = now<br/>review_status = none]
    J --> K[失效所有缓存]
    F --> K
    K --> L[返回成功]
```

**公共模板保护：** 已审核的模板问卷（`survey_type === "template" && review_status === "approved"`）是公共资源。删除时：服务端不修改远程数据，仅返回成功，让前端清除本地数据。更新时：直接 403 拒绝，要求"先复制为个人问卷"。

---

### 4.5 状态机：发布/关闭

```
status: 0 (Draft) ──publish──→ status: 1 (Published)
status: 1 (Published) ──close──→ status: 2 (Closed)
```

- **发布**确认 `status === 0`，拒绝重复发布和已关闭状态
- **关闭**确认 `status === 1`，拒绝重复关闭和草稿状态
- 两个操作均在事务内完成状态检查+更新，防止并发导致状态不一致
- 每次操作后 `invalidateCache(surveyId, userId)`，确保缓存与 DB 一致

---

### 4.6 模板申请与审核记录

```typescript
async applyTemplate(userId, surveyId, input) {
  // 1. 查询问卷存在性
  const existing = await this.fastify.prisma.survey.findFirst({ ... });
  if (!existing) throw new AppError("问卷不存在", 404);

  const review = await this.fastify.prisma.$transaction(async tx => {
    // 2. 事务内防并发：检查审核中记录
    const pendingReview = await tx.review.findFirst({
      where: { survey_id: surveyId, status: "pending" }
    });
    if (pendingReview) throw new AppError("该问卷已有审核中的申请", 409);

    // 3. 更新问卷：标记为模板 + 审核中
    await tx.survey.update({
      data: {
        survey_type: "template",
        review_status: "pending",
        is_public: 1,
        category: input.category,
        ...(input.components && { total_questions: countQuestions(input.components) })
      }
    });

    // 4. 如有组件更新，同步保存
    if (input.components?.length > 0) {
      await this.replaceComponents(tx, surveyId, input.components);
    }

    // 5. 创建审核记录
    return tx.review.create({
      data: {
        survey_id: surveyId,
        submitter_id: userId,
        status: "pending",
        submit_message: input.submit_message ?? null
      }
    });
  });

  // 事务外：审计 + 失效缓存
  await createAuditLog(...);
  await this.invalidateCache(surveyId, userId);

  return { review_id: bigIntToStr(review.id), status: review.status };
}
```

---

### 4.7 答卷权限模型

```typescript
// 权限校验：只能查看自己问卷的答卷 或 自己提交的答卷
const surveyUserId = typeof survey.user_id === "bigint" ? survey.user_id : BigInt(survey.user_id as string | number);
const isOwner = surveyUserId === userId;
const isSubmitter = response.user_id === userId;
if (!isOwner && !isSubmitter) {
  throw new AppError("无权查看该答卷", 403);
}
```

**BigInt 兼容处理：** Prisma 返回的 `BigInt` 字段在运行时可能是真 BigInt 或字符串（取决于序列化上下文），使用 `typeof` 检查后统一转换再比较。

**删除答卷：** 事务内 `deleteMany(answers)` → `delete(response)`，确保关联答案一并删除。

---

### 4.8 文件上传管道

```
Client → POST /api/q-editor/upload (multipart/form-data)
  │
  ├─ Fastify bodyLimit: 10MB (框架级预校验)
  │
  ├─ request.file() 解析 multipart
  │
  ├─ MIME 类型校验: ALLOWED_IMAGE_TYPES.includes(data.mimetype)
  │   └─ 支持: jpg / png / gif / webp / svg / bmp
  │
  ├─ data.toBuffer() + 大小校验: buffer.length > 10MB
  │
  ├─ uploadToMinio(fastify, buffer, "images", filename, mimetype)
  │   ├─ 生成 key: images/{uuid}.{ext}
  │   ├─ putObject(BUCKET, key, buffer, buffer.length, { Content-Type })
  │   └─ buildUrl(key) → http://localhost:9000/questionnaire/images/uuid.png
  │
  └─ 返回 { imageUrl }
```

---

### 4.9 Zod Schema 设计模式

```typescript
// 1. 基础校验规则（可跨 Schema 复用）
const titleSchema = z.string().min(1, "问卷标题不能为空").max(500);
const pageSizeSchema = z.number().int().min(1).max(50).optional();

// 2. 组件载荷（深层嵌套结构）
const componentPayloadSchema = z.object({
  type: z.string().min(1),
  config: z.record(z.string(), z.unknown()),
  order_index: z.number().int().min(0),
  required: z.union([z.literal(0), z.literal(1)])
});

// 3. 组合为接口 Schema
export const createSurveySchema = z.object({
  title: titleSchema,
  components: z.array(componentPayloadSchema).min(0)
});

// 4. 问卷 ID 变换校验（字符串→BigInt）
export const surveyIdSchema = z
  .string()
  .regex(/^\d+$/, "问卷 ID 必须为数字")
  .transform(val => BigInt(val));

// 5. 提交说明空字符串转换（"" → undefined）
const submitMessageSchema = z
  .string()
  .max(500)
  .optional()
  .transform(val => (val === "" ? undefined : val));

// 6. 自动推导 TypeScript 类型
export type CreateSurveyInput = z.infer<typeof createSurveySchema>;
export type ApplyTemplateInput = z.infer<typeof applyTemplateSchema>;
```

---

## 5. 性能优化策略

### 5.1 已实施的优化方案

| 优化项                    | 策略                                      | 效果                     |
| ------------------------- | ----------------------------------------- | ------------------------ |
| **Cache-Aside 缓存**      | 详情/列表读操作优先 Redis，TTL 300s       | 减少 80%+ DB 查询        |
| **列表搜索零缓存**        | keyword 模式下跳过缓存直接查 DB           | 避免无效缓存占用         |
| **findMany + count 并行** | `Promise.all([findMany, count])`          | 减少 50% 串行 DB 往返    |
| **createMany 批量写入**   | 组件创建使用 `createMany` 非逐条 `create` | 组件数 n → 1 次 DB 操作  |
| **deleteMany 批量删除**   | 全量替换组件时 `deleteMany`               | 非逐条 `delete`          |
| **Prisma $transaction**   | 写入操作全程事务包裹                      | 原子性保证 + TOCTOU 防护 |
| **缓存批量失效**          | `delByPattern` 使用 Redis SCAN            | 避免 KEYS 阻塞           |
| **异步审计日志**          | `createAuditLog().catch(() => {})`        | 零阻塞业务响应           |
| **框架级 bodyLimit**      | Fastify 10MB 限制在 buffer 读取前         | 防止超大文件耗尽内存     |
| **前端类型共享**          | `packages/common` 编译时强类型            | 减少前后端类型不一致 Bug |

### 5.2 性能瓶颈分析

| 瓶颈点             | 当前耗时                         | 影响                         |
| ------------------ | -------------------------------- | ---------------------------- |
| 组件全量替换       | `deleteMany` + N 条 `createMany` | 组件数量多时事务时间线性增长 |
| 图片上传 MIME 校验 | 仅字符串比较，无魔数校验         | 可伪造 Content-Type 绕过     |
| 列表加载分页       | 正常                             | 已优化                       |

### 5.3 潜在优化方向

| 方向                 | 说明                                           | 适用场景                |
| -------------------- | ---------------------------------------------- | ----------------------- |
| **组件增量同步**     | 当前全量替换，可改为 diff-based 只更新变更组件 | 组件数量 >50 的复杂问卷 |
| **MongoDB 存储组件** | 组件支持灵活 schema，MongoDB 更合适            | 组件配置频繁变化        |
| **上传图片魔数校验** | 引入 `file-type` 库校验文件头                  | 安全加固                |
| **上传 CDN**         | MinIO URL 替换为 CDN 域名                      | 生产环境                |
| **问卷统计预计算**   | 定时任务计算 responses_count / rating          | 列表频繁访问            |
| **长问卷分片存储**   | 超过 100 个组件的问卷拆分为多个 segment        | 极致性能场景            |

---

## 6. 落地实践逻辑

### 6.1 业务场景案例

#### 场景一：用户首次同步问卷

```
1. 前端编辑器保存 → POST /api/surveys
   {
     title, description, page_size,
     components: [
       { type: "single_select", config: {...}, order_index: 0, required: 1 },
       { type: "text_input",   config: {...}, order_index: 1, required: 0 },
       ...
     ]
   }
2. 后端事务：创建 survey + createMany components
3. 返回 survey_id → 前端存储本地映射
4. 后续更新时携带 survey_id: PUT /api/surveys/:id
```

#### 场景二：问卷发布→收集答卷→关闭

```
1. 用户编辑完成 → POST /api/surveys/:id/publish
   后端：校验 status=0 → 更新 status=1 + published_at
2. 分享问卷链接 → 受访者开始填答（content 模块处理）
3. 调查结束 → POST /api/surveys/:id/close
   后端：校验 status=1 → 更新 status=2 + closed_at
4. 查看答卷 → GET /api/responses/:id
   后端：双重权限校验（所有者 OR 提交者）
```

#### 场景三：申请公共模板

```
1. 用户完善问卷后 → POST /api/surveys/:id/apply-template
   { category: "education", submit_message: "精美教育问卷模板" }
2. 后端：
   - 事务内防并发（已有 pending → 409）
   - 更新 survey: type=template, review_status=pending, is_public=1
   - 创建 review 记录
3. 管理员审核通过 → review_status = "approved" → 公开可见
4. 审核驳回 → review_status = "rejected" → 用户可修改后重新提交
```

#### 场景四：删除问卷（含审核中记录处理）

```
1. DELETE /api/surveys/:id
2. 后端分支处理：
   ├─ 公共模板 → 不操作远程，仅返回成功
   ├─ 审核中 → 关闭审核记录 (rejected) + 软删除
   └─ 普通问卷 → 直接软删除
3. 前端收到成功响应 → 清除本地数据
```

### 6.2 异常处理机制

#### 6.2.1 错误码体系

| 场景                       | HTTP | 错误消息                                   |
| -------------------------- | ---- | ------------------------------------------ |
| 问卷不存在                 | 404  | "问卷不存在"                               |
| 权限不足（不是自己的问卷） | 404  | "问卷不存在"（不暴露存在性）               |
| 答卷越权访问               | 403  | "无权查看/删除该答卷"                      |
| 公共模板直接修改           | 403  | "公共模板不可直接修改，请先复制为个人问卷" |
| 重复发布                   | 409  | "问卷已发布，无需重复操作"                 |
| 已关闭问卷发布             | 409  | "已关闭的问卷无法发布"                     |
| 草稿状态关闭               | 409  | "草稿状态的问卷无需关闭"                   |
| 审核中重复申请             | 409  | "该问卷已有审核中的申请"                   |
| 问卷 ID 格式错误           | 400  | "问卷 ID 格式错误"                         |
| 文件类型不支持             | 400  | "不支持的文件类型: ..."                    |
| 文件大小超限               | 400  | "文件大小不能超过 10MB"                    |

#### 6.2.2 项目级错误类

```
AppError (基础)
├── AuthError    — 认证/授权错误 (User 模块)
└── ValidationError — 业务校验错误 (User 模块)
```

> Survey 模块使用 `AppError` 作为通用错误类，HTTP 状态码通过构造函数传入。

#### 6.2.3 各层降级策略

| 层级           | 降级策略                                                          |
| -------------- | ----------------------------------------------------------------- |
| **Redis 读取** | `try/catch` → 返回 null → 降级查 DB                               |
| **Redis 写入** | `try/catch` → warn 日志 → 不阻塞                                  |
| **审计日志**   | `.catch(() => {})` → 静默失败                                     |
| **缓存失效**   | `await` 正常等待，Redis 不可用时异常已被缓存客户端的 `catch` 吞没 |

### 6.3 部署与运维

#### 6.3.1 环境变量

```bash
# MinIO
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_BUCKET=questionnaire
MINIO_USE_SSL=false

# 数据库
DATABASE_URL=mysql://root:pass@localhost:3306/questionnaire

# Redis
REDIS_URL=redis://localhost:6379

# 限流
REQUEST_TIMEOUT=30000
```

#### 6.3.2 部署前检查清单

- [ ] MySQL 已执行 Prisma migrate（survey / survey_component / responses / answers / review 表）
- [ ] Redis 可连接且开启了持久化
- [ ] MinIO Bucket `questionnaire` 已创建，Policy 为 public-read
- [ ] `packages/common` 类型定义已同步前后端
- [ ] 上传目录 `images/` 在 MinIO 中的权限配置正确

#### 6.3.3 路由注册代码参考

```typescript
// routes/index.ts
fastify.register(uploadRoutes, { prefix: "/q-editor" });
// survey.routes.ts 内部路径已为 /surveys、/responses 等完整路径，无需额外前缀
fastify.register(surveyRoutes);
```

---

## 7. 依赖工具汇总

### 项目内部工具

| 工具                                       | 文件                              | 用途                        |
| ------------------------------------------ | --------------------------------- | --------------------------- |
| `authenticate`                             | `modules/user/auth.middleware.ts` | 所有接口认证                |
| `parseAndRespond` / `parseQueryAndRespond` | `utils/zod.ts`                    | Zod 校验 + 自动错误响应     |
| `createCache` / `CacheKeys` / `CacheTTL`   | `utils/cache.ts`                  | Redis 缓存客户端 + Key 管理 |
| `createAuditLog`                           | `utils/audit-log.ts`              | 统一审计日志写入            |
| `uploadToMinio`                            | `utils/upload.ts`                 | MinIO 文件上传              |
| `buildPagination`                          | `utils/pagination.ts`             | 分页参数构建                |
| `AppError`                                 | `utils/errors.ts`                 | 通用业务异常                |

### 缓存 Key 清单

| Key                                                     | 格式                   | TTL  | 用途             |
| ------------------------------------------------------- | ---------------------- | ---- | ---------------- |
| `survey:detail:{id}`                                    | survey:detail:123      | 300s | 问卷详情缓存     |
| `survey:list:{userId}:{page}:{size}:{status}:{keyword}` | survey:list:1:1:10:0:  | 300s | 问卷列表缓存     |
| `survey:list:{userId}:*`                                | survey:list:1:\*       | —    | 列表模糊匹配失效 |
| `survey:stats:{id}`                                     | survey:stats:123       | 300s | 问卷统计缓存     |
| `survey:*:{id}*`                                        | survey:_:123_          | —    | 问卷全缓存失效   |
| `response:detail:{id}`                                  | response:detail:456    | 600s | 答卷详情缓存     |
| `response:survey:{id}:*`                                | response:survey:123:\* | —    | 答卷批量失效     |

### 共享类型定义

| 文件                                             | 用途                                             |
| ------------------------------------------------ | ------------------------------------------------ |
| `packages/common/src/survey/survey.interface.ts` | 前后端通用枚举、组件载荷、问卷详情、答卷详情类型 |

### 外部关键依赖

| 依赖                  | 用途                                              |
| --------------------- | ------------------------------------------------- |
| `zod`                 | 请求体/查询参数 Schema 校验 + TypeScript 类型推导 |
| `@fastify/multipart`  | multipart/form-data 文件解析                      |
| `@fastify/rate-limit` | 接口限流保护                                      |

---

> 本文档覆盖了 Survey 模块从架构到实现的全部最佳实践。建议重点关注：事务内 TOCTOU 防护模式、公共模板保护机制、答卷双重权限模型、组件全量替换策略、以及 Cache-Aside 缓存方案在列表/详情场景的具体应用。
