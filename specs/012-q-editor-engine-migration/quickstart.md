# 快速验证指南：q-editor 问卷引擎无缝迁移

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Contracts**: [contracts/survey-engine-exports.md](./contracts/survey-engine-exports.md)

本指南用于在实现完成后，端到端验证"无缝迁移"承诺是否成立，对应 User Story 1（P1，零回退）、
User Story 3（P3，验证清单可追溯）及 SC-001~SC-005。执行者无需理解迁移的具体代码实现细节即可
按本清单逐项核对。

## 前置条件

- 已完成 FR-010 列出的 5 项能力回补至 `packages/survey-engine`（选项联动候选池、`client_key` 规则
  管理、Signature MinIO 上传、PicItem 响应体解析、SinglePicSelect 答案发射），且已按 FR-006/FR-010
  为这 5 项补充 Vitest 组件级用例并通过。
- `app/q-editor` 已切换为消费 `monorepo-survey-engine` 导出（不再引用本地 `stores/useEditor.ts`、
  `components/SurveyComs/*` 的重复实现）。
- 准备好至少 3 份存量问卷数据（对应 SC-004）：
  1. 无 `client_key` 的最早期问卷。
  2. 有 `client_key` 但无规则配置的问卷。
  3. 有 `client_key` 且含跳转/联动规则的问卷。

## 环境准备

```bash
# 安装依赖（monorepo 根目录）
pnpm install

# 运行共享引擎单元测试（含新增的 FR-010 组件级用例）
pnpm --filter monorepo-survey-engine test

# 运行 q-editor 单元测试
pnpm --filter q-editor test

# 类型检查（两个包）
pnpm --filter monorepo-survey-engine exec vue-tsc --build
pnpm --filter q-editor exec vue-tsc --build

# 启动 q-editor 独立开发服务器（独立单页运行模式）
pnpm --filter q-editor dev

# 启动 main-app + q-editor（qiankun 集成运行模式，视项目现有联调脚本而定）
pnpm --filter main-app dev
```

**预期结果**：单元测试全部通过（不含 spec.md Edge Cases 中列出的、与本次迁移无关的既有失败基线）；
类型检查无新增错误（`Signature.vue` 既有 `TS2345` 必须已随 FR-010 改造修复，不应再出现）。

## 验证场景（对应 User Story 1 Acceptance Scenarios）

### 场景 1：选项联动候选池提示态与收窄逻辑

1. 打开一份包含"单选题依赖另一题作答结果收窄候选池"配置的问卷。
2. 依赖题未作答时预览该题目 → **预期**：展示"需先完成依赖题"提示态（`isPoolPrompting === true`）。
3. 完成依赖题作答后刷新预览 → **预期**：候选池按依赖题作答结果正确收窄，且候选项在选项列表中的
   下标/顺序与迁移前一致（使用 `v-show` 而非 `v-if` 隐藏不可用项，验证方式：对比迁移前后同一问卷的
   候选项 DOM 顺序）。

### 场景 2：存量问卷 `client_key` 与规则加载

1. 分别加载前置条件准备的 3 份存量问卷。
2. 对"无 `client_key`"的问卷 → **预期**：打开后自动惰性补齐 `client_key`（`ensureComClientKey`
   幂等生效），保存后不产生除补齐字段外的破坏性数据变更。
3. 对"有 `client_key` 且含规则"的问卷 → **预期**：跳转/显隐规则正确加载并可在编辑器中正常编辑、
   保存、发布。

### 场景 3：规则引用查找（删除题目前提示）

1. 新增一道题目并为其配置一条引用其他题目 `client_key` 的动态规则。
2. 尝试删除被引用的题目 → **预期**：系统通过 `findRuleReferencesTo` 正确识别并提示所有引用方，
   不允许静默删除导致规则悬空引用。

### 场景 4：撤销/重做

1. 对编辑器执行任意一组编辑操作（增删题、改规则、调顺序）。
2. 执行撤销 → **预期**：状态回退到操作前；执行重做 → **预期**：状态恢复到操作后，行为与迁移前
   完全一致。

## 验证场景（对应 FR-010 高风险分歧点，须有 Vitest 用例佐证，人工回归作为二次确认）

- **Signature 上传**：有 `surveyId` 时走 MinIO 异步上传并展示上传中状态；无 `surveyId` 或上传失败时
  降级为 base64 内联存储，签名题目在两种路径下均可正常预览与保存。
- **PicItem 响应体解析**：模拟后端返回标准信封 `{code: 0, msg: "", data: {file_url: "..."}}`，
  验证图片链接正确解析并展示；不应再存在对扁平 `file_url` 结构的兼容分支。
- **SinglePicSelect 答案发射**：选择任意图片选项后，验证上层容器收到 `updateAnswer` 事件且答案值
  正确记录（可通过预览区/答案面板观察，或在 Vitest 用例中断言 emitted 事件）。

## 验证场景（对应 FR-007/SC-005：双运行模式）

1. **独立单页运行模式**：直接访问 `q-editor` 独立开发服务器地址，完整走一次"新建问卷 → 编辑题目 →
   保存"流程 → **预期**：功能与迁移前一致，无 qiankun 相关报错。
2. **qiankun 集成运行模式**：通过 `main-app` 加载 `q-editor` 子应用，重复上述编辑流程 → **预期**：
   `bootstrap`/`mount`/`unmount`/`update` 生命周期正常，`routerBase` 路由前缀正确生效，功能与独立
   模式一致。

## 验证场景（对应 SC-002/SC-003：重复代码清零与单一修改点）

1. 检查 `app/q-editor/src/stores/`、`app/q-editor/src/components/SurveyComs/` → **预期**：不再存在
   与 `packages/survey-engine` 功能重复的实现文件。
2. 在 `packages/survey-engine` 中对任一题型组件做一次可观察的小幅调整（如修改某提示文案的展示
   条件），不修改 `app/q-editor` 本地代码 → **预期**：`q-editor` 中同步生效该调整。

## 验证结论记录方式

按上述每个场景逐项记录"通过/失败"，不允许出现"无法判断"的模糊结论（对应 User Story 3 Acceptance
Scenario 1 / FR-006）。失败项须注明是共享引擎问题还是 `q-editor` 侧接线问题，便于定位责任范围。
