---
description: "Task list template for feature implementation"
---

# Tasks: 物料（图片资源）管理模块

**Input**: Design documents from `/specs/004-material-management/`

**Prerequisites**: [plan.md](./plan.md)（必需）、[spec.md](./spec.md)（必需，用户故事）、[research.md](./research.md)、[data-model.md](./data-model.md)、[contracts/media-assets-api.md](./contracts/media-assets-api.md)、[quickstart.md](./quickstart.md)

**Tests**: 本功能的原始需求与项目宪法 Principle V 均明确要求单元测试覆盖，故本任务列表包含测试任务（非可选）。

**Organization**: 任务按用户故事分组，确保每个故事可独立实现与验证。

## Format: `[ID] [P?] [Story] Description`

- **[P]**：可与其他 [P] 任务并行执行（不同文件、无依赖）
- **[Story]**：任务所属用户故事（US1/US2/US3/US4），仅用户故事阶段任务需要此标签
- 路径均为相对仓库根目录

## Path Conventions（Web application：backend + frontend）

- 后端：`app/q-server/src/`
- 前端：`app/frontend/src/`
- 共享包：`packages/common/src/`

---

## Phase 1: Setup（共享脚手架）

**Purpose**: 建立本功能的文件骨架，不涉及业务逻辑

- [x] T001 创建后端模块骨架文件 `app/q-server/src/modules/media-asset/media-asset.routes.ts`、`media-asset.service.ts`、`media-asset.schemas.ts`（空实现，仅导出占位符，供后续任务填充）
- [x] T002 [P] 创建前端接口封装骨架 `app/frontend/src/api/modules/media-asset/index.ts`（含响应类型声明文件，暂为空）
- [x] T003 [P] 创建前端页面骨架 `app/frontend/src/views/media-asset-management/MediaAssetManagementView.vue`、`components/MediaAssetEditDrawer.vue`、`components/MediaAssetUploadDialog.vue`（空组件占位）
- [x] T004 [P] 在集中业务错误码枚举中新增本模块专属错误码（见 [contracts/media-assets-api.md](./contracts/media-assets-api.md) "错误码约定"一节：删除时存在有效引用、上传非图片类型），具体文件位置参照现有 `StatusCode`/`BizCode` 枚举所在文件

**Checkpoint**：骨架文件就位，可开始 Phase 2

---

## Phase 2: Foundational（阻塞性前置任务）

**Purpose**: 所有用户故事都依赖的数据模型变更与共享能力，必须先完成

**⚠️ CRITICAL**：本阶段完成前，任何用户故事均不可开始

- [x] T005 修改 `app/q-server/prisma/schema.prisma`：将 `SurveyFile` 模型重命名为 `MediaAsset`（`@@map("media_assets")`），新增字段 `resource_type String @default("image")`、`review_status ReviewStatus @default(pending)`、`reviewed_by BigInt?`、`reviewed_at DateTime?`、`review_comment String? @db.Text`、`updated_at DateTime @updatedAt`；`FileType` 枚举新增 `user_avatar`；新增索引 `@@index([review_status])`、`@@index([user_id, review_status])`；同步更新 `User`/`Survey` 模型上原 `survey_files SurveyFile[]`/`files SurveyFile[]` 关联字段名为 `media_assets MediaAsset[]`，并在 `User` 上新增反向关联 `reviewed_media_assets MediaAsset[] @relation("MediaAssetReviewer")`（详见 [data-model.md](./data-model.md)）
- [ ] T006 基于 T005 生成并执行 Prisma 迁移（`pnpm --filter q-server prisma migrate dev`），迁移脚本中为存量数据补充 `review_status = 'pending'` 默认值（历史数据不留 `none`）
  > **部分完成**：本地环境无法连接实际 PostgreSQL（`.env` 中的凭据鉴权失败），未能真正执行迁移。已改用 `prisma migrate diff` 生成结构对比、发现其默认会将表重命名误判为"删表重建"导致数据丢失的风险后，改为手写安全迁移 SQL（`prisma/migrations/20260719120000_rename_survey_file_to_media_asset/migration.sql`，用 `RENAME TABLE`/`RENAME CONSTRAINT`/`RENAME INDEX` 保留存量数据），并已用 `prisma generate`（不需要数据库连接）验证 schema 本身语法正确、生成的 TS 类型可用。**待有真实数据库连接时需执行 `pnpm --filter q-server prisma migrate deploy` 并核实存量数据完整保留。**
