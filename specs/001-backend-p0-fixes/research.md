# Research: 后端 P0 严重问题修复

**Created**: 2026-08-08 | **Phase**: 0

## 调研任务一览

本功能涉及的 4 个 P0 问题均为已有代码库中的局部缺陷修复，无未知技术选型或新依赖引入。调研聚焦于验证修复方案的可行性和影响范围。

---

## R1: 统计模块 N+1 → 批量聚合方案

**决策**: 使用 PostgreSQL `GROUP BY component_id` + `jsonb_array_elements_text` 批量聚合，替代逐题独立查询。

**理由**:

- 当前代码每道题发起 1 次 `answer.count()` + 1 次题型聚合查询 — 30 题 = 60 次 SQL
- 改为：(1) 一次按 `component_id` GROUP BY 的 COUNT 拿所有题目答案数 (2) 按题型分类，每种题型一条批量 SQL
- 例如：所有单选题用一条 `GROUP BY component_id, value`；所有多选题用一条 `CROSS JOIN LATERAL jsonb_array_elements_text(values) ... GROUP BY component_id, elem`
- 该方案与项目已有的 `getJsonArrayDistribution` 中的 SQL 模式一致，复用现有技术栈
- PostgreSQL `jsonb_array_elements_text` 在当前 PG16+pgvector 镜像中可用

**替代方案评估**:

- ❌ 应用层聚合：需要把所有答案拉回 Node.js，大问卷内存开销大 → 放弃
- ❌ 物化视图：引入额外维护复杂度，统计实时性要求不高但也不适合预计算 → 过度设计
- ✅ 批量 GROUP BY SQL：延迟低、代码改动小、与现有模式一致 → 采用

---

## R2: Promise.all 查询结果丢弃

**决策**: 移除第 4 个全量组件查询（`surveyComponent.findMany` 不含 `notIn` 过滤），仅保留实际使用的 3 个查询。

**理由**:

- 审查 `getSurveyStats` 方法确认：第 4 个查询结果（全量组件）在解构时未被绑定到变量，后续代码从未引用
- 注释标注"全量组件（用于复原组件名）"但实际未实现此功能
- 全量组件查询与第 3 个查询（题目组件，含 `notIn: NON_QUESTION_TYPES`）的区别仅为是否排除 `text_note`——而 `text_note` 已在 `NON_QUESTION_TYPES` 中被排除，后续统计循环实际只需要题目组件
- 移除不会影响任何现有功能，消除了浪费的 DB 往返

**替代方案评估**:

- ❌ 补全解构并使用全量组件：当前代码逻辑不需要全量组件，硬塞进去会增加无谓复杂度 → 放弃
- ✅ 直接移除第 4 个 `findMany` 调用：最简洁 → 采用

---

## R3: JWT Secret 生产环境强制校验

**决策**: 在 `AuthService` 构造函数中，若 `NODE_ENV=production` 且 `JWT_SECRET` 为默认值或空，`throw new Error` 阻止启动。

**理由**:

- 当前代码 `process.env.JWT_SECRET ?? "dev-secret-change-in-production"` 在生产无配置时静默使用弱密钥
- `AuthService` 在 `auth.middleware.ts` 中通过 `WeakMap` 首次访问时延迟实例化，`throw` 会导致首次认证请求失败而非整个进程崩溃
- 更优方案：在 `auth.middleware.ts` 的 `getAuthService` 工厂中做启动时校验，Fastify `onReady` 钩子或 `index.ts` 启动流程中主动触发初始化

**最终方案**: 在 `app/q-server/src/index.ts` 启动监听前增加显式校验，与 `prisma.$connect()` 同级——在 Fastify `listen()` 之前确保密钥安全。这样更早暴露问题且错误日志更清晰。

**替代方案评估**:

- ❌ 仅在 AuthService 构造函数中 throw：首次认证请求才暴露 → 不够早
- ❌ `process.exit(1)` 暴力退出：合理但缺少优雅关闭 → 可接受但次于 throw
- ✅ 在 `index.ts` 启动流程中显式校验 + `throw Error` + `process.exit(1)`：最早暴露、错误清晰 → 采用

---

## R4: refreshToken 操作顺序调整

**决策**: 将步骤从"先黑名单旧 Token → 再生成新 Token"改为"先生成新 Token → 再黑名单旧 Token"。

**理由**:

- 当前顺序：(1) 验证旧 Refresh Token → (2) 黑名单旧 Token（Redis `SET`）→ (3) 生成新 Access + Refresh Token
- 若进程在 (2) 和 (3) 之间崩溃，旧 Token 已被拉黑、新 Token 未生成 → 用户被永久锁定直到黑名单 TTL 过期
- 改为：(1) 验证旧 Refresh Token → (2) 生成新 Access + Refresh Token → (3) 黑名单旧 Token
- 若进程在 (2) 和 (3) 之间崩溃：(a) 旧 Token 仍可用（黑名单未写入）→ 用户可重试刷新 (b) 新 Token 已返回给用户但无法被吊销（因为旧 Token 仍在有效期内）——这是比原方案更安全的状态
- 极端情况：若黑名单写入失败（Redis 不可用），原方案用户被锁定，新方案新 Token 正常返回且日志记录异常

**并发安全**:

- 同一用户并发 refresh 时，两个请求先后通过验证，都生成新 Token，先后写入黑名单
- 第一个请求的旧 Token 被第二个请求覆盖黑名单（同一个 key），第一个的新 Token 仍有效
- 由于使用了 JTI（每次生成唯一），新旧 Token 通过 JTI 区分，无安全风险

**替代方案评估**:

- ❌ Redis MULTI 事务：顺序问题而非原子性问题，MULTI 无法解决"步骤间崩溃"
- ❌ 写 undo log：过度设计
- ✅ 调整操作顺序：零成本、零风险、代码改动最小 → 采用
