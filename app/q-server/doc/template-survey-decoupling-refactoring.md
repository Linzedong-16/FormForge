# 方案B：问卷-模板完全解耦重构实施文档

> 版本：1.0  
> 日期：2026-06-25  
> 来源：方案B 完全解耦技术分析方案  
> 目标：将个人问卷与公共模板从单一 `surveys` 表完全解耦，建立独立的 `templates` 表体系

---

## 目录

1. [背景与动机](#1-背景与动机)
2. [架构设计](#2-架构设计)
3. [数据库设计](#3-数据库设计)
4. [实施步骤](#4-实施步骤)
5. [接口变更清单](#5-接口变更清单)
6. [技术决策与关键设计](#6-技术决策与关键设计)
7. [遇到的问题与解决方案](#7-遇到的问题与解决方案)
8. [数据迁移指南](#8-数据迁移指南)
9. [测试策略](#9-测试策略)
10. [附录](#10-附录)

---

## 1. 背景与动机

### 1.1 重构前的问题

在方案B实施前，系统使用单一 `surveys` 表同时存储个人问卷和公共模板，通过 `survey_type` 字段区分：

```
┌─────────────────────────────────────────────────────────────────┐
│                    重构前：单表耦合模式                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   surveys 表                                                    │
│   ┌──────────────────────────────────────────────────────────┐  │
│   │  id, user_id, title, description, status, ...             │  │
│   │  survey_type   (personal / template)  ← 耦合字段          │  │
│   │  category      (仅 template 有值)     ← 冗余字段          │  │
│   │  cover_url     (仅 template 有值)     ← 冗余字段          │  │
│   │  download_count (仅 template 有值)    ← 冗余字段          │  │
│   │  rating        (仅 template 有值)     ← 冗余字段          │  │
│   │  review_status (个人问卷也用)                              │  │
│   └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│   问题：                                                        │
│   1. 模板字段对个人问卷是冗余的（NULL 占用存储）                │
│   2. 模板保护逻辑与问卷 CRUD 耦合（更新/删除需判断 survey_type）│
│   3. 模板审核通过后原地修改问卷类型，不可逆                     │
│   4. 模板删除与问卷删除逻辑耦合                                 │
│   5. 问卷列表需过滤 survey_type，增加查询复杂度                 │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 重构目标

| 目标           | 说明                                                                     |
| -------------- | ------------------------------------------------------------------------ |
| **数据解耦**   | 模板拥有独立的数据表 `templates` + `template_components`，与问卷完全分离 |
| **逻辑简化**   | 问卷 CRUD 不再需要模板保护逻辑；模板管理独立为 `template` 模块           |
| **可扩展性**   | 模板可独立扩展字段（如封面图、标签、版本号），不影响问卷表               |
| **数据完整性** | 模板审核通过后深拷贝问卷数据，模板与源问卷后续变更互不影响               |

---

## 2. 架构设计

### 2.1 重构后的数据模型

```
┌─────────────────────────────────────────────────────────────────┐
│                    重构后：完全解耦模式                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   surveys 表（仅个人问卷）         templates 表（仅公共模板）    │
│   ┌───────────────────────┐       ┌──────────────────────────┐  │
│   │  id                   │       │  id                      │  │
│   │  user_id              │       │  user_id (作者)          │  │
│   │  title                │       │  title                   │  │
│   │  description          │       │  description             │  │
│   │  status               │       │  category                │  │
│   │  page_size            │       │  cover_url               │  │
│   │  total_questions      │       │  download_count          │  │
│   │  responses_count      │       │  rating                  │  │
│   │  is_public            │       │  review_status           │  │
│   │  access_code          │       │  source_survey_id        │  │
│   │  review_status        │       │  created_at / updated_at │  │
│   │  deleted_at           │       └──────────────────────────┘  │
│   │  timestamps           │                                      │
│   └───────────────────────┘       template_components            │
│           │                       ┌──────────────────────────┐  │
│           │ 1:N                   │  template_id → templates  │  │
│           ▼                       │  type, config, order     │  │
│   survey_components               └──────────────────────────┘  │
│                                                                  │
│   reviews 表（审核记录，关联两表）                               │
│   ┌──────────────────────────────────────────────────────────┐  │
│   │  survey_id (问卷审核时，可为 null)                        │  │
│   │  template_id (模板审核时，可为 null)                      │  │
│   │  review_type (survey / template)                          │  │
│   │  status, submitter_id, reviewer_id, ...                   │  │
│   └──────────────────────────────────────────────────────────┘  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 模块划分

```
src/modules/
├── survey/
│   └── survey-crud/          # 问卷 CRUD（不含模板逻辑）
│       ├── survey-crud.service.ts
│       ├── survey-crud.routes.ts
│       └── survey-crud.schemas.ts
├── template/                  # 新增：模板模块
│   ├── template.service.ts   # 模板列表、详情、使用、评分
│   ├── template.routes.ts    # GET/POST /api/templates
│   ├── template.schemas.ts   # Zod 校验
│   └── index.ts
└── review/                    # 审核模块（适配双表）
    ├── review.service.ts     # 审核通过时创建 Template 记录
    ├── review.routes.ts
    └── review.schemas.ts
```

### 2.3 核心业务流程

```
个人问卷 → 模板的完整流程：

  ┌──────────┐     submitReview      ┌──────────┐     approveReview     ┌──────────┐
  │ 创建问卷  │ ──────────────────► │ 审核中    │ ──────────────────► │ 审核通过  │
  │ (草稿)   │                      │ (pending) │                      │ (approved)│
  └──────────┘                      └──────────┘                      └─────┬────┘
                                                                           │
                                                                  applyTemplate
                                                                           │
                                                                           ▼
                                                                     ┌──────────┐
                                                                     │ 模板审核  │
                                                                     │ (pending) │
                                                                     └─────┬────┘
                                                                           │
                                                                  approveReview
                                                                           │
                                                                           ▼
  ┌──────────────────────────────────────────────────────────────────────────┐
  │                       创建独立的 Template 记录                            │
  │  1. INSERT INTO templates (深拷贝问卷元数据)                              │
  │  2. INSERT INTO template_components (深拷贝所有组件)                      │
  │  3. UPDATE reviews SET template_id = new_template.id, status = 'approved' │
  └──────────────────────────────────────────────────────────────────────────┘
```

---

## 3. 数据库设计

### 3.1 Schema 变更汇总

#### 3.1.1 Survey 表 — 移除字段

| 变更类型 | 字段             | 原因                              |
| -------- | ---------------- | --------------------------------- |
| 移除     | `survey_type`    | 由 `templates` 表替代             |
| 移除     | `category`       | 迁移到 `templates.category`       |
| 移除     | `cover_url`      | 迁移到 `templates.cover_url`      |
| 移除     | `download_count` | 迁移到 `templates.download_count` |
| 移除     | `rating`         | 迁移到 `templates.rating`         |
| 保留     | `review_status`  | 个人问卷发布前需要审核            |

#### 3.1.2 新增表

| 表名                  | 用途         | 关键字段                                                                                                      |
| --------------------- | ------------ | ------------------------------------------------------------------------------------------------------------- |
| `templates`           | 公共模板存储 | id, user_id, title, description, category, cover_url, download_count, rating, review_status, source_survey_id |
| `template_components` | 模板组件数据 | id, template_id, type, config, order_index, required                                                          |

#### 3.1.3 修改表

| 表名               | 变更                                                    |
| ------------------ | ------------------------------------------------------- |
| `reviews`          | 新增 `template_id`(BigInt?, 可选)；`survey_id` 改为可选 |
| `template_ratings` | `template_id` 外键从 `surveys` 改为 `templates`         |
| `users`            | 新增 `templates Template[]` 关联                        |

#### 3.1.4 移除的枚举

| 枚举         | 原因                                                     |
| ------------ | -------------------------------------------------------- |
| `SurveyType` | 不再需要区分 `personal`/`template`，所有问卷均为个人问卷 |

### 3.2 新增 Prisma 模型

```prisma
model Template {
  id               BigInt        @id @default(autoincrement())
  user_id          BigInt
  title            String
  description      String?
  category         String?
  cover_url        String?
  download_count   Int           @default(0)
  rating           Decimal?      @default(0) @db.Decimal(2, 1)
  review_status    ReviewStatus  @default(approved)
  source_survey_id BigInt?
  created_at       DateTime      @default(now())
  updated_at       DateTime      @updatedAt

  user       User                @relation(fields: [user_id], references: [id])
  components TemplateComponent[]
  ratings    TemplateRating[]
  reviews    Review[]

  @@index([user_id])
  @@index([category])
  @@index([review_status])
  @@index([category, review_status])
  @@index([download_count])
  @@index([rating])
  @@map("templates")
}

model TemplateComponent {
  id          BigInt   @id @default(autoincrement())
  template_id BigInt
  type        String
  config      Json     @default("{}")
  order_index Int      @default(0)
  required    Int      @default(0)
  created_at  DateTime @default(now())
  updated_at  DateTime @updatedAt

  template Template @relation(fields: [template_id], references: [id], onDelete: Cascade)

  @@index([template_id])
  @@index([template_id, order_index])
  @@map("template_components")
}
```

---

## 4. 实施步骤

### 4.1 修改文件清单

| 序号 | 文件                                                    | 操作 | 说明                                                                    |
| ---- | ------------------------------------------------------- | ---- | ----------------------------------------------------------------------- |
| 1    | `prisma/schema.prisma`                                  | 修改 | 新增 Template/TemplateComponent；修改 Survey/Review/TemplateRating/User |
| 2    | `packages/common/src/survey/survey.interface.ts`        | 修改 | 移除 SurveyType；新增 TemplateListItem/TemplateDetail/UseTemplate 等    |
| 3    | `packages/common/src/review/review.interface.ts`        | 修改 | 移除 SurveyType；ReviewListItem 新增 template_id                        |
| 4    | `src/modules/template/template.schemas.ts`              | 新增 | 模板 Zod 校验 Schema                                                    |
| 5    | `src/modules/template/template.service.ts`              | 新增 | 模板业务逻辑（列表、详情、使用、评分）                                  |
| 6    | `src/modules/template/template.routes.ts`               | 新增 | 模板路由（GET/POST /api/templates）                                     |
| 7    | `src/modules/template/index.ts`                         | 新增 | 模块导出                                                                |
| 8    | `src/routes/index.ts`                                   | 修改 | 注册 templateRoutes                                                     |
| 9    | `src/modules/survey/survey-crud/survey-crud.service.ts` | 修改 | 移除模板字段；移除模板保护逻辑；重写 applyTemplate                      |
| 10   | `src/modules/review/review.schemas.ts`                  | 修改 | survey_type → category                                                  |
| 11   | `src/modules/review/review.service.ts`                  | 修改 | 适配双表（survey/template）；approveReview 创建 Template                |
| 12   | `app/q-editor/src/api/modules/survey/index.ts`          | 修改 | 新增模板 API 函数                                                       |
| 13   | `app/q-editor/src/views/Layout/index.vue`               | 修改 | 移除 survey_type 过滤                                                   |
| 14   | `src/spec/utils/test-helpers.ts`                        | 修改 | 更新 Mock 数据                                                          |

### 4.2 实施顺序

```
步骤 1: 数据库层（Schema 变更）
  ├── prisma/schema.prisma — 新增 Template/TemplateComponent；修改 Survey/Review/TemplateRating/User
  └── prisma migrate dev（生成迁移文件）

步骤 2: 公共类型层
  ├── packages/common/src/survey/survey.interface.ts
  └── packages/common/src/review/review.interface.ts

步骤 3: 后端 Template 模块
  ├── src/modules/template/template.schemas.ts
  ├── src/modules/template/template.service.ts
  ├── src/modules/template/template.routes.ts
  └── src/modules/template/index.ts

步骤 4: 后端 Survey CRUD 修改
  └── src/modules/survey/survey-crud/survey-crud.service.ts

步骤 5: 后端 Review 模块修改
  ├── src/modules/review/review.schemas.ts
  └── src/modules/review/review.service.ts

步骤 6: 路由注册
  └── src/routes/index.ts

步骤 7: 前端适配
  ├── app/q-editor/src/api/modules/survey/index.ts
  └── app/q-editor/src/views/Layout/index.vue

步骤 8: 测试更新
  └── src/spec/utils/test-helpers.ts
```

---

## 5. 接口变更清单

### 5.1 新增接口

| 方法 | 路径                       | 说明                                | 权限     |
| ---- | -------------------------- | ----------------------------------- | -------- |
| GET  | `/api/templates`           | 模板市场列表（分页+分类+排序+搜索） | 登录用户 |
| GET  | `/api/templates/:id`       | 模板详情（含组件列表）              | 登录用户 |
| POST | `/api/templates/:id/apply` | 使用模板创建个人问卷                | 登录用户 |
| POST | `/api/templates/:id/rate`  | 模板评分（1-5分）                   | 登录用户 |

#### 5.1.1 GET /api/templates

**请求参数：**

| 参数      | 类型   | 必填 | 默认值 | 说明                                                 |
| --------- | ------ | ---- | ------ | ---------------------------------------------------- |
| page      | int    | 否   | 1      | 页码                                                 |
| page_size | int    | 否   | 10     | 每页数量（最大 100）                                 |
| category  | string | 否   | -      | 分类筛选（education/market/hr/customer/event/other） |
| keyword   | string | 否   | -      | 标题关键词搜索                                       |
| sort      | string | 否   | newest | 排序方式（newest/popular/rating）                    |

**响应格式：**

```json
{
  "code": 0,
  "msg": "ok",
  "data": {
    "templates": [
      {
        "id": "1",
        "user_id": "2",
        "title": "客户满意度调查模板",
        "description": "用于收集客户反馈",
        "category": "customer",
        "cover_url": null,
        "download_count": 42,
        "rating": "4.5",
        "review_status": "approved",
        "created_at": "2026-06-01T10:00:00.000Z",
        "updated_at": "2026-06-10T10:00:00.000Z"
      }
    ],
    "total": 1,
    "page": 1,
    "page_size": 10
  }
}
```

#### 5.1.2 POST /api/templates/:id/apply

**请求体：**

```json
{
  "title": "我的问卷（可选，默认使用模板标题）"
}
```

**响应格式：**

```json
{
  "code": 0,
  "msg": "模板应用成功",
  "data": {
    "survey_id": "123",
    "title": "客户满意度调查模板",
    "created_at": "2026-06-25T10:00:00.000Z"
  }
}
```

### 5.2 修改接口

| 方法   | 路径                              | 变更说明                                                                    |
| ------ | --------------------------------- | --------------------------------------------------------------------------- |
| POST   | `/api/surveys`                    | 创建时不再设置 `survey_type`（字段已移除）                                  |
| GET    | `/api/surveys`                    | 响应不再包含 `survey_type`/`category`/`cover_url`/`download_count`/`rating` |
| GET    | `/api/surveys/:id`                | 同上                                                                        |
| PUT    | `/api/surveys/:id`                | 移除模板保护 403（`survey_type === "template"` 判断）                       |
| DELETE | `/api/surveys/:id`                | 移除模板保护；所有问卷均可正常删除                                          |
| POST   | `/api/surveys/:id/apply-template` | 审核通过后在 `templates` 表创建记录（原地修改改为深拷贝）                   |
| GET    | `/api/admin/reviews`              | 查询参数 `survey_type` → `category`；响应新增 `template_id`                 |
| GET    | `/api/admin/reviews/:id`          | 响应新增 `template_id`；模板审核时加载 `templates` 表组件                   |
| POST   | `/api/admin/reviews/:id/approve`  | 模板审核通过时创建 Template 记录                                            |
| POST   | `/api/admin/reviews/:id/reject`   | 模板审核驳回时仅更新 Review 记录                                            |

### 5.3 接口关联影响

```
GET /api/surveys (移除模板字段)
  └── 影响前端：SurveyListItem 类型变更
      ├── q-editor: Layout/index.vue 移除 survey_type 过滤
      └── frontend: 审核列表组件需更新类型引用

POST /api/surveys/:id/apply-template (改为创建模板记录)
  └── 影响下游：审核通过逻辑
      └── approveReview 从修改 survey_type 改为创建 Template 记录

GET /api/admin/reviews (查询参数变更)
  └── 影响前端：审核列表筛选组件
      └── 筛选器从 survey_type 改为 category

GET /api/admin/reviews/:id (审核详情)
  └── 影响前端：审核详情页
      └── 需根据 review_type 决定从 surveys 或 templates 加载组件
```

---

## 6. 技术决策与关键设计

### 6.1 深拷贝 vs 引用

**决策：审核通过时深拷贝问卷数据到 templates 表。**

| 方案           | 优点                                   | 缺点                                       |
| -------------- | -------------------------------------- | ------------------------------------------ |
| 深拷贝（采用） | 模板与源问卷完全独立，后续修改互不影响 | 占用额外存储空间                           |
| 引用           | 节省存储，模板自动更新                 | 源问卷修改影响模板；源问卷删除导致模板失效 |

**选择深拷贝的理由：**

- 模板应当是一个**稳定的快照**，不应随源问卷修改而变更
- 源问卷删除不应影响已上架模板
- 存储成本可忽略（组件数据量小）

### 6.2 审核通过事务设计

模板审核通过是一个**多表事务操作**，必须保证原子性：

```typescript
// 事务内完成以下操作：
await tx.$transaction(async tx => {
  // 1. 加载源问卷及组件
  const sourceSurvey = await tx.survey.findUnique({
    where: { id: existing.survey_id },
    include: { components: true }
  });

  // 2. 创建模板记录
  const template = await tx.template.create({
    data: {
      user_id: existing.submitter_id,
      title: sourceSurvey.title,
      description: sourceSurvey.description,
      source_survey_id: existing.survey_id,
      review_status: "approved"
    }
  });

  // 3. 深拷贝组件
  await tx.templateComponent.createMany({
    data: sourceSurvey.components.map(c => ({...}))
  });

  // 4. 更新审核记录
  await tx.review.update({
    where: { id: reviewId },
    data: { status: "approved", template_id: template.id }
  });
});
```

### 6.3 缓存策略

| 缓存 Key                                                  | TTL      | 说明                       |
| --------------------------------------------------------- | -------- | -------------------------- |
| `template:list:{page}:{size}:{category}:{sort}:{keyword}` | 300s     | 模板列表分片缓存           |
| `template:detail:{id}`                                    | 300s     | 模板详情缓存               |
| `template:list:*`                                         | 模式删除 | 模板变更时清除所有列表缓存 |

### 6.4 模板使用次数统计

`POST /api/templates/:id/apply` 调用时，在事务内 `download_count += 1`。同一用户重复使用同一模板每次都计数。

---

## 7. 遇到的问题与解决方案

### 7.1 SurveyType 枚举移除后的类型兼容

**问题：** `SurveyType` 枚举被 `@common` 包多处引用（`ReviewListItem`、`ReviewDetail`、`SurveyListItem` 等）。

**解决：** 将 `SurveyType` 从 `survey.interface.ts` 中移除，`review.interface.ts` 不再重新导出 `SurveyType`。`ReviewListItem` 改用 `template_id` 字段标识模板审核。

### 7.2 Review 模块加载组件的数据源判断

**问题：** 审核详情页需要根据 `review_type` 从不同表加载组件数据。

**解决：** 在 `getReviewDetail` 中同时 include `survey.components` 和 `template.components`，根据 `review_type` 选择数据源：

```typescript
const isTemplate = review.review_type === "template";
const components = isTemplate ? (review.template?.components ?? []) : (review.survey?.components ?? []);
```

### 7.3 前端远端同步的 survey_type 过滤

**问题：** 前端 `Layout/index.vue` 中远端同步逻辑有 `if (remote.survey_type !== "personal") continue` 判断。

**解决：** 移除此判断。重构后 `GET /api/surveys` 不再返回模板数据，所有返回的问卷都是个人问卷，无需过滤。

### 7.4 applyTemplate 接口的 category 字段去向

**问题：** 原 `applyTemplate` 接口接收 `category` 字段并写入 `surveys.category`，重构后 `surveys` 表不再有 `category` 字段。

**解决：** `applyTemplate` 不再写入问卷的 `category`。模板审核通过后创建 `templates` 记录时，`category` 需另外处理（可在审核时由管理员补充，或从 `applyTemplate` 请求中传递到 `review` 记录）。

---

## 8. 数据迁移指南

### 8.1 迁移前提

当前系统数据量有限，迁移风险极低。按以下步骤执行：

### 8.2 迁移 SQL

```sql
-- 步骤 1：创建 templates 表（Prisma migrate 自动生成）
-- 步骤 2：创建 template_components 表（Prisma migrate 自动生成）

-- 步骤 3：迁移现有模板数据（如有）
-- 注意：由于 survey_type 字段已移除，此步骤需在迁移前执行
-- 迁移前备份
-- SELECT * FROM surveys WHERE survey_type = 'template';

-- 迁移（迁移前执行）
-- INSERT INTO templates (user_id, title, description, category, cover_url,
--                        download_count, rating, review_status, source_survey_id)
-- SELECT user_id, title, description, category, cover_url,
--        download_count, rating, review_status, id
-- FROM surveys WHERE survey_type = 'template';

-- 迁移模板组件
-- INSERT INTO template_components (template_id, type, config, order_index, required)
-- SELECT survey_id, type, config, order_index, required
-- FROM survey_components
-- WHERE survey_id IN (SELECT id FROM surveys WHERE survey_type = 'template');

-- 步骤 4：更新 reviews 表
-- UPDATE reviews SET template_id = t.id
-- FROM templates t
-- WHERE reviews.survey_id = t.source_survey_id
--   AND reviews.review_type = 'template';

-- 步骤 5：清理旧数据
-- DELETE FROM survey_components WHERE survey_id IN (SELECT id FROM surveys WHERE survey_type = 'template');
-- DELETE FROM surveys WHERE survey_type = 'template';
```

### 8.3 回滚方案

由于数据量小，回滚方案简单：

1. 恢复迁移前的数据库备份
2. 回退代码到迁移前版本
3. 重新部署

---

## 9. 测试策略

### 9.1 单元测试

| 测试范围        | 测试内容                                                  |
| --------------- | --------------------------------------------------------- |
| TemplateService | 列表查询、详情查询、使用模板、评分（含边界条件）          |
| SurveyService   | 创建/更新/删除不再需要模板保护逻辑                        |
| ReviewService   | approveReview 创建 Template 记录；rejectReview 不创建模板 |

### 9.2 集成测试

| 测试场景         | 验证点                                                          |
| ---------------- | --------------------------------------------------------------- |
| 问卷完整审核流程 | 提交审核 → 审核通过 → 发布问卷                                  |
| 模板完整上架流程 | 问卷审核通过 → 申请模板 → 模板审核通过 → 模板上架               |
| 模板使用流程     | 浏览模板市场 → 查看模板详情 → 使用模板创建问卷 → 验证新问卷数据 |
| 模板评分流程     | 评分 → 验证平均分更新 → 同一用户重复评分（upsert）              |

### 9.3 Mock 数据更新

`test-helpers.ts` 中的 Mock 数据已更新：

- `MOCK_SURVEY`：移除 `survey_type`/`category`/`cover_url`/`download_count`/`rating`
- 新增 `MOCK_TEMPLATE`：独立的模板 Mock 数据
- `MOCK_REVIEW`：新增 `template_id`/`review_type` 字段
- `MOCK_REVIEW_DETAIL`：新增 `template: null` 字段

---

## 10. 附录

### A. 文件变更统计

| 类别          | 新增   | 修改   | 合计   |
| ------------- | ------ | ------ | ------ |
| 数据库 Schema | 2 模型 | 4 模型 | 6      |
| 后端 Service  | 1      | 2      | 3      |
| 后端 Routes   | 1      | 1      | 2      |
| 后端 Schemas  | 1      | 1      | 2      |
| 公共类型      | 0      | 2      | 2      |
| 前端          | 0      | 2      | 2      |
| 测试          | 0      | 1      | 1      |
| 路由注册      | 0      | 1      | 1      |
| **总计**      | **5**  | **14** | **19** |

### B. 接口变更统计

| 类型      | 数量 |
| --------- | ---- |
| 新增接口  | 4    |
| 修改接口  | 10   |
| 废弃/移除 | 0    |

### C. 关键设计原则

1. **深拷贝优于引用**：模板创建时深拷贝问卷数据，确保独立性
2. **事务保证原子性**：模板审核通过涉及多表写入，使用 Prisma `$transaction` 保证一致性
3. **缓存分片**：模板列表按查询参数分片缓存，提高命中率
4. **审计可追溯**：所有模板操作写入审计日志
5. **向后兼容**：前端类型修改保持字段可选，避免破坏性变更

### D. 后续优化方向

1. 模板版本管理（模板更新后保留历史版本）
2. 模板收藏功能
3. 模板使用统计报表
4. 模板审核自动化（AI 辅助审核）

---

**文档维护者**：系统自动生成  
**最后更新**：2026-06-25
