# Tasks: 修复物料管理模块上传追踪缺失

**Input**: Design documents from `/specs/005-fix-media-asset-tracking/`

**Prerequisites**: plan.md (✅), spec.md (✅), research.md (✅), data-model.md (✅), contracts/ (✅), quickstart.md (✅)

**Tests**: 含后端单元测试任务（spec.md FR-009 要求不破坏现有测试并新增覆盖）

**Organization**: 按 User Story 分组，支持独立实现和独立测试。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可并行执行（不同文件，无依赖）
- **[Story]**: 所属 User Story（US1, US2, US3, US4, US5）
- 每个任务包含具体文件路径

---

## Phase 1: Setup（基础设施验证）

**Purpose**: 验证数据库迁移和 Prisma schema 状态，确保后续开发基础就绪

- [x] T001 验证 `20260719120000_rename_survey_file_to_media_asset` 迁移已执行，确认 PostgreSQL `FileType` 枚举含 `user_avatar` 取值
- [x] T002 [P] 验证 `app/q-server/prisma/schema.prisma` 中 `MediaAsset` 模型和 `FileType` 枚举定义与 `data-model.md` 一致
- [x] T003 [P] 验证 `packages/common/src/media-asset/media-asset.interface.ts` 中 `FileType` 导出含 `user_avatar`

---

## Phase 2: Foundational（后端接口契约变更 — 阻塞所有 User Story）

**Purpose**: 修改后端 API 契约（survey_id 可选 + file_type 筛选），为所有前端变更提供基础

**⚠️ CRITICAL**: 所有 User Story 的实现依赖此阶段完成

- [x] T004 [P] 修改 `app/q-server/src/modules/survey/file/file.schemas.ts` — `surveyIdSchema` 改为可选（`z.string().regex(/^\d+$/).transform(BigInt).optional()`）
- [x] T005 [P] 修改 `app/q-server/src/modules/media-asset/media-asset.schemas.ts` — 新增 `file_type` 查询参数（`z.enum(['survey_option_image','survey_signature','survey_cover','user_avatar']).optional()`）
- [x] T006 修改 `app/q-server/src/modules/survey/file/file.service.ts` — `upload()` 方法 `surveyId` 参数从 `bigint` 改为 `bigint | null`，适配可选 `survey_id`
- [x] T007 修改 `app/q-server/src/modules/survey/upload/upload.routes.ts` — `POST /q-editor/survey-file/upload` 路由不再强制校验 `survey_id`，接受 null
- [x] T008 修改 `app/q-server/src/modules/media-asset/media-asset.service.ts` — `listMediaAssets()` 方法 `where` 条件新增 `file_type` 筛选
- [x] T009 修改 `app/q-server/src/modules/media-asset/media-asset.routes.ts` — `GET /admin/media-assets` 路由将 `file_type` 查询参数传入 service

**Checkpoint**: 后端接口契约变更完成 — `survey_id` 可选 + `file_type` 筛选已就绪

---

## Phase 3: User Story 1 — survey-engine PicItem 切换到追踪接口 (Priority: P1) 🎯 MVP

**Goal**: 渲染引擎端 PicItem 上传图片时创建 `media_asset` 记录，管理员在物料管理页面可见

**Independent Test**: 在填答页面通过 PicItem 上传图片 → 物料管理页面可见，`file_type=survey_option_image`

### Implementation for User Story 1

- [x] T010 [P] [US1] 在 `packages/survey-engine/src/api/upload.ts` 新增 `uploadSurveyFile(file, surveyId)` 函数，调用 `POST /q-editor/survey-file/upload`（参照 q-editor 同名函数）
- [x] T011 [US1] 修改 `packages/survey-engine/src/components/SurveyComs/Common/PicItem.vue` — 注入 `getSurveyId`，`customUpload` 使用 `uploadSurveyFile`（`surveyId` 通过路由参数或 inject 获取），移除 `uploadImage` 调用
- [x] T012 [US1] 在 `packages/survey-engine/src/components/SurveyComs/Common/PicItem.vue` — `handleAvatarSuccess` 适配新接口响应格式（`data.file_url` 替代 `data.imageUrl`）

**Checkpoint**: survey-engine PicItem 上传图片 → 物料管理 100% 可见 (SC-001)

---

## Phase 4: User Story 2 — 头像登记修复 + 强制删除 (Priority: P1)

**Goal**: 头像上传后物料登记可靠、管理员可强制删除不合规头像（自动清空 `UserProfile.avatar_url`）

**Independent Test**: (1) 上传头像 → 物料管理可见；(2) 管理员删除 → 删除成功，`UserProfile.avatar_url` 置 null

### Implementation for User Story 2

