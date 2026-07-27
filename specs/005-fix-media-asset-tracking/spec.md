# Feature Specification: 修复物料管理模块上传追踪缺失

**Feature Branch**: `005-fix-media-asset-tracking`

**Created**: 2026-07-19

**Status**: Draft

**Input**: User description: "参考上一轮对话的问题完善该低代码文件系统的物料管理功能模块"

## Clarifications

### Session 2026-07-19

- Q: 管理员强制删除正在使用的头像后，`UserProfile.avatar_url` 如何处理？ → A: 设为 null，前端检测到空值时展示用户名兜底头像（如飞书/钉钉样式）
- Q: 头像兜底组件的覆盖范围？ → A: 封装共享头像组件（AvatarDisplay），统一处理空 URL → 用户名兜底，在所有已有头像展示位替换使用
- Q: 物料 `file_type` 筛选器支持单选还是多选？ → A: 单选下拉，与现有 review_status 筛选交互一致

## 背景

经排查，物料管理模块（`specs/004-material-management`）后端 API 与管理端前端页面均已完整实现，但存在 **三条上传路径未正确创建物料记录** 的缺陷，导致管理员在物料管理页面中只能看到签名组件上传的图片，而 **头像上传、图片选择题组件（PicItem）上传** 的图片无法在物料管理页面中正常展示。

具体根因详见上一轮对话的排查报告，摘要如下：

| 上传来源                            | 是否创建 `media_asset` 记录 | 物料管理可见 |
| ----------------------------------- | :-------------------------: | :----------: |
| 签名图片（q-editor）                |             ✅              |      ✅      |
| 图片选择题（survey-engine PicItem） |             ❌              |      ❌      |
| 图片选择题（q-editor PicItem）      |         ⚠️ 条件创建         |      ⚠️      |
| 用户头像                            |         ⚠️ 静默失败         |      ❌      |
| 管理员直接上传                      |             ✅              |      ✅      |

---

## User Scenarios & Testing _(mandatory)_

### User Story 1 — 渲染引擎图片选择题物料可见 (Priority: P1)

作为超级管理员，当我打开物料管理页面时，我希望看到所有来源的图片资源——包括用户在填答问卷时通过图片选择题（PicItem）组件上传的封面图片——这样我才能对全平台图片资源有完整的掌控。

当前，`survey-engine`（渲染引擎）的 PicItem 组件仅使用遗留图片上传接口（`POST /api/q-editor/upload`），该接口将图片上传到 MinIO 后不写入 `media_assets` 表，导致这些图片在物料管理页面中完全不可见，形成管理盲区。

**Why this priority**: 渲染引擎是最终用户填答问卷的入口，其 PicItem 上传的图片占据平台图片存量的重要比例。这些图片在物料管理中不可见意味着管理员无法审核、无法检测引用、删除问卷时可能存在孤儿文件残留。这是影响面最广、用户可感知的缺陷。

**Independent Test**: 在任意已发布问卷的填答页面，通过图片选择题组件上传一张封面图；随后以超级管理员身份访问物料管理页面，验证该图片出现在列表中，且 `file_type` 显示为 `survey_option_image`。

**Acceptance Scenarios**:

1. **Given** 一个已发布问卷的填答页面（survey-engine 渲染），**When** 填答者通过 PicItem 组件上传一张新封面图，**Then** 物料管理页面的列表中包含该图片记录，`file_type` 字段值为 `survey_option_image`，且图片预览正常显示。
2. **Given** 物料管理页面已有该图片记录，**When** 管理员尝试删除该图片，**Then** 系统检测到该图片被问卷题目引用，返回引用来源（问卷标题、组件 ID）并阻止删除。
3. **Given** 渲染引擎 PicItem 上传过程中 MinIO 上传成功但数据库写入失败，**When** 该异常发生时，**Then** 上传接口返回友好错误提示，且 MinIO 中不残留无法追溯的孤儿文件。
4. **Given** 管理员在物料管理页面筛选 `file_type=survey_option_image`，**When** 筛选条件生效，**Then** 列表同时包含编辑器端和渲染引擎端上传的图片选择组件图片，不区分来源。

