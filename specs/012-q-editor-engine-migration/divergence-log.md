# 分歧审计记录（T002）

审计范围：`app/q-editor/src/components/SurveyComs/` 与 `packages/survey-engine/src/components/SurveyComs/` 下除已确认分歧点（`Materials/SelectComs/SingleSelect.vue`、`Materials/SelectComs/OptionSelect.vue`、`Materials/SelectComs/SinglePicSelect.vue`、`Materials/AdvancedComs/Signature.vue`、`Common/PicItem.vue`）之外的全部同名文件，共 32 个文件。比对时忽略 CRLF/LF 换行符差异。

## 说明：一处系统性的"非真实差异"模式

除下面单独列出的 2 处真实分歧外，其余 30 个文件在忽略换行符之后仍存在文本级差异，但逐一核对后确认均属于同一种**非行为性差异**，具体为两点：

1. **编码 BOM**：survey-engine 侧文件以 UTF-8 BOM（`\xEF\xBB\xBF`）开头，q-editor 侧无 BOM。纯编码标记，不影响运行结果。
2. **import 路径写法**：q-editor 侧使用别名路径（如 `@/types`、`@/utils`、`@/components/SurveyComs/Common/MaterialsHeader.vue`），survey-engine 侧使用相对路径（如 `../../../types`、`../../../../utils`）。这是由两侧构建配置（是否有 `@` alias）决定的等价写法，指向同一模块，不构成行为差异。

这一模式已在下方"无差异文件"中统一说明，不再逐条展开。

## 无差异文件

以下文件内容完全一致，或仅存在上述"BOM + import 路径写法"的非真实差异，判定为**无差异**：

- `Common/MaterialsHeader.vue`（逐字节完全一致，忽略换行符后无任何差异）
- `EditItems/CascaderOptionNode.vue`
- `EditItems/CascaderOptionsEditor.vue`
- `EditItems/ColorEditor.vue`
- `EditItems/DateTimeTypeEditor.vue`
- `EditItems/DescEditor.vue`
- `EditItems/EditPannel.vue`
- `EditItems/ItalicEditor.vue`
- `EditItems/MatrixOptionsEditor.vue`
- `EditItems/OptionsEditor.vue`
- `EditItems/PicOptionsEditor.vue`
- `EditItems/PositionEditor.vue`
- `EditItems/RateTextEditor.vue`
- `EditItems/SizeEditor.vue`
- `EditItems/SliderConfigEditor.vue`
- `EditItems/TextInputTypeEditor.vue`
- `EditItems/TextTypeEditor.vue`
- `EditItems/TitleEditor.vue`
- `EditItems/WeightEditor.vue`
- `Materials/AdvancedComs/Cascader.vue`
- `Materials/AdvancedComs/DateTime.vue`
- `Materials/AdvancedComs/RateScore.vue`
- `Materials/AdvancedComs/Slider.vue`
- `Materials/AdvancedComs/Transfer.vue`
- `Materials/ComputedComs/ComputedField.vue`
- `Materials/InputComs/TextInput.vue`
- `Materials/MatrixComs/MatrixSingle.vue`
- `Materials/NoteComs/TextNote.vue`
- `Materials/SelectComs/MultiPicSelect.vue`
- `Materials/SelectComs/MultiSelect.vue`

## 可简单并集处理的分歧点

（本次审计未发现可无条件简单并集处理的真实分歧点；发现的 2 处真实分歧均涉及交互方式取舍，列入下方"待人工决议"。）

## 待人工决议事项

### `EditItems/ButtonGroup.vue`

- **q-editor 侧行为**：标题（`title`）与状态（`status`）文字通过原生 HTML `title` 属性提供 hover 提示；文字超出 `max-width`（180px / 80px）时用 CSS `text-overflow: ellipsis` 截断，鼠标悬停时依赖浏览器原生 tooltip 显示完整文本。模板中有注释"标题以及当前状态：文字过长时靠原生 title 兜底显示全名"，明确这是有意为之的设计。
- **survey-engine 侧行为**：标题与状态文字分别包裹在 `<el-tooltip :content="..." placement="top">` 中，hover 时展示 Element Plus 风格的自定义 tooltip（`placement="top"`），未设置原生 `title` 属性。截断 CSS（ellipsis/max-width）逻辑双方完全一致。
- **为何无法简单并集**：两者是对"同一功能"（文字过长时提示完整内容）的两种互斥实现路径——原生 `title` 属性 tooltip 与 Element Plus 组件化 tooltip。若在同一元素上同时保留 `title` 属性又包裹 `el-tooltip`，会导致鼠标悬停时浏览器原生 tooltip 与 el-tooltip 弹层同时触发/叠加，造成视觉冲突和不一致的交互体验，因此不能"各取所长"简单叠加。选择保留哪一种 tooltip 机制（原生、零依赖、性能更轻；还是 Element Plus 组件、视觉风格与全局 UI 统一）涉及 UI/交互一致性取向，需要人工/产品决策，不属于逻辑合并范畴。

### `EditItems/SignatureConfigEditor.vue`

