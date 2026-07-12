# 实施计划：管理后台埋点监控数据可视化仪表盘

**分支**：`002-tracking-analytics-dashboard` | **日期**：2026-07-09 | **规格说明**：[spec.md](./spec.md)

**输入**：来自 `/specs/002-tracking-analytics-dashboard/spec.md` 的功能规格说明

**说明**：本文件由 `/speckit-plan` 命令填写。执行流程详见 `.specify/templates/plan-template.md`。

## 摘要

在 `app/frontend` 中新增一个仅管理员可见的页面，用于可视化 `q-server` 现有
`tracking-analytics` 接口（`/api/admin/analytics/*`，在此前 `001-q-editor-monitoring-integration`
功能中建成）已经暴露出来的埋点/监控数据。页面包含四个区域——概览/管道健康、错误、性能、
用量与漏斗——分别对应四个用户故事，每个区域各自独立可用。**本功能对后端有且仅有一处小幅、
可加式的改动**（详见 `research.md` §8）：为兑现 FR-010 对编辑器加载/保存耗时的承诺，
在 `q-server` 现有的 `getPerformance` 接口的 `metric` 枚举中新增两个取值。除此之外，
本功能是纯前端消费层，再加上一处两行代码量级的路由守卫扩展，用来把新页面限制给 `super_admin`
用户（这是对后端既有 `requireSuperAdmin` 强制校验的镜像补充，而不是替代）。由于
`app/frontend` 目前没有任何图表库，本功能会引入一个新依赖来渲染趋势/百分位可视化图表。

## 技术上下文

**语言/版本**：TypeScript 5.9（strict）——`app/frontend` 侧；`q-server` 侧的改动是在既有
TypeScript 5.9（strict）代码基础上做小幅新增，不涉及升级/降级。

**主要依赖**：既有——Vue 3.5、Vite 7、Pinia 3（`useUserStore().isSuperAdmin`）、
Arco Design Vue（表格/卡片/统计数值/表单/时间范围选择器，遵循既有页面的惯例）、既有的
`serverClient` Axios 实例（`src/api/clients/server.ts`）。新增——`echarts` + `vue-echarts`
（该应用目前没有任何图表能力；Arco Design Vue 本身不提供图表组件）。

**存储**：不适用——不引入任何新的持久化存储；所有数据均通过 HTTP 实时读取自 `q-server`
现有的、由 ClickHouse 支撑的分析接口。

**测试**：Vitest（`app/frontend` 已配置，`src/__tests__/` 下已有 3 个既有测试文件）——为新的
API 模块、共享的筛选状态组合式函数、路由守卫扩展新增单元测试；`q-server` 侧新增的两个
`metric` 分支同样需要新增测试。

**目标平台**：浏览器，管理后台前端（qiankun 主应用）——本页面只会作为 `app/frontend`
内的独立页面渲染，本身不会作为 qiankun 子应用被嵌入。

**项目类型**：Web 前端功能——一个新页面 + 配套 API 模块 + 组合式函数 + 最小化路由守卫扩展 +
一个新导航入口；后端侧仅有一处小幅新增（`getPerformance` 的 `metric` 枚举扩展），
不新增任何接口路由。

**性能目标**：筛选条件（时间范围/应用/环境）变化后，UI 在正常网络条件下 3 秒内完成更新
（SC-004）；"实时"区域的轮询/自动刷新间隔不得快于后端自身的缓存新鲜度
（`/analytics/realtime` 轮询不快于其 30 秒缓存 TTL，`/analytics/overview` 不快于其 60 秒
缓存 TTL），避免产生无意义的请求。

**约束**：不得在前端重复实现后端聚合逻辑（FR-002）——展示的每一个数字都必须直接来自某个
既有分析接口响应中的字段。不得把前端守卫当作唯一的访问控制手段（后端的 `requireSuperAdmin`
依然是权威判定依据，符合 Constitution 原则四）——前端守卫的存在纯粹是为了让未授权用户
连页面加载的一闪都看不到（SC-005）。任何轮询定时器必须在组件卸载时清除（qiankun 主应用
生命周期卫生，Constitution 原则八）。后端新增的两个 `metric` 分支必须严格是新增，
不得改变任何既有 `metric` 取值（`fcp`/`lcp`/`cls`/`inp`/`api_duration`）的行为。

