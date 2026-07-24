# Implementation Plan: q-editor GitHub Pages 静态演示

**Branch**: `preview` | **Date**: 2026-07-24 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/006-q-editor-standalone-demo/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

`q-editor` 目前作为 qiankun 微前端子应用运行，其开发态 Mock（`vite-plugin-mock`）不会打进生产构建产物。本功能在不改动现有 qiankun 生命周期契约的前提下，新增一套仅在 `--mode standalone` 构建下生效的**纯客户端 axios 适配器 Mock 系统**（`src/standalone/{data,handlers,adapter,setup}.ts`），拦截全部 `/api/*` 请求并返回预置假数据，使 `q-editor` 可以打包为纯静态产物部署到 GitHub Pages 独立演示核心功能。

技术方案已完成初步实现（详见下方"当前实现状态"），但用户报告本地 `pnpm preview:standalone` 仍出现"启动失败、页面白屏"。本次规划已通过实际构建复现并定位到根因：`vite.config.ts` 的 `manualChunks` 函数生成了 **`vue-vendor → vendor → draggable → vue-vendor` 的循环 chunk 依赖**（Rollup 构建日志明确输出 `Circular chunk` 警告），这会导致浏览器按 chunk 间的循环加载顺序执行时命中某个 `const`/`let` 绑定的临时死区（TDZ），表现为 `Uncaught ReferenceError: Cannot access 'b' before initialization`。这是本次规划新增的关键技术发现，将作为 Phase 1 设计的一部分，指导后续 `/speckit-tasks` 生成对应修复任务。

## Technical Context

**Language/Version**: TypeScript 5.9（strict）、Vue 3.5

**Primary Dependencies**: Vite 7、vue-router 4、Pinia 3 + `pinia-plugin-persistedstate`、Axios、Element Plus、Dexie（IndexedDB）、vuedraggable、vue-i18n、`vite-plugin-qiankun`、`@vitejs/plugin-legacy`（均为项目既有技术栈约束，见 constitution 技术栈表）

**Storage**: 无后端/数据库依赖；问卷数据继续使用现有 IndexedDB（Dexie，`src/db/operation.ts`，不受本功能影响）；Mock 的用户态数据（Token/Profile）在内存 + `sessionStorage`/`localStorage`（复用现有 `useUser.ts` 持久化逻辑）中保存

**Testing**: Vitest（项目既有单测框架，`src/**/__tests__`）；本功能主要是构建配置与客户端 Mock 拦截层，属于演示态脚手架而非核心业务逻辑分支，按 Constitution Principle V 的范围界定不强制新增单元测试，但**必须**在真实浏览器中手动验证登录→首页→问卷预览→编辑器→组件市场→设置→主题切换的黄金路径与至少一个边界场景（路由刷新）

**Target Platform**: 静态托管（GitHub Pages 子路径 `/q-editor/`），现代浏览器（Chrome/Edge/Firefox 90+、Safari 14+），不支持 IE11

**Project Type**: 前端 Web 单页应用（现有 qiankun 子应用的独立部署构建模式，非新建项目）

**Performance Goals**: 首屏加载 ≤5s 且无 JS 报错（SC-001）；登录到首页总耗时 ≤10s（SC-002）；本地 `pnpm preview:standalone` 1 分钟内可访问（SC-006）

**Constraints**: standalone 构建产物零后端依赖；不得破坏现有 qiankun 生命周期契约与 `routerBase` 动态注入机制（Constitution Principle VIII）；不得引入会导致运行时 chunk 循环依赖/加载顺序错误的打包结构（Constitution Principle X）

