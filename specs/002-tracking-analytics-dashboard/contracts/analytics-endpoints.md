# 契约：前端消费既有 `tracking-analytics` 接口（含一处小幅新增）

本功能**不新增任何后端路由**，仅对 `getPerformance` 这一个既有接口的 `metric` 取值范围做了
一次小幅、可加式扩展（详见下方"性能接口的新增 `metric` 取值"一节及 `research.md` §8）。
本文档记录本仪表盘调用的每一个 `q-server` `/api/admin/analytics/*` 接口（均已实现，均要求
认证 + `super_admin` 角色，均已返回标准的 `{code, msg, data}` 响应结构）——以及关键的一点：
其中哪些接口目前支持、哪些不支持 `environment`/`app_id` 筛选参数（这一差异对 FR-006 意味着
什么，见 `research.md` §7）。

所有调用都经过 `app/frontend` 现有的 `serverClient`（`src/api/clients/server.ts`，
`baseURL: "/api"`），因此前端代码里调用形式类似 `serverClient.get("/admin/analytics/overview")`。

| 面板                    | 接口                               | 支持 `app_id`？ | 支持 `environment`？            | 说明                                                                                                                                                           |
| ----------------------- | ---------------------------------- | --------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 概览（US1）             | `GET /admin/analytics/overview`    | 不支持          | 不支持                          | 全局快照；界面上必须标注为"汇总全部环境/应用"。                                                                                                                |
| 概览（US1）             | `GET /admin/analytics/realtime`    | 不支持          | 不支持                          | 5 分钟窗口；标注方式同上。每 30 秒轮询一次（与后端缓存 TTL 对齐）。                                                                                            |
| 错误（US2）             | `GET /admin/analytics/errors`      | 支持（可选）    | 支持（可选，默认 `production`） | 查询参数：`range, top_n?, error_type?, app_id?, environment?`。                                                                                                |
| 错误（US2）/用量（US4） | `GET /admin/analytics/trend`       | 支持（可选）    | 支持（可选，默认 `production`） | 查询参数：`metric (pv\|uv\|errors\|api_requests\|surveys_created\|responses\|ai_usage), granularity, range, app_id?, environment?`。                           |
| 性能（US3）             | `GET /admin/analytics/performance` | 支持（可选）    | 支持（可选，默认 `production`） | 查询参数：`metric (fcp\|lcp\|cls\|inp\|api_duration\|editor_load\|editor_save), range, app_id?, environment?, page_url?`。最后两个 `metric` 取值为本功能新增。 |
| 用量/漏斗（US4）        | `GET /admin/analytics/funnel`      | 支持（可选）    | 不支持                          | 查询参数：`funnel_name (survey_response\|survey_creation\|ai_usage), range, app_id?`。界面上必须标注为"汇总全部环境"。                                         |

## 性能接口的新增 `metric` 取值（本功能对后端的唯一改动）

`GET /admin/analytics/performance` 的 `metric` 查询参数，在 `app/q-server/src/modules/
tracking/tracking-analytics/tracking-analytics.schemas.ts` 中的 Zod 枚举由：

```typescript
metric: z.enum(["fcp", "lcp", "cls", "inp", "api_duration"]);
```

扩展为：

```typescript
metric: z.enum(["fcp", "lcp", "cls", "inp", "api_duration", "editor_load", "editor_save"]);
```

对应地，在 `tracking-analytics.service.ts` 的 `getPerformance` 方法里，`switch (query.metric)`
新增两个分支：

```typescript
case "editor_load":
  eventFilter = "event_name = 'custom_timing' AND JSONExtractString(properties, 'timing_name') = 'editor_load'";
  metricField = "JSONExtractFloat(properties, 'duration_ms')";
  break;
case "editor_save":
  eventFilter = "event_name = 'custom_timing' AND JSONExtractString(properties, 'timing_name') = 'editor_save'";
  metricField = "JSONExtractFloat(properties, 'duration_ms')";
  break;
```

这两个分支复用与既有分支完全相同的百分位聚合 SQL 结构（`quantile(0.50/0.75/0.95/0.99)`）、
相同的分区裁剪与 `environment`/`app_id`/`page_url` 筛选拼接逻辑——**只是**匹配的
`event_name`/`properties` 字段不同（因为编辑器的加载/保存耗时是通过 SDK 的
`trackTiming(name, durationMs, context)` 上报的，其底层统一使用
`event_name = "custom_timing"` 加 `properties.timing_name` 区分具体计时项，
而不是把 `editor_load`/`editor_save` 当作 `event_name` 本身——详见 `research.md` §8）。
不改变、不影响任何既有 `metric` 取值（`fcp`/`lcp`/`cls`/`inp`/`api_duration`）的行为。

## 响应结构（不变，标准结构）

```jsonc
{
  "code": 0,
  "msg": "ok",
  "data": {
    /* 各接口特定的响应内容，见 data-model.md */
  }
}
```

非 0 的 `code`（例如校验错误、`429` 限流）必须被当作"加载失败"面板状态处理
（`research.md` §6），不能被静默忽略。`serverClient` 的响应拦截器在 2xx 时已经返回完整的
响应结构（`response.data`），在非 2xx 时会以一个 `Error` 拒绝（消息取自
`error.response.data.msg`）——因此每个 API 函数的调用方需要在成功路径检查
`res.code === 0`，并在网络错误/5xx/429 路径捕获被拒绝的 Promise。

## 前端侧请求契约（本功能新增的 API 模块）

`src/api/modules/analytics/index.ts` 为上表每一个接口暴露一个函数，均返回
`Promise<ApiResponse<T>>`（与既有每个模块相同的 `{code, msg, data}` 包装模式），例如：

```typescript
export const getOverview = (): Promise<ApiResponse<OverviewSnapshot>> => serverClient.get("/admin/analytics/overview");

export const getErrors = (params: {
  range: TimeRange;
  environment?: Environment;
  appId?: TrackingAppId;
  topN?: number;
  errorType?: string;
}): Promise<ApiResponse<ErrorsResponse>> =>
  serverClient.get("/admin/analytics/errors", {
    params: {
      range: params.range,
      environment: params.environment,
      app_id: params.appId,
      top_n: params.topN,
      error_type: params.errorType
    }
  });
```

（`OverviewSnapshot`、`ErrorsResponse` 等完整类型定义见 `data-model.md`。）

## 鉴权契约（不变，以后端为权威判定）

上表每一个接口目前均已要求（本功能不改变）：`Authorization: Bearer <token>`
（由 `serverClient` 既有的请求拦截器透明处理），以及调用方必须具有 `super_admin` 角色，
由服务端的 `authenticate` + `requireSuperAdmin` 强制校验。本功能的前端路由守卫
（见 `research.md` §3）是一层附加的、非权威的 UX 层检查——如果上述任意接口返回
`403`/`401`（例如某个 token 在会话中途失去了管理员权限），必须被优雅地当作"加载失败"面板
状态处理，不能假设这种情况不可能发生。
