# Implementation Plan: 后端 P0 严重问题修复

**Branch**: `001-backend-p0-fixes` | **Date**: 2026-08-08 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-backend-p0-fixes/spec.md`

## Summary

修复 4 个 P0 级别后端缺陷：(1) 统计模块 N+1 查询 → 批量聚合 SQL；(2) `getSurveyStats` 中 `Promise.all` 查询结果静默丢弃 → 移除无效查询；(3) JWT Secret 生产环境弱密钥硬编码 → 启动时强制校验；(4) `refreshToken` 操作顺序导致崩溃时可致用户永久锁定 → 调整为先新后旧。

所有修复保持API向后兼容，前端无需改动。技术方案均为在现有代码基础上的局部修正，不引入新依赖。

## Technical Context

**Language/Version**: TypeScript 5.9 (strict), Node ≥22.17

**Primary Dependencies**: Fastify 5, Prisma 7, Zod v4, ioredis, PostgreSQL 16 + pgvector

**Storage**: PostgreSQL（业务主库）、Redis（JWT 黑名单/缓存）

**Testing**: Vitest（`app/q-server/src/spec/`）

**Target Platform**: Linux server (Docker)

**Project Type**: Web service (monorepo 中的 `app/q-server` 后端服务)

**Performance Goals**: 30 题/1 万答卷的统计接口 < 3s（优化前估计 5-10s）；统计 SQL 查询次数 < 10 次（优化前 ~60 次）

**Constraints**: 保持 API 响应格式不变（`{ code, msg, data }` 信封）；保持前端零改动；通过所有现有测试

**Scale/Scope**: 4 个文件改动（survey-stats.service.ts, auth.service.ts, survey-stats.service.spec.ts, auth.service.spec.ts）

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| 原则                                   | 状态    | 说明                                                                    |
| -------------------------------------- | ------- | ----------------------------------------------------------------------- |
| I. Monorepo Module Boundary            | ✅ PASS | 所有改动均在 `app/q-server` 内，不跨包                                  |
| II. Strict Type Safety & Schema-First  | ✅ PASS | 无新增 `any`，保持 Zod 校验，不改 API schema                            |
| III. Unified API Contract              | ✅ PASS | 响应格式保持 `{ code, msg, data }`，无新增/修改接口                     |
| IV. Security-by-Default                | ✅ PASS | 修复 3（JWT Secret 校验）直接强化安全默认值；修复 4 消除 Token 安全漏洞 |
| V. Test-First / Test-Adequate          | ✅ PASS | 每个修复附带单元测试，覆盖正常路径和边缘情况                            |
| VI. Observability & Structured Logging | ✅ PASS | 使用 Pino 记录警告/错误日志，不改动日志体系                             |
| VII. Code Style & Static Analysis      | ✅ PASS | 通过 ESLint/Prettier/cspell 检查                                        |
| VIII. Micro-Frontend Integration       | N/A     | 纯后端修复，不涉及前端                                                  |
| IX. AI/LLM Integration                 | N/A     | 不涉及 AI 模块                                                          |
| X. Performance & Data Pipeline         | ✅ PASS | 修复 1/2 直接涉及"数据库 N+1 查询"审查原则，修复降低查询次数            |

**Gate Result**: ALL PASS — 无需豁免，可以继续。

## Project Structure

### Documentation (this feature)

```text
specs/001-backend-p0-fixes/
├── spec.md              # 功能规范
├── plan.md              # 本文件（实施计划）
├── research.md          # Phase 0 输出（技术调研）
├── data-model.md        # Phase 1 输出（数据模型）
├── quickstart.md        # Phase 1 输出（验证指南）
├── checklists/
│   └── requirements.md  # 规范质量检查清单
└── tasks.md             # Phase 2 输出（/speckit-tasks 命令生成）
```

### Source Code (repository root)

```text
app/q-server/src/
├── modules/
│   ├── survey/
│   │   └── survey-stats/
│   │       ├── survey-stats.service.ts    # [修改] P0-1: N+1 批量聚合; P0-2: 移除无效查询
│   │       └── survey-stats.schemas.ts    # [不改] API schema 保持不变
│   └── user/
│       └── auth/
│           ├── auth.service.ts            # [修改] P0-3: JWT Secret 启动校验; P0-4: refreshToken 顺序
│           └── auth.middleware.ts         # [不改] Token 验证逻辑不变
├── plugins/
│   └── prisma.ts                          # [不改] 数据库连接不变
└── spec/                                  # 测试目录
    ├── survey/
    │   └── survey-crud/
    │       └── survey-crud.service.spec.ts    # [新增测试] 统计批量查询 + Promise.all 修复
    ├── user/
    │   └── auth/
    │       └── auth.service.spec.ts           # [新增测试] JWT Secret 校验 + refreshToken 顺序
    └── survey-stats/                          # [新增] 如果不存在则创建
        └── survey-stats.service.spec.ts
```

**Structure Decision**: 本功能为现有后端服务的局部修复，不新增模块/目录。改动集中在 2 个 service 文件 + 对应的 2 个 spec 文件。

## Complexity Tracking

> 本次修复无宪法违规项，此节留空。
