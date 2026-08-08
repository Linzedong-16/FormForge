# Feature Specification: 后端 P0 严重问题修复

**Feature Branch**: `001-backend-p0-fixes`

**Created**: 2026-08-08

**Status**: Draft

**Input**: User description: "参考 todo.md 文档，解决所有 P0 级的问题"

## User Scenarios & Testing _(mandatory)_

### User Story 1 - 问卷统计页面快速加载 (Priority: P1)

作为问卷管理员，当我打开单问卷统计分析页面时，即使问卷有 30+ 道题目且答卷量上万，统计结果也应在可接受的时间内呈现，不会因为每道题目都触发独立数据库查询而导致页面长时间加载。

**Why this priority**: 统计模块 N+1 查询直接影响每个管理员的日常使用体验，是用户可感知的性能退化。修复后问卷统计加载将从"每道题 2 次查询"降为"每种题型 1 次查询"，30 道题的问卷从约 60 次 SQL 降到约 5-6 次。

**Independent Test**: 创建一个含 30 道不同题型的问卷，提交 1000 份模拟答卷，访问统计页面，验证数据库查询次数显著减少且响应时间缩短。

**Acceptance Scenarios**:

1. **Given** 一个已发布的问卷包含 20 道题目和多份答卷, **When** 管理员请求该问卷的统计数据, **Then** 后端对数据库的查询次数与题目数量无关（不再逐题查询），且总响应时间在 3 秒以内。
2. **Given** 问卷包含单选、多选、评分、滑块、文本等多种题型, **When** 统计接口返回逐题分布数据, **Then** 每种题型的聚合结果与优化前完全一致，数据正确性不受影响。
3. **Given** 问卷题目数量为 0（无题目组件）, **When** 管理员请求统计, **Then** 系统正常返回空的 questions 数组，不会报错。

---

### User Story 2 - 问卷统计结果完整正确 (Priority: P1)

作为问卷管理员，当我查看问卷统计时，所有已配置的题目组件都应该被正确统计——系统不会静默丢弃某个查询结果，浪费数据库资源。

**Why this priority**: 当前代码在 `Promise.all` 中发起了 4 个并行查询但只使用 3 个结果，第 4 个全量组件查询被丢弃。这是纯粹的代码缺陷（Bug），浪费数据库 IO 和网络带宽，且表明原设计意图未完整实现。

**Independent Test**: 审查 `getSurveyStats` 方法中的 `Promise.all` 调用，确认所有发起的查询结果都被实际使用，或移除了不再需要的查询。

**Acceptance Scenarios**:

1. **Given** `getSurveyStats` 方法中发起了 N 个并行数据库查询, **When** 方法执行, **Then** 所有 N 个查询的返回值都被解构和实际使用，不存在"发起但丢弃"的查询。
2. **Given** 修复后的代码, **When** 运行现有的统计模块单元测试, **Then** 所有测试仍然通过，统计数据格式不变。

---

### User Story 3 - 生产环境强制安全密钥 (Priority: P1)

作为系统运维人员，当我在生产环境部署后端服务时，如果忘记设置 `JWT_SECRET` 环境变量，系统必须在启动阶段就明确拒绝启动并给出清晰的错误提示，绝不允许使用硬编码的弱密钥运行。

**Why this priority**: JWT Secret 是认证体系的核心机密。当前代码 `process.env.JWT_SECRET ?? "dev-secret-change-in-production"` 在生产环境未配置时静默使用弱密钥，攻击者可以用该公开默认值伪造任意用户的 JWT Token，危害等级严重。

**Independent Test**: 在 `NODE_ENV=production` 且未设置 `JWT_SECRET` 环境变量的情况下启动服务，验证服务拒绝启动并输出明确的错误日志。

**Acceptance Scenarios**:

