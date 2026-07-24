# Tasks: q-editor GitHub Pages 静态演示

**Input**: Design documents from `/specs/006-q-editor-standalone-demo/`

**Prerequisites**: plan.md (✅), spec.md (✅), research.md (✅), data-model.md (✅), contracts/ (✅), quickstart.md (✅)

**Tests**: 本功能为演示态客户端 Mock 脚手架，不新增业务分支逻辑，按 Constitution Principle V 豁免自动化单测；但 UI 黄金路径与边界场景的**手动验证**是必须项（见 Phase 8 / quickstart.md），不可省略。

**Organization**: 按 User Story 分组，支持独立验证。本功能此前已完成大部分脚手架搭建（标记为 `[x]`），/speckit-plan 阶段的构建复现新发现了 3 个此前未被察觉、会导致"白屏/部署失败"的缺陷（T004、T005、T006），是本次任务列表新增的核心工作项。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可并行执行（不同文件，无依赖）
- **[Story]**: 所属 User Story（US1～US5）
- 每个任务包含具体文件路径

---

## Phase 1: Setup（项目脚手架）

**Purpose**: 独立 Mock 系统的目录结构与构建脚本初始化

- [x] T001 创建 `app/q-editor/src/standalone/` 目录（脱离 `vite-plugin-mock` 的 `./src/mock` 扫描范围，避免路径别名解析冲突）
- [x] T002 [P] 在 `app/q-editor/package.json` 新增 `build:standalone` / `preview:standalone` 脚本
- [x] T003 [P] 修改 `app/q-editor/index.html` 标题为 "FormForge - 低代码问卷编辑器"

---

## Phase 2: Foundational（阻塞所有 User Story 的关键修复）

**Purpose**: 修复三个会导致"演示流程整体不可用"的底层缺陷——任一未修复都会阻塞后续所有 User Story 的验证

**⚠️ CRITICAL**: 本阶段任务必须全部完成，才能开始任何 User Story 的验证工作

- [x] T004 修复 `app/q-editor/vite.config.ts` 的 `manualChunks` 循环 chunk 依赖：删除 `vuedraggable` 的专属分组判断（`if (pkgName === "vuedraggable") return "draggable";` 整段），使其落入兜底 `vendor` 规则，消除 `vue-vendor → vendor → draggable → vue-vendor` 与 `vendor → draggable → vendor` 两条循环链路；进一步修复 `@vue/*` 子包被误判入 `vendor`、以及 Rollup 合成的 CJS 互操作辅助模块（`getAugmentedNamespace`）落入 `vendor` 导致的 `vendor → vue-vendor → vendor` 深层循环（构建日志中的 `Circular chunk` 警告已完全消失，`npx vite build --mode standalone` 验证通过）——这是导致浏览器报 `Uncaught ReferenceError: Cannot access 'b' before initialization` 白屏的根因（对应 SC-001、FR-003）
- [x] T005 修复 `.github/workflows/deploy-q-editor-pages.yml` 第 47-49 行：`pnpm/action-setup@v4` 移除硬编码 `version: 9`，改为不传 `version`（让其自动读取根 `package.json` 的 `packageManager: "pnpm@10.12.4"` 字段）——当前固定版本 9 与根 `.npmrc` 的 `engine-strict=true` + `package.json` 的 `"pnpm": ">=10.12.4"` 约束冲突，会导致 CI 中 `pnpm install` 直接失败，GitHub Actions 部署根本无法跑通（对应 FR-002）
- [x] T006 新增 GitHub Pages SPA 路由回退支持：在 `.github/workflows/deploy-q-editor-pages.yml` 的"构建 q-editor（Standalone 模式）"步骤之后、"配置 GitHub Pages"步骤之前，新增一步 `cp app/q-editor/dist/index.html app/q-editor/dist/404.html`——`vue-router` 使用 `createWebHistory`（HTML5 history 模式），而 GitHub Pages 是纯静态文件服务器无法做服务端 rewrite，用户直接访问或刷新子路径（如 `/home`）会收到 GitHub Pages 原生 404 页面而非 SPA 页面；复制 `index.html` 为 `404.html` 是 GitHub Pages 官方推荐的 SPA fallback 方案（对应 US1 场景 4、SC-004、Edge Case「路由刷新处理」）
- [x] T007 [P] 修复 `app/q-editor/src/standalone/setup.ts` 的 URL 匹配逻辑：拼接 `(config.baseURL ?? "") + (config.url ?? "")` 后再判断 `/api` 前缀（此前仅判断 `config.url`，因两个 axios 实例的 `baseURL` 本身已是 `/api`，导致该判断永远为 false，Mock 从未被激活）
- [x] T007a 修复 `app/q-editor/src/standalone/adapter.ts` 的同类 URL 拼接缺陷：`standaloneMockAdapter` 内部独立重新计算 `url`（`const url = config.url ?? ""`），未拼接 `config.baseURL`，导致 T007 修复后 `setup.ts` 已能正确挂载 `config.adapter`，但 adapter 自身的 `/api` 前缀判断依然永远为 false，一键登录等所有请求都被误判为"非 API 请求"直接跳过 Mock、返回假 `{ data: null, status: 200 }`，前端访问 `res.code` 时抛出 `TypeError` 并被 `LoginForm.vue` 的兜底 `catch` 吞掉，表现为固定的"登录失败，请检查网络连接"提示——现已改为拼接完整路径后再判断，并将拼接后的完整路径传入 `handleRequest()`（`handlers.ts` 内部路由匹配同样依赖 `/api/...` 前缀）；另修复 `main.ts` 中 standalone 模式下埋点 SDK（`installTracking`）底层走 `fetch`/`sendBeacon`、不经过被 Mock 的 axios 实例、持续向不存在的后端发起 `/api/v1/track/batch` 请求导致控制台报错刷屏的问题——standalone 模式下跳过埋点接入。已通过 Playwright 驱动真实浏览器对 `pnpm preview:standalone` 产物执行「打开登录页 → 点击一键演示登录 → 跳转 `/home`」全流程验证，且全程 0 条 console error

