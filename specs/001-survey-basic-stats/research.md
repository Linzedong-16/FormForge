# Research: 问卷答卷基础统计 — 前端实现方案

**Date**: 2026-07-24

## 1. 图表库选型

**Decision**: 复用已有的 ECharts 5.6 + vue-echarts 7.0，不引入新依赖。

**Rationale**:

- `app/frontend` 已安装 `echarts@^5.6.0` + `vue-echarts@^7.0.3`
- 已有 `src/plugins/echarts.ts` 按需注册了 LineChart、BarChart、GridComponent、TooltipComponent、LegendComponent、CanvasRenderer
- 已有 `analytics-dashboard` 下的两个视图实际使用了 `<VChart>` 组件，且有测试 mock 模式可参考
- ECharts 支持本需求所需的所有图表类型：柱状图（选项分布）、折线图（日趋势）、饼图/环形图（占比）

**Alternatives considered**:

- Chart.js → 需新增依赖，且已有 ECharts 能满足需求，无必要引入第二套图表库
- 纯 CSS 柱状图（当前统计页面使用的方式）→ 简单场景可用，但无法表达饼图、折线图等复杂图表，且 ECharts 交互（tooltip、legend 点击筛选）对统计数据展示有价值

## 2. 新增页面结构

**Decision**: 单文件组件 `SurveyStatsDetailView.vue`，放在 `app/frontend/src/views/statistics/`。

**Rationale**:

- 与已有 `SurveyStatisticsView.vue`（平台汇总页）放在同一目录，路由为父子关系
- Arco Design Vue 的 `a-card`、`a-table`、`a-statistic` 组件已在汇总页使用，保持一致风格
- ECharts `<VChart>` 使用方式参照 `ErrorsPerformanceView.vue` 的模式

## 3. 题型统计图表映射

| 题型大类                      | 推荐图表         | ECharts 类型                            | 说明                                               |
| ----------------------------- | ---------------- | --------------------------------------- | -------------------------------------------------- |
| 选择题（单选/多选/下拉/图片） | 横向条形图       | bar (xAxis: 'value', yAxis: 'category') | 选项标签为 Y 轴，频次/百分比为 X 轴                |
| 评分/滑块                     | 柱状图（直方图） | bar                                     | 分数值为 X 轴，人数为 Y 轴；平均值用 markLine 标注 |
| 矩阵单选                      | 表格 + 条件着色  | 非图表，Arco Table + CSS                | 行列交叉表，热力图用 CSS background 深浅表示       |
| 日期/级联                     | 纵向条形图       | bar                                     | 值为 X 轴，人数为 Y 轴                             |
| 文本/个人信息                 | 纯文本列表       | 非图表                                  | 抽样原文，已有后端 `take: 10`                      |
| 签名                          | 数字统计         | 非图表                                  | 有签名 / 无签名 数量                               |
| 日趋势（平台/问卷级）         | 折线图           | line                                    | X 轴日期，Y 轴答卷数                               |

## 4. CSV 导出前端实现

**Decision**: 调用已有 `exportResponses()` API（返回 Blob），通过 `URL.createObjectURL` + 临时 `<a>` 标签触发下载。

**Rationale**:

- `exportResponses()` 已在 `app/frontend/src/api/modules/survey/index.ts` 封装，返回 `Promise<Blob>`
- 纯浏览器端触发下载，无需额外依赖
- 参照已有 token 模块的下载模式
