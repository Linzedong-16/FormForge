# 埋点监控模块技术文档

## 1. 系统概述

本模块实现了一套完整的前端埋点数据采集、存储与分析系统，用于问卷系统的用户行为追踪、错误监控、性能分析和业务漏斗分析。

### 1.1 整体架构

```
前端 SDK → 上报接口(Ingest) → RabbitMQ → 消费进程(Consumer) → ClickHouse → 分析接口(Analytics)
```

### 1.2 模块结构

```
tracking/
├── doc/                           # 文档
├── index.ts                       # 统一导出
├── tracking-ingest/               # 埋点数据上报（面向前端 SDK）
│   ├── tracking-ingest.routes.ts
│   ├── tracking-ingest.schemas.ts
│   └── tracking-ingest.service.ts
└── tracking-analytics/            # 数据分析查询（面向管理后台）
    ├── tracking-analytics.routes.ts
    ├── tracking-analytics.schemas.ts
    └── tracking-analytics.service.ts

相关文件：
├── consumer/tracking-consumer.ts         # 独立消费进程
├── sql/clickhouse-tracking-schema.sql    # ClickHouse 建表脚本
└── packages/common/src/track/track.interface.ts  # 前后端共享类型
```

---

## 2. 接口列表

### 2.1 埋点上报接口（公开，无需认证）

挂载前缀：`/api/v1`

| 方法 | 路径                  | 说明                             | 限流     | Body 限制            |
| ---- | --------------------- | -------------------------------- | -------- | -------------------- |
| POST | `/api/v1/track`       | 单条事件上报（错误事件优先通道） | 60 次/秒 | ≤ 10KB               |
| POST | `/api/v1/track/batch` | 批量事件上报（行为/性能事件）    | 30 次/秒 | ≤ 512KB，最多 200 条 |

### 2.2 数据分析接口（需认证 + 超级管理员权限）

挂载前缀：`/api/admin`

| 方法 | 路径                               | 说明                                  | 缓存 TTL |
| ---- | ---------------------------------- | ------------------------------------- | -------- |
| GET  | `/api/admin/analytics/overview`    | 今日概览数据（PV/UV/错误数/问卷/AI）  | 60s      |
| GET  | `/api/admin/analytics/realtime`    | 实时统计（5 分钟窗口）                | 30s      |
| GET  | `/api/admin/analytics/trend`       | 多指标多粒度趋势查询                  | 5min     |
| GET  | `/api/admin/analytics/errors`      | 错误聚合分析（Top N）                 | 5min     |
| GET  | `/api/admin/analytics/performance` | 性能指标分析（P50/P75/P95/P99）       | 5min     |
| GET  | `/api/admin/analytics/funnel`      | 漏斗分析（问卷填写/问卷创建/AI 使用） | 10min    |
| GET  | `/api/admin/analytics/ai-usage`    | AI 使用统计分析                       | 10min    |
| GET  | `/api/admin/analytics/events`      | 事件明细分页查询                      | 无缓存   |

---

## 3. 业务流程

### 3.1 数据上报流程

```
┌──────────┐     POST /track      ┌──────────────────┐     publish      ┌──────────────┐
│ 前端 SDK │ ──────────────────→ │ Ingest Service   │ ──────────────→ │  RabbitMQ    │
│          │   POST /track/batch  │                  │                  │              │
│          │ ──────────────────→ │ • Zod 参数校验    │   routing_key:   │ • errors 队列 │
└──────────┘                      │ • 补充服务端字段  │   {category}.    │ • analytics  │
                                  │ • 立即返回 204   │   {app_id}       │   队列       │
                                  └──────────────────┘                  └──────────────┘
```

**服务端补充字段**：

- `server_timestamp`：服务端接收时间
- `client_ip_hash`：SHA256(客户端 IP) 前 16 位（不可逆）
- `user_agent_parsed`：UA 解析（浏览器、OS、设备类型）
- `geo_region` / `geo_city`：IP 地理位置（暂未实现，预留接口）

**RabbitMQ 路由规则**：

