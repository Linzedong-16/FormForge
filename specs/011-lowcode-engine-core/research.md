# Phase 0 研究：低代码引擎核心解耦

本文档记录 Technical Context 中需要澄清的技术决策，均基于对 `packages/survey-engine` 现有代码的实际核查（非推测），供 Phase 1 设计与 tasks 拆解直接引用。

## R1：`src/logic/` 并非 100% 框架无关 —— 核心/适配层边界的真实划分

**发现**：spec.md 与此前讨论都默认 `packages/survey-engine/src/logic/` 目录整体是"纯 TS、零依赖"的规则引擎（008 阶段 research.md 亦如此记录）。逐文件核查 import 语句后发现该结论只对 4/5 文件成立：

| 文件                      | import 检查结果                                                                                                                     |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `logic/types.ts`          | 仅 `import type { Material } from "../types/material.js"` —— 类型导入，无运行时依赖                                                 |
| `logic/evaluator.ts`      | 仅同目录类型导入，无框架依赖                                                                                                        |
| `logic/normalize.ts`      | 仅同目录类型导入，无框架依赖                                                                                                        |
| `logic/validator.ts`      | 仅同目录类型导入，无框架依赖                                                                                                        |
| `logic/useRuleRuntime.ts` | **`import { computed } from "vue"` 与 `import type { ComputedRef, Ref } from "vue"`** —— 是一个 Vue composable，直接依赖 Vue 运行时 |

进一步核查发现，即便是"纯"的 4 个文件，也通过 `import type { Material } from "../types/material.js"` 间接依赖 `types/material.ts`；而 `types/material.ts` 又 `import type { VueComType } from "./common.js"`（`TabInfo.icon`/`TabInfo.view`/`ComponentMap` 三处用到），`common.ts` 中 `VueComType = ReturnType<typeof defineComponent>` 直接来自 `vue`。这是**纯类型导入**（`import type`），在编译产物中会被完全擦除、不产生运行时依赖，但如果不做任何处理，`core/logic/types.ts` 的源码里仍会出现一条指向 `vue` 的 import 语句，不满足 FR-001"不得直接依赖或 import 任何前端框架"的字面要求（该要求未区分 type-only import 与 value import），也会让 SC-003"不安装任何前端框架依赖的环境下独立完成单测"在最严格的解释下失败（`vitest` 解析 `import type` 时仍需能 resolve 到 `vue` 的类型声明文件，若 `node_modules` 中未安装 `vue`，`vue-tsc`/部分 bundler 配置下会报模块找不到）。

**Decision**：

1. 将 `logic/` 目录中已验证为纯 TS 的 4 个文件（`types.ts`、`evaluator.ts`、`normalize.ts`、`validator.ts`）物理迁移到 `src/core/logic/`，算法不变。
2. 将 `Material`/`SurveyComName`/`EditComName`/`componentName`/`isSurveyComName`/`isUseForPDF` 等不依赖 `VueComType` 的部分从 `types/material.ts` 中拆出，下沉到 `src/core/schema/types.ts`；`TabInfo`/`ComponentMap` 等依赖 `VueComType` 的部分保留在 `src/types/material.ts`（适配层类型）。`core/logic/types.ts` 改为从 `core/schema/types.ts` 导入 `Material`，彻底切断到 `vue` 的 import 路径（包括 type-only 路径）。
3. 将 `useRuleRuntime.ts` 迁移到 `src/adapters/vue3/useRuleRuntime.ts`，其内部改为从 `core/logic` 导入 `normalizeAnswerValue` 等纯函数。

**Rationale**：FR-001 要求"清晰的目录/模块边界"，仅靠口头约定"这些文件是纯的"无法被 lint 规则或 CI 检查强制执行；物理迁移 + 切断 type-only 依赖链，使 `core/` 目录本身即是可被 `eslint-plugin-import` 的 `no-restricted-imports`（限制 `core/**` 不得 import `vue`）规则强制约束的边界，一次性满足 FR-001 与 SC-003 的最严格解释，且改动仅为文件移动 + import 路径调整，不改变任何算法逻辑，风险可控。

**Alternatives considered**：

