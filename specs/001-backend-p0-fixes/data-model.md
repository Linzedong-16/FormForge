# Data Model: 后端 P0 严重问题修复

**Created**: 2026-08-08 | **Phase**: 1

## 概述

本次修复不涉及数据库 schema 变更、不新增表/字段/索引。所有改动均在应用层，复用现有数据模型。

---

## 涉及的现有实体

### SurveyComponent（问卷组件表）

- **表名**: `survey_components`
- **P0-1 相关字段**: `id` (BigInt PK), `survey_id` (FK), `type` (String), `config` (Json), `order_index` (Int), `required` (Int)
- **修复影响**: 统计模块对 `survey_components` 的查询从"逐组件查询"改为"一次性加载所有题目组件"，数据访问模式变化但不改变 schema

### Answer（答案表）

- **表名**: `answers`
- **P0-1 相关字段**: `id` (BigInt PK), `response_id` (FK), `component_id` (FK → SurveyComponent), `value` (String?), `values` (Json?), `answer_status` (SmallInt?)
- **修复影响**: 聚合查询从"`WHERE component_id = $1` 逐题查询"改为"`WHERE component_id IN (...)` + `GROUP BY component_id` 批量查询"

### User（用户表）

- **表名**: `users`
- **P0-4 相关**: `refreshToken` 不直接操作 User 表，通过 JWT JTI 管理 Token 生命周期

### Redis 键空间（JWT 黑名单）

- **P0-4 相关 Key**: `auth:jwt:blacklist:{jti}` (String, TTL = Token 过期时间)
- **P0-4 相关 Key**: `auth:user:access:{userId}` (String, 存当前 Access Token JTI)
- **修复影响**: 黑名单写入时序调整，Redis 键结构不变

---

## 数据完整性保证

| 修复项            | 完整性机制             | 说明                                                                                                                     |
| ----------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| P0-1 批量聚合     | 聚合前后结果一致性验证 | 逐题聚合（旧代码）vs 批量聚合（新代码）在测试中对比，确保 `options_distribution` / `average` / `sample_answers` 完全一致 |
| P0-2 移除无效查询 | 代码审查               | 确认被移除的查询结果在旧代码中从未被解构/使用                                                                            |
| P0-3 JWT 密钥     | 启动前置校验           | 在 `prisma.$connect()` 之前校验，不触及数据库                                                                            |
| P0-4 Token 顺序   | "先生成后失效"         | 无新增数据结构，纯流程顺序调整                                                                                           |

---

## 变更边界

- **不修改**：任何 Prisma schema（`schema.prisma`）
- **不修改**：Redis 键命名约定或 TTL 策略
- **不修改**：API 路由定义或 Zod schema
- **不修改**：前端代码
