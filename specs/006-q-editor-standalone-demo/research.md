# Research: q-editor GitHub Pages 静态演示

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

本文档汇总规划阶段需要澄清的技术决策。spec.md 中没有遗留 `[NEEDS CLARIFICATION]` 标记（已在 `/speckit-specify` 阶段通过用户确认解决部署仓库名、分支、登录交互方式等问题），因此本阶段的研究重点是**技术实现层面的决策**，尤其是复现并定位用户报告的"启动失败、页面白屏"问题。

## 1. 客户端 Mock 拦截机制

- **Decision**: 通过覆盖 axios 请求配置的 `config.adapter` 字段实现纯客户端 Mock，在两个现有 axios 实例（`api/clients/auth.ts`、`api/clients/server.ts`）的请求拦截器中判断 `(config.baseURL ?? "") + (config.url ?? "")` 是否以 `/api` 开头，命中则替换为自定义 `standaloneMockAdapter`。
- **Rationale**: `vite-plugin-mock` 仅在 `command === 'serve'` 时通过开发服务器中间件工作，生产构建产物中完全不存在该中间件，无法用于 GitHub Pages 静态部署。Axios adapter 覆盖是唯一能在纯静态产物中拦截请求且不改动业务代码调用方式的方案。
- **Alternatives considered**:
  - Service Worker 拦截 fetch/XHR：更通用但引入额外的注册/生命周期复杂度，对于演示场景是过度设计。
  - 直接 mock 各业务模块的 API 函数（`api/modules/*.ts`）：需要在每个调用点做条件判断或依赖注入替换，改动面远大于在两个 axios 实例入口统一拦截。
  - 中途踩坑记录：最初实现里 URL 匹配逻辑只检查 `config.url.startsWith('/api')`，但两个 axios 实例的 `baseURL` 本身就是 `"/api"`，实际请求时 `config.url` 是不含前缀的相对路径（如 `/surveys`），导致条件永远为 false、Mock 从未激活、请求发往真实网络返回 500——已修正为拼接 `baseURL + url` 后再判断。

## 2. 白屏 / `ReferenceError: Cannot access 'b' before initialization` 根因定位

- **Decision**: 该报错由 `vite.config.ts` 中 `manualChunks` 函数产生的**循环 chunk 依赖**引起，需要调整分组逻辑消除循环。
- **Rationale**: 实际执行 `npx vite build --mode standalone --base=./` 复现，Rollup 构建日志明确输出：
  ```
  Circular chunk: vue-vendor -> vendor -> draggable -> vue-vendor. Please adjust the manual chunk logic for these chunks.
  Circular chunk: vendor -> draggable -> vendor. Please adjust the manual chunk logic for these chunks.
  ```
  原因是 `manualChunks(id)` 按包名把 `vuedraggable` 单独分进 `draggable` chunk，而 `vuedraggable` 内部依赖的间接包（如 `sortablejs` 之外的辅助工具）被兜底规则分进了 `vendor` chunk，`vendor` 又反过来被其他代码引用回 `vue-vendor`，形成三个 chunk 之间的环形引用。Rollup 在存在循环 chunk 时无法保证各 chunk 顶层副作用代码的执行顺序严格早于其依赖方使用该绑定的时刻，浏览器实际加载时命中某个 `const`/`let` 绑定的 TDZ（temporal dead zone），表现为 `Cannot access 'b' before initialization`——`'b'` 是 minify 后的临时变量名，与业务代码无直接对应关系，属于打包结构问题而非业务逻辑 bug。
  该问题**独立于本次新增的 Mock 系统**，是 `vite.config.ts` 中既有 `manualChunks` 策略的既存缺陷；只是因为此前 Mock 从未真正激活（见上一节踩坑记录），请求全部 500，用户尚未来得及验证到这一层就先看到网络报错，修复 Mock 激活逻辑后才暴露出这个更底层的打包问题。