- **q-editor 侧行为**：签名题配置项标签（`label`，如"线条粗细""显示工具栏"对应的中文标签）通过原生 HTML `title` 属性提供 hover 全名提示，文字超出 80px 用 ellipsis 截断。模板同样有注释"文字过长时靠原生 title 兜底显示全名"。
- **survey-engine 侧行为**：标签文字包裹在 `<el-tooltip :content="label" placement="top">` 中，hover 展示 Element Plus 自定义 tooltip。截断 CSS 与双方 `<script>` 逻辑（`configKey` 到标签的映射、`selectOption` 更新逻辑）完全一致。
- **为何无法简单并集**：与 `ButtonGroup.vue` 完全相同的原因——原生 `title` 与 `el-tooltip` 是同一交互需求的两种互斥实现，同时使用会产生双重 tooltip 冲突，需要人工决定统一采用哪种 tooltip 方案（并建议与 `ButtonGroup.vue` 的决议保持一致，因为二者是同一种模式在不同文件中的重复出现）。

---

**补充建议**：`ButtonGroup.vue` 与 `SignatureConfigEditor.vue` 的分歧本质是同一个"tooltip 技术选型"问题的两处实例，建议在做人工决议时一并处理、统一结论（例如：全局统一改用 `el-tooltip` 或全局统一保留原生 `title`），避免后续在合并两个组件目录时出现风格不一致。

## 补充记录（Phase 2.1，T003-T009 执行过程中发现）

以下为完成 `client_key` 动态规则管理方法迁移（T003-T008）及配套测试（T009）过程中新发现并已当场修复的分歧点，按 FR-009 记录，不属于 T002 审计范围（该范围限定于 `SurveyComs/` 组件目录），补充于此以保证审计留痕完整。

### `Status` 类型缺少 `client_key`/`logic` 字段（已修复）

- **发现**：`packages/survey-engine/src/types/common.ts` 的 `Status` 接口原先没有 `client_key?: string` 与 `logic?: QuestionLogicConfig | null` 字段，而 `app/q-editor/src/types/common.ts` 的同名接口已有这两个字段（并从 `monorepo-survey-engine` 外部导入 `QuestionLogicConfig`）。若不修复，T004-T008 新增的 Store 方法（读写 `com.client_key`/`com.logic`）无法通过类型检查。
- **能否简单并集**：能。这是纯粹的类型定义遗漏（共享包尚未补齐该字段），并非行为分歧，直接按 q-editor 侧的字段定义补齐即可，无需人工决议。
- **处理结果**：已修复。在 `packages/survey-engine/src/types/common.ts` 中新增两个字段，`QuestionLogicConfig` 改用包内部相对路径 `../core/logic/index.js` 导入（q-editor 侧因是外部消费方使用包名 `monorepo-survey-engine` 导入，两者导入路径不同属预期，指向同一类型定义）。已通过 `pnpm --filter monorepo-survey-engine run type-check` 验证零错误。

### `addCom` 缺少 `client_key` 自动生成逻辑（已修复）

- **发现**：q-editor 侧 `addCom` 在新增题目时会自动为缺少 `client_key` 的题目生成一个 UUID v4；survey-engine 侧迁移前的 `addCom` 没有这一步。tasks.md 中 T004-T008 引用的行号范围（q-editor `useEditor.ts` 第 208-277 行）未覆盖到 `addCom` 本身（在第 182-193 行），因此未被显式列为独立任务，但属于同一 `client_key` 生命周期能力（FR-002）的必要前置——否则新建题目永远没有 `client_key`，T004-T008 新增的按 `client_key` 查找/写入方法对新题目将全部失效。
- **能否简单并集**：能。纯粹是行为补齐（生成缺失的稳定标识），不改变任何既有行为，是安全的超集追加。
- **处理结果**：已修复。在实现 T004-T008 的同一次编辑中，于 `packages/survey-engine/src/stores/useEditor.ts` 的 `addCom` 方法内补充了与 q-editor 侧一致的 `if (!newCom.client_key) { newCom.client_key = uuidv4(); }` 逻辑。

### `ensureComClientKey` 签名：设计文档与实际代码不一致

- **发现**：`data-model.md`（第 2 节）与 `contracts/survey-engine-exports.md`（第 1 节）均记录 `ensureComClientKey(com: Status): ClientKey`，但 `tasks.md` T005 与 q-editor 实际源码（`stores/useEditor.ts` 第 219 行起）均为 `ensureComClientKey(index: number): string`。经 grep `app/q-editor/src` 中全部真实调用点（`components/Logic/LogicPanel.vue`）确认，实际调用永远传入 `props.index`（number），从未传入 `Status` 对象。
- **能否简单并集**：不完全适用"并集"框架——这不是两侧行为不同，而是设计文档滞后于代码的文档缺陷。已按"tasks.md + 实际代码"这一更权威的执行依据实现为 `(index: number): string`，与 q-editor 现有全部调用点保持兼容。
- **处理结果**：按 index 签名实现（已完成，见 T005）。**待办**：`data-model.md`、`contracts/survey-engine-exports.md` 中的签名描述需要人工同步更正为 `(index: number): string`，本次迁移未修改设计文档本身，仅在此记录不一致，避免后续读者依据设计文档产生误解。

### T009 任务描述引用的参照测试文件实际不存在对应断言