**规模/范围**：一个新页面（`AnalyticsDashboardView.vue`），由四个区域组件组成，一个新 API
模块，一个新的筛选组合式函数，一个新导航/路由入口，一处两行代码量级的路由守卫扩展；
后端侧仅新增两个 `metric` 枚举分支，不新增任何路由/表/队列。

## Constitution 检查

_关卡：必须在 Phase 0 调研之前通过；Phase 1 设计完成后重新检查一次。_

| 原则                               | 评估                                                                                                                                                                                                                                                                                                                                                          |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 一、Monorepo 模块边界完整性        | 通过——新的 API 模块只与 `q-server` 现有的公开 HTTP 契约（`/api/admin/analytics/*`）通信；没有跨应用的相对路径导入；后端侧的新增严格限定在 `tracking-analytics` 模块内部，未跨越到其他模块。                                                                                                                                                                   |
| 二、严格类型安全与 Schema 优先校验 | 通过——响应类型以 TypeScript 接口的形式与新建的 `src/api/modules/analytics/index.ts` 模块就近声明，遵循 `log`/`admin` 等既有模块已确立的惯例（本地 `ApiResponse<T>` 包装类型，字段结构与 `packages/common` 的 `Analytics*` 接口保持一致），而不是为这个目前没有该依赖的应用引入新的工作区类型依赖。后端新增的 `metric` 枚举分支同样通过 Zod 在信任边界处校验。 |
| 三、统一 API 契约与响应结构        | 通过——消费既有的标准 `{code, msg, data}` 响应结构，不做任何改变；后端新增的两个 `metric` 取值复用同一个既有接口和响应结构，不引入新接口，不改变响应结构。                                                                                                                                                                                                     |
| 四、默认安全                       | 通过——新路由通过现有全局路由守卫中的 `meta.requiresSuperAdmin` 判断（`useUserStore().isSuperAdmin`）进行拦截，这纯粹是一层 UX 层面的提前退出；后端的 `authenticate` + `requireSuperAdmin` 前置处理器依然是权威的强制校验点（本功能未触碰、未改变）。未引入任何新的敏感信息。                                                                                  |
| 五、测试优先/测试充分交付          | 通过——新的 API 模块、筛选组合式函数、路由守卫扩展，以及后端新增的两个 `metric` 分支，均在本次改动中配套 Vitest/Vitest（后端）单元测试，与该应用既有（尽管单薄）的测试覆盖保持一致的交付标准。                                                                                                                                                                 |
| 六、可观测性与结构化日志           | 不适用——本功能是可观测性数据的消费方，不新增日志，也不改动埋点管道本身。                                                                                                                                                                                                                                                                                      |
| 七、代码风格与静态分析合规         | 通过——适用标准的根目录 ESLint/Prettier/cspell 关卡；不引入互相冲突的 lint 配置。                                                                                                                                                                                                                                                                              |
| 八、微前端与跨应用集成纪律         | 通过——`app/frontend` 是 qiankun 主应用；本页面不改变 qiankun 生命周期处理逻辑。任何轮询/自动刷新定时器必须在 `onUnmounted` 中清除，避免在挂载/卸载周期之间产生泄漏。                                                                                                                                                                                          |
| 九、AI/LLM 集成治理                | 不适用——本功能没有 LLM/AI 相关面。                                                                                                                                                                                                                                                                                                                            |
| 十、性能与数据管道完整性           | 通过——"实时"区域的轮询间隔被限定为不快于后端缓存 TTL（30 秒/60 秒），避免对既有的、经 Redis 缓存与分区裁剪优化过的 ClickHouse 查询产生不必要的负载；后端新增的两个 `metric` 分支复用既有的分区裁剪与环境筛选查询结构，不引入新的查询模式。                                                                                                                    |

**结论**：无违规项。下方"复杂度追踪"表无需填写。

