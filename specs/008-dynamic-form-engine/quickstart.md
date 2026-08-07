# Phase 1 快速验证指南：低代码问卷动态表单引擎

**输入**：[spec.md](./spec.md) · [data-model.md](./data-model.md) · [contracts/](./contracts/)

本指南列出实现完成后用于端到端验证本功能的可执行场景，覆盖 5 个用户故事与"存量问卷零回归"约束。不包含具体实现代码，只描述前置条件、操作步骤与预期结果；具体断言应在 `tasks.md` 阶段落实为 Vitest/Playwright 用例。

## 前置条件

- `app/q-server` 已应用新增 Prisma migration（`client_key`/`logic`/`answer_status` 三列已存在）。
- `packages/survey-engine` 的 `src/logic/` 子模块已实现并通过单测。
- `app/q-editor` 已完成 workspace 依赖接入与 `SurveyView.vue` 的响应式改造。
- 本地或测试环境已启动 `app/q-server`（`pnpm --filter q-server dev`）与 `app/q-editor`（`pnpm --filter q-editor dev`）。

---

## 场景 1：显示/隐藏条件（User Story 1，对应 SC-001/SC-002）

1. 在问卷编辑器中创建两道题目 A（单选：是/否）、B（文本题）。
2. 为题目 B 配置 `QuestionVisibilityConfig`：`baseVisibility: "hidden"`，一条 `show` 规则：`A.answer eq "是"`。
3. 保存问卷（`PUT /api/surveys/:id`，见 [survey-components.contract.md](./contracts/survey-components.contract.md)），确认响应中题目 B 携带写回的 `client_key` 与 `logic`。
4. 调用规则预检 `POST /api/surveys/:id/validate-rules`，确认 `data.valid === true`。
5. 发布问卷（`POST /api/surveys/:id/publish`），确认发布成功。
6. 打开填写页三条路径验证：
   - 题目 A 选择"是" → 题目 B 立即显示（应在 200ms 内完成界面更新，SC-005）。
   - 题目 A 选择"否" → 题目 B 保持隐藏，且提交时不校验其必填。
   - 不作答题目 A 直接尝试提交 → 因 baseVisibility=hidden，题目 B 不参与必答校验，提交成功。
7. 选择"是"后给题目 B 作答，再改回"否" → 题目 B 被重新隐藏，且其已填内容不出现在最终提交的 `answers[]` 中（验证 FR-009 清理逻辑）。

**预期结果**：三条路径行为与 acceptance scenarios 1-4 完全一致。

---

## 场景 2：跳题与提前结束（User Story 2，对应 SC-002）

1. 题目 A（单选：符合资格/不符合资格），中间题目 B/C/D，结束题 E。
2. 为题目 A 配置 `QuestionJumpConfig`：规则 1 `A.answer eq "不符合资格" → target: {type: "endSurvey"}`。
3. 填写路径 1：选择"不符合资格" → 直接进入提交/结束状态，B/C/D/E 均不展示，进度指示器反映实际经历题目数（FR-008）。
4. 追加规则：`A.answer eq "特殊路径" → target: {type: "question", targetKey: E.client_key}`，且 E 恰好被另一条隐藏规则命中隐藏 → 验证系统自动顺延到 E 之后第一个真实可见题目（acceptance scenario 4）。

**预期结果**：跳转路径与顺延逻辑符合预期，无停留在不可见题目的情况。

---

## 场景 3：选项联动（User Story 3）

1. 题目 A（单选：产品大类，选项"电子""家居"），题目 B（单选，候选项依赖 A）。
2. 配置 `OptionDependencyMapping`：`dependsOnKey: A`，`optionsByAnswer: {"电子": ["手机","电脑"], "家居": ["沙发","桌子"]}`。
3. 验证：A 选"电子" → B 候选项刷新为["手机","电脑"]；B 选中"手机"后回到 A 改选"家居" → B 已选值被清空；A 未作答时直接到达 B → 按 `emptyStrategy` 展示空集合或提示先完成 A。