**Checkpoint**: 执行 `pnpm --filter q-editor build:standalone` 后终端不再出现 `Circular chunk` 警告；本地 `pnpm preview:standalone` 打开后 DevTools Console 无红色报错——基础打包与部署管线就绪，可以开始验证各 User Story

---

## Phase 3: User Story 1 — 访问者一键登录体验演示系统 (Priority: P1) 🎯 MVP

**Goal**: 用户打开演示页面即可一键登录并进入工作台，不白屏、无 JS 报错

**Independent Test**: 浏览器打开部署 URL → 页面正常渲染登录表单（已预填凭据）→ 点击「一键演示登录」→ 2 秒内进入首页；刷新页面不白屏

### Implementation for User Story 1

- [x] T008 [P] [US1] 在 `app/q-editor/src/standalone/data.ts` 定义 `DEMO_ACCOUNT`（`admin@example.com` / `Admin@123`）、`MOCK_TOKEN`/`MOCK_REFRESH_TOKEN`/`MOCK_TOKEN_EXPIRES_IN`/`MOCK_REFRESH_EXPIRES_IN`、`DEMO_AVATAR_URL`（`https://linzex.top/upload/1759642363899.gif`）、`demoProfile`
- [x] T009 [US1] 在 `app/q-editor/src/standalone/handlers.ts` 实现 `/api/auth/{status,login,refresh,logout,send-code,register,verify-register,reset-password}` 与 `/api/user/{me,profile,update,avatar,change-password,bind-email,account}` 的 Mock 响应，返回 `{code, msg, data}` 包体（依赖 T008）
- [x] T010 [US1] 在 `app/q-editor/src/standalone/adapter.ts` 实现 `standaloneMockAdapter`（`AxiosAdapter` 签名），匹配 `/api` 前缀请求 → 调用 `handleRequest` → 模拟 150-300ms 延迟 → 包装为 `AxiosResponse`；未匹配请求返回 404（依赖 T009）
- [x] T011 [US1] 在 `app/q-editor/src/standalone/setup.ts` 实现 `setupStandaloneMock()`，为 `api/clients/auth.ts`、`api/clients/server.ts` 两个 axios 实例注册请求拦截器并替换 `config.adapter`（依赖 T007、T010）
- [x] T012 [US1] 修改 `app/q-editor/src/main.ts` 的 `render()` 函数：在 Vue 应用初始化前，当 `import.meta.env.MODE === 'standalone'` 时 `await import("@/standalone/setup")` 并调用 `setupStandaloneMock()`（依赖 T011）
- [x] T013 [US1] 修改 `app/q-editor/src/views/login/component/LoginForm.vue`：`isStandalone` 判断下 `onMounted` 自动预填 `admin@example.com`/`Admin@123`，新增「🎯 演示模式」提示 banner 与「🚀 一键演示登录」按钮（`quickDemoLogin` 直接调用 `handleLogin`）
- [x] T014 [US1] 验证 `app/q-editor/src/components/Common/UserProfile.vue` 头像弹窗在 standalone 模式下正确读取 `userStore.profile.avatarUrl`（应显示 T008 中定义的 `DEMO_AVATAR_URL`）——已核对 `data.ts` → `handlers.ts` → `useUser.ts` → `UserProfile.vue` 全链路字段命名一致，均为 `avatarUrl`，无需改动
- [x] T015 [US1] 按 quickstart.md 步骤 1-3 手动验证：本地 `pnpm preview:standalone` 无白屏 → 一键登录 2 秒内跳转 → 头像弹窗显示正确头像 → 刷新页面（`F5`）不白屏不 404（依赖 T004、T006、T007a 已完成）——已通过 Playwright 自动化验证「登录页 → 一键登录 → `/home`」且 0 console error；头像弹窗与 F5 刷新场景仍建议人工在真实浏览器中复核一次