---

### User Story 2 — 头像上传物料登记 & 不合规头像强制删除 (Priority: P1)

作为超级管理员，我希望用户上传的头像能出现在物料管理页面中，以便统一审核和管理平台上所有用户头像资源。当发现用户头像不合规时，我有权直接删除该头像——即使该头像正在被用户使用——系统应自动将该用户的头像重置为空，前端以用户名兜底头像展示，而非显示损坏图片。

当前存在两个问题：(1) `AvatarService.upload()` 以 fire-and-forget 模式登记物料，`user_avatar` 枚举值迁移未执行时静默失败；(2) 物料删除保护机制（`detectReferences`）检测到 `UserProfile.avatar_url` 引用时会阻止删除，管理员无法强制删除不合规头像。

**Why this priority**: 头像图片是用户生成内容的重要组成部分，涉及合规审核需求。将登记修复与强制删除合并为一个 US 是因为两者共同构成"头像物料全生命周期管理"的闭环。与 US1 同为 P1。

**Independent Test**: (1) 上传新头像 → 物料管理页面可见；(2) 管理员删除该头像 → 删除成功，用户头像展示为用户名兜底。

**Acceptance Scenarios**:

1. **Given** 数据库 `FileType` 枚举已包含 `user_avatar` 取值，**When** 用户成功上传新头像，**Then** 物料管理页面在合理时间内（最多 5 秒）可查询到该头像的物料记录。
2. **Given** 数据库 `FileType` 枚举缺失 `user_avatar`（迁移未执行场景），**When** 用户上传新头像，**Then** 头像上传本身不受影响（头像正常显示），但服务端日志中记录了物料登记失败的警告信息，便于运维发现。
3. **Given** 物料管理页面中已存在某用户的头像记录，**When** 该用户再次上传新头像，**Then** 旧头像的物料记录保留（不级联删除），新头像生成独立的物料记录。
4. **Given** 某头像正在被用户 U 作为当前头像使用，**When** 管理员在物料管理页面删除该头像记录，**Then** 系统不阻止删除（区别于问卷题目图片的引用保护），而是：(a) 删除 MinIO 文件；(b) 删除 `media_asset` 记录；(c) 将 `UserProfile.avatar_url` 设为 `null`；(d) 前端所有展示用户 U 头像的位置自动展示用户名兜底头像。
5. **Given** 某头像未被任何用户当前使用（历史头像），**When** 管理员删除该头像记录，**Then** 删除成功，MinIO 文件同步清理，无需处理 UserProfile（已无引用）。

---

### User Story 3 — 编辑器端 PicItem 上传无条件登记 (Priority: P2)

作为超级管理员，即使问卷尚未保存到远程服务器（本地草稿阶段），我也希望在物料管理页面中能看到用户在编辑器中通过 PicItem 上传的图片。

当前，q-editor 的 PicItem 组件在 `getSurveyId()` 返回 `null` 时（问卷未同步到远程），降级使用遗留上传接口（不写 `media_assets`），导致草稿阶段上传的图片无法被物料管理追踪。虽然 `EditorView` 中 `remoteSurveyId` 为空的情况比渲染引擎少见，但仍然存在。

**Why this priority**: 影响范围小于 US1（编辑器端，非最终用户），且存在 `getSurveyId()` 有值时的正常路径作为临时绕过手段。但仍需修复以保证编辑阶段上传的图片从第一刻起即被追踪，消除数据断层。

**Independent Test**: 在编辑器中新建一个问卷、不保存，通过 PicItem 上传封面图；随后在物料管理页面中验证该图片可见。上传完成后保存问卷，验证 `survey_id` 从 null 更新为新生成的问卷 ID。

**Acceptance Scenarios**:

