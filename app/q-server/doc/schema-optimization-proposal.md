# 数据库 Schema 优化方案

> 版本：1.0  
> 日期：2026-06-19  
> 来源：前端需求分析 + 模板市场扩展设计  
> 目标：对齐 `frontend-api-requirements.md` 中 7 个模块 14 个接口的数据需求，新增公共模板设计与审核体系

---

## 目录

1. [需求分析](#1-需求分析)
2. [现有 Schema 审查](#2-现有-schema-审查)
3. [差距分析：现有设计 vs 前端需求](#3-差距分析现有设计-vs-前端需求)
4. [Schema 优化方案](#4-schema-优化方案)
5. [变更清单汇总](#5-变更清单汇总)
6. [迁移策略与注意事项](#6-迁移策略与注意事项)

---

## 1. 需求分析

### 1.1 前端待实现模块（来自 `frontend-api-requirements.md`）

| 模块         | 接口数 | 核心数据需求                              |
| ------------ | :----: | ----------------------------------------- |
| AI 问卷生成  |   2    | 无新增表，纯 LLM 调用 + 组件序列化        |
| AI 润色      |   1    | 无新增表，纯 LLM 调用                     |
| **模板市场** |   4    | **模板存储、分类、使用统计、审核流程**    |
| **审核管理** |   4    | **审核记录、状态流转、申请人/审核人关联** |
| 远程同步     |   1    | 复用现有 Survey 表，无新增                |
| 个人设置     |   1    | 复用现有 User.avatar_url，无新增          |
| 权限列表     |   1    | **细粒度权限码、角色→权限映射**           |

### 1.2 核心业务流程：个人问卷 → 公共模板

```
┌─────────────────────────────────────────────────────────────────┐
│               个人问卷 vs 公共模板 — 生命周期对比                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  个人问卷（survey_type = "personal"）                             │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐  │
│  │ 创建草稿  │───►│ 编辑     │───►│ 发布     │───►│ 关闭/删除 │  │
│  │ (status=0)│    │          │    │ (status=1)│    │ (status=2)│  │
│  └──────────┘    └──────────┘    └──────────┘    └──────────┘  │
│                                                                  │
│                      │ 申请共享模板                               │
│                      ▼ (POST /api/templates)                     │
│  公共模板（survey_type = "template"）                             │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ 审核流程 review_status: pending → approved / rejected     │  │
│  │                                    │                      │  │
│  │                              approved 后                  │  │
│  │                         ┌──────▼──────┐                   │  │
│  │                         │ 模板市场上架  │                  │  │
│  │                         │ 其他用户可浏览 │                 │  │
│  │                         │ 应用 → 创建新问卷│               │  │
│  │                         │ download_count++│              │  │
│  │                         └──────────────┘                   │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 1.3 区分维度

| 维度             | 个人问卷       | 公共模板                            |
| ---------------- | -------------- | ----------------------------------- |
| `survey_type`    | `personal`     | `template`                          |
| `status`         | 草稿/发布/关闭 | 始终发布态（模板仅可查看）          |
| `review_status`  | `none`         | `pending` → `approved` / `rejected` |
| `is_public`      | 0 或 1         | 1（始终公开）                       |
| `category`       | null           | 必填分类                            |
| `cover_url`      | null           | 模板封面                            |
| `download_count` | 0              | 累积使用次数                        |
| 编辑权限         | 仅创建者       | 创建者编辑后需重新审核              |
| 删除影响         | 仅删除自身     | 不影响已应用该模板的用户问卷        |

---

## 2. 现有 Schema 审查

### 2.1 当前 Survey 表结构

```prisma
model Survey {
  id              BigInt    @id @default(autoincrement())
  user_id         BigInt
  title           String
  description     String?
  status          Int       @default(0) // 0:草稿 1:发布 2:关闭
  page_size       Int       @default(10)
  total_questions Int       @default(0)
  responses_count Int       @default(0)
  is_public       Int       @default(0) // 0:私有 1:公开
  access_code     String?
  created_at      DateTime  @default(now())
  updated_at      DateTime  @updatedAt
  published_at    DateTime?
  closed_at       DateTime?

  user             User               @relation(fields: [user_id], references: [id])
  components       SurveyComponent[]
  responses        Response[]
  permissions      SurveyPermission[]

  @@index([user_id])
  @@index([status])
  @@index([created_at])
  @@index([is_public])
  @@map("surveys")
}
```

### 2.2 现有字段能力评估

| 字段          | 当前能力             | 能否满足模板需求 | 说明                                        |
| ------------- | -------------------- | :--------------: | ------------------------------------------- |
| `is_public`   | 0/1 公开标记         |       部分       | 仅区分公开/私有，无法区分"公开问卷"和"模板" |
| `status`      | 0/1/2 草稿/发布/关闭 |       部分       | 模板需要独立的审核状态，与问卷发布状态冲突  |
| `user_id`     | 创建者               |        是        | 模板作者                                    |
| `title`       | 问卷标题             |        是        | 模板名称                                    |
| `description` | 问卷描述             |        是        | 模板描述                                    |

### 2.3 缺失的能力

| 缺失能力                  | 影响模块           | 严重程度 |
| ------------------------- | ------------------ | :------: |
| 问卷类型区分（个人/模板） | 模板市场、问卷列表 |    高    |
| 模板分类                  | 模板市场           |    高    |
| 模板封面图                | 模板市场           |    中    |
| 模板使用次数统计          | 模板市场           |    中    |
| 模板评分                  | 模板市场           |    低    |
| 审核记录表                | 审核管理           |    高    |
| 审核状态流转              | 审核管理           |    高    |
| 细粒度权限表              | 权限列表           |    中    |

---

## 3. 差距分析：现有设计 vs 前端需求

### 3.1 模板市场模块

**前端需求：**

```
GET  /api/templates          → 模板列表（分类、搜索、排序、分页）
GET  /api/templates/:id      → 模板详情（含组件数据）
POST /api/templates          → 申请共享模板（问卷 → 模板）
POST /api/templates/:id/apply → 应用模板（模板 → 新问卷）
```

**现有 Schema 能否支撑：**

- `GET /api/templates` → 可用 `SELECT * FROM surveys WHERE is_public = 1` 模拟，但无法区分模板/公开问卷，无法按分类筛选，无法按使用次数排序
- `POST /api/templates` → 将 `is_public` 设为 1 即可，但缺审核流程，缺少分类/封面字段
- `POST /api/templates/:id/apply` → 需复制 `survey_components` 到新问卷，现有结构可支撑

**结论：** 现有结构仅能支撑 30% 的需求，需新增 `survey_type`、`category`、`cover_url`、`download_count` 字段，并新增审核表。

### 3.2 审核管理模块

**前端需求：**

```
POST /api/reviews             → 提交审核
GET  /api/reviews             → 审核列表（按用户/状态筛选）
GET  /api/reviews/:id         → 审核详情
POST /api/reviews/:id/revoke  → 撤销审核
```

**现有 Schema 能否支撑：** 完全无法支撑。没有任何审核相关的表。

**结论：** 需新增 `Review` 表。

### 3.3 权限列表模块

**前端需求：**

```
GET /api/user/permissions → 获取当前用户权限列表
```

**现有 Schema 能否支撑：** 部分支撑。`UserRole` 表存在，但仅有角色枚举（`super_admin` / `user`），无细粒度权限码。

**结论：** 可暂不新增表，通过应用层映射（`super_admin` → 全部权限，`user` → 默认权限）实现。后续扩展时再新增 `Permission` + `RolePermission` 表。

### 3.4 个人设置模块

**前端需求：** `POST /api/user/avatar` — 上传头像

**现有 Schema 能否支撑：** 完全支撑。`User.avatar_url` 已存在。

**结论：** 无需 Schema 变更。

---

## 4. Schema 优化方案

### 4.1 方案概览

```
现有 Survey 表               新增字段
┌─────────────────────┐     ┌──────────────────────────────┐
│ id                   │     │ survey_type  (enum)          │
│ user_id              │     │ category     (varchar)       │
│ title                │     │ cover_url    (varchar)       │
│ description          │     │ download_count (int)         │
│ status               │     │ rating       (decimal)       │
│ page_size            │     │ review_status (enum)         │
│ total_questions      │     │                              │
│ responses_count      │     └──────────────────────────────┘
│ is_public            │
│ access_code          │     新增 Review 表
│ created_at           │     ┌──────────────────────────────┐
│ updated_at           │     │ id, survey_id, submitter_id  │
│ published_at         │     │ reviewer_id, status,         │
│ closed_at            │     │ submit_message,              │
│ ...                  │     │ review_comment,              │
└─────────────────────┘     │ submitted_at, reviewed_at     │
                             └──────────────────────────────┘
```

### 4.2 Survey 表 — 新增字段

#### 4.2.1 `survey_type` — 问卷类型

```prisma
survey_type  SurveyType  @default(personal)
```

```prisma
enum SurveyType {
  personal  // 个人问卷（默认）
  template  // 公共模板
}
```

**用途：** 从根本上区分个人问卷和公共模板。所有现有问卷迁移后默认 `personal`。

**业务规则：**

- 创建问卷时默认 `personal`
- 申请共享模板审核通过后，变更为 `template`
- `template` 类型的问卷在 `GET /api/surveys` 中默认不再返回（通过 `survey_type=personal` 过滤）
- 模板市场独立接口 `GET /api/templates` 查询 `survey_type = template AND review_status = approved`

#### 4.2.2 `category` — 模板分类

```prisma
category  String?
```

**用途：** 模板市场分类。仅 `survey_type = template` 时有效。

**枚举值：**

| 值          | 中文     | 说明                           |
| ----------- | -------- | ------------------------------ |
| `education` | 教育     | 培训反馈、课程评价、学术调研   |
| `market`    | 市场调研 | 消费者偏好、品牌认知、产品反馈 |
| `hr`        | 人力资源 | 员工满意度、绩效评估、招聘需求 |
| `customer`  | 客户服务 | 满意度调查、投诉反馈、NPS      |
| `event`     | 活动报名 | 活动注册、会议反馈、聚会统计   |
| `other`     | 其他     | 未分类模板                     |

**业务规则：**

- `survey_type = personal` 时 `category` 为 null
- 申请模板时，`category` 必填
- 管理员审核时可修改分类

#### 4.2.3 `cover_url` — 模板封面图

```prisma
cover_url  String?
```

**用途：** 模板市场列表展示的封面缩略图。存储 MinIO 对象 URL。

**业务规则：**

- 可为空，前端使用默认占位图
- 上传后存储完整 URL（如 `https://cdn.example.com/templates/covers/uuid.jpg`）
- 删除模板时异步删除封面文件

#### 4.2.4 `download_count` — 使用次数

```prisma
download_count  Int  @default(0)
```

**用途：** 模板被其他用户应用的累计次数，用于模板市场排序（热门排序）。

**业务规则：**

- 每次 `POST /api/templates/:id/apply` 成功后 +1
- 同一用户重复应用同一模板也计数（每次都是独立创建新问卷）
- 仅 `survey_type = template` 时有效

#### 4.2.5 `rating` — 评分

```prisma
rating  Decimal?  @default(0)  @db.Decimal(2, 1)
```

**用途：** 模板平均评分（0.0 ~ 5.0），精确到小数点后 1 位。

**计算方式：**

- 新模板默认 0（无评分时不展示评分）
- 每次用户评分后重新计算：`AVG(template_ratings.score)`
- 使用单独的 `TemplateRating` 表记录每次评分，便于追溯和防刷

**业务规则：**

- 仅 `survey_type = template` 且 `review_status = approved` 时允许评分
- 同一用户对同一模板仅可评分一次（可修改）
- 模板作者不能给自己的模板评分

#### 4.2.6 `review_status` — 审核状态

```prisma
review_status  ReviewStatus  @default(none)
```

```prisma
enum ReviewStatus {
  none      // 未申请审核（个人问卷默认状态）
  pending   // 审核中
  approved  // 已通过（模板市场上架）
  rejected  // 已驳回（违规/需修改）
}
```

**用途：** 追踪问卷从个人问卷到公共模板的审核流转。

**状态流转规则：**

```
 none ──(申请审核)──► pending ──(管理员审核)──► approved
                          │                        │
                          │                        │ (作者修改问卷)
                          │                        ▼
                          │                      pending（重新审核）
                          │
                          └──(管理员驳回)──► rejected
                                                │
                                                │ (作者修改后重新提交)
                                                ▼
                                              pending
```

**业务规则：**

- `survey_type = personal` 时 `review_status` 始终为 `none`
- `survey_type = template` 时 `review_status` 必为 `approved`（驳回后类型回退或保持在 pending/rejected）
- 同一问卷同时只能有一个 `pending` 状态的审核记录
- 驳回时需填写 `review_comment`
- 审核通过后，若作者修改了问卷内容，自动将 `review_status` 重置为 `pending`

### 4.3 新增 Review 表

```prisma
model Review {
  id              BigInt    @id @default(autoincrement())
  survey_id       BigInt
  submitter_id    BigInt                        // 提交者（问卷作者）
  reviewer_id     BigInt?                       // 审核人（管理员），审核前为 null
  status          ReviewStatus  @default(pending) // pending / approved / rejected
  submit_message  String?    @db.Text           // 提交时附加说明
  review_comment  String?    @db.Text           // 审核意见（通过/驳回时填写）
  submitted_at    DateTime   @default(now())     // 提交时间
  reviewed_at     DateTime?                      // 审核时间
  created_at      DateTime   @default(now())
  updated_at      DateTime   @updatedAt

  // 关联
  survey          Survey     @relation(fields: [survey_id], references: [id], onDelete: Cascade)
  submitter       User       @relation("ReviewSubmitter", fields: [submitter_id], references: [id])
  reviewer        User?      @relation("ReviewReviewer", fields: [reviewer_id], references: [id])

  @@index([survey_id])
  @@index([submitter_id])
  @@index([reviewer_id])
  @@index([status])
  @@index([submitted_at])
  @@index([survey_id, status]) // 高频：检查同一问卷是否已有审核中记录
  @@map("reviews")
}
```

**字段说明：**

| 字段             | 类型         | 说明                             |
| ---------------- | ------------ | -------------------------------- |
| `submitter_id`   | BigInt       | 提交审核的用户（问卷作者）       |
| `reviewer_id`    | BigInt?      | 审核管理员，审核前为 null        |
| `status`         | ReviewStatus | 与 Survey.review_status 同步更新 |
| `submit_message` | Text?        | 提交时附加说明，最大 500 字符    |
| `review_comment` | Text?        | 审核意见，驳回时必填             |
| `submitted_at`   | DateTime     | 提交时间                         |
| `reviewed_at`    | DateTime?    | 审核完成时间                     |

**业务规则：**

1. 同一问卷在同一时间只能有一条 `pending` 状态的审核记录（通过 `[survey_id, status]` 复合索引 + 应用层校验）
2. 仅问卷作者（`submitter_id`）可撤销自己的审核（`pending` 状态）
3. 审核通过/驳回后，`reviewer_id` 和 `reviewed_at` 同步填充
4. 审核状态变更时，同步更新 `Survey.review_status`
5. 审核记录不可物理删除（保留审计历史）

### 4.4 新增 TemplateRating 表

```prisma
model TemplateRating {
  id          BigInt   @id @default(autoincrement())
  template_id BigInt                        // 模板对应的 Survey ID
  user_id     BigInt                        // 评分用户
  score       Int                           // 评分 1-5
  created_at  DateTime @default(now())
  updated_at  DateTime @updatedAt

  // 关联
  template    Survey   @relation(fields: [template_id], references: [id], onDelete: Cascade)
  user        User     @relation(fields: [user_id], references: [id], onDelete: Cascade)

  @@unique([template_id, user_id])          // 同一用户对同一模板仅一条评分记录
  @@index([template_id])
  @@index([template_id, score])
  @@map("template_ratings")
}
```

**字段说明：**

| 字段          | 类型   | 说明                 |
| ------------- | ------ | -------------------- |
| `template_id` | BigInt | 模板对应的 Survey ID |
| `user_id`     | BigInt | 评分用户             |
| `score`       | Int    | 评分 1-5             |

**业务规则：**

1. 仅 `survey_type = template` 且 `review_status = approved` 时可评分
2. 同一用户对同一模板仅一条记录（`@@unique([template_id, user_id])`），再次评分时更新 `score` 和 `updated_at`
3. 模板作者不能给自己的模板评分
4. 评分后异步更新 `Survey.rating` 为 `AVG(template_ratings.score WHERE template_id = ?)`
5. 删除评分记录后重新计算 `Survey.rating`

### 4.5 暂不新增：Permission 表 + RolePermission 表

**当前实现：** 通过应用层硬编码：

```typescript
const ROLE_PERMISSIONS: Record<string, string[]> = {
  super_admin: ["*"], // 全部权限
  user: ["survey:create", "survey:edit", "survey:delete", "survey:publish", "template:create"]
};
```

**原因：**

- 当前仅两个角色，复杂度低
- 权限码目前仅用于前端 `v-permiss` 指令控制 UI 展示
- 后端接口权限通过 `authenticate` + `requireSuperAdmin` 控制

**后续扩展时机：**

- 角色类型超过 3 种时
- 需要动态配置权限时
- 需要管理员自定义角色权限时

**扩展方案（预留）：**

```prisma
// 暂不执行，后续扩展时使用
model Permission {
  id          BigInt   @id @default(autoincrement())
  code        String   @unique    // 权限编码
  name        String              // 权限名称
  description String?             // 权限说明
  created_at  DateTime @default(now())

  role_permissions RolePermission[]
  @@map("permissions")
}

model RolePermission {
  role_code     RoleCode
  permission_id BigInt

  permission    Permission @relation(fields: [permission_id], references: [id], onDelete: Cascade)
  @@id([role_code, permission_id])
  @@map("role_permissions")
}
```

### 4.6 User 表 — 无需变更

| 字段         | 状态 | 说明                 |
| ------------ | :--: | -------------------- |
| `avatar_url` | 已有 | 头像上传接口直接使用 |
| `role`       | 已有 | 审核时判断管理员身份 |
| 其余字段     | 已有 | 无需变更             |

### 4.7 SurveyComponent 表 — 无需变更

模板的组件数据与新问卷的组件数据共用 `survey_components` 表，通过 `survey_id` 关联。模板应用时，复制组件数据到新问卷。

---

## 5. 变更清单汇总

### 5.1 Survey 表变更

| 变更类型 | 字段             | 类型              | 默认值     | 说明                    |
| -------- | ---------------- | ----------------- | ---------- | ----------------------- |
| 新增     | `survey_type`    | SurveyType enum   | `personal` | 区分个人问卷 / 公共模板 |
| 新增     | `category`       | String?           | null       | 模板分类                |
| 新增     | `cover_url`      | String?           | null       | 模板封面图 URL          |
| 新增     | `download_count` | Int               | 0          | 模板使用次数            |
| 新增     | `rating`         | Decimal(2,1)?     | 0          | 模板平均评分            |
| 新增     | `review_status`  | ReviewStatus enum | `none`     | 审核状态                |

**新增索引：**

| 索引                                     | 用途                                                                      |
| ---------------------------------------- | ------------------------------------------------------------------------- |
| `@@index([survey_type, review_status])`  | 模板市场查询：`WHERE survey_type='template' AND review_status='approved'` |
| `@@index([survey_type, category])`       | 按分类筛选模板                                                            |
| `@@index([survey_type, download_count])` | 按热门排序模板                                                            |
| `@@index([survey_type, rating])`         | 按评分排序模板                                                            |

### 5.2 新增表

| 表名               | 用途     | 关键字段                                                                                   |
| ------------------ | -------- | ------------------------------------------------------------------------------------------ |
| `reviews`          | 审核记录 | survey_id, submitter_id, reviewer_id, status(ReviewStatus), submit_message, review_comment |
| `template_ratings` | 模板评分 | template_id, user_id, score(1-5), unique(template_id, user_id)                             |

### 5.3 新增枚举

| 枚举名         | 值                                        | 说明     |
| -------------- | ----------------------------------------- | -------- |
| `SurveyType`   | `personal`, `template`                    | 问卷类型 |
| `ReviewStatus` | `none`, `pending`, `approved`, `rejected` | 审核状态 |

### 5.4 完整 Prisma Schema 变更

```prisma
// ============================================================
// 新增枚举（追加到现有 enum 区域）
// ============================================================

enum SurveyType {
  personal
  template
}

enum ReviewStatus {
  none
  pending
  approved
  rejected
}

// ============================================================
// Survey 表变更（在现有字段基础上追加）
// ============================================================

model Survey {
  // ... 现有字段保持不变 ...

  // ─── 新增字段 ──────────────────────────────────────────────
  survey_type    SurveyType    @default(personal)
  category       String?
  cover_url      String?
  download_count Int           @default(0)
  rating         Decimal?      @default(0)  @db.Decimal(2, 1)
  review_status  ReviewStatus  @default(none)

  // ─── 新增关联 ──────────────────────────────────────────────
  reviews        Review[]
  template_ratings TemplateRating[]

  // ─── 新增索引 ──────────────────────────────────────────────
  @@index([survey_type, review_status])
  @@index([survey_type, category])
  @@index([survey_type, download_count])
  @@index([survey_type, rating])
}

// ============================================================
// 新增 Review 表
// ============================================================

model Review {
  id              BigInt        @id @default(autoincrement())
  survey_id       BigInt
  submitter_id    BigInt
  reviewer_id     BigInt?
  status          ReviewStatus  @default(pending)
  submit_message  String?       @db.Text
  review_comment  String?       @db.Text
  submitted_at    DateTime      @default(now())
  reviewed_at     DateTime?
  created_at      DateTime      @default(now())
  updated_at      DateTime      @updatedAt

  survey          Survey        @relation(fields: [survey_id], references: [id], onDelete: Cascade)
  submitter       User          @relation("ReviewSubmitter", fields: [submitter_id], references: [id])
  reviewer        User?         @relation("ReviewReviewer", fields: [reviewer_id], references: [id])

  @@index([survey_id])
  @@index([submitter_id])
  @@index([reviewer_id])
  @@index([status])
  @@index([submitted_at])
  @@index([survey_id, status])
  @@map("reviews")
}

// ============================================================
// 新增 TemplateRating 表
// ============================================================

model TemplateRating {
  id          BigInt    @id @default(autoincrement())
  template_id BigInt
  user_id     BigInt
  score       Int
  created_at  DateTime  @default(now())
  updated_at  DateTime  @updatedAt

  template    Survey    @relation(fields: [template_id], references: [id], onDelete: Cascade)
  user        User      @relation(fields: [user_id], references: [id], onDelete: Cascade)

  @@unique([template_id, user_id])
  @@index([template_id])
  @@index([template_id, score])
  @@map("template_ratings")
}
```

### 5.5 接口对 Schema 的依赖关系

| 接口                            | 依赖的表                 | 依赖的新字段/表                                              |
| ------------------------------- | ------------------------ | :----------------------------------------------------------- |
| `GET /api/templates`            | Survey                   | survey_type, category, download_count, rating, review_status |
| `GET /api/templates/:id`        | Survey + SurveyComponent | survey_type, review_status                                   |
| `POST /api/templates`           | Survey + Review          | survey_type, category, cover_url, review_status; Review 表   |
| `POST /api/templates/:id/apply` | Survey + SurveyComponent | survey_type, download_count                                  |
| `POST /api/reviews`             | Review + Survey          | Review 表; survey.review_status                              |
| `GET /api/reviews`              | Review + Survey          | Review 表; survey.title                                      |
| `GET /api/reviews/:id`          | Review + Survey          | Review 表                                                    |
| `POST /api/reviews/:id/revoke`  | Review + Survey          | Review 表; survey.review_status                              |
| `GET /api/user/permissions`     | 无（应用层）             | 无                                                           |

---

## 6. 迁移策略与注意事项

### 6.1 迁移步骤

```
步骤 1: 新增枚举 SurveyType、ReviewStatus
步骤 2: Survey 表新增 6 个字段（全部设默认值，兼容现有数据）
步骤 3: 创建 Review 表
步骤 4: 创建 TemplateRating 表
步骤 5: 数据回填：所有现有问卷 survey_type = 'personal', review_status = 'none'
步骤 6: 后端接口开发
步骤 7: 前端对接
```

### 6.2 数据兼容性

| 现有数据                  | 迁移后状态                                   | 影响                                       |
| ------------------------- | -------------------------------------------- | ------------------------------------------ |
| 所有现有 Survey 记录      | survey_type = `personal`                     | 无影响，行为不变                           |
| 所有现有 Survey 记录      | review_status = `none`                       | 无影响                                     |
| 现有 is_public = 1 的问卷 | survey_type = `personal`                     | 仍可通过公开链接访问，但不会出现在模板市场 |
| 现有 API 查询             | 需增加 `WHERE survey_type = 'personal'` 过滤 | 防止模板混入问卷列表                       |

### 6.3 后端接口改造要点

**问卷列表 `GET /api/surveys`：**

```typescript
// 默认仅返回个人问卷，不返回模板
where: { user_id: userId, survey_type: "personal", deleted_at: null }
```

**模板列表 `GET /api/templates`：**

```typescript
// 仅返回已审核通过的模板
where: { survey_type: "template", review_status: "approved" }
orderBy: 按 download_count / rating / created_at 排序
```

**申请模板 `POST /api/templates`：**

```typescript
// 1. 更新 survey_type 和 review_status
await prisma.survey.update({
  where: { id: surveyId },
  data: { survey_type: "template", review_status: "pending", category, cover_url }
});

// 2. 创建审核记录
await prisma.review.create({
  data: { survey_id: surveyId, submitter_id: userId, status: "pending", submit_message }
});
```

**应用模板 `POST /api/templates/:id/apply`：**

```typescript
// 1. 复制模板组件到新问卷
const template = await prisma.survey.findUnique({
  where: { id: templateId },
  include: { components: true }
});

const newSurvey = await prisma.survey.create({
  data: {
    user_id: userId,
    title: template.title,
    description: template.description,
    page_size: template.page_size,
    survey_type: "personal", // 新问卷为个人类型
    components: {
      create: template.components.map(c => ({ ...c, id: undefined, survey_id: undefined }))
    }
  }
});

// 2. 模板使用次数 +1
await prisma.survey.update({
  where: { id: templateId },
  data: { download_count: { increment: 1 } }
});
```

### 6.4 前端改造要点

| 文件                         | 改造内容                                        |
| ---------------------------- | ----------------------------------------------- |
| `src/api/modules/`           | 新增 `template.ts`、`review.ts`                 |
| `src/types/`                 | 新增 `TemplateItem`、`ReviewRecord` 等类型      |
| `src/stores/useEditor.ts`    | 新增 `surveyType` 字段，区分个人/模板模式       |
| `src/stores/useUser.ts`      | 新增 `permissions` 字段                         |
| `src/views/Layout/index.vue` | 问卷列表增加类型筛选 Tab（个人问卷 / 模板市场） |
| `src/directives/permiss.ts`  | 实现数组模式 `v-permiss="['template:create']"`  |

### 6.5 注意事项

1. **审核状态与问卷类型的一致性**：`survey_type = template` 的记录 `review_status` 不允许为 `none`（应用层约束）
2. **模板修改后重新审核**：模板作者修改模板内容后，应将 `review_status` 重置为 `pending`，并创建新的 Review 记录
3. **模板删除的影响**：模板删除后，已应用该模板创建的个人问卷不受影响（组件数据已复制）
4. **评分计算**：`Survey.rating` 是冗余字段，用于加速查询。更新 `TemplateRating` 后需异步重新计算
5. **索引策略**：`survey_type` 参与多个复合索引的前缀，因为所有模板查询都以此过滤
6. **软删除兼容**：模板查询需增加 `deleted_at IS NULL` 条件（如 Survey 后续增加软删除）

---

## 附录

### A. 与已有文档的关系

| 文档                                | 关系                                             |
| ----------------------------------- | ------------------------------------------------ |
| `frontend-api-requirements.md`      | 本文档的数据层实现方案                           |
| `user-module-tech-doc.md`           | 用户模块不变，本文档使用现有 User 表             |
| `user-module-optimization-guide.md` | 中间件优化不变，本文档新增的接口复用相同中间件栈 |
| `survey-api-spec.md`                | 问卷 CRUD 接口不变，本文档新增模板和审核接口     |

### B. 版本历史

| 版本 | 日期       | 变更说明                                                                |
| ---- | ---------- | ----------------------------------------------------------------------- |
| 1.0  | 2026-06-19 | 初始版本，包含 Survey 表 6 个新增字段、Review 表、TemplateRating 表设计 |

---

**文档维护者**：系统自动生成  
**最后更新**：2026-06-19
