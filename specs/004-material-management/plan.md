# Implementation Plan: 物料（图片资源）管理模块

**Branch**: `004-material-management` | **Date**: 2026-07-19 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-material-management/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

为系统管理员提供一个跨越全平台（问卷题目图片、签名图片、用户头像等）的图片资源统一管理入口：可浏览/筛选全部物料、删除（存在有效引用时阻止）、更新元信息、直接上传新物料，并为每条物料维护一个审核状态（待审核/已通过/已驳回）及其变更审计记录，为后续接入自动化审核 Agent 预留接口层。技术方案：扩展 q-server 现有的 `SurveyFile` 模型（重命名为 `MediaAsset` 并新增审核相关字段），新建独立的 `media-asset` 后端模块（复用既有 `authenticate`+`requireSuperAdmin` 鉴权、Zod 校验、MinIO 插件、审计日志），前端在 `app/frontend` 新增一个仅管理员可见的路由页面，复用既有的路由守卫、Arco Design Vue 组件与设计令牌。

## Technical Context

**Language/Version**: TypeScript 5.9（`strict`，后端 NodeNext ESM）；Node ≥22.17

**Primary Dependencies**: 后端 —— Fastify 5、Prisma 7（PostgreSQL）、Zod v4、MinIO SDK、ioredis；前端 —— Vue 3.5、Arco Design Vue、Pinia 3、Vue Router 4、Axios

**Storage**: PostgreSQL（物料元数据、审核状态与变更记录，经 Prisma）；MinIO（图片文件本体，复用现有 bucket 与上传封装）

**Testing**: 后端 Vitest（`src/spec/media-asset/**/*.spec.ts`，与既有 `src/spec/review/`、`src/spec/survey/` 目录约定一致）；前端 Vitest + `@vue/test-utils`（仅覆盖非纯展示逻辑，如筛选参数拼装、批量操作结果归并）

**Target Platform**: 现有 Web 管理后台（`app/frontend`，浏览器）+ 现有 Node.js API 服务（`app/q-server`）

**Project Type**: Web application（既有 backend + frontend 双侧扩展，不新增独立服务）

**Performance Goals**: 与现有同量级管理员列表接口一致（分页查询，无特殊吞吐目标）；不引入新的性能敏感路径

**Constraints**:

- 必须复用既有 `authenticate` + `requireSuperAdmin` 中间件，不新建权限校验逻辑（宪法 Principle IV）
- 必须复用统一响应信封 `{code,msg,data}`（宪法 Principle III）
- 图片上传必须复用现有 MIME/大小校验规则（`upload.routes.ts` 已有的 10MB 与图片类型白名单），不引入不一致的新限制
- 不得新建与 `SurveyFile` 并行、职责重叠的第二张文件登记表（宪法 Principle I，避免跨模块重复/漂移的逻辑）

