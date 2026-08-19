# 迁移前基线记录（T001）

**记录时间**：2026-08-19（本次迁移代码改动开始前）

本文件记录迁移前六条命令的执行结果，作为 SC-001"零功能回退"判定时的排除范围依据。

## 1. `pnpm --filter monorepo-survey-engine test`

- 结果：**全部通过**。5 个测试文件，105 个用例，全部 passed。
- 结论：本包当前无既有测试基线负担，Phase 2 结束后应保持全部通过 + 新增用例通过。

## 2. `pnpm --filter q-editor test`

- 结果：**4 个用例失败**（2 个测试文件），465 个用例通过。
- 失败清单（与本次迁移无关，Edge Cases 已在 spec.md 中列为既有缺陷，不计入零回退判定）：
  1. `src/api/modules/settings/__tests__/index.test.ts` › `uploadAvatar` › "应使用 axios.post 调用 /api/user/avatar，传入 FormData 和正确的 headers"
  2. `src/api/modules/settings/__tests__/index.test.ts` › `uploadAvatar` › "应返回 axios 响应的 data 字段"
  3. `src/api/__tests__/serverClient.test.ts` › "响应拦截器 — 401" › "401 应尝试刷新 Token"
  4. `src/api/__tests__/serverClient.test.ts` › "响应拦截器 — 401" › "Token 刷新失败应调用 handleLogout"
- 结论：与本次迁移（题型组件/useEditor Store/上传封装）无关，均属于 settings/serverClient 模块既有缺陷。迁移完成后若这 4 项仍失败但未新增其他失败项，视为达标。

## 3. `pnpm --filter monorepo-survey-engine exec vue-tsc --build`

- 结果：**无输出，零错误**。

## 4. `pnpm --filter q-editor exec vue-tsc --build`（实际通过 `pnpm --filter q-editor run type-check` 执行，`vue-tsc` 未在该包暴露为可直接 `exec` 的二进制）

- 结果：**3 处既有类型错误**（与本次迁移无关，不计入零回退判定；见下方"须随本次改造修复"分类）：
  1. `src/components/SurveyComs/Materials/AdvancedComs/Signature.vue(72,64)`：`TS2345` —— `inject` 第二参数为字面量 `null`，不满足 `() => string | null` 函数类型形参。**此项须随本次改造一并修复**（T017 已规划）。
  2. `src/views/EditorView/LeftSide/TemplateMarket.vue(324,28)`：`TS2345` —— 与本次迁移无关，`TemplateMarket.vue` 不在本次改造范围内，不计入零回退判定。
  3. `src/views/EditorView/LeftSide/TemplateMarket.vue(355,54)`：`TS18047` —— 同上，与本次迁移无关。

## 5. `pnpm exec tsc --noEmit -p tsconfig.json`（仓库根级 tsconfig）

- 结果：**大量既有错误**，均与本次迁移无关（根级 tsconfig 未配置 `lib: dom`，产生大量 `packages/tracking-sdk`、`packages/components`、`packages/survey-engine`（i18n/utils 中的 DOM API 引用）的噪音错误，与本次迁移目标文件无关）。
- 唯一需要计入基线追溯的两处（`packages/sse-client/src/ai.ts`，与本次迁移无关但 spec.md Edge Cases 明确记录）：
  1. `packages/sse-client/src/ai.ts(185,20)`：`TS2379` —— `exactOptionalPropertyTypes: true` 下 `_rawComponents` 可选属性类型不匹配。
  2. `packages/sse-client/src/ai.ts(323,13)`：`TS2322` —— `title` 可选属性类型不匹配。
- 其余噪音错误（`packages/components`、`packages/tracking-sdk`、`packages/survey-engine/src/i18n`、`packages/survey-engine/src/utils/{index.ts,useColorBlind.ts,useTheme.ts}`、`packages/survey-engine/src/__tests__/setup.ts`）：**根级 tsconfig 已知噪音、与本次迁移无关**，不逐条列出，不计入零回退判定（这些文件在各自包自身的 `vue-tsc --build`/测试配置下均能正确解析 DOM 类型，仅根级 tsconfig 缺少 `lib: dom` 才暴露此噪音）。

## 6. `pnpm --filter q-editor build`（迁移前生产构建，用于捕获 T041 分包体积基线）

- 说明：`pnpm --filter q-editor build` 通过 `run-p type-check "build-only"` 并行执行，因 §4 列出的既有类型错误导致 `type-check` 子任务以非零退出码结束，`run-p` 判定整体失败（`ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL`）。为取得构建产物基线，改为单独执行 `pnpm run build-only`（即 `vite build`，不经过 `type-check` 门禁），成功产出 `dist/`。此产物即为本次基线快照，T041 阶段需在同等条件下对比（迁移后若 `type-check` 门禁已修复通过，直接用 `pnpm --filter q-editor build` 的完整产物对比即可）。
- **关键观察**：迁移前构建产物中，`app/q-editor/vite.config.ts` 的 `manualChunks` 并未为 `monorepo-survey-engine`（workspace 包）产出独立 chunk —— 与 T041 任务描述一致：`getPackageName` 仅匹配 `/node_modules/` 路径，workspace 包被 Vite 解析到 `packages/survey-engine/src/...` 真实路径，不落入该匹配分支。`survey-engine` 相关代码目前随业务代码一起打入 `index-B4WLr0FZ.js`（307.15 kB，gzip 78.72 kB）等业务 chunk。
- **chunk 文件名与体积清单**（`dist/assets/js/`，仅列非 `-legacy-` 后缀的现代版 chunk 作为主要对比对象，legacy 版本体积走势应同步；单位字节，来自 `ls -la` 原始输出）：

