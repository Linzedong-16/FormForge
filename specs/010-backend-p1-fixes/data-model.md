# Data Model: 后端 P1 级可靠性修复

**Feature**: 010-backend-p1-fixes
**Created**: 2026-08-08

## 概述

本次 P1 修复不引入新的数据库实体或修改 Prisma schema。所有变更均为行为层修改（流式查询、事件监听、配置修正、缓存失效、日志告警）。以下仅记录涉及的关键实体和状态。

## 涉及的现有实体

### Response（答卷）

| 字段           | 类型      | 说明                                   |
| -------------- | --------- | -------------------------------------- |
| `id`           | BigInt    | 主键                                   |
| `survey_id`    | BigInt    | 所属问卷（US4 需要此字段定位统计缓存） |
| `anonymous_id` | String?   | 匿名标识（CSV 导出列）                 |
| `submitted_at` | DateTime? | 提交时间（CSV 导出列 + 导出游标）      |
| `created_at`   | DateTime  | 创建时间（CSV 导出排序依据）           |

**US1 影响**：CSV 导出使用 `created_at` 作为游标字段分批读取。

**US4 影响**：`deleteResponse()` 需要从 Response 获取 `survey_id` 以构造统计缓存键。

### Answer（答案）

| 字段           | 类型      | 说明               |
| -------------- | --------- | ------------------ |
| `response_id`  | BigInt    | 所属答卷           |
| `component_id` | BigInt    | 所属题目           |
| `value`        | String?   | 单值答案           |
| `values`       | String[]? | 多值答案（多选等） |

**US1 影响**：CSV 导出按 `response_id` 批量加载答案，构建映射后输出。

### SurveyComponent（题目组件）

| 字段          | 类型   | 说明                     |
| ------------- | ------ | ------------------------ |
| `id`          | BigInt | 主键                     |
| `survey_id`   | BigInt | 所属问卷                 |
| `type`        | String | 题目类型                 |
| `config`      | Json   | 题目配置（含标题等）     |
| `order_index` | Int    | 排序索引（CSV 表头列序） |

**US1 影响**：CSV 导出读取组件列表以生成表头。

## 缓存键（Redis）

| 缓存键                    | 模式 | TTL     | 相关操作                   |
| ------------------------- | ---- | ------- | -------------------------- |
| `admin:stats:overview`    | 固定 | ~5 min  | US4: deleteResponse 时清除 |
| `admin:stats:survey:{id}` | 动态 | ~5 min  | US4: deleteResponse 时清除 |
| `response:detail:{id}`    | 动态 | ~10 min | US4: 已清除（不变）        |

## 状态机

### RabbitMQ 连接状态（US2）

```
[已连接] ──close/error──▶ [断开] ──重连定时器──▶ [重连中]
   ▲                                                      │
   └──────────────── 重连成功 ◀────────────────────────────┘
                              │
                              └── 重连失败 ──▶ [断开]（指数退避后重试）
```

重连参数：

- 初始延迟：1s
- 最大延迟：30s
- 退避乘数：2
- 最大重试次数：无限制（持续重试直到成功或进程退出）

### CSV 导出会话（US1）

```
[初始化] ──▶ [读取组件列表] ──▶ [游标=null] ──▶ [分批读取答卷+答案]
                                                      │
                                    ┌─────────────────┘
                                    ▼
                              [构建 CSV 行] ──▶ [写入 reply.raw]
                                    │                    │
                                    │              ┌─────┘
                                    ▼              ▼
                              [游标=最后行 created_at] ──▶ [还有数据?] ──是──▶ [分批读取]
                                                              │
                                                             否
                                                              ▼
                                                         [结束流]
```

## 无新增实体

所有 5 个 P1 修复均为现有实体的行为变更，不需要数据库迁移或 schema 更新。