**预期结果**：三条 acceptance scenario 全部通过。

---

## 场景 4：派生计算字段（User Story 4）

1. 题目 A、B 为数值题；新增伪题型条目 F（`Material.ComputedField`），配置 `formula: {kind:"sum", sourceKeys:[A,B]}`，`visibleToFiller: true`。
2. 分别完成 A、B 作答，验证 F 的展示值随之更新（≤200ms）。
3. 将某题目 C 的显示条件设为"F 计算结果 > 阈值"，验证跨越阈值时 C 的显示状态按 P1 规则响应。
4. 只完成 A、不作答 B（`incompleteStrategy: "treatAsZero"`）→ 验证 F 按"B 视为 0"计算，不报错、不白屏。
5. 提交问卷后查询该 Response 的答案列表，确认 F 对应的 `Answer` 行已随答卷持久化，值与页面展示一致。

**预期结果**：计算值实时更新、降级策略生效、结果随答卷持久化（SC-006）。

---

## 场景 5：发布时规则校验与填写者视角预览（User Story 5，对应 SC-003）

1. 构造循环依赖：题目 A 的显示依赖题目 B，题目 B 的显示又依赖题目 A。调用 `POST /api/surveys/:id/publish`，验证返回 `code = BizCode.RULE_CIRCULAR_DEPENDENCY`（6001），`data.violations` 中明确列出 A、B 的 `client_key`。
2. 构造无效引用：某规则引用一个已被设计者删除的题目。发布同样被拦截，返回 `RULE_DANGLING_REFERENCE`（6002）。
3. 构造非法跳转：跳转目标 `order_index` 早于来源题目。发布被拦截，返回 `RULE_INVALID_JUMP_TARGET`（6003）。
4. 修正全部问题后再次调用 `validate-rules`，确认 `data.valid === true`，随后发布成功。
5. 进入"填写者视角预览"模式模拟填写，验证显示/隐藏/跳转/联动/计算效果与真实填写环境（场景 1-4）完全一致，且预览过程不产生真实 `Response`/`Answer` 记录。
6. 在编辑器中删除一道被规则引用的题目，验证系统立即（保存前）提示哪些规则受影响，而不是等到调用发布接口才发现（acceptance scenario 4）。

**预期结果**：三类违规均被 100% 拦截（SC-003），预览与真实填写行为一致。

---

## 场景 6：存量问卷零回归验证（FR-010/SC-004，回归测试基线）

1. 选取一份本功能上线前已存在、且全部题目 `client_key`/`logic` 均为 `NULL` 的问卷。
2. 依次执行：编辑保存、发布、填写提交、统计报表查看、数据导出——全部使用已有的自动化/人工验证用例。
3. 对比本功能上线前后的执行结果，确认零差异：
   - 保存/发布响应结构不变（仅多出可选字段，历史断言不应因多余可选字段失败）。
   - 填写页题目集合、进度指示、必答校验行为不变（因 `logic` 为 `NULL`，`resolveVisibility`/`resolveJump` 等函数应直接返回默认态，不产生任何隐藏/跳转副作用）。
   - 提交后 `Answer` 行为与上线前一致（`answer_status` 全部为 0 或省略，`survey-stats` 统计口径读取到 `NULL` 时按"0/正常作答"解释）。

**预期结果**：现有全部自动化与人工验证用例通过率保持 100%。

---

## 验证覆盖小结

| 场景 | 覆盖需求                                          |
| ---- | ------------------------------------------------- |
| 1    | FR-001/FR-002/FR-009/FR-010, SC-001/SC-002/SC-005 |
| 2    | FR-003/FR-008, SC-002                             |
| 3    | FR-004                                            |
| 4    | FR-005, SC-006                                    |
| 5    | FR-006/FR-007, SC-003                             |
| 6    | FR-010/FR-013, SC-004                             |