- **发现**：T009 要求"参照 `app/q-editor/src/stores/__tests__/useEditor.test.ts` 中对应断言迁移改写"，但通读该文件全文（412 行）确认其中不包含任何对 `getComByClientKey`/`ensureComClientKey`/`setComLogicByClientKey`/`findRuleReferencesTo`/`getDanglingReferencesFrom` 这 5 个方法的测试；进一步对 `app/q-editor/src` 全目录 grep 这 5 个方法名，仅命中 3 个非测试文件（`Center.vue`、`stores/useEditor.ts`、`components/Logic/LogicPanel.vue`），确认 q-editor 侧从未对这 5 个方法编写过自动化测试。
- **能否简单并集**：不适用——没有可迁移改写的源内容。
- **处理结果**：已在 `packages/survey-engine/src/__tests__/store.spec.ts` 中按 T009 自身列出的覆盖点（存在/不存在的 client_key 查找、`ensureComClientKey` 幂等性、`setComLogicByClientKey` 告警不抛异常、`findRuleReferencesTo`/`getDanglingReferencesFrom` 双向查找）独立编写全新测试用例，而非改写不存在的原有断言。已通过 `pnpm --filter monorepo-survey-engine test` 验证全部通过（114 个用例，5 个测试文件）。

## 补充记录（Phase 2.2，T010-T013 执行过程中发现）

### survey-engine 缺少 `survey` i18n 命名空间，选项联动提示文案落位不同

- **发现**：q-editor 侧的"需先完成依赖题"提示文案键为 `survey.optionDependencyPrompt`（定义在 `app/q-editor/src/i18n/{locale}/survey.ts`）；survey-engine 侧 i18n 结构固定为 `common`/`components`/`editor`/`materials`/`preview` 5 个静态命名空间（`src/i18n/index.ts`、`src/i18n/messages.ts`），并无 `survey` 命名空间。
- **能否简单并集**：能。仅是文案键位置不同，不构成行为分歧——直接在 survey-engine 已有的 `components` 命名空间下新增顶层键 `optionDependencyPrompt`（未嵌套进某个子组件对象，因为该提示由 `SingleSelect.vue`/`OptionSelect.vue` 两个组件共用），三语言文案原样迁移自 q-editor 对应 `survey.ts` 文件。
- **处理结果**：已修复。已在 `packages/survey-engine/src/i18n/{zh-CN,en-US,ja-JP}/components.ts` 中新增 `optionDependencyPrompt` 键，组件内引用方式为 `t("components.optionDependencyPrompt")`（区别于 q-editor 侧的 `t("survey.optionDependencyPrompt")`，键路径不同但文案内容一致）。未新建 `survey` 命名空间文件，因为仅这一条字符串需要迁移，新建整个命名空间不成比例。

### survey-engine 缺少组件级测试基础设施（`@vue/test-utils`/`element-plus`/`vue-i18n` 未声明为可解析依赖）

- **发现**：T012/T013 要求为 `SingleSelect.vue`/`OptionSelect.vue` 新增 Vue Test Utils 组件级测试，但 `packages/survey-engine/package.json` 此前未将 `@vue/test-utils` 列为 devDependency（仅 q-editor 侧有），`element-plus`/`vue-i18n` 也仅声明在 `peerDependencies` 中——虽然二者已通过 pnpm workspace 从 q-editor 的安装中提升到仓库根 `node_modules/.pnpm`，但未在 survey-engine 包目录下声明为直接依赖，无法从该包目录内 `require.resolve`，导致新测试文件无法导入。同时 `vitest.config.ts` 的 `test.include` 此前仅覆盖 `src/__tests__/**` 与 `src/adapters/**/__tests__/**`，未覆盖 `src/components/**/__tests__/**`，新测试文件不会被 vitest 拾取执行。
- **能否简单并集**：能。这是测试基础设施缺口而非行为分歧——按 spec.md FR-006/Assumptions 的例外条款（FR-010 高风险分歧点必须补充组件级测试），补齐测试运行所需的最小依赖与配置即可，不影响生产构建（`@vue/test-utils` 仅在 devDependencies 中，`element-plus`/`vue-i18n` 生产环境仍通过 `peerDependencies` 由消费方提供）。
- **处理结果**：已修复。在 `packages/survey-engine/package.json` 的 `devDependencies` 中新增 `@vue/test-utils@^2.4.11`（版本与 q-editor 一致）、`element-plus@^2.13.0`、`vue-i18n@^9.14.0`（版本均与既有 `peerDependencies` 声明一致，仅为测试环境补充可直接解析的依赖声明，不改变生产环境的 peer 依赖关系）；已运行 `pnpm install --filter monorepo-survey-engine` 完成安装。同步扩展 `vitest.config.ts` 的 `test.include` 数组，新增 `"src/components/**/__tests__/**/*.spec.ts"` 条目。已通过 `pnpm --filter monorepo-survey-engine test` 验证：新增 2 个组件测试文件（`SingleSelect.spec.ts`、`OptionSelect.spec.ts`）共 6 个用例全部通过，全量 120 个用例、7 个测试文件零失败。

## 补充记录（Phase 2.3，T014-T016 执行过程中发现）

### `upload.ts` 上传 URL 常量携带多余 `/api` 前缀，将导致请求 404（已修复）