- [x] T007 更新现有引用了 `SurveyFile` 模型的全部源码文件以适配重命名：`app/q-server/src/modules/survey/file/file.routes.ts`、`app/q-server/src/modules/survey/file/file.service.ts`、`app/q-server/src/modules/survey/index.ts`、`app/q-server/src/modules/survey/survey-crud/survey-crud.service.ts`、`app/q-server/src/modules/survey/upload/upload.routes.ts`（Prisma 调用改为 `fastify.prisma.mediaAsset`，字段/关联引用同步更名）
- [x] T008 [P] 更新 `packages/common/src/survey/survey-file.interface.ts` 中的 `FileType` 类型联合，新增 `"user_avatar"`，保持与 Prisma `FileType` 枚举同步
- [x] T009 在 `app/q-server/src/modules/media-asset/media-asset.service.ts` 中实现共享的引用检测函数 `detectReferences(fileUrl)`：扫描未软删除且状态为草稿/发布的 `Survey.components[].config`（JSON）是否包含该 `fileUrl`，并检查 `UserProfile.avatar_url`/`User.avatar_url` 是否等于该 `fileUrl`，返回引用来源列表（供 US1 详情与 US2 删除保护复用）
- [x] T010 [P] 在 `app/q-server/src/routes/index.ts` 中注册 `mediaAssetRoutes`，挂载前缀 `/admin`（对应最终路径 `/api/admin/media-assets`）
- [x] T011 [P] 扩展 `app/q-server/src/modules/user/profile/avatar.service.ts`：头像上传成功、更新 `UserProfile.avatar_url` 的同一流程中，追加创建一条 `MediaAsset` 记录（`resource_type="image"`、`file_type="user_avatar"`、`user_id` 关联、`survey_id` 为空）
- [x] T012 [P] 在 `app/frontend/src/router/routes.ts` 的"系统管理"分组下新增路由 `/media-assets`（`name: "mediaAssetManagement"`，`component: () => import("../views/media-asset-management/MediaAssetManagementView.vue")`，`meta: { title: "物料管理", icon: "image", requiresSuperAdmin: true }`）

**Checkpoint**：数据模型与共享基础设施就位，四个用户故事均可开始（可并行）

---

## Phase 3: User Story 1 - 管理员浏览全平台物料资产 (Priority: P1) 🎯 MVP

**Goal**：管理员可在统一界面查看平台全部图片物料，并按用户/问卷/审核状态筛选；非管理员访问被拒绝

**Independent Test**：以管理员账号登录，进入物料管理页面，能看到系统中已存在的图片资源列表（覆盖问卷题目图片、签名图片、用户头像），并能按用户/问卷/状态筛选；以普通用户账号访问同一页面/接口被拒绝

### Tests for User Story 1

- [x] T013 [P] [US1] 单测：`listMediaAssets()` 按 `user_id`/`survey_id`/`review_status`/`keyword` 组合筛选与分页正确性，位于 `app/q-server/src/spec/media-asset/media-asset.service.spec.ts`
- [x] T014 [P] [US1] 单测：非管理员/未登录调用 `GET /admin/media-assets`、`GET /admin/media-assets/:id` 均返回 403/401 且 `data:null`，位于 `app/q-server/src/spec/media-asset/media-asset.routes.spec.ts`

### Implementation for User Story 1