**Phase 1 设计后复查**：`research.md` §7 与 `contracts/analytics-endpoints.md` 揭示了
`overview`/`realtime`/`funnel` 三个接口本身不支持 `environment` 筛选（这是
`001-q-editor-monitoring-integration` 时期就存在、且是刻意划定的范围边界，不是本功能引入的
缺口）。处理方式是把这些面板明确标注为"汇总全部环境"，而不是默默地误导性标注环境筛选已生效——
这样既维持了原则三（不展示误导性数据），也维持了本计划"仅一处小幅后端新增、不做更大范围后端
改动"的整体框定。另外，`research.md` §8 记录了分析报告（`/speckit-analyze`）发现的 C1
问题——性能区域原本无法展示编辑器加载/保存耗时——已采用用户选定的"方案 A"予以解决：对
`getPerformance` 做一次小幅、可加式扩展。两项复查均维持"通过"结论。

## 项目结构

### 文档（本功能）

```text
specs/002-tracking-analytics-dashboard/
├── plan.md              # 本文件（/speckit-plan 命令输出）
├── research.md          # Phase 0 输出（/speckit-plan 命令）
├── data-model.md        # Phase 1 输出（/speckit-plan 命令）
├── quickstart.md        # Phase 1 输出（/speckit-plan 命令）
├── contracts/           # Phase 1 输出（/speckit-plan 命令）
└── tasks.md             # Phase 2 输出（/speckit-tasks 命令 —— 不由 /speckit-plan 创建）
```

### 源代码（仓库根目录）

```text
app/frontend/
├── package.json                              # 修改：新增 echarts、vue-echarts 依赖；新增 "test" 脚本
├── src/
│   ├── api/modules/analytics/
│   │   └── index.ts                           # 新增：本功能消费的全部 6 个分析接口的请求函数 + 就近声明的类型
│   ├── composables/
│   │   └── useAnalyticsFilters.ts             # 新增：共享的时间范围/应用/环境筛选状态，供 4 个区域面板共用
│   ├── views/analytics-dashboard/
│   │   ├── AnalyticsDashboardView.vue          # 新增：页面外壳 —— 筛选栏 + 4 个区域面板 + 环境徽标
│   │   ├── OverviewPanel.vue                   # 新增：US1 —— 今日快照 + 5 分钟实时快照 + 管道健康的空态/错误态
│   │   ├── ErrorsPanel.vue                     # 新增：US2 —— Top-N 错误表格 + 错误趋势图
│   │   ├── PerformancePanel.vue                # 新增：US3 —— 百分位汇总 + 趋势图，指标切换器
│   │   ├── UsagePanel.vue                      # 新增：US4 —— PV/UV 趋势图 + 漏斗明细
│   │   └── __tests__/                          # 新增：组件级测试（详见 tasks.md）
│   ├── router/routes.ts                        # 修改：为 RouteMeta 新增 requiresSuperAdmin 字段；新增本页面的路由条目
│   ├── main.ts                                  # 修改：为既有 beforeEach 守卫新增 requiresSuperAdmin 判断分支
│   └── __tests__/
│       ├── api/analytics.spec.ts                # 新增：API 模块测试（比照既有的 __tests__/api/auth.spec.ts）
│       └── composables/useAnalyticsFilters.spec.ts  # 新增

app/q-server/
├── src/modules/tracking/tracking-analytics/
│   ├── tracking-analytics.schemas.ts           # 修改：为 performance 查询的 metric 枚举新增 "editor_load"、"editor_save"
│   └── tracking-analytics.service.ts           # 修改：getPerformance 的 switch 分支新增对应两个 case
└── src/spec/tracking/
    └── tracking-analytics.spec.ts               # 修改/新增：新增两个 metric 分支的测试
```

**结构决策**：一个新页面，由四个可独立加载的区域组件组成（每个对应一个用户故事），
一个共享筛选组合式函数，一个新的 API 模块——沿用该应用既有的
`views/{功能}/` + `api/modules/{功能}/` 组织方式（如 `log`/`audit-logs`、
`survey-resources` 所示）。除本文档开头所述的那一处 `q-server` 小幅新增外，不改动
`q-server` 或其他任何包；唯一的横切改动是一处两个字段量级的路由守卫扩展，未来其他仅管理员
可见页面也可复用。

## 复杂度追踪

> **仅当 Constitution 检查存在必须说明理由的违规项时才填写**

无——上方 Constitution 检查未记录任何违规项。
