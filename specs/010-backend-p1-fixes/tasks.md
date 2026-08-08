# Tasks: 后端 P1 级可靠性修复

**Input**: Design documents from `/specs/010-backend-p1-fixes/`

**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Tests**: 遵循项目宪法 Principle V (Test-Adequate Delivery)——每个用户故事包含单元测试任务，测试先行（先写测试确保 FAIL，再实现使其 PASS）。

**Organization**: 任务按用户故事分组，各故事独立可测、可并行实施。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可并行执行（不同文件，无依赖）
- **[Story]**: 所属用户故事（US1-US5）
- 所有描述包含精确文件路径

---

## Phase 1: Setup（环境确认）

**Purpose**: 确认测试基础设施就绪，无需新增依赖

- [x] T001 确认测试环境可运行：`cd app/q-server && npx vitest run --reporter=verbose` 通过（忽略预存失败）
- [x] T002 [P] 读取并确认 plan.md 中涉及的 5 个源文件当前状态无未提交变更

**Checkpoint**: 环境就绪，可以开始用户故事实施

---

## Phase 2: User Story 1 — CSV 导出流式处理 (Priority: P1) 🎯 MVP

**Goal**: 将 `exportResponsesCSV()` 从一次性全量加载改为 `stream.Readable` + 游标分页流式输出，内存增量 ≤ 50MB

**Independent Test**: 运行 `npx vitest run src/spec/survey-stats/survey-stats.service.spec.ts` —— CSV 导出测试全部通过

### Tests for User Story 1 ⚠️

> **先写测试，确保 FAIL 后再实现**

- [x] T003 [P] [US1] 编写"流式导出正常返回完整 CSV"测试：mock 1000+ 条答卷+答案，验证流收集后 CSV 内容完整、格式正确，在 `app/q-server/src/spec/survey-stats/survey-stats.service.spec.ts`
- [x] T004 [P] [US1] 编写"流式导出空问卷返回提示"测试：mock 0 条答卷，验证返回"暂无答卷数据"，在 `app/q-server/src/spec/survey-stats/survey-stats.service.spec.ts`
- [x] T005 [P] [US1] 编写"导出过程中客户端断开时流正确销毁"测试：mock 中途 destroy，验证数据库游标停止读取且无未处理异常，在 `app/q-server/src/spec/survey-stats/survey-stats.service.spec.ts`

### Implementation for User Story 1

- [x] T006 [US1] 重构 `exportResponsesCSV()` 方法：创建 `stream.Readable` 实例，使用 `reply.raw` 输出流式响应，设置 `Content-Type: text/csv; charset=utf-8` 和 `Content-Disposition` 响应头，在 `app/q-server/src/modules/survey/survey-stats/survey-stats.service.ts`
- [x] T007 [US1] 实现游标分批读取逻辑：首次查询 `WHERE survey_id = ? ORDER BY created_at ASC LIMIT 1000`，后续使用 `WHERE survey_id = ? AND created_at > ? ORDER BY created_at ASC LIMIT 1000` 游标推进，在 `app/q-server/src/modules/survey/survey-stats/survey-stats.service.ts`
- [x] T008 [US1] 实现逐批构建 CSV 行并写入流：每批答案按 `response_id` 批量加载后映射到组件列，一行一行 push 到流，在 `app/q-server/src/modules/survey/survey-stats/survey-stats.service.ts`
- [x] T009 [US1] 添加流错误处理：监听 `req.raw` 的 `close` 事件以检测客户端断开；流 `destroy()` 时安全终止；数据库查询错误通过 `stream.destroy(err)` 传播，在 `app/q-server/src/modules/survey/survey-stats/survey-stats.service.ts`
- [x] T010 [US1] 更新 CSV 导出路由：若原有路由直接调用 `service.exportResponsesCSV()` 并 `reply.send(result)`，改为仅调用 service 方法（内部通过 `reply.raw` 流式输出），确保不重复调用 `reply.send`，在 `app/q-server/src/modules/survey/survey-stats/survey-stats.routes.ts`

**Checkpoint**: CSV 导出流式化完成——10 万答卷导出内存增量 ≤ 50MB，空问卷/客户端断开正确处理

---

## Phase 3: User Story 2 — RabbitMQ 自动重连 (Priority: P1)

**Goal**: 监听 amqplib 连接 `close`/`error` 事件，实现指数退避自动重连并重建 Channel

**Independent Test**: 手动重启 RabbitMQ 容器，观察日志中重连序列和 Channel 恢复消息

### Implementation for User Story 2