- **发现**：`packages/survey-engine/src/api/upload.ts` 迁移前的 `UPLOAD_IMAGE_URL`/`UPLOAD_SURVEY_FILE_URL` 常量值分别为 `/api/q-editor/upload`、`/api/q-editor/survey-file/upload`，而 `packages/survey-engine/src/api/clients/server.ts` 的 `serverClient` 本身 `baseURL` 已经是 `/api`。两者拼接后实际请求路径会变成 `/api/api/q-editor/upload`。经查后端路由注册（`app/q-server/src/app.ts` 第 87 行 `.register(routes, { prefix: "/api" })` + `app/q-server/src/routes/index.ts` 第 143 行 `fastify.register(uploadRoutes, { prefix: "/q-editor" })`），真实路由为 `/api/q-editor/upload`，多一层 `/api` 会 404。对照 `app/q-editor/src/api/upload.ts` 的对应常量为 `/q-editor/upload`（不带 `/api`，与其 `serverClient` 的 `baseURL: "/api"` 拼接后恰好等于真实路由），确认 survey-engine 侧此前的常量值是错误的，且此前因 `serverClient` 一直没有 response 拦截器（本次 T014 才补上），这个 URL 拼接错误此前从未被任何测试或调用路径实际触发验证过（`uploadImage`/`uploadSurveyFile` 此前也没有单元测试覆盖真实网络路径）。
- **能否简单并集**：能。这是纯粹的 URL 拼写错误（多写了一层 `/api`），不是行为分歧，直接按 q-editor 侧的常量写法改为不带 `/api` 前缀即可，两侧最终指向同一后端路由。
- **处理结果**：已修复。在 T015 编辑 `upload.ts` 时，将 `UPLOAD_IMAGE_URL`/`UPLOAD_SURVEY_FILE_URL` 一并改为 `/q-editor/upload`、`/q-editor/survey-file/upload`（去掉多余的 `/api` 前缀），并新增 `UPLOAD_SIGNATURE_URL = "/q-editor/signature/upload"`，三者均与 `serverClient` 的 `baseURL: "/api"` 拼接后与后端真实路由一致。已通过 `npx vue-tsc --build --force` 与 `pnpm --filter monorepo-survey-engine test` 验证零新增错误、120 个用例全部通过（该发现纯属静态代码审查中发现，本次迁移未提供后端集成测试环境，无法直接对真实后端发起请求验证网络层修复效果，仅能确认修复后的 URL 拼接结果与后端路由注册路径字符串一致）。

### `upload.ts` 类型来源与 q-editor 侧的 `@common/*` 不一致（按现有模式保留本地定义，非缺陷）

- **发现**：`app/q-editor/src/api/upload.ts` 的返回类型（`ApiResponse<T>`、`SignatureUploadResponse` 等）导入自共享类型包 `@common/user/user.interface`、`@common/survey/survey-file.interface`；`packages/survey-engine/src/api/upload.ts` 此前及现在均未引用 `@common/*`，而是在包内本地定义同构类型（`UploadImageResponse`、`SurveyFileUploadResponse`）。
- **能否简单并集**：能，且无需改变现状——这不是行为分歧，是两个包各自的类型来源约定：survey-engine 作为独立发布的共享引擎包，不依赖 monorepo 内部的 `@common` 路径别名（避免引入额外的包间耦合与构建期路径解析要求），T015 新增的 `ApiResponse`（已提升至 `packages/survey-engine/src/types/common.ts` 供 `upload.ts`、后续 T020 的 `PicItem.vue` 共用）与 `SignatureUploadResponse` 均延续这一既有本地定义模式，字段结构与 `@common/survey/survey-file.interface.ts` 中的同名类型保持一致（`file_id`/`file_url` 两字段）。
- **处理结果**：无需修复，按既有模式实现，仅在此记录以说明该差异是有意为之而非疏漏。

### `Signature.vue` 上传中提示文案缺少 i18n 键（已修复）

- **发现**：T017/T018 为 `packages/survey-engine/src/components/SurveyComs/Materials/AdvancedComs/Signature.vue` 新增了 `<span v-if="uploading" class="signed-hint is-uploading">{{ t("components.signature.uploading") }}</span>`（原样迁移自 `app/q-editor` 同名文件第 40-42 行模板），但 survey-engine 侧 `src/i18n/{zh-CN,en-US,ja-JP}/components.ts` 的 `signature` 命名空间此前仅有 `undo`/`clear`/`signed`/`unsigned` 4 个键，没有 `uploading` 键；q-editor 侧同一 `signature` 块已有该键（zh-CN: "上传中..."，en-US: "Uploading..."，ja-JP: "アップロード中..."）。若不修复，运行时 `t()` 会回退展示原始键路径字符串而非文案。
- **能否简单并集**：能。纯粹是三语言文案键遗漏，不构成行为分歧，直接按 q-editor 侧对应文案原样迁移补齐即可。
- **处理结果**：已修复。在 `packages/survey-engine/src/i18n/{zh-CN,en-US,ja-JP}/components.ts` 的 `signature` 块中补充 `uploading` 键，三语言文案与 q-editor 侧完全一致。已通过 `npx vue-tsc --build --force`（零错误）与 `pnpm --filter monorepo-survey-engine test`（7 个测试文件、120 个用例全部通过）验证 T017/T018 全部改动零新增问题。

## 补充记录（Phase 2.4，T020-T021 执行过程中发现）

### `PicItem.vue` 的 `beforeAvatarUpload` 文件大小限制与提示文案不一致（待人工决议）

