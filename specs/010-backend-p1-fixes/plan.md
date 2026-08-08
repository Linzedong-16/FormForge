# Implementation Plan: 后端 P1 级可靠性修复

**Branch**: `010-backend-p1-fixes` | **Date**: 2026-08-08 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/010-backend-p1-fixes/spec.md`

## Summary

修复 5 个 P1 级后端可靠性问题：CSV 导出流式化（防 OOM）、RabbitMQ 断连自动重连、Redis 离线队列策略修正、答卷删除后统计缓存同步失效、sendCode AMQP 不可用时显式告警。所有修复集中在 `app/q-server` 包内，涉及 4 个源文件 + 1 个插件文件，无新增依赖。

## Technical Context

**Language/Version**: TypeScript 5.9, Node ≥22.17 (ESM NodeNext)

**Primary Dependencies**: Fastify 5, Prisma 7, ioredis, amqplib (amqp 0-9-1), Pino

**Storage**: PostgreSQL 16 (via Prisma), Redis 7 (via ioredis)

**Testing**: Vitest, `src/spec/**/*.spec.ts` 模式

**Target Platform**: Linux server (Docker 部署)

**Project Type**: web-service（q-server Fastify 后端）

**Performance Goals**: CSV 导出 10 万答卷内存增量 < 50MB；RabbitMQ 重连 < 30s；缓存失效即时（0 延迟窗口）

**Constraints**: 不引入新依赖（利用现有 stream.Readable / amqplib 事件 / ioredis 配置）；不影响现有 API 契约（除 sendCode 返回值变更）

**Scale/Scope**: 单次 CSV 导出最大 ~10 万份答卷；RabbitMQ 重连仅影响 q-server 实例

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                         | Status  | Notes                                                                           |
| --------------------------------- | ------- | ------------------------------------------------------------------------------- |
| I. Monorepo Module Boundary       | ✅ PASS | 所有变更在 `app/q-server` 内，无跨包引用                                        |
| II. Strict Type Safety            | ✅ PASS | 无新增 `any` 类型；流式导出使用标准 Node.js stream 类型                         |
| III. Unified API Contract         | ✅ PASS | sendCode 响应变更仍使用 `{ code, msg, data }` 信封；新增错误码使用 BizCode 枚举 |
| IV. Security-by-Default           | ✅ PASS | 无新增路由/认证变更；日志中邮箱脱敏复用 `maskEmail`                             |
| V. Test-Adequate Delivery         | ✅ PASS | 每个 US 对应独立测试用例，遵循现有 mock 模式                                    |
| VI. Observability                 | ✅ PASS | RabbitMQ 重连事件日志（Pino）；sendCode 新增 WARN 日志；CSV 导出错误日志        |
| VII. Code Style & Static Analysis | ✅ PASS | 遵循现有 ESLint/Prettier 配置；无新增文件类型                                   |
| VIII. Micro-Frontend Integration  | ✅ N/A  | 纯后端变更                                                                      |
| IX. AI/LLM Integration            | ✅ N/A  | 不涉及 AI 模块                                                                  |
| X. Performance & Data Pipeline    | ✅ PASS | CSV 流式化提升性能；缓存失效对齐现有 TTL 策略；无 N+1 退化                      |

**Gate Result**: 全部通过，无违规项需记录。

## Project Structure

### Documentation (this feature)

```text
specs/010-backend-p1-fixes/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── csv-export-api.md
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
app/q-server/
├── src/
│   ├── modules/
│   │   ├── survey/
│   │   │   ├── survey-stats/
│   │   │   │   ├── survey-stats.service.ts    # US1: CSV 流式导出
│   │   │   │   ├── survey-stats.routes.ts     # US1: 导出路由（如有调整）
│   │   │   │   └── survey-stats.schemas.ts    # US1: 导出参数 schema
│   │   │   └── survey-crud/
│   │   │       └── survey-crud.service.ts     # US4: deleteResponse 缓存失效
│   │   └── user/
│   │       └── auth/
│   │           └── auth.service.ts            # US5: sendCode 告警
│   ├── plugins/
│   │   ├── rabbitmq.ts                        # US2: 自动重连
│   │   └── redis.ts                           # US3: enableOfflineQueue 修正
│   └── spec/
│       ├── survey-stats/
│       │   └── survey-stats.service.spec.ts   # US1 测试（追加）
│       ├── survey/
│       │   └── survey-crud/
│       │       └── survey-crud.service.spec.ts # US4 测试（追加）
│       └── user/
│           └── auth/
│               └── auth.service.spec.ts       # US5 测试（追加）
└── prisma/
    └── schema.prisma                          # 无变更（P1 不涉及）
```

**Structure Decision**: 所有变更集中在 `app/q-server/src/` 内，遵循现有模块/插件/测试三层结构。无新增文件，仅在现有文件中追加方法或修改配置，测试用例追加到已有 spec 文件末尾（与 P0 修复模式一致）。

## Complexity Tracking

> 无宪法违规项，此表为空。
