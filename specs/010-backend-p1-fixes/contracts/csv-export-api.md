# API Contract: CSV 导出接口变更

**Feature**: 010-backend-p1-fixes / US1
**Created**: 2026-08-08

## 端点

```
GET /api/survey/:id/export/csv
```

## 变更类型

行为变更 — API 路径、请求参数、响应格式均不变，仅传输方式从"完整响应体"改为"流式传输"。

## 请求

| 参数        | 位置  | 类型              | 必填 | 说明               |
| ----------- | ----- | ----------------- | ---- | ------------------ |
| `id`        | path  | string (BigInt)   | 是   | 问卷 ID            |
| `date_from` | query | string (ISO 8601) | 否   | 答卷提交时间筛选起 |
| `date_to`   | query | string (ISO 8601) | 否   | 答卷提交时间筛选止 |

```
GET /api/survey/1234567890123456789/export/csv?date_from=2026-01-01&date_to=2026-06-30
```

## 响应

### 成功（200）

**变更前**：整个 CSV 内容作为 `application/octet-stream` 或 `text/csv` 一次性返回，`data` 字段包含完整 CSV 字符串。

**变更后**：

- Content-Type: `text/csv; charset=utf-8`
- Transfer-Encoding: `chunked`
- Content-Disposition: `attachment; filename="survey-{id}-export.csv"`
- 响应体为流式 CSV 内容，逐批输出

### 客户端断开

当客户端在导出过程中断开连接时，服务端 `stream.Readable` 的 `destroy()` 被调用，数据库游标停止读取，资源释放。

### 空问卷

```
HTTP 200
Content-Type: text/csv; charset=utf-8

暂无答卷数据
```

行为与变更前一致。

### 错误

| 场景           | HTTP 状态码 | 说明                                                                       |
| -------------- | ----------- | -------------------------------------------------------------------------- |
| 问卷不存在     | 404         | 标准错误响应                                                               |
| 数据库查询失败 | 500         | 流式传输中错误通过 stream `error` 事件处理，已输出的数据保留（不完整标记） |

## 兼容性

- **前端**：浏览器 `<a download>` 标签点击下载行为不变（浏览器原生支持 chunked 响应）
- **API 测试**：需注意响应体验证方式从"检查返回字符串"改为"收集流数据后拼接"
- **CSV 格式**：表头和数据行格式与变更前完全一致