- Exchange：`tracking-events`（topic 类型）
- routing_key 格式：`{error|perf|behavior|metric}.{app_id}`
- `tracking-errors` 队列：绑定 `error.#`（高优先级）
- `tracking-analytics` 队列：绑定 `perf.#`、`behavior.#`、`metric.#`

**降级策略**：RabbitMQ 不可用时，事件写入本地 `logs/tracking-fallback/` 目录的 JSONL 文件。

### 3.2 数据消费流程

```
┌──────────────┐     批量拉取      ┌──────────────────────┐    批量写入     ┌─────────────┐
│  RabbitMQ    │ ──────────────→ │ Tracking Consumer    │ ────────────→ │ ClickHouse  │
│              │                  │                      │               │             │
│ • errors     │     手动 ACK     │ • 事件去重           │   失败降级     │ • tracking_ │
│ • analytics  │ ←────────────── │ • 数据清洗           │ ────────────→ │   events    │
└──────────────┘                  │ • 批量缓冲(200条/3s) │               │ • 物化视图   │
                                  │ • 堆积告警           │  本地 JSONL    └─────────────┘
                                  └──────────────────────┘
```

**消费进程特性**：

- 独立进程（PM2 fork 模式，单实例）
- 错误队列优先消费
- 批量写入：200 条/批 或 3 秒超时触发
- 事件去重：基于 `event_id` 的内存 Set（5 分钟/10 万条自动清理）
- ClickHouse 写入失败降级到本地 JSONL
- 队列堆积告警：> 5 万(P2) / > 10 万(P1)
- 优雅关闭：SIGTERM/SIGINT 信号触发 buffer 冲刷

### 3.3 数据分析流程

```
┌──────────────┐     查询请求      ┌──────────────────────┐     SQL 查询    ┌─────────────┐
│ 管理后台     │ ──────────────→ │ Analytics Service    │ ────────────→ │ ClickHouse  │
│              │     JSON 响应    │                      │               │             │
│              │ ←────────────── │ • Zod 参数校验        │   Redis 缓存   │ • 主表      │
└──────────────┘                  │ • Redis 缓存         │ ←───────────→ │ • 物化视图   │
                                  │ • 分区裁剪优化       │               └─────────────┘
                                  └──────────────────────┘
```

**查询优化策略**：

- 所有查询强制携带 `date` 分区条件（ClickHouse 分区裁剪）
- 聚合查询优先查物化视图
- Redis 缓存分层 TTL（实时 30s / 概览 60s / 趋势 5min / 漏斗 10min）
- 强制 LIMIT 防止 OLAP 查询耗尽内存

---

## 4. 数据存储设计（ClickHouse）

### 4.1 主表：tracking_events

| 字段                       | 类型                   | 说明                                                        |
| -------------------------- | ---------------------- | ----------------------------------------------------------- |
| event_id                   | String                 | UUID v7，全局去重                                           |
| timestamp                  | DateTime64(3)          | 毫秒精度，排序键核心                                        |
| date                       | Date                   | 分区键（按天分区）                                          |
| event_name                 | LowCardinality(String) | 事件名称                                                    |
| app_id                     | LowCardinality(String) | 应用标识                                                    |
| environment                | LowCardinality(String) | 部署环境（production/staging/development），默认 production |
| user_id                    | UInt64                 | 用户 ID（0=未登录）                                         |
| anonymous_id               | String                 | 匿名用户 ID                                                 |
| session_id                 | String                 | 会话 ID                                                     |
| device_id                  | String                 | 设备 ID                                                     |
| client_os / client_browser | LowCardinality(String) | 客户端环境                                                  |
| geo_region / geo_city      | LowCardinality(String) | 地理位置                                                    |
| page_url / page_title      | String                 | 页面上下文                                                  |
| properties                 | String                 | 事件属性（JSON）                                            |
| client_ip_hash             | String                 | IP 哈希                                                     |