1. **Given** 编辑器正在编辑一个尚未同步到远程的新问卷（`remoteSurveyId` 为 null），**When** 用户通过 PicItem 上传封面图，**Then** 系统仍使用带追踪的新上传接口（`/survey-file/upload`，不传 `survey_id` 或传 null），创建 `media_asset` 记录。
2. **Given** PicItem 上传时 `survey_id` 为空，**When** 问卷随后保存并获得远程 ID，**Then** 该图片的 `media_asset.survey_id` 字段被更新为对应的问卷 ID。
3. **Given** 编辑器端已统一使用追踪接口，**When** 管理员在物料管理页面按 `survey_id` 筛选，**Then** 可以找到所有关联到特定问卷的图片，无论上传时问卷是否已保存。

---

### User Story 4 — 物料管理页面增加 `file_type` 筛选维度 (Priority: P2)

作为超级管理员，我希望在物料管理页面中能按文件来源类型（`file_type`）进行筛选——例如只看头像图片、只看签名图片、或只看图片选择题的封面图——以便快速定位特定类型的物料并批量操作。

当前，物料管理页面的筛选栏支持按文件名、用户 ID、问卷 ID、审核状态筛选，但不支持按 `file_type` 筛选，管理员无法区分不同类型的物料。

**Why this priority**: 这是管理效率增强功能，不涉及数据完整性。在 US1-US3 确保各类图片都可被追踪后，此功能为管理员提供更精细的数据视图。

**Independent Test**: 在物料管理页面筛选栏选择 `file_type=user_avatar`，验证表格仅显示头像类型的物料记录。

**Acceptance Scenarios**:

1. **Given** 物料管理页面筛选栏增加了 `file_type` 下拉选择器，**When** 管理员选择 `survey_signature`，**Then** 表格仅显示签名类型的图片，其他类型被过滤。
2. **Given** `file_type` 筛选器选项，**When** 查询结果为空，**Then** 表格显示空状态占位提示，而非报错。
3. **Given** 管理员同时使用 `file_type` 与 `review_status` 筛选，**When** 两个条件叠加，**Then** 返回同时满足两个条件的交集结果。

---

### User Story 5 — 共享头像展示组件（AvatarDisplay）兜底机制 (Priority: P1)

作为平台用户，当我的头像被管理员删除后，我希望在平台所有展示头像的位置（导航栏、设置页、评论区、用户列表等）看到一个美观的兜底头像——以用户名首字符为标识的圆形头像（如飞书、钉钉的企业头像风格），而非显示损坏图片图标或空白。

当前，平台中头像展示位置分散在多处（`AvatarUpload.vue` 用于设置页、各组件内直接使用 `<a-avatar>` 或 `<img>` 标签）。当 `avatar_url` 为 `null` 时没有统一的兜底策略，依赖组件各自的 fallback 逻辑或直接渲染空 `<img>`。

**Why this priority**: 这是 US2（强制删除头像）的前端闭环——管理员能安全删除不合规头像的前提是删除后用户体验不劣化。若没有兜底组件，强制删除头像会导致用户看到损坏图片，等同于引入新的 UI 缺陷。作为 US2 的配套，必须同版本发布。

**Independent Test**: (1) 在任一用户头像展示位将其 `avatar_url` 设为 null → 验证展示为圆形带用户名首字符的兜底头像；(2) 遍历全平台所有头像展示位置，确认无一处仍使用原生 `<img>` 直接渲染 `avatar_url`。

**Acceptance Scenarios**:

1. **Given** 用户 U 的 `avatar_url` 为有效 URL，**When** 渲染 `AvatarDisplay` 组件，**Then** 正常加载并展示圆形头像图片；加载失败时自动降级为用户名首字符兜底。
2. **Given** 用户 U 的 `avatar_url` 为 `null` 或空字符串，**When** 渲染 `AvatarDisplay` 组件，**Then** 展示圆形背景 + 用户名首字符（或首个汉字）的兜底头像，背景色基于用户名哈希生成以区分不同用户。
3. **Given** 用户名尚未加载（异步场景），**When** AvatarDisplay 的 `username` prop 为空，**Then** 展示一个通用的默认占位图标（如 person 图标），不显示空白。
4. **Given** `AvatarDisplay` 组件已封装，**When** 开发者在新增头像展示位时使用该组件，**Then** 无需自行处理空 URL 或加载失败的逻辑，组件内部自动兜底。
5. **Given** 头像尺寸需求不同（导航栏 32px、用户列表 40px、设置页 80px），**When** 使用 `AvatarDisplay` 组件，**Then** 通过 `size` prop 统一控制，兜底字号按比例自适应。

