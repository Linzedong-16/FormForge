# Implementation Plan: q-editor 问卷引擎无缝迁移

**Branch**: `012-q-editor-engine-migration` | **Date**: 2026-08-18 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/012-q-editor-engine-migration/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

`app/q-editor` 目前维护着一份与 `packages/survey-engine`（`monorepo-survey-engine`）重复的本地题型渲染/
编辑实现，且这份本地实现在共享包抽取之后独立演进出 5 项共享包尚不具备的能力/行为差异（选项联动候选池、
`client_key` 动态规则管理、`Signature` 的 MinIO 上传、`PicItem` 响应体兼容、`SinglePicSelect` 答案发射，
详见 spec.md 的 FR-010）。技术路线是"先补齐共享引擎能力（成为功能超集）→ 再将 `q-editor` 切换为消费
共享包 → 最后清理本地重复代码"的三阶段迁移，全程通过对照回归验证保证零功能回退。

调研确认：共享引擎近期的核心解耦改造（`188563c`）已经把选项联动/规则校验的**纯逻辑**（`resolveOptionPool`、
`validateRuleSet`、`useRuleRuntime` 等）下沉到框架无关的 `core/logic` 层并导出，真正缺失的只是
**Store 层的便捷方法**（`getComByClientKey` 等）与**组件层的接线**（`SingleSelect.vue` 等尚未消费这些
已存在的纯函数）——这大幅降低了选项联动与 `client_key` 两项能力回补的实现风险，工作量集中在"接线"而非
"重新实现算法"。`Signature` 的 MinIO 上传、`PicItem` 响应体兼容、`SinglePicSelect` 答案发射三项则是货真
价实的缺口，需要按 q-editor 现有实现原样回补。

## Technical Context

**Language/Version**: TypeScript 5.9（`strict: true`），Vue 3.5 `<script setup>`

**Primary Dependencies**: Vite 7、Pinia 3、Element Plus、vue-i18n、Dexie（IndexedDB，本地草稿存储）、
`vuedraggable`、qiankun 子应用生命周期（`app/q-editor` 侧）；`packages/survey-engine`
（`monorepo-survey-engine`）以 `workspace:*` 协议被 `app/q-editor`、`app/frontend` 共同依赖。

**Storage**: 无新增持久化需求。签名图片沿用既有 MinIO 对象存储（经 `q-server` 既有上传接口），问卷正文
数据沿用既有后端持久化结构（本次迁移不改变持久化格式，见 spec.md Assumptions）；`Dexie`
仅用于编辑器本地草稿缓存，无变更。

**Testing**: Vitest（`packages/survey-engine`、`app/q-editor` 均已配置）+ `vue-tsc --build` 类型检查 +
手动开发服务器回归（Constitution Principle V 要求的 UI 变更人工验证）。按 spec.md 澄清结论，FR-010 列出
的 5 项高风险分歧点须补充 Vitest 组件级用例，其余题型以手动回归为主。

**Target Platform**: 浏览器 SPA；`app/q-editor` 同时支持独立单页运行与作为 `main-app` 的 qiankun 子应用
集成运行两种模式（FR-007）。

**Project Type**: Monorepo — 共享库（`packages/survey-engine`）+ 两个 Web 前端消费方
（`app/q-editor`、`app/frontend`）。

**Performance Goals**: 无新增性能指标；须保持现有前端构建的手动分包策略（vendor / UI 库 / survey-engine
chunk 边界，Constitution Principle X）不因本次代码搬迁而劣化。

**Constraints**:

- 迁移全程不允许消费方（`q-editor`）出现能力空窗期（FR-003）。
- 不改变问卷/签名数据的持久化格式与后端 API 契约。
- 不引入新的专门测试基础设施，仅复用现有 Vitest（FR-006 例外条款）。
- 必须保持 qiankun `bootstrap`/`mount`/`unmount`/`update` 生命周期契约与 `routerBase` 可配置性
  （FR-007）。