1. **Given** `NODE_ENV=production` 且 `JWT_SECRET` 环境变量未设置（或等于默认值 `"dev-secret-change-in-production"`）, **When** 服务启动, **Then** 进程立即退出并输出错误日志"生产环境必须设置 JWT_SECRET 环境变量，不得使用默认值"。
2. **Given** `NODE_ENV=production` 且 `JWT_SECRET` 已设置为一个非默认的安全随机字符串, **When** 服务启动, **Then** 服务正常启动，使用该密钥签发和验证 JWT。
3. **Given** `NODE_ENV=development` 且 `JWT_SECRET` 未设置, **When** 服务启动, **Then** 服务正常启动，使用默认值并输出警告日志提示开发环境使用默认密钥。

---

### User Story 4 - Token 刷新操作安全可靠 (Priority: P1)

作为已登录用户，当我使用 Refresh Token 刷新 Access Token 时，即使后端服务在刷新过程中意外崩溃（如 OOM、进程被杀），我也不会被永久锁定——要么旧 Token 仍可用（新 Token 未生效前保留），要么新 Token 已生效且旧 Token 被标记失效，不会出现"旧已失效、新未生成"的中间状态。

**Why this priority**: 当前 `refreshToken` 方法先将旧 Refresh Token 加入黑名单，再生成新 Token。若进程在两步之间崩溃，用户持有的旧 Token 被拉黑、新 Token 未拿到，用户被迫重新登录——对于没有密码的邮箱验证码登录用户，需要重新获取验证码，体验极差。

**Independent Test**: 模拟 Redis 在黑名单写入后、新 Token 生成前不可用，验证系统状态可控（不会出现用户永久锁定的不可恢复状态）。

**Acceptance Scenarios**:

1. **Given** 用户持有有效的 Refresh Token, **When** 调用 `/api/auth/refresh` 接口, **Then** 新 Access Token + 新 Refresh Token 同时返回，且在旧 Token 黑名单写入之前新 Token 已确认生成。
2. **Given** 刷新过程中 Redis 连接丢失, **When** 黑名单写入失败, **Then** 用户仍可使用旧 Refresh Token 再次尝试刷新（系统返回明确错误提示而非静默失效）。
3. **Given** 刷新过程中服务进程崩溃, **When** 用户使用旧 Refresh Token 重新请求, **Then** 旧 Token 要么仍然有效（黑名单未写入），要么新 Token 已在数据库/Redis 中可追溯——不存在"旧 Token 已拉黑但新 Token 未生成"的状态。

---

### Edge Cases

- 统计模块：问卷全部题目为 `text_note`（非题目组件）时，统计结果不应包含任何题目，查询应短路返回空。
- 统计模块：答卷量极大（10 万+）时，批量聚合查询的性能表现——需要验证 PostgreSQL 的 `GROUP BY component_id` 在大表上的执行计划使用了合适的索引。
- JWT Secret 校验：当 `JWT_SECRET` 环境变量存在但值为空字符串时，应等同于未设置处理。
- refreshToken：当 Redis 中旧 Token 的黑名单 key 因 TTL 已自然过期时，重复调用 refresh 应该仍然安全（幂等性）。
- refreshToken：并发多次 refresh 请求（如多标签页同时刷新）时，应保证至少有一个成功，其余得到合理的错误响应而非全部失败。

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: 问卷统计接口 `getSurveyStats()` MUST 使用按 `component_id` 分组的批量 SQL 查询替代逐题独立查询，数据库查询次数与题目数量解耦。
- **FR-002**: 问卷统计批量聚合 MUST 按题型分组执行——同一题型的所有题目在一次 SQL 中完成聚合，不同题型分别使用对应的聚合策略（JSON 数组展开、数值 AVG/MIN/MAX、单值 GROUP BY、文本抽样等）。
- **FR-003**: `getSurveyStats` 方法中的 `Promise.all` MUST 只发起实际需要使用的查询；所有发起的查询结果 MUST 被解构并使用，不存在"发起但丢弃"的查询。
- **FR-004**: 生产环境（`NODE_ENV=production`）启动时，若 `JWT_SECRET` 未设置或等于硬编码默认值 `"dev-secret-change-in-production"`，系统 MUST 拒绝启动（`throw Error` 或 `process.exit(1)`），并输出明确的错误日志说明原因。
- **FR-005**: 开发环境（`NODE_ENV ≠ production`）下 `JWT_SECRET` 未设置时，系统 MAY 使用默认值但 MUST 输出警告日志。
- **FR-006**: `refreshToken` 方法 MUST 采用"先生成新 Token，再失效旧 Token"的顺序，确保中间崩溃状态下用户不会陷入"旧 Token 已拉黑、新 Token 未生成"的不可恢复状态。
- **FR-007**: `refreshToken` 在黑名单写入失败时 MUST 保留新生成的 Token 已生效，并记录错误日志，不阻塞正常返回。
- **FR-008**: 所有修复 MUST 保持现有 API 接口的请求/响应格式不变（`{ code, msg, data }` 信封），确保前端无需改动。
- **FR-009**: 所有修复 MUST 附带对应的单元测试（统计模块的 `survey-stats.service.spec.ts`、认证模块的 `auth.service.spec.ts`），覆盖正常路径和边缘情况。
- **FR-010**: 修复后的代码 MUST 通过 ESLint、Prettier、cspell 检查和项目现有的 Vitest 测试套件。