---

### Edge Cases

- **数据库枚举值缺失回退**：如果 `user_avatar` 未在数据库 `FileType` 枚举中注册，头像上传的物料登记调用应产生可见的日志告警（而非静默失败），且不应影响头像上传的主流程。
- **MinIO 上传成功但 DB 写入失败**：上传接口应先写 MinIO 再写 DB；若 DB 写入失败，需确保能处理已上传的 MinIO 文件（记录在日志中供后续清理，或回滚 MinIO 写入）。
- **survey_id 后补**：PicItem 在问卷未保存时上传的图片 `survey_id` 为 null，问卷保存后需将 `survey_id` 回填到已有记录；若问卷最终被放弃（未保存），这些记录保持 `survey_id=null`，在物料管理页面中标记为"关联问卷：—"。
- **PicItem 降级场景完全消除**：修复后，PicItem 组件（含 q-editor 和 survey-engine）的上传行为应与问卷是否已同步无关，始终使用追踪接口。不再存在"降级到遗留接口"的逻辑路径。
- **存量未登记图片**：修复前通过遗留接口上传的历史图片不在本次修复范围内——它们没有 `media_asset` 记录，无法追溯。假设这些历史图片不需要回填（与 `specs/004-material-management/research.md` 决策 3 对头像历史数据的处理一致）。
- **survey-engine PicItem 的 `survey_id` 获取**：渲染引擎端填答页面已知当前问卷 ID（路由参数或 inject），与编辑器端一样可传递给上传接口。
- **管理员强制删除正在使用的头像**：删除当前头像时，必须原子性地完成三步——删 MinIO 文件、删 `media_asset` 记录、将 `UserProfile.avatar_url` 设为 null。若任一步失败（如 MinIO 文件已不存在），其余步骤仍应继续执行（best-effort 清理），但 `UserProfile.avatar_url` 置 null 是关键步骤，失败时需记录 Error 级日志。
- **历史头像（avatar_url 已非当前值的旧物料）**：用户更换头像后，旧头像的 `media_asset` 记录不与 `UserProfile.avatar_url` 关联。管理员删除这些历史记录时使用标准引用检测逻辑（检查问卷引用），不应触发 UserProfile 更新。
- **AvatarDisplay 颜色碰撞**：用户名哈希生成背景色时，理论上不同用户可能产生相同或相近颜色。这是可接受的 UX 降级（不做唯一性保证），优先保证同一用户颜色稳定（相同用户名始终同一颜色）。
- **头像删除后用户重新上传**：管理员删除头像 → `avatar_url=null` → 用户重新上传 → 生成新的 `media_asset` 记录 → 正常展示。旧记录不会被恢复，新记录独立管理。