- **发现**：`app/q-editor/src/components/SurveyComs/Common/PicItem.vue` 的 `beforeAvatarUpload` 限制为 10MB（`rawFile.size / 1024 / 1024 > 10`），超限提示为硬编码中文字符串 `"文件大小不能超过 10MB"`；`packages/survey-engine` 同名文件限制为 2MB（`> 2`），超限提示为 i18n 键 `t("components.picItem.sizeLimit")`。T020 任务范围仅要求修正 `handleAvatarSuccess` 的响应体解析方式，未涉及 `beforeAvatarUpload`，故本次未一并修改，仅记录该新发现的分歧点。
- **能否简单并集**：不能——这是"允许上传的最大文件体积"这一业务阈值的实质性数值分歧（2MB vs 10MB），并非文案位置或非行为性差异，采用任一方数值都会实际改变另一方用户的可用性（2MB 会拒绝 3-10MB 之间原本可上传的文件；10MB 会放宽 survey-engine 现有限制），需要人工确认业务侧期望的真实阈值，不属于可无条件归并的范畴。
- **处理结果**：未修复，记录为待人工决议事项。**建议**：决议后同时更正提示文案的呈现方式是否统一为 i18n 键（当前 q-editor 侧为硬编码字符串，与其自身 i18n 基础设施不一致，属于该分歧的附带问题）。

## Phase 2 收尾核对结果（T024）

- **T022/T023（SinglePicSelect 答案发射修复）执行过程中**：未发现新分歧点——该文件本身就是 FR-010 预先列出的第 5 项已知分歧点，实际改造内容（`defineEmits(["updateAnswer"])` + `emitAnswer` + `@change` 绑定）与 q-editor 侧源码逐字节比对一致，符合预期，无需额外记录。
- **T003-T023 累计改动的一致性核对**：在共享包目录下运行 `npx vue-tsc --build --force`，零类型错误（`strict: true` 下全程未引入 `any`，涉及内部未导出绑定访问的测试用例统一使用 `unknown` 中转收窄类型的既定模式）；运行 `pnpm --filter monorepo-survey-engine test`，10 个测试文件、127 个用例全部通过，覆盖 `core/logic`、`adapters/vue3` 既有测试与本阶段新增的 4 个组件级测试文件（`SingleSelect.spec.ts`、`OptionSelect.spec.ts`、`Signature.spec.ts`、`PicItem.spec.ts`、`SinglePicSelect.spec.ts`），未破坏任何既有用例。
- **结论**：Phase 2（Foundational）全部任务（T003-T023）已完成且互相验证一致，共享引擎已成为功能超集（FR-003 达成），可以进入 Phase 3 切换 `q-editor` 依赖。

## 补充记录（Phase 3，T025-T027 执行过程中发现）

### `packages/sse-client/src/ai.ts(323,13)` 的既有 `TS2322` 缺陷在 `q-editor` 自身 `type-check` 命令下也开始显现（非新增缺陷，仅记录以避免误判）

- **发现**：T001 基线记录中，该缺陷（`title` 可选属性类型不匹配）仅在第 5 条命令（仓库根级 `tsc --noEmit -p tsconfig.json`）的输出中出现，`pnpm --filter q-editor run type-check`（第 4 条命令）当时的输出只有 3 处错误（`Signature.vue`、`TemplateMarket.vue` ×2），不含此项。完成 T025（将 `app/q-editor/src/composables/useAIPolish.ts` 等 15 处文件的 `useEditorStore` 导入源由 `@/stores/useEditor` 改为 `monorepo-survey-engine`）后，重新运行 `pnpm --filter q-editor run type-check`，该缺陷开始一并出现。经排查：`useAIPolish.ts` 本身早已导入 `monorepo-sse-client/ai` 的 `AIPolishResult` 类型（本次未改动这一行），本次改动仅替换了同文件内另一行的 store 导入来源；这次改动使 `vue-tsc --build` 的增量编译缓存对该文件重新触发完整类型检查，因而"顺带"暴露出该文件依赖图中早已存在、此前被增量缓存掩盖而未在该特定命令下报出的 `sse-client` 缺陷，并非本次迁移引入的新缺陷——错误内容、文件、行号均与 baseline.md 第 5 节记录的既有缺陷完全一致。
- **能否简单并集**：不适用——不是行为分歧，是同一既有缺陷在不同命令的增量缓存状态下是否被报出的差异，缺陷本体已在 baseline.md 中记录并排除在零回退判定之外。
- **处理结果**：无需修复（超出本次迁移范围，且已被 baseline.md 第 5 节收录为"与本次迁移无关"）。仅在此记录该缺陷现在会在 `q-editor` 自身 `type-check` 命令下一并出现，避免后续读者误判为 T025/T026 引入的新增类型错误。T027 的判定仍以"零新增错误"为准——本次改动后出现的 4 处错误（`Signature.vue` TS2345、`TemplateMarket.vue` TS2345/TS18047、`sse-client/ai.ts` TS2322）均是 baseline.md 已记录的既有缺陷，无一处是本次迁移新增。

## 补充记录（Phase 4，T033/T034 执行前排查发现）

### tasks.md 原始 T034 描述未覆盖 `configs/defaultStatus/*` 子系统与 `EditPannel` 直接引用（已修复，属任务描述范围遗漏，非行为分歧）