**Scale/Scope**: 覆盖 `q-editor` 全部 14 种业务题型组件 + 计算字段伪题型、1 个编辑器 Store
（`useEditor.ts`）、FR-010 列出的 5 项已确认分歧点；不涉及 `app/frontend` 的代码改动（其连带影响作为
独立事项记录，见 spec.md Assumptions）。

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| 原则                                                    | 适用性与门禁结论                                                                                                                                                                                                                                 |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| I. Monorepo Module Boundary Integrity                   | **PASS（且是本迁移的直接目标）**：消除 `q-editor` 与 `packages/survey-engine` 之间的重复实现，正是本原则"跨包复用必须通过 `packages/*` 而非复制粘贴"的具体落地。                                                                                 |
| II. Strict Type Safety & Schema-First Validation        | **PASS，附带门禁**：回补 FR-010 各项能力及修复 `Signature.vue` 既有 `TS2345` 错误时，必须在 `strict: true` 下正确建模类型，不得引入 `any` 掩盖类型不匹配。                                                                                       |
| III. Unified API Contract & Response Envelope           | **PASS，附带纠偏**：`PicItem.vue` 的响应体兼容问题（FR-010 第 4 项）经核对，引擎当前"扁平 `file_url`"的假设不符合宪法规定的规范信封 `{code, msg, data}`；应以 `q-editor` 现有的嵌套 `data.file_url` 读取方式为准进行统一，而非各自兼容两种格式。 |
| IV. Security-by-Default                                 | **N/A**：上传文件的 MIME/大小校验属于 `q-server` 后端职责，本次前端迁移不改变上传接口契约，不涉及本原则的新增风险面。                                                                                                                            |
| V. Test-First / Test-Adequate Delivery                  | **PASS**：FR-006 已要求 FR-010 高风险项补充 Vitest 用例，且 UI 变更须走开发服务器手动回归，符合本原则对 UI 变更的验证要求。                                                                                                                      |
| VI. Observability & Structured Logging                  | **N/A**：本迁移不涉及请求日志/追踪链路变更。                                                                                                                                                                                                     |
| VII. Code Style & Static Analysis Compliance            | **PASS，附带门禁**：`packages/survey-engine` 现存文件混用 CRLF 行尾（q-editor 侧为 LF），回补/搬迁涉及的文件必须统一为项目 Prettier 配置期望的行尾与格式，避免触发零警告 lint 门禁失败。                                                         |
| VIII. Micro-Frontend & Cross-App Integration Discipline | **PASS**：FR-007 已将 qiankun 生命周期契约与独立/集成双模式验证列为强制要求。                                                                                                                                                                    |
| IX. AI/LLM Integration Governance                       | **N/A**：本迁移不涉及 LLM 调用链路。                                                                                                                                                                                                             |
| X. Performance & Data Pipeline Integrity                | **PASS，附带门禁**：题型组件从 `q-editor` 本地搬迁到共享包后，须复核 Vite 手动分包配置，确保 `survey-engine` 独立 chunk 边界不被打散或与 vendor/UI 库 chunk 意外合并。                                                                           |

**结论**：无需 Complexity Tracking 豁免项——所有原则均可在现有架构下满足，III 与 VII 两项发现的具体纠偏点
已转化为下方 Phase 1 设计的输入，而非需要突破宪法约束的例外。

**Post-Phase-1 复核**：完成 Phase 0（research.md）与 Phase 1（data-model.md、contracts/、quickstart.md）
设计产出后重新核对本表，结论不变——III（PicItem 响应体裁决）与 X（分包边界人工核对）两项"附带门禁/
纠偏"事项均已在 research.md 中转化为明确的实现决策（分别见 research.md 第 2 节、第 5 节），未发现
新的原则冲突或需要 Complexity Tracking 记录的违例。

## Project Structure

### Documentation (this feature)

```text
specs/012-q-editor-engine-migration/
├── plan.md              # 本文件（/speckit-plan 命令输出）
├── research.md          # Phase 0 输出
├── data-model.md         # Phase 1 输出
├── quickstart.md         # Phase 1 输出
├── contracts/            # Phase 1 输出：共享引擎对外契约
│   └── survey-engine-exports.md
└── tasks.md              # Phase 2 输出（由 /speckit-tasks 生成，本命令不创建）
```

### Source Code (repository root)

```text
packages/survey-engine/            # 迁移目标：功能超集共享引擎（本次需扩充的部分）
├── src/
│   ├── adapters/vue3/
│   │   ├── useRuleRuntime.ts       # 已存在：resolveOptionPool 的 Vue 接线点，SingleSelect 等需消费它
│   │   └── componentMap.ts
│   ├── core/logic/                 # 已存在：resolveOptionPool / validateRuleSet / RuleViolation 等纯函数
│   ├── stores/useEditor.ts         # 需扩充：补齐 client_key 相关 Store 方法（FR-002/FR-010）
│   ├── components/SurveyComs/
│   │   ├── Materials/SelectComs/
│   │   │   ├── SingleSelect.vue    # 需接线：消费 optionPool/resolveOptionPool（FR-001/FR-010）
│   │   │   ├── OptionSelect.vue    # 需接线：同上
│   │   │   └── SinglePicSelect.vue # 需修复：补齐 updateAnswer 事件发射（FR-010 第 5 项）
│   │   ├── Materials/AdvancedComs/
│   │   │   └── Signature.vue       # 需回补：MinIO 异步上传流程（FR-010 第 3 项）
│   │   └── Common/PicItem.vue      # 需修复：响应体解析对齐统一 API 信封（FR-010 第 4 项）
│   └── api/upload.ts               # 需扩充：补齐 uploadSurveyFile（若尚未导出）
└── package.json                    # 已含 uuid ^13.0.0，与 q-editor 版本一致，无需新增依赖

app/q-editor/                       # 迁移终态：移除本地重复实现，改为消费共享包
├── src/
│   ├── stores/useEditor.ts         # 待清理：迁移完成后删除，改用 monorepo-survey-engine 导出的 Store
│   ├── components/SurveyComs/*     # 待清理：迁移完成后删除，改用共享包组件注册表
│   └── views/                      # 保留：编辑器页面级容器与业务集成代码，不属于重复实现范畴
└── package.json                    # 已声明 monorepo-survey-engine: workspace:*，无需变更

app/frontend/                       # 范围外：已完成迁移，本次不改动（连带影响单独确认，见 spec.md）
```

**Structure Decision**：采用现有 monorepo 布局，不新增顶层目录。变更集中在
`packages/survey-engine/src/{stores,components,core,adapters}` 内的既有文件（扩充/修复而非新增模块），
以及 `app/q-editor/src/{stores,components}` 内对应文件的最终删除；不引入新的项目结构选项。

## Complexity Tracking

> 无违反项，本节留空。