- **Alternatives considered**:
  - 完全移除自定义 `manualChunks`，回退到 Rollup 默认自动分包：会失去现有的"Vue 核心生态/Element Plus/图标库长期缓存"分包收益，影响面超出本功能范围，不采用。
  - 将 `draggable` 特殊分组合并进 `vendor`（即删除 `vuedraggable` 的专属判断分支，让它落入兜底 `vendor` 规则）：消除了 `draggable` 这个独立节点，循环链路 `vendor -> draggable -> vendor` 与 `vue-vendor -> vendor -> draggable -> vue-vendor` 均因节点消失而自然打破，且改动最小（仅删除 4 行判断），保留其余分包策略不变。**采纳此方案**，作为实现阶段（`/speckit-tasks`）的一项修复任务。

## 3. GitHub Pages 子路径与本地预览路径的一致性

- **Decision**: 生产部署使用 `base: '/q-editor/'`（匹配 GitHub Pages `<repo>/<subpath>/` 的托管方式）；本地验证构建产物时使用相对路径 `--base=./`，通过独立的 `preview:standalone` 脚本区分，不与生产 base 混用。
- **Rationale**: `vite preview` 默认从服务根路径 `/` 提供构建产物；若产物内资源引用为 `/q-editor/assets/...` 而服务路径是 `/assets/...`，会导致 404 和白屏，这正是用户最初报告"`pnpm preview` 无反应"的直接原因。用相对路径 `./` 构建可以让本地 `vite preview` 直接work，而不需要额外配置反向代理或子路径服务。
- **Alternatives considered**: 本地起一个以 `/q-editor/` 为根路径的静态服务器（如 `serve -l 4173 --single dist` 配合反代前缀）：更贴近生产环境，但增加本地验证的操作成本，对于演示项目的验证目的过重，不采用；生产部署时仍按 `/q-editor/` 构建，两者互不影响。

## 4. Git Bash 下 `--base` 参数传递

- **Decision**: 使用 `--base=./`（等号连接的相对路径），不使用 `--base /` 或 `--base ./`（空格分隔）。
- **Rationale**: Git Bash（MinGW）的路径转换规则会把以 `/` 开头的独立命令行参数误当作 Windows 路径展开（如 `/` 被解析为 Git 安装目录），只有使用 `=` 连接且不以裸 `/` 开头的写法才能避免被错误转换。
- **Alternatives considered**: 在 PowerShell 中运行避免转义问题——但项目脚本约定使用 Git Bash（`sh` 环境），不改变团队现有终端约定。

## 5. Mock 数据与真实响应包体的一致性

- **Decision**: Mock handler 复用现有 `ok(data, msg)` / `fail(code, msg)` 风格的响应包装，输出 `{code, msg, data}`，与 `q-server` 的真实响应契约（Constitution Principle III）保持一致；数据结构参考现有 `src/mock/modules/{auth,user,survey}.ts` 的字段定义与 `packages/common` 的共享类型。
- **Rationale**: 保证 Mock 环境下前端业务代码（类型解析、字段读取）与真实后端环境行为一致，避免"演示环境能跑、接后端就崩"的契约漂移。
- **Alternatives considered**: 简化为自定义的 `{success, data}` 结构：会造成前端消费逻辑要分叉处理两种包体格式，违反 Constitution III 的单一响应契约要求，不采用。

## 6. `vite-plugin-mock` 扫描范围隔离

- **Decision**: Mock 系统代码物理隔离在 `src/standalone/`，不放在 `src/mock/` 目录下。
- **Rationale**: `vite-plugin-mock` 的 `mockPath: './src/mock'` 配置会扫描该目录下所有文件并尝试作为独立 mock 模块打包，其打包沙箱无法解析 `@/*` 路径别名（如 `@/stores`），此前 `src/mock/standalone/setup.ts` 曾因此报 `ERR_MODULE_NOT_FOUND`。移出该目录后完全规避此插件的扫描逻辑。
- **Alternatives considered**: 保留在 `src/mock/standalone/` 但重写为不依赖路径别名的相对导入：仍然会被插件扫描并尝试打包成 mock 模块（即使运行时不需要），存在插件行为不可控的风险，不如物理隔离彻底。

## 结论

所有技术未知项均已解决，无遗留 `NEEDS CLARIFICATION`。核心新发现（circular chunk 根因）已记录为实现阶段的显式修复任务，其余决策均已在此前的实现尝试中验证并生效。
