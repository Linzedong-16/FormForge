# E2E 测试套件（Playwright）

本目录是 q-editor（问卷编辑器）的端到端（E2E）测试套件，基于 [Playwright](https://playwright.dev/) 构建，覆盖登录鉴权、编辑器核心操作、素材库、设置页、消息/头部导航、AI 生成、在线答题等全部关键用户流程。

## 技术栈与工作原理

- **测试框架**：`@playwright/test`，浏览器项目当前仅启用 `chromium`（见 `playwright.config.ts`）。
- **被测应用启动方式**：Playwright 的 `webServer` 会以 `pnpm dev:mock`（Vite mock 模式）在 `http://localhost:5173` 启动应用，无需依赖真实后端服务，所有接口均由 `src/mock/` 下的 Mock 数据提供。
- **覆盖率采集**：`vite.config.ts` 中仅在 `mock` 模式下启用 `vite-plugin-istanbul` 对 `src/**/*` 插桩。每个测试结束后，`fixtures/coverage.ts` 的 `collectCoverage()` 会从页面 `window.__coverage__` 读取覆盖率数据并落盘到 `e2e/.coverage/`；`global-teardown.ts` 在全部测试跑完后合并所有数据，生成：
  - `e2e/test-results/coverage-report.html`（可视化 HTML 报告）
  - `e2e/test-results/coverage-summary.json`（供工具/CI 消费的 JSON 摘要）
  - 可运行 `node e2e/_analyze_coverage.cjs` 按目录/文件筛选覆盖率薄弱的核心模块（`stores/`、`utils/`、`composables/`、`api/`、`db/`、`directives/`）。

## 目录结构

```
e2e/
├── playwright.config.ts     # Playwright 主配置（测试目录、超时、报告器、webServer 等）
├── tsconfig.json            # e2e 目录独立的 TS 项目引用，供 `pnpm type-check` 校验类型
├── global-setup.ts          # 全局启动前：清理上一轮覆盖率数据
├── global-teardown.ts       # 全局结束后：合并覆盖率、生成报告
├── _analyze_coverage.cjs    # 辅助脚本：按目录归类展示覆盖率，定位薄弱模块
├── fixtures/
│   ├── test-fixtures.ts     # 自定义 test/expect：authenticatedPage、adminPage、登录与导航辅助函数
│   ├── mock-data.ts         # 测试账号、路由表、Demo 问卷、超时常量等共享测试数据
│   ├── coverage.ts          # 单测试覆盖率采集与合并逻辑
│   └── coverage-reporter.ts # 覆盖率统计计算与 HTML 报告生成
├── helpers/
│   └── navigation.ts        # 通用页面导航/断言辅助函数（assertRoute、assertVisible 等）
└── tests/                   # 按业务域分目录的测试用例（见下）
```

## 测试用例组织（按业务域）

| 目录                            | 覆盖范围                                                                 |
| ------------------------------- | ------------------------------------------------------------------------ |
| `tests/auth/`                   | 登录/注册表单渲染、校验、成功/失败登录、密码显示切换、注册与登录切换     |
| `tests/editor/`                 | 编辑器整体操作、组件交互、保存流程、右侧面板、AI 生成面板、模板市场      |
| `tests/materials/`              | 素材库列表、素材编辑面板、高级组件、拖拽/交互                            |
| `tests/settings/`               | 个人资料 Tab、账号设置 Tab、Tab 切换、返回导航                           |
| `tests/header/`                 | 顶部导航、用户菜单                                                       |
| `tests/layout/`                 | 整体布局、生成链接弹窗                                                   |
| `tests/home/`、`tests/landing/` | 首页、落地页渲染                                                         |
| `tests/preview/`                | 问卷预览页                                                               |
| `tests/survey/`                 | 在线答题页渲染、填写、提交、异常处理                                     |
| `tests/routing/`                | 路由导航                                                                 |
| `tests/directives/`             | `v-permiss` 权限指令                                                     |
| `tests/ai/`                     | AI 生成相关 composable 与状态流转                                        |
| `tests/common/`                 | 生成分享链接功能                                                         |
| `tests/stores/`                 | 用户 Store 全链路（登录态、权限、状态恢复、多标签页）                    |
| `tests/e2e-flow.spec.ts`        | 跨页面的完整用户旅程（登录→编辑器→素材库→预览→设置）与响应式视口烟雾测试 |

同一业务域下常见 `xxx.spec.ts` / `xxx-deep.spec.ts` / `xxx-full.spec.ts` / `xxx-interaction.spec.ts` 的命名模式：分别对应基础渲染断言、深度交互场景、覆盖率导向的补充场景、专项交互测试，便于按需增量补充而不臃肿单个文件。

## 运行方式

在 `app/q-editor` 目录下：

```bash
pnpm test:e2e            # 运行完整 E2E 套件
pnpm test:e2e:ui         # 以 Playwright UI 模式运行，便于调试
pnpm test:e2e:report     # 打开上一次运行生成的 HTML 报告
pnpm test:all            # 先运行 Vitest 单测，再运行 E2E 套件

# 运行单个文件 / 目录
npx playwright test --config=e2e/playwright.config.ts e2e/tests/auth/login.spec.ts
npx playwright test --config=e2e/playwright.config.ts e2e/tests/editor
```

## 编写新测试的约定

1. **复用 fixtures，不要重复登录逻辑**：需要已登录态时使用 `authenticatedPage` / `adminPage`（见 `fixtures/test-fixtures.ts`），而不是在每个用例里手写登录步骤。
2. **共享测试数据统一从 `fixtures/mock-data.ts` 取值**：账号信息用 `TEST_USERS`，路由用 `ROUTES`，Demo 问卷用 `DEMO_SURVEY`，等待时间用 `TIMEOUTS`（`short`/`medium`/`long`/`navigation`），避免在用例中硬编码魔法值，且保证与 `src/mock/modules/` 中的 Mock 数据保持一致。
3. **等待策略**：页面跳转后统一 `waitForLoadState("networkidle")` 再断言；对不确定渲染时机的元素使用 `locator(...).waitFor({ state: "visible", timeout: TIMEOUTS.medium })`，避免固定 `waitForTimeout` 造成的抖动（仅调试场景可临时使用）。
4. **新增用例需要真实断言**：禁止提交只打印 `console.log` 而没有 `expect` 断言的调试脚本（此前 `debug-login.spec.ts` 属于此类遗留脚本，已在本次整理中移除）。
5. **归类到对应业务域目录**：新用例放入 `tests/<domain>/` 下已有或新建的子目录，保持与上表一致的组织方式。
6. **类型检查**：`e2e/` 已纳入独立的 `tsconfig.json` 并被根 `tsconfig.json` 引用，运行 `pnpm type-check` 会连带校验 e2e 目录下的类型错误，提交前请确保其通过。
