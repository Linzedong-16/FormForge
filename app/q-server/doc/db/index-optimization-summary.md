# PostgreSQL 索引优化总结文档

> 版本：v1.0  
> 日期：2026-06-24  
> 数据库：PostgreSQL  
> 适用范围：`prisma/schema.prisma` — `surveys` / `reviews` 表

---

## 目录

- [一、问题背景](#一问题背景)
- [二、优化目标](#二优化目标)
- [三、PG 与 MySQL 索引差异要点](#三pg-与-mysql-索引差异要点)
- [四、优化前现状分析](#四优化前现状分析)
- [五、具体优化措施](#五具体优化措施)
- [六、实施过程记录](#六实施过程记录)
- [七、优化前后对比](#七优化前后对比)
- [八、PG 专属进阶优化建议](#八pg-专属进阶优化建议)
- [九、遗留问题](#九遗留问题)
- [十、后续改进建议](#十后续改进建议)

---

## 一、问题背景

### 1.1 触发原因

在对 `surveys` 和 `reviews` 两张核心业务表的 SQL 查询模式进行全面审查时，发现了以下问题：

1. `surveys` 表存在冗余单列索引，与已有的复合索引前缀重复
2. 两个核心查询的 `ORDER BY` 字段未包含在索引中，导致 PostgreSQL 每次查询都需要额外的排序操作（显式 Sort）
3. 新增的"未审核问卷"查询场景缺少专用索引

### 1.2 影响范围

| 影响查询                                                                                      | 所在文件                                    | 问题                            |
| --------------------------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------- |
| 问卷列表 `SELECT ... WHERE user_id=? AND deleted_at IS NULL ORDER BY updated_at DESC`         | `survey-crud.service.ts:list()`             | 索引不覆盖 ORDER BY，需额外排序 |
| 审核列表 `SELECT ... WHERE review_type=? AND status=? ORDER BY submitted_at DESC`             | `review.service.ts:listReviews()`           | 同上                            |
| 未审核问卷 `SELECT ... WHERE deleted_at IS NULL AND review_status=? ORDER BY created_at DESC` | `review.service.ts:listUnreviewedSurveys()` | 无匹配索引，全表扫描            |

---

## 二、优化目标

1. **消除冗余索引** — 删除功能已被复合索引覆盖的冗余单列索引，减少写入开销
2. **覆盖 ORDER BY** — 将排序字段纳入复合索引末尾，消除显式排序操作
3. **支持新查询场景** — 为"未审核问卷列表"查询创建专用索引

---

## 三、PG 与 MySQL 索引差异要点

> 如果你熟悉 MySQL 但不熟悉 PostgreSQL，以下差异是理解本次优化的关键。

| 特性                 | MySQL (InnoDB)                                  | PostgreSQL                                          |
| -------------------- | ----------------------------------------------- | --------------------------------------------------- |
| **聚簇索引**         | 主键即聚簇索引，数据按 PK 物理排序              | 堆表存储，数据无序，主键仅是一个唯一索引            |
| **回表代价**         | 二级索引 → PK → 数据（一次 B-tree 查找）        | Index Scan → Heap Fetch（可能随机 I/O，代价更高）   |
| **覆盖索引**         | 二级索引天然包含 PK，常可利用"覆盖索引"避免回表 | 需要显式 `INCLUDE (...)` 子句（PG 11+）才能避免回表 |
| **NULL 在索引中**    | 包含 NULL 值                                    | 包含 NULL 值，`IS NULL` 可走索引                    |
| **部分索引**         | ❌ 不支持（8.0+ 不支持）                        | ✅ `CREATE INDEX ... WHERE ...`，可大幅减小索引体积 |
| **降序索引**         | 8.0+ 支持 `DESC`                                | 原生支持 `DESC`，反向扫描也很高效                   |
| **复合索引最左前缀** | ✅                                              | ✅ 同 MySQL，但不自动创建前缀统计                   |

> **本次优化的核心认知**：PG 没有聚簇索引，回表代价比 MySQL 高。因此索引覆盖查询所需的全部列比在 MySQL 中更重要。

---

## 四、优化前现状分析

### 4.1 `surveys` 表原索引

```prisma
@@index([user_id])                      // ① 冗余
@@index([status])
@@index([created_at])
@@index([is_public])
@@index([deleted_at])
@@index([user_id, deleted_at])          // ② 缺 updated_at
@@index([survey_type, review_status])
@@index([survey_type, category])
@@index([survey_type, download_count])
@@index([survey_type, rating])
```

### 4.2 `reviews` 表原索引

```prisma
@@index([survey_id])
@@index([submitter_id])
@@index([reviewer_id])
@@index([review_type])                  // ③ 低收益
@@index([status])                       // ④ 低收益
@@index([submitted_at])
@@index([review_type, status])          // ⑤ 缺 submitted_at
@@index([survey_id, status])
```

### 4.3 问题总结

| 编号 | 表        | 问题                                                              | 影响                                            |
| ---- | --------- | ----------------------------------------------------------------- | ----------------------------------------------- |
| ①    | `surveys` | `@@index([user_id])` 与 `@@index([user_id, deleted_at])` 前缀重复 | 写入时多维护一个索引，磁盘浪费                  |
| ②    | `surveys` | `@@index([user_id, deleted_at])` 不包含 `updated_at`              | 列表查询每次触发显式 Sort                       |
| —    | `surveys` | 缺少 `[deleted_at, review_status, created_at]`                    | 未审核问卷查询全表扫描                          |
| ③④   | `reviews` | `@@index([review_type])` + `@@index([status])` 低收益             | `@@index([review_type, status])` 的前导列已覆盖 |
| ⑤    | `reviews` | `@@index([review_type, status])` 不包含 `submitted_at`            | 审核列表查询每次触发显式 Sort                   |

---

## 五、具体优化措施

### 5.1 `surveys` 表（3 项变更）

#### 变更 A：删除冗余索引 `@@index([user_id])`

```diff
- @@index([user_id])
```

**理由**：`@@index([user_id, deleted_at, updated_at])` 的前导列 `user_id` 完全可以处理 `WHERE user_id = ?` 类型的查询。PG 的 B-tree 索引天生支持最左前缀匹配。

#### 变更 B：改造列表查询索引 — 增加 `updated_at`

```diff
- @@index([user_id, deleted_at])
+ @@index([user_id, deleted_at, updated_at])
```

**理由**：问卷列表查询模式固定为：

```sql
SELECT ... FROM surveys
WHERE user_id = $1 AND deleted_at IS NULL
ORDER BY updated_at DESC
LIMIT $2 OFFSET $3;
```

原索引只能覆盖 `WHERE` 条件，PG 还需要单独排序。增加 `updated_at DESC` 后，索引本身已按 `updated_at` 降序排列，只需扫描前 N 行即可返回结果，消除排序。

#### 变更 C：新增未审核问卷查询索引

```diff
+ @@index([deleted_at, review_status, created_at])
```

**理由**：`listUnreviewedSurveys()` 执行的查询：

```sql
SELECT ... FROM surveys
WHERE deleted_at IS NULL AND review_status = 'none'
ORDER BY created_at DESC
LIMIT $1 OFFSET $2;
```

原表无匹配的复合索引，PG 只能扫描 `deleted_at` 或 `created_at` 单列索引后过滤。

### 5.2 `reviews` 表（1 项变更）

#### 变更 D：改造审核列表索引 — 增加 `submitted_at`

```diff
- @@index([review_type, status])
+ @@index([review_type, status, submitted_at])
```

**理由**：审核列表查询模式固定为：

```sql
SELECT ... FROM reviews
WHERE review_type = $1 AND status = $2
ORDER BY submitted_at DESC
LIMIT $3 OFFSET $4;
```

与变更 B 同理，增加 `submitted_at DESC` 后消除排序。

> `@@index([review_type])` 和 `@@index([status])` 暂时保留。虽然它们的部分功能已被复合索引覆盖，但在某些单条件筛选场景（如"查看所有审核中的记录"不区分 review_type）中仍有独立价值。

---

## 六、实施过程记录

### 6.1 变更清单

| 序号 | 表        | 操作 | 旧值                             | 新值                                               |
| ---- | --------- | ---- | -------------------------------- | -------------------------------------------------- |
| 1    | `surveys` | 删除 | `@@index([user_id])`             | —                                                  |
| 2    | `surveys` | 修改 | `@@index([user_id, deleted_at])` | `@@index([user_id, deleted_at, updated_at])`       |
| 3    | `surveys` | 新增 | —                                | `@@index([deleted_at, review_status, created_at])` |
| 4    | `reviews` | 修改 | `@@index([review_type, status])` | `@@index([review_type, status, submitted_at])`     |

### 6.2 迁移 SQL

文件位置：[`prisma/migrations/20260624000000_optimize_indexes/migration.sql`](../../../../prisma/migrations/20260624000000_optimize_indexes/migration.sql)

```sql
-- 1. 删除 surveys 冗余索引
DROP INDEX IF EXISTS "surveys_user_id_idx";

-- 2. 重建 surveys 列表查询索引（增加 updated_at）
DROP INDEX IF EXISTS "surveys_user_id_deleted_at_idx";
CREATE INDEX "surveys_user_id_deleted_at_updated_at_idx"
  ON "surveys" ("user_id", "deleted_at", "updated_at" DESC);

-- 3. 新增 surveys 未审核问卷查询索引
CREATE INDEX "surveys_deleted_at_review_status_created_at_idx"
  ON "surveys" ("deleted_at", "review_status", "created_at" DESC);

-- 4. 重建 reviews 审核列表查询索引（增加 submitted_at）
DROP INDEX IF EXISTS "reviews_review_type_status_idx";
CREATE INDEX "reviews_review_type_status_submitted_at_idx"
  ON "reviews" ("review_type", "status", "submitted_at" DESC);
```

### 6.3 回滚方案

```sql
-- 回滚：恢复原索引
DROP INDEX IF EXISTS "surveys_user_id_deleted_at_updated_at_idx";
CREATE INDEX "surveys_user_id_deleted_at_idx" ON "surveys" ("user_id", "deleted_at");
DROP INDEX IF EXISTS "surveys_user_id_idx";
CREATE INDEX "surveys_user_id_idx" ON "surveys" ("user_id");
DROP INDEX IF EXISTS "surveys_deleted_at_review_status_created_at_idx";
DROP INDEX IF EXISTS "reviews_review_type_status_submitted_at_idx";
CREATE INDEX "reviews_review_type_status_idx" ON "reviews" ("review_type", "status");
```

---

## 七、优化前后对比

### 7.1 索引数量变化

| 表        | 优化前    | 优化后    | 变化                         |
| --------- | --------- | --------- | ---------------------------- |
| `surveys` | 10 个索引 | 10 个索引 | 净增 0（删 1 + 改 1 + 增 1） |
| `reviews` | 8 个索引  | 8 个索引  | 净增 0（改 1）               |

> 索引数量不变，但覆盖范围显著提升。

### 7.2 查询性能对比

| 查询场景   | 优化前                        | 优化后                              |
| ---------- | ----------------------------- | ----------------------------------- |
| 问卷列表   | Index Scan → **Sort** → Limit | **Index Scan** → Limit（消除 Sort） |
| 审核列表   | Index Scan → **Sort** → Limit | **Index Scan** → Limit（消除 Sort） |
| 未审核问卷 | Seq Scan（全表扫描）          | **Index Scan** → Limit              |

### 7.3 EXPLAIN 预估

**问卷列表（10 万条问卷，用户有 500 条）**：

| 指标     | 优化前                   | 优化后                                    |
| -------- | ------------------------ | ----------------------------------------- |
| 扫描方式 | Index Scan + Sort        | Index Only Scan（或 Index Scan Backward） |
| 排序     | `Sort Method: quicksort` | 无需排序                                  |
| 预估耗时 | ~5ms                     | ~1ms                                      |

**审核列表（1000 条审核记录）**：

| 指标     | 优化前                   | 优化后              |
| -------- | ------------------------ | ------------------- |
| 扫描方式 | Index Scan + Sort        | Index Scan Backward |
| 排序     | `Sort Method: quicksort` | 无需排序            |
| 预估耗时 | ~2ms                     | ~0.5ms              |

### 7.4 磁盘影响

| 项目                                           | 影响                                         |
| ---------------------------------------------- | -------------------------------------------- |
| 删除 `@@index([user_id])`                      | 节省约 10% 的 surveys 索引空间（取决于行数） |
| 新增 `updated_at` / `submitted_at`             | 每个索引增加约 8 字节/行                     |
| 新增 `[deleted_at, review_status, created_at]` | 每行约 30 字节                               |
| **净磁盘影响**                                 | 微小增加（< 5%），远小于性能收益             |

---

## 八、PG 专属进阶优化建议

以下优化利用 PostgreSQL 特有的"部分索引（Partial Index）"能力，Prisma Schema 不支持直接声明，建议在 migration 中手动创建。

### 8.1 模板市场热榜查询

**当前**：`@@index([survey_type, download_count])` 索引包含全表所有行（含 personal 问卷的 download_count）。

**优化**：

```sql
-- 仅索引已上架模板（约占总行数 10%），索引体积减少 90%
CREATE INDEX "surveys_template_hot"
  ON "surveys" ("download_count" DESC)
  WHERE "survey_type" = 'template' AND "review_status" = 'approved';
```

### 8.2 审核去重检查加速

**当前**：`@@index([survey_id, status])` 索引全表的 survey_id。

**优化**：

```sql
-- 仅索引审核中的记录（通常 < 总记录数的 5%）
CREATE INDEX "reviews_pending_dedup"
  ON "reviews" ("survey_id", "review_type")
  WHERE "status" = 'pending';
```

### 8.3 总索引数汇总（含部分索引建议）

```
查询频次       优化前                           优化后
───────       ────                            ────
高频          10 个全量索引                     8 个全量索引 + 2 个部分索引
覆盖          仅 WHERE 条件                     WHERE + ORDER BY 全覆盖
写入开销      每次 INSERT 维护 10 个索引         每次 INSERT 维护 8 个全量 + 条件命中时才维护部分索引
```

---

## 九、遗留问题

### 9.1 `reviews` 低收益索引

`@@index([review_type])` 和 `@@index([status])` 在当前查询模式下收益有限，因为所有审核列表查询都同时传 `review_type` + `status`，复合索引 `@@index([review_type, status, submitted_at])` 已完全覆盖。

**保留原因**：存在潜在的单条件查询场景（如"统计所有审核中的记录总数"），暂时保留。建议在日常运行中通过 PG 的 `pg_stat_user_indexes` 监控这两个索引的实际命中率，连续 30 天零命中则可安全删除。

### 9.2 模板市场排序索引

`@@index([survey_type, download_count])` 和 `@@index([survey_type, rating])` 中有大量无用行（personal 问卷的 download_count/rating 始终为 0）。建议迁移到部分索引（参见 8.1），但由于需要手动 SQL，未纳入本次 Prisma 迁移。

---

## 十、后续改进建议

### 10.1 短期（本次已完成）

- [x] 删除 `surveys` 冗余索引 `@@index([user_id])`
- [x] `surveys` 列表索引增加 `updated_at`
- [x] 新增 `surveys` 未审核问卷索引
- [x] `reviews` 审核列表索引增加 `submitted_at`

### 10.2 中期（建议 1 个月内评估）

- [ ] 引入 PG 部分索引（模板市场查询、审核去重检查）
- [ ] 监控 `@@index([review_type])` / `@@index([status])` 命中率，决定是否删除

### 10.3 长期（建议持续维护）

- [ ] 定期执行 `ANALYZE` 更新表统计信息（PG autovacuum 默认已执行，高频写入表可手动调频）
- [ ] 使用 `pg_stat_user_indexes` + `pg_stat_user_tables` 持续监控索引使用情况
- [ ] 对于已上线的复杂查询，在 staging 环境定期跑 `EXPLAIN (ANALYZE, BUFFERS)` 验证执行计划
- [ ] 考虑对 `surveys` 和 `reviews` 的大表（>100 万行）启用 PG 原生表分区（按 `created_at` 月份分区）

### 10.4 监控查询示例

```sql
-- 检查哪些索引从未被使用
SELECT schemaname, tablename, indexname, idx_scan, idx_tup_read, idx_tup_fetch
FROM pg_stat_user_indexes
WHERE idx_scan = 0
ORDER BY pg_relation_size(indexrelid) DESC;

-- 检查哪些表可能需要 VACUUM
SELECT relname, n_live_tup, n_dead_tup, last_vacuum, last_autovacuum
FROM pg_stat_user_tables
WHERE n_dead_tup > 10000
ORDER BY n_dead_tup DESC;
```

---

## 附录 A：最终 Schema 索引定义

### `surveys` 表（优化后）

```prisma
@@index([status])
@@index([created_at])
@@index([is_public])
@@index([deleted_at])
@@index([user_id, deleted_at, updated_at])       // ← 改造：新增 updated_at
@@index([survey_type, review_status])
@@index([survey_type, category])
@@index([survey_type, download_count])
@@index([survey_type, rating])
@@index([deleted_at, review_status, created_at])  // ← 新增：未审核问卷查询
```

### `reviews` 表（优化后）

```prisma
@@index([survey_id])
@@index([submitter_id])
@@index([reviewer_id])
@@index([review_type])
@@index([status])
@@index([submitted_at])
@@index([review_type, status, submitted_at])  // ← 改造：新增 submitted_at
@@index([survey_id, status])
```

---

## 附录 B：变更文件清单

| 文件                                                              | 变更类型 | 说明                   |
| ----------------------------------------------------------------- | -------- | ---------------------- |
| `prisma/schema.prisma`                                            | 修改     | 4 项索引变更（见 6.1） |
| `prisma/migrations/20260624000000_optimize_indexes/migration.sql` | 新增     | 索引重建 SQL           |
| `doc/db/index-optimization-summary.md`                            | 新增     | 本文档                 |
