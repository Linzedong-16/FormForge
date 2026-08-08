# Tasks: 后端 P0 严重问题修复

**Input**: Design documents from `/specs/001-backend-p0-fixes/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, quickstart.md

**Tests**: 根据 FR-009 要求，每个修复必须附带对应的单元测试，覆盖正常路径和边缘情况。

**Organization**: 任务按用户故事分组，每个故事可独立实现和验证。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可并行执行（不同文件，无依赖）
- **[Story]**: 任务所属用户故事（US1, US2, US3, US4）
- 描述中包含确切的文件路径

---

## Phase 1: Setup（环境准备）

**Purpose**: 确认开发环境和测试基础设施就绪

- [x] T001 确认开发环境就绪：PostgreSQL + Redis 可用，`pnpm install` 已完成
- [x] T002 [P] 确认现有测试套件基线通过率，运行 `cd app/q-server && pnpm vitest run` 记录当前状态

---

## Phase 2: Foundational（测试基础设施）

**Purpose**: 确保测试文件骨架存在，为各用户故事的测试先行做准备

**⚠️ CRITICAL**: 所有用户故事依赖本阶段的测试文件创建完成

- [x] T003 [P] 创建统计模块测试文件骨架 `app/q-server/src/spec/survey-stats/survey-stats.service.spec.ts`（若不存在则新建，导入必要的测试依赖和 mock）
- [x] T004 [P] 确认认证模块测试文件 `app/q-server/src/spec/user/auth/auth.service.spec.ts` 存在并可用于扩展（若不存在则新建骨架）

**Checkpoint**: 测试基础设施就绪 — 可以开始各用户故事的测试先行开发

---

## Phase 3: User Story 1 - 问卷统计页面快速加载 (Priority: P1) 🎯 MVP

**Goal**: 消除统计模块 N+1 查询问题，将逐题独立 SQL 改为按题型批量 GROUP BY 聚合，使数据库查询次数与题目数量解耦。

**Independent Test**: 创建含 30 道混合题型的问卷并提交答卷，调用统计接口，验证数据库查询次数 < 10 次且响应时间 < 3 秒。

### Tests for User Story 1

> **NOTE: 先编写测试，确保测试在实现前 FAIL**

- [x] T005 [P] [US1] 编写批量聚合正确性测试：创建含单选/多选/评分/滑块/文本多题型的模拟数据，验证聚合结果与逐题查询结果完全一致 in `app/q-server/src/spec/survey-stats/survey-stats.service.spec.ts`
- [x] T006 [P] [US1] 编写边缘情况测试：全部 text_note 组件返回空 questions 数组、零答卷返回空分布 in `app/q-server/src/spec/survey-stats/survey-stats.service.spec.ts`

### Implementation for User Story 1

- [x] T007 [US1] 实现单选/下拉题批量聚合方法：使用 `GROUP BY component_id, value` 一次 SQL 完成所有单选/下拉题的选项分布统计 in `app/q-server/src/modules/survey/survey-stats/survey-stats.service.ts`
- [x] T008 [US1] 实现多选题批量聚合方法：使用 `CROSS JOIN LATERAL jsonb_array_elements_text(values)` + `GROUP BY component_id, elem` 一次 SQL 完成所有多选题的选项分布统计 in `app/q-server/src/modules/survey/survey-stats/survey-stats.service.ts`
- [x] T009 [US1] 实现评分/滑块题批量聚合方法：使用 `GROUP BY component_id` + 数值 AVG/MIN/MAX 聚合一次 SQL 完成统计 in `app/q-server/src/modules/survey/survey-stats/survey-stats.service.ts`
- [x] T010 [US1] 实现文本题抽样方法：保持 `GROUP BY component_id` 获取简要分布 + LIMIT 抽样回答 in `app/q-server/src/modules/survey/survey-stats/survey-stats.service.ts`
- [x] T011 [US1] 实现按 component_id GROUP BY 的答案计数批量查询，替代逐题 `answer.count()` 调用 in `app/q-server/src/modules/survey/survey-stats/survey-stats.service.ts`
- [x] T012 [US1] 重构 `getSurveyStats` 方法主流程：先加载所有题目组件 → 按题型分组 → 每种题型一条批量 SQL → 组装结果，保留 `{ code, msg, data }` 响应格式不变 in `app/q-server/src/modules/survey/survey-stats/survey-stats.service.ts`
- [x] T013 [US1] 运行 T005-T006 测试确认全部通过，验证 N+1 查询已消除

**Checkpoint**: 统计模块 N+1 查询已消除，30 题问卷统计 SQL 查询次数 ≤ 10 次，API 响应格式不变

---

## Phase 4: User Story 2 - 问卷统计结果完整正确 (Priority: P1)

**Goal**: 移除 `getSurveyStats` 中 `Promise.all` 发起的第 4 个未被使用的全量组件查询，消除浪费的数据库 IO。

**Independent Test**: 审查代码确认 `Promise.all` 解构变量数量 = 数组元素数量，所有查询结果均被实际使用。

### Tests for User Story 2

> **NOTE: 先编写测试，确保测试在实现前 FAIL（更准确地说是验证旧代码的查询数量）**

- [x] T014 [P] [US2] 编写查询数量验证测试：mock Prisma 调用，验证 `getSurveyStats` 中并发查询数量 ≤ 3 个 in `app/q-server/src/spec/survey-stats/survey-stats.service.spec.ts`

### Implementation for User Story 2

- [x] T015 [US2] 移除 `getSurveyStats` 中 `Promise.all` 的第 4 个查询（全量组件 `findMany` 不含 `notIn` 过滤），确保解构变量与数组元素一一对应 in `app/q-server/src/modules/survey/survey-stats/survey-stats.service.ts`
- [x] T016 [US2] 运行 T014 测试确认通过，运行现有统计模块测试确保无回归 in `app/q-server/src/spec/survey-stats/survey-stats.service.spec.ts`

**Checkpoint**: Promise.all 查询结果全部被使用，无浪费的数据库往返

---

## Phase 5: User Story 3 - 生产环境强制安全密钥 (Priority: P1)

**Goal**: 生产环境下 JWT_SECRET 为默认值或空时必须拒绝启动，开发环境下使用默认值时发出警告。

**Independent Test**: `NODE_ENV=production JWT_SECRET="dev-secret-change-in-production"` 启动服务，验证立即退出并输出错误日志。

### Tests for User Story 3

> **NOTE: 先编写测试，确保测试在实现前 FAIL**

- [x] T017 [P] [US3] 编写 JWT Secret 启动校验测试：生产环境 + 默认密钥 → 抛出错误；生产环境 + 自定义密钥 → 正常；开发环境 + 未设置 → 警告日志 in `app/q-server/src/spec/user/auth/auth.service.spec.ts`

### Implementation for User Story 3

- [x] T018 [US3] 在 `AuthService` 构造函数中添加 JWT_SECRET 环境感知校验逻辑：`isProduction && isWeakSecret → throw Error` + `!isProduction && isWeakSecret → pino.warn` in `app/q-server/src/modules/user/auth/auth.service.ts`
- [x] T019 [US3] 在 `app/q-server/src/index.ts` 的 `start()` 函数中，`listen()` 之前添加 JWT_SECRET 启动前置校验：强制触发 AuthService 初始化（通过 `WeakMap` 工厂方法），确保启动阶段即暴露密钥问题 in `app/q-server/src/index.ts`
- [x] T020 [US3] 处理边缘情况：`JWT_SECRET` 为空字符串时视为未设置，与默认值 `"dev-secret-change-in-production"` 同等对待 in `app/q-server/src/modules/user/auth/auth.service.ts`
- [x] T021 [US3] 运行 T017 测试确认全部通过

**Checkpoint**: 生产环境使用弱密钥时服务拒绝启动，开发环境有明确警告

---

## Phase 6: User Story 4 - Token 刷新操作安全可靠 (Priority: P1)

**Goal**: 将 refreshToken 操作顺序从"先黑名单旧 Token → 再生成新 Token"改为"先生成新 Token → 再黑名单旧 Token"，消除崩溃导致用户永久锁定的风险。

**Independent Test**: 模拟 Redis 不可用场景调用 refresh 接口，验证系统不会将用户置于不可恢复状态。

### Tests for User Story 4

> **NOTE: 先编写测试，确保测试在实现前 FAIL**

- [x] T022 [P] [US4] 编写 refreshToken 顺序测试：验证新 Token 生成在黑名单写入之前，中间崩溃不会丢失用户状态 in `app/q-server/src/spec/user/auth/auth.service.spec.ts`
- [x] T023 [P] [US4] 编写 Redis 黑名单写入失败场景测试：验证新 Token 仍然生效、旧 Token 仍可用、返回明确错误日志 in `app/q-server/src/spec/user/auth/auth.service.spec.ts`
- [x] T024 [P] [US4] 编写并发 refresh 幂等性测试：多标签页同时刷新，至少一个成功、其余合理错误响应 in `app/q-server/src/spec/user/auth/auth.service.spec.ts`

### Implementation for User Story 4

- [x] T025 [US4] 调整 `refreshToken` 方法操作顺序：验证旧 Token → 生成新 Access + Refresh Token → 黑名单旧 Token（新 Token 生成后、写入黑名单前加 try/catch 保护）in `app/q-server/src/modules/user/auth/auth.service.ts`
- [x] T026 [US4] 添加 Redis 黑名单写入失败的错误处理：catch 异常后使用 pino 记录错误日志，不阻塞新 Token 返回，确保用户不受影响 in `app/q-server/src/modules/user/auth/auth.service.ts`
- [x] T027 [US4] 处理幂等性：当旧 Token JTI 已在黑名单中（TTL 未过期但重复请求）时返回明确 401 错误，而非静默通过 in `app/q-server/src/modules/user/auth/auth.service.ts`
- [x] T028 [US4] 运行 T022-T024 测试确认全部通过

**Checkpoint**: refreshToken 在任何中间失败场景下都不会导致用户被永久锁定

---

## Phase 7: Polish & Cross-Cutting Concerns（收尾与交叉验证）

**Purpose**: 全量回归测试、代码风格检查、快速验证指南执行

- [x] T029 运行全量后端测试套件确认 100% 通过：`cd app/q-server && pnpm vitest run`
- [x] T030 [P] 运行 ESLint 检查修改文件：`cd app/q-server && pnpm eslint src/modules/survey/survey-stats/survey-stats.service.ts src/modules/user/auth/auth.service.ts src/spec/survey-stats/ src/spec/user/auth/`
- [x] T031 [P] 运行 Prettier 格式检查：`cd app/q-server && pnpm prettier --check src/modules/survey/survey-stats/survey-stats.service.ts src/modules/user/auth/auth.service.ts src/spec/survey-stats/ src/spec/user/auth/`
- [x] T032 执行 [quickstart.md](./quickstart.md) 全部 5 个验证场景 (VS-1 到 VS-5)，确认所有预期结果符合
- [x] T033 性能验证：使用 30 题/10000 答卷的测试数据测量统计接口响应时间，确认 < 3 秒且 SQL 查询次数 ≤ 10

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: 无依赖 — 立即开始
- **Foundational (Phase 2)**: 依赖 Setup 完成 — **阻塞所有用户故事**
- **User Stories (Phase 3-6)**: 全部依赖 Foundational 阶段完成
  - US1 → US2 → US3 → US4 可按优先级顺序执行
  - US1+US2（同文件 `survey-stats.service.ts`）建议同一开发者顺序完成
  - US3+US4（同文件 `auth.service.ts`）建议同一开发者顺序完成
  - US1+US2 与 US3+US4 之间无依赖，可并行（不同文件、不同模块）
- **Polish (Phase 7)**: 依赖所有用户故事完成

### User Story Dependencies

- **US1 (统计 N+1)**: Foundational 之后即可开始 — 不依赖其他故事
- **US2 (Promise.all)**: Foundational 之后即可开始 — 与 US1 共享文件，建议 US1 之后顺序执行以避免合并冲突
- **US3 (JWT Secret)**: Foundational 之后即可开始 — 不依赖其他故事
- **US4 (refreshToken)**: Foundational 之后即可开始 — 与 US3 共享文件，建议 US3 之后顺序执行以避免合并冲突

### Within Each User Story

- 测试（T005-T006, T014, T017, T022-T024）必须先行编写并确认 FAIL
- 实现任务按依赖顺序执行（批量方法 → 主流程重构 → 边缘情况）
- 每个故事完成后 checkpoint 验证

### Parallel Opportunities

- **T001 ∥ T002**: 环境确认和测试基线获取可并行
- **T003 ∥ T004**: 两个测试文件骨架创建可并行
- **T005 ∥ T006**: US1 的两个测试可并行编写
- **T022 ∥ T023 ∥ T024**: US4 的三个测试可并行编写
- **T030 ∥ T031**: ESLint 和 Prettier 检查可并行
- **US1+US2 组 ∥ US3+US4 组**: 两组改动不同文件，可由不同开发者并行实施

---

## Parallel Example: User Story 1

```bash
# 并行编写 US1 的所有测试：
Task: "T005 编写批量聚合正确性测试 in survey-stats.service.spec.ts"
Task: "T006 编写边缘情况测试 in survey-stats.service.spec.ts"

