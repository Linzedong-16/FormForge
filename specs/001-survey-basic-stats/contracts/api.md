# API Contracts: 问卷答卷基础统计

所有接口已完全实现，本文件记录契约规格供前端开发参考。

**后端路由**: `app/q-server/src/modules/survey/survey-stats/survey-stats.routes.ts`
**鉴权**: 所有端点均需 `authenticate` + `requireSuperAdmin`

---

## GET /api/admin/stats/overview

平台统计概览。结果缓存 5 分钟。

**Query** (可选):

- `date_from` (string, ISO 8601) — 统计起始日期
- `date_to` (string, ISO 8601) — 统计截止日期

**Response** `{ code: 0, msg: "ok", data: StatsOverviewResponse }`

---

## GET /api/admin/surveys/:id/stats

单问卷逐题统计分析。

**Params**:

- `id` (string, 数字) — 问卷 ID

**Response** `{ code: 0, msg: "ok", data: SurveyStatsResponse }`

**错误**:

- 400 — 问卷 ID 格式错误（非数字）
- 404 — 问卷不存在

---

## GET /api/admin/surveys/:id/responses

答卷列表（管理员视角，含搜索/筛选/分页）。

**Params**:

- `id` (string, 数字) — 问卷 ID

**Query** (可选):

- `page` (int, default 1)
- `page_size` (int, default 20, max 100)
- `status` (0|1) — 答卷状态筛选
- `date_from` (string, ISO 8601)
- `date_to` (string, ISO 8601)
- `keyword` (string, max 200) — 搜索匿名 ID 或答案内容

**Response** `{ code: 0, msg: "ok", data: AdminResponseListResponse }`

---

## GET /api/admin/surveys/:id/responses/export

CSV 答卷导出。返回 CSV 文本流（非 JSON）。

**Params**:

- `id` (string, 数字) — 问卷 ID

**Query** (可选):

- `format` (string, default "csv") — 导出格式
- `date_from` (string, ISO 8601)
- `date_to` (string, ISO 8601)

**Response**:

- Content-Type: `text/csv; charset=utf-8`
- Content-Disposition: `attachment; filename="survey_{id}_{title}.csv"`
- Body: UTF-8 BOM + CSV 文本

**CSV 结构**:

```
答卷编号,提交时间,匿名ID,Q1_题目标题(题型),Q2_题目标题(题型),...
001,2024-01-15T10:30:00Z,anon_01,非常满意,薪资福利;弹性工作,...
```

**错误**:

- 404 — 问卷不存在
- 无答卷时返回文本 `"暂无答卷数据"`