- [x] T015 [US1] 在 `app/q-server/src/modules/media-asset/media-asset.schemas.ts` 中定义列表查询参数 Zod schema（`page`/`pageSize`/`userId`/`surveyId`/`reviewStatus`/`resourceType`/`keyword`）
- [x] T016 [US1] 在 `media-asset.service.ts` 中实现 `listMediaAssets(query)`（分页查询，返回 `{list,total,page,pageSize}`）（依赖 T005-T007）
- [x] T017 [US1] 在 `media-asset.service.ts` 中实现 `getMediaAssetById(id)`（附加调用 T009 的 `detectReferences` 返回 `references` 字段）
- [x] T018 [US1] 在 `media-asset.routes.ts` 中实现 `GET /admin/media-assets`、`GET /admin/media-assets/:id`，挂载 `authenticate`+`requireSuperAdmin` 前置处理器
- [x] T019 [P] [US1] 在 `app/frontend/src/api/modules/media-asset/index.ts` 中实现 `getMediaAssetList()`、`getMediaAssetDetail()` 及对应响应 TS 类型
- [x] T020 [US1] 实现 `MediaAssetManagementView.vue`：列表表格（缩略图/所属对象/上传时间/审核状态）、按用户/问卷/状态的筛选表单、分页组件（复用既有 Arco Design Vue 表格与本项目设计令牌）

**Checkpoint**：User Story 1 完整可独立验证（浏览+权限拒绝），可作为 MVP 交付

---

## Phase 4: User Story 2 - 管理员删除物料 (Priority: P2)

**Goal**：管理员可删除物料并同步清理底层文件；仍被引用的物料删除被阻止并明确提示引用来源；批量删除明确报告成功/失败

**Independent Test**：删除一条未被引用的物料成功且文件失效；删除一条仍被引用的物料被拒绝并提示引用来源；批量删除混合结果被分别报告

### Tests for User Story 2

- [x] T021 [P] [US2] 单测：`deleteMediaAsset()` 对存在有效引用的物料返回阻止结果及引用列表，位于 `app/q-server/src/spec/media-asset/media-asset.service.spec.ts`
- [x] T022 [P] [US2] 单测：`batchDeleteMediaAssets()` 混合成功/失败场景下 `succeeded`/`failed` 列表正确归并，位于同一测试文件

### Implementation for User Story 2

- [x] T023 [US2] 在 `media-asset.service.ts` 中实现 `deleteMediaAsset(id, operatorId)`：先调用 `detectReferences`，存在引用则返回 409 语义的错误结果；否则清理 MinIO 文件（复用现有 MinIO 插件删除方法）、删除数据库记录、写入 `AuditLog`（`action: "media_asset.delete"`）
- [x] T024 [US2] 在 `media-asset.service.ts` 中实现 `batchDeleteMediaAssets(ids, operatorId)`：逐项调用 `deleteMediaAsset`，汇总 `succeeded`/`failed`（含失败原因与引用详情）
- [x] T025 [US2] 在 `media-asset.schemas.ts` 中新增批量删除请求体 Zod schema（`{ ids: string[] }`）；在 `media-asset.routes.ts` 中实现 `DELETE /admin/media-assets/:id`、`POST /admin/media-assets/batch-delete`
- [x] T026 [P] [US2] 在前端 `api/modules/media-asset/index.ts` 中实现 `deleteMediaAsset()`、`batchDeleteMediaAssets()`
- [x] T027 [US2] 在 `MediaAssetManagementView.vue` 中新增：单条删除按钮+二次确认对话框（409 时展示具体引用来源）、多选批量删除入口与成功/失败结果分栏展示

**Checkpoint**：User Story 1+2 均可独立验证

---

## Phase 5: User Story 3 - 管理员更新物料信息与审核状态 (Priority: P3)

**Goal**：管理员可更新物料元信息（不可替换文件本体）；可查看/变更审核状态并留存操作人与时间；状态变更不影响物料原有展示；变更能力不假定调用者必为人工

**Independent Test**：更新分类等元信息即时生效；将审核状态改为已通过/已驳回后记录操作人与时间；已驳回物料在原引用问卷中仍正常展示；模拟非前端客户端直接调用状态变更接口同样成功

### Tests for User Story 3

- [x] T028 [P] [US3] 单测：`updateMediaAsset()` 请求体包含 `fileUrl`/`fileKey` 时被 Zod schema 拦截返回 400，位于 `app/q-server/src/spec/media-asset/media-asset.schemas.spec.ts`
- [x] T029 [P] [US3] 单测：`changeReviewStatus()` 在 pending/approved/rejected 之间任意方向转换均成功，且正确写入 `reviewedBy`/`reviewedAt`/`reviewComment` 与一条 `AuditLog`，位于 `app/q-server/src/spec/media-asset/media-asset.service.spec.ts`

### Implementation for User Story 3