---

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: `survey-engine` 的 PicItem 组件 MUST 使用带追踪的文件上传接口（`POST /q-editor/survey-file/upload`）替代当前使用的遗留接口（`POST /q-editor/upload`），确保上传后创建 `media_asset` 记录，`file_type` 为 `survey_option_image`。
- **FR-002**: `q-editor` 的 PicItem 组件 MUST 移除"问卷未同步时降级到遗留接口"的逻辑——无论 `getSurveyId()` 是否返回有效值，均使用追踪接口；当 `survey_id` 不可用时传空值，后续由问卷保存流程回填。
- **FR-003**: 后端 `POST /q-editor/survey-file/upload` 路由 MUST 将 `survey_id` 字段从必填改为可选（`null` 值允许），以支持草稿阶段上传。相应的 Zod Schema 和 Service 方法签名需同步调整。
- **FR-004**: 问卷保存/同步到远程后，系统 MUST 将此前通过 PicItem 上传但 `survey_id` 为 null 的 `media_asset` 记录回填正确的 `survey_id`。回填逻辑应在问卷首次创建（获得远程 ID）时触发。
- **FR-005**: `AvatarService.upload()` 中的物料登记 MUST 从 fire-and-forget 改为同步等待（或至少确保错误不被静默吞掉）。若登记失败，MUST 在服务端日志中记录包含 `userId`、`fileUrl`、错误详情的警告日志。
- **FR-006**: 系统 MUST 提供一个启动时校验或数据库迁移脚本，确保 `FileType` 枚举包含 `user_avatar` 取值；若缺失，需在服务启动日志中给出明确提示。
- **FR-007**: 物料管理后端（`listMediaAssets` 接口）MUST 新增 `file_type` 查询参数（可选、单选，取值 `survey_option_image` / `survey_signature` / `survey_cover` / `user_avatar`），对应的 Zod Schema 需同步更新。
- **FR-008**: 物料管理前端页面 MUST 在筛选栏中新增"文件类型"下拉筛选器（单选），选项列表包含所有 `FileType` 枚举值（含中文标签映射），支持清除选择恢复全部类型视图。
- **FR-009**: 修复 MUST 不破坏现有的单元测试（`media-asset.service.spec.ts`、`media-asset.schemas.spec.ts`、`media-asset.routes.spec.ts`），且新增或修改的测试用例覆盖 FR-001 至 FR-013 的关键路径。
- **FR-010**: 所有修改 MUST 遵循项目宪法（`constitution.md` v1.0.0）的 10 条核心原则，特别是 Principle III（统一响应信封）、Principle IV（安全默认值）、Principle V（测试充分交付）。
- **FR-011**: 删除头像物料（`file_type=user_avatar`）时，`deleteMediaAsset` 服务 MUST 区别于问卷图片的引用保护逻辑——若物料被某用户的 `UserProfile.avatar_url` 引用，不阻止删除，而是执行强制删除流程：删除 MinIO 文件 → 删除 `media_asset` 记录 → 将 `UserProfile.avatar_url` 设为 `null`。三个步骤采用 best-effort 策略（MinIO 删除失败不阻塞后续步骤），但 `UserProfile` 更新失败时记录 Error 日志。
- **FR-012**: 前端 MUST 封装一个共享头像展示组件 `AvatarDisplay`，接收 `avatarUrl` 和 `username` props：(a) 当 `avatarUrl` 有效时渲染圆形图片，加载失败时自动降级为兜底；(b) 当 `avatarUrl` 为空时渲染圆形背景 + 用户名首字符（首个汉字或首字母），背景色基于用户名哈希生成；(c) 当 `username` 也为空时渲染通用占位图标；(d) 支持 `size` prop 控制尺寸，兜底字号自适应。
- **FR-013**: `AvatarDisplay` 组件 MUST 替换全平台所有直接使用 `<a-avatar>` 或 `<img>` 渲染用户头像的位置（包括但不限于：`frontend` 的管理端用户列表、导航栏用户头像；`q-editor` 的设置页、个人中心、评论区等），确保删除头像后无一处展示损坏图片。代码审查时需提供完整的替换位置清单。

### Key Entities

- **MediaAsset（物料）**: 平台内所有图片资源的统一登记记录。关键属性包括 `file_type`（来源类型枚举，本次扩展覆盖所有上传路径）、`survey_id`（可为 null 以支持非问卷关联图片如头像）、`user_id`（上传者）。关系上归属于 User（上传者）和可选的 Survey。对于 `file_type=user_avatar` 的物料，其生命周期与用户头像独立——管理员可强制删除，删除时自动将关联 `UserProfile.avatar_url` 置 null。
- **FileType（文件类型枚举）**: 扩展自原始定义（`survey_option_image` / `survey_signature` / `survey_cover`），新增 `user_avatar` 取值。本次修复确保所有上传路径均写入正确的 `file_type`。
- **AvatarDisplay（头像展示组件）**: 前端共享 UI 组件，不直接映射数据库实体。接收 `avatarUrl`（物料/头像 URL）、`username`（用户名）、`size`（尺寸）作为输入，内部处理空 URL / 加载失败 / 异步加载三种状态的渲染，以用户名首字符 + 哈希背景色作为兜底方案。

