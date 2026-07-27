# Research: 物料（图片资源）管理模块

本文档解决 `plan.md` Technical Context 中需要落地的具体技术决策。全部决策均基于对现有代码（`prisma/schema.prisma`、`src/modules/survey/file/`、`src/modules/user/profile/avatar.service.ts`、`app/frontend/src/router/`）的实地核查，而非假设。

## 决策 1：数据模型——扩展现有 `SurveyFile`，而非新建并行表

- **Decision**: 将现有 `SurveyFile` 模型重命名为 `MediaAsset`（`@@map("media_assets")`），保留其全部既有字段（`file_url`/`file_key`/`file_name`/`mime_type`/`file_size`/`user_id`/`survey_id`/`created_at`），新增：
  - `resource_type String @default("image")` —— 替代原本语义过窄的 `FileType` 枚举定位，字符串类型天然支持未来追加新资源类型，不需要每次都改枚举定义（枚举变更在 Postgres 里是较重的迁移操作）
  - `review_status ReviewStatus @default(none)` —— 直接复用 `Review` 模块已定义的 `ReviewStatus` 枚举（`none/pending/approved/rejected`），不新建重复枚举
  - `reviewed_by BigInt?`（FK → User，nullable）、`reviewed_at DateTime?`、`review_comment String? @db.Text`
  - 保留原 `FileType` 枚举的既有取值作为 `resource_type` 的字符串惯例值迁移目标（`survey_option_image`/`survey_signature`/`survey_cover`），并新增 `user_avatar`
- **Rationale**: `SurveyFile` 已经承担着"记录 MinIO 里一份图片文件的元信息"这个核心职责，与"物料"概念高度重合；扩展它可以复用其既有索引、既有的问卷级联删除逻辑（`onDelete: SetNull`），避免同一份文件在两张表里被分别登记、产生数据漂移。
- **Alternatives considered**:
  - 新建独立 `Material` 表，与 `SurveyFile` 并存 —— 否决：会导致问卷题目图片/签名图片同时存在于两张表，维护两套增删逻辑，且不清楚以谁为准，违反宪法 Principle I 对"避免跨模块重复漂移逻辑"的要求。
  - 只加字段不改名（继续叫 `SurveyFile`）—— 否决：命名会与本功能对外呈现的"全平台物料"定位脱节（尤其在纳入用户头像后，"SurveyFile"这个名字已不能准确描述它管理的内容），保留旧名会给后续维护者造成误导。

## 决策 2：技术命名——避免与 q-editor 已有"素材库"术语冲突

- **Decision**: 代码层技术标识（Prisma 模型名、路由路径、TS 类型/变量名）统一使用英文 `MediaAsset` / `media-asset(s)`；仅在中文界面文案与产品对外表述中使用"物料管理"（用户需求原词）。
- **Rationale**: 同一个 monorepo 里，`app/q-editor/src/components/SurveyComs/Materials/` 已经是一个含义完全不同的既有概念（题型组件面板，即问卷编辑器左侧可拖拽的"素材"面板），如果本功能的后端模型也叫 `Material`，会让在两个子项目间切换的开发者产生"两个 Material 到底是不是一个东西"的困惑。选用 `MediaAsset` 可以精确描述"被管理的媒体文件资产"，且与现有概念零冲突。
- **Alternatives considered**: 直接沿用用户描述里的"物料"直译为 `Material` —— 否决，理由如上；`Asset`（更通用但在前端构建产物语境下容易被误解为"打包产物/静态资源"）——已考虑但 `MediaAsset` 更明确地限定在"媒体文件"范畴，采纳。

## 决策 3：用户头像纳入范围——仅覆盖未来上传，不回溯历史数据

- **Decision**: 扩展 `src/modules/user/profile/avatar.service.ts`，使其在头像上传成功、更新 `UserProfile.avatar_url` 的同一流程中，额外创建一条 `MediaAsset` 记录（`resource_type="image"`、`user_id` 关联、`survey_id` 为空）。**不**对本功能上线前已经上传、从未被登记过的历史头像做回溯回填。
- **Rationale**: 实地核查 `avatar.service.ts` 发现，当前头像上传流程只更新了 `UserProfile.avatar_url` 字段，从未写入任何文件登记表——这是本次调研发现的一个真实的既有缺口，而不是本功能引入的新问题。要覆盖历史头像，只能通过扫描 MinIO 存储桶做启发式反向匹配（无法保证文件与用户的精确对应关系，且历史文件可能已被覆盖/删除），风险明显大于收益。按平台宪法 Governance 一节的要求，"已知缺口"应当被记录而非被静默假装已解决。
- **Alternatives considered**: 编写一次性迁移脚本扫描 MinIO 回填历史头像记录 —— 否决，技术风险（无法保证匹配准确性）与工程成本不成正比，作为已知限制留档，未来如有强烈需求可单独立项处理。

## 决策 4：后端模块归属与路由前缀

