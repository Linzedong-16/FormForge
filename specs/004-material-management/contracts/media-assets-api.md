# API Contract: 物料（MediaAsset）管理接口

> 遵循项目宪法 Principle III 规定的统一响应信封：`{ "code": number, "msg": string, "data": T | null }`，`code=0` 表示成功。全部接口挂载于 `/api/admin/media-assets` 前缀下，均要求 `Authorization: Bearer <accessToken>` 且经过 `authenticate` + `requireSuperAdmin` 校验；未通过校验统一返回 `401`（未登录/Token 无效）或 `403`（非管理员），`data: null`，不泄露物料是否存在等信息。

## 1. 获取物料列表

`GET /api/admin/media-assets`

**Query 参数**（均可选，用于筛选/分页；语义参照现有 `survey-stats`/`admin/users` 列表接口的分页信封惯例）：

| 参数            | 类型                                  | 说明                             |
| --------------- | ------------------------------------- | -------------------------------- |
| `page`          | number                                | 页码，默认 1                     |
| `page_size`     | number                                | 每页条数，默认 20                |
| `user_id`       | string(BigInt)                        | 按上传者筛选                     |
| `survey_id`     | string(BigInt)                        | 按所属问卷筛选                   |
| `review_status` | `pending` \| `approved` \| `rejected` | 按审核状态筛选                   |
| `resource_type` | string                                | 按资源类型筛选（当前仅 `image`） |
| `keyword`       | string                                | 按文件名模糊搜索                 |

**成功响应** `200`：

```jsonc
{
  "code": 0,
  "msg": "ok",
  "data": {
    "list": [
      {
        "id": "1001",
        "resourceType": "image",
        "fileUrl": "https://minio.example.com/media/xxx.png",
        "fileName": "封面图.png",
        "mimeType": "image/png",
        "fileSize": 102400,
        "fileType": "survey_option_image",
        "reviewStatus": "pending",
        "reviewedBy": null,
        "reviewedAt": null,
        "reviewComment": null,
        "ownerUserId": "5001",
        "surveyId": "2001",
        "createdAt": "2026-07-01T08:00:00.000Z",
        "updatedAt": "2026-07-01T08:00:00.000Z"
      }
    ],
    "total": 128,
    "page": 1,
    "pageSize": 20
  }
}
```

## 2. 获取单条物料详情

`GET /api/admin/media-assets/:id`

**成功响应** `200`：`data` 为单条物料对象（结构同上），附加 `references` 字段列出当前的有效引用来源（用于管理员判断能否删除）：

```jsonc
{
  "code": 0,
  "msg": "ok",
  "data": {
    "...物料字段同上...": null,
    "references": [
      { "type": "survey_component", "surveyId": "2001", "surveyTitle": "客户满意度调查", "componentId": "3001" }
    ]
  }
}
```

**失败**：物料不存在 → `404`，`code` 取业务错误码枚举中的"资源不存在"值。

## 3. 更新物料元信息

`PUT /api/admin/media-assets/:id`

**请求体**（仅描述性字段，不接受替换 `fileUrl`/`fileKey`）：

```jsonc
{ "resourceType": "image", "surveyId": "2002" }
```

**成功响应** `200`：`data` 为更新后的物料对象。
**失败**：请求体包含 `fileUrl`/`fileKey` 等禁止字段 → `400`（Zod schema 校验层拦截，不进入 service 层）。

## 4. 删除物料

`DELETE /api/admin/media-assets/:id`

**成功响应** `200`：`data: null`；同时清理 MinIO 底层文件与 `MediaAsset` 记录。

**存在有效引用（对应 spec.md FR-014）**：HTTP 状态仍为 `200`（前端全局响应拦截器只在 2xx 状态下保留完整响应体，非 2xx 会被转换为丢失 `data` 的通用错误），真正的失败信号是非零 `code`：

```jsonc
{
  "code": 4091,
  "msg": "该物料仍被以下内容引用，请先解除引用后再删除",
  "data": {
    "references": [
      { "type": "survey_component", "surveyId": "2001", "surveyTitle": "客户满意度调查", "componentId": "3001" }
    ]
  }
}
```

调用方按 `code === 0` 判断真正成功，不能仅依据 HTTP 状态码。

## 5. 批量删除物料

`POST /api/admin/media-assets/batch-delete`

**请求体**：

```jsonc
{ "ids": ["1001", "1002", "1003"] }
```

**成功响应** `200`（即使部分失败，HTTP 层仍返回 200，失败详情在 `data` 中体现，不整体报错）：

```jsonc
{
  "code": 0,
  "msg": "ok",
  "data": {
    "succeeded": ["1001", "1003"],
    "failed": [
      { "id": "1002", "reason": "referenced", "references": [{ "type": "survey_component", "surveyId": "2001" }] }
    ]
  }
}
```

## 6. 直接上传新物料

`POST /api/admin/media-assets/upload`

**请求**：`multipart/form-data`，字段 `file`（图片），可选 `surveyId`。复用现有 `upload.routes.ts` 的 MIME 白名单与 10MB 大小限制。

**成功响应** `201`：`data` 为新建的物料对象（`reviewStatus` 默认 `pending`）。
**失败（非图片类型）** `415`：`code` 取"不支持的媒体类型"业务错误码，`msg` 提示"当前阶段仅支持图片类型文件"。

## 7. 变更审核状态

`PUT /api/admin/media-assets/:id/review-status`

> 该接口的鉴权与其它接口相同（`authenticate` + `requireSuperAdmin`），是"预留给未来审核 Agent"的落点：调用方是人工管理员还是持有等效授权的自动化流程，对接口本身透明，均按同一契约调用。

**请求体**：

```jsonc
{ "reviewStatus": "approved", "comment": "内容符合规范" }
```

`reviewStatus` 取值：`pending` | `approved` | `rejected`（互相自由转换，无前置状态要求，区别于 `Review` 模块严格的 pending-only 提交审核流程）。

**成功响应** `200`：`data` 为更新后的物料对象；同时：

1. 写入 `reviewedBy`（当前调用者 `user_id`）、`reviewedAt`（当前时间）、`reviewComment`（如提供）
2. 追加一条 `AuditLog`（`action: "media_asset.review_status_change"`，`details: { fromStatus, toStatus, comment }`）

**该状态变更不会影响物料在其原有引用位置（如已发布问卷）的展示**（对应 spec.md FR-015 —— 仅为管理侧标记，无业务侧强制约束）。

## 错误码约定

沿用平台集中错误码枚举模式（宪法 Principle III），新增本模块专属错误码 `BizCode.MEDIA_ASSET_REFERENCED = 3005`（问卷文件模块错误码区间，`media_assets` 由 `survey_files` 演进而来，与既有 `UNSUPPORTED_FILE_TYPE`/`FILE_NOT_FOUND` 等共享同一区间）。

| 场景                                 | HTTP Status        | 说明                                                                |
| ------------------------------------ | ------------------ | ------------------------------------------------------------------- |
| 非管理员访问                         | 403                | 权限不足                                                            |
| 未登录                               | 401                | Token 缺失/失效                                                     |
| 物料不存在                           | 404                | —                                                                   |
| 删除时存在有效引用                   | 200（`code=3005`） | 前端拦截器限制，见接口 4/5 说明；调用方按 `code` 而非 HTTP 状态判断 |
| 上传非图片类型                       | 415                | 见接口 6                                                            |
| 请求体校验失败（如尝试更新禁止字段） | 400                | Zod schema 拦截                                                     |