- **引擎**：MergeTree（生产可用 ReplicatedMergeTree）
- **分区**：按天 `toYYYYMMDD(date)`
- **排序键**：`(app_id, event_name, toStartOfHour(timestamp), timestamp)`
- **TTL**：90 天自动删除
- **二级索引**：user_id、session_id 的 Bloom Filter

### 4.2 物化视图

| 视图                        | 引擎                 | 用途                                   | TTL  |
| --------------------------- | -------------------- | -------------------------------------- | ---- |
| `tracking_errors_hourly_mv` | SummingMergeTree     | 错误事件每小时聚合（告警+趋势）        | 1 年 |
| `tracking_perf_hourly_mv`   | AggregatingMergeTree | 性能指标每小时聚合（FCP/LCP/Duration） | 1 年 |
| `tracking_funnel_daily_mv`  | AggregatingMergeTree | 漏斗事件每日聚合                       | 2 年 |

---

## 5. 事件分类与定义

### 5.1 事件类别

| 类别     | routing_key 前缀 | 说明                         | 事件列表                                                                                                            |
| -------- | ---------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| 错误事件 | `error`          | JS/Vue/API/SSE/资源加载错误  | `js_error`, `vue_error`, `api_error`, `sse_error`, `resource_error`                                                 |
| 性能事件 | `perf`           | 页面性能、API 耗时、资源加载 | `page_perf`, `api_perf`, `resource_perf`, `editor_perf`                                                             |
| 行为事件 | `behavior`       | 用户操作行为                 | `page_view`, `survey_view`, `survey_submit_*`, `editor_*`, `admin_*`, `user_login`/`user_logout`, `component_click` |
| 指标事件 | `metric`         | 业务聚合指标                 | `ai_usage_daily`, `survey_response_aggregated`, `template_apply`                                                    |

### 5.2 应用标识白名单

```typescript
["q-editor", "frontend", "main-app", "q-server", "ai-service"];
```

### 5.3 部署环境标识

用于区分生产 / 预发 / 开发环境产生的埋点数据，使生产看板默认只看到 production 数据，
同时保留 staging/development 数据用于预发验证（详见 §6.1 上报必填、§6.2 分析接口默认过滤）。

```typescript
["production", "staging", "development"];
```

---

## 6. 参数校验规则

### 6.1 上报接口校验

| 字段        | 规则                                             |
| ----------- | ------------------------------------------------ |
| event_id    | 必填，1-128 字符                                 |
| event_name  | 必填，1-64 字符，snake_case 格式                 |
| app_id      | 必填，必须在白名单内                             |
| environment | 必填，必须为 production/staging/development 之一 |
| timestamp   | 必填，ISO 8601，不能超过未来 5 分钟              |
| properties  | 可选，JSON 大小 ≤ 8KB                            |
| 批量上报    | 1-200 条/次                                      |

### 6.2 分析接口查询参数

| 参数                                    | 类型         | 可选值                                                             |
| --------------------------------------- | ------------ | ------------------------------------------------------------------ |
| range                                   | 时间范围     | 1h, 6h, 24h, 7d, 30d, 90d                                          |
| granularity                             | 时间粒度     | minute, hour, day, week, month                                     |
| metric（趋势）                          | 指标         | pv, uv, errors, api_requests, surveys_created, responses, ai_usage |
| metric（性能）                          | 指标         | fcp, lcp, cls, inp, api_duration                                   |
| funnel_name                             | 漏斗类型     | survey_response, survey_creation, ai_usage                         |
| environment（trend/errors/performance） | 部署环境筛选 | production（默认）, staging, development                           |

---

## 7. 漏斗定义

### 7.1 问卷填写漏斗 (survey_response)

1. 查看问卷 → `survey_view`
2. 开始填写 → `survey_submit_start`
3. 提交成功 → `survey_submit_success`

### 7.2 问卷创建漏斗 (survey_creation)

1. 进入编辑器 → `page_view`（编辑器页面）
2. 新建问卷 → `editor_create_survey`
3. 添加题目 → `editor_add_component`
4. 发布问卷 → `editor_publish_survey`

### 7.3 AI 使用漏斗 (ai_usage)