**Scale/Scope**: 单一演示管理员账号；预置 3 份问卷（2 已发布 + 1 草稿）、5 个模板、3 个管理后台用户；覆盖 30+ 个 `/api/*` 端点的 Mock 映射；无并发多用户场景需要考虑

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| 原则                   | 评估                                                                                                                                                                                        | 结论                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| I. Monorepo 模块边界   | Mock 代码全部内聚在 `app/q-editor/src/standalone/`，未跨包引用其他 `app/*` 的 `src/`                                                                                                        | ✅ PASS                                                                 |
| II. 严格类型安全       | 新增 Mock 代码在 strict 模式下编译通过；仓库中 `Signature.vue`/`TemplateMarket.vue`/sse-client 的 `ai.ts` 存在与本功能无关的既有类型错误                                                    | ⚠️ 已知缺口，按 Governance 条款记录为独立遗留问题，不在本功能范围内修复 |
| III. 统一响应包体      | Mock handler 通过 `ok()/fail()` helper 返回 `{code, msg, data}`，与 `q-server` 真实响应包体一致                                                                                             | ✅ PASS                                                                 |
| IV. 安全默认           | 硬编码的是**演示专用假凭据**（`admin@example.com`/`Admin@123`）与假 Token，不涉及任何真实密钥/生产凭据                                                                                      | ✅ PASS（非本条款约束的"真实 secrets"场景）                             |
| V. 测试优先            | Mock 脚手架非核心业务分支逻辑，豁免单测强制要求；但 UI 黄金路径 + 边界场景手动验证为必须项，纳入 quickstart.md                                                                              | ✅ PASS（条件性豁免有据可查）                                           |
| VI. 可观测性           | Mock 适配器的 `log()` 仅在 standalone 模式下输出 `console.log`，不影响生产 `q-server`/`ai-service` 的结构化日志规范                                                                         | ✅ PASS                                                                 |
| VII. 代码风格/静态检查 | 新增/修改文件须通过 ESLint + Prettier + cspell 零告警                                                                                                                                       | ✅ PASS（在实现阶段强制执行）                                           |
| VIII. 微前端集成纪律   | `main.ts` 的 qiankun `mount`/`unmount` 生命周期与 `routerBase` 注入逻辑未改动；Mock 仅在 `import.meta.env.MODE === 'standalone'` 时激活，不影响 qiankun 场景                                | ✅ PASS                                                                 |
| IX. AI/LLM 治理        | 本功能不涉及任何 LLM 调用                                                                                                                                                                   | N/A                                                                     |
| X. 性能与打包完整性    | 发现 `vue-vendor ↔ vendor ↔ draggable` 循环 chunk（构建日志确认），是导致白屏报错的根因；修复方式是调整 `manualChunks` 分组消除循环，而非新增循环——属于对现有策略的**修正**而非破坏性变更 | ⚠️ 需在实现阶段修复，本规划已记录决策（见 research.md）                 |

**结论**：无不可调和的 gate 冲突，II 和 X 的已知缺口均有明确记录与后续处理路径，可进入 Phase 0。

## Project Structure

### Documentation (this feature)

```text
specs/006-q-editor-standalone-demo/
├── plan.md              # 本文件（/speckit-plan 输出）
├── research.md          # Phase 0 输出
├── data-model.md         # Phase 1 输出
├── quickstart.md         # Phase 1 输出
├── contracts/            # Phase 1 输出
│   └── mock-api-contract.md
└── tasks.md              # Phase 2 输出（由 /speckit-tasks 生成，本命令不创建）
```

### Source Code (repository root)

```text
app/q-editor/
├── src/
│   ├── standalone/                 # 【本功能新增】客户端 Mock 系统（仅 standalone 构建生效）
│   │   ├── data.ts                 # 演示假数据（用户/问卷/模板/管理后台/系统配置）
│   │   ├── handlers.ts             # URL+Method → Mock 响应 的路由映射
│   │   ├── adapter.ts              # AxiosAdapter 实现，模拟网络延迟
│   │   └── setup.ts                # 注入入口：为 authClient/serverClient 注册拦截器
│   ├── main.ts                     # 【修改】standalone 模式下前置调用 setupStandaloneMock()
│   ├── views/login/component/
│   │   └── LoginForm.vue           # 【修改】预填演示凭据 + 一键登录按钮
│   ├── api/clients/{auth,server}.ts  # 【不修改，仅读取】现有 axios 实例，baseURL 均为 "/api"
│   ├── stores/useUser.ts           # 【不修改，仅读取】双 Token 状态管理
│   └── db/operation.ts             # 【不修改】问卷数据 IndexedDB 持久化，不受 Mock 影响
├── vite.config.ts                  # 【修改】standalone base 路径 + manualChunks 循环依赖修复
├── package.json                    # 【修改】新增 build:standalone / preview:standalone 脚本
└── index.html                      # 【修改】演示站点标题

.github/workflows/
└── deploy-q-editor-pages.yml       # 【新增】GitHub Actions：push preview 分支 → 构建 → 部署 Pages
```

**Structure Decision**: 复用 `app/q-editor` 现有单体前端结构，不新建独立项目/包。所有新增代码收敛在 `src/standalone/` 一个目录下，与 `vite-plugin-mock` 扫描的 `src/mock/` 目录物理隔离（避免此前遇到的模块解析冲突），通过 `main.ts` 的运行时模式判断（`import.meta.env.MODE === 'standalone'`）激活，对 qiankun 生产路径零侵入。

## Complexity Tracking

> 无需填写：本功能未引入违反 Constitution 且无法通过标准豁免说明处理的复杂度。上表中 II、X 两项已在 Constitution Check 中给出具体理由与处理路径，均为对既有缺口的记录/修正，而非新增架构复杂度。
