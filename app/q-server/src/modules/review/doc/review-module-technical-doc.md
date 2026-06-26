# 审核模块技术文档

> 版本：v2.0  
> 更新日期：2026-06-23  
> 适用范围：`app/q-server/src/modules/review`

---

## 目录

- [一、模块概述](#一模块概述)
- [二、数据模型](#二数据模型)
- [三、审核类型与业务流程图](#三审核类型与业务流程图)
- [四、API 接口定义](#四api-接口定义)
- [五、代码架构](#五代码架构)
- [六、核心业务逻辑](#六核心业务逻辑)
- [七、上下游系统对接关系](#七上下游系统对接关系)
- [八、安全与限流策略](#八安全与限流策略)
- [九、数据流与缓存](#九数据流与缓存)
- [十、错误处理](#十错误处理)
- [十一、关键技术点与注意事项](#十一关键技术点与注意事项)

---

## 一、模块概述

### 1.1 功能定位

审核模块是问卷管理平台的核心管控功能，负责对所有个人问卷的合规性审核及公共模板上架审核。

### 1.2 核心职责

| 职责         | 说明                                             |
| ------------ | ------------------------------------------------ |
| 问卷审核     | 管理员审核用户提交的个人问卷，通过后方可发布     |
| 模板审核     | 管理员审核用户提交的模板申请，通过后上架模板市场 |
| 审核记录管理 | 分页查询审核列表，支持按审核类型、状态筛选       |
| 审核详情查看 | 查看审核记录及对应问卷的完整题目内容             |
| 审计追溯     | 所有审核操作写入审计日志，支持审计追溯           |

### 1.3 两阶段审核机制

系统设计了双阶段审核流程：

```
阶段一：问卷审核（review_type = "survey"）
  用户提交 → 管理员审核 → review_status: approved → 可发布

阶段二：模板审核（review_type = "template"）
  前提：问卷审核已通过 (review_status = "approved")
  用户申请 → 管理员审核 → survey_type: template → 模板市场上架
```

### 1.4 文件清单

```
src/modules/review/
├── index.ts                    # 模块统一导出入口
├── review.routes.ts            # 路由定义（4 个 API 端点）
├── review.schemas.ts           # Zod 请求/响应校验 Schema
├── review.service.ts           # 业务逻辑层（~392 行）
└── doc/
    ├── review-implementation-plan.md   # 初始实现方案（v1.0）
    └── review-module-technical-doc.md  # 本技术文档（v2.0）
```

---

## 二、数据模型

### 2.1 枚举定义

```prisma
enum SurveyType {
  personal   // 个人问卷（默认值）
  template   // 公共模板（仅模板审核通过后变更）
}

enum ReviewStatus {
  none       // 未申请审核（默认值）
  pending    // 审核中
  approved   // 已通过
  rejected   // 已驳回
}

enum ReviewType {
  survey     // 问卷审核
  template   // 模板审核
}
```

### 2.2 核心表结构 — `surveys` 表（审核相关字段）

| 字段            | 类型           | 默认值     | 说明                         |
| --------------- | -------------- | ---------- | ---------------------------- |
| `survey_type`   | `SurveyType`   | `personal` | 问卷类型                     |
| `review_status` | `ReviewStatus` | `none`     | 审核状态                     |
| `category`      | `String?`      | `null`     | 模板分类（申请模板时写入）   |
| `is_public`     | `Int`          | `0`        | 是否公开（申请模板时设为 1） |

**索引**：

- `@@index([survey_type, review_status])` — 模板市场查询
- `@@index([survey_type, category])` — 分类筛选

### 2.3 核心表结构 — `reviews` 表（审核记录）

| 字段             | 类型             | 说明                                          |
| ---------------- | ---------------- | --------------------------------------------- |
| `id`             | `BigInt` (PK)    | 审核记录 ID                                   |
| `survey_id`      | `BigInt` (FK)    | 关联问卷 ID                                   |
| `submitter_id`   | `BigInt` (FK)    | 提交者（问卷作者）                            |
| `reviewer_id`    | `BigInt?` (FK)   | 审核人（管理员），审核前为 null               |
| `review_type`    | `ReviewType`     | 审核类型：`survey` / `template`               |
| `status`         | `ReviewStatus`   | 审核状态：`pending` / `approved` / `rejected` |
| `submit_message` | `String?` (Text) | 提交时附加说明，最大 500 字符                 |
| `review_comment` | `String?` (Text) | 审核意见（通过/驳回时填写）                   |
| `submitted_at`   | `DateTime`       | 提交时间                                      |
| `reviewed_at`    | `DateTime?`      | 审核完成时间                                  |

**索引**：

- `@@index([review_type, status])` — 高频：按审核类型 + 状态筛选
- `@@index([survey_id, status])` — 高频：检查同一问卷是否已有审核中记录
- `@@index([survey_id])`, `@@index([submitter_id])`, `@@index([reviewer_id])`, `@@index([submitted_at])`

### 2.4 ER 关系

```
users ──1:N──→ reviews ←──1:N── surveys
  │              │                  │
  │ (submitter)  │ (FK submitter_id, reviewer_id)
  │              │
  └──1:1──→ profiles               └──1:N── survey_components
```

---

## 三、审核类型与业务流程

### 3.1 完整状态流转图

```
创建问卷
  │  survey_type: personal
  │  review_status: none
  │
  ├─ 用户同步/保存 → PUT /api/surveys/:id
  │    review_status → none（重置为未审核）
  │
  ├─【提交问卷审核】→ POST /api/surveys/:id/submit-review
  │    review_status → pending
  │    reviews 表写入 review_type="survey", status="pending"
  │  │
  │  ├─【管理员通过】→ POST /api/admin/reviews/:id/approve
  │  │    review_status → approved（问卷可发布）
  │  │    reviews.status → approved
  │  │  │
  │  │  ├─ 发布问卷 → POST /api/surveys/:id/publish
  │  │  │    （校验 review_status === "approved"）
  │  │  │
  │  │  └─【申请模板审核】→ POST /api/surveys/:id/apply-template
  │  │       （前置校验：review_status === "approved"）
  │  │       reviews 表写入 review_type="template", status="pending"
  │  │     │
  │  │     ├─【管理员通过】→ POST /api/admin/reviews/:id/approve
  │  │     │    survey_type → template（模板市场上架）
  │  │     │
  │  │     └─【管理员驳回】→ POST /api/admin/reviews/:id/reject
  │  │          不改变问卷状态（问卷审核已通过保持不变）
  │  │
  │  └─【管理员驳回】→ POST /api/admin/reviews/:id/reject
  │       review_status → rejected
  │
  └─ 用户重新修改问卷 → PUT /api/surveys/:id
       review_status → none（需重新提交审核）
```

### 3.2 审核触发条件总结

| 操作         | 接口                                   | 触发者     | 前置条件                                        |
| ------------ | -------------------------------------- | ---------- | ----------------------------------------------- |
| 提交问卷审核 | `POST /api/surveys/:id/submit-review`  | 认证用户   | 问卷存在且属于当前用户                          |
| 申请模板审核 | `POST /api/surveys/:id/apply-template` | 认证用户   | 问卷已通过问卷审核 (`review_status="approved"`) |
| 审核通过     | `POST /api/admin/reviews/:id/approve`  | 超级管理员 | 审核记录状态为 `pending`                        |
| 审核驳回     | `POST /api/admin/reviews/:id/reject`   | 超级管理员 | 审核记录状态为 `pending`，驳回原因必填          |
| 发布问卷     | `POST /api/surveys/:id/publish`        | 认证用户   | `review_status === "approved"`                  |
| 同步/保存    | `PUT /api/surveys/:id`                 | 认证用户   | 无（自动重置 `review_status → "none"`）         |

---

## 四、API 接口定义

> 所有接口挂载路径前缀：`/api/admin`

### 4.1 接口清单

| 方法 | 路径                   | 说明                       | 限流   |
| ---- | ---------------------- | -------------------------- | ------ |
| GET  | `/reviews`             | 审核列表（分页 + 筛选）    | 60/min |
| GET  | `/reviews/:id`         | 审核详情（含问卷完整内容） | 60/min |
| POST | `/reviews/:id/approve` | 审核通过                   | 30/min |
| POST | `/reviews/:id/reject`  | 审核驳回                   | 30/min |

---

### 4.2 GET /api/admin/reviews — 审核列表

**Query 参数**：

| 参数          | 类型                                              | 必填 | 默认值      | 说明              |
| ------------- | ------------------------------------------------- | ---- | ----------- | ----------------- |
| `review_type` | `"survey" \| "template"`                          | 否   | `"survey"`  | 审核类型          |
| `status`      | `"none" \| "pending" \| "approved" \| "rejected"` | 否   | `"pending"` | 审核状态          |
| `survey_type` | `"personal" \| "template"`                        | 否   | —           | 问卷类型筛选      |
| `page`        | `number`                                          | 否   | `1`         | 页码（≥1）        |
| `page_size`   | `number`                                          | 否   | `10`        | 每页条数（1~100） |

**特殊处理 — `status = "none"` 时的数据源切换**：

- `status = "pending" / "approved" / "rejected"`：查询 `reviews` 表（审核记录表）
- `status = "none"`：查询 `surveys` 表（`review_status = "none"` 且无 pending 审核记录），适配管理员查看"尚未提交审核"的问卷场景

**响应示例**：

```json
{
  "code": 0,
  "msg": "ok",
  "data": {
    "list": [
      {
        "review_id": "42",
        "survey_id": "128",
        "survey_title": "用户体验满意度调查",
        "survey_type": "personal",
        "category": null,
        "submitter_name": "张三",
        "review_type": "survey",
        "status": "pending",
        "submit_message": "请审核",
        "submitted_at": "2026-06-22T10:30:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "page_size": 10,
      "total": 25,
      "total_pages": 3
    }
  }
}
```

---

### 4.3 GET /api/admin/reviews/:id — 审核详情

**路径参数**：

| 参数 | 类型               | 说明        |
| ---- | ------------------ | ----------- |
| `id` | `string`（纯数字） | 审核记录 ID |

**响应示例**：

```json
{
  "code": 0,
  "msg": "ok",
  "data": {
    "review_id": "42",
    "survey_id": "128",
    "survey_title": "用户体验满意度调查",
    "survey_description": "用于收集用户对产品的使用体验反馈",
    "survey_type": "personal",
    "category": null,
    "submitter_id": "15",
    "submitter_name": "张三",
    "review_type": "survey",
    "status": "pending",
    "submit_message": "请审核",
    "review_comment": null,
    "reviewer_id": null,
    "reviewer_name": null,
    "submitted_at": "2026-06-22T10:30:00.000Z",
    "reviewed_at": null,
    "components": [
      {
        "id": "301",
        "type": "single_select",
        "config": { "title": { "status": "您的性别？" }, "options": { "status": [...] } },
        "order_index": 0,
        "required": 1
      }
    ]
  }
}
```

---

### 4.4 POST /api/admin/reviews/:id/approve — 审核通过

**请求体**：

```json
{
  "review_comment": "内容合规，审核通过"
}
```

| 字段             | 类型     | 必填 | 说明                    |
| ---------------- | -------- | ---- | ----------------------- |
| `review_comment` | `string` | 否   | 审核意见，最多 500 字符 |

**事务处理逻辑（按 review_type 区分）**：

| review_type | Survey 变更                                |
| ----------- | ------------------------------------------ |
| `survey`    | `review_status → "approved"`（问卷可发布） |
| `template`  | `survey_type → "template"`（模板市场上架） |

**成功响应**：

```json
{
  "code": 0,
  "msg": "审核通过",
  "data": {
    "review_id": "42",
    "status": "approved",
    "reviewed_at": "2026-06-23T14:00:00.000Z"
  }
}
```

---

### 4.5 POST /api/admin/reviews/:id/reject — 审核驳回

**请求体**：

```json
{
  "review_comment": "第3题包含敏感词汇，请修改后重新提交"
}
```

| 字段             | 类型     | 必填 | 说明                 |
| ---------------- | -------- | ---- | -------------------- |
| `review_comment` | `string` | 是   | 驳回原因，1~500 字符 |

**事务处理逻辑（按 review_type 区分）**：

| review_type | Survey 变更                                        |
| ----------- | -------------------------------------------------- |
| `survey`    | `review_status → "rejected"`（用户修改后重新提交） |
| `template`  | **不改变问卷状态**（问卷审核已通过保持不变）       |

### 4.6 错误码

| HTTP 状态码 | 业务码 | 消息                           | 触发场景             |
| ----------- | ------ | ------------------------------ | -------------------- |
| 400         | 400    | 审核记录 ID 格式错误           | ID 非纯数字          |
| 401         | 401    | 请先登录                       | 未携带有效 Token     |
| 403         | 403    | 需要超级管理员权限             | 角色非 `super_admin` |
| 404         | 404    | 审核记录不存在                 | ID 对应的记录不存在  |
| 409         | 409    | 该审核记录已处理，无法重复操作 | status ≠ `pending`   |
| 429         | 429    | 请求过于频繁                   | 超过限流阈值         |

---

## 五、代码架构

### 5.1 分层架构

```
  ┌──────────┐
  │  Routes  │  路由层：认证鉴权、参数校验、限流配置、日志记录
  ├──────────┤
  │ Schemas  │  Zod Schema 层：输入校验、类型推导
  ├──────────┤
  │ Service  │  业务逻辑层：数据查询、事务管理、审计日志
  ├──────────┤
  │  Prisma  │  ORM 层：数据库操作
  └──────────┘
```

### 5.2 路由层 `review.routes.ts`

- 使用 `fastify.addHook("preHandler", authenticate)` + `requireSuperAdmin` 双中间件链
- `GET /reviews` — `parseQueryAndRespond` 解析 query 参数
- `POST /reviews/:id/approve` / `reject` — `parseAndRespond` 解析 body
- 每个端点独立配置限流阈值
- 所有异常通过 `try/catch + throw` 交给全局 `error-handler` 统一处理

### 5.3 Schema 层 `review.schemas.ts`

```typescript
// 审核 ID 校验 → BigInt 转换
reviewIdSchema: z.string().regex(/^\d+$/).transform(v => BigInt(v));

// 审核列表查询
reviewListQuerySchema: { review_type, status, survey_type?, page, page_size }

// 审核通过（意见可选）
approveReviewSchema: { review_comment?: string(max 500) }

// 审核驳回（意见必填）
rejectReviewSchema: { review_comment: string(1~500) }
```

### 5.4 模块入口 `index.ts`

```typescript
// 统一导出：Service 类、Routes、Schemas、Types
export { ReviewService } from "./review.service.js";
export { default as reviewRoutes } from "./review.routes.js";
export { reviewListQuerySchema, approveReviewSchema, rejectReviewSchema, reviewIdSchema } from "./review.schemas.js";
export type { ReviewListQueryInput, ApproveReviewInput, RejectReviewInput } from "./review.schemas.js";
```

---

## 六、核心业务逻辑

### 6.1 listReviews — 审核列表查询

**数据源路由决策**：

```
status = "none"  → listUnreviewedSurveys()  → 查询 surveys 表
status = "pending" / "approved" / "rejected" → 查询 reviews 表
```

**reviews 表查询**（`status ≠ "none"`）：

```typescript
const where = { review_type, status };
if (survey_type) where.survey = { survey_type };

await Promise.all([
  prisma.review.findMany({ where, include: { survey, submitter }, orderBy, skip, take }),
  prisma.review.count({ where })
]);
```

**surveys 表查询**（`status = "none"`）：

核心优化：使用 Prisma 的 `reviews: { none: {...} }` 关系过滤，生成 `NOT EXISTS` 子查询：

```typescript
const where = {
  deleted_at: null,
  review_status: "none",
  reviews: {
    none: {
      review_type: "survey", // 或 "template"
      status: "pending"
    }
  }
};
```

生成的 SQL：

```sql
SELECT * FROM surveys
WHERE deleted_at IS NULL
  AND review_status = 'none'
  AND NOT EXISTS (
    SELECT 1 FROM reviews
    WHERE reviews.survey_id = surveys.id
      AND review_type = $1 AND status = 'pending'
  )
ORDER BY created_at DESC
LIMIT $2 OFFSET $3;
```

**为什么不用 `notIn` 数组**：当 `pending` 记录积累到数千条时，`id NOT IN (id1, id2, ...)` 的 SQL 参数会超限导致崩溃。`NOT EXISTS` 子查询无此限制，且单次查询原子性避免了 TOCTOU 竞态。

### 6.2 getReviewDetail — 审核详情查询

```typescript
const review = await prisma.review.findUnique({
  where: { id: reviewId },
  include: {
    survey: { include: { components: { orderBy: { order_index: "asc" } } } },
    submitter: { select: { id: true, username: true } },
    reviewer: { select: { id: true, username: true } }
  }
});
```

若记录不存在 → `throw AppError("审核记录不存在", 404)`。

### 6.3 approveReview — 审核通过

**事务流程**：

```
1. 读取 Review → 校验 status === "pending"（防止重复操作）
2. 更新 Review：status → "approved", reviewer_id, reviewed_at, review_comment
3. 按 review_type 更新 Survey：
     survey   → review_status → "approved"
     template → survey_type   → "template"
4. 审计日志 → fire-and-forget 写入
```

### 6.4 rejectReview — 审核驳回

**事务流程**：

```
1. 读取 Review → 校验 status === "pending"
2. 更新 Review：status → "rejected", reviewer_id, reviewed_at, review_comment
3. 按 review_type 更新 Survey：
     survey   → review_status → "rejected"
     template → 不改变问卷状态（保持 approved）
4. 审计日志 → fire-and-forget 写入
```

**模板驳回不改变问卷状态的原因**：模板审核的前提是已通过问卷审核。驳回模板申请仅表示该问卷不适合作为公共模板，但问卷本身的合规性已通过验证。

---

## 七、上下游系统对接关系

### 7.1 上游依赖

| 上游         | 接口/文件                      | 关系                                     |
| ------------ | ------------------------------ | ---------------------------------------- |
| 用户认证模块 | `user/auth/auth.middleware.ts` | `authenticate` 解析 JWT → `request.user` |
| 权限控制     | `user/auth/auth.middleware.ts` | `requireSuperAdmin` 校验角色             |
| 审计日志     | `utils/audit-log.ts`           | `createAuditLog()` 写入操作记录          |

### 7.2 下游调用方 — survey-crud 模块

| 问卷操作      | 接口                                   | 审核联动                               |
| ------------- | -------------------------------------- | -------------------------------------- |
| 提交问卷审核  | `POST /api/surveys/:id/submit-review`  | 创建 `review_type="survey"` 审核记录   |
| 申请模板审核  | `POST /api/surveys/:id/apply-template` | 创建 `review_type="template"` 审核记录 |
| 同步/保存问卷 | `PUT /api/surveys/:id`                 | `review_status → "none"`（重置）       |
| 发布问卷      | `POST /api/surveys/:id/publish`        | 校验 `review_status === "approved"`    |
| 删除问卷      | `DELETE /api/surveys/:id`              | 自动关闭 pending 审核记录              |

### 7.3 前端对接

| 前端应用       | 页面                    | 对接接口                                         |
| -------------- | ----------------------- | ------------------------------------------------ |
| `app/frontend` | 审核管理 — 问卷审核 Tab | `GET /api/admin/reviews` (review_type=survey)    |
| `app/frontend` | 审核管理 — 模板审核 Tab | `GET /api/admin/reviews` (review_type=template)  |
| `app/frontend` | 审核详情页              | `GET /api/admin/reviews/:id`                     |
| `app/frontend` | 审核通过/驳回操作       | `POST /api/admin/reviews/:id/approve` / `reject` |
| `app/q-editor` | 预览页 — 提交审核       | `POST /api/surveys/:id/submit-review`            |
| `app/q-editor` | Header — 申请模板弹窗   | `POST /api/surveys/:id/apply-template`           |

### 7.4 共享类型

```
packages/common/src/review/review.interface.ts
  ├── ReviewStatus, SurveyType（复用自 survey.interface.ts）
  ├── ReviewType（本模块定义）
  ├── ReviewListItem / ReviewDetail / ReviewComponentItem
  └── ReviewListQuery / ReviewListResponse / ReviewActionResponse
```

---

## 八、安全与限流策略

### 8.1 认证鉴权链

```
HTTP Request
  → authenticate (JWT 校验 → request.user)
  → requireSuperAdmin (role === "super_admin" 校验)
  → Route Handler (业务逻辑)
```

### 8.2 防注入

- 所有输入通过 Zod Schema 做白名单校验
- Schema 不暴露 `review_status` 等敏感字段，杜绝客户端直接注入审核状态
- 路径参数 `id` 通过 `/^\d+$/` 正则限制，排除 SQL 注入路径

### 8.3 限流

| 层级                | 配置        | 说明                                  |
| ------------------- | ----------- | ------------------------------------- |
| 全局                | 100 req/min | 所有接口共享，生产环境 Redis 共享计数 |
| GET /reviews        | 60 req/min  | 审核列表查询                          |
| GET /reviews/:id    | 60 req/min  | 审核详情查询                          |
| POST approve/reject | 30 req/min  | 审核操作（读写敏感，限制更严）        |

限流超限响应（429）：

```json
{ "code": 429, "msg": "请求过于频繁，请在 X 分钟后重试", "data": null }
```

### 8.4 幂等性保护

```typescript
if (existing.status !== "pending") {
  throw new AppError("该审核记录已处理，无法重复操作", 409);
}
```

### 8.5 审计日志

```typescript
// fire-and-forget：审核操作完成后异步写入，不阻塞响应
createAuditLog(fastify, adminId, "approve_review", "review", reviewId, {
  survey_id: bigIntToStr(review.survey_id),
  comment: input.review_comment
}).catch(() => {}); // DB 写入失败时降级到本地文件
```

---

## 九、数据流与缓存

### 9.1 数据一致性

- `approveReview` / `rejectReview` 使用 `$transaction` 事务，确保 `reviews` 和 `surveys` 两张表状态原子更新
- 审计日志采用 fire-and-forget 异步写入，失败时降级到文件，不阻塞主流程

### 9.2 缓存策略

审核模块**当前不启用缓存**，原因：

1. 审核列表为管理员低频操作（每分钟通常 < 10 次）
2. 缓存失效策略复杂：审核操作后需要同时失效审核列表缓存和问卷详情缓存
3. 引入缓存的复杂度大于性能收益

如果未来需要引入缓存，推荐使用项目已有的 `Cache-Aside` 基础设施（`utils/cache.ts`），在 `listReviews` 中对 `status ≠ "none"` 的查询结果做 30 秒短 TTL 缓存。

---

## 十、错误处理

### 10.1 错误分类

| 错误类型      | 处理方式                                           |
| ------------- | -------------------------------------------------- |
| `AppError`    | global error-handler 按 `statusCode` + `code` 返回 |
| Prisma P-code | 映射为友好消息（P2025→404, P2002→409）             |
| 未知异常      | 兜底 500，生产环境脱敏 msg                         |

### 10.2 日志记录

每个接口端点都包含完整的日志记录：

```typescript
// 请求开始
fastify.log.info({ userId, query }, "[review] GET /reviews — 查询审核列表");

// 请求成功
fastify.log.info({ total }, "[review] GET /reviews — 查询成功");

// 请求失败
fastify.log.error({ err }, "[review] GET /reviews — 查询失败");
```

日志前缀 `[review]` 便于全局过滤和监控。

---

## 十一、关键技术点与注意事项

### 11.1 BigInt 序列化

Prisma 的 BigInt 字段在 JSON 序列化后为字符串类型。所有 ID 字段统一使用 `bigIntToStr()` 转换：

```typescript
review_id: bigIntToStr(row.id as bigint),
survey_id: bigIntToStr(row.survey_id as bigint),
```

### 11.2 审核状态冗余字段

`Survey.review_status` 是 `Review.status` 的冗余字段，**必须在同一事务中同步更新**。设计目的：

- 发布问卷时可直接校验 `survey.review_status`，无需 JOIN `reviews` 表
- 同步/保存时重置审核状态无需查询历史审核记录

### 11.3 模板审核驳回不改变问卷状态

当 `review_type="template"` 且驳回时，仅更新 `reviews` 记录，**不修改 `survey.review_status`**。因为问卷审核已经通过，驳回模板申请不影响问卷本身的合规性。

### 11.4 防止重复提交

```typescript
// 问卷审核重复提交检查
const pendingReview = await tx.review.findFirst({
  where: { survey_id, review_type: "survey", status: "pending" }
});
if (pendingReview) throw new AppError("该问卷已有审核中的申请", 409);

// 模板审核重复提交检查（同理，review_type = "template"）
```

### 11.5 未审核问卷列表的 NOT EXISTS 优化

`listUnreviewedSurveys` 使用 Prisma 关系过滤生成 `NOT EXISTS` 子查询，而非先在应用层查询 pending 的 ID 列表再传给 Prisma 的 `notIn`。直接避免了：

- **SQL 参数数量超限**（`IN (...)` 子句有上限，通常 65535 个参数）
- **TOCTOU 竞态**（两次查询之间的时间窗口）

这是该模块最关键的性能优化点。

### 11.6 前后端类型一致性

审核模块的类型定义通过 `packages/common/src/review/review.interface.ts` 在前后端间共享。后端通过 `z.infer` 从 Zod Schema 推导类型，前端通过 `@common/review/review.interface` 导入类型。确保 API 契约在编译期得到校验。

### 11.7 后续扩展点

| 扩展项     | 说明                                                                       |
| ---------- | -------------------------------------------------------------------------- |
| 精细化权限 | 按 `review:read` / `review:approve` / `review:reject` 权限码区分管理员角色 |
| 通知机制   | 审核通过/驳回后通过 RabbitMQ 推送通知给提交者                              |
| 批量审核   | 支持选中多条审核记录批量通过/驳回                                          |
| 审核模板   | 预设常用审核意见模板，减少重复输入                                         |