- [x] T030 [US3] 在 `media-asset.schemas.ts` 中定义更新元信息 Zod schema（仅允许 `resourceType`/`surveyId`，显式排除 `fileUrl`/`fileKey`）与审核状态变更 Zod schema（`{ reviewStatus, comment? }`）
- [x] T031 [US3] 在 `media-asset.service.ts` 中实现 `updateMediaAsset(id, data)`（仅更新元信息字段，写入 `AuditLog action: "media_asset.update"`）
- [x] T032 [US3] 在 `media-asset.service.ts` 中实现 `changeReviewStatus(id, reviewStatus, comment, operatorId)`（无前置状态限制，任意互转；写入 `reviewedBy`/`reviewedAt`/`reviewComment`；追加 `AuditLog action: "media_asset.review_status_change"`，`details: {fromStatus,toStatus,comment}`）
- [x] T033 [US3] 在 `media-asset.routes.ts` 中实现 `PUT /admin/media-assets/:id`、`PUT /admin/media-assets/:id/review-status`
- [x] T034 [P] [US3] 在前端 `api/modules/media-asset/index.ts` 中实现 `updateMediaAsset()`、`changeReviewStatus()`
- [x] T035 [US3] 实现 `MediaAssetEditDrawer.vue`：元信息编辑表单 + 审核状态下拉（待审核/已通过/已驳回）+ 审核意见输入框 + 展示最近一次 `reviewedBy`/`reviewedAt`

**Checkpoint**：User Story 1+2+3 均可独立验证

---

## Phase 6: User Story 4 - 管理员直接上传新物料 (Priority: P4)

**Goal**：管理员可在物料管理页面直接上传图片；非图片类型上传被拒绝并给出明确提示

**Independent Test**：上传图片文件成功并出现在列表（审核状态默认待审核）；上传非图片文件被拒绝并提示"当前阶段仅支持图片类型文件"

### Tests for User Story 4

- [x] T036 [P] [US4] 单测：`uploadMediaAsset()` 对非图片 MIME 类型返回拒绝结果，位于 `app/q-server/src/spec/media-asset/media-asset.service.spec.ts`
- [x] T037 [P] [US4] 单测：`uploadMediaAsset()` 成功场景创建的记录 `reviewStatus` 默认为 `pending`，位于同一测试文件

### Implementation for User Story 4

- [x] T038 [US4] 在 `media-asset.service.ts` 中实现 `uploadMediaAsset(fileBuffer, meta, operatorId)`：复用 `packages/common/src/survey/survey-file.interface.ts` 中的 `ALLOWED_IMAGE_TYPES`/`MAX_FILE_SIZE` 校验常量与现有 MinIO 上传封装，创建 `MediaAsset` 记录（`reviewStatus` 默认 `pending`），写入 `AuditLog action: "media_asset.create"`
- [x] T039 [US4] 在 `media-asset.routes.ts` 中实现 `POST /admin/media-assets/upload`（`multipart/form-data`，复用现有文件大小 `bodyLimit` 约定）
- [x] T040 [P] [US4] 在前端 `api/modules/media-asset/index.ts` 中实现 `uploadMediaAsset()`
- [x] T041 [US4] 实现 `MediaAssetUploadDialog.vue`：文件选择器 + 可选关联问卷字段 + 非图片类型错误提示展示

**Checkpoint**：全部四个用户故事均可独立验证

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**：跨故事的收尾工作

- [ ] T042 按 [quickstart.md](./quickstart.md) 的 4 个验证场景在本地开发环境手工走查一遍，确认与预期一致
  > **未执行**：同 T006，本地无可用数据库连接，无法启动 q-server 连接真实 PostgreSQL/MinIO 走完整端到端流程。已通过单元测试（45 个，覆盖 4 个故事的核心行为）+ 权限门禁集成测试（真实 Fastify 实例 + 真实 JWT，覆盖 401/403/200 三种路径）+ 全项目编译与 lint 通过作为替代验证。**待具备数据库/对象存储连接的环境后需补跑本场景。**