- **发现**：在执行 T034（删除 `SurveyComs/` 下与共享包重复的组件文件）前的依赖排查中发现，`app/q-editor/src` 内存在一套独立于 `componentMap`/`useEditorStore` 之外、tasks.md 原始 T034 描述未曾提及的"默认状态工厂"子系统（`configs/defaultStatus/defaultStatusMap.ts`、`configs/defaultStatus/initStatus.ts` 及各题型对应的工厂函数文件），这些文件直接 `import` 并 `markRaw()` 本地 `SurveyComs` 目录下的业务组件与 EditItems 编辑器组件引用。此外 `views/MaterialsView/Layout.vue`、`views/EditorView/RightSide.vue` 直接硬编码 `import EditPannel from "@/components/SurveyComs/EditItems/EditPannel.vue"`（未经 `componentMap` 间接查找）。若不先处理这些引用点即执行 T034 的物理删除，会造成大范围死引用、新增题目/初始化问卷/编辑面板渲染功能失效，违反 FR-003"不允许能力空窗期"的精神（该约束原文描述"切换依赖前被依赖方须先成为功能超集"，同样适用于"删除本地实现前必须确保所有消费点已切换完毕"）。
  经比对确认：`packages/survey-engine/src/configs/defaultStatus/{defaultStatusMap.ts,initStatus.ts,selector/SingleSelect.ts}` 与 q-editor 本地同名文件逐字节一致（仅 import 路径写法从别名改为相对路径），共享包侧此前（Phase 2 之前的既有能力）已是功能超集，仅未在 `index.ts` 中导出 `genderStatus`/`educationStatus`/`careerStatus`/`ageStatus` 四个选项数组常量及 `EditPannel` 组件本身；`EditPannel.vue` 本身已在 T002 审计中确认"无差异"。
- **能否简单并集**：能。这不是行为分歧，是 T025/T026 依赖切换范围未覆盖到的遗漏点（T025/T026 仅切换了 `useEditorStore`/`componentMap` 两项，未涉及 `defaultStatusMap`/`initStore`/`EditPannel` 的直接消费点）——共享包内容已是等价超集，只需补齐缺失的顶层导出并将消费方的导入源重定向即可，不涉及任何行为取舍决策。
- **处理结果**：已修复。
  1. 在 `packages/survey-engine/src/index.ts` 中补充导出 `genderStatus`/`educationStatus`/`careerStatus`/`ageStatus`（与 `initStore` 同一 `configs/defaultStatus/initStatus` 模块）及 `EditPannel`（`components/SurveyComs/EditItems/EditPannel.vue` 的具名默认导出）。
  2. 将 `app/q-editor/src/stores/useMaterial.ts`、`app/q-editor/src/components/Editor/SurveyComItem.vue`、`app/q-editor/src/utils/aiToStatus.ts`、`app/q-editor/src/utils/index.ts` 中对本地 `@/configs/defaultStatus/*` 的导入全部改为从 `monorepo-survey-engine` 导入。
  3. 将 `app/q-editor/src/views/MaterialsView/Layout.vue`、`app/q-editor/src/views/EditorView/RightSide.vue` 中对本地 `@/components/SurveyComs/EditItems/EditPannel.vue` 的硬编码导入改为从 `monorepo-survey-engine` 导入具名 `EditPannel`。
  4. `Layout.vue` 第 211-223 行原有的按字符串路径拼接的动态 `import(`@/configs/defaultStatus/${...}`)`（该导入结果实际未被使用，`.then()` 回调中的赋值逻辑早已被注释掉，纯粹是遗留死代码）改为指向共享包同名子路径（复用 T027 已验证可行的 `"./*": "./src/*"` 通配导出机制），避免删除本地目录后触发 404 报错，同时保持该死代码原有的"无实际效果"行为不变，未借此机会激活其被注释掉的逻辑（超出本次迁移范围）。
  5. 同步更新 `app/q-editor/src/test-setup.ts`、`app/q-editor/src/utils/__tests__/aiToStatus.test.ts` 中对 `@/configs/defaultStatus/{initStatus,defaultStatusMap}` 的 `vi.mock` 路径，改为 mock `monorepo-survey-engine/configs/defaultStatus/{initStatus,defaultStatusMap}`（与 T027 处理 `db/operation` mock 路径失效问题时采用的同一手段）。
     验证结果详见 `verification-log.md` T033/T034 补充验证一节。

### `router/index.ts` 中 29 处硬编码本地 `SurveyComs/Materials/*` 组件动态 import 未被 tasks.md 原始 T034 覆盖（已修复，属任务描述范围遗漏，非行为分歧）