1. 进入编辑器 → `page_view`（编辑器页面）
2. 使用 AI 生成 → `editor_use_ai_generate`
3. 使用 AI 润色 → `editor_use_ai_polish`

---

## 8. 部署与运维

### 8.1 PM2 进程配置

```javascript
{
  name: "tracking-consumer",
  script: "dist/consumer/tracking-consumer.js",
  instances: 1,            // 单实例，保证消息顺序消费和去重
  exec_mode: "fork",
  max_memory_restart: "512M",
  autorestart: true,
  max_restarts: 10,
  restart_delay: 5000
}
```

### 8.2 环境变量

| 变量                           | 默认值                 | 说明                 |
| ------------------------------ | ---------------------- | -------------------- |
| TRACKING_MQ_EXCHANGE           | tracking-events        | MQ Exchange 名称     |
| TRACKING_FALLBACK_DIR          | logs/tracking-fallback | Ingest 降级文件目录  |
| TRACKING_BATCH_SIZE            | 200                    | 消费进程批量大小     |
| TRACKING_BATCH_INTERVAL_MS     | 3000                   | 批量写入超时(ms)     |
| TRACKING_MAX_QUEUE_WARN        | 50000                  | 队列堆积 P2 告警阈值 |
| TRACKING_MAX_QUEUE_CRITICAL    | 100000                 | 队列堆积 P1 告警阈值 |
| TRACKING_ERROR_QUEUE           | tracking-errors        | 错误事件队列名       |
| TRACKING_ANALYTICS_QUEUE       | tracking-analytics     | 分析事件队列名       |
| TRACKING_CONSUMER_FALLBACK_DIR | logs/tracking-dead     | 消费进程降级文件目录 |

### 8.3 启动命令

```bash
# 开发环境
pnpm tracking-consumer:dev

# 生产环境
pnpm tracking-consumer:start

# PM2 全量启动（含业务服务 + 消费进程）
pnpm start:all
```

### 8.4 ClickHouse 建表

```bash
clickhouse-client < sql/clickhouse-tracking-schema.sql
```

---

## 9. 可靠性保障

| 环节            | 保障措施                                |
| --------------- | --------------------------------------- |
| 上报接口        | 异步处理立即返回 204，不阻塞客户端      |
| MQ 投递         | RabbitMQ 不可用时降级写本地 JSONL       |
| 消费进程        | 手动 ACK，处理完才确认                  |
| 事件去重        | 基于 event_id 的内存 Set                |
| ClickHouse 写入 | 批量写入失败降级到本地文件              |
| 连续失败        | 连续 3 次写入失败触发 P1 告警           |
| 队列堆积        | 定期检查，超阈值告警                    |
| 进程关闭        | 优雅退出，冲刷缓冲区                    |
| 限流防刷        | IP 限流（单条 60 次/秒，批量 30 次/秒） |
| 数据安全        | IP 哈希脱敏，不存储原始 IP              |

---

## 10. 共享类型（packages/common）

前后端共用的类型定义导出自 `packages/common/src/track/track.interface.ts`：

- **事件分类常量**：`ERROR_EVENTS`、`PERF_EVENTS`、`BEHAVIOR_EVENTS`、`METRIC_EVENTS`
- **应用/环境白名单**：`TRACKING_APP_IDS`、`TrackingAppId`；`TRACKING_ENVIRONMENTS`、`TrackingEnvironment`（production/staging/development）
- **上报结构**：`TrackEventPayload`（客户端，含必填 `environment` 字段） → `TrackEventFull`（补充服务端字段）
- **分析类型**：`AnalyticsOverview`、`AnalyticsTrendQuery/Response`、`AnalyticsErrorsQuery/Response`、`AnalyticsPerformanceQuery/Response`（后三者均支持可选 `environment` 筛选，默认 production）、`AnalyticsFunnelQuery/Response`、`AnalyticsAIUsageQuery/Response`、`AnalyticsEventDetailQuery/Response`、`AnalyticsRealtimeStats`
- **API 映射**：`TrackingApi`（上报）、`AnalyticsApi`（分析）
