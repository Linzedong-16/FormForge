# API 契约：上传追踪修复

**Created**: 2026-07-19 | **Phase**: 1

## 变更概览

| 接口                           | 方法   | 变更类型 | 说明                                 |
| ------------------------------ | ------ | :------: | ------------------------------------ |
| `/q-editor/survey-file/upload` | POST   |   修改   | `survey_id` 从必填改为可选           |
| `/admin/media-assets`          | GET    |   修改   | 新增 `file_type` 查询参数            |
| `/admin/media-assets/:id`      | DELETE | 行为变更 | `user_avatar` 类型不再阻止，强制删除 |

---

## 1. POST /q-editor/survey-file/upload — survey_id 改为可选

### 变更前

```http
POST /api/q-editor/survey-file/upload
Content-Type: multipart/form-data
Authorization: Bearer <token>

file: <binary>
survey_id: "123"     # 必填，Zod surveyIdSchema 解析失败返回 400
file_type: "survey_option_image"  # 可选，默认 survey_option_image
```

### 变更后

```http
POST /api/q-editor/survey-file/upload
Content-Type: multipart/form-data
Authorization: Bearer <token>

file: <binary>
survey_id: "123"     # [CHANGED] 可选，不传或为空时创建 survey_id=null 的记录
file_type: "survey_option_image"  # 可选，默认 survey_option_image
```

### 成功响应 (code=0)

```json
{
  "code": 0,
  "msg": "上传成功",
  "data": {
    "file_id": "456",
    "file_url": "https://minio.example.com/survey-images/uuid.png",
    "file_name": "cover.png",
    "mime_type": "image/png",
    "file_size": 204800
  }
}
```

### 错误响应（不变）

| 场景                                 | HTTP | code                    | msg                     |
| ------------------------------------ | :--: | ----------------------- | ----------------------- |
| 未登录                               | 401  | —                       | "请先登录"              |
| 文件为空                             | 400  | —                       | "请选择要上传的文件"    |
| 不支持的文件类型                     | 400  | `UNSUPPORTED_FILE_TYPE` | "不支持的文件类型: ..." |
| 文件过大                             | 400  | `FILE_TOO_LARGE`        | "文件大小不能超过 10MB" |
| survey_id 格式错误（若传了非数字值） | 400  | —                       | "问卷 ID 格式错误"      |
| MinIO 不可用                         | 500  | `FILE_STORAGE_ERROR`    | "文件存储服务暂不可用"  |

---

## 2. GET /admin/media-assets — 新增 file_type 筛选

### 新增查询参数

| 参数        | 类型          | 必填 | 说明                                                                                                                   |
| ----------- | ------------- | :--: | ---------------------------------------------------------------------------------------------------------------------- |
| `file_type` | string (enum) |  否  | [NEW] 按文件来源类型筛选。取值: `survey_option_image` \| `survey_signature` \| `survey_cover` \| `user_avatar`。单选。 |

### 示例请求

```http
GET /api/admin/media-assets?page=1&page_size=20&file_type=user_avatar&review_status=pending
Authorization: Bearer <super_admin_token>
```

### 成功响应 (code=0)

```json
{
  "code": 0,
  "msg": "查询成功",
  "data": {
    "list": [
      {
        "id": "789",
        "resource_type": "image",
        "file_url": "https://minio.example.com/avatars/uuid_original.jpg",
        "file_key": "avatars/uuid_original.jpg",
        "file_name": "uuid_original.jpg",
        "mime_type": "image/jpeg",
        "file_size": 245760,
        "file_type": "user_avatar",
        "review_status": "pending",
        "reviewed_by": null,
        "reviewed_at": null,
        "review_comment": null,
        "user_id": "42",
        "survey_id": null,
        "created_at": "2026-07-19T10:30:00.000Z",
        "updated_at": "2026-07-19T10:30:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "page_size": 20,
      "total": 1,
      "total_pages": 1
    }
  }
}
```

### 错误响应

| 场景                       | HTTP | code | msg                              |
| -------------------------- | :--: | ---- | -------------------------------- |
| `file_type` 值不在枚举范围 | 400  | —    | Zod 校验失败（Fastify 自动处理） |

---

## 3. DELETE /admin/media-assets/:id — 头像强制删除

### 行为变更说明

当前接口在 `detectReferences` 检测到引用时统一返回 200 + `code=3005`（`MEDIA_ASSET_REFERENCED`）阻止删除。

**变更后**：当引用的 `type` 全部为 `user_avatar`（无 `survey_component` 引用）时，不阻止删除，而是执行强制删除流程。

### 强制删除流程

```
1. 查询 media_asset 记录 (findUnique)
2. 调用 detectReferences(file_url)
3. IF references 包含 type=survey_component → 返回 200 + code=MEDIA_ASSET_REFERENCED（不变）
4. IF references 全部为 type=user_avatar →
   a. 尝试 deleteFromMinio(file_key) — 失败不阻塞，记录 warn 日志
   b. DELETE FROM media_assets WHERE id = $id
   c. UPDATE user_profiles SET avatar_url = NULL WHERE avatar_url = $file_url
      — 失败记录 Error 日志，但尽量不抛异常（主操作已完成）
   d. createAuditLog
   e. 返回 code=0，data 中包含 affected_user_ids 告知前端哪些用户需要刷新头像
5. IF references 为空（无引用）→ 正常删除（现有逻辑不变）
```

### 成功响应（强制删除场景）

```json
{
  "code": 0,
  "msg": "头像物料已删除，相关用户头像已重置",
  "data": {
    "deleted": true,
    "force_deleted": true,
    "affected_user_ids": ["42"],
    "references": [{ "type": "user_avatar", "user_id": "42" }]
  }
}
```

### 成功响应（正常删除，无引用）

```json
{
  "code": 0,
  "msg": "物料已删除",
  "data": { "deleted": true }
}
```

### 阻止删除响应（问卷引用，不变）

```json
{
  "code": 3005,
  "msg": "该物料仍被引用，无法删除",
  "data": {
    "references": [
      { "type": "survey_component", "survey_id": "100", "survey_title": "员工满意度调查", "component_id": "200" }
    ]
  }
}
```

### 混合引用场景（同时被头像和问卷引用）

```json
// 仍阻止删除，因为存在 survey_component 引用
{
  "code": 3005,
  "msg": "该物料仍被问卷引用，无法删除",
  "data": {
    "references": [
      { "type": "user_avatar", "user_id": "42" },
      { "type": "survey_component", "survey_id": "100", "survey_title": "员工满意度调查", "component_id": "200" }
    ]
  }
}
```

> 混合引用：某个图片 URL 同时被用户设为头像 **且** 出现在某问卷题目配置中。此时优先保护问卷完整性，阻止删除。管理员需先让用户更换头像（消除头像引用），或从问卷题目中移除该图片（消除问卷引用），再执行删除。