- **发现**：在完成上一条"`configs/defaultStatus/*` 与 `EditPannel`"遗漏点修复后，为 T034 做第二轮排查，用 Grep 搜索全项目对 `@/components/SurveyComs/` 与 `@/configs/componentMap` 的引用（覆盖 31 个文件、217 处匹配），逐一甄别哪些是"即将随 `SurveyComs/` 目录整体删除而自然消失的内部引用"（本地 `configs/defaultStatus/*.ts` 工厂文件对本地组件的 import、本地 `SurveyComs/**/*.vue` 组件之间的相互引用、`configs/componentMap.ts` 自身），哪些是需要在删除前先重定向的外部真实消费点。甄别结果确认唯一的外部消费点是 `app/q-editor/src/router/index.ts`：该文件 `createAppRouter()` 的 `/materials` 路由树下，共 29 处硬编码动态 `import("@/components/SurveyComs/Materials/...")`，用于"组件市场"页面按路由预览各题型的默认渲染样式（select-group 5 处、input-group 1 处、advanced-group 6 处、note-group 1 处、personal-info-group 11 处复用 `TextInput.vue`/`SingleSelect.vue`、contact-group 5 处复用 `TextInput.vue`）。这些路由由 `views/MaterialsView/Layout.vue` 的 `<Router-View v-slot="{ Component }">` 消费渲染。若不先重定向即执行 T034 删除本地 `SurveyComs/` 目录，这 29 处动态 import 会在路由懒加载时触发模块解析失败，导致"组件市场"预览功能整体失效，同样违反 FR-003"不允许能力空窗期"的精神。
- **能否简单并集**：能。这不是行为分歧，纯粹是路径重定向——共享包 `packages/survey-engine/src/components/SurveyComs/Materials/` 下的同名组件已在 T002 审计中确认与本地版本行为等价（逐字节一致或已回补为功能超集），且共享包 `package.json` 已声明 `"exports": { "./*": "./src/*" }` 通配子路径导出，可直接用于 `.vue` 文件的动态 import 路径重定向（与 T027 处理 `db/operation`、上一条遗漏点处理 `configs/defaultStatus/*` 采用的同一机制）。
- **处理结果**：已修复。将 `app/q-editor/src/router/index.ts` 中全部 29 处 `import("@/components/SurveyComs/Materials/...")` 改为 `import("monorepo-survey-engine/components/SurveyComs/Materials/...")`，逐一对应保持原有的分组路由结构和组件复用关系不变（如 personal-info-group 与 contact-group 中多个路由复用同一个 `TextInput.vue`/`SingleSelect.vue`，重定向后依然复用共享包内的同一物理文件）。验证结果详见 `verification-log.md` T033/T034 补充验证一节。

### `EditorView/__tests__/index.spec.ts` "Ctrl+S 保存" 用例因 store 持久化调用改道共享包内部模块而失败（已修复，属测试基础设施缺口，非生产行为回退）

- **发现**：T025 将 `app/q-editor/src/views/EditorView/index.vue` 的 `useEditorStore` 导入源切到 `monorepo-survey-engine` 后，运行 `pnpm --filter q-editor test` 新增 1 处失败：`src/views/EditorView/__tests__/index.spec.ts` › "Ctrl+S 保存已有问卷成功时上报 editor_save 耗时，success=true"（`trackTimingSpy` 期望 `success: true` 实际收到 `success: false`，并伴随 3 次未处理的 `MissingAPIError: IndexedDB API missing` 拒绝）。经排查根因：`doSave()` 中的 `store.updateComs(surveyId, ...)` 调用的是共享包自身 `packages/survey-engine/src/stores/useEditor.ts` 第 361-364 行的 `updateComs` action，其内部直接 `import { saveSurvey, updateSurveyById } from "../db/operation"`（包内部相对路径，指向 `packages/survey-engine/src/db/operation.ts`），与 `index.vue` 顶部另行直接导入、且已被测试用 `vi.mock("@/db/operation", ...)` 成功拦截的 q-editor 本地 `@/db/operation` 是两个不同的物理文件；切换 store 来源前，本地旧 Store 内部调用的正是被 mock 命中的同一个 `@/db/operation`，因此从未暴露过这条路径。对比两个 `db/operation.ts` 源码（均只是 `import { db } from "./db"` 后包一层 Dexie 调用，行为逐字节等价，仅有日志详略之差），确认这不是生产行为差异——测试环境（happy-dom）本身缺失原生 IndexedDB 实现，真实浏览器环境下两侧的 Dexie 封装均能正常读写同一套 IndexedDB API，因此不构成 SC-001 意义上的功能回退，纯属"测试 mock 拦截的模块路径未随迁移同步更新"的测试基础设施缺口。
- **能否简单并集**：不适用——不是行为分歧，是测试文件对被测模块内部依赖路径的 mock 覆盖范围需要跟随迁移同步扩展的问题。
- **处理结果**：已修复。利用 `packages/survey-engine/package.json` 已声明的 `"exports": { "./*": "./src/*" }` 通配子路径导出规则，在 `index.spec.ts` 中新增一条 `vi.mock("monorepo-survey-engine/db/operation", () => ({ getSurveyById, updateSurveyById, saveSurvey }))`（复用既有的 `getSurveyByIdMock`/`updateSurveyByIdMock`/`saveSurveyMock` 三个 spy），该specifier 解析到与 `useEditor.ts` 内部 `../db/operation` 相同的物理文件 `packages/survey-engine/src/db/operation.ts`，因此可正确拦截 store 内部调用，不再触发真实 IndexedDB 访问。修复后重新运行 `pnpm --filter q-editor test`：**4 个测试文件失败 → 2 个**，**5 个用例失败 → 4 个**（465 个用例通过，总用例数 469 不变），剩余 4 处失败逐一核对均与 baseline.md 第 2 节记录的既有失败（`serverClient.test.ts` 401 相关 2 处、`settings/index.test.ts` `uploadAvatar` 2 处）完全一致，零新增失败项。同步运行 `pnpm --filter q-editor run type-check`：4 处错误（`Signature.vue` TS2345、`TemplateMarket.vue` TS2345/TS18047、`sse-client/ai.ts` TS2322）均与 baseline.md 第 4/5 节记录的既有缺陷一致，零新增类型错误。T027 达成"确认无新增失败项"验收标准。

## T034 执行记录：实际删除范围与 tasks.md 原始描述的两点差异（均为技术必要性/统计口径差异，非行为分歧）