- （a）保持 `src/logic/` 原地不动，仅在包根 `index.ts` 的导出注释里说明"这是核心逻辑"。**拒绝原因**：无法解决 `useRuleRuntime.ts` 对 `vue` 的运行时依赖问题，且"目录边界"本身就是 spec 明确要求的验证方式（User Story 2 Acceptance Scenario 1：检查 import 语句），停留在文档层面无法通过该验收标准。
- （b）把 `Material` 类型定义整体保留在 `types/material.ts`，`core/logic` 直接依赖它（接受 type-only import 指向一个内部还混有 `VueComType` 的文件）。**拒绝原因**：即使当前只是 type-only 导入不产生运行时依赖，一旦未来有人在 `types/material.ts` 顶部新增任何值导入（哪怣只是一个常量），`core/logic` 会在不知不觉中被拖入框架依赖，边界形同虚设；拆分成本很低（都是纯字符串联合类型 + 两个类型谓词函数），值得一次性做对。

## R2：`Status`/`BaseProps` 的组件引用耦合点定位

**发现**：组件运行时引用耦合并不只存在于 `Status.type: VueComType`（题目整体使用哪个 Vue 组件渲染）这一层，还存在于每个字段级配置对象里：`types/editProps.ts` 中 `BaseProps.editCom: VueComType` 是**必填字段**，`TextProps`/`OptionsProps`（进而 `BaseStatus` 下的 `title`/`desc`/`position`/`titleSize`/…等全部字段）都通过继承 `BaseProps` 携带了一个 Vue 组件引用，用来渲染"编辑该字段时使用哪个编辑器组件"。`utils/index.ts:335` 的 `restoreComponentStatus()` 正是分两层还原：外层 `com.type = component`（题型组件），内层遍历 `com.status` 的每个字段、按 `prop.name` 查找并写回 `prop.editCom = editCom`（字段编辑器组件）。这解释了为什么现有 `Status` 对象不能被直接 `JSON.stringify`/`JSON.parse`：不止一处引用需要还原，是"每题 1 + N 个"引用点（N = 该题型拥有的可配置字段数）。

**Decision**：新的纯 Schema 类型（`core/schema/types.ts`）中，`BaseProps` 对应结构改为 `editComName: EditComName`（字符串字面量类型，取值即现有 `componentMap` 中"编辑组件"那一组 key，如 `"title-editor"`、`"options-editor"`），移除 `editCom: VueComType` 字段；顶层 `SchemaComponent`（对应现有 `Status`）同理保留字符串 `name: Material`、移除 `type: VueComType`。Vue3 适配层渲染时，通过 `resolveVue3Component(name)` 与 `resolveVue3Component(editComName)` 两次查表分别得到题型组件与字段编辑器组件，替代现状的"还原并挂到数据对象上"，组件引用只存在于渲染层的局部变量里，绝不再混入被序列化的数据结构。

**Rationale**：直接对应 FR-002"题目与组件的关联只能通过字符串标识表达"与 SC-002"新生成的 Schema 可以被直接序列化为 JSON 再还原，无需任何额外步骤"；沿用现有 `componentMap` 里已经存在的字符串 key 集合作为 `EditComName` 的取值范围，不需要发明新的命名体系，迁移时字段名到组件的映射关系可以 1:1 复用。

**Alternatives considered**：只解决顶层 `Status.type`，保留 `BaseProps.editCom` 不变（视为"渲染期临时挂载、不算数据模型污染"）。**拒绝原因**：`editCom` 与 `type` 在数据结构里的存在方式完全相同（都是对象属性上挂着一个函数/组件引用），选择性地只解决一半会让 SC-002 的"直接 JSON.stringify 再 JSON.parse"验收标准仍然失败（因为 `editCom` 依然是不可序列化的函数引用），不满足 FR-002 的字面要求。

## R3：组件工厂接口设计——框架无关契约 + Vue3 具体实现

**Decision**：`core/factory/index.ts` 导出一个与渲染框架无关的通用工厂契约：

```ts
export interface ComponentFactory<TComponent> {
  register(name: string, component: TComponent): void;
  resolve(name: string): TComponent | undefined;
  has(name: string): boolean;
}
export function createComponentFactory<TComponent>(): ComponentFactory<TComponent>;
```