- [x] T011 [US2] 添加 `connection.on("close")` 事件监听器：连接意外关闭（非应用主动关闭）时触发重连，记录 WARN 日志，在 `app/q-server/src/plugins/rabbitmq.ts`
- [x] T012 [US2] 添加 `connection.on("error")` 事件监听器：连接错误时记录 ERROR 日志（不重复触发重连，由 close 事件统一处理），在 `app/q-server/src/plugins/rabbitmq.ts`
- [x] T013 [US2] 实现指数退避重连函数 `reconnectWithBackoff()`：初始延迟 1s，最大 30s，乘数 2，每次延迟后调用 `connect(url)` + `createChannel()`，成功后更新 `fastify.amqp` 引用并记录 INFO 日志，失败则递增延迟继续重试，在 `app/q-server/src/plugins/rabbitmq.ts`
- [x] T014 [US2] 重连成功后重建 Channel：新 Channel 创建后赋值给 `fastify.amqp.channel`，确保下游 `sendToQueue` 等调用使用有效 Channel 而非失效旧 Channel，在 `app/q-server/src/plugins/rabbitmq.ts`
- [x] T015 [US2] 处理 `onClose` 钩子中的重连终止：Fastify 关闭时设置标志位停止重连循环，避免优雅关闭被重连定时器阻塞，在 `app/q-server/src/plugins/rabbitmq.ts`

### Tests for User Story 2

- [x] T016 [P] [US2] 编写"连接 close 事件触发重连"测试：mock amqplib 的 `connect` 首次成功、返回带 EventEmitter 的 connection；emit `close` 后验证 `connect` 被再次调用，在 `app/q-server/src/spec/plugins/rabbitmq.spec.ts`（新文件）
- [x] T017 [P] [US2] 编写"重连成功后 Channel 引用更新"测试：mock `connect` 返回新 connection 和新 channel，验证重连后 `fastify.amqp.channel` 指向新 Channel，在 `app/q-server/src/spec/plugins/rabbitmq.spec.ts`

**Checkpoint**: RabbitMQ 断连后自动重连——30s 内恢复消息投递能力，指数退避避免洪泛

---

## Phase 4: User Story 3 — Redis 离线队列策略修正 (Priority: P1)

**Goal**: 将 `enableOfflineQueue: true` 改为 `false`，使配置与注释一致，Redis 不可用时命令立即失败

**Independent Test**: 停止 Redis 后发起 API 请求，验证请求不阻塞，内存无命令积压

### Implementation for User Story 3

- [x] T018 [US3] 修改 `redis.ts` 第 59 行：`enableOfflineQueue: true` → `enableOfflineQueue: false`，注释保持不变（注释已正确描述设计意图），在 `app/q-server/src/plugins/redis.ts`
- [x] T019 [US3] 验证现有降级逻辑覆盖：审计所有 Redis 调用点（`cache.ts` 的 `getOrSet` / `del`、`auth.service.ts` 的验证码存取、`rate-limit.ts` 的计数器），确认均有 try/catch 或 `.catch()` 降级处理，在 `app/q-server/src/` 各文件（只读审计，无需修改）

### Tests for User Story 3

- [x] T020 [US3] 编写"Redis 不可用时命令立即失败不排队"测试：mock ioredis 在 `enableOfflineQueue: false` 时，Redis 不可用状态下调用 `get`/`set` 立即 reject（而非入队），在 `app/q-server/src/spec/plugins/redis.spec.ts`（新文件）

**Checkpoint**: Redis 离线队列关闭——命令立即失败，业务降级路径正常工作

---

## Phase 5: User Story 4 — 答卷删除后统计缓存失效 (Priority: P1)

**Goal**: `deleteResponse()` 末尾补全统计缓存清除逻辑，与 `submitResponse()` 对称

**Independent Test**: 提交答卷 → 查统计 → 删答卷 → 再查统计，验证数据已更新

### Tests for User Story 4 ⚠️

> **先写测试，确保 FAIL 后再实现**

- [x] T021 [US4] 编写"删除答卷后清除 statsOverview 缓存"测试：mock `cache.del`，调用 `deleteResponse` 后验证 `cache.del` 被调用且参数含 `CacheKeys.statsOverview`，在 `app/q-server/src/spec/survey/survey-crud/survey-crud.service.spec.ts`
- [x] T022 [US4] 编写"删除答卷后清除 statsBySurvey 缓存"测试：同上，验证 `cache.del` 被调用且参数含正确的 `CacheKeys.statsBySurvey(surveyId)`，在 `app/q-server/src/spec/survey/survey-crud/survey-crud.service.spec.ts`
- [x] T023 [US4] 编写"缓存清除失败不阻塞删除事务"测试：mock `cache.del` reject，验证 `deleteResponse` 仍正常完成（不抛异常），在 `app/q-server/src/spec/survey/survey-crud/survey-crud.service.spec.ts`

