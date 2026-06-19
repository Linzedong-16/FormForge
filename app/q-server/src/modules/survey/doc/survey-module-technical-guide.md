# 问卷模块技术文档

> **模块路径**：`app/q-server/src/modules/survey`  
> **路由前缀**：`/api`（在 `routes/index.ts` 中注册）  
> **面向用户**：C 端（普通用户）  
> **版本**：v1.0  
> **最后更新**：2026-06-20

---

## 目录

1. [模块概述](#1-模块概述)
2. [架构设计](#2-架构设计)
   - [分层架构](#21-分层架构)
   - [文件职责](#22-文件职责)
   - [数据流全链路](#23-数据流全链路)
3. [数据库表结构](#3-数据库表结构)
   - [核心表关系](#31-核心表关系)
   - [索引策略](#32-索引策略)
4. [接口详解](#4-接口详解)
   - [POST /api/surveys — 创建问卷](#41-post-apisurveys--创建问卷)
   - [GET /api/surveys — 问卷列表](#42-get-apisurveys--问卷列表)
   - [GET /api/surveys/:id — 问卷详情](#43-get-apisurveysid--问卷详情)
   - [PUT /api/surveys/:id — 更新问卷](#44-put-apisurveysid--更新问卷)
   - [DELETE /api/surveys/:id — 删除问卷](#45-delete-apisurveysid--删除问卷)
   - [POST /api/surveys/:id/publish — 发布问卷](#46-post-apisurveysidpublish--发布问卷)
   - [POST /api/surveys/:id/close — 关闭问卷](#47-post-apisurveysidclose--关闭问卷)
   - [POST /api/surveys/:id/apply-template — 申请共享模板](#48-post-apisurveysidapply-template--申请共享模板)
5. [中间件体系](#5-中间件体系)
   - [认证中间件](#51-认证中间件)
   - [频率限制](#52-频率限制)
   - [全局错误处理](#53-全局错误处理)
6. [缓存策略](#6-缓存策略)
   - [Cache-Aside 模式](#61-cache-aside-模式)
   - [缓存键规范](#62-缓存键规范)
   - [缓存失效策略](#63-缓存失效策略)
   - [降级策略](#64-降级策略)
7. [安全防护](#7-安全防护)
   - [认证与授权](#71-认证与授权)
   - [输入校验](#72-输入校验)
   - [公共模板保护](#73-公共模板保护)
   - [并发竞态防护](#74-并发竞态防护)
8. [性能优化](#8-性能优化)
   - [数据库层](#81-数据库层)
   - [缓存层](#82-缓存层)
   - [代码层](#83-代码层)
9. [错误处理体系](#9-错误处理体系)
   - [错误分类](#91-错误分类)
   - [错误传播链路](#92-错误传播链路)
10. [审计日志](#10-审计日志)
11. [类型系统](#11-类型系统)
    - [前后端类型共享](#111-前后端类型共享)
    - [Zod Schema 类型推导](#112-zod-schema-类型推导)
12. [测试策略](#12-测试策略)
13. [最佳实践总结](#13-最佳实践总结)

---

## 1. 模块概述

问卷模块是 C 端问卷系统的核心业务模块，负责问卷的完整生命周期管理：

- **创建**：用户首次同步问卷到服务器
- **列表**：分页查询用户的问卷列表（支持按状态、关键词检索）
- **详情**：获取单个问卷的完整信息（含组件列表）
- **更新**：再次同步时更新问卷元数据和组件
- **软删除**：逻辑删除问卷，公共模板仅清除本地数据
- **发布**：将草稿问卷设为已发布状态
- **关闭**：将已发布问卷设为已关闭状态
- **申请模板**：将个人问卷提交至公共模板库审核

---

## 2. 架构设计

### 2.1 分层架构

```
┌─────────────────────────────────────────────────┐
│  Routes 层 (survey.routes.ts)                    │
│  职责：路由注册、认证挂载、参数提取、响应发送      │
├─────────────────────────────────────────────────┤
│  Schema 层 (survey.schemas.ts)                   │
│  职责：Zod 请求体/查询参数校验、类型推导           │
├─────────────────────────────────────────────────┤
│  Service 层 (survey.service.ts)                  │
│  职责：核心业务逻辑、事务管理、缓存编排、审计日志   │
├─────────────────────────────────────────────────┤
│  基础设施层                                       │
│  Prisma / Redis / 缓存工具 / 审计工具 / 错误类型   │
└─────────────────────────────────────────────────┘
```

### 2.2 文件职责

| 文件                | 职责                               | 依赖                                                                                           |
| ------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------- |
| `survey.routes.ts`  | 路由定义、中间件挂载、参数校验入口 | `survey.schemas.ts`、`survey.service.ts`                                                       |
| `survey.schemas.ts` | Zod Schema 定义、类型导出          | `zod`                                                                                          |
| `survey.service.ts` | 业务逻辑、事务、缓存、审计         | `cache.ts`、`audit-log.ts`、`pagination.ts`、`errors.ts`、`@common/survey/survey.interface.js` |

### 2.3 数据流全链路

```
前端 API 模块                    Common 类型                     后端
──────────────────────────────────────────────────────────────────────────────
createSurvey(data)  ──→  CreateSurveyRequest  ──→  Zod → CreateSurveyInput  ──→  Service.create()
                     ←──  CreateSurveyResponse  ←──                    ←──

getSurveyList(params) ──→  SurveyListQuery       ──→  Zod → SurveyListQueryInput ──→  Service.list()
                     ←──  SurveyListResponse     ←──                    ←──

getSurveyById(id)    ──→  (void)                ──→  Zod → surveyIdSchema       ──→  Service.getById()
                     ←──  SurveyDetail          ←──                    ←──

updateSurvey(id,data)──→  UpdateSurveyRequest   ──→  Zod → UpdateSurveyInput    ──→  Service.update()
                     ←──  SurveyDetail          ←──                    ←──

applyTemplate(id,data)──→ ApplyTemplateRequest  ──→  Zod → ApplyTemplateInput   ──→  Service.applyTemplate()
                     ←──  ApplyTemplateResponse ←──                    ←──
```

**关键设计原则**：

- 请求类型由 Zod Schema 推导（`z.infer`），确保校验与类型 100% 一致
- 响应类型从 `@common/survey/survey.interface` 导入，确保前后端类型对齐
- Prisma 查询结果通过 `toSurveyListItem` / `toComponentDetail` 工具函数转换为前后端约定的类型

---

## 3. 数据库表结构

### 3.1 核心表关系

```
┌──────────┐       ┌──────────────────┐       ┌──────────┐
│  users   │──1:N──│     surveys      │──1:N──│  survey_ │
│          │       │                  │       │components│
└──────────┘       │  id (BigInt PK)  │       └──────────┘
                   │  user_id (FK)    │              │
                   │  title           │              │ 1:N
                   │  status (0/1/2)  │              ▼
                   │  survey_type     │       ┌──────────┐
                   │  review_status   │       │  answers │
                   │  category        │       └──────────┘
                   │  deleted_at      │              │
                   │  ...             │              │ N:1
                   └────────┬─────────┘              ▼
                            │ 1:N            ┌──────────┐
                            ▼                │responses │
                   ┌──────────┐              └──────────┘
                   │ reviews  │
                   └──────────┘
```

**表字段说明**：

| 表                  | 关键字段          | 说明                                         |
| ------------------- | ----------------- | -------------------------------------------- |
| `surveys`           | `status`          | 0=草稿 / 1=已发布 / 2=已关闭                 |
| `surveys`           | `survey_type`     | `personal`=个人问卷 / `template`=公共模板    |
| `surveys`           | `review_status`   | `none` / `pending` / `approved` / `rejected` |
| `surveys`           | `deleted_at`      | 软删除时间戳，NULL=未删除                    |
| `surveys`           | `total_questions` | 题目数缓存（排除 `text_note` 展示组件）      |
| `surveys`           | `responses_count` | 答卷数缓存                                   |
| `survey_components` | `config`          | JSON 类型，存储组件完整状态配置              |
| `survey_components` | `order_index`     | 排序索引（0-based），决定前端渲染顺序        |
| `survey_components` | `required`        | 0=非必填 / 1=必填                            |

### 3.2 索引策略

```sql
-- 高频：列表查询 WHERE user_id=? AND deleted_at IS NULL
@@index([user_id, deleted_at])

-- 模板市场查询：WHERE survey_type='template' AND review_status='approved'
@@index([survey_type, review_status])

-- 按分类筛选模板
@@index([survey_type, category])

-- 按热门排序
@@index([survey_type, download_count])

-- 按评分排序
@@index([survey_type, rating])

-- 组件查询：按问卷 ID + 排序索引
@@index([survey_id, order_index])

-- 审核记录：检查同一问卷是否已有审核中记录
@@index([survey_id, status])
```

复合索引覆盖了所有高频查询场景，避免全表扫描。

---

## 4. 接口详解

### 4.1 POST /api/surveys — 创建问卷

**业务场景**：用户首次将本地问卷同步到服务器。

**限流**：30 次/分钟

**完整流程**：

```
1. 认证中间件 authenticate
   └─ 提取 Bearer Token → 校验 → 挂载 request.user

2. Zod 校验请求体
   └─ createSurveySchema 校验 title, components 等字段
   └─ 校验失败 → 400 + 错误详情

3. Service.create()
   ├─ Prisma 事务（保证原子性）
   │  ├─ 创建 surveys 记录
   │  │  ├─ survey_type: "personal"
   │  │  ├─ review_status: "none"
   │  │  ├─ total_questions: countQuestions(components)
   │  │  └─ status: 请求传入 || 0 (草稿)
   │  └─ 批量创建 survey_components（createMany）
   │     └─ 优势：单条 SQL 批量插入，避免 N+1
   ├─ 审计日志（异步，不阻塞响应）
   └─ 清除列表缓存（delByPattern）
      └─ 确保下次列表查询拿到最新数据

4. 返回 CreateSurveyResponse
   └─ { survey_id, title, status, created_at }
```

**关键代码片段**：

```typescript
const survey = await this.fastify.prisma.$transaction(async tx => {
  const created = await tx.survey.create({ data: { ... } });
  if (components?.length > 0) {
    await tx.surveyComponent.createMany({
      data: components.map(c => ({
        survey_id: created.id,
        type: c.type,
        config: c.config as object,
        order_index: c.order_index,
        required: c.required
      }))
    });
  }
  return created;
});
```

**响应示例**：

```json
{
  "data": {
    "survey_id": "42",
    "title": "客户满意度调查",
    "status": 0,
    "created_at": "2026-06-20T12:00:00.000Z"
  },
  "code": 0,
  "msg": "创建成功"
}
```

---

### 4.2 GET /api/surveys — 问卷列表

**业务场景**：用户换设备后拉取远程问卷列表，前端做本地持久化。

**限流**：60 次/分钟

**查询参数**：

| 参数        | 类型   | 默认值 | 说明                 |
| ----------- | ------ | ------ | -------------------- |
| `page`      | number | 1      | 页码                 |
| `page_size` | number | 10     | 每页数量（最大 100） |
| `status`    | number | 全部   | 0/1/2 筛选           |
| `keyword`   | string | -      | 标题模糊搜索         |

**完整流程**：

```
1. 认证中间件 authenticate

2. Zod 校验查询参数
   └─ surveyListQuerySchema
   └─ coerce.number() 自动将字符串转为数字
   └─ 校验失败 → 400

3. Service.list()
   ├─ 构建查询条件
   │  └─ WHERE user_id=? AND deleted_at IS NULL
   │  └─ 可选：status=? | title LIKE %keyword%
   ├─ 生成缓存 Key
   │  └─ survey:list:{userId}:{page}:{size}:{status}:{keyword}
   ├─ Cache-Aside 读取
   │  ├─ Redis 命中 → 直接返回
   │  └─ Redis 未命中 ↓
   ├─ 并行查询（Promise.all）
   │  ├─ findMany（分页 + 排序）
   │  └─ count（总数）
   └─ 回填缓存（TTL 300s，后台异步写入）

4. 返回 SurveyListResponse
   └─ { surveys, total, page, page_size }
```

**缓存策略详解**：

```
请求 → CacheKeys.surveyList(userId, page, size, status, keyword)
       │
       ├─ Redis 命中 → 直接返回 JSON.parse(cached)
       │
       └─ Redis 未命中
          ├─ Promise.all([findMany, count])  并行查询
          ├─ toSurveyListItem 转换 BigInt → string
          ├─ set(cacheKey, data, 300)        后台回填
          └─ 返回 data
```

**响应示例**：

```json
{
  "data": {
    "surveys": [
      {
        "id": "42",
        "user_id": "2",
        "title": "客户满意度调查",
        "status": 0,
        "survey_type": "personal",
        "review_status": "none",
        "total_questions": 10,
        "responses_count": 0,
        "created_at": "2026-06-20T12:00:00.000Z",
        "updated_at": "2026-06-20T12:00:00.000Z"
      }
    ],
    "total": 1,
    "page": 1,
    "page_size": 10
  },
  "code": 0,
  "msg": "ok"
}
```

---

### 4.3 GET /api/surveys/:id — 问卷详情

**业务场景**：前端获取单个问卷的完整信息，含组件列表用于渲染。

**限流**：60 次/分钟

**路径参数校验**：

```
:id → surveyIdSchema
      ├─ 正则 /^\d+$/ 校验（仅允许纯数字）
      └─ .transform(val => BigInt(val))  转为 BigInt
```

**完整流程**：

```
1. 认证中间件 authenticate

2. 路径参数校验
   └─ parseSurveyId(id, reply)
   └─ 非法格式 → 400

3. Service.getById()
   ├─ 生成缓存 Key: survey:detail:{surveyId}
   ├─ Cache-Aside 读取
   │  └─ 未命中 ↓
   ├─ Prisma 查询
   │  ├─ findFirst: WHERE id=? AND user_id=? AND deleted_at IS NULL
   │  └─ include: { components: { orderBy: { order_index: "asc" } } }
   ├─ 不存在 → throw AppError("问卷不存在", 404)
   ├─ toSurveyListItem + toComponentDetail 类型转换
   └─ 回填缓存

4. 返回 SurveyDetail
   └─ { ...SurveyListItem, access_code, components }
```

**数据安全**：

- 查询条件包含 `user_id`，确保用户只能查看自己的问卷
- 排除 `deleted_at IS NOT NULL` 的已删除记录

---

### 4.4 PUT /api/surveys/:id — 更新问卷

**业务场景**：用户再次同步问卷到服务器（问卷已存在时更新）。

**限流**：30 次/分钟

**完整流程**：

```
1. 认证中间件 authenticate

2. 路径参数校验 + 请求体 Zod 校验

3. Service.update()
   ├─ 前置校验
   │  ├─ 问卷是否存在（user_id + deleted_at）
   │  └─ 公共模板保护：已审核模板拒绝修改
   │     └─ throw AppError("公共模板不可直接修改，请先复制为个人问卷", 403)
   ├─ Prisma 事务
   │  ├─ 构建 updateData（仅包含传入的字段）
   │  │  ├─ 组件变更 → 更新 total_questions
   │  │  └─ 已审核模板 + 组件变更 → review_status 重置为 "none"
   │  ├─ 更新 surveys 表
   │  └─ 全量替换组件（replaceComponents）
   │     ├─ deleteMany WHERE survey_id=?
   │     └─ createMany 批量写入
   ├─ 审计日志
   └─ 清除缓存 → 返回最新详情

4. 返回 SurveyDetail（最新数据）
```

**部分更新策略**：

- 仅传入的字段才更新（`undefined` 检查），未传入的字段保持不变
- 组件列表为 `undefined` 时不替换组件，传入 `[]` 则清空所有组件

---

### 4.5 DELETE /api/surveys/:id — 删除问卷

**业务场景**：C 端用户删除问卷。

**限流**：20 次/分钟

**业务规则**：

| 问卷类型 | 审核状态   | 行为                           |
| -------- | ---------- | ------------------------------ |
| 个人问卷 | 任意       | 软删除（设置 `deleted_at`）    |
| 公共模板 | `approved` | **不修改远程数据**，仅返回成功 |
| 公共模板 | `pending`  | 软删除 + 关闭审核记录          |

**完整流程**：

```
1. 认证 + 路径参数校验

2. Service.delete()
   ├─ 前置校验：问卷是否存在
   ├─ 公共模板分支
   │  └─ isTemplateApproved → 仅写审计日志，直接返回
   └─ 普通删除分支
      ├─ Prisma 事务
      │  ├─ 审核中 → 关闭审核记录（rejected）
      │  └─ 软删除：deleted_at = NOW(), review_status = "none"
      ├─ 审计日志
      └─ 清除缓存

3. 返回 null (删除成功)
```

**公共模板保护逻辑**：

```typescript
if (isTemplateApproved) {
  await createAuditLog(this.fastify, userId, "delete_survey", "survey", surveyId, {
    note: "公共模板，仅前端清除本地数据"
  });
  return; // 不修改数据库
}
```

---

### 4.6 POST /api/surveys/:id/publish — 发布问卷

**业务场景**：用户将草稿问卷发布上线。

**限流**：10 次/分钟

**状态机校验**：

```
          publish              close
  Draft ────────→ Published ────────→ Closed
  (0)             (1)                (2)

  已发布(1) 再次发布 → 409 "问卷已发布，无需重复操作"
  已关闭(2) 发布     → 409 "已关闭的问卷无法发布"
```

**完整流程**：

```
1. 认证 + 路径参数校验

2. Service.publish()
   ├─ 前置校验：问卷是否存在
   ├─ 状态校验
   │  ├─ status === 1 → 409 "问卷已发布"
   │  └─ status === 2 → 409 "已关闭的问卷无法发布"
   ├─ 更新：status = 1, published_at = NOW()
   ├─ 审计日志
   └─ 清除缓存 → 返回最新详情
```

**响应**：返回 `SurveyDetail`，前端可获取发布后的完整问卷状态。

---

### 4.7 POST /api/surveys/:id/close — 关闭问卷

**业务场景**：用户关闭已发布的问卷（停止收集答卷）。

**限流**：10 次/分钟

**状态机校验**：

```
  已关闭(2) 再次关闭 → 409 "问卷已关闭，无需重复操作"
  草稿(0) 关闭       → 409 "草稿状态的问卷无需关闭"
```

**完整流程**：

```
1. 认证 + 路径参数校验

2. Service.close()
   ├─ 前置校验：问卷是否存在
   ├─ 状态校验
   │  ├─ status === 2 → 409 "问卷已关闭"
   │  └─ status === 0 → 409 "草稿无需关闭"
   ├─ 更新：status = 2, closed_at = NOW()
   ├─ 审计日志
   └─ 清除缓存 → 返回最新详情
```

---

### 4.8 POST /api/surveys/:id/apply-template — 申请共享模板

**业务场景**：用户将个人问卷提交到公共模板库，等待管理员审核。

**限流**：10 次/分钟

**请求体**：

```typescript
{
  components?: SurveyComponentPayload[];  // 可选组件更新
  submit_message?: string;                 // 提交说明（最多 500 字符）
  category: TemplateCategory;             // 必填：模板分类
}
```

**完整流程**：

```
1. 认证 + 路径参数校验 + 请求体校验

2. Service.applyTemplate()
   ├─ 前置校验：问卷是否存在
   └─ Prisma 事务（全在事务内，保证原子性 + 并发安全）
      ├─【事务内检查】是否已有 pending 审核记录
      │  └─ 有 → throw AppError("该问卷已有审核中的申请", 409)
      ├─ 更新问卷
      │  ├─ survey_type: "template"
      │  ├─ review_status: "pending"
      │  ├─ is_public: 1
      │  ├─ category: input.category
      │  └─ 组件变更 → 更新 total_questions
      ├─ 组件同步（可选）
      │  └─ replaceComponents（事务内）
      └─ 创建审核记录
         └─ review: { survey_id, submitter_id, status: "pending", submit_message }
   ├─ 审计日志
   └─ 清除缓存

3. 返回 ApplyTemplateResponse
   └─ { review_id, status: "pending" }
```

**并发竞态防护**：

```typescript
const review = await this.fastify.prisma.$transaction(async tx => {
  // 事务内检查：利用数据库事务隔离性，
  // 防止并发请求同时创建多条审核记录
  const pendingReview = await tx.review.findFirst({
    where: { survey_id: surveyId, status: "pending" }
  });
  if (pendingReview) {
    throw new AppError("该问卷已有审核中的申请", 409);
  }
  // ... 后续操作
});
```

**为什么 `pendingReview` 检查必须在事务内**：

- 若在事务外检查，两个并发请求可能同时读到"无 pending 记录"
- 事务内检查利用数据库的行锁或快照隔离，保证只有一个请求能成功创建

---

## 5. 中间件体系

### 5.1 认证中间件

**注册方式**：

```typescript
// survey.routes.ts
fastify.addHook("preHandler", authenticate);
```

**工作原理**：

```
请求 → 提取 Authorization: Bearer <token>
     → AuthService.verifyToken(token)
        ├─ 从 Redis 缓存读取用户档案（cache:user:auth:{userId}）
        ├─ 缓存未命中 → 查 DB → 回填缓存
        ├─ 校验用户状态（status === 1）
        └─ 返回 { userId: BigInt, email, role }
     → 挂载到 request.user
     → 失败 → 401 "请先登录"
```

**性能优化**：

- AuthService 实例通过 `WeakMap<FastifyInstance, AuthService>` 按实例缓存
- 用户认证档案缓存在 Redis（TTL 300s），避免每次请求查 DB

### 5.2 频率限制

每个接口配置了独立的限流策略，通过 Fastify 的 `config.rateLimit` 声明：

| 接口     | 限流       | 适用场景 |
| -------- | ---------- | -------- |
| 列表查询 | 60 次/分钟 | 高频读取 |
| 详情查询 | 60 次/分钟 | 高频读取 |
| 创建问卷 | 30 次/分钟 | 中等频率 |
| 更新问卷 | 30 次/分钟 | 中等频率 |
| 删除问卷 | 20 次/分钟 | 低频操作 |
| 发布问卷 | 10 次/分钟 | 低频操作 |
| 关闭问卷 | 10 次/分钟 | 低频操作 |
| 申请模板 | 10 次/分钟 | 低频操作 |

### 5.3 全局错误处理

所有未捕获的错误由 `plugins/error-handler.ts` 统一兜底：

```
错误分类：
  1. AppError（含 AuthError / ValidationError）
     → 返回 error.statusCode + 业务信息
  2. Fastify 内置校验错误（schema validation）
     → 400 + 校验详情
  3. Prisma 数据库错误（P2002/P2025/P2003/P2014）
     → 映射为用户友好消息
  4. 其他未预期错误
     → 500 + 脱敏日志
     → 生产环境：隐藏内部错误详情
```

**日志脱敏**：`password`、`token`、`refreshToken`、`authorization` 等敏感字段替换为 `***REDACTED***`。

---

## 6. 缓存策略

### 6.1 Cache-Aside 模式

所有缓存操作遵循标准的 Cache-Aside（旁路缓存）模式：

```
读取流程（getOrSet）：
  ┌─────────┐     miss      ┌─────────┐
  │  Redis  │ ───────────→  │   DB    │
  │  查询   │               │  查询   │
  └────┬────┘               └────┬────┘
       │ hit                     │
       ▼                         ▼
  JSON.parse              ┌──────────┐
  返回缓存数据             │ 回填 Redis │
                          │ (后台异步) │
                          └──────────┘

写入流程：
  DB 写入成功 → 主动删除缓存（del / delByPattern）
               → 下次读取触发 Cache-Aside 回填
```

**为什么用删除而非更新**：

- 删除缓存后，下次请求通过 Cache-Aside 自动回填最新数据
- 避免写操作需要同时更新多个缓存键的复杂逻辑
- 防止缓存与 DB 数据不一致

### 6.2 缓存键规范

```typescript
// 问卷详情
CacheKeys.surveyDetail("42")          → "survey:detail:42"

// 问卷列表（含所有查询参数）
CacheKeys.surveyList("2", 1, 10, "all", "关键词") →
  "survey:list:2:1:10:all:关键词"

// 列表缓存批量失效（通配符匹配）
CacheKeys.surveyListPattern("2")     → "survey:list:2:*"
```

### 6.3 缓存失效策略

每个写操作都调用 `invalidateCache` 确保缓存一致性：

```typescript
private async invalidateCache(surveyId: bigint, userId: bigint): Promise<void> {
  // 删除详情缓存
  await this.cache.del(CacheKeys.surveyDetail(bigIntToStr(surveyId)));
  // 按模式批量删除该用户的所有列表缓存
  await this.cache.delByPattern(CacheKeys.surveyListPattern(bigIntToStr(userId)));
}
```

**`delByPattern` 实现细节**：

- 使用 Redis `SCAN` 命令（非 `KEYS`），避免阻塞 Redis
- 每次 SCAN 100 条 key，批量删除
- Redis 操作失败仅记录 warn 日志，不阻塞业务

### 6.4 降级策略

所有 Redis 操作都包裹了 try-catch：

```typescript
// 读取失败 → 返回 null，触发 DB 查询
try {
  const raw = await redis.get(key);
  // ...
} catch {
  fastify.log.warn(`Redis 读取失败，降级跳过缓存: ${key}`);
  return null;
}

// 写入失败 → 仅记录日志，不阻塞业务
try {
  await redis.set(key, value, "EX", ttl);
} catch {
  fastify.log.warn(`Redis 写入失败: ${key}`);
}
```

**缓存穿透防护**：`getOrSet` 在缓存未命中时查询 DB 并回填，即使 Redis 完全不可用，业务仍能正常运行（仅性能下降）。

---

## 7. 安全防护

### 7.1 认证与授权

- **JWT Bearer Token**：所有接口通过 `authenticate` 中间件校验
- **用户隔离**：所有查询条件强制包含 `user_id`，用户只能操作自己的数据
- **权限校验**：`requireSuperAdmin` 中间件用于 B 端管理接口

### 7.2 输入校验

**多层防护**：

| 层级     | 工具                                                                | 校验内容                               |
| -------- | ------------------------------------------------------------------- | -------------------------------------- |
| 路径参数 | `surveyIdSchema`                                                    | 正则 `/^\d+$/` 限制纯数字，防 SQL 注入 |
| 查询参数 | `surveyListQuerySchema`                                             | `coerce.number()` 类型转换 + 范围校验  |
| 请求体   | `createSurveySchema` / `updateSurveySchema` / `applyTemplateSchema` | Zod 严格校验每个字段类型和长度         |

**关键校验规则**：

```typescript
// 标题：1~500 字符
title: z.string().min(1).max(500);

// 每页题目数：1~50
page_size: z.number().int().min(1).max(50);

// 分类：仅允许枚举值
category: z.enum(["education", "market", "hr", "customer", "event", "other"]);

// 提交说明：空字符串转 undefined
submit_message: z.string()
  .max(500)
  .optional()
  .transform(val => (val === "" ? undefined : val));
```

### 7.3 公共模板保护

已审核通过的公共模板受以下保护：

| 操作     | 保护策略                                   |
| -------- | ------------------------------------------ |
| 更新     | 拒绝修改，返回 403 "请先复制为个人问卷"    |
| 删除     | 不修改远程数据库，仅返回成功               |
| 组件变更 | 重置 `review_status` 为 `none`，需重新审核 |

### 7.4 并发竞态防护

**场景**：用户快速连续点击"申请模板"按钮，导致创建多条审核记录。

**防护方案**：将 `pendingReview` 检查放入 Prisma 事务内部：

```typescript
const review = await this.fastify.prisma.$transaction(async tx => {
  // 事务隔离级别下，只有一个请求能看到"无 pending"的状态
  const pendingReview = await tx.review.findFirst({
    where: { survey_id: surveyId, status: "pending" }
  });
  if (pendingReview) throw new AppError("该问卷已有审核中的申请", 409);
  // ...
});
```

---

## 8. 性能优化

### 8.1 数据库层

| 优化点     | 实现方式                                            | 效果                       |
| ---------- | --------------------------------------------------- | -------------------------- |
| 复合索引   | `[user_id, deleted_at]`、`[survey_id, order_index]` | 覆盖高频查询，避免全表扫描 |
| 批量写入   | `createMany` 替代逐个 `create`                      | 单条 SQL 完成批量插入      |
| 并行查询   | `Promise.all([findMany, count])`                    | 列表查询减少一次 DB 往返   |
| 事务合并   | `$transaction`                                      | 保证原子性，减少连接开销   |
| 题目数缓存 | `total_questions` 字段写时计算                      | 避免每次查询 JOIN 组件表   |
| 答卷数缓存 | `responses_count` 字段                              | 避免 COUNT 查询            |

### 8.2 缓存层

| 优化点   | 实现方式                     | 效果                     |
| -------- | ---------------------------- | ------------------------ |
| 列表缓存 | Cache-Aside 模式，TTL 300s   | 减少 DB 读取压力         |
| 详情缓存 | 按 `surveyId` 缓存，TTL 300s | 高频读取场景命中率高     |
| 批量失效 | `delByPattern` + SCAN        | 一次操作失效所有列表缓存 |
| 后台回填 | `set().catch()` 不 await     | 回填不阻塞响应           |
| 降级策略 | 每个 Redis 操作 try-catch    | Redis 故障不影响业务     |

### 8.3 代码层

| 优化点   | 实现方式                                          | 效果                       |
| -------- | ------------------------------------------------- | -------------------------- |
| 审计异步 | `createAuditLog` 不 await                         | 不阻塞接口响应             |
| 部分更新 | 仅传入字段才构建 updateData                       | 减少不必要的数据传输       |
| 类型转换 | 工具函数 `toSurveyListItem` / `toComponentDetail` | 统一转换逻辑，避免重复代码 |
| 组件替换 | `deleteMany` + `createMany`                       | 比逐条 upsert 更高效       |

---

## 9. 错误处理体系

### 9.1 错误分类

```typescript
// 业务错误
throw new AppError("问卷不存在", 404);
throw new AppError("问卷已发布，无需重复操作", 409);
throw new AppError("公共模板不可直接修改", 403);

// 认证错误
throw new AuthError("Token 无效", 401);

// 校验错误
throw new ValidationError("参数校验失败", details);
```

**统一响应格式**：

```json
{
  "data": null,
  "code": 404,
  "msg": "问卷不存在"
}
```

### 9.2 错误传播链路

```
Service 层 throw AppError
  → Route 层（未捕获，向上冒泡）
    → 全局错误处理器 error-handler.ts
      → 判断 error instanceof AppError
        → 提取 statusCode + message
        → 返回标准化 JSON
        → 生产环境：隐藏内部错误详情
```

**Prisma 错误映射**：

| Prisma 错误码 | HTTP 状态码 | 用户消息                     |
| ------------- | ----------- | ---------------------------- |
| P2002         | 409         | 数据已存在，请检查唯一字段   |
| P2025         | 404         | 请求的资源不存在或已被删除   |
| P2003         | 400         | 关联数据不存在，请检查引用   |
| P2014         | 400         | 数据关联冲突，请先删除关联项 |

---

## 10. 审计日志

所有写操作（创建、更新、删除、发布、关闭、申请模板）均记录审计日志：

```typescript
await createAuditLog(this.fastify, userId, "create_survey", "survey", survey.id, {
  title: survey.title
});
```

**审计日志字段**：

| 字段            | 说明                                            |
| --------------- | ----------------------------------------------- |
| `user_id`       | 操作者 ID                                       |
| `action`        | 操作类型（如 `create_survey`、`delete_survey`） |
| `resource_type` | 资源类型（如 `survey`）                         |
| `resource_id`   | 资源 ID                                         |
| `details`       | 操作详情 JSON                                   |

**设计原则**：

- 审计写入失败不阻塞业务（仅 warn 日志）
- 异步执行，不 await 响应
- 统一 `createAuditLog` 工具函数，避免各 Service 重复实现

---

## 11. 类型系统

### 11.1 前后端类型共享

问卷模块的类型定义集中在 `packages/common/src/survey/survey.interface.ts`，前后端通过同一份类型定义确保数据契约一致：

```
packages/common/src/survey/survey.interface.ts
  ├── 枚举：SurveyStatus, SurveyType, ReviewStatus, TemplateCategory
  ├── 实体：SurveyListItem, SurveyDetail, SurveyComponentPayload, SurveyComponentDetail
  ├── 请求体：CreateSurveyRequest, UpdateSurveyRequest, ApplyTemplateRequest
  ├── 响应体：CreateSurveyResponse, SurveyListResponse, ApplyTemplateResponse
  └── API 映射：SurveyApi
```

**后端引用方式**：

```typescript
// tsconfig.json 配置路径别名
"paths": { "@common/*": ["../../packages/common/src/*"] }

// Service 层导入
import type { SurveyDetail, CreateSurveyResponse } from "@common/survey/survey.interface.js";
```

**前端引用方式**：

```typescript
import type { CreateSurveyRequest, SurveyDetail } from "@common/survey/survey.interface";
```

### 11.2 Zod Schema 类型推导

请求体类型由 Zod Schema 自动推导，确保校验逻辑与类型定义 100% 同步：

```typescript
// 定义 Schema
export const createSurveySchema = z.object({ ... });

// 自动推导类型（无需手动维护）
export type CreateSurveyInput = z.infer<typeof createSurveySchema>;
```

---

## 12. 测试策略

**测试文件**：

| 文件                     | 类型     | 覆盖范围                                  |
| ------------------------ | -------- | ----------------------------------------- |
| `survey.service.spec.ts` | 单元测试 | Service 层全部方法 + 边界条件             |
| `survey.routes.spec.ts`  | 集成测试 | 路由绑定 + 认证拦截 + 请求校验 + 响应格式 |

**测试覆盖的关键场景**：

- 正常流程：创建、列表、详情、更新、删除、发布、关闭、申请模板
- 异常边界：不存在的问卷、已删除的问卷、公共模板保护
- 状态机校验：已发布再次发布、已关闭再次关闭、草稿关闭
- 并发竞态：重复申请模板 → 409
- 缓存策略：命中缓存 / 未命中缓存 / 缓存失效
- 审计日志：各操作是否写入审计日志
- 权限校验：未认证 → 401

**测试工具**：

```typescript
// 统一的 Mock 工厂
createFastifyMock(); // 模拟 Fastify 实例（含 prisma、redis）
createPrismaMock(); // 模拟 Prisma 客户端
createRedisMock(); // 模拟 Redis 客户端
```

---

## 13. 最佳实践总结

### 代码组织

1. **单一职责**：Routes 只做路由 + 校验，Service 只做业务逻辑，Schemas 只做校验定义
2. **类型先行**：从 Zod Schema 推导请求类型，从 Common 包导入响应类型
3. **工具函数复用**：`toSurveyListItem` / `toComponentDetail` / `replaceComponents` / `invalidateCache` 统一封装

### 数据安全

1. **用户隔离**：所有查询强制 `user_id` 条件
2. **软删除**：通过 `deleted_at` 实现，查询时排除已删除记录
3. **公共模板保护**：已审核模板拒绝修改/删除
4. **输入校验**：多层防护（路径参数正则 + 查询参数 Zod + 请求体 Zod）

### 事务与并发

1. **Prisma 事务**：创建问卷、更新问卷、申请模板均使用事务保证原子性
2. **竞态防护**：`pendingReview` 检查放入事务内部，利用数据库隔离级别
3. **状态机校验**：发布/关闭操作校验当前状态，避免非法状态转换

### 缓存策略

1. **Cache-Aside**：读缓存 → 未命中查 DB → 回填缓存
2. **写后删除**：DB 写入成功后主动删除缓存，避免脏数据
3. **批量失效**：`delByPattern` 支持通配符匹配，一次操作失效所有相关缓存
4. **降级设计**：所有 Redis 操作 try-catch，故障时自动降级到 DB 查询

### 性能优化

1. **批量操作**：`createMany` 替代逐个 `create`
2. **并行查询**：`Promise.all` 同时执行 `findMany` + `count`
3. **异步审计**：审计日志不 await，不阻塞响应
4. **缓存命中**：高频读取场景（列表、详情）通过缓存减少 DB 压力

### 可观测性

1. **审计日志**：所有写操作记录审计日志（操作者、操作类型、资源、详情）
2. **结构化日志**：通过 Fastify 日志系统记录关键操作和异常
3. **日志脱敏**：敏感字段（密码、Token）在日志中自动脱敏
4. **健康检查**：`/health` 端点探测 PostgreSQL、Redis、RabbitMQ 连通性