### Key Entities

- **SurveyStats（问卷统计结果）**: 包含平台概览和单问卷详细分析。单问卷统计含答卷总量、完成率、每日趋势和逐题分布。逐题分布按题型不同有不同的聚合维度（选项分布/数值统计/文本抽样）。
- **JWT Token（认证令牌）**: Access Token（1h 有效期）+ Refresh Token（7d 有效期），通过 JTI 唯一标识实现黑名单吊销机制。
- **RefreshToken Flow（刷新流程）**: 用户提交 Refresh Token → 验证有效性 → 生成新 Token 对 → 黑名单旧 Token 的受控操作序列。

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: 统计模块的数据库查询次数从"O(n) 按题目数线性增长"降为"O(1) 按题型数常量级"，即 30 道题的问卷统计从约 60 次 SQL 降为不超过 10 次 SQL。
- **SC-002**: 30 道题目、10000 份答卷的问卷统计接口响应时间从当前估计的 5-10 秒降为 3 秒以内。
- **SC-003**: 生产环境使用默认 JWT Secret 启动时，服务在 1 秒内拒绝启动并退出，不会进入监听状态。
- **SC-004**: `refreshToken` 接口在任何中间步骤失败的情况下，用户都可以通过重试或重新登录恢复访问，不会出现不可恢复的账户锁定状态。
- **SC-005**: 所有现有测试套件（问卷 CRUD、统计模块、认证模块的 Vitest 测试）在修复后保持 100% 通过率。
- **SC-006**: 修复引入的新增单元测试覆盖 P0 修复涉及的 4 个关键路径（统计批量查询、Promise.all 修复、JWT Secret 校验、refreshToken 顺序）。

## Assumptions

- 统计模块修复仅涉及 `survey-stats.service.ts` 中的 `getSurveyStats` 方法及其私有聚合方法，不改变 API 响应格式。
- 批量聚合方案基于 PostgreSQL 的 `GROUP BY component_id` + `jsonb_array_elements_text` 展开函数，这些函数在当前 PostgreSQL 16 + pgvector 镜像中已可用。
- JWT Secret 的生产环境校验在 `AuthService` 构造函数中执行，与当前 `process.env.JWT_SECRET` 读取逻辑处于同一生命周期。
- refreshToken 的"先新后旧"方案不需要修改数据库 schema 或 Redis 数据结构，仅调整操作顺序。
- 现有前端代码（管理端统计页面、登录页、Token 刷新拦截器）无需任何修改，后端接口保持向后兼容。
