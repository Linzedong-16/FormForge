# Data Model: 问卷答卷基础统计

所有实体已有完整的后端实现和 TypeScript 类型定义，本文件仅记录与本需求直接相关的结构。

**类型定义源文件**: `packages/common/src/survey/survey-stats.interface.ts`

## 核心实体

### StatsOverviewResponse — 平台统计概览

| 字段                | 类型              | 含义                             |
| ------------------- | ----------------- | -------------------------------- |
| total_surveys       | number            | 问卷总数（含草稿/已发布/已关闭） |
| published_surveys   | number            | 已发布问卷数                     |
| total_responses     | number            | 累计答卷总数                     |
| responses_today     | number            | 今日新增答卷数                   |
| responses_this_week | number            | 本周新增答卷数                   |
| trend_7_days        | DailyTrendPoint[] | 最近 7 天每日答卷趋势            |

### DailyTrendPoint

| 字段  | 类型   | 含义               |
| ----- | ------ | ------------------ |
| date  | string | 日期（YYYY-MM-DD） |
| count | number | 当日答卷数         |

### SurveyStatsResponse — 单问卷统计响应

| 字段            | 类型              | 含义                          |
| --------------- | ----------------- | ----------------------------- |
| survey_id       | string            | 问卷 ID                       |
| title           | string            | 问卷标题                      |
| total_responses | number            | 总答卷数                      |
| valid_responses | number            | 有效答卷数（status=1 已提交） |
| completion_rate | number            | 完成率（0~100）               |
| daily_trend     | DailyTrendPoint[] | 每日答卷趋势                  |
| questions       | QuestionStats[]   | 逐题统计                      |

### QuestionStats — 单题统计

| 字段                 | 类型                 | 条件        | 含义                   |
| -------------------- | -------------------- | ----------- | ---------------------- |
| component_id         | string               | 必有        | 组件 ID                |
| type                 | string               | 必有        | 组件类型（snake_case） |
| title                | string               | 必有        | 题目标题               |
| order_index          | number               | 必有        | 排序序号               |
| total_answers        | number               | 必有        | 该题答案总数           |
| options_distribution | OptionDistribution[] | 选择/评分类 | 选项/分值分布          |
| average              | number               | 数值类      | 平均值                 |
| min                  | number               | 数值类      | 最小值                 |
| max                  | number               | 数值类      | 最大值                 |
| sample_answers       | string[]             | 文本类      | 抽样答案（最近 10 条） |

### OptionDistribution

| 字段       | 类型   | 含义                 |
| ---------- | ------ | -------------------- |
| label      | string | 选项标签（人类可读） |
| count      | number | 选择次数             |
| percentage | number | 选择百分比（0~100）  |

### AdminResponseListResponse — 答卷列表

| 字段      | 类型                | 含义     |
| --------- | ------------------- | -------- |
| responses | AdminResponseItem[] | 答卷列表 |
| total     | number              | 总数     |
| page      | number              | 当前页码 |
| page_size | number              | 每页条数 |

### AdminResponseItem

| 字段         | 类型                | 含义                     |
| ------------ | ------------------- | ------------------------ |
| id           | string              | 答卷 ID                  |
| anonymous_id | string \| null      | 匿名标识                 |
| status       | 0 \| 1              | 状态                     |
| submitted_at | string \| null      | 提交时间                 |
| created_at   | string              | 创建时间                 |
| answers      | AnswerWithContext[] | 答案列表（带组件上下文） |

## 实体关系

```
StatsOverviewResponse (平台级，无关联)
    └── DailyTrendPoint[]

SurveyStatsResponse (1 对 1 问卷)
    ├── DailyTrendPoint[]
    └── QuestionStats[] (1 对 N 题目)
            └── OptionDistribution[] (1 对 N 选项/分值)

AdminResponseListResponse (1 对 N 答卷)
    └── AdminResponseItem[]
            └── AnswerWithContext[] (1 对 N 答案)
```
