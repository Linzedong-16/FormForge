# 技术研究：修复物料管理模块上传追踪缺失

**Created**: 2026-07-19 | **Phase**: 0

## 决策清单

### D1: survey-engine PicItem 切换到追踪接口

**Decision**: survey-engine PicItem 参照 q-editor PicItem 模式，通过 `inject` 获取问卷 ID，优先使用 `POST /q-editor/survey-file/upload`（带 `media_asset` 登记）。

**Rationale**: 该接口已存在且稳定运行于 q-editor 端，survey-engine 仅需复制调用模式，不引入新路由。两者共用同一后端，`file_type=survey_option_image` 保持一致，确保物料管理页面中图片来源统一。

**Alternatives considered**:

- 修改遗留接口 `POST /q-editor/upload` 使其也写 `media_asset` → 拒绝：会改变遗留接口的语义，可能影响其他未预期的调用方；遗留接口缺乏 `survey_id` 上下文
- 新建独立的 survey-engine 上传接口 → 拒绝：引入不必要的路由冗余

---

### D2: q-editor PicItem 降级逻辑消除

**Decision**: 移除 `getSurveyId() === null` 时的 `uploadImage` 降级分支，始终调用 `uploadSurveyFile`。`survey_id` 传空时后端接受并创建 `survey_id=null` 的记录。

**Rationale**: 消除数据断层。问卷保存后回填 `survey_id`（FR-004），确保最终一致性。无 survey_id 的物料在管理页面中显示为"关联问卷：—"，管理者可辨识。

**Alternatives considered**:

- 先保存问卷再允许上传 → 拒绝：破坏编辑器现有的自由编辑流程，用户必须完成更多步骤才能上传图片

---

### D3: `POST /q-editor/survey-file/upload` survey_id 改为可选

**Decision**: Zod schema `surveyIdSchema` 校验从必填改为可选（`z.string().regex(/^\d+$/).transform(BigInt).optional()`），Service 的 `upload()` 方法 `surveyId` 参数从 `bigint` 改为 `bigint | null`。

**Rationale**: 最小改动 — 只需修改 schema 和 service 签名。`survey_id` 在数据库层已是 `BigInt?`（可为 null），无 schema 迁移成本。已有调用方（q-editor 编辑器端）始终传 `survey_id`，不受影响。

---

### D4: 问卷保存后回填 survey_id

**Decision**: 在问卷首次创建（`SurveyService.create()` 获得远程 ID 后），查询 `media_assets` 表中 `file_type=survey_option_image` 且 `survey_id=null` 且 `user_id=创建者` 的记录，批量回填 `survey_id`。

**Rationale**: 回填逻辑内聚在 SurveyService 创建流程中，无需新增独立接口。按 `user_id` 过滤确保不会误填其他用户的临时上传。不处理 `survey_id=null` 且用户未保存问卷的孤儿记录（这类记录保留为 null，管理员仍可在物料管理中看到并手动清理）。

**Alternatives considered**:

- cookie/session 关联临时 ID → 拒绝：引入额外复杂度，且 session 过期后关联丢失
- 不实现回填 → 拒绝：`survey_id=null` 的记录无法按问卷筛选，降低管理员操作效率

---

### D5: 头像物料登记从 fire-and-forget 改为同步等待

**Decision**: `AvatarService.upload()` 中的 `mediaAsset.create()` 从 `.then().catch()` fire-and-forget 模式改为 `await` 同步调用，失败时记录 warn 日志但不抛异常（不阻塞头像上传响应）。

**Rationale**: 同步等待确保登记完成后再返回响应，消除静默失败风险。仍不抛异常 — 头像功能价值高于物料登记，登记失败不应阻止用户获取新头像。

**Alternatives considered**:

- 改为事务性（上传失败则回滚 MinIO）→ 拒绝：增加复杂度，且 MinIO 回滚可能失败，引入新的不一致状态
- 仅增强日志不做行为改变 → 拒绝：日志可能被忽略，不如直接同步确保登记完成

---

### D6: 头像物料强制删除策略