`adapters/vue3/componentFactory.ts` 基于它构造一个具体实例：`export const vue3ComponentFactory: ComponentFactory<VueComType> = createComponentFactory<VueComType>()`，并在模块加载时把现有 `componentMap.ts` 中全部条目（业务组件 + 编辑组件）通过 `register()` 注册进去（`markRaw()` 包裹逻辑保留在这一层）。对外仍导出 `resolveVue3Component(name)` 作为便捷函数，供 `restoreComponentStatus.ts`、`SurveyPreviewDetail.vue` 等消费方使用。

**Rationale**：`createComponentFactory<TComponent>()` 是纯泛型工厂函数，核心包不需要知道 `TComponent` 具体是 Vue 组件、React 组件还是测试替身，直接满足 FR-003"允许按渲染框架分别注册字符串标识 → 组件的映射""接口设计上不得限定为仅支持单一框架"与 User Story 2 Acceptance Scenario 3"未来新增框架适配无需修改核心包代码"。

**Alternatives considered**：让 `ComponentFactory` 接口本身携带 Vue 特定的 `markRaw` 处理逻辑（例如 `register()` 内部自动调用 `markRaw`）。**拒绝原因**：`markRaw` 是 Vue 响应式系统的专属 API，写进核心接口会让"框架无关"的契约名不符实；`markRaw` 调用移到 `adapters/vue3/componentFactory.ts` 内部实现，核心接口保持完全通用。

## R4：旧格式兼容转换的检测规则（FR-006）

**Decision**：`core/schema/compat.ts` 导出 `isLegacyComponent(raw: unknown): boolean` 与 `toSchemaComponent(raw: LegacyOrSchemaComponent): SchemaComponent`。检测规则：一个题目对象被判定为"旧格式"，当且仅当满足以下任一条件：

- 存在 `type` 属性且其值不是字符串（当前 `Status.type` 是组件引用，新 Schema 中不应存在该属性）；
- `status` 对象内任一字段配置存在 `editCom` 属性；
- 缺少新 Schema 约定的版本标记字段（提案：`SchemaComponent` 新增可选字段 `schemaVersion?: number`，新格式恒为 `2`，旧格式该字段不存在，视为 `1`）。

命中旧格式时，`toSchemaComponent()` 剥离 `type`/`editCom` 等运行时引用属性，补齐 `schemaVersion: 2`，其余字段（`id`/`name`/`status` 内的配置值）原样保留；不做数据库写回，仅在内存中转换后交给渲染层使用。该函数在 `adapters/vue3/restoreComponentStatus.ts` 内被调用，取代现状"直接把组件引用写回数据对象"的做法，转为"先规范化数据，再在渲染时按需查表"。

**Rationale**：直接对应 FR-006"自动检测并兼容转换含组件引用或缺少新增字段的旧格式题目数据""转换过程对调用方透明""不需要专门的批量数据迁移脚本或数据库结构变更"；`schemaVersion` 字段沿用 008/009 阶段"新增可空字段、运行时兼容读取"的既定模式（如 `client_key`/`logic` 均为新增可空列），不需要 `app/q-server` 侧任何 schema 变更即可分辨新旧数据。

**Alternatives considered**：仅靠"是否存在 `type`/`editCom` 属性"判断，不引入 `schemaVersion` 字段。**拒绝原因**：无法覆盖"数据本身已经是纯字符串标识、但由于某种原因缺少其他新增字段"的边界场景（Edge Case 1 提到"缺少新字段"也算旧格式）；显式版本标记让未来第三次 Schema 迭代（如需要）也有明确的判别依据，避免检测逻辑无限堆叠特征探测规则。

## R5：编排状态纯逻辑——`UndoManager` 已经满足要求，只需迁移位置