- **Decision**: 新建顶层模块 `src/modules/media-asset/`（`media-asset.routes.ts`/`.service.ts`/`.schemas.ts` 三层结构，与项目既有 `review`/`template`/`tracking` 模块的组织方式完全一致），路由统一挂载在 `/admin/media-assets` 前缀下（最终对外路径 `/api/admin/media-assets/*`，与 `/api/admin/reviews`、`/api/admin/stats` 的路径风格保持一致）。
- **Rationale**: 现有 `src/modules/survey/file/` 子模块的职责边界是"归属于某一份问卷的文件列表"（面向问卷所有者），而本功能是"跨问卷、跨用户的管理员全局视角"，二者的调用者、权限模型、查询维度都不同，塞进同一个子模块会混淆职责边界（违反宪法 Principle I 对模块边界的要求）。
- **Alternatives considered**: 扩展 `survey/file` 子模块新增管理员专属路由 —— 否决，理由见上；在 `user` 模块下新建子模块 —— 否决，因为物料同时关联问卷与用户两侧，归到 `user` 下会造成语义偏向。

## 决策 5：鉴权与审核接口的"面向未来 Agent"设计

- **Decision**: 审核状态变更接口（`FR-010`）与其他管理操作一样统一走既有 `authenticate` + `requireSuperAdmin` 中间件组合，不新开无鉴权或弱鉴权的旁路接口。未来自动化审核 Agent 接入时，参照 `ai-service` 调用 `q-server` 已有的内部服务鉴权模式（`X-Internal-Api-Key` header，见 `app/ai-service/src/tools/survey_client.py`）获取访问能力，而不是本功能现在就要设计一套新的 Agent 专属认证机制。
- **Rationale**: "预留给审核 Agent"应理解为"接口的输入输出契约与状态机设计不假设调用者是人类"，而不是"现在就要开放一个更宽松的免鉴权接口"。复用已验证过的内部服务鉴权模式，比现在就发明一套新机制风险更低，也更符合宪法 Principle IX 对 AI 集成"不能引入新的、未经审视的信任边界"的精神。
- **Alternatives considered**: 现在就新增一个独立的、面向 Agent 的 API Key 认证层 —— 否决，本功能范围不包含真实的 Agent 接入，过早设计认证机制容易与未来实际的 Agent 架构（`ai-service` 现有模式）产生不一致，待真正接入时再评估更合适。

## 决策 6：限流档位

- **Decision**: 列表/详情/筛选类只读接口沿用 100/min（与 `/admin/reviews`、`/admin/config` 同档）；上传接口沿用问卷图片上传既有档位（参照 `upload.routes.ts` 当前限流设置）；删除、批量删除、更新、审核状态变更等管理员操作类接口同样沿用 100/min（管理员操作不同于面向公众接口，不需要更严格的防刷限流）。
- **Rationale**: 保持与平台同类管理员接口一致的限流体感，不引入新的、需要额外解释的档位。

## 决策 7：批量操作处理模式

- **Decision**: 批量删除、批量审核状态变更采用"逐项处理 + 汇总成功/失败列表"的同步处理模式（复用平台既有批量接口惯例），不引入异步任务队列。
- **Rationale**: 管理员单次批量操作的物料数量级别（人工在列表页勾选）远低于需要异步化处理的规模，同步处理即可在合理响应时间内完成，避免引入队列基础设施带来的额外复杂度（宪法 Complexity 门禁要求不引入不必要的复杂度）。

## 决策 8：前端落点

- **Decision**: 新增路由 `/media-assets`，`meta: { requiresSuperAdmin: true }`（复用 `src/router/guard.ts` 中 `resolveNavigation()` 已有的判定逻辑，不新建守卫）；页面代码放在 `src/views/media-asset-management/MediaAssetManagementView.vue`，辅以 `components/MediaAssetEditDrawer.vue`（元信息编辑 + 审核状态变更）与 `components/MediaAssetUploadDialog.vue`（直接上传）；接口封装与响应类型放在 `src/api/modules/media-asset/`（与 `src/api/modules/review/`、`src/api/modules/user/` 的既有组织方式一致）。导航入口挂在既有"系统管理"分组（与用户管理、消息中心同级），复用已确立的 Arco Design Vue 表格/分页/筛选组件与本项目既有设计令牌（`tokens.css`）。
- **Rationale**: 完全复用既有路由守卫、目录约定与视觉体系，不引入新的前端架构模式，符合宪法 Principle VIII 对前端一致性的要求。
- **Alternatives considered**: 做成 Tab 式 `Layout.vue`（参照 `UserManagementLayout.vue`）拆成"物料列表"与"审核队列"两个子页 —— 暂不采用：当前范围内审核状态只是列表里的一个筛选维度与行内操作，尚不足以撑起独立的第二个子页面；如后续审核工作量显著增长，可在不破坏本次设计的前提下再拆分。

## 决策 9：测试方案

- **Decision**: 后端在 `src/spec/media-asset/` 下新增 Vitest 单测（`media-asset.service.spec.ts` 等），覆盖：权限校验分支、删除时引用检测分支、批量操作部分失败分支、审核状态变更审计记录写入。前端仅对非纯展示逻辑（筛选参数拼装、批量操作结果归并展示）补充 Vitest 单测，纯展示型组件不强制。
- **Rationale**: 与宪法 Principle V"新业务逻辑必须随 PR 提供单测"的要求对齐，同时遵循项目既有 `src/spec/<module>/` 目录惯例。

---

**All Technical Context 项均已解决，无遗留 NEEDS CLARIFICATION。**