**Decision**: `MediaAssetService.deleteMediaAsset()` 在 `detectReferences` 检测到头像引用（`type: "user_avatar"`）时，不返回引用列表阻止删除，而是执行强制删除流程：(1) 尝试删除 MinIO 文件（失败不阻塞）；(2) 删除 DB 记录；(3) 将 `UserProfile.avatar_url` 置 `null`。问卷引用（`type: "survey_component"`）仍阻止。

**Rationale**: 复用现有 `detectReferences` 的引用分类能力，仅在删除决策层区分处理。头像引用和问卷引用的处理逻辑天然不同 — 头像可被管理员强制移除（`avatar_url` 可置 null），问卷题目配置不可被静默修改（会导致问卷逻辑不符合创建者意图）。

**Alternatives considered**:

- 新增独立 force-delete 接口 → 拒绝：增加接口数量，前端需区分调用。在同一个 delete 接口中根据 file_type 分支处理更简洁
- 删除头像但不处理 `UserProfile.avatar_url` → 拒绝：用户将看到损坏图片，违背 US5 的目标

---

### D7: AvatarDisplay 组件复用策略

**Decision**: 封装 `AvatarDisplay.vue` 到 `packages/common/src/components/`，接收 `avatarUrl: string | null`、`username: string`、`size: number` props。frontend（Arco Design host）和 q-editor（Element Plus sub-app）均可引用。

**Rationale**: 遵循 Principle I（跨包共享代码必须提取到 `packages/common`）。`packages/common` 已是两个应用共用的 workspace 包，无额外依赖配置负担。组件内部纯 CSS 渲染兜底（无第三方头像库依赖），兼容两个应用的样式体系。

**设计要点**：

- 背景色：`username` 的简单哈希 → HSL 色相环均匀分布，同一用户颜色稳定
- 首字符：取 `username[0]` 或首个汉字，大写显示
- 加载失败降级：`<img>` 的 `@error` 事件触发时切换到兜底模式
- 尺寸比例：字号 = `size * 0.4`，确保视觉协调

**Alternatives considered**:

- 使用 Arco Design 的 `<a-avatar>` 的 fallback slot + 额外的用户名逻辑在各处实现 → 拒绝：逻辑分散，无法保证一致性
- 引入第三方头像库（如 `vue-avatar`）→ 拒绝：增加依赖，定制性受限于库 API

---

### D8: file_type 筛选器实现

**Decision**: 后端 `listMediaAssets` 的 Zod schema 新增 `file_type: z.enum(['survey_option_image','survey_signature','survey_cover','user_avatar']).optional()`。前端使用 Arco Design `<a-select>` 单选下拉，选项来自共享常量 `MEDIA_ASSET_FILE_TYPE_LABELS`（定义在 `media-asset.interface.ts`）。

**Rationale**: 与现有 `review_status` 筛选器交互一致（单选 + 可清除），降低用户学习成本。`file_type` 枚举已在前端 `api/modules/media-asset/index.ts` 中导入，无需新增类型定义。

---

### D9: 测试策略

**Decision**: 在已有 `media-asset.service.spec.ts` 基础上新增 3 组测试：(1) PicItem upload with null survey_id；(2) deleteMediaAsset with user_avatar reference → force-delete；(3) listMediaAssets with file_type filter。前端 PicItem 组件的上传逻辑变更通过手动验证（无现有组件测试基础设施）。

**Rationale**: 后端关键分支（强制删除、可选 survey_id、file_type 筛选）有明确的输入/输出边界，适合单元测试。前端组件测试需要 mount q-editor/survey-engine 的 provide/inject 上下文，当前测试基础设施不覆盖此场景，采用手动验证。

---

### D10: 数据库迁移策略

**Decision**: 不新增迁移。`20260719120000_rename_survey_file_to_media_asset` 已包含所有需要的 schema 变更（`ALTER TYPE FileType ADD VALUE IF NOT EXISTS 'user_avatar'`、新增 `resource_type`/`review_status` 等列）。部署时确保此迁移已执行。

**Rationale**: 本次修复不引入新表或新列，仅修改 Service 层行为。`survey_id` 可为 null 在迁移中已是 `BIGINT` 非 `NOT NULL` 列。`file_type` 筛选仅使用已有列。