| Chunk                                                                                                                                                                                              | 体积（bytes） | gzip（如有 br 文件可换算）                        |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ------------------------------------------------- |
| element-plus-D5wHZAGm.js                                                                                                                                                                           | 786,147       | br: 190,080                                       |
| vendor-StpNAP1D.js                                                                                                                                                                                 | 501,049       | br: 151,745                                       |
| index-B4WLr0FZ.js                                                                                                                                                                                  | 307,146       | br: 51,999                                        |
| icons-CH_2nFqU.js                                                                                                                                                                                  | 78,371        | br: 19,522                                        |
| i18n-BOjGuWRT.js                                                                                                                                                                                   | 48,652        | br: 14,699                                        |
| draggable-Cqoix9Bs.js                                                                                                                                                                              | 50,858        | br: 16,092                                        |
| vue-vendor-A47OtiQw.js                                                                                                                                                                             | 32,460        | br: 11,222                                        |
| index-D3p53AYM.js                                                                                                                                                                                  | 31,433        | br: 7,415                                         |
| ProfileSettings-BrCuEOT4.js                                                                                                                                                                        | 22,731        | br: 6,373                                         |
| defaultStatusMap-Dl9Ba3Nf.js                                                                                                                                                                       | 21,448        | br: 2,029                                         |
| Header-CrSFygLX.js                                                                                                                                                                                 | 16,390        | br: 4,899                                         |
| SurveyView-T3wJL4y6.js                                                                                                                                                                             | 15,702        | br: 5,372                                         |
| index-CtCWxdJ0.js                                                                                                                                                                                  | 14,279        | br: 3,593                                         |
| TemplateMarket-JdgiOtUP.js                                                                                                                                                                         | 8,391         | 无 br                                             |
| Layout-mi29kccX.js                                                                                                                                                                                 | 5,866         | 无 br                                             |
| SurveyType-DpUckKL6.js                                                                                                                                                                             | 4,536         | 无 br                                             |
| index-CHwtf9cg.js                                                                                                                                                                                  | 4,294         | 无 br                                             |
| index-BGJyHUgy.js                                                                                                                                                                                  | 3,100         | 无 br                                             |
| index-CZxuDfYv.js                                                                                                                                                                                  | 2,368         | 无 br                                             |
| PersonalInfoGroupView-B9o9pbV6.js                                                                                                                                                                  | 2,360         | 无 br                                             |
| index-VCgiWPVn.js                                                                                                                                                                                  | 2,341         | 无 br                                             |
| AdvancedGroupView-ByWKvIBz.js                                                                                                                                                                      | 1,449         | 无 br                                             |
| Outline-Fqdw43B6.js                                                                                                                                                                                | 1,408         | 无 br                                             |
| ContactGroupView-BpA_qgA8.js                                                                                                                                                                       | 1,366         | 无 br                                             |
| SelectGroupView-CmlQsCvO.js                                                                                                                                                                        | 1,349         | 无 br                                             |
| index-DYtvbB_K.js                                                                                                                                                                                  | 654           | 无 br                                             |
| NoteGroupView-bXdvJWCC.js                                                                                                                                                                          | 712           | 无 br                                             |
| InputGroupView-DHfUPEbt.js                                                                                                                                                                         | 715           | 无 br                                             |
| EditPannel-BaVACRD2.js                                                                                                                                                                             | 496           | 无 br                                             |
| SingleSelect-k_NH5zpN.js / MultiSelect-CcJUrO9P.js / OptionSelect-yohy-0kr.js / TextInput-BRkMPipO.js / DateTime-hSFy1CKg.js / RateScore-B9KUrf0M.js / Cascader-29nx45o6.js / TextNote-D9tLhsBh.js | 均 245        | 无 br（各自独立微 chunk，动态 import 的题型组件） |
| hooks-Dx8zHaOl.js                                                                                                                                                                                  | 170           | 无 br                                             |
| eventBus-Dsgb-llo.js                                                                                                                                                                               | 69            | 无 br                                             |

未列出的 legacy 版本（`-legacy-` 后缀）体积走势与对应现代版本一致，T041 对比时以现代版本为准即可。

## 结论：与本次迁移无关 vs 须随本次改造修复

| 分类                                 | 内容                                                                                                                                                                                                                                                                                                |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **与本次迁移无关，不计入零回退判定** | q-editor 侧 4 项既有失败单测（settings/serverClient）；`TemplateMarket.vue` 的 2 处 `TS2345`/`TS18047`；`packages/sse-client/src/ai.ts` 的 `TS2379`/`TS2322`；根级 tsconfig 因缺少 `lib: dom` 产生的 `packages/components`、`packages/tracking-sdk`、`packages/survey-engine`（i18n/utils）噪音错误 |
| **须随本次改造一并修复**             | `Signature.vue(72,64)` 的 `TS2345`（T017 规划中已修正为 `undefined` 默认值 + 回退表达式）                                                                                                                                                                                                           |
