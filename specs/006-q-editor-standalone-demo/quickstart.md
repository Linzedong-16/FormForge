# Quickstart: q-editor GitHub Pages 静态演示 — 验证指南

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Contracts**: [contracts/mock-api-contract.md](./contracts/mock-api-contract.md)

本指南用于验证 standalone 演示构建是否端到端可用，覆盖 spec.md 中 5 个 User Story 的黄金路径。执行前提：已完成 research.md 中「circular chunk 修复」任务（否则会在浏览器中复现 `Cannot access 'b' before initialization` 白屏）。

## 前提条件

- Node ≥22.17、pnpm ≥10.12.4（monorepo engine 约束）
- 在仓库根目录执行过 `pnpm install`
- 当前分支为 `preview`（或包含本功能代码的分支）

## 步骤 1：本地构建 + 预览（对应 FR-001、FR-003、SC-006）

```bash
cd app/q-editor
pnpm preview:standalone
```

**预期结果**：

- 命令在 1 分钟内完成构建并启动预览服务器（终端输出 `Local: http://localhost:4173/` 类似地址）
- 终端不应再出现 `Circular chunk` 警告（修复验证点）
- 浏览器打开该地址，页面正常渲染登录表单，**不出现白屏**，DevTools Console 无红色报错

## 步骤 2：验证一键登录（对应 US1 / FR-004~007 / SC-001, SC-002）

1. 打开预览地址，观察登录表单是否已预填 `admin@example.com` / `Admin@123`
2. 点击「🚀 一键演示登录」按钮
3. **预期**：2 秒内跳转到工作台首页；DevTools Network 面板中 `/api/auth/login` 请求应显示为被 Mock 拦截（状态码 200，且请求未真正发往 `localhost:8080` 等真实后端地址）
4. 刷新页面（`F5`），**预期**：页面正常重新渲染，不出现白屏或路由 404（对应 US1 场景 4、SC-004）

## 步骤 3：验证用户资料与头像（对应 FR-008）

1. 点击右上角头像，打开用户面板
2. **预期**：头像显示为 `https://linzex.top/upload/1759642363899.gif`（GIF 动图），昵称显示「管理员」

## 步骤 4：验证问卷列表与预览（对应 US2 / FR-009~011）

1. 首页应展示至少 2 份预置问卷，含「已发布」「草稿」状态标签
2. 点击已发布问卷标题，进入预览页
3. **预期**：所有题目组件（标题说明、单选、多选、文本输入等）正常渲染，无组件报错占位

## 步骤 5：验证编辑器（对应 US3 / FR-012~014）

1. 从首页点击「创建问卷」进入编辑器
2. 从左侧题型面板拖拽/点选任意题型到中间画布
3. **预期**：组件出现在画布中并可点击编辑其配置
4. 点击「保存」，**预期**：提示保存成功（数据写入本地 IndexedDB，可通过 DevTools → Application → IndexedDB 确认新记录）
5. 点击「预览」，**预期**：跳转预览页，刚添加的组件按序展示

## 步骤 6：验证组件市场与模板市场（对应 US4 / FR-004 场景2）

1. 从首页进入「组件市场」，**预期**：左侧题型分组、右侧对应组件预览均正常渲染
2. 在编辑器内切换到「模板市场」tab，**预期**：至少展示 5 个预设模板，含名称/分类/使用次数

## 步骤 7：验证设置与主题切换（对应 US5 / FR-018~020）

1. 进入个人设置页，**预期**：表单已预填头像/昵称/职业/兴趣标签等字段
2. 切换暗色主题，**预期**：全站样式正确切换为暗色，无样式错乱的组件
3. 切换色弱模式（任一色盲选项），**预期**：色彩方案随之切换
4. 切换语言（中/英/日），**预期**：界面文案随之切换

## 步骤 8：GitHub Actions 部署验证（对应 FR-002）

```bash
git push origin preview
```

**预期结果**：

- GitHub Actions 中 `Deploy q-editor to GitHub Pages` 工作流被触发（push 到 `preview` 分支且改动路径匹配 `app/q-editor/**`）
- 工作流成功完成（构建 + `actions/deploy-pages`）
- 通过 GitHub Pages 提供的 URL 访问站点，重复步骤 1–7 验证生产环境行为与本地一致（尤其确认资源路径 `/q-editor/assets/...` 全部 200，无 404）

## 回归检查清单

- [ ] `pnpm preview:standalone` 无 `Circular chunk` 警告
- [ ] 浏览器 Console 全程无红色 `Uncaught` 报错
- [ ] 步骤 1–7 全部通过
- [ ] GitHub Actions 工作流跑通且 Pages 站点可访问
