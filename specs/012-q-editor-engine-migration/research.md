# Phase 0 研究记录：q-editor 问卷引擎无缝迁移

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

本文件记录 `/speckit-plan` 执行过程中为解决 Technical Context 未知项所做的调研结论。经核对，本次
spec.md 与 plan.md 的 Technical Context 中**不存在遗留的 "NEEDS CLARIFICATION" 标记**（3 轮
`/speckit-clarify` 已覆盖全部高风险歧义点），因此本文件的定位是记录支撑 plan.md 中各项技术决策的
调研依据，而非解决未决问题。

## 1. 选项联动候选池与 `client_key` 规则管理：接线缺口而非逻辑缺口

- **Decision**: 将 FR-010 前两项（选项联动候选池、`client_key` 动态规则管理）定位为"Store 便捷方法 +
  组件接线"层面的补齐，复用 `packages/survey-engine` 现有的 `core/logic` 纯函数
  （`resolveOptionPool`、`validateRuleSet`、`RuleViolation`）与 `adapters/vue3/useRuleRuntime` composable，
  而不是重新设计一套规则引擎。
- **Rationale**: 检索 `packages/survey-engine/src/index.ts` 及 `core/logic/{evaluator.ts,index.ts,types.ts}`
  确认 `188563c`（"完成低代码引擎核心解耦改造"）已将这些能力下沉为框架无关、有单测覆盖
  （`core/logic/__tests__/evaluator.spec.ts`）的纯函数并对外导出；但对
  `packages/survey-engine/src/stores/useEditor.ts` 与
  `packages/survey-engine/src/components/SurveyComs/Materials/SelectComs/SingleSelect.vue` 的检索显示
  零 `client_key`/`optionPool`/`resolveOptionPool` 引用——说明引擎已具备"能力"，只是未在 Store 与组件层
  "接线"。q-editor 侧的 `SingleSelect.vue` 同样只是把 `optionPool` 当作外部计算好的 prop 消费，本身也未
  调用 `resolveOptionPool`/`useRuleRuntime`。
- **Alternatives considered**:
  - 在 `packages/survey-engine` 内重新实现一套独立的候选池收窄与规则索引逻辑：被否决，因为会与已存在
    的 `core/logic` 纯函数形成重复实现，违反本迁移"消除重复"的初衷（Constitution Principle I）。
  - 直接照搬 q-editor 的 `useEditor.ts` 方法实现（`getComByClientKey` 等），不复用 `core/logic`：被否决，
    这些方法目前是纯粹的 Map 查找/索引维护，理应作为 Store 层对 `core/logic` 结果的封装，而不是另起
    一套与 `core/logic` 平行的实现。
- **待任务阶段确认的细节**（不阻塞 plan.md，留给 `/speckit-tasks`/实现阶段）：q-editor 中实际计算
  `optionPool` 并传给 `SingleSelect.vue` 的调用点尚未定位（大概率位于父级题目列表容器或 Store 的某个
  getter），需要在任务分解时先追踪清楚，再决定迁移后由 Store 还是由 `useRuleRuntime` composable 承担
  该计算职责。

## 2. `PicItem.vue` 响应体解析：以 Constitution Principle III 为准裁决分歧

- **Decision**: FR-010 第 4 项的处理方式确定为"采纳 q-editor 现有的嵌套 `response.data.file_url` 读取
  方式作为共享引擎的最终实现，修正引擎当前扁平 `response.file_url` 的假设"，而非维持"两种格式都兼容
  解析"的折中方案。
- **Rationale**: Constitution Principle III 明确规定统一 API 响应信封为 `{code: number, msg: string,
data: T | null}`。diff 显示 q-editor 的 `handleAvatarSuccess` 读取 `response.data?.file_url`，正确
  遵循该信封；引擎当前读取扁平 `response.file_url`，是对信封规范的偏离。裁决分歧时优先满足宪法条款，
  比"各自兼容"更能从根源消除歧义、避免未来新增上传接口时再度出现信封解析歧义。
- **Alternatives considered**:
  - 同时兼容两种读取方式（`response.data?.file_url ?? response.file_url`）：被否决，这是 spec.md FR-010
    原始表述中"统一兼容解析"的字面选项之一，但会让共享引擎长期携带一个不合规的分支，且掩盖了引擎侧
    本身违反宪法的事实；只有在确认后端上传接口存在无法修改的历史扁平响应版本时才需要此兼容分支——
    经核对，q-editor 现有实现已经只处理嵌套结构，说明后端接口早已统一为标准信封，扁平分支属于引擎侧
    历史遗留代码，无需保留。

## 3. `uuid` 版本兼容性

- **Decision**: 无需在依赖层面做任何调整。
- **Rationale**: 核对 `packages/survey-engine/package.json` 与 `app/q-editor/package.json`，两者的
  `uuid` 依赖均为 `^13.0.0`，主版本一致，`ensureComClientKey` 等方法迁移到共享引擎后可直接复用引擎
  自身已声明的 `uuid` 依赖，不存在版本冲突或需要 peerDependency 调整的风险。

## 4. CRLF/LF 行尾差异与 Lint 门禁

- **Decision**: 迁移中新增/修改的共享引擎文件统一按项目根 Prettier 配置输出（与 q-editor 侧一致的
  行尾与格式），不引入按目录区分行尾风格的例外。
- **Rationale**: 检索发现 `packages/survey-engine` 现存文件使用 CRLF，`app/q-editor` 侧使用 LF。
  Constitution Principle VII 要求"零警告"通过根 ESLint/Prettier 门禁，且 Husky pre-commit → lint-staged
  会对改动文件强制格式化；如果不主动统一，首次对这些文件的改动会被 lint-staged 自动重写行尾，产生与
  本次迁移无关的大量格式噪音 diff，干扰代码评审。因此决定：触碰到的文件一律交由现有 Prettier 配置
  统一处理，不单独制定行尾策略。
- **Alternatives considered**: 为 `packages/survey-engine` 单独配置 `.gitattributes`/`.editorconfig`
  强制 CRLF：被否决，与 monorepo 其余包的 LF 约定不一致，且不是本次迁移目标（属于与迁移无关的基础设施
  变更，若确有需要应在独立 PR 中提出）。

## 5. Vite 手动分包（manual chunking）边界

- **Decision**: 迁移过程中每完成一个阶段性变更，需人工核对现有 Vite 构建配置的手动分包规则
  （vendor / UI 库 / `survey-engine` chunk 边界），确认未被意外打散或合并，不引入新的自动化检测工具。
- **Rationale**: Constitution Principle X 明确将分包边界保持列为强制项，但该验证目前项目内没有自动化
  基线快照机制，属于人工构建产物检查范畴；本次迁移不新增自动化基础设施（Assumptions 已限定），因此
  采用人工核对而非新增构建分析工具的方式满足该门禁。
- **Alternatives considered**: 引入 `rollup-plugin-visualizer` 或类似工具做自动化 bundle 分析比对：
  被否决，超出本次迁移范围，且违反"不引入新的专门测试/分析基础设施"的既定假设边界。

## 结论

以上 5 项决策已覆盖 plan.md Technical Context 与 Constitution Check 中标记"附带门禁"/"附带纠偏"的
全部事项；spec.md 未留存任何 `[NEEDS CLARIFICATION]` 标记，Phase 0 调研目标达成，可进入 Phase 1
设计产出。