**发现**：核查 `src/utils/undoManager.ts` 与其在 `src/stores/useEditor.ts` 中的用法（`stores/useEditor.ts:32-33`：`import { UndoManager, type Snapshot } from "../utils/undoManager"`，`const undoManager = new UndoManager()` 在模块级创建、显式注释"非响应式，避免 Pinia reactive 代理干扰 structuredClone"），确认 `UndoManager` 本身已经是一个不依赖 Pinia/Vue 的独立类，且已经被现有 Store 有意放在 Pinia 响应式系统之外维护。这与 FR-005"编排状态...核心引擎仅需导出无状态管理框架依赖的撤销/重做管理器等纯逻辑供宿主调用"的要求已经天然吻合，不需要重新设计撤销/重做算法。

**Decision**：仅将 `src/utils/undoManager.ts` 物理迁移到 `src/core/orchestration/undoManager.ts`，不改动其内部实现；`stores/useEditor.ts` 改为 `import { UndoManager } from "../core/orchestration/undoManager"`，继续按现有方式在 Pinia store 内使用（作为"宿主项目选用 Pinia 时的一种接入方式"，符合 User Story 3 "现有消费方若不需要该能力可以不接入"的表述）。

**Rationale**：验证"编排状态交还宿主管理"这一目标在当前代码里已经部分达成，只是物理位置未体现"核心/适配"边界；移动到 `core/` 后，`package.json` 的 `dependencies`/`devDependencies` 中 `pinia` 仍会保留（因为 `stores/useEditor.ts` 仍需要它），但可以在 FR-005 验收时明确说明"`core/` 目录本身不 import pinia"，而不是要求整个包 `package.json` 移除 pinia 依赖（spec.md FR-005 的验收标准是"核心引擎不得内置或依赖"，指向的是 `core/` 子模块级别，而非整个 `monorepo-survey-engine` 包）。

**Alternatives considered**：重新设计一套"更彻底"的编排状态管理抽象（如引入观察者模式让核心层反向通知宿主）。**拒绝原因**：现有 `UndoManager` 类已验证稳定运行（008/009 阶段未发现相关缺陷），且 spec.md Assumptions 明确"是否在 `app/frontend` 侧实际接入使用由该消费方自行决定，不强制要求"，重新设计属于超出必要范围的过度工程。

## R6：测试策略——验证"核心可在不装 Vue 环境下独立测试"（SC-003）

**发现**：现有 `packages/survey-engine/vitest.config.ts` 全局启用 `environment: "jsdom"` 与 `@vitejs/plugin-vue` 插件，`include` 覆盖 `src/__tests__/**/*.spec.ts` 与 `src/logic/__tests__/**/*.spec.ts`，两类测试共用同一个 Vitest 配置实例，无法单独验证"某一部分测试在不加载 Vue/jsdom 的情况下也能跑通"。

**Decision**：为 `core/` 目录新增独立的 Vitest 配置 `packages/survey-engine/vitest.core.config.ts`：`environment: "node"`（而非 `jsdom`）、不加载 `@vitejs/plugin-vue` 插件、`include: ["src/core/**/__tests__/**/*.spec.ts"]`；`package.json` 新增脚本 `"test:core": "vitest run --config vitest.core.config.ts"`。CI/本地验收 SC-003 时运行该脚本，能在不解析任何 `.vue` 文件、不初始化 `jsdom` 的最小环境下验证核心测试全部通过。原有 `vitest.config.ts` 的 `include` 需要相应剔除已迁移到 `core/` 下的测试文件路径，改为覆盖 `src/adapters/**/__tests__/**/*.spec.ts` 等适配层测试。

**Rationale**：这是唯一能把"核心与框架解耦"从"代码组织上看起来解耦"提升为"有自动化验证手段保证解耦"的做法，直接对应 SC-003 的字面要求（"不安装任何前端框架依赖的环境下，可以独立完成其自身的全部单元测试"）；两套配置并存的做法在 Vitest 生态中是常见模式（workspace / 多 config 文件），不需要额外第三方工具。

**Alternatives considered**：用同一个 `vitest.config.ts`、靠 `describe.skipIf`/条件判断区分"是否装了 Vue"。**拒绝原因**：无法真正验证"不安装 Vue 依赖"这一环境条件（Vue 仍会作为该配置文件的插件被加载），只是测试内容层面的隔离，不是环境层面的隔离，达不到 SC-003 要求的验证强度。