### Implementation for User Story 4

- [x] T024 [US4] 在 `deleteResponse()` 中获取 `surveyId`：从已查询的 `response` 对象中提取 `survey_id` 字段（当前查询 include 了 survey 但仅 select `user_id`，需追加 `survey_id` 或改用已存在的 response 关联），在 `app/q-server/src/modules/survey/survey-crud/survey-crud.service.ts`
- [x] T025 [US4] 在 `deleteResponse()` 末尾（`createAuditLog` 之前）追加缓存清除：`this.cache.del(CacheKeys.statsOverview).catch(() => {})` + `this.cache.del(CacheKeys.statsBySurvey(surveyIdStr)).catch(() => {})`，与 `submitResponse` 模式一致，在 `app/q-server/src/modules/survey/survey-crud/survey-crud.service.ts`

**Checkpoint**: 删除答卷后统计缓存立即失效——数据一致性窗口从 TTL 缩短至 0

---

## Phase 6: User Story 5 — sendCode AMQP 不可用告警 (Priority: P1)

**Goal**: RabbitMQ 不可用时，`sendCode()` 记录 WARN 日志并返回明确错误码，不再静默跳过

**Independent Test**: 停止 RabbitMQ 后调用 sendCode API，验证返回 503 + `MAIL_SERVICE_UNAVAILABLE` 错误码

### Tests for User Story 5 ⚠️

> **先写测试，确保 FAIL 后再实现**

- [x] T026 [P] [US5] 编写"AMQP 不可用返回 MAIL_SERVICE_UNAVAILABLE"测试：mock `fastify.amqp` 为 falsy，调用 `sendCode` 验证抛出含 `MAIL_SERVICE_UNAVAILABLE` 的 AuthError，在 `app/q-server/src/spec/user/auth/auth.service.spec.ts`
- [x] T027 [P] [US5] 编写"AMQP 不可用记录 WARN 日志"测试：mock `fastify.log.warn`，验证日志包含脱敏邮箱和"RabbitMQ 不可用"关键词，在 `app/q-server/src/spec/user/auth/auth.service.spec.ts`
- [x] T028 [P] [US5] 编写"AMQP 可用时行为不变"测试：mock `fastify.amqp` 为有效对象，验证 `sendToQueue` 被正常调用且无 WARN 日志，在 `app/q-server/src/spec/user/auth/auth.service.spec.ts`

### Implementation for User Story 5

- [x] T029 [US5] 在 `StatusCode` / `BizCode` 枚举中新增 `MAIL_SERVICE_UNAVAILABLE` 错误码（如 50301），在 `app/q-server/src/utils/` 相关状态码文件
- [x] T030 [US5] 在 `sendCode()` 方法的 `if (this.fastify.amqp)` 为 falsy 分支中添加 `fastify.log.warn({ target: maskEmail(email), type }, "邮件未发送——RabbitMQ 不可用，验证码已生成但无法投递")` 并 `throw new AuthError("邮件服务暂时不可用，请稍后重试", 503, BizCode.MAIL_SERVICE_UNAVAILABLE)`，在 `app/q-server/src/modules/user/auth/auth.service.ts`
- [x] T031 [US5] 确保验证码仍正常存入 Redis（当前逻辑在 amqp 判断之前已完成 `redis.set`），仅阻断"返回成功"的分支——即最终 `return { code }` 仅在 `amqp` 可用且投递成功后执行，在 `app/q-server/src/modules/user/auth/auth.service.ts`

**Checkpoint**: RabbitMQ 不可用时用户和运维均能感知——用户看到明确错误提示，运维可在日志中定位

---

## Phase 7: Polish & 回归验证

**Purpose**: 跨故事验证、代码质量确认、回归测试

- [x] T032 [P] 运行全量测试套件 `cd app/q-server && npx vitest run` 确认无新增回归失败（88 个预存失败，无新增）
- [x] T033 [P] 运行 ESLint + Prettier 检查涉及的文件无格式/规则警告（全部通过）
- [x] T034 按 [quickstart.md](quickstart.md) 执行手动验证场景（至少覆盖 US1 和 US5 的端到端流程）

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: 无依赖，立即开始
- **User Stories (Phase 2-6)**: 全部依赖 Setup 完成，故事之间**无相互依赖**——可并行实施
  - US1 (CSV 流式导出) → 仅依赖 `survey-stats.service.ts`
  - US2 (RabbitMQ 重连) → 仅依赖 `rabbitmq.ts`
  - US3 (Redis 离线队列) → 仅依赖 `redis.ts`
  - US4 (统计缓存失效) → 仅依赖 `survey-crud.service.ts`
  - US5 (sendCode 告警) → 仅依赖 `auth.service.ts` + BizCode 枚举
