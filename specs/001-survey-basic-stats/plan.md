# Implementation Plan: 问卷答卷基础统计与 CSV 导出

**Branch**: `001-survey-basic-stats` | **Date**: 2026-07-24 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-survey-basic-stats/spec.md`

## Summary

为管理后台补全问卷答卷基础统计功能。后端聚合引擎和 CSV 导出 API 已全部实现（`app/q-server/src/modules/survey/survey-stats/`），本需求聚焦于前端展示层的两个缺口：单问卷统计详情页（含逐题图表）和 CSV 导出按钮的接通。

## Technical Context

**Language/Version**: TypeScript 5.9 (strict), Node ≥22.17

**Primary Dependencies**: Vue 3.5, Vite 7, Arco Design Vue, Element Plus, Pinia 3, Axios, Chart.js（已有可选依赖）

**Storage**: PostgreSQL（已有，后端通过 Prisma 7 访问），Redis（已有，统计缓存 5 分钟）

**Testing**: Vitest（前端 `app/frontend`）

**Target Platform**: Web 浏览器（管理后台，桌面端优先）

**Project Type**: Web 应用 — 管理后台前端（monorepo 中 `app/frontend` 子应用）

**Performance Goals**: 单问卷统计查询（1000 份答卷规模）首次加载 ≤3s，缓存命中 ≤1s；1000 份答卷 CSV 导出 ≤10s

**Constraints**: 复用已有 Arco Design Vue 组件库，不引入新 UI 框架；统计结果 Redis 缓存 5 分钟

**Scale/Scope**: 1 个新页面组件 + 2 行路由 + 1 个导出按钮接线 ≈ 300 行新增代码

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                          | Status  | Notes                                                                                                            |
| ---------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------- |
| I. Monorepo Module Boundaries      | ✅ Pass | 前端代码在 `app/frontend/src/views/statistics/`，类型从 `@common/survey/survey-stats.interface` 导入，不跨包引用 |
| II. Strict Type Safety             | ✅ Pass | 所有 API 响应类型已有共享接口定义，无 `any`                                                                      |
| III. Unified API Response Envelope | ✅ Pass | 后端 API 已使用标准 `{code, msg, data}` 信封                                                                     |
| IV. Security-by-Default            | ✅ Pass | 后端路由已有 `authenticate` + `requireSuperAdmin` 中间件，前端无需额外实现                                       |
| V. Test-First Delivery             | ✅ Pass | 新增 Vue 组件需附带基础渲染测试                                                                                  |
| VI. Observability                  | ✅ Pass | 无新增日志需求，复用已有请求追踪                                                                                 |
| VII. Code Style & Static Analysis  | ✅ Pass | ESLint + Prettier + cspell 维持不变                                                                              |
| VIII. Micro-Frontend Discipline    | ✅ Pass | `app/frontend` 是 qiankun 主应用，不涉及子应用生命周期                                                           |
| IX. AI/LLM Integration             | N/A     | 本需求不涉及 AI                                                                                                  |
| X. Performance & Data Pipeline     | ✅ Pass | 后端已有 Redis 缓存 + 数据库索引                                                                                 |

**Gate Result**: ✅ 全部通过，无需记录违规。

## Project Structure

### Documentation (this feature)

```text
specs/001-survey-basic-stats/
├── spec.md              # 功能规格
├── plan.md              # 本文件
├── research.md          # Phase 0 — 前端图表方案选型
├── data-model.md        # Phase 1 — 数据实体与 API 响应结构
├── quickstart.md        # Phase 1 — 本地验证步骤
├── contracts/           # Phase 1 — API 契约（引用已有端点）
└── tasks.md             # Phase 2 — 由 /speckit-tasks 生成
```

### Source Code (repository root)

```text
app/frontend/src/
├── views/
│   └── statistics/
│       ├── SurveyStatisticsView.vue     # 已有 — 平台汇总页，"导出报表"按钮需接线
│       └── SurveyStatsDetailView.vue    # 新增 — 单问卷统计详情页
├── router/
│   └── routes.ts                        # 修改 — 新增 statistics/:id 路由
├── api/
│   └── modules/
│       └── survey/
│           └── index.ts                 # 已有 — exportResponses() API 函数无需改动
└── [无需修改其他文件]

app/q-server/src/modules/survey/survey-stats/
├── survey-stats.service.ts   # 已有 — 聚合引擎 + CSV 导出
├── survey-stats.routes.ts    # 已有 — 4 个 API 端点
└── survey-stats.schemas.ts   # 已有 — Zod 校验

packages/common/src/survey/
└── survey-stats.interface.ts  # 已有 — 共享类型定义
```

**Structure Decision**: 单一 Web 应用结构，仅在 `app/frontend/src/views/statistics/` 新增一个 Vue 组件，路由文件增加一行配置。后端和公共类型均无需改动。

## Complexity Tracking

无违规，无需记录。
