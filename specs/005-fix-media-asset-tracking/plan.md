# Implementation Plan: 修复物料管理模块上传追踪缺失

**Branch**: `005-fix-media-asset-tracking` | **Date**: 2026-07-19 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/005-fix-media-asset-tracking/spec.md`

## Summary

修复低代码问卷平台物料管理模块的三条上传路径追踪缺失，消除管理员管理盲区。核心变更： (1) survey-engine PicItem 从遗留接口切换到追踪接口；(2) q-editor PicItem 消除问卷未同步时的降级逻辑；(3) 头像物料登记从不靠谱的 fire-and-forget 改为同步可靠登记；(4) 管理员可强制删除不合规头像并自动清空 UserProfile.avatar_url；(5) 封装 AvatarDisplay 共享组件统一全平台头像兜底展示；(6) 物料管理页面新增 file_type 单选筛选器。

## Technical Context

**Language/Version**: TypeScript 5.9 (strict), Node ≥22.17, Vue 3.5

**Primary Dependencies**: Fastify 5, Prisma 7 (PostgreSQL), Zod v4, Arco Design Vue, Element Plus, MinIO SDK, Vitest

**Storage**: PostgreSQL (media_assets 表), MinIO (图片对象存储)

**Testing**: Vitest (q-server `src/spec/`, frontend/q-editor), Vue Test Utils

**Target Platform**: Linux server (backend Fastify), Web browser (frontend/q-editor/survey-engine)

**Project Type**: Monorepo web application (pnpm workspaces)

**Performance Goals**: 图片上传响应 <3s, 物料列表查询 <500ms (分页 20 条), 头像兜底渲染无额外网络请求

**Constraints**: 必须复用已有 MinIO 上传工具函数、统一响应信封 `{code, msg, data}`、符合 monorepo 模块边界原则 (Principle I)

**Scale/Scope**: 4 个 TypeScript 包、5 条上传路径修改、~10 个前端头像展示位替换、3 个后端 Service 修改

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                                        | Status  | Notes                                                                                                            |
| ------------------------------------------------ | :-----: | ---------------------------------------------------------------------------------------------------------------- |
| I. Monorepo Module Boundary Integrity            | ✅ PASS | AvatarDisplay 放在 `packages/common/src/components/` 遵循跨包共享规则；survey-engine 上传逻辑通过 API 层路径引用 |
| II. Strict Type Safety & Schema-First Validation | ✅ PASS | Zod schema 更新 (`survey_id` 可选, `file_type` 枚举扩展)；前端 API 类型同步更新                                  |
| III. Unified API Contract & Response Envelope    | ✅ PASS | 所有修改沿用 `{code, msg, data}` 信封，不做新格式                                                                |
| IV. Security-by-Default                          | ✅ PASS | 上传接口保持 authenticate + MIME 校验 + 大小限制；AvatarDisplay 无安全敏感操作                                   |
| V. Test-First / Test-Adequate Delivery           | ✅ PASS | 已有单测覆盖需补充：avatar force-delete、PicItem upload without survey_id、file_type filter                      |
| VI. Observability & Structured Logging           | ✅ PASS | FR-005 明确要求物料登记失败时记录 warn/error 日志                                                                |
| VII. Code Style & Static Analysis                | ✅ PASS | ESLint/Prettier/cspell 通过 pre-commit gate                                                                      |
| VIII. Micro-Frontend & Cross-App Integration     | ✅ PASS | AvatarDisplay 放 `packages/common` 同时被 frontend (host) 和 q-editor (sub-app) 引用                             |
| IX. AI/LLM Integration Governance                |   N/A   | 本需求不涉及 AI/LLM                                                                                              |
| X. Performance & Data Pipeline Integrity         | ✅ PASS | 无 N+1 查询风险；PicItem 上传与现有逻辑共享 `mediaAsset.create`                                                  |

**Gate Result**: ALL CLEAR — 无违规项，无需填写 Complexity Tracking。

## Project Structure

### Documentation (this feature)

```text
specs/005-fix-media-asset-tracking/
├── plan.md              # 本文件
├── spec.md              # 功能规格说明书
├── research.md          # 技术研究（Phase 0 产出）
├── data-model.md        # 数据模型设计（Phase 1 产出）
├── quickstart.md        # 快速验证指南（Phase 1 产出）
├── contracts/           # API 契约（Phase 1 产出）
│   └── upload-tracking-fix-api.md
├── checklists/
│   └── requirements.md  # 质量检查清单
└── tasks.md             # 实施任务（/speckit-tasks 产出，本阶段不创建）
```

### Source Code (repository root)

```text
# 后端 — Fastify + Prisma
app/q-server/
├── src/
│   ├── modules/
│   │   ├── media-asset/
│   │   │   ├── media-asset.service.ts        # [MODIFY] 头像删除改为强制删除模式
│   │   │   ├── media-asset.routes.ts         # [MODIFY] deleteMediaAsset 路由适配
│   │   │   └── media-asset.schemas.ts        # [MODIFY] 新增 file_type 查询参数
│   │   ├── survey/
│   │   │   ├── file/
│   │   │   │   ├── file.service.ts           # [MODIFY] survey_id 可选 + 回填方法
│   │   │   │   └── file.schemas.ts           # [MODIFY] survey_id schema 改为可选
│   │   │   └── upload/
│   │   │       └── upload.routes.ts          # [MODIFY] survey-file/upload 接受 null survey_id
│   │   └── user/
│   │       └── profile/
│   │           └── avatar.service.ts          # [MODIFY] fire-and-forget → 同步等待物料登记
│   └── spec/
│       └── media-asset/
│           └── media-asset.service.spec.ts    # [MODIFY] 新增头像强制删除 + file_type 筛选测试
├── prisma/
│   ├── schema.prisma                          # [VERIFY] FileType 枚举含 user_avatar
│   └── migrations/
│       └── 20260719120000_*/migration.sql     # [VERIFY] 迁移已含 ALTER TYPE ADD user_avatar