**Checkpoint**: User Story 1 可独立演示——这是整个功能的 MVP，也是用户报告"报错启动失败、页面白屏"问题的直接验收点

---

## Phase 4: User Story 2 — 浏览预置演示问卷 (Priority: P2)

**Goal**: 登录后首页展示预置问卷列表，点击可查看完整预览

**Independent Test**: 登录后首页展示 ≥2 份问卷（含已发布/草稿状态）→ 点击已发布问卷标题 → 预览页正常渲染所有题型组件

### Implementation for User Story 2

- [x] T016 [P] [US2] 在 `app/q-editor/src/standalone/data.ts` 实现 `makeDemoComponents(surveyId)` 工厂函数（生成 text_note 标题/描述、single_select、multi_select、text_input 五类组件）与 `createDemoSurveys()`/`surveyStore`（3 份问卷：2 已发布 + 1 草稿）
- [x] T017 [US2] 在 `app/q-editor/src/standalone/handlers.ts` 实现 `/api/surveys`（列表分页）、`/api/surveys/:id`（详情/更新/删除）、`/api/surveys/:id/publish`、`/api/surveys/:id/close`、`/api/surveys/:id/public`、`/api/surveys/:id/token`、`/api/surveys/:id/generate-link` 的 Mock 响应（依赖 T016）
- [ ] T018 [US2] 按 quickstart.md 步骤 4 手动验证：首页问卷列表状态标签正确、点击已发布问卷进入预览页后 5 类组件全部正常渲染无报错占位

**Checkpoint**: User Story 1 + 2 均可独立演示

---

## Phase 5: User Story 3 — 体验问卷编辑器 (Priority: P3)

**Goal**: 编辑器可正常打开、添加组件、保存（本地 IndexedDB）、预览

**Independent Test**: 首页点击「创建问卷」→ 编辑器打开 → 添加任意题型组件 → 保存提示成功 → 预览页正确展示

### Implementation for User Story 3

- [x] T019 [P] [US3] 在 `app/q-editor/src/standalone/handlers.ts` 实现 `/api/surveys`（POST 创建）、`/api/surveys/:id/responses`（GET/POST）、`/api/surveys/:id/submit-review`、`/api/surveys/:id/apply-template` 的 Mock 响应
- [ ] T020 [US3] 验证编辑器保存流程（`app/q-editor/src/db/operation.ts` 的 IndexedDB 写入）不依赖任何 Mock 拦截的 `/api/*` 请求——确认问卷编辑数据的持久化路径与 Mock 系统完全解耦，不会因 Mock 未覆盖某接口而中断保存
- [ ] T021 [US3] 按 quickstart.md 步骤 5 手动验证：编辑器添加组件可交互编辑 → 保存后 DevTools → Application → IndexedDB 出现新记录 → 预览页按序展示

