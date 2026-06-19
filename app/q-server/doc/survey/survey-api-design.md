# 问卷模块 C 端接口设计方案

> 版本：1.0
> 日期：2026-06-19
> 目标：`app/q-server/src/modules/survey`
> 范围：仅 C 端业务（问卷同步、删除、列表、申请共享模板），不涉及 B 端管理后台

---

## 目录

1. [需求分析](#1-需求分析)
2. [Schema 变更](#2-schema-变更)
3. [API 接口设计](#3-api-接口设计)
4. [模块架构](#4-模块架构)
5. [缓存策略](#5-缓存策略)
6. [安全与审计](#6-安全与审计)
7. [实施清单](#7-实施清单)

---

## 1. 需求分析

### 1.1 四个核心业务

| 序号 | 业务              | 前端触发                            | 核心逻辑                                                                     |
| ---- | ----------------- | ----------------------------------- | ---------------------------------------------------------------------------- |
| 1    | 问卷同步 (Upsert) | `Layout/index.vue` → `syncSurvey()` | 首次同步 → 创建记录；再次同步 → 更新记录。同步≠发布，需管理员审核后才可发布  |
| 2    | 问卷删除          | 问卷列表页 → 删除按钮               | 软删除；公共模板不可删远程数据；审核中的问卷一并删除，避免管理员看见异常记录 |
| 3    | 问卷列表          | 主页加载 / 换设备后恢复             | 分页查询远程仓库中的问卷列表，前端本地持久化                                 |
| 4    | 申请共享模板      | 预览页 →`handleSubmitReview()`      | 保存最新问卷数据 → 上传 → 标记 `survey_type=template` → 创建审核记录         |

### 1.2 前端编排现状

前端 `syncSurvey()` 已编排好 `createSurvey` / `updateSurvey` 的调用逻辑：

```
syncSurvey(surveyInfo) {
  if (surveyInfo.remote_survey_id) {
    // 已同步过 → PUT /api/surveys/:id
    await updateSurvey(surveyInfo.remote_survey_id, { ... })
  } else {
    // 首次同步 → POST /api/surveys
    const res = await createSurvey({ ... })
    // 保存 remote_survey_id
  }
}
```

**结论**：后端只需实现标准 `POST /api/surveys`（创建）和 `PUT /api/surveys/:id`（更新），无需新增专门的 `/sync` 接口。

### 1.3 前端已定义的 API 客户端

| 函数            | 方法     | 路径                          | 已实现 |
| --------------- | -------- | ----------------------------- | ------ |
| `createSurvey`  | `POST`   | `/surveys`                    | 是     |
| `getSurveyList` | `GET`    | `/surveys`                    | 是     |
| `getSurveyById` | `GET`    | `/surveys/:id`                | 是     |
| `updateSurvey`  | `PUT`    | `/surveys/:id`                | 是     |
| `deleteSurvey`  | `DELETE` | `/surveys/:id`                | 是     |
| `publishSurvey` | `POST`   | `/surveys/:id/publish`        | 是     |
| `closeSurvey`   | `POST`   | `/surveys/:id/close`          | 是     |
| （待新增）      | `POST`   | `/surveys/:id/apply-template` | 否     |

---

## 2. Schema 变更

### 2.1 当前 `surveys` 表缺少的字段

`User` 表已有 `deleted_at` 软删除字段，但 `Survey` 表**没有**。本需求中的"软删除问卷"必须依赖此字段。

### 2.2 变更内容

```diff
model Survey {
  id              BigInt         @id @default(autoincrement())
  user_id         BigInt
  title           String
  description     String?
  status          Int            @default(0)
  page_size       Int            @default(10)
  total_questions Int            @default(0)
  responses_count Int            @default(0)
  is_public       Int            @default(0)
  access_code     String?
  created_at      DateTime       @default(now())
  updated_at      DateTime       @updatedAt
  published_at    DateTime?
  closed_at       DateTime?
+ deleted_at      DateTime?      // 软删除时间（NULL = 未删除）
  survey_type     SurveyType     @default(personal)
  category        String?
  cover_url       String?
  download_count  Int            @default(0)
  rating          Decimal?       @default(0) @db.Decimal(2, 1)
  review_status   ReviewStatus   @default(none)

  // ... 关联关系保持不变 ...

  @@index([user_id])
  @@index([status])
  @@index([created_at])
  @@index([is_public])
+ @@index([deleted_at])
+ @@index([user_id, deleted_at])        // 高频：列表查询 WHERE user_id=? AND deleted_at IS NULL
  @@index([survey_type, review_status])
  @@index([survey_type, category])
  @@index([survey_type, download_count])
  @@index([survey_type, rating])
  @@map("surveys")
}
```

### 2.3 迁移命令

```bash
cd app/q-server
npx prisma migrate dev --name add_survey_soft_delete
```

### 2.4 其他表无需变更

- `survey_components` — 结构完整，`config` 字段为 `Json` 类型，存储清洗后的组件配置
- `responses` / `answers` — 答卷相关，不在本次需求范围
- `reviews` — 审核记录表已存在，`apply-template` 接口直接复用
- `template_ratings` — 模板评分表，不在本次需求范围

---

## 3. API 接口设计

### 3.1 接口总览

| 方法     | 路径                              | 业务         | 限流   | 说明                  |
| -------- | --------------------------------- | ------------ | ------ | --------------------- |
| `POST`   | `/api/surveys`                    | 同步-创建    | 30/min | 首次同步，创建问卷    |
| `GET`    | `/api/surveys`                    | 列表         | 60/min | 分页获取用户问卷列表  |
| `GET`    | `/api/surveys/:id`                | 详情         | 60/min | 获取问卷+组件完整数据 |
| `PUT`    | `/api/surveys/:id`                | 同步-更新    | 30/min | 再次同步，更新问卷    |
| `DELETE` | `/api/surveys/:id`                | 删除         | 20/min | 软删除问卷            |
| `POST`   | `/api/surveys/:id/publish`        | 发布         | 10/min | 发布问卷              |
| `POST`   | `/api/surveys/:id/close`          | 关闭         | 10/min | 关闭问卷              |
| `POST`   | `/api/surveys/:id/apply-template` | 申请共享模板 | 10/min | 提交模板审核申请      |

---

### 3.2 POST /api/surveys — 创建问卷（首次同步）

**认证**：`authenticate`

**限流**：`30 req/min`

**请求体**：`CreateSurveyRequest`（Zod 校验）

```typescript
{
  title: string;              // 必填，max 500
  description?: string;       // 可选
  page_size?: number;         // 默认 10
  is_public?: 0 | 1;          // 默认 0
  status?: 0 | 1 | 2;         // 默认 0
  access_code?: string;
  components: Array<{
    type: string;             // snake_case，如 "single_select"
    config: Record<string, unknown>;  // 清洗后的组件配置
    order_index: number;      // 排序索引
    required: 0 | 1;          // 是否必填
  }>;
}
```

**业务逻辑**：

1. Zod 校验请求体 → 失败返回 400
2. 统计 `total_questions`（排除 `text_note` 类型组件）
3. 使用 Prisma 事务：
   - 创建 `surveys` 记录（`survey_type=personal`，`review_status=none`）
   - 批量创建 `survey_components` 记录
4. 写审计日志 `create_survey`
5. 清除 `user:{userId}:surveys:*` 缓存
6. 返回 `{ survey_id, title, status, created_at }`

**响应**：

```json
{
  "code": 0,
  "msg": "创建成功",
  "data": {
    "survey_id": "1",
    "title": "2026 年度员工满意度调查",
    "status": 0,
    "created_at": "2026-06-19T10:00:00.000Z"
  }
}
```

---

### 3.3 GET /api/surveys — 问卷列表

**认证**：`authenticate`

**限流**：`60 req/min`

**查询参数**（Zod 校验）：

| 参数        | 类型     | 默认值 | 说明                               |
| ----------- | -------- | ------ | ---------------------------------- |
| `page`      | `number` | 1      | 页码，min 1                        |
| `page_size` | `number` | 10     | 每页条数，min 1，max 100           |
| `status`    | `number` | —      | 可选筛选：0 草稿 / 1 发布 / 2 关闭 |
| `keyword`   | `string` | —      | 可选，标题模糊搜索                 |

**业务逻辑**：

1. Zod 校验查询参数 → 失败返回 400
2. 构建 Prisma 查询条件：
   - `user_id = current_user`
   - `deleted_at IS NULL`
   - `status`（如有）
   - `title LIKE %keyword%`（如有）
3. 对 `survey_type = template` 且 `review_status = approved` 的问卷，追加 `survey_type`/`category`/`download_count`/`rating` 等模板市场字段
4. 按 `updated_at DESC` 排序
5. 先查 Redis 缓存（key: `list:{userId}:{page}:{pageSize}:{status}:{keywordHash}`），miss 则查 DB 并回填
6. 返回分页结果

**响应**：

```json
{
  "code": 0,
  "msg": "ok",
  "data": {
    "surveys": [
      {
        "id": "1",
        "user_id": "1",
        "title": "2026 年度员工满意度调查",
        "description": null,
        "status": 0,
        "page_size": 10,
        "total_questions": 5,
        "responses_count": 0,
        "is_public": 0,
        "survey_type": "personal",
        "review_status": "none",
        "created_at": "2026-06-19T10:00:00.000Z",
        "updated_at": "2026-06-19T10:00:00.000Z",
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

---

### 3.4 GET /api/surveys/:id — 问卷详情

**认证**：`authenticate`

**限流**：`60 req/min`

**业务逻辑**：

1. 查询问卷记录，校验 `user_id = current_user` 且 `deleted_at IS NULL` → 否则 404
2. 查询 `survey_components`，按 `order_index ASC` 排序
3. 先查 Redis 缓存（key: `detail:{surveyId}`），miss 则查 DB 并回填
4. 返回 `SurveyDetail`（含 `components` 数组）

**响应**：

```json
{
  "code": 0,
  "msg": "ok",
  "data": {
    "id": "1",
    "title": "2026 年度员工满意度调查",
    "components": [
      {
        "id": "1",
        "survey_id": "1",
        "type": "text_note",
        "config": {
          "title": { "status": "2026 年度员工满意度调查", "isShow": true, "name": "title-editor" },
          "type": { "currentStatus": 0, "status": [0, 1], "isShow": false, "name": "text-type-editor" }
        },
        "order_index": 0,
        "required": 0,
        "created_at": "2026-06-19T10:00:00.000Z",
        "updated_at": "2026-06-19T10:00:00.000Z"
      }
    ]
  }
}
```

> **注意**：`config` 字段中的 `name` 属性保留，前端 `restoreComponentStatus` 通过 `name` 恢复 `editCom` 引用。

---

### 3.5 PUT /api/surveys/:id — 更新问卷（再次同步）

**认证**：`authenticate`

**限流**：`30 req/min`

**请求体**：`UpdateSurveyRequest`（Zod 校验，所有字段可选）

```typescript
{
  title?: string;
  description?: string;
  status?: 0 | 1 | 2;
  page_size?: number;
  is_public?: 0 | 1;
  access_code?: string;
  components?: SurveyComponentPayload[];  // 全量替换
}
```

**业务逻辑**：

1. 校验问卷存在且 `user_id = current_user` 且 `deleted_at IS NULL` → 否则 404
2. **公共模板保护**：若 `survey_type = template` 且 `review_status = approved` → 拒绝更新（403，`"公共模板不可直接修改，请先复制为个人问卷"`）
3. 若 `components` 非空：
   - 统计 `total_questions`
   - 使用 Prisma 事务：删除旧组件 + 批量创建新组件
4. 更新问卷元数据字段
5. 若 `review_status = approved` 且 `components` 有变更 → 重置 `review_status = none`（模板已修改，需重新审核）
6. 写审计日志 `update_survey`
7. 清除缓存 `detail:{surveyId}` 和 `list:{userId}:*`
8. 返回 `SurveyDetail`

**响应**：同 `GET /api/surveys/:id`

---

### 3.6 DELETE /api/surveys/:id — 删除问卷（软删除）

**认证**：`authenticate`

**限流**：`20 req/min`

**业务逻辑**：

1. 校验问卷存在且 `user_id = current_user` → 否则 404
2. **公共模板保护**：
   - 若 `survey_type = template` 且 `review_status = approved`：
     - 设置 `deleted_at = now()`（仅本地标记删除）
     - 远程仓库的模板数据**不修改**（其他用户仍可使用）
     - 返回成功，msg 注明"仅本地删除，公共模板不受影响"
3. **审核中问卷处理**：
   - 若 `review_status = pending`：
     - 更新关联的 `reviews` 记录：`status = rejected`，`review_comment = "问卷已由用户删除"`
     - 设置 `review_status = none`
4. 设置 `deleted_at = now()`
5. 写审计日志 `delete_survey`
6. 清除缓存 `detail:{surveyId}` 和 `list:{userId}:*`
7. 返回 `null`

**响应**：

```json
{
  "code": 0,
  "msg": "删除成功",
  "data": null
}
```

---

### 3.7 POST /api/surveys/:id/publish — 发布问卷

**认证**：`authenticate`

**限流**：`10 req/min`

**业务逻辑**：

1. 校验问卷存在且 `user_id = current_user` 且 `deleted_at IS NULL` → 否则 404
2. 设置 `status = 1`，`published_at = now()`
3. 写审计日志 `publish_survey`
4. 清除缓存

**响应**：同 `GET /api/surveys/:id`

---

### 3.8 POST /api/surveys/:id/close — 关闭问卷

**认证**：`authenticate`

**限流**：`10 req/min`

**业务逻辑**：

1. 校验问卷存在且 `user_id = current_user` 且 `deleted_at IS NULL` → 否则 404
2. 设置 `status = 2`，`closed_at = now()`
3. 写审计日志 `close_survey`
4. 清除缓存

**响应**：同 `GET /api/surveys/:id`

---

### 3.9 POST /api/surveys/:id/apply-template — 申请共享模板

**认证**：`authenticate`

**限流**：`10 req/min`

**请求体**（Zod 校验）：

```typescript
{
  components?: SurveyComponentPayload[];  // 可选，提交前保存最新问卷数据
  submit_message?: string;                // 可选，提交说明（max 500 字符）
  category?: string;                      // 必填，模板分类
}
```

**业务逻辑**：

1. 校验问卷存在且 `user_id = current_user` 且 `deleted_at IS NULL` → 否则 404
2. 校验 `category` 为有效枚举值（`education` / `market` / `hr` / `customer` / `event` / `other`）
3. 校验同一问卷不能有 `pending` 状态的审核记录 → 否则 409（`"该问卷已有审核中的申请"`）
4. 若 `components` 非空 → 更新问卷数据（同 `PUT` 逻辑）
5. 使用 Prisma 事务：
   - 更新问卷：`survey_type = template`，`review_status = pending`，`is_public = 1`，`category`
   - 创建 `reviews` 记录（`submitter_id = current_user`，`status = pending`）
6. 写审计日志 `apply_template`
7. 清除缓存
8. 返回 `{ review_id, status: "pending" }`

**响应**：

```json
{
  "code": 0,
  "msg": "模板申请已提交，等待管理员审核",
  "data": {
    "review_id": "1",
    "status": "pending"
  }
}
```

**错误码**：

| code | 说明                         |
| ---- | ---------------------------- |
| 409  | 该问卷已有审核中的申请       |
| 400  | 分类参数无效（不在枚举范围） |
| 400  | 提交说明超过 500 字符        |

---

## 4. 模块架构

### 4.1 文件结构

```
app/q-server/src/modules/survey/
├── survey.routes.ts       # 路由定义（8 个端点）
├── survey.service.ts      # 业务逻辑（CRUD + 事务 + 缓存）
├── survey.schemas.ts      # Zod 校验 Schema（请求体 + 查询参数）
└── doc/
    └── survey-api-design.md  # 本文档
```

### 4.2 依赖关系

```
survey.routes.ts
  ├── authenticate (middleware)      — 来自 modules/user/auth.middleware.ts
  ├── survey.schemas.ts             — Zod 校验
  ├── survey.service.ts             — 业务逻辑
  │   ├── fastify.prisma            — PrismaClient（插件注入）
  │   ├── fastify.redis             — Redis 客户端（插件注入）
  │   ├── createCache()             — 来自 utils/cache.ts
  │   ├── createAuditLog()          — 来自 utils/audit-log.ts
  │   ├── buildPagination()         — 来自 utils/pagination.ts
  │   ├── paginatedResult()         — 来自 utils/pagination.ts
  │   └── AppError / ValidationError — 来自 utils/errors.ts
  └── parseAndRespond()             — 来自 utils/zod.ts
```

### 4.3 路由注册

在 `app/q-server/src/routes/index.ts` 中新增：

```typescript
import surveyRoutes from "../modules/survey/survey.routes.js";

// 注册到 /api 前缀下
fastify.register(surveyRoutes, { prefix: "/api" });
```

### 4.4 Service 设计要点

`SurveyService` 类：

```typescript
class SurveyService {
  private cache: CacheClient;

  constructor(private fastify: FastifyInstance) {
    this.cache = createCache(fastify);
  }

  // 创建
  async create(userId: bigint, data: CreateSurveyRequest): Promise<CreateSurveyResponse>;

  // 列表
  async list(userId: bigint, query: SurveyListQuery): Promise<PaginatedResult<SurveyListItem>>;

  // 详情
  async getById(userId: bigint, surveyId: bigint): Promise<SurveyDetail>;

  // 更新
  async update(userId: bigint, surveyId: bigint, data: UpdateSurveyRequest): Promise<SurveyDetail>;

  // 软删除
  async delete(userId: bigint, surveyId: bigint): Promise<void>;

  // 发布
  async publish(userId: bigint, surveyId: bigint): Promise<SurveyDetail>;

  // 关闭
  async close(userId: bigint, surveyId: bigint): Promise<SurveyDetail>;

  // 申请模板
  async applyTemplate(userId: bigint, surveyId: bigint, data: ApplyTemplateRequest): Promise<ApplyTemplateResponse>;

  // 私有工具方法
  private verifyOwnership(surveyId: bigint, userId: bigint): Promise<Survey>;
  private countQuestions(components: SurveyComponentPayload[]): number;
  private replaceComponents(surveyId: bigint, components: SurveyComponentPayload[]): Promise<void>;
  private invalidateCache(surveyId: bigint, userId: bigint): Promise<void>;
  private toSurveyListItem(survey: Survey): SurveyListItem;
  private toSurveyDetail(survey: Survey & { components: SurveyComponent[] }): SurveyDetail;
}
```

---

## 5. 缓存策略

### 5.1 缓存 Key 设计

| 缓存 Key                      | 数据类型     | TTL  | 失效时机                     |
| ----------------------------- | ------------ | ---- | ---------------------------- |
| `survey:detail:{surveyId}`    | SurveyDetail | 300s | 更新/删除/发布/关闭/申请模板 |
| `survey:list:{userId}:{hash}` | 分页结果     | 120s | 创建/更新/删除               |

> `{hash}` = MD5(`${page}:${pageSize}:${status}:${keyword}`)，短哈希避免 Key 过长

### 5.2 缓存模式

- **读取**：Cache-Aside 模式（先查 Redis，miss 则查 DB 并回填）
- **写入**：Write-Invalidate 模式（DB 写入成功后，主动删除缓存）
- **降级**：Redis 不可用时自动跳过缓存，直接查 DB（`utils/cache.ts` 已内置降级逻辑）

### 5.3 缓存粒度

- 列表接口 TTL 较短（120s），因为列表数据变化频繁
- 详情接口 TTL 较长（300s），因为单条问卷数据相对稳定
- 不缓存 `surveys` 表的全量数据，避免内存膨胀

---

## 6. 安全与审计

### 6.1 认证

所有接口均需通过 `authenticate` 中间件，请求头携带 `Authorization: Bearer <access_token>`。

### 6.2 权限校验

| 接口     | 校验内容              |
| -------- | --------------------- |
| 创建     | 需登录即可            |
| 列表     | 仅返回当前用户的问卷  |
| 详情     | 校验 `user_id` 所有权 |
| 更新     | 校验 `user_id` 所有权 |
| 删除     | 校验 `user_id` 所有权 |
| 发布     | 校验 `user_id` 所有权 |
| 关闭     | 校验 `user_id` 所有权 |
| 申请模板 | 校验 `user_id` 所有权 |

### 6.3 限流

| 接口           | 限流策略 | 依据                               |
| -------------- | -------- | ---------------------------------- |
| 创建/更新      | 30/min   | 中等频率，防止恶意批量创建         |
| 列表/详情      | 60/min   | 高频操作，但相对安全               |
| 删除           | 20/min   | 保护性操作，低频                   |
| 发布/关闭/模板 | 10/min   | 低频操作，但涉及状态变更，防止滥用 |

### 6.4 审计日志

所有写操作均记录到 `audit_logs` 表：

| 操作     | `action`         | `resource_type` | `resource_id` |
| -------- | ---------------- | --------------- | ------------- |
| 创建问卷 | `create_survey`  | `survey`        | survey_id     |
| 更新问卷 | `update_survey`  | `survey`        | survey_id     |
| 删除问卷 | `delete_survey`  | `survey`        | survey_id     |
| 发布问卷 | `publish_survey` | `survey`        | survey_id     |
| 关闭问卷 | `close_survey`   | `survey`        | survey_id     |
| 申请模板 | `apply_template` | `survey`        | survey_id     |

### 6.5 输入校验

- 所有请求体/查询参数通过 Zod Schema 校验（`parseAndRespond` / `parseQueryAndRespond`）
- `title` 长度限制 1-500 字符
- `submit_message` 长度限制 500 字符
- `category` 枚举校验（`education` / `market` / `hr` / `customer` / `event` / `other`）
- `page` min 1，`page_size` min 1 max 100

---

## 7. 实施清单

### 7.1 数据库变更

- [ ] Prisma Schema：`surveys` 表添加 `deleted_at` 字段 + 2 个索引
- [ ] 执行 `npx prisma migrate dev --name add_survey_soft_delete`
- [ ] 验证迁移 SQL 正确性

### 7.2 新建文件

| 文件                                   | 说明               |
| -------------------------------------- | ------------------ |
| `src/modules/survey/survey.routes.ts`  | 路由定义（8 端点） |
| `src/modules/survey/survey.service.ts` | 业务逻辑           |
| `src/modules/survey/survey.schemas.ts` | Zod 校验 Schema    |

### 7.3 修改文件

| 文件                   | 变更内容                      |
| ---------------------- | ----------------------------- |
| `src/routes/index.ts`  | 注册 `surveyRoutes`           |
| `prisma/schema.prisma` | 添加 `deleted_at` 字段 + 索引 |

### 7.4 实施顺序

1. **Schema 变更** → 数据库迁移
2. **`survey.schemas.ts`** → Zod 校验 Schema（独立，无依赖）
3. **`survey.service.ts`** → 业务逻辑（依赖 Schema + Prisma + Cache + Audit）
4. **`survey.routes.ts`** → 路由定义（依赖 Service + Middleware + Schema）
5. **`routes/index.ts`** → 注册路由
6. **测试验证** → 使用前端 mock 模式或 Postman 逐接口测试

### 7.5 边界情况处理清单

| 场景                           | 处理方式                                     |
| ------------------------------ | -------------------------------------------- |
| 问卷不存在                     | 返回 404                                     |
| 问卷不属于当前用户             | 返回 404（不暴露存在性）                     |
| 问卷已删除                     | 返回 404                                     |
| 公共模板被修改                 | 返回 403，提示先复制为个人问卷               |
| 公共模板被删除                 | 仅本地标记删除，远程数据不变                 |
| 审核中的问卷被删除             | 同时关闭审核记录（status=rejected）          |
| 同一问卷重复申请模板（审核中） | 返回 409                                     |
| 组件列表为空                   | 允许创建，`total_questions=0`                |
| 大数据量 component（>100 个）  | 事务批量写入，Prisma `createMany` 优化       |
| Redis 不可用                   | 自动降级，直接查 DB（`utils/cache.ts` 内置） |
| 参数校验失败                   | 返回 400 + 具体错误信息                      |

---

## 附录：前端对齐说明

### A.1 序列化数据已清洗

前端 `serializeComponents` 函数已调用 `cleanConfig` 去除 `editCom` 和 `id` 字段，后端收到的 `config` JSON 仅包含业务渲染数据（`name` / `status` / `currentStatus` / `isShow` / `isUse` 等），可直接存储。

### A.2 反序列化兼容

前端 `restoreComponentStatus` 函数通过 `name` 字段恢复 `editCom` 引用，不依赖 `id` 和 `editCom` 字段。后端返回的 `config` JSON 中必须保留 `name` 字段。

### A.3 前端需新增的 API 调用

```typescript
// src/api/modules/survey/index.ts 中新增
export const applyTemplate = (
  surveyId: string,
  data: { components?: SurveyComponentPayload[]; submit_message?: string; category: string }
): Promise<ApiResponse<{ review_id: string; status: string }>> =>
  serverClient.post(`/surveys/${surveyId}/apply-template`, data);
```

### A.4 `SurveyDBData` 需新增字段

前端 IndexedDB 存储类型需新增 `remote_survey_id?: string` 字段，用于关联远程问卷 ID。