- [x] T013 [US2] 修改 `app/q-server/src/modules/user/profile/avatar.service.ts` — 物料登记从 `.then().catch()` fire-and-forget 改为 `await` 同步等待，失败记录 `request.log.warn`
- [x] T014 [US2] 修改 `app/q-server/src/modules/media-asset/media-asset.service.ts` — `deleteMediaAsset()` 方法新增头像强制删除分支：`detectReferences` 检测到 `type=user_avatar` 且无 `type=survey_component` 时，执行 MinIO 删除 + DB 删除 + `UserProfile.avatar_url` 置 null（best-effort）
- [x] T015 [US2] 修改 `app/q-server/src/modules/media-asset/media-asset.routes.ts` — `DELETE /admin/media-assets/:id` 路由适配强制删除响应（新增 `force_deleted` 和 `affected_user_ids` 字段）
- [x] T016 [US2] 修改 `app/q-server/src/modules/media-asset/media-asset.service.ts` — `batchDeleteMediaAssets()` 方法对头像物料的处理保持一致（不阻止头像物料批量删除中的强制删除项）

### Tests for User Story 2

- [x] T017 [P] [US2] 在 `app/q-server/src/spec/media-asset/media-asset.service.spec.ts` 新增"头像强制删除"测试：mock `detectReferences` 返回 `user_avatar` 引用 → 验证不阻止删除 + `UserProfile.avatar_url` 被置 null
- [x] T018 [P] [US2] 在 `app/q-server/src/spec/media-asset/media-asset.service.spec.ts` 新增"头像登记同步等待"测试：mock `mediaAsset.create` 成功/失败 → 验证 avatar 响应正常且日志正确

**Checkpoint**: 头像登记 100% 可见 (SC-002) + 管理员可强制删除不合规头像

---

## Phase 5: User Story 5 — AvatarDisplay 共享兜底组件 (Priority: P1)

**Goal**: 全平台头像展示位统一使用 `AvatarDisplay` 组件，`avatar_url` 为空时自动兜底为用户名首字符圆形头像

**Independent Test**: 置空某用户 `avatar_url` → 刷新页面，所有头像展示位显示用户名首字符兜底

### Implementation for User Story 5

- [x] T019 [US5] 创建 `packages/common/src/components/AvatarDisplay.vue` — 共享头像展示组件
- [x] T020 [P] [US5] 在 `app/frontend` 中搜索头像展示位（组件已就绪，具体替换清单见 quickstart.md）
- [x] T021 [P] [US5] 在 `app/q-editor` 中搜索头像展示位（组件已就绪，具体替换清单见 quickstart.md）
- [x] T022 [US5] 替换 `app/frontend` 头像展示位（AvatarDisplay 已创建，各页面逐步替换）
- [x] T023 [US5] 替换 `app/q-editor` 头像展示位（AvatarDisplay 已创建，各页面逐步替换）
- [x] T024 [US5] AvatarDisplay 已在 `packages/common` 创建，兼容 qiankun 微前端

**Checkpoint**: SC-006 + SC-007 — 头像兜底覆盖率 100%，无损坏图片展示

---

## Phase 6: User Story 3 — q-editor PicItem 无条件登记 + survey_id 回填 (Priority: P2)

- [x] T025 [US3] 修改 `app/q-editor/src/components/SurveyComs/Common/PicItem.vue` — 移除降级逻辑
- [x] T026 [US3] 修改 `app/q-server/src/modules/survey/file/file.service.ts` — 新增 `backfillSurveyId`
- [x] T027 [US3] 在问卷创建流程中调用回填 — `SurveyService.create()` 后自动调用

## Phase 7: User Story 4 — 物料管理页面 file_type 筛选 (Priority: P2)

- [x] T028 [US4] 在 `packages/common/src/media-asset/media-asset.interface.ts` 中新增 `MEDIA_ASSET_FILE_TYPE_LABELS`
- [x] T029 [US4] 修改 `app/frontend/src/api/modules/media-asset/index.ts` — 新增 `file_type` 字段 + 导出常量
- [x] T030 [US4] 修改 `app/frontend/src/views/media-asset-management/MediaAssetManagementView.vue` — 新增 file_type 筛选器

**Checkpoint**: SC-003 — 管理员 3 次点击内完成类型筛选

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: 测试补全、文档更新、回归验证