**Checkpoint**: User Story 1-3 均可独立演示

---

## Phase 6: User Story 4 — 浏览组件市场和模板 (Priority: P4)

**Goal**: 组件市场与模板市场页面正常展示

**Independent Test**: 组件市场按题型分组展示预览；编辑器模板市场 tab 展示 ≥3 个预设模板

### Implementation for User Story 4

- [x] T022 [P] [US4] 在 `app/q-editor/src/standalone/data.ts` 实现 `templateStore`（5 个预置模板：员工满意度、客户反馈、活动报名、学术研究、市场调研，含 `usageCount`/`rating`/`components`）
- [x] T023 [US4] 在 `app/q-editor/src/standalone/handlers.ts` 实现 `/api/templates`（列表）、`/api/templates/:id`（详情）、`/api/templates/:id/apply`、`/api/templates/:id/rate` 的 Mock 响应（依赖 T022）
- [ ] T024 [US4] 按 quickstart.md 步骤 6 手动验证：组件市场左侧题型分组 + 右侧预览均正常；模板市场 tab 展示 5 个模板且字段完整

**Checkpoint**: User Story 1-4 均可独立演示

---

## Phase 7: User Story 5 — 个人设置与主题切换 (Priority: P5)

**Goal**: 设置页面预填演示资料；亮/暗主题、色弱模式、多语言切换均正常工作

**Independent Test**: 设置页展示预填资料；切换暗色模式/色弱模式/语言后页面样式与文案正确响应

### Implementation for User Story 5

- [x] T025 [P] [US5] 在 `app/q-editor/src/standalone/data.ts` 完善 `demoProfile`（昵称「管理员」、职业、bio、interests 等设置页所需字段）
- [x] T026 [US5] 在 `app/q-editor/src/standalone/handlers.ts` 实现 `/api/user/profile`（PUT 更新）、`/api/admin/{users,config}`（管理后台 CRUD/系统配置）的 Mock 响应（依赖 T025）
- [ ] T027 [US5] 按 quickstart.md 步骤 7 手动验证：设置页字段预填正确；暗色主题/色弱模式（红/绿/蓝/全色盲）/语言（中/英/日）切换均无样式错乱或文案缺失（主题与 i18n 切换本身是现有产品功能，此处仅验证其在 standalone 构建下不受 Mock 影响）

**Checkpoint**: 全部 5 个 User Story 均可独立演示，功能覆盖 100%（对应 SC-003）

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: 端到端收尾验证与代码质量把关

- [x] T028 [P] 对 `app/q-editor/src/standalone/**/*.ts` 运行 `pnpm --filter q-editor lint` 与根目录 `cspell lint`，确保零告警（对应 Constitution Principle VII）；若 `vuedraggable` 等专有名词被误报，添加至 `.cspell/custom-dictionary.txt`——已清理 `adapter.ts`/`handlers.ts` 中未使用的死代码（`AxiosRequestConfig` 多余类型导入、`buildContext`/`getPathParam`/`HandlerContext`），并补充 `intlify`/`treemap`/`monocart`/`birpc`/`hookable`/`vueuse`/`vuedraggable`/`demi`/`dexie`/`qrcode`/`VITE` 至自定义词典，`vite.config.ts`/`standalone/**`/workflow yaml 均已通过 eslint 与 cspell
- [x] T029 修正 `app/q-editor/vite.config.ts` 的 `base` 配置以支持从环境变量读取（如 `base: process.env.VITE_BASE ?? (standalone ? "/q-editor/" : "/")`），使 `.github/workflows/deploy-q-editor-pages.yml` 中 `workflow_dispatch` 的 `base-path` 输入参数（当前设置了 `VITE_BASE` 环境变量但 vite.config.ts 从未读取，输入形同虚设）真正生效
- [ ] T030 推送到 `preview` 分支（或手动触发 `workflow_dispatch`），验证 GitHub Actions `Deploy q-editor to GitHub Pages` 工作流完整跑通并成功部署
- [ ] T031 按 quickstart.md 步骤 8 在正式 GitHub Pages 环境重复步骤 1-7，确认生产环境行为与本地一致（尤其确认 `/q-editor/assets/...` 资源全部 200、404.html fallback 生效）
- [ ] T032 按 quickstart.md「回归检查清单」逐项勾选确认
- [x] T033 补齐消息通知模块 Mock（原规划遗漏，实测中发现"消息"铃铛面板报 `Mock 路由未配置`）：在 `app/q-editor/src/standalone/data.ts` 新增 `messageStore`（5 条演示消息，覆盖 `operation_notify`/`template_like`/`survey_lifecycle`/`user_admin_comm`/`admin_broadcast` 五种类型，已读/未读混合）；在 `app/q-editor/src/standalone/handlers.ts` 实现 `GET /api/messages`（分页 + type/is_read 筛选）、`GET /api/messages/unread-count`、`PUT /api/messages/:id/read`、`PUT /api/messages/read-all`、`DELETE /api/messages/:id`、`POST /api/messages/send` 的 Mock 响应。已通过 Playwright 驱动真实浏览器验证：登录后打开消息铃铛面板正确展示 5 条 Mock 消息且 0 条 console error；`eslint` 校验通过

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**：无依赖，已完成
- **Foundational (Phase 2)**：依赖 Setup 完成；**阻塞所有 User Story**——T004/T005/T006 是此前未被发现的真实缺陷，必须先修复
- **User Stories (Phase 3-7)**：均依赖 Foundational 完成；各 Story 内部已大部分实现，剩余工作是验证类任务
- **Polish (Phase 8)**：依赖期望交付的 User Story 全部完成