**Scale/Scope**: 覆盖平台当前及未来全部图片资源（问卷题目图片、签名图片、问卷封面图预留位、用户头像），预期规模与现有问卷/用户规模同阶（管理员分页浏览，非高并发场景）

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| 原则                                                    | 判定 | 说明                                                                                                                                                                                                                                            |
| ------------------------------------------------------- | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I. Monorepo Module Boundary Integrity                   | PASS | 新功能完全落在 `app/q-server`（新模块 `src/modules/media-asset/`）与 `app/frontend`（新路由页面）内部，不跨包直接引用彼此 `src/`；不新建与 `SurveyFile` 重复的并行表，而是扩展现有模型（见 research.md 决策 1），符合"避免重复漂移逻辑"的要求。 |
| II. Strict Type Safety & Schema-First Validation        | PASS | 后端路由输入用 Zod schema 校验；前端消费的响应类型在 `frontend/src/api/modules/media-asset/` 本地声明并与后端信封保持一致，不使用 `any`。                                                                                                       |
| III. Unified API Contract & Response Envelope           | PASS | 所有新接口使用现有 `{code,msg,data}` 响应插件封装；分页遵循平台既有分页信封惯例；错误码从集中枚举取值，不在路由里写裸数字。                                                                                                                     |
| IV. Security-by-Default                                 | PASS | 复用 `authenticate`+`requireSuperAdmin`；上传复用既有 MIME/大小服务端校验；审核状态变更接口的鉴权对人类管理员与未来自动化调用方一视同仁（均需持有管理员级 JWT 或未来的内部服务 Key），不开无鉴权旁路。                                          |
| V. Test-First / Test-Adequate Delivery                  | PASS | 新 service 方法随 PR 附带单元测试；前端 UI 改动在本地 dev server 手工验证（含至少一个边界场景：删除被引用物料的阻止提示）。                                                                                                                     |
| VI. Observability & Structured Logging                  | PASS | 后端使用现有 `request.log`/审计日志（`createAuditLog`）记录创建/更新/删除/审核状态变更，不引入 `console.log`。                                                                                                                                  |
| VII. Code Style & Static Analysis Compliance            | PASS | 遵循根 ESLint/Prettier/cspell 配置，不引入竞争性 lint 规则。                                                                                                                                                                                    |
| VIII. Micro-Frontend & Cross-App Integration Discipline | N/A  | 本功能不改动 qiankun 生命周期、路由 base 解析或跨应用共享的设计令牌；纯粹是 `app/frontend` 内部新增一个管理员路由页面。                                                                                                                         |
| IX. AI/LLM Integration Governance                       | N/A  | 本功能只预留审核状态的读写与鉴权接口，不实现任何实际的 LLM/Agent 调用逻辑，故不适用该原则的 Provider/超时/流式事件等约束；未来审核 Agent 落地时需单独评估。                                                                                     |
| X. Performance & Data Pipeline Integrity                | PASS | 不涉及 ClickHouse/埋点管道；新增查询字段（`review_status` 等）按现有 `SurveyFile` 索引惯例补充复合索引，避免全表扫描。                                                                                                                          |

无需 Complexity Tracking（见下节，未引入违反宪法门禁的复杂度）。

## Project Structure

### Documentation (this feature)

```text
specs/004-material-management/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
app/q-server/
├── prisma/
│   └── schema.prisma                        # SurveyFile → MediaAsset 重命名+扩展字段的迁移
├── src/
│   ├── modules/
│   │   ├── media-asset/                     # 新增顶层模块（与 review/template/tracking 同级）
│   │   │   ├── media-asset.routes.ts        # 挂载于 /admin/media-assets
│   │   │   ├── media-asset.service.ts
│   │   │   └── media-asset.schemas.ts       # Zod：列表筛选/分页、更新、状态变更、上传
│   │   ├── survey/
│   │   │   └── file/                        # 既有模块：survey_id 级联删除时同步维护 MediaAsset，不重复实现文件登记
│   │   └── user/
│   │       └── profile/
│   │           └── avatar.service.ts        # 扩展：上传成功后追加写入一条 MediaAsset 记录
│   └── routes/index.ts                      # 注册 mediaAssetRoutes，prefix "/admin"
└── src/spec/
    └── media-asset/                         # 新增单元测试目录，对齐既有 src/spec/review 等约定

app/frontend/
├── src/
│   ├── api/modules/media-asset/             # 新增：接口封装 + 响应类型声明
│   ├── router/routes.ts                     # 新增一条 requiresSuperAdmin: true 的路由
│   └── views/media-asset-management/
│       ├── MediaAssetManagementView.vue     # 列表/筛选/分页主视图
│       └── components/
│           ├── MediaAssetEditDrawer.vue     # 元信息编辑 + 审核状态变更
│           └── MediaAssetUploadDialog.vue   # 直接上传新物料
```

**Structure Decision**: 采用 Web application 结构（既有 backend + frontend 双侧扩展），不引入新的顶层项目或服务。后端新增一个与 `review`/`template`/`tracking` 同级的顶层业务模块 `media-asset`，前端新增一个仅管理员可见的路由页面，两侧均严格复用各自项目已确立的分层与组件约定，不引入新的架构模式。

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

无违反项，本节留空。
