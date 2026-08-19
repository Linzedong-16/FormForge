# 契约：共享引擎对外导出契约（survey-engine exports）

**Feature**: [spec.md](../spec.md) | **Plan**: [plan.md](../plan.md) | **Data Model**: [data-model.md](../data-model.md)

本项目为 monorepo 内部共享库场景，"接口契约"指 `packages/survey-engine` 对其消费方
（`app/q-editor`、`app/frontend`）暴露的**模块导出 API**，而非 HTTP/REST 契约。本文件描述迁移完成后
`packages/survey-engine/src/index.ts` 需新增/调整的公开导出，作为消费方（`q-editor`）代码改造时可依赖
的稳定接口。

## 契约原则

- 现有导出（`componentMap`、`getSurveyComsList`、`useEditorStore`、`core/logic` 各函数等）保持向后
  兼容，不做破坏性签名变更（FR-005 要求后续变更同时服务两个消费方，破坏性变更会立即影响
  `app/frontend`）。
- 新增导出仅用于补齐 FR-010 列出的能力，不引入与现有导出重复的平行实现。

## 1. Store 契约扩展（`useEditorStore` / `stores/useEditor.ts`）

**新增方法**（追加到现有 Store 的 actions，不改变已有 state 结构）：

| 方法签名                                                                                  | 用途                             | 对应需求       |
| ----------------------------------------------------------------------------------------- | -------------------------------- | -------------- |
| `getComByClientKey(clientKey: ClientKey): Status \| undefined`                            | 按 client_key 查询题目           | FR-002         |
| `ensureComClientKey(com: Status): ClientKey`                                              | 惰性补齐 client_key（幂等）      | FR-002、FR-008 |
| `setComLogicByClientKey(clientKey: ClientKey, logic: Partial<QuestionLogicConfig>): void` | 按 client_key 更新规则           | FR-002         |
| `findRuleReferencesTo(clientKey: ClientKey): RuleViolation[]`                             | 删除题目前查找引用方             | FR-002         |
| `getDanglingReferencesFrom(clientKey: ClientKey): RuleViolation[]`                        | 体检指定题目自身规则中的悬空引用 | FR-002         |

**调用方约束**：`q-editor` 迁移后必须改为调用共享引擎导出的这 5 个方法，不得保留本地平行实现
（FR-004）。方法行为（包括容错分支，如找不到题目时的告警而非异常）必须与 q-editor 迁移前的实现
逐条对齐，作为回归验证基线（对应 quickstart.md 的验证脚本）。

## 2. 组件 Props/Emits 契约调整

### 2.1 `SingleSelect.vue` / `OptionSelect.vue`（选项联动接线）

- **Props**（不变，沿用现有形状）：`optionPool?: string[] | { prompt: true }`。
- **变更点**：组件内部计算 `isPoolPrompting`/`isOptionAvailable` 的逻辑保持不变（这是纯粹的展示层
  逻辑，本来就该留在组件内）；变更的是**谁来产出 `optionPool` 这个 prop 的值**——迁移后应改为由消费
  `useRuleRuntime`（或 Store 新增的等效 getter）计算得出，而不是像 q-editor 现状那样由未追踪清楚的
  上游容器手工计算（研究阶段已标记此为任务分解阶段需先定位的细节，见 research.md 第 1 节）。

### 2.2 `SinglePicSelect.vue`（答案发射修复）

- **新增 Emits**：`defineEmits<{ updateAnswer: [value: string] }>()`。
- **新增行为**：`el-radio-group` 的 `@change` 绑定处理函数，选中值变化时调用
  `emits("updateAnswer", radioValue.value)`。
- **契约意义**：这是该题型组件对外的唯一答案上报通道，上层容器（题目列表/答案收集器）依赖此事件
  更新答案状态；缺失此事件即等价于该题型在编辑器预览态"选择后答案不被记录"的功能缺陷。

## 3. Signature（签名）上传契约

`Signature.vue` 对外的可观察契约（不新增 Store/组件间的 props，仅描述其内部对上传 API 的调用约定，
供实现阶段与测试阶段对齐行为基线）：

- 触发条件：用户完成签名绘制后触发上传。
- 正常路径：调用共享的 `uploadSurveyFile(file, surveyId)`（复用 `PicItem.vue` 已有的同一上传封装，
  避免为 Signature 单独实现一套上传逻辑），上传中展示 loading 状态提示；成功后以远程 URL 作为答案值。
- 降级路径：`surveyId` 缺失（如题目尚未挂载到具体问卷）或上传失败时，降级为 base64 内联 data URL
  作为答案值，不阻塞用户继续编辑/预览。
- `surveyId` 取值方式：通过 `getSurveyId()`（Store 或 composable 提供的当前问卷 ID 访问器）注入，
  不由组件自行从路由参数解析（保持与 `PicItem.vue` 一致的取值路径，避免两处实现分叉）。

## 4. `PicItem.vue` 响应体解析契约

- **输入契约**：上传接口响应体统一按 Constitution Principle III 规定的信封解析，即
  `response.data.file_url`（`response: { code: number; msg: string; data: { file_url: string } | null }`）。
- **不再支持**：扁平结构 `response.file_url` 的读取分支在迁移后从共享引擎中移除（research.md 第 2 节
  已确认后端接口已统一为标准信封，该分支属于历史遗留代码）。
- **错误处理契约**：上传失败时向上抛出错误（`options.onError`），并在界面展示统一的失败提示文案，
  不静默吞掉错误。

## 5. 消费方使用契约（q-editor 侧改造要求）

迁移完成后，`app/q-editor` 对共享引擎的依赖方式：

```ts
// 迁移后：q-editor 不再自行定义 Store/组件，改为直接消费共享包导出
import {
  useEditorStore,
  componentMap,
  getSurveyComsList
  // ...其余既有导出
} from "monorepo-survey-engine";
```

`app/q-editor/src/stores/useEditor.ts` 与
`app/q-editor/src/components/SurveyComs/*`（与共享引擎重复的部分）在迁移终态中删除（FR-004、SC-002），
仅保留编辑器页面级容器/业务集成代码（如路由、页面布局、与后端问卷保存接口的对接），这部分不属于
"重复实现"，不在删除范围内。