- **Polish (Phase 7)**: 依赖所有目标用户故事完成

### User Story Dependencies

```
Phase 1: Setup
    │
    ├── Phase 2: US1 (CSV 流式导出)       ─┐
    ├── Phase 3: US2 (RabbitMQ 重连)       ├─ 互不依赖
    ├── Phase 4: US3 (Redis 离线队列)      │  不同文件
    ├── Phase 5: US4 (统计缓存失效)        │  可并行
    └── Phase 6: US5 (sendCode 告警)      ─┘
                    │
                    ▼
            Phase 7: Polish
```

### Within Each User Story

- **Tests BEFORE implementation**（TDD）：先写测试 → 确认 FAIL → 实现 → 确认 PASS
- US1: T003-T005 (测试) → T006-T010 (实现)
- US2: T011-T015 (实现) → T016-T017 (测试，因重连逻辑复杂，实现后补测试)
- US3: T018-T019 (实现+审计) → T020 (测试)
- US4: T021-T023 (测试) → T024-T025 (实现)
- US5: T026-T028 (测试) → T029-T031 (实现)

### Parallel Opportunities

- **跨故事并行**：Phase 2-6 全部 5 个用户故事可同时进行（不同文件、无冲突）
- **故事内测试并行**：每个故事的测试任务标记 [P] 可并行执行
  - US1: T003, T004, T005 可并行
  - US2: T016, T017 可并行
  - US4: T021, T022, T023 可并行
  - US5: T026, T027, T028 可并行
- **Polish 并行**：T032, T033 可并行

---

## Parallel Example: US1 内部执行

```bash
# Step 1: 并行编写 3 个测试（T003, T004, T005）
Task: "编写流式导出正常返回完整 CSV 测试"
Task: "编写流式导出空问卷返回提示测试"
Task: "编写导出过程中客户端断开时流正确销毁测试"

# Step 2: 运行测试确认全部 FAIL（因为实现尚未就绪）

# Step 3: 顺序实现 T006 → T007 → T008 → T009 → T010
# （这些任务修改同一文件，必须顺序执行）

# Step 4: 运行测试确认全部 PASS
```

## Parallel Example: 跨故事并行

```bash
# Phase 2-6 全部故事可同时开工（不同开发者或顺序执行均可）：
Developer A: Phase 2 (US1 - survey-stats.service.ts)
Developer B: Phase 3 (US2 - rabbitmq.ts)
Developer C: Phase 4 (US3 - redis.ts)
Developer D: Phase 5 (US4 - survey-crud.service.ts)
Developer E: Phase 6 (US5 - auth.service.ts)
# 各故事触及不同文件，零合并冲突
```

---

## Implementation Strategy

### MVP First (仅 US1)

1. 完成 Phase 1: Setup
2. 完成 Phase 2: US1 CSV 流式导出
3. **停止并验证**：运行 CSV 导出测试 + 手动大数据量导出
4. 部署/演示（CSV 导出 OOM 风险已消除）

### Incremental Delivery

1. Setup → 环境就绪
2. US1 (CSV) → 测试 → 部署 (MVP!)
3. US2 (RabbitMQ) → 测试 → 部署
4. US3 (Redis) → 测试 → 部署
5. US4 (缓存) → 测试 → 部署
6. US5 (sendCode) → 测试 → 部署
7. Polish → 全量回归 → 最终发布

### 推荐执行顺序

由于所有故事互不依赖，建议按影响面排序：**US1 → US4 → US5 → US2 → US3**（数据安全优先，配置修正殿后）

---

## Notes

- [P] 任务 = 不同文件，无依赖，可并行
- [Story] 标签映射任务到具体用户故事，便于追溯
- 每个用户故事独立可测、独立可部署
- 测试先行（先 FAIL 后 PASS），符合项目 TDD 实践
- 每个任务或逻辑组完成后提交
- 在任何检查点可停下来独立验证故事
- US2（RabbitMQ 重连）的测试依赖 EventEmitter mock，允许实现先于测试（测试顺序标注为非 TDD）
- US3（Redis 单行配置）的测试为防御性验证，改动本身仅一行