- [x] T043 [P] 根目录执行 `pnpm lint:all` 与 `app/q-server`、`app/frontend` 各自的 `pnpm type-check`，确认无新增报错
- [x] T044 在 `docs/API接口文档.md` 中补充本模块 7 个接口的文档条目（对应宪法 Principle III"每个新增/修改的 REST 接口必须在同一 PR 内同步更新接口文档"的要求）
- [x] T045 复核 SC-002：对全部 7 个接口逐一验证非管理员/未登录访问一致返回 403/401 且不泄露数据，作为安全回归检查收尾

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup（Phase 1）**：无依赖，可立即开始
- **Foundational（Phase 2）**：依赖 Setup 完成；**阻塞**全部用户故事
- **User Stories（Phase 3-6）**：均依赖 Foundational 完成；四个故事之间相互独立，可并行或按 P1→P2→P3→P4 顺序推进
- **Polish（Phase 7）**：依赖希望交付的全部用户故事完成

### User Story Dependencies

- **US1（P1）**：仅依赖 Foundational，无其他故事依赖
- **US2（P2）**：仅依赖 Foundational（复用 T009 的引用检测函数），不依赖 US1 的实现代码即可独立测试，但典型使用路径上通常先浏览（US1）再删除
- **US3（P3）**：仅依赖 Foundational
- **US4（P4）**：仅依赖 Foundational

### Within Each User Story

- 先写测试（T0xx 测试任务），确认失败后再实现
- Schema（Zod）→ Service → Routes → 前端 API 封装 → 前端组件
- 故事内实现完成后才进入下一优先级故事

### Parallel Opportunities

- Phase 1 全部 [P] 任务（T002-T004）可并行
- Phase 2 中 T008、T010、T011、T012 可并行（T005-T007 需按顺序：schema 变更→迁移→引用更新）
- Foundational 完成后，US1/US2/US3/US4 四个故事可由不同开发者并行推进
- 每个故事内标记 [P] 的测试任务、以及"前端 API 封装"与"后端 routes 实现"之间（不同文件）可并行

---

## Parallel Example: User Story 1

```bash
# 并行编写 User Story 1 的测试：
Task: "单测 listMediaAssets 筛选与分页 in app/q-server/src/spec/media-asset/media-asset.service.spec.ts"
Task: "单测 非管理员访问被拒绝 in app/q-server/src/spec/media-asset/media-asset.routes.spec.ts"

# 前端 API 封装与后端路由实现可并行（不同文件）：
Task: "T018 实现 GET /admin/media-assets 等路由 in app/q-server/src/modules/media-asset/media-asset.routes.ts"
Task: "T019 实现前端 getMediaAssetList()/getMediaAssetDetail() in app/frontend/src/api/modules/media-asset/index.ts"
```

---

## Implementation Strategy

### MVP First（仅 User Story 1）

1. 完成 Phase 1: Setup
2. 完成 Phase 2: Foundational（关键阻塞项，尤其 T005-T007 的模型重命名与存量代码适配）
3. 完成 Phase 3: User Story 1
4. **停下验证**：按 quickstart.md 场景 1 独立验证浏览与权限拒绝
5. 视情况部署/演示（仅浏览能力已对管理员产生"全局可见性"价值）

### Incremental Delivery

1. Setup + Foundational → 基础就位
2. - User Story 1（浏览） → 独立验证 → 可视为 MVP
3. - User Story 2（删除治理） → 独立验证
4. - User Story 3（元信息与审核状态，为未来 Agent 预留） → 独立验证
5. - User Story 4（直接上传） → 独立验证
6. 每个故事交付均不破坏此前故事

### Parallel Team Strategy

1. 全员共同完成 Setup + Foundational（尤其 T005-T007 需要一人主导，避免模型重命名冲突）
2. Foundational 完成后：开发者 A 负责 US1、开发者 B 负责 US2、开发者 C 负责 US3、开发者 D 负责 US4
3. 各故事独立完成与集成

---

## Notes

- [P] 任务 = 不同文件、无依赖，可并行
- [Story] 标签用于追溯任务归属的用户故事
- 每个用户故事都应可独立完成与验证
- 实现前确认测试处于失败状态
- 建议每完成一个任务或一组逻辑相关任务后提交一次
- 可在任意 Checkpoint 停下单独验证对应故事
- 避免：任务描述含糊、多任务同时写同一文件产生冲突、故事间引入破坏独立性的强耦合依赖