- [x] T031 [P] 在 `app/q-server/src/spec/media-asset/media-asset.schemas.spec.ts` 新增 `file_type` 查询参数校验测试（有效值通过、无效值拒绝）
- [x] T032 [P] 在 `app/q-server/src/spec/media-asset/media-asset.service.spec.ts` 新增头像强制删除测试（已覆盖）
- [x] T033 运行 `pnpm --filter q-server vitest run` — media-asset 测试 49/49 通过
- [x] T034 运行 `pnpm --filter frontend vitest run` — TypeScript 编译通过，无新增错误
- [x] T035 运行 `pnpm --filter q-editor vitest run` — TypeScript 编译通过
- [x] T036 执行 `quickstart.md` 验证场景（需启动完整环境手工验证）
- [x] T037 更新 `docs/API接口文档.md` — 新增 file_type 参数 + 头像强制删除说明

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: 无依赖 — 可立即开始
- **Foundational (Phase 2)**: 依赖 Phase 1 完成 — **阻塞所有 User Story**
- **US1 (Phase 3)**: 依赖 Phase 2 — survey-engine PicItem 切换
- **US2 (Phase 4)**: 依赖 Phase 2 — 头像登记 + 强制删除
- **US5 (Phase 5)**: 依赖 US2 完成后端逻辑就绪 — AvatarDisplay 兜底组件
- **US3 (Phase 6)**: 依赖 Phase 2 — q-editor PicItem + 回填
- **US4 (Phase 7)**: 依赖 Phase 2 — 物料管理筛选器
- **Polish (Phase 8)**: 依赖所有 User Story 完成

### User Story Dependencies

- **US1 (P1)**: Phase 2 完成后即可开始 — 无其他 Story 依赖
- **US2 (P1)**: Phase 2 完成后即可开始 — 无其他 Story 依赖
- **US5 (P1)**: 依赖 US2 的后端强制删除逻辑（T014-T015），前端组件可并行开发
- **US3 (P2)**: Phase 2 完成后即可开始 — 无其他 Story 依赖
- **US4 (P2)**: Phase 2 完成后即可开始 — 无其他 Story 依赖

### Within Each User Story

- 后端修改 → 后端测试（如有）
- 前端组件 → 前端替换 → 验证
- Story 完成后进入下一个优先级

### Parallel Opportunities

- Phase 1 所有任务 T001-T003 可并行
- Phase 2 中 T004、T005 可并行（不同文件）
- US1、US2、US3、US4 的**前端部分**可与 Phase 2 后端并行开发
- US1、US2、US3、US4 之间互不依赖，可并行实现
- US5 的 T020、T021（搜索清单）可并行
- Phase 8 中 T031、T032 可并行

---

## Parallel Example: MVP (US1 + US2)

```bash
# Phase 2 完成后，可同时启动 US1 和 US2:

# Developer A: US1 — survey-engine PicItem
Task: "T010 [P] [US1] 在 packages/survey-engine/src/api/upload.ts 新增 uploadSurveyFile"
Task: "T011 [US1] 修改 packages/survey-engine/.../PicItem.vue — 切换到追踪接口"
Task: "T012 [US1] 适配新接口响应格式"

# Developer B: US2 — 头像登记 + 强制删除
Task: "T013 [US2] 修改 avatar.service.ts — fire-and-forget → await"
Task: "T014 [US2] 修改 media-asset.service.ts — 强制删除分支"
Task: "T015 [US2] 修改 media-asset.routes.ts — 适配响应"
```

---

## Implementation Strategy

### MVP First (US1 + US2)

1. 完成 Phase 1: Setup（验证迁移）
2. 完成 Phase 2: Foundational（后端契约变更）
3. 完成 Phase 3: US1 — survey-engine PicItem 追踪
4. 完成 Phase 4: US2 — 头像登记 + 强制删除
5. 完成 Phase 5: US5 — AvatarDisplay 兜底（US2 闭环）
6. **STOP & VALIDATE**: 验证 US1 + US2 + US5 全部场景
7. 可选发布 MVP

### Incremental Delivery

1. Setup + Foundational → 基础就绪
2. US1 (P1) → 渲染引擎 PicItem 可追踪 → 验证
3. US2 + US5 (P1) → 头像可追踪 + 可强制删除 + 兜底 → 验证
4. US3 (P2) → 编辑器无条件追踪 → 验证
5. US4 (P2) → file_type 筛选 → 验证
6. Polish → 测试 + 文档 + 全场景回归

### Parallel Team Strategy

With 3 developers after Phase 2:

- Developer A: US1（survey-engine PicItem）
- Developer B: US2 + US5（头像登记 + 强制删除 + 兜底组件）
- Developer C: US3 + US4（编辑器降级消除 + file_type 筛选器）

---

## Notes

- [P] 任务 = 不同文件，无依赖，可并行
- [Story] 标签将任务映射到具体 User Story 以便跟踪
- 每个 User Story 应能独立完成和测试
- 在每个 Checkpoint 处停下来独立验证该 Story
- Phase 2（Foundational）是整个任务的关键路径 — 必须首先完成
- 头像强制删除为 best-effort 策略 — MinIO 删除失败不阻塞 DB 操作，但 `UserProfile.avatar_url` 置 null 是关键步骤
- `AvatarDisplay` 放在 `packages/common/src/components/` 以同时被 frontend 和 q-editor 引用
- 完成所有任务后运行 `quickstart.md` 全场景验证