# 测试先行完成后，顺序实现：
Task: "T007 单选/下拉题批量聚合方法"
Task: "T008 多选题批量聚合方法"
Task: "T009 评分/滑块题批量聚合方法"
Task: "T010 文本题抽样方法"
Task: "T011 答案计数批量查询"
Task: "T012 重构 getSurveyStats 主流程"
Task: "T013 验证测试通过"
```

## Parallel Example: US1+US2 组 与 US3+US4 组 并行

```bash
# 开发者 A: 统计模块修复 (US1 + US2)
# 文件: survey-stats.service.ts + survey-stats.service.spec.ts

# 开发者 B: 认证模块修复 (US3 + US4)
# 文件: auth.service.ts + auth.service.spec.ts

# 两组完全独立，无文件冲突，可同时进行
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. 完成 Phase 1: Setup
2. 完成 Phase 2: Foundational（关键 — 阻塞所有故事）
3. 完成 Phase 3: User Story 1（统计 N+1 修复）
4. **STOP 并验证**: 独立测试 US1 — 30 题统计查询次数 < 10
5. 可部署/演示 — US1 修复了最影响用户体验的性能问题

### Incremental Delivery

1. Setup + Foundational → 基础就绪
2. 添加 US1 → 独立测试 → 部署（统计性能提升 MVP!）
3. 添加 US2 → 独立测试 → 部署（消除数据库浪费 IO）
4. 添加 US3 → 独立测试 → 部署（生产安全加固）
5. 添加 US4 → 独立测试 → 部署（Token 刷新安全）
6. 每个故事独立增值，不破坏已有功能

### 建议执行顺序

由于 4 个 P0 问题都在 2 个文件中（survey-stats.service.ts + auth.service.ts），且改动范围明确，建议：

1. 先完成 **US1 + US2**（统计模块，同一文件连续修改）
2. 再完成 **US3 + US4**（认证模块，同一文件连续修改）
3. 最后 **Phase 7** 全量回归

---

## Notes

- [P] 标记 = 不同文件、不同测试用例，无依赖，可并行
- [Story] 标签将任务映射到具体用户故事，便于追溯
- 每个用户故事应可独立完成和测试
- 测试先行：确保测试在实现前 FAIL，实现后 PASS
- 每次提交包含逻辑相关的改动组（建议每个 Phase 完成后提交）
- 在任何 checkpoint 停下来独立验证故事功能
- 避免：模糊任务、同文件冲突、破坏故事独立性的跨故事依赖
- 本功能不涉及数据库 schema 变更、不引入新依赖、不需修改前端代码
