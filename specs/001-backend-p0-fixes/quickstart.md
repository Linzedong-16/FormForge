# Quickstart Validation Guide: 后端 P0 严重问题修复

**Created**: 2026-08-08 | **Phase**: 1

## 前置条件

- Docker Compose 环境已启动（PostgreSQL + Redis 可用）
- 已执行 `pnpm install`
- 已有测试问卷数据（可通过管理端创建或使用种子数据）

---

## 验证场景

### VS-1: 统计模块批量聚合验证

**目的**: 验证 N+1 查询已消除，统计结果正确

```bash
# 1. 启动开发服务器
cd app/q-server && pnpm dev

# 2. 运行统计模块单元测试
cd app/q-server && pnpm vitest run src/spec/survey-stats/

# 3. 手动验证：创建含 20+ 道混合题型的问卷，提交若干答卷
#    访问 GET /api/admin/stats/surveys/:id
#    预期：响应时间明显快于修复前，且结果数据与修复前一致
```

**预期结果**:

- 单元测试全部通过
- 统计接口响应 JSON 格式不变
- 各题型分布数据（选项计数、百分比、评分均值等）正确

---

### VS-2: Promise.all 无效查询移除验证

**目的**: 验证不再有查询结果被静默丢弃

```bash
# 审查代码或查看日志确认 getSurveyStats 方法中：
# Promise.all 的数组元素数量 = 解构变量数量
cd app/q-server && grep -n "Promise.all" src/modules/survey/survey-stats/survey-stats.service.ts

# 运行现有测试确保回归通过
cd app/q-server && pnpm vitest run src/spec/survey/
```

**预期结果**:

- `Promise.all` 内部数组长度 = 左侧解构变量数量
- 所有现有测试保持通过

---

### VS-3: JWT Secret 生产环境强制校验

**目的**: 验证生产环境弱密钥时拒绝启动

```bash
# 测试 1: 生产环境 + 默认密钥 → 应拒绝启动
cd app/q-server
NODE_ENV=production JWT_SECRET="dev-secret-change-in-production" pnpm dev 2>&1 | head -5
# 预期输出: "生产环境必须设置 JWT_SECRET 环境变量，不得使用默认值"
# 预期进程退出

# 测试 2: 生产环境 + 自定义密钥 → 应正常启动
NODE_ENV=production JWT_SECRET="my-secure-random-secret" pnpm dev
# 预期: 服务正常启动

# 测试 3: 开发环境 + 未设置密钥 → 应正常启动 + 警告
NODE_ENV=development pnpm dev
# 预期: 服务正常启动，日志包含 "开发环境使用默认 JWT_SECRET" 的 warn 信息
```

**预期结果**:

- 生产环境 + 默认密钥 = 拒绝启动 + 错误日志
- 生产环境 + 自定义密钥 = 正常启动
- 开发环境 + 未设置 = 正常启动 + 警告日志

---

### VS-4: Token 刷新安全顺序验证

**目的**: 验证 refreshToken "先新后旧"顺序正确，崩溃不会锁定用户

```bash
# 运行认证模块单元测试
cd app/q-server && pnpm vitest run src/spec/user/auth/

# 手动验证:
# 1. 登录获取 Access + Refresh Token
# 2. 调用 POST /api/auth/refresh 刷新
# 3. 验证: 旧 Refresh Token 被加入黑名单（再次刷新应返回 401）
# 4. 验证: 新 Access Token 正常工作
# 5. 模拟 Redis 不可用场景：停止 Redis 后调用 refresh
#    预期: 返回明确错误（非静默失效），旧 Token 仍可用
```

**预期结果**:

- 刷新成功返回新 Token 对
- 旧 Refresh Token 立即失效
- Redis 不可用时返回错误但不丢失用户状态

---

### VS-5: 完整回归测试

```bash
# 运行全部后端测试
cd app/q-server && pnpm vitest run

# 运行 ESLint + Prettier 检查
cd app/q-server && pnpm eslint src/modules/survey/survey-stats/ src/modules/user/auth/
cd app/q-server && pnpm prettier --check src/modules/survey/survey-stats/ src/modules/user/auth/

# 启动完整应用确认无启动时异常
docker compose up -d
curl http://localhost:3000/api/health
```

**预期结果**:

- 全部测试通过
- Lint/Format 零警告
- 健康检查返回 `status: "ok"`
