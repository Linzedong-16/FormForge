# Phase 1 快速验证指南：动态表单数据完整性与交付可靠性修复

**输入**：[spec.md](./spec.md) · [research.md](./research.md) · [data-model.md](./data-model.md) · [contracts/](./contracts/)

本指南列出实现完成后用于端到端验证本功能的可执行场景，覆盖 4 个用户故事与"存量普通问卷零回归"约束（FR-010）。按 Constitution Principle V 的要求，两个 P1 场景（场景一、场景二）对应的自动化测试必须先在修复前的代码上运行并确认失败，再在修复后确认通过，形成完整的回归证据链；不包含具体实现代码，具体断言在 `tasks.md` 阶段落实为 Vitest（`app/q-server`、`packages/survey-engine`）/Playwright（`app/q-editor/e2e`）用例。

## 前置条件

- 本地或测试环境已启动 `app/q-server`（`pnpm --filter q-server dev`）与 `app/q-editor`（`pnpm --filter q-editor dev`）。
- 数据库结构无需变更，沿用 `008-dynamic-form-engine` 已落地的 `client_key`/`logic`/`answer_status` 三列。
- 已准备一份"存量普通问卷"（不含任何 `logic` 配置）作为零回归对照组，全流程贯穿每个场景。

---

## 场景一：新建问卷即可靠保存动态规则（User Story 1，对应 SC-001，FR-001/002）

**修复前必须先失败**：在应用 D1 修复之前运行本场景，确认第 3 步取回的规则为空/丢失，证明缺陷真实存在。

1. 创建一份新问卷，为其中一道题目配置一条显示/隐藏规则（`QuestionVisibilityConfig`）。
2. 调用创建接口 [survey-components-create.contract.md](./contracts/survey-components-create.contract.md) **仅一次**，不做任何后续编辑保存。
3. 通过独立读取路径（`GET /api/surveys/:id`，或清空本地编辑器缓存重新打开）取回该问卷。
4. **预期结果**：题目的 `client_key` 与 `logic` 与配置时完全一致，不存在丢失。
5. 补充验证：为另一道题目分别配置跳转规则、选项联动规则、计算字段配置后重复 1-4 步，确认四类规则均不丢失（acceptance scenario 2）。
6. 对照组：使用不含任何规则的存量问卷重复 1-4 步，确认创建、读取行为与修复前完全一致（acceptance scenario 3，FR-010）。

---

## 场景二：填写者的真实作答状态被准确记录（User Story 2，对应 SC-002，FR-003/004）

**修复前必须先失败**：在应用 D2 修复之前运行本场景，确认第 4 步中被隐藏题目/留空题目未出现在提交负载中，证明缺陷真实存在。

1. 配置一道题目 A（触发条件），一道题目 B（配置"当 A 满足条件时隐藏"），一道题目 C（普通题，不配置任何规则）。
2. 填写者按会触发 B 隐藏的路径作答 A，不填写 C，提交问卷（参考 [survey-submit-response.contract.md](./contracts/survey-submit-response.contract.md)）。
3. 核对提交请求负载 `answers[]`：B 对应条目 `answer_status === 1`，C 对应条目 `answer_status === 2`，二者均存在于负载中。
4. 核对数据库 `survey_response_item` 落库结果与提交负载一致（acceptance scenario 1/2）。
5. 对照组：使用不含任何规则的存量问卷提交答卷，确认提交负载与修复前完全一致，不出现新增的 `answer_status` 字段膨胀（acceptance scenario 3，FR-010）。

---

## 场景三：发布前的规则校验结果保持一致可靠（User Story 3，对应 SC-003，FR-005）

1. 构造一份规则配置合法的问卷，连续多次触发 [survey-rule-validation.contract.md](./contracts/survey-rule-validation.contract.md) 中的发布前校验，确认每次结论均为"通过"（acceptance scenario 1）。
2. 构造一份存在循环依赖或引用了已删除题目的问卷，触发发布，确认被正确拦截，且返回的 `violations` 反映的是发布这一操作发生时刻真实、最新的题目与规则集合（acceptance scenario 2）。
3. 对照组：不含任何规则的存量问卷触发发布，确认发布流程正常通过，不受规则校验环节影响（acceptance scenario 3，FR-010）。

---

## 场景四：四类核心动态能力具备同等交付质量保障（User Story 4，对应 SC-004，FR-006）

1. 在 `app/q-editor/e2e/tests/survey/survey-dynamic-logic.spec.ts` 新增的"场景4：派生计算字段"中，验证计算结果（求和/加权求和）随依赖题目答案变化实时更新（acceptance scenario 1）。
2. 验证参与计算的题目留空时，按 `emptyStrategy`（`treatAsZero`/`skipCalculation`）正确降级，不报错、不白屏。
3. 验证 `visibleToFiller: false` 的计算字段不渲染但仍正确参与计算。
4. 重新运行既有的"场景1：题目显示/隐藏规则""场景2：跳题结束规则""场景3：选项联动规则"，确认三者保持全部通过，未因本次修复引入新的失败（acceptance scenario 2）。

---

## 性能基线核对（对应 SC-006）

在场景一至场景四的操作过程中，额外核对：

- 填写态实时响应（答案变化到显示/隐藏、跳转、选项联动、计算字段更新完成）维持 `008-dynamic-form-engine` 已确立的 200ms 目标，不因场景二引入的 `answer_status` 补全计算而劣化。
- 发布前规则校验响应耗时维持既有基线，不因场景三改为传入 `tx` 客户端而产生可观测的性能回归。