### User Story Dependencies

- **US1 (P1)**：Foundational 完成后可独立验证，无其他 Story 依赖
- **US2 (P2)**：可独立验证；与 US1 共享同一套 Mock 注入机制（T011），但数据/接口互不重叠
- **US3 (P3)**：可独立验证；编辑器保存路径（IndexedDB）与 Mock 系统解耦（T020 验证此解耦关系）
- **US4 (P4)**：可独立验证
- **US5 (P5)**：可独立验证；主题/i18n 切换是现有产品功能，仅需确认不受 Mock 影响

### Parallel Opportunities

- T002、T003 可并行（不同文件）
- T007 与 T004/T005/T006 可并行（不同文件，互不阻塞）
- 各 User Story 的 data.ts 数据定义任务（T008、T016、T022、T025）互不冲突，理论上可并行编写，但均已完成
- Phase 3-7 的手动验证任务（T015、T018、T021、T024、T027）在 Foundational 完成后可由不同验证者并行执行

---

## Parallel Example: Foundational 阶段修复

```bash
# T004、T005、T006 分别修改不同文件，可并行修复：
Task: "修复 vite.config.ts manualChunks 循环依赖"
Task: "修复 deploy-q-editor-pages.yml 的 pnpm 版本"
Task: "在 deploy-q-editor-pages.yml 新增 404.html fallback 步骤"
```

---

## Implementation Strategy

### MVP 优先（仅 User Story 1）

1. 完成 Phase 1（已完成）
2. 完成 Phase 2 Foundational（**当前最高优先级**——T004/T005/T006 三个真实缺陷是白屏与部署失败的直接原因）
3. 完成 Phase 3 User Story 1 剩余验证任务（T014、T015）
4. **停止并验证**：本地 `pnpm preview:standalone` 全流程走通，无白屏、无报错
5. 推送验证 GitHub Actions 部署（T030、T031）

### 增量交付

1. Foundational 修复后 → MVP（US1）验证通过 → 可视为"演示可用"的最低基线
2. 依次验证 US2 → US3 → US4 → US5（均已大部分实现，主要是手动验证工作）
3. 每个 Story 验证通过即可视为该维度演示就绪，不影响已验证的其他 Story

---

## Notes

- `[x]` 标记的任务已在此前的实现探索中完成并通过构建验证；`[ ]` 为本次规划新识别的待办项
- T004、T005、T006 是本次 `/speckit-plan` 阶段通过实际执行构建命令复现问题后新发现的真实缺陷，是解决用户反复反馈"报错启动失败、页面白屏"的关键任务，优先级高于所有 User Story 的验证工作
- 手动验证类任务（T014、T015、T018、T020-T021、T024、T027、T031-T032）不可用自动化测试替代，需在真实浏览器中操作确认（对应 Constitution Principle V 对 UI 变更的手动验证要求）
