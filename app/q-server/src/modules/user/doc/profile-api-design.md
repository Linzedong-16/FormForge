# 用户资料与头像上传接口设计文档

> 版本：1.0  
> 日期：2026-06-21  
> 来源：基于 `app/q-editor/src/views/settings/` 前端表单分析  
> 前置阅读：[user-module-tech-doc.md](./user-module-tech-doc.md)（基础架构） / [user-module-optimization-guide.md](./user-module-optimization-guide.md)（中间件与性能优化）

---

## 目录

1. [需求来源](#1-需求来源)
2. [接口总览](#2-接口总览)
3. [数据模型](#3-数据模型)
4. [接口详细设计](#4-接口详细设计)
   - 4.1 [GET /api/user/profile — 获取用户资料](#41-get-apiuserprofile--获取用户资料)
   - 4.2 [PUT /api/user/profile — 更新用户资料](#42-put-apiuserprofile--更新用户资料)
   - 4.3 [POST /api/user/avatar — 上传头像](#43-post-apiuseravatar--上传头像)
   - 4.4 [POST /api/user/bind-email — 绑定邮箱](#44-post-apiuserbind-email--绑定邮箱)
   - 4.5 [PUT /api/user/change-password — 修改密码](#45-put-apiuserchange-password--修改密码)
   - 4.6 [DELETE /api/user/account — 注销账号](#46-delete-apiuseraccount--注销账号)
5. [头像上传专项设计](#5-头像上传专项设计)
6. [数据验证规则](#6-数据验证规则)
7. [安全设计](#7-安全设计)
8. [性能优化](#8-性能优化)
9. [错误码定义](#9-错误码定义)
10. [测试方案](#10-测试方案)
11. [文件变更清单](#11-文件变更清单)

---

## 1. 需求来源

### 1.1 前端表单分析

基于 `app/q-editor/src/views/settings/` 目录下的前端组件：

| 前端组件            | 文件路径                               | 对应功能                                    |
| ------------------- | -------------------------------------- | ------------------------------------------- |
| ProfileSettings.vue | `settings/ProfileSettings.vue`         | 设置页面容器，含 Profile / Account 两个 Tab |
| ProfileTab.vue      | `settings/components/ProfileTab.vue`   | 个人资料表单                                |
| AvatarUpload.vue    | `settings/components/AvatarUpload.vue` | 头像上传组件（裁剪后输出 Blob）             |
| CropperModal.vue    | `settings/components/CropperModal.vue` | 图片裁剪弹窗                                |
| InterestTags.vue    | `settings/components/InterestTags.vue` | 兴趣标签编辑器                              |
| AccountTab.vue      | `settings/components/AccountTab.vue`   | 账号安全表单                                |

### 1.2 ProfileTab 表单字段

| 字段     | 前端变量     | 类型       | 约束                  | 说明                                                  |
| -------- | ------------ | ---------- | --------------------- | ----------------------------------------------------- |
| 头像     | `avatarUrl`  | `string`   | —                     | 通过 AvatarUpload 组件上传，裁剪后返回 base64 dataUrl |
| 昵称     | `nickname`   | `string`   | maxlength=50          | 用户展示名称                                          |
| 职业     | `occupation` | `string`   | maxlength=100         | 自动补全输入                                          |
| 个人介绍 | `bio`        | `string`   | maxlength=500, rows=4 | 多行文本                                              |
| 兴趣标签 | `interests`  | `string[]` | maxlength=20/tag      | 可自定义添加 + 推荐标签选择                           |

### 1.3 AvatarUpload 组件行为

| 属性         | 值                                                           |
| ------------ | ------------------------------------------------------------ |
| 支持格式     | `image/jpeg`, `image/png`, `image/gif`, `image/webp`         |
| 文件大小限制 | 5MB（前端校验）                                              |
| 裁剪功能     | CropperBox 组件，输出 `Blob`（待上传） + `dataUrl`（预览）   |
| 裁剪输出尺寸 | 200x200px（PNG 格式）                                        |
| 当前状态     | 仅更新本地预览，TODO 注释标注"后续对接 API 时使用 blob 上传" |

### 1.4 数据回显需求

前端 ProfileTab 表单在页面加载时，需要从后端获取用户已保存的资料数据并回填到表单中。当前前端代码存在以下 TODO 标记：

```typescript
// ProfileTab.vue — handleReset 函数
function handleReset() {
  // TODO: 调用 API 获取已保存的用户资料并回填
  form.avatarUrl = "";
  form.nickname = "";
  form.occupation = "";
  form.bio = "";
  form.interests = [];
}
```

**回显流程：**

```
┌─────────────────────────────────────────────────────────────────┐
│                      资料回显流程                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ProfileTab.vue onMounted                                       │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ 1. 调用 GET /api/user/profile                            │   │
│  │ 2. 将返回数据映射到表单字段                                │   │
│  └──────────────────────┬───────────────────────────────────┘   │
│                         │                                        │
│                         ▼                                        │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ 字段映射关系（后端 → 前端）：                              │   │
│  │                                                          │   │
│  │  profile.avatarUrl    ←  data.avatarUrl                  │   │
│  │  form.avatarUrl       ←  data.avatarUrl (v-model 绑定)   │   │
│  │  form.nickname        ←  data.nickname ?? ""             │   │
│  │  form.occupation      ←  data.occupation ?? ""           │   │
│  │  form.bio             ←  data.bio ?? ""                  │   │
│  │  form.interests       ←  data.interests ?? []            │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  AvatarUpload 回显逻辑：                                         │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ <el-avatar :src="modelValue || defaultAvatar" />          │   │
│  │                                                          │   │
│  │ modelValue 绑定 form.avatarUrl：                          │   │
│  │   - 有值 → 显示已上传头像                                  │   │
│  │   - 无值 → 显示默认头像 (defaultAvatar)                    │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  InterestTags 回显逻辑：                                         │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ v-model 绑定 form.interests (string[])                    │   │
│  │   - 已选标签显示为 el-tag（closable）                      │   │
│  │   - 推荐标签中已选中的高亮为 primary 类型                   │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**回显字段与默认值处理：**

| 表单字段          | 后端字段          | 回显值          | 空值处理                     |
| ----------------- | ----------------- | --------------- | ---------------------------- |
| `form.avatarUrl`  | `data.avatarUrl`  | 头像 URL 字符串 | 显示默认头像 `defaultAvatar` |
| `form.nickname`   | `data.nickname`   | 昵称字符串      | 空字符串 `""`                |
| `form.occupation` | `data.occupation` | 职业字符串      | 空字符串 `""`                |
| `form.bio`        | `data.bio`        | 个人介绍字符串  | 空字符串 `""`                |
| `form.interests`  | `data.interests`  | 兴趣标签数组    | 空数组 `[]`                  |

> **注意：** 前端 `handleReset` 函数的 TODO 应改为调用 `GET /api/user/profile` 获取已有数据回填，而非直接清空为默认值。当前的空值清空逻辑仅适用于"用户首次访问且无已保存数据"的场景。

### 1.5 AccountTab 表单字段

| 功能     | 前端变量                       | 字段     | 说明                    |
| -------- | ------------------------------ | -------- | ----------------------- |
| 绑定邮箱 | `emailForm.email`              | 邮箱地址 | maxlength=255           |
| 绑定邮箱 | `emailForm.code`               | 验证码   | maxlength=6, 60s 倒计时 |
| 更改密码 | `passwordForm.currentPassword` | 当前密码 | —                       |
| 更改密码 | `passwordForm.newPassword`     | 新密码   | —                       |
| 更改密码 | `passwordForm.confirmPassword` | 确认密码 | 前端校验一致性          |
| 注销账号 | —                              | 二次确认 | ElMessageBox.confirm    |

---

## 2. 接口总览

| HTTP方法 | 路径                        | 功能                                | 认证 | 限流      |
| -------- | --------------------------- | ----------------------------------- | ---- | --------- |
| GET      | `/api/user/profile`         | 获取当前用户资料                    | 是   | 全局      |
| PUT      | `/api/user/profile`         | 更新用户资料（昵称/职业/介绍/兴趣） | 是   | 全局      |
| POST     | `/api/user/avatar`          | 上传头像（multipart/form-data）     | 是   | 10次/分钟 |
| POST     | `/api/user/bind-email`      | 绑定邮箱                            | 是   | 5次/分钟  |
| PUT      | `/api/user/change-password` | 修改密码                            | 是   | 5次/分钟  |
| DELETE   | `/api/user/account`         | 注销账号（软删除）                  | 是   | 3次/天    |

**扩展已有接口：**

| HTTP方法 | 路径                  | 变更             | 说明                                      |
| -------- | --------------------- | ---------------- | ----------------------------------------- |
| POST     | `/api/auth/send-code` | 扩展 `type` 枚举 | 新增 `bind_email`、`change_password` 类型 |

---

## 3. 数据模型

### 3.1 现有 Prisma Schema（无需修改）

数据库已包含 `UserProfile` 模型（1:1 关联 `User`），完整覆盖本次需求：

```prisma
model UserProfile {
  id             BigInt    @id @default(autoincrement())
  user_id        BigInt    @unique
  nickname       String?   @db.VarChar(50)   // 昵称
  avatar_url     String?   @db.VarChar(500)  // 头像 URL（MinIO）
  occupation     String?   @db.VarChar(100)  // 职业
  bio            String?   @db.VarChar(500)  // 个人介绍
  interests      Json?     @default("[]")    // 兴趣标签 ["前端","设计"]
  bound_email    String?   @db.VarChar(255)  // 绑定邮箱
  email_verified Boolean   @default(false)   // 绑定邮箱是否已验证
  created_at     DateTime  @default(now())
  updated_at     DateTime  @updatedAt

  user User @relation(fields: [user_id], references: [id], onDelete: Cascade)

  @@index([user_id])
  @@map("user_profiles")
}
```

### 3.2 字段映射关系

| 前端字段          | 数据库字段      | 数据库列                  | 备注                     |
| ----------------- | --------------- | ------------------------- | ------------------------ |
| `avatarUrl`       | `avatar_url`    | `UserProfile.avatar_url`  | 头像上传后返回 MinIO URL |
| `nickname`        | `nickname`      | `UserProfile.nickname`    |                          |
| `occupation`      | `occupation`    | `UserProfile.occupation`  |                          |
| `bio`             | `bio`           | `UserProfile.bio`         |                          |
| `interests`       | `interests`     | `UserProfile.interests`   | JSON 数组                |
| `emailForm.email` | `bound_email`   | `UserProfile.bound_email` | 绑定邮箱                 |
| `passwordForm.*`  | `password_hash` | `User.password_hash`      | 密码变更走 User 表       |

---

## 4. 接口详细设计

### 4.1 GET /api/user/profile — 获取用户资料（含表单回显）

**功能描述：** 获取当前登录用户的完整资料信息。该接口是前端表单回显的核心数据源——ProfileTab 在 `onMounted` 时调用此接口，将已有数据回填到表单中，避免用户重复填写。

**请求：**

```
GET /api/user/profile
Authorization: Bearer <access_token>
```

**响应：**

```json
{
  "data": {
    "userId": "1",
    "email": "user@example.com",
    "username": "张三",
    "avatarUrl": "http://47.94.168.252:9000/questionnaire/avatars/uuid.png",
    "nickname": "三哥",
    "occupation": "前端开发工程师",
    "bio": "热爱前端开发，专注于 Vue 生态",
    "interests": ["前端", "开源", "产品设计"],
    "boundEmail": "user@example.com",
    "emailVerified": true
  },
  "code": 0,
  "msg": "ok"
}
```

**响应字段说明：**

| 字段          | 类型             | 说明                                                                   |
| ------------- | ---------------- | ---------------------------------------------------------------------- |
| userId        | `string`         | 用户 ID                                                                |
| email         | `string`         | 登录邮箱（来自 User 表）                                               |
| username      | `string`         | 用户名（来自 User 表）                                                 |
| avatarUrl     | `string \| null` | 头像 URL，优先使用 UserProfile.avatar_url，fallback 到 User.avatar_url |
| nickname      | `string \| null` | 昵称                                                                   |
| occupation    | `string \| null` | 职业                                                                   |
| bio           | `string \| null` | 个人介绍                                                               |
| interests     | `string[]`       | 兴趣标签数组                                                           |
| boundEmail    | `string \| null` | 已绑定的邮箱                                                           |
| emailVerified | `boolean`        | 绑定邮箱是否已验证                                                     |

**业务逻辑：**

1. 从 `request.user.userId` 获取当前用户 ID
2. 查询 `UserProfile` 表（`user_id` 唯一索引）
3. 同时查询 `User` 表获取 `email` 和 `username`
4. 头像 URL 优先级：`UserProfile.avatar_url` → `User.avatar_url` → `null`
5. 缓存策略：Redis 缓存 300s，Key 格式 `user:profile:<userId>`

**首访场景处理（UserProfile 不存在）：**

当用户首次访问设置页面时，`UserProfile` 表中可能尚无记录。此时接口**不返回 404**，而是返回所有字段为 `null`/空默认值的响应，前端据此显示空表单（头像显示默认图、各字段为空字符串、兴趣标签为空数组）：

```json
{
  "data": {
    "userId": "1",
    "email": "user@example.com",
    "username": "张三",
    "avatarUrl": null,
    "nickname": null,
    "occupation": null,
    "bio": null,
    "interests": [],
    "boundEmail": null,
    "emailVerified": false
  },
  "code": 0,
  "msg": "ok"
}
```

前端根据此响应判断：所有可编辑字段为 `null`/空 → 显示空表单，用户可正常填写并提交。提交时后端通过 `upsert` 自动创建 `UserProfile` 记录。

**错误场景：**

| 场景       | 错误码 | 说明             |
| ---------- | ------ | ---------------- |
| 未登录     | 401    | Token 缺失或无效 |
| 用户不存在 | 404    | 用户已被删除     |

---

### 4.2 PUT /api/user/profile — 更新用户资料

**功能描述：** 更新当前用户的个人资料（昵称、职业、个人介绍、兴趣标签）。所有字段均为可选，仅更新传入的字段。

**请求：**

```
PUT /api/user/profile
Authorization: Bearer <access_token>
Content-Type: application/json
```

```json
{
  "nickname": "三哥",
  "occupation": "前端开发工程师",
  "bio": "热爱前端开发，专注于 Vue 生态",
  "interests": ["前端", "开源", "产品设计"]
}
```

**请求参数校验：**

| 字段       | 类型       | 必填 | 约束                                      |
| ---------- | ---------- | ---- | ----------------------------------------- |
| nickname   | `string`   | 否   | 1-50 字符，允许中文/字母/数字/下划线/空格 |
| occupation | `string`   | 否   | 1-100 字符                                |
| bio        | `string`   | 否   | 1-500 字符                                |
| interests  | `string[]` | 否   | 数组长度 ≤ 10，单个标签 ≤ 20 字符         |

**响应：**

```json
{
  "data": {
    "nickname": "三哥",
    "occupation": "前端开发工程师",
    "bio": "热爱前端开发，专注于 Vue 生态",
    "interests": ["前端", "开源", "产品设计"]
  },
  "code": 0,
  "msg": "资料更新成功"
}
```

**业务逻辑：**

1. Zod 校验请求体
2. 使用 `upsert` 操作 `UserProfile` 表（首次创建或更新）
3. 仅更新传入的非 `undefined` 字段
4. 兴趣标签去重（`[...new Set(interests)]`）
5. 失效用户资料缓存
6. 记录审计日志（`action: "update_profile"`）

**错误场景：**

| 场景               | 错误码 | 消息                                |
| ------------------ | ------ | ----------------------------------- |
| 所有字段均为空     | 400    | "至少需要提供一个有效字段"          |
| nickname 超长      | 400    | "昵称长度需在 1-50 个字符之间"      |
| occupation 超长    | 400    | "职业长度需在 1-100 个字符之间"     |
| bio 超长           | 400    | "个人介绍长度需在 1-500 个字符之间" |
| interests 标签过多 | 400    | "兴趣标签最多 10 个"                |
| 单个标签超长       | 400    | "单个兴趣标签最多 20 个字符"        |
| 未登录             | 401    | "请先登录"                          |

---

### 4.3 POST /api/user/avatar — 上传头像

**功能描述：** 接收用户裁剪后的头像图片，进行服务端校验、压缩处理后上传至 MinIO 对象存储，返回可访问的头像 URL 并更新用户资料。

**请求：**

```
POST /api/user/avatar
Authorization: Bearer <access_token>
Content-Type: multipart/form-data
```

| 表单字段 | 类型   | 必填 | 说明                    |
| -------- | ------ | ---- | ----------------------- |
| file     | `File` | 是   | 图片文件，字段名 `file` |

**支持格式：** `image/jpeg`, `image/png`, `image/gif`, `image/webp`

**响应：**

```json
{
  "data": {
    "avatarUrl": "http://47.94.168.252:9000/questionnaire/avatars/uuid.png",
    "thumbnailUrl": "http://47.94.168.252:9000/questionnaire/avatars/thumb_uuid.png"
  },
  "code": 0,
  "msg": "头像上传成功"
}
```

**业务逻辑：**

详见 [第 5 节：头像上传专项设计](#5-头像上传专项设计)。

**错误场景：**

| 场景           | 错误码 | 消息                              |
| -------------- | ------ | --------------------------------- |
| 未上传文件     | 400    | "请选择要上传的图片"              |
| 文件格式不支持 | 400    | "仅支持 JPG、PNG、GIF、WebP 格式" |
| 文件过大       | 400    | "图片大小不能超过 5MB"            |
| 图片尺寸过小   | 400    | "图片尺寸不能小于 200x200 像素"   |
| 图片尺寸过大   | 400    | "图片尺寸不能超过 4096x4096 像素" |
| 图片损坏       | 400    | "图片文件已损坏，无法读取"        |
| MinIO 不可用   | 503    | "文件存储服务暂时不可用"          |
| 未登录         | 401    | "请先登录"                        |
| 限流           | 429    | "上传过于频繁，请稍后再试"        |

---

### 4.4 POST /api/user/bind-email — 绑定邮箱

**功能描述：** 用户输入新邮箱和验证码，完成邮箱绑定/换绑。验证码通过 `/api/auth/send-code` 接口发送（需扩展 `type` 枚举）。

**回显说明：** AccountTab 页面加载时，可从 `GET /api/user/profile` 的 `boundEmail` 字段获取当前已绑定的邮箱地址，回显到邮箱输入框中。若 `boundEmail` 为 `null`，则显示空输入框，允许用户首次绑定。

**请求：**

```
POST /api/user/bind-email
Authorization: Bearer <access_token>
Content-Type: application/json
```

```json
{
  "email": "newemail@example.com",
  "code": "123456"
}
```

**请求参数校验：**

| 字段  | 类型     | 必填 | 约束                  |
| ----- | -------- | ---- | --------------------- |
| email | `string` | 是   | 有效邮箱格式，max 255 |
| code  | `string` | 是   | 6位数字               |

**响应：**

```json
{
  "data": {
    "email": "newemail@example.com",
    "verified": true
  },
  "code": 0,
  "msg": "邮箱绑定成功"
}
```

**业务逻辑：**

1. 校验验证码（Redis 中 key: `auth:verify:bind_email:<email>:<code>`）
2. 校验邮箱未被其他用户绑定（`UserProfile.bound_email` 唯一性检查）
3. 更新 `UserProfile.bound_email` 和 `UserProfile.email_verified = true`
4. 失效用户资料缓存
5. 记录审计日志

**错误场景：**

| 场景               | 错误码 | 消息                           |
| ------------------ | ------ | ------------------------------ |
| 验证码错误         | 400    | "验证码错误或已过期"           |
| 邮箱已被绑定       | 409    | "该邮箱已被其他用户绑定"       |
| 与当前绑定邮箱相同 | 400    | "新邮箱不能与当前绑定邮箱相同" |

---

### 4.5 PUT /api/user/change-password — 修改密码

**功能描述：** 已登录用户修改密码，需验证当前密码。

**请求：**

```
PUT /api/user/change-password
Authorization: Bearer <access_token>
Content-Type: application/json
```

```json
{
  "currentPassword": "OldPass123",
  "newPassword": "NewPass456"
}
```

**请求参数校验：**

| 字段            | 类型     | 必填 | 约束                           |
| --------------- | -------- | ---- | ------------------------------ |
| currentPassword | `string` | 是   | 非空                           |
| newPassword     | `string` | 是   | 8-128 字符，含大小写字母和数字 |

**响应：**

```json
{
  "data": null,
  "code": 0,
  "msg": "密码修改成功"
}
```

**业务逻辑：**

1. 验证当前密码（`bcrypt.compare`）
2. 校验新密码与当前密码不同
3. 加密新密码并更新 `User.password_hash`
4. 将当前 Token 加入黑名单，强制重新登录
5. 记录审计日志

**错误场景：**

| 场景             | 错误码 | 消息                                 |
| ---------------- | ------ | ------------------------------------ |
| 当前密码错误     | 400    | "当前密码不正确"                     |
| 新密码与当前相同 | 400    | "新密码不能与当前密码相同"           |
| 新密码强度不足   | 400    | "密码需包含大写字母、小写字母和数字" |

---

### 4.6 DELETE /api/user/account — 注销账号

**功能描述：** 软删除当前用户账号，需二次确认。

**请求：**

```
DELETE /api/user/account
Authorization: Bearer <access_token>
```

**响应：**

```json
{
  "data": {
    "deletedAt": "2026-06-21T10:30:00.000Z"
  },
  "code": 0,
  "msg": "账号已注销"
}
```

**业务逻辑：**

1. 设置 `User.deleted_at = now()` 实现软删除
2. 将当前 Token 加入黑名单
3. 清理用户相关缓存
4. 记录审计日志
5. 可选的宽限期：30 天内可恢复（通过管理员接口）

**错误场景：**

| 场景       | 错误码 | 消息           |
| ---------- | ------ | -------------- |
| 账号已注销 | 400    | "账号已被注销" |
| 未登录     | 401    | "请先登录"     |

---

## 5. 头像上传专项设计

### 5.1 处理流程

```
┌─────────────────────────────────────────────────────────────────┐
│                      头像上传处理流程                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  前端 CropperModal                                              │
│  ┌──────────────────────┐                                       │
│  │ 裁剪后输出 Blob (PNG) │                                       │
│  └─────────┬────────────┘                                       │
│            │ POST /api/user/avatar (multipart/form-data)         │
│            ▼                                                     │
│  ┌──────────────────────────────────────────────────────┐       │
│  │ 1. 接收文件 Buffer                                    │       │
│  │ 2. 校验 MIME 类型（image/jpeg, image/png, etc.）      │       │
│  │ 3. 校验文件大小（≤ 5MB）                              │       │
│  │ 4. 使用 sharp 读取图片元数据                          │       │
│  │ 5. 校验图片尺寸（200x200 ~ 4096x4096）                │       │
│  │ 6. 压缩+缩放（sharp.resize）                          │       │
│  │    - 原图：最大 800x800，quality 85（JPEG）            │       │
│  │    - 缩略图：200x200，quality 80（JPEG）               │       │
│  │ 7. 生成唯一文件名：avatars/<uuid>.jpg                  │       │
│  │ 8. 上传到 MinIO（Bucket: questionnaire）              │       │
│  │ 9. 删除旧头像文件（minio.removeObject）               │       │
│  │ 10. 更新 UserProfile.avatar_url                       │       │
│  │ 11. 失效用户资料缓存                                  │       │
│  │ 12. 返回新头像 URL                                    │       │
│  └──────────────────────────────────────────────────────┘       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 5.2 图片处理参数

| 参数     | 原图               | 缩略图             |
| -------- | ------------------ | ------------------ |
| 最大尺寸 | 800x800 px         | 200x200 px         |
| 格式     | JPEG               | JPEG               |
| 质量     | 85                 | 80                 |
| 保持比例 | 是（fit: inside）  | 是（fit: cover）   |
| 背景色   | 白色（裁剪后填充） | 白色（裁剪后填充） |

### 5.3 MinIO 存储设计

| 配置项   | 环境变量              | 默认值                            |
| -------- | --------------------- | --------------------------------- |
| 存储前缀 | `MINIO_AVATAR_PREFIX` | `avatars`                         |
| 存储桶   | `MINIO_BUCKET`        | `questionnaire`                   |
| 访问方式 | 公开 URL              | 配置 Bucket Policy 为 public read |

**存储路径格式：**

```
questionnaire/avatars/<uuid>_original.jpg    # 原图（800x800）
questionnaire/avatars/<uuid>_thumb.jpg       # 缩略图（200x200）
```

### 5.4 旧头像清理策略

- 更新头像时，通过 `extractKey()` 从旧 URL 提取 MinIO 对象 key
- 异步删除旧文件（失败不阻塞，仅记录日志）
- 若旧头像使用默认头像 URL，则跳过删除

### 5.5 安全措施

| 措施          | 实现方式                                                 |
| ------------- | -------------------------------------------------------- |
| MIME 类型校验 | 检查 `Content-Type` 头部 + 文件魔数（file-type 库）      |
| 文件大小限制  | multipart 解析时限制 `limits.fileSize = 5 * 1024 * 1024` |
| 图片尺寸校验  | sharp 读取 metadata 校验 width/height                    |
| 防 XSS        | 不存储 SVG，仅接受光栅图片格式                           |
| 防路径穿越    | 使用 UUID 生成文件名，不信任原始文件名                   |
| 限流          | 10 次/分钟（路由级限流覆盖）                             |
| 认证          | 必须携带有效 Token                                       |

### 5.6 依赖

```json
{
  "sharp": "^0.33.x",
  "file-type": "^19.x"
}
```

---

## 6. 数据验证规则

### 6.1 Zod Schema 定义

将新增以下 Schema 到 `src/modules/user/schemas/user.schemas.ts`：

```typescript
// ══════════════════════════════════════════════════════════════════
//  用户资料接口 Schema
// ══════════════════════════════════════════════════════════════════

/** 昵称 — 1~50字符，允许中文/字母/数字/下划线/空格 */
export const nicknameSchema = z
  .string()
  .min(1, "昵称不能为空")
  .max(50, "昵称最多50个字符")
  .regex(/^[\u4e00-\u9fa5a-zA-Z0-9_\s]+$/, "昵称包含非法字符");

/** 职业 — 1~100字符 */
export const occupationSchema = z.string().min(1, "职业不能为空").max(100, "职业最多100个字符");

/** 个人介绍 — 1~500字符 */
export const bioSchema = z.string().min(1, "个人介绍不能为空").max(500, "个人介绍最多500个字符");

/** 兴趣标签数组 */
export const interestsSchema = z
  .array(z.string().min(1, "标签不能为空").max(20, "单个标签最多20个字符"))
  .max(10, "兴趣标签最多10个")
  .default([]);

/** PUT /api/user/profile */
export const updateProfileSchema = z
  .object({
    nickname: nicknameSchema.optional(),
    occupation: occupationSchema.optional(),
    bio: bioSchema.optional(),
    interests: interestsSchema.optional()
  })
  .refine(data => Object.keys(data).length > 0, { message: "至少需要提供一个有效字段" });

/** POST /api/user/bind-email */
export const bindEmailSchema = z.object({
  email: emailSchema,
  code: verifyCodeSchema
});

/** PUT /api/user/change-password */
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "当前密码不能为空"),
  newPassword: passwordSchema
});
```

### 6.2 验证码类型扩展

修改 `sendCodeSchema` 的 `type` 枚举：

```typescript
// 修改前
type: z.enum(["register", "reset_password"]);

// 修改后
type: z.enum(["register", "reset_password", "bind_email", "change_password"]);
```

---

## 7. 安全设计

### 7.1 认证与授权

| 接口         | 认证方式              | 说明                          |
| ------------ | --------------------- | ----------------------------- |
| 全部新增接口 | `authenticate` 中间件 | 复用已有 `auth.middleware.ts` |

### 7.2 防 SQL 注入

- 全部数据库操作通过 Prisma ORM 参数化查询，天然防 SQL 注入
- 不拼接原生 SQL

### 7.3 防 XSS 攻击

- 所有用户输入字段通过 Zod 正则校验，拒绝 HTML 标签
- 图片上传拒绝 SVG 格式（可嵌入脚本）
- 输出 JSON 响应，`Content-Type: application/json`，不触发浏览器 HTML 解析

### 7.4 限流策略

| 接口                            | 限流值       | 说明              |
| ------------------------------- | ------------ | ----------------- |
| `GET /api/user/profile`         | 全局 100/min | 无单独限流        |
| `PUT /api/user/profile`         | 全局 100/min | 无单独限流        |
| `POST /api/user/avatar`         | **10/min**   | 防恶意上传        |
| `POST /api/user/bind-email`     | **5/min**    | 防邮箱轰炸        |
| `PUT /api/user/change-password` | **5/min**    | 防暴力尝试        |
| `DELETE /api/user/account`      | **3/day**    | 防误操作/恶意注销 |

### 7.5 敏感操作审计

所有写操作均记录审计日志（`audit_logs` 表）：

| 操作     | action            | resource_type  |
| -------- | ----------------- | -------------- |
| 更新资料 | `update_profile`  | `user_profile` |
| 上传头像 | `upload_avatar`   | `user_profile` |
| 绑定邮箱 | `bind_email`      | `user_profile` |
| 修改密码 | `change_password` | `user`         |
| 注销账号 | `delete_account`  | `user`         |

---

## 8. 性能优化

### 8.1 缓存策略

| 缓存 Key                | TTL  | 说明               |
| ----------------------- | ---- | ------------------ |
| `user:profile:<userId>` | 300s | 用户资料完整信息   |
| `user:auth:<userId>`    | 300s | 已有，用户认证档案 |

**缓存失效时机：**

- 更新资料 → 删除 `user:profile:<userId>`
- 上传头像 → 删除 `user:profile:<userId>`
- 绑定邮箱 → 删除 `user:profile:<userId>`
- 修改密码 → 删除 `user:auth:<userId>`

### 8.2 数据库查询优化

- `UserProfile.user_id` 已有唯一索引，查询性能 O(1)
- `upsert` 操作合并 INSERT/UPDATE，减少数据库往返
- 头像上传时旧文件删除为异步操作，不阻塞响应

### 8.3 图片处理优化

- sharp 库使用 libvips（C 语言实现），性能优于 ImageMagick
- 管道式处理（读 → 缩放 → 压缩 → 输出），避免中间文件写入
- 缩略图可异步生成（非关键路径）

### 8.4 高并发场景

- 头像上传通过 MinIO 分流，不占用业务服务器带宽
- 限流机制防止恶意请求耗尽资源
- 接口无状态，支持水平扩展

---

## 9. 错误码定义

### 9.1 新增业务错误码

在 `src/utils/response.ts` 的 `BizCode` 枚举中新增：

```typescript
export enum BizCode {
  // ... 已有错误码 ...

  // ─── 用户资料模块 ─────────────────────────────────
  /** 昵称包含非法字符 */
  NICKNAME_INVALID = 2001,
  /** 图片格式不支持 */
  AVATAR_FORMAT_INVALID = 2002,
  /** 图片文件过大 */
  AVATAR_TOO_LARGE = 2003,
  /** 图片尺寸不符合要求 */
  AVATAR_SIZE_INVALID = 2004,
  /** 文件存储服务不可用 */
  STORAGE_UNAVAILABLE = 2005,
  /** 邮箱已被其他用户绑定 */
  EMAIL_ALREADY_BOUND = 2006,
  /** 当前密码错误 */
  CURRENT_PASSWORD_INCORRECT = 2007,
  /** 新密码与当前密码相同 */
  PASSWORD_SAME_AS_CURRENT = 2008,
  /** 账号已被注销 */
  ACCOUNT_DELETED = 2009
}
```

### 9.2 错误响应格式

```json
{
  "data": null,
  "code": 2002,
  "msg": "仅支持 JPG、PNG、GIF、WebP 格式"
}
```

---

## 10. 测试方案

### 10.1 单元测试

| 测试文件                                | 测试范围                |
| --------------------------------------- | ----------------------- |
| `src/spec/user/profile.service.spec.ts` | ProfileService 业务逻辑 |
| `src/spec/user/profile.routes.spec.ts`  | 路由层请求/响应         |

**测试用例清单：**

#### ProfileService

| 用例编号 | 描述                             | 预期结果             |
| -------- | -------------------------------- | -------------------- |
| PS-001   | 获取存在的用户资料               | 返回完整 UserProfile |
| PS-002   | 获取不存在的用户资料（首次访问） | 返回默认空值，不报错 |
| PS-003   | 更新昵称（有效值）               | 成功更新             |
| PS-004   | 更新昵称（超长 51 字符）         | 抛出 ValidationError |
| PS-005   | 更新兴趣标签（包含非法字符）     | 抛出 ValidationError |
| PS-006   | 更新兴趣标签（超过 10 个）       | 抛出 ValidationError |
| PS-007   | 更新全部字段为空                 | 抛出 ValidationError |
| PS-008   | 头像上传（有效 JPEG）            | 返回 URL             |
| PS-009   | 头像上传（无效格式 PDF）         | 抛出 ValidationError |
| PS-010   | 头像上传（超过 5MB）             | 抛出 ValidationError |
| PS-011   | 绑定邮箱（验证码正确）           | 成功绑定             |
| PS-012   | 绑定邮箱（验证码错误）           | 抛出 ValidationError |
| PS-013   | 修改密码（当前密码正确）         | 成功修改             |
| PS-014   | 修改密码（当前密码错误）         | 抛出 ValidationError |
| PS-015   | 注销账号                         | 成功软删除           |

#### ProfileRoutes

| 用例编号 | 描述                           | 预期 HTTP 状态                                       |
| -------- | ------------------------------ | ---------------------------------------------------- |
| PR-001   | 未登录访问 GET /profile        | 401                                                  |
| PR-002   | 已登录访问 GET /profile        | 200                                                  |
| PR-003   | 有效数据 PUT /profile          | 200                                                  |
| PR-004   | 无效数据 PUT /profile          | 400                                                  |
| PR-005   | 上传头像（有效文件）           | 200                                                  |
| PR-006   | 上传头像（无文件）             | 400                                                  |
| PR-007   | 上传头像（超过限流）           | 429                                                  |
| PR-008   | 修改密码（新密码与确认不一致） | 由前端校验，后端仅接收 currentPassword + newPassword |

### 10.2 集成测试

| 测试场景     | 描述                                                            |
| ------------ | --------------------------------------------------------------- |
| 完整流程     | 登录 → 获取资料 → 更新资料 → 上传头像 → 再次获取资料验证一致性  |
| 绑定邮箱流程 | 发送验证码 → 输入验证码 → 绑定成功 → 验证 email_verified = true |
| 修改密码流程 | 旧密码登录 → 修改密码 → 旧密码登录失败 → 新密码登录成功         |
| 注销流程     | 登录 → 注销 → Token 失效 → 访问需认证接口返回 401               |

---

## 11. 文件变更清单

### 11.1 新增文件

| 文件路径                                | 说明                                                                             |
| --------------------------------------- | -------------------------------------------------------------------------------- |
| `src/modules/user/profile.routes.ts`    | 用户资料路由（profile / avatar / bind-email / change-password / delete-account） |
| `src/modules/user/profile.service.ts`   | 用户资料服务（核心业务逻辑）                                                     |
| `src/modules/user/avatar.service.ts`    | 头像上传服务（图片处理 + MinIO 上传）                                            |
| `src/spec/user/profile.service.spec.ts` | 资料服务单元测试                                                                 |
| `src/spec/user/profile.routes.spec.ts`  | 资料路由单元测试                                                                 |

### 11.2 修改文件

| 文件路径                                   | 变更内容                                                                                                                                                                     |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/modules/user/schemas/user.schemas.ts` | 新增 `nicknameSchema`、`occupationSchema`、`bioSchema`、`interestsSchema`、`updateProfileSchema`、`bindEmailSchema`、`changePasswordSchema`；扩展 `sendCodeSchema.type` 枚举 |
| `src/utils/response.ts`                    | `BizCode` 枚举新增 2001-2009 错误码                                                                                                                                          |
| `src/utils/cache.ts`                       | `CacheKeys` 新增 `userProfile` 缓存 Key                                                                                                                                      |
| `src/routes/index.ts`                      | 注册 `profileRoutes` 路由插件                                                                                                                                                |
| `package.json`                             | 新增 `sharp`、`file-type` 依赖                                                                                                                                               |

### 11.3 无需修改的文件

| 文件路径                              | 原因                                                  |
| ------------------------------------- | ----------------------------------------------------- |
| `prisma/schema.prisma`                | `UserProfile` 模型已完整覆盖需求                      |
| `src/modules/user/auth.middleware.ts` | 复用 `authenticate` 中间件                            |
| `src/plugins/minio.ts`                | MinIO 插件无需修改                                    |
| `src/utils/upload.ts`                 | 复用 `uploadToMinio`、`deleteFromMinio`、`extractKey` |
| `src/utils/errors.ts`                 | 复用 `ValidationError`、`AuthError`                   |
| `src/plugins/error-handler.ts`        | 全局错误处理无需修改                                  |
| `src/plugins/response.ts`             | 响应装饰器无需修改                                    |

---

> **下一步：** 基于本文档进行代码实现，按 `profile.service.ts` → `avatar.service.ts` → `profile.routes.ts` → 测试的顺序依次开发。