- **差异一：同名文件数量校正为 37 个，而非 T002 审计所述的 35 个**。执行删除前用 `comm` 命令逐一比对 `app/q-editor/src/components/SurveyComs/` 与 `packages/survey-engine/src/components/SurveyComs/` 两侧目录文件列表，确认：q-editor 侧独有文件 0 个，共享包侧独有文件 5 个（均为共享包自身的 `*.spec.ts` 测试文件，不受影响），**两侧同名文件 37 个**（完整清单：`Common/MaterialsHeader.vue`、`Common/PicItem.vue`、`EditItems/` 下 20 个、`Materials/AdvancedComs/` 下 6 个、`Materials/ComputedComs/ComputedField.vue`、`Materials/InputComs/TextInput.vue`、`Materials/MatrixComs/MatrixSingle.vue`、`Materials/NoteComs/TextNote.vue`、`Materials/SelectComs/` 下 5 个）。这证明 q-editor 侧 `SurveyComs/` 目录内**不存在**任何独有文件，可安全整体删除。判定该计数差异属于此前 T002 审计的统计误差（可能因审计时点早于个别文件的后续新增/复制），不影响处理方式——无论 35 个还是 37 个，删除逻辑与验证方法完全一致，不构成需要人工决议的行为分歧。
- **差异二：`app/q-editor/src/configs/defaultStatus/` 整个目录（17 个文件）必须与 `SurveyComs/` 一并删除，尽管 tasks.md 原始 T034 描述未提及该目录**。在执行删除前的最终排查中确认：`configs/defaultStatus/` 目录内几乎每个文件（`advanced/*.ts`、`selector/*.ts`、`input/TextInput.ts`、`matrix/MatrixSingle.ts`、`remark/TextNote.ts`、`computed/ComputedField.ts`、`initStatus.ts`）都硬编码 `import ... from "@/components/SurveyComs/..."`，用于 `markRaw()` 挂载题型组件与编辑器组件引用。同时确认该目录已无任何外部消费点（唯一残留匹配是目录内部 `initStatus.ts` 对同目录 `remark/TextNote.ts` 的自引用；此前"补充记录（Phase 4，T033/T034 执行前排查发现）"一节已将全部外部消费点重定向至 `monorepo-survey-engine`）。**这与本次会话中探索性放弃的 `utils/index.ts` restoreComponentStatus 重导出改动性质不同**：后者对被删除文件（`configs/componentMap.ts`）没有任何依赖关系，纯粹是"顺手清理"，故主动撤销；而 `configs/defaultStatus/` 对 `SurveyComs/` 存在实质导入依赖——若只删除 `SurveyComs/` 保留 `defaultStatus/`，会留下 17 个文件的死导入，`vue-tsc --build`（tsconfig `include` 通配符覆盖全部 `.ts` 文件，不区分是否被外部引用）必然报出大量新增类型错误，属于删除 `SurveyComs/` 的技术必要前提，不是范围蔓延。
- **能否简单并集**：能。两点差异均不涉及行为取舍，纯粹是统计口径校正与技术必要性判断。
- **处理结果**：已修复。用 `git rm -f` 一次性删除 `app/q-editor/src/components/SurveyComs/`（37 个文件）、`app/q-editor/src/configs/defaultStatus/`（17 个文件）、`app/q-editor/src/configs/componentMap.ts`（1 个文件），共 55 个文件。验证结果详见 `verification-log.md` T033-T035 补充验证一节。

## 已探索但主动撤销、未纳入本次改动范围的项：`utils/index.ts` 中 `restoreComponentStatus` 与共享包重复实现（不构成分歧，记录以避免后续重复踩坑）

- **发现**：`app/q-editor/src/utils/index.ts` 本地 `restoreComponentStatus` 与 `packages/survey-engine/src/adapters/vue3/restoreComponentStatus.ts` 的共享包实现存在功能重叠（后者是超集：额外支持 `editComName` 字段回退兼容 + 未知题型告警日志）。尝试将本地实现改为重导出共享包版本，验证时发现新增 1 处测试失败（`src/utils/__tests__/index.test.ts` › "应不修改已有 type 的组件"）：根因是共享包内部 `restoreComponentStatus` 通过包内相对路径 `./componentFactory` 解析 `resolveVue3Component`，这条路径**不受**测试对 `monorepo-survey-engine` 导出 `componentMap` 的 `vi.mock` 拦截影响（`vi.mock` 只拦截显式导入该 specifier 的调用方，不影响包内部文件间的相对路径引用），会真实解析出 `single-select` 对应的 Vue 组件并覆盖 `com.type`，与该测试断言"类型引用不变"矛盾。
- **判定**：本地 `restoreComponentStatus` 早已从 `monorepo-survey-engine` 导入 `componentMap`（T026 切换后），不依赖本地 `configs/componentMap.ts` 文件，因此这次重导出改动**不是**删除本地文件的必要前提，纯属额外的、超出 T034 字面范围的重复代码清理机会。鉴于该改动会引入新增测试失败且非必需，遂完整撤销，将 `utils/index.ts` 恢复为改动前状态（重新运行 `pnpm exec vitest run src/utils/__tests__/index.test.ts` 确认 33 个用例全部通过，零新增失败）。
- **结论**：`utils/index.ts` 保持原样，不在本次迁移范围内处理。此项遗留重复代码留给未来单独评估（不属于 SC-002 判定范围内的"与 `SurveyComs/`/`componentMap.ts`/`defaultStatus/` 同级的题型渲染实现重复"，而是工具函数级别的次要重复，风险收益比不支持在本次迁移中处理）。
