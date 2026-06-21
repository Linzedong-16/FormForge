# 问卷文件上传与签名组件接口设计

> 版本：1.0
> 日期：2026-06-21
> 目标：`app/q-server/src/modules/survey`
> 范围：图片选择组件（SinglePicSelect / MultiPicSelect）& 签名组件（Signature）后端支持

---

## 目录

1. [需求背景](#1-需求背景)
2. [数据库设计](#2-数据库设计)
3. [接口设计](#3-接口设计)
4. [接口独立性策略](#4-接口独立性策略)
5. [数据流图](#5-数据流图)
6. [错误处理规范](#6-错误处理规范)
7. [安全与限流](#7-安全与限流)
8. [实施清单](#8-实施清单)

---

## 1. 需求背景

### 1.1 问题现状

| 组件                                 | 当前行为                                                                                                                              | 问题                                                      |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `SinglePicSelect` / `MultiPicSelect` | PicItem 通过 `POST /api/q-editor/upload` 上传图片到 MinIO，返回 URL 写入 `options[].value`，随 `survey_components.config` JSON 持久化 | 无文件追踪表，无法级联清理、审计追溯、孤儿文件发现        |
| `Signature`                          | `canvas.toDataURL()` 生成 base64 PNG，通过 `emit("updateAnswer")` → `answers.value` 存储                                              | base64 体积大（50~200KB）、不可 CDN 加速、污染 answers 表 |

### 1.2 设计目标

1. **图片选择组件**：新增 `survey_files` 表追踪上传文件，支持文件溯源和级联清理
2. **签名组件**：canvas blob 上传到 MinIO，`answers.value` 存储 URL 而非 base64
3. **完全独立**：两个新接口与头像上传接口（`POST /api/user/avatar`）零耦合

### 1.3 已有基础

- **上传工具**：[`uploadToMinio()`](file:///d:/coding/project/questionnaireSys/app/q-server/src/utils/upload.ts) 已封装 MinIO 上传/删除/URL 构建，可直接复用
- **认证中间件**：[`authenticate`](file:///d:/coding/project/questionnaireSys/app/q-server/src/modules/user/auth.middleware.ts) 已实现 JWT 校验
- **审计日志**：[`createAuditLog()`](file:///d:/coding/project/questionnaireSys/app/q-server/src/utils/audit-log.ts) 已封装
- **缓存工具**：[`createCache()`](file:///d:/coding/project/questionnaireSys/app/q-server/src/utils/cache.ts) 已封装 Cache-Aside 模式
- **限流机制**：Fastify 插件 `@fastify/rate-limit` 已注册

---

## 2. 数据库设计

### 2.1 新增表：`survey_files`

该表用于追踪所有通过问卷编辑器上传的文件（图片选择组件的封面图片、签名图片等）。

```prisma
// ============================================================
// 14. 问卷文件表 (survey_files)
//
// 设计目的：
//   - 追踪问卷编辑器上传的所有文件（图片选择组件封面、签名图片）
//   - 支撑问卷删除时级联清理 MinIO 文件
//   - 提供文件溯源（上传者、上传时间、文件大小）
//   - 识别孤儿文件（已从 survey_components.config 中移除但 MinIO 仍有残留）
//
// 与 avatar 上传的区别：
//   - avatar 属于 user 模块，文件追踪逻辑内嵌于 AvatarService / UserProfile
//   - survey_files 属于 survey 模块，独立管理，互不干扰
// ============================================================
model SurveyFile {
  id          BigInt     @id @default(autoincrement())
  survey_id   BigInt?    // 所属问卷（可为 null，签名文件关联 response 而非 survey）
  user_id     BigInt     // 上传者
  file_url    String     @db.VarChar(1024) // MinIO 完整访问 URL
  file_key    String     @db.VarChar(512)  // MinIO 对象 key（如 "survey-images/uuid.png"），删除时需要
  file_name   String     @db.VarChar(255)  // 原始文件名
  mime_type   String     @db.VarChar(127)  // MIME 类型（如 "image/png"）
  file_size   BigInt     // 文件大小（字节）
  file_type   FileType   @default(survey_option_image) // 文件来源类型
  created_at  DateTime   @default(now())

  // 关联关系
  survey Survey? @relation(fields: [survey_id], references: [id], onDelete: SetNull)

  @@index([survey_id])
  @@index([user_id])
  @@index([file_type])
  @@index([created_at])
  @@index([survey_id, file_type]) // 高频：按问卷查询特定类型文件
  @@map("survey_files")
}

enum FileType {
  survey_option_image  // 图片选择组件封面图（PicItem 上传）
  survey_signature     // 签名图片（Signature canvas 转 blob 后上传）
  survey_cover         // 问卷封面图（survey.cover_url，预留）
}
```

### 2.2 表关系 ER 图

```
┌──────────────┐         ┌──────────────────┐         ┌───────────────────┐
│    surveys   │ 1───0..* │  survey_files     │ *───1   │      users        │
│              │         │                   │         │                   │
│  id (PK)     │────────→│  survey_id (FK)   │         │  id (PK) ←───────│
│  user_id     │         │  user_id (FK)     │────────→│  email            │
│  title       │         │  file_url         │         │  username         │
│  ...         │         │  file_key         │         │  ...              │
└──────────────┘         │  file_name        │         └───────────────────┘
       │                 │  mime_type        │
       │ 1               │  file_size        │
       │                 │  file_type (enum) │
       ▼                 │  created_at       │
┌──────────────┐         └──────────────────┘
│survey_       │
│components    │
│  config (JSON)── 存储 file_url 引用，通过 file_url 可反查到 survey_files 记录
└──────────────┘

┌──────────────┐         ┌──────────────────┐
│  responses   │ 1───0..* │     answers      │
│              │         │                   │
│  id (PK)     │────────→│  response_id (FK) │
│  survey_id   │         │  component_id (FK)│
│  ...         │         │  value ───────────│── 签名组件：存储 file_url（非 base64）
└──────────────┘         │  values (JSON)    │
                         └──────────────────┘
```

### 2.3 迁移命令

```bash
cd app/q-server
npx prisma migrate dev --name add_survey_files
```

### 2.4 与现有表的隔离说明

| 方面         | avatar 上传                | survey file 上传                        | 隔离机制         |
| ------------ | -------------------------- | --------------------------------------- | ---------------- |
| 表           | `user_profiles.avatar_url` | `survey_files`                          | 不同表，互不引用 |
| MinIO prefix | `avatars/`                 | `survey-images/`                        | 不同对象路径     |
| 路由         | `POST /api/user/avatar`    | `POST /api/q-editor/survey-file/upload` | 不同 URL 前缀    |
| Service      | `AvatarService`            | `SurveyFileService`                     | 不同类           |
| 文件大小限制 | 5MB（需裁剪为 800x800）    | 10MB（原图保留）                        | 独立常量         |

---

## 3. 接口设计

### 3.1 接口总览

| 方法     | 路径                               | 业务         | 限流   | 说明                                                    |
| -------- | ---------------------------------- | ------------ | ------ | ------------------------------------------------------- |
| `POST`   | `/api/q-editor/survey-file/upload` | 问卷文件上传 | 60/min | 图片选择组件封面 + 签名图片通用上传                     |
| `POST`   | `/api/q-editor/signature/upload`   | 签名图片上传 | 30/min | Canvas blob 专用，自动标记 `file_type=survey_signature` |
| `GET`    | `/api/surveys/:id/files`           | 问卷文件列表 | 60/min | 查询问卷下所有关联文件                                  |
| `DELETE` | `/api/survey-files/:id`            | 删除单个文件 | 20/min | 删除 MinIO 文件 + 数据库记录                            |

### 3.2 接口 1：POST /api/q-editor/survey-file/upload — 通用问卷文件上传

这是**现有** `POST /api/q-editor/upload` 的增强版。旧接口保留兼容，新接口增加 `survey_id` 和 `file_type` 参数，上传后将文件记录写入 `survey_files` 表。

**与现有接口的关系**：

- 现有的 `POST /api/q-editor/upload` 保持不变，继续为旧版 PicItem 提供服务
- 新接口 `/survey-file/upload` 在其基础上增加数据库追踪能力
- 前端 PicItem 逐步迁移到新接口

**认证**：`authenticate`

**限流**：`60 req/min`

**Content-Type**：`multipart/form-data`

**请求参数**：

| 字段        | 类型   | 必填 | 说明                                 |
| ----------- | ------ | ---- | ------------------------------------ |
| `file`      | File   | 是   | 图片文件                             |
| `survey_id` | string | 是   | 所属问卷 ID（BigInt → string）       |
| `file_type` | string | 否   | 文件类型，默认 `survey_option_image` |

**允许的 MIME 类型**：

```
image/jpeg, image/png, image/gif, image/webp, image/svg+xml, image/bmp
```

**文件大小限制**：≤ 10MB（通过 `bodyLimit` 配置实现）

**业务逻辑**：

```
1. 解析 multipart 文件（@fastify/multipart）
   ├─ 文件不存在 → 400 "请选择要上传的文件"
   └─ 文件存在 → 继续

2. 校验 survey_id
   ├─ 格式非法 → 400 "问卷 ID 格式错误"
   ├─ 问卷不存在 或 user_id 不匹配 或 deleted_at 非空 → 404 "问卷不存在"
   └─ 校验通过 → 继续

3. 校验文件
   ├─ MIME 类型不在允许列表 → 400 "不支持的文件类型"
   ├─ 文件大小 > 10MB → 400 "文件大小不能超过 10MB"
   └─ 校验通过 → 继续

4. 上传到 MinIO
   ├─ prefix = "survey-images"
   ├─ key = "survey-images/{uuid}{ext}"
   └─ 返回 file_url

5. 写入 survey_files 记录
   ├─ survey_id = 请求参数
   ├─ user_id = 当前登录用户
   ├─ file_url = MinIO 返回 URL
   ├─ file_key = MinIO 对象 key
   ├─ file_name = 原始文件名
   ├─ mime_type = 文件 MIME 类型
   ├─ file_size = 文件字节数
   └─ file_type = survey_option_image

6. 审计日志（异步）
   └─ action = "survey_file_upload"

7. 返回 { file_id, file_url }
```

**请求示例**：

```http
POST /api/q-editor/survey-file/upload
Authorization: Bearer <access_token>
Content-Type: multipart/form-data

--boundary
Content-Disposition: form-data; name="file"; filename="cover.jpg"
Content-Type: image/jpeg

<binary data>
--boundary
Content-Disposition: form-data; name="survey_id"

123
--boundary--
```

**响应示例**：

```json
{
  "code": 0,
  "msg": "上传成功",
  "data": {
    "file_id": "1",
    "file_url": "http://localhost:9000/questionnaire/survey-images/a1b2c3d4.jpg",
    "file_name": "cover.jpg",
    "mime_type": "image/jpeg",
    "file_size": 245760
  }
}
```

**错误码**：

| code | 说明                     |
| ---- | ------------------------ |
| 400  | 问卷 ID 格式错误         |
| 400  | 请选择要上传的文件       |
| 400  | 不支持的文件类型: {mime} |
| 400  | 文件大小不能超过 10MB    |
| 404  | 问卷不存在               |

---

### 3.3 接口 2：POST /api/q-editor/signature/upload — 签名图片上传

这是**全新接口**，专门处理 Signature 组件 canvas 转 blob 后的上传。

**认证**：`authenticate`

**限流**：`30 req/min`

**Content-Type**：`multipart/form-data` 或 `image/png`（仅 PNG）

**请求参数**：

| 字段        | 类型       | 必填 | 说明                           |
| ----------- | ---------- | ---- | ------------------------------ |
| `file`      | File(Blob) | 是   | Canvas 导出的 PNG blob         |
| `survey_id` | string     | 是   | 所属问卷 ID（BigInt → string） |

**MIME 限制**：仅 `image/png`（签名 canvas 转 blob 固定为 PNG）

**文件大小限制**：≤ 1MB（签名图片不会很大）

**业务逻辑**：

```
1. 解析 multipart 文件
   ├─ 文件不存在 → 400 "请选择要上传的签名图片"
   └─ 文件存在 → 继续

2. 校验 survey_id
   ├─ 格式非法 → 400 "问卷 ID 格式错误"
   ├─ 问卷不存在或无权访问 → 404
   └─ 校验通过 → 继续

3. 校验文件
   ├─ MIME 类型非 image/png → 400 "签名图片仅支持 PNG 格式"
   ├─ 文件大小 > 1MB → 400 "签名图片大小不能超过 1MB"
   └─ 校验通过 → 继续

4. 上传到 MinIO
   ├─ prefix = "survey-signatures"
   ├─ key = "survey-signatures/{uuid}.png"
   └─ 返回 file_url

5. 写入 survey_files 记录
   ├─ survey_id = 请求参数
   ├─ user_id = 当前登录用户
   ├─ file_type = survey_signature
   └─ ...（同接口 1）

6. 审计日志（异步）
   └─ action = "signature_upload"

7. 返回 { file_id, file_url }
```

> **为什么 signature 需要独立接口而不是复用接口 1？**
>
> | 差异点       | 接口 1 (survey-file/upload)      | 接口 2 (signature/upload) |
> | ------------ | -------------------------------- | ------------------------- |
> | MIME 限制    | jpg/png/gif/webp/svg/bmp         | 仅 png                    |
> | 文件大小     | ≤ 10MB                           | ≤ 1MB                     |
> | file_type    | 可指定，默认 survey_option_image | 固定 survey_signature     |
> | MinIO prefix | survey-images/                   | survey-signatures/        |
> | 限流         | 60/min                           | 30/min（签名操作低频）    |

**请求示例**：

```http
POST /api/q-editor/signature/upload
Authorization: Bearer <access_token>
Content-Type: multipart/form-data

--boundary
Content-Disposition: form-data; name="file"; filename="signature.png"
Content-Type: image/png

<canvas blob data>
--boundary
Content-Disposition: form-data; name="survey_id"

123
--boundary--
```

**响应示例**：

```json
{
  "code": 0,
  "msg": "签名上传成功",
  "data": {
    "file_id": "2",
    "file_url": "http://localhost:9000/questionnaire/survey-signatures/e5f6g7h8.png"
  }
}
```

**前端集成说明**：

`Signature.vue` 的 `endDraw()` 方法需要改为：

```typescript
// 现有代码
const endDraw = () => {
  isDrawing.value = false;
  isSigned.value = true;
  const data = canvasRef.value?.toDataURL("image/png") ?? ""; // ❌ base64
  emits("updateAnswer", data);
};

// 改为
const endDraw = async () => {
  isDrawing.value = false;
  isSigned.value = true;

  const blob = await new Promise<Blob | null>(resolve => canvasRef.value?.toBlob(resolve, "image/png"));
  if (!blob) return;

  // 调用签名上传接口
  const result = await uploadSignature(blob, props.surveyId);
  emits("updateAnswer", result.file_url); // ✅ 存储 URL
};
```

---

### 3.4 接口 3：GET /api/surveys/:id/files — 问卷文件列表

查询指定问卷下关联的所有文件记录，用于管理后台展示和清理。

**认证**：`authenticate`

**限流**：`60 req/min`

**查询参数**：

| 参数        | 类型   | 默认值 | 说明                                                                  |
| ----------- | ------ | ------ | --------------------------------------------------------------------- |
| `file_type` | string | —      | 可选筛选：`survey_option_image` / `survey_signature` / `survey_cover` |

**业务逻辑**：

```
1. 校验 survey_id 存在且属于当前用户 → 否则 404
2. 查询 survey_files 表
   ├─ WHERE survey_id = :id AND file_type = :type（如有筛选）
   └─ ORDER BY created_at DESC
3. 返回文件列表
```

**响应示例**：

```json
{
  "code": 0,
  "msg": "ok",
  "data": {
    "files": [
      {
        "id": "1",
        "file_url": "http://localhost:9000/questionnaire/survey-images/a1b2c3d4.jpg",
        "file_name": "cover.jpg",
        "mime_type": "image/jpeg",
        "file_size": 245760,
        "file_type": "survey_option_image",
        "created_at": "2026-06-21T10:00:00.000Z"
      }
    ],
    "total": 1
  }
}
```

---

### 3.5 接口 4：DELETE /api/survey-files/:id — 删除单个文件

删除指定文件记录，同时从 MinIO 中删除物理文件。

**认证**：`authenticate`

**限流**：`20 req/min`

**业务逻辑**：

```
1. 查询 survey_files 记录
   ├─ 不存在 → 404 "文件记录不存在"
   └─ 存在 → 继续

2. 权限校验
   ├─ 文件的 user_id 必须等于当前用户
   └─ 或当前用户是文件的 survey 的所有者
   ├─ 否则 → 403 "无权删除该文件"

3. 删除 MinIO 文件
   └─ 调用 deleteFromMinio(file_key)

4. 删除数据库记录
   └─ DELETE FROM survey_files WHERE id = :id

5. 审计日志（异步）
   └─ action = "survey_file_delete"

6. 返回 null
```

> **设计决策：为什么不在问卷软删除时自动级联删除 MinIO 文件？**
>
> - 问卷软删除为可恢复操作，MinIO 文件应立即清理会导致误删后无法恢复
> - 孤儿文件可通过定时任务对比 `survey_files` 与 `survey_components.config` 中的 URL 来识别和清理
> - 接口 4 提供手动删除能力，管理员可精确清理不需要的文件

---

## 4. 接口独立性策略

### 4.1 三大上传接口全维度隔离

```
┌──────────────────────────────────────────────────────────────────┐
│                      三大上传接口对比                             │
├──────────────┬──────────────────┬─────────────────┬──────────────┤
│    维度       │ 头像上传          │ 问卷文件上传     │ 签名上传      │
│             │ (已实现)           │ (本次新增)       │ (本次新增)    │
├──────────────┼──────────────────┼─────────────────┼──────────────┤
│ 路由前缀      │ /api/user/avatar │ /api/q-editor/   │ /api/q-editor/│
│             │                   │ survey-file/     │ signature/   │
│             │                   │ upload           │ upload       │
├──────────────┼──────────────────┼─────────────────┼──────────────┤
│ 路由文件      │ user/            │ survey/          │ survey/      │
│             │ profile.routes.ts │ file.routes.ts   │ file.routes.ts│
├──────────────┼──────────────────┼─────────────────┼──────────────┤
│ Service     │ AvatarService     │ SurveyFileService│ SurveyFileService│
│             │                   │                 │ (相同类)      │
├──────────────┼──────────────────┼─────────────────┼──────────────┤
│ MinIO prefix│ avatars/          │ survey-images/   │ survey-      │
│             │                   │                 │ signatures/  │
├──────────────┼──────────────────┼─────────────────┼──────────────┤
│ 数据库表     │ user_profiles     │ survey_files     │ survey_files │
│             │ .avatar_url       │                 │              │
├──────────────┼──────────────────┼─────────────────┼──────────────┤
│ 文件大小     │ ≤ 5MB             │ ≤ 10MB           │ ≤ 1MB        │
│             │ (裁剪 800x800)    │ (原图保留)       │ (PNG only)   │
├──────────────┼──────────────────┼─────────────────┼──────────────┤
│ 图片处理     │ sharp 压缩+裁剪   │ 无（原图上传）    │ 无（纯存储）  │
├──────────────┼──────────────────┼─────────────────┼──────────────┤
│ 审计 action  │ upload_avatar    │ survey_file_    │ signature_   │
│             │                   │ upload           │ upload       │
└──────────────┴──────────────────┴─────────────────┴──────────────┘
```

### 4.2 代码层面解耦措施

| 措施                         | 说明                                                                                             |
| ---------------------------- | ------------------------------------------------------------------------------------------------ |
| **不同路由文件**             | avatar 在 `user/profile.routes.ts`，survey file 在 `survey/file.routes.ts`                       |
| **不同 Service 类**          | `AvatarService` vs `SurveyFileService`，各自拥有独立的常量配置                                   |
| **共享工具函数**             | `uploadToMinio()` / `deleteFromMinio()` / `extractKey()` 是纯函数，无状态，两个 Service 各自调用 |
| **无跨模块 import**          | `SurveyFileService` 不导入 `AvatarService`，不引用 `UserProfile` 表                              |
| **独立的 MinIO Bucket 路径** | 三个 prefix 互不重叠，即使 Bucket 相同也不会冲突                                                 |

### 4.3 Prisma Schema 中的隔离

```prisma
// ❌ 不存在的耦合（禁止出现）
model SurveyFile {
  // avatar_url 不在本表
  // UserProfile 不被本表引用
  // AvatarService 不被本模块 import

  survey_id BigInt?  // 关联 survey，不关联 user profile
  ...
}

// ✅ 正确的隔离
model UserProfile {
  avatar_url String?  // 头像专有字段，与 survey_files 无关
  ...
}
```

---

## 5. 数据流图

### 5.1 图片选择组件 — 编辑态上传流

```
┌──────────────────────────────────────────────────────────────────┐
│                    PicItem 编辑态上传流程                         │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────┐    ┌──────────────┐    ┌──────────┐                │
│  │ PicItem │───→│ el-upload    │───→│uploadImage│                │
│  │ .vue    │    │ customUpload │    │ (api)    │                │
│  └─────────┘    └──────────────┘    └────┬─────┘                │
│                                          │                       │
│                   ┌──────────────────────┘                      │
│                   │ FormData { file, survey_id }                │
│                   ▼                                              │
│     ┌─────────────────────────────┐                            │
│     │ POST /api/q-editor/         │                            │
│     │   survey-file/upload        │          ┌────────────────┐ │
│     └─────────────┬───────────────┘          │ 新接口（本次新增）│ │
│                   │                           └────────────────┘ │
│         ┌─────────┼──────────┐                                  │
│         ▼         ▼          ▼                                  │
│   ┌─────────┐ ┌──────┐ ┌──────────┐                            │
│   │校验文件  │ │ 上传  │ │写入DB    │                            │
│   │MIME/大小│ │MinIO │ │survey_   │                            │
│   │10MB限制 │ │      │ │files     │                            │
│   └─────────┘ └──┬───┘ └────┬─────┘                            │
│                  │           │                                   │
│                  ▼           ▼                                   │
│           ┌──────────┐ ┌───────────┐                            │
│           │file_url  │ │ file_id   │                            │
│           │"http://" │ │ "1"       │                            │
│           └────┬─────┘ └───────────┘                            │
│                │                                                 │
│                ▼                                                 │
│     ┌─────────────────────┐                                    │
│     │ PicItem.imageUrl    │                                    │
│     │ = file_url          │                                    │
│     └─────────┬───────────┘                                    │
│               │                                                 │
│               ▼                                                 │
│     ┌─────────────────────┐                                    │
│     │ getLink({ index,    │                                    │
│     │   link: file_url }) │                                    │
│     └─────────┬───────────┘                                    │
│               │                                                 │
│               ▼                                                 │
│     ┌─────────────────────────┐                                │
│     │ com.status.options       │                                │
│     │ [index].value = file_url│  ← 存入 survey_components      │
│     │                         │    .config JSON                │
│     └─────────────────────────┘                                │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### 5.2 签名组件 — 填答态上传流

```
┌──────────────────────────────────────────────────────────────────┐
│                 Signature 填答态上传流程                          │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌───────────┐                                                  │
│  │ Signature │  用户签名绘制完成                                  │
│  │ Canvas    │                                                  │
│  └─────┬─────┘                                                  │
│        │ endDraw()                                              │
│        ▼                                                        │
│  ┌─────────────────┐                                            │
│  │ canvas.toBlob() │  转为 PNG blob（非 base64）                  │
│  │ "image/png"     │                                            │
│  └────────┬────────┘                                            │
│           │                                                     │
│           ▼                                                     │
│  ┌──────────────────┐                                           │
│  │ uploadSignature  │  新增 API 函数                            │
│  │ (api/upload.ts)  │                                           │
│  └────────┬─────────┘                                           │
│           │ FormData { file: Blob, survey_id }                  │
│           ▼                                                     │
│  ┌───────────────────────────┐                                  │
│  │ POST /api/q-editor/       │                                  │
│  │   signature/upload        │         ┌────────────────┐       │
│  └─────────────┬─────────────┘         │ 新接口（本次新增）│      │
│                │                        └────────────────┘       │
│      ┌─────────┼──────────┐                                    │
│      ▼         ▼          ▼                                    │
│  ┌────────┐ ┌──────┐ ┌──────────┐                              │
│  │校验PNG │ │上传   │ │写入DB    │                              │
│  │≤1MB    │ │MinIO │ │survey_   │                              │
│  │        │ │      │ │files     │                              │
│  │        │ │prefix│ │file_type=│                              │
│  │        │ │signa-│ │survey_   │                              │
│  │        │ │tures/│ │signature │                              │
│  └────────┘ └──┬───┘ └────┬─────┘                              │
│                │           │                                     │
│                ▼           │                                     │
│         ┌──────────┐      │                                     │
│         │file_url  │      │                                     │
│         │"http://" │      │                                     │
│         └────┬─────┘      │                                     │
│              │             │                                     │
│              ▼             │                                     │
│  ┌───────────────────┐    │                                     │
│  │ emit("updateAnswer"│   │                                     │
│  │   , file_url)     │    │                                     │
│  └─────────┬─────────┘    │                                     │
│            │               │                                     │
│            ▼               │                                     │
│  ┌─────────────────────┐  │                                     │
│  │ answers.value       │  │                                     │
│  │ = file_url  ✅      │  │  ← 存 URL，非 base64                │
│  └─────────────────────┘  │                                     │
│                                                                  │
│  ─── 对比旧方案 ─────────────────────────────────────────────   │
│  ❌ answers.value                                                │
│     = "data:image/png;base64,iVBORw0KGgo..." (50~200KB)        │
└──────────────────────────────────────────────────────────────────┘
```

### 5.3 问卷删除 — 文件级联清理流

```
┌──────────────────────────────────────────────────────────────────┐
│                  问卷删除时的文件清理流程                          │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  DELETE /api/surveys/:id                                        │
│       │                                                         │
│       ▼                                                         │
│  ┌─────────────────┐                                            │
│  │ 软删除问卷       │                                            │
│  │ deleted_at=now()│                                            │
│  └────────┬────────┘                                            │
│           │                                                     │
│           ▼                                                     │
│  ┌─────────────────────────┐                                    │
│  │ SELECT * FROM            │                                   │
│  │ survey_files             │                                   │
│  │ WHERE survey_id = :id    │                                   │
│  └────────┬────────────────┘                                    │
│           │                                                     │
│           ▼                                                     │
│  ┌─────────────────────────┐                                    │
│  │ 遍历每条记录              │                                   │
│  │   deleteFromMinio(       │                                   │
│  │     file_key)            │                                   │
│  └────────┬────────────────┘                                    │
│           │                                                     │
│           ▼                                                     │
│  ┌─────────────────────────┐                                    │
│  │ DELETE FROM survey_files │                                   │
│  │ WHERE survey_id = :id    │                                   │
│  └─────────────────────────┘                                    │
│                                                                  │
│  注意：                                                          │
│  - 软删除问卷时，删除物理文件（MinIO）和追踪记录（survey_files）    │
│  - 若问卷恢复（取消软删除），文件不可恢复，需要重新上传             │
│  - 公共模板 (survey_type=template) 的文件不会被删除               │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### 5.4 三大上传系统的全局架构图

```
                        ┌───────────────────────────┐
                        │     uploadToMinio()        │
                        │     deleteFromMinio()      │
                        │     extractKey()           │
                        │     (utils/upload.ts)      │
                        │     【共享工具层 — 纯函数】  │
                        └─────────────┬─────────────┘
                                      │
          ┌───────────────────────────┼───────────────────────────┐
          │                           │                           │
          ▼                           ▼                           ▼
┌──────────────────┐    ┌──────────────────────┐    ┌──────────────────┐
│  AvatarService   │    │  SurveyFileService   │    │  SurveyFileService│
│  (user/)         │    │  (survey/)           │    │  (survey/)        │
│                  │    │                      │    │                   │
│  POST /api/user/ │    │  POST /api/q-editor/ │    │  POST /api/       │
│    avatar         │    │    survey-file/     │    │    q-editor/      │
│                  │    │    upload            │    │    signature/     │
│  MinIO prefix:   │    │                      │    │    upload         │
│    avatars/      │    │  MinIO prefix:        │    │                   │
│                  │    │    survey-images/     │    │  MinIO prefix:     │
│  DB table:       │    │                      │    │    survey-         │
│    user_profiles │    │  DB table:            │    │    signatures/    │
│                  │    │    survey_files       │    │                   │
│  文件限制: 5MB   │    │                      │    │  DB table:         │
│  图片处理:       │    │  文件限制: 10MB       │    │    survey_files    │
│    sharp压缩     │    │  图片处理: 无         │    │                   │
│                  │    │                      │    │  文件限制: 1MB     │
│                  │    │                      │    │  图片处理: 无      │
└──────────────────┘    └──────────────────────┘    └──────────────────┘
```

---

## 6. 错误处理规范

### 6.1 错误码体系

所有接口沿袭项目已有的 [AppError](file:///d:/coding/project/questionnaireSys/app/q-server/src/utils/errors.ts) 体系：

| HTTP 状态码 | BizCode          | 场景                                           |
| ----------- | ---------------- | ---------------------------------------------- |
| 400         | `BAD_REQUEST`    | 问卷 ID 格式错误、文件类型不支持、文件大小超限 |
| 401         | `UNAUTHORIZED`   | Token 过期或未携带 Token                       |
| 403         | `FORBIDDEN`      | 无权操作该问卷或文件                           |
| 404         | `NOT_FOUND`      | 问卷不存在、文件记录不存在                     |
| 500         | `INTERNAL_ERROR` | MinIO 写入失败、数据库异常                     |

### 6.2 错误响应格式

```json
{
  "code": 400,
  "msg": "文件大小不能超过 10MB",
  "data": null
}
```

### 6.3 MinIO 异常处理

```typescript
// MinIO 上传失败的降级策略
try {
  const fileUrl = await uploadToMinio(fastify, buffer, prefix, filename, mimetype);
} catch (err) {
  // MinIO 不可用时，返回明确错误，不降级到本地存储
  throw new AppError("文件存储服务暂不可用，请稍后重试", 500);
}
```

---

## 7. 安全与限流

### 7.1 认证

| 接口                       | 认证方式       | 说明                          |
| -------------------------- | -------------- | ----------------------------- |
| `POST /survey-file/upload` | `authenticate` | JWT Bearer Token              |
| `POST /signature/upload`   | `authenticate` | JWT Bearer Token              |
| `GET /surveys/:id/files`   | `authenticate` | JWT Bearer Token              |
| `DELETE /survey-files/:id` | `authenticate` | JWT Bearer Token + 所有权校验 |

### 7.2 所有权校验

所有文件操作必须符合以下条件之一：

1. `survey_files.user_id === current_user`（上传者本人）
2. `survey_files.survey.user_id === current_user`（问卷所有者）

### 7.3 限流策略

| 接口               | 限流   | 依据                                 |
| ------------------ | ------ | ------------------------------------ |
| survey-file/upload | 60/min | 中等频率，问卷编辑过程中可能多次上传 |
| signature/upload   | 30/min | 低频，每次签名只需一次上传           |
| surveys/:id/files  | 60/min | 查询操作，不涉及写入                 |
| survey-files/:id   | 20/min | 低频，保护性删除操作                 |

### 7.4 文件类型白名单

```typescript
// 接口 1：通用上传
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml", "image/bmp"];

// 接口 2：签名上传
const ALLOWED_SIGNATURE_TYPES = ["image/png"];
```

---

## 8. 实施清单

### 8.1 数据库变更

| 序号 | 任务                                                           | 文件                   |
| ---- | -------------------------------------------------------------- | ---------------------- |
| 1    | 在 `schema.prisma` 中新增 `SurveyFile` model + `FileType` enum | `prisma/schema.prisma` |
| 2    | 执行 `npx prisma migrate dev --name add_survey_files`          | CLI                    |
| 3    | 验证迁移成功，`survey_files` 表已创建                          | —                      |

### 8.2 后端实现

| 序号 | 任务                                               | 文件                                   |
| ---- | -------------------------------------------------- | -------------------------------------- |
| 4    | 新增 `SurveyFileService` 类                        | `src/modules/survey/file.service.ts`   |
| 5    | 新增 `file.schemas.ts`（Zod 校验）                 | `src/modules/survey/file.schemas.ts`   |
| 6    | 新增 `file.routes.ts`（4 个端点）                  | `src/modules/survey/file.routes.ts`    |
| 7    | 注册路由到 `routes/index.ts`                       | `src/routes/index.ts`                  |
| 8    | 在 `SurveyService.delete()` 中增加文件级联清理逻辑 | `src/modules/survey/survey.service.ts` |
| 9    | 新增 `CacheKeys` 文件列表相关 key                  | `src/utils/cache.ts`                   |

### 8.3 前端适配

| 序号 | 任务                                            | 文件                                                             |
| ---- | ----------------------------------------------- | ---------------------------------------------------------------- |
| 10   | `PicItem.vue` 切换到新接口 `survey-file/upload` | `src/components/SurveyComs/Common/PicItem.vue`                   |
| 11   | `Signature.vue` 改为 blob 上传 + URL 存储       | `src/components/SurveyComs/Materials/AdvancedComs/Signature.vue` |
| 12   | 新增 `uploadSignature()` API 函数               | `src/api/upload.ts`                                              |
| 13   | 新增 `getSurveyFiles()` API 函数                | `src/api/modules/survey/index.ts`                                |

### 8.4 测试

| 序号 | 任务                       | 文件                                   |
| ---- | -------------------------- | -------------------------------------- |
| 14   | SurveyFileService 单元测试 | `src/spec/survey/file.service.spec.ts` |
| 15   | file.routes 集成测试       | `src/spec/survey/file.routes.spec.ts`  |
| 16   | delete survey 级联清理测试 | 追加到现有的 `survey.service.spec.ts`  |

### 8.5 新旧接口迁移路径

```
阶段 1（本设计实施后）：
  ├─ 旧接口 POST /api/q-editor/upload → 保留（兼容旧版 PicItem）
  ├─ 新接口 POST /api/q-editor/survey-file/upload → 上线（新版 PicItem）
  └─ 新接口 POST /api/q-editor/signature/upload → 上线（Signature）

阶段 2（前端适配完成后）：
  └─ PicItem.vue 切换至新接口

阶段 3（稳定运行后，可选）：
  └─ 废弃旧接口 POST /api/q-editor/upload
```

---

## 附录 A：文件结构规划

```
app/q-server/src/modules/survey/
├── survey.routes.ts          # 问卷 CRUD（已有）
├── survey.service.ts         # 问卷业务逻辑（已有）
├── survey.schemas.ts         # 问卷 Zod Schema（已有）
├── upload.routes.ts          # 旧上传接口（已有，保留兼容）
├── file.routes.ts           # 【新增】问卷文件上传路由
├── file.service.ts          # 【新增】问卷文件业务逻辑
├── file.schemas.ts          # 【新增】问卷文件 Zod Schema
└── doc/
    ├── survey-api-design.md
    ├── survey-module-technical-guide.md
    └── survey-file-and-signature-api-design.md  # 本文档
```

## 附录 B：前端 API 函数签名（参考）

```typescript
// src/api/upload.ts（追加）
export async function uploadSignature(blob: Blob, surveyId: string): Promise<{ file_url: string }> {
  const formData = new FormData();
  formData.append("file", blob, "signature.png");
  formData.append("survey_id", surveyId);
  return serverClient.post("/q-editor/signature/upload", formData, {
    timeout: 15000
  });
}

// src/api/modules/survey/index.ts（追加）
export const getSurveyFiles = (surveyId: string, fileType?: string) =>
  serverClient.get(`/surveys/${surveyId}/files`, { params: { file_type: fileType } });

export const deleteSurveyFile = (fileId: string) => serverClient.delete(`/survey-files/${fileId}`);
```