# 前端 — 管理后台 (qiankun host)
app/frontend/
└── src/
    ├── views/
    │   └── media-asset-management/
    │       └── MediaAssetManagementView.vue    # [MODIFY] 新增 file_type 下拉筛选器
    └── api/
        └── modules/
            └── media-asset/
                └── index.ts                   # [MODIFY] MediaAssetListQuery 增加 file_type

# 编辑器子应用 (qiankun sub-app)
app/q-editor/
└── src/
    ├── components/
    │   └── SurveyComs/
    │       ├── Common/
    │       │   └── PicItem.vue               # [MODIFY] 移除降级逻辑，始终用追踪接口
    │       └── Materials/
    │           └── AdvancedComs/
    │               └── Signature.vue          # [NO CHANGE] 签名已正常追踪
    └── api/
        └── upload.ts                          # [NO CHANGE] 接口不变

# 渲染引擎 (问卷填答前端)
packages/survey-engine/
└── src/
    ├── api/
    │   └── upload.ts                          # [MODIFY] 新增 uploadSurveyFile 函数
    └── components/
        └── SurveyComs/
            └── Common/
                └── PicItem.vue               # [MODIFY] 从 uploadImage 切换到 uploadSurveyFile

# 共享组件 (跨 frontend/q-editor)
packages/common/
└── src/
    └── components/
        └── AvatarDisplay.vue                  # [NEW] 共享头像展示组件

# 共享类型
packages/common/
└── src/
    ├── media-asset/
    │   └── media-asset.interface.ts           # [VERIFY] FileType 含 user_avatar
    └── survey/
        └── survey-file.interface.ts           # [VERIFY] 类型定义完整
```

**Structure Decision**: 遵循现有 monorepo 三层结构 — 后端逻辑在 `app/q-server/src/modules/`，前端页面在 `app/frontend/` 和 `app/q-editor/`，跨包共享组件在 `packages/common/`。AvatarDisplay 放在 `packages/common/src/components/` 以同时被 frontend (host) 和 q-editor (sub-app) 引用，符合 Principle VIII 的微前端集成约束。

## Complexity Tracking

> 无违规项，无需填写。