---

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: 通过任意 PicItem 组件（含 q-editor 和 survey-engine）上传的图片，在物料管理页面中的可见率达到 **100%**（即每次上传均能在 5 秒内查询到对应记录）。
- **SC-002**: 通过头像上传功能上传的图片，在物料管理页面中的可见率达到 **100%**（即每次上传均能在 5 秒内查询到对应记录），且服务端日志中的物料登记失败告警数量降为 **0**。
- **SC-003**: 物料管理页面新增 `file_type` 筛选后，管理员能在 **3 次点击内** 完成按类型筛选并定位到目标物料（选择类型 → 查看列表 → 打开详情）。
- **SC-004**: 修复后所有已有单元测试继续通过，且新增测试覆盖所有修改的上传路径（PicItem 上传、头像上传）的关键分支。
- **SC-005**: 修复不会在 MinIO 中产生可追溯的孤儿文件——即每次 `media_asset` 记录创建失败的 MinIO 上传，均在服务端日志中有可追溯的记录。
- **SC-006**: 管理员删除正在使用的用户头像后，该用户在所有页面的头像展示位 **100%** 展示为用户名首字符兜底头像（而非损坏图片或空白），且 `UserProfile.avatar_url` 已置为 `null`。
- **SC-007**: `AvatarDisplay` 组件替换覆盖率达到 **100%**——平台中不再存在任何直接以 `<img>` 或 `<a-avatar>` 渲染 `avatar_url` 且无兜底处理的代码位置。

---

## Assumptions

- **调查数据不可回溯**：修复前通过遗留接口或 fire-and-forget 失败场景产生的历史图片（已在 MinIO 但无 `media_asset` 记录）不在本需求范围内，不做数据回填。这延续了 `specs/004-material-management/research.md` 决策 3 的处理原则。
- **渲染引擎端已知问卷 ID**：survey-engine 的填答页面能通过路由参数或其他方式获取当前问卷 ID，这与 q-editor 端的 `getSurveyId()` inject 模式一致。
- **后端 `/q-editor/survey-file/upload` 可接受 null survey_id**：当前接口的 Zod schema（`surveyIdSchema`）校验 `survey_id` 为必填，需改为可选。该改动不影响现有调用方（始终传 `survey_id`）。
- **数据库迁移已执行或将被执行**：`20260719120000_rename_survey_file_to_media_asset` 迁移（含 `ALTER TYPE "FileType" ADD VALUE IF NOT EXISTS 'user_avatar'`）在部署前会被执行。若使用 `prisma db push` 开发模式，需确认 PostgreSQL 枚举同步行为。
- **复用现有组件模式**：survey-engine PicItem 的修复参照 q-editor PicItem 已有的 `getSurveyId` + `uploadSurveyFile` 双路径逻辑，不引入全新的上传抽象层。
- **头像强制删除的引用判定**：当前 `detectReferences` 方法已能区分头像引用（`type: "user_avatar"`）和问卷引用（`type: "survey_component"`）。删除逻辑仅需在头像引用时跳过阻止，问卷引用时继续阻止。不修改 `detectReferences` 的检测范围。
- **AvatarDisplay 组件封装位置**：共享组件应放在 `packages/common`（跨 frontend 和 q-editor 共用）或各自应用的 `components/common/` 目录中，遵循 Principle I（Monorepo Module Boundary Integrity）。若放在 `packages/common`，需确保两个应用的 Vue 版本兼容。
- **用户名首字符兜底**：假设用户名至少有一个字符（系统已在用户注册时校验）。对于极端情况（用户名为空字符串），回退到通用 person 图标。
- **历史头像记录不自动关联**：用户上传新头像后，旧头像的 `media_asset` 记录不会自动标记为"已废弃"。管理员可按 `user_id` 筛选查看某用户的所有历史头像记录，手动清理不再需要的旧物料。
