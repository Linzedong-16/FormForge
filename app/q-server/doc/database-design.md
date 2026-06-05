# 问卷系统数据库设计文档

## 1. 业务需求分析

### 1.1 项目概述

本系统包含两个前端项目：

| 项目         | 定位         | 核心功能                      |
| ------------ | ------------ | ----------------------------- |
| **q-editor** | 低代码工作台 | 问卷设计、组件市场、预览发布  |
| **frontend** | 后台管理     | 监控、统计、日志审计、API管理 |

### 1.2 核心业务实体

```
┌─────────────────────────────────────────────────────────────────────┐
│                        业务实体关系图                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   ┌──────────┐      ┌──────────┐      ┌──────────┐                │
│   │   User   │──────│  Survey  │──────│ Component│                │
│   └──────────┘      └──────────┘      └──────────┘                │
│         │                │                   │                      │
│         ▼                ▼                   ▼                      │
│   ┌──────────┐      ┌──────────┐      ┌──────────┐                │
│   │ Token    │      │ Response │──────│  Answer  │                │
│   └──────────┘      └──────────┘      └──────────┘                │
│         │                │                                         │
│         ▼                ▼                                         │
│   ┌──────────┐      ┌──────────┐                                   │
│   │ AuditLog │      │  Config  │                                   │
│   └──────────┘      └──────────┘                                   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.3 业务流程分析

| 流程         | 描述                   | 涉及实体                |
| ------------ | ---------------------- | ----------------------- |
| **问卷创建** | 用户创建问卷，添加题目 | User, Survey, Component |
| **问卷发布** | 发布问卷供他人填写     | Survey                  |
| **问卷填写** | 用户填写问卷并提交     | Response, Answer        |
| **数据分析** | 统计分析问卷结果       | Response, Answer        |
| **系统管理** | 用户管理、权限控制     | User, Token, AuditLog   |

---

## 2. 数据库设计

### 2.1 ER图

```
User 1 ─── * Survey (创建者)
User 1 ─── * Response (填写者)
User 1 ─── * Token (API令牌)
User 1 ─── * AuditLog (操作日志)

Survey 1 ─── * Component (题目)
Survey 1 ─── * Response (答卷)
Survey 1 ─── * AuditLog (审计日志)

Response 1 ─── * Answer (答案)

Component 1 ─── * Answer (题目答案)
```

### 2.2 表结构设计

#### 2.2.1 用户表 (users)

| 字段名        | 类型         | 约束                                                            | 说明              |
| ------------- | ------------ | --------------------------------------------------------------- | ----------------- |
| id            | BIGINT       | PRIMARY KEY, AUTO_INCREMENT                                     | 用户唯一标识      |
| email         | VARCHAR(255) | UNIQUE, NOT NULL                                                | 邮箱地址          |
| password_hash | VARCHAR(255) | NOT NULL                                                        | 密码哈希          |
| username      | VARCHAR(100) | NOT NULL                                                        | 用户名            |
| role          | VARCHAR(50)  | NOT NULL, DEFAULT 'user'                                        | 角色：admin/user  |
| avatar_url    | VARCHAR(500) | NULL                                                            | 头像URL           |
| status        | TINYINT      | NOT NULL, DEFAULT 1                                             | 状态：0禁用/1启用 |
| created_at    | TIMESTAMP    | NOT NULL, DEFAULT CURRENT_TIMESTAMP                             | 创建时间          |
| updated_at    | TIMESTAMP    | NOT NULL, DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP | 更新时间          |
| last_login_at | TIMESTAMP    | NULL                                                            | 最后登录时间      |
| deleted_at    | TIMESTAMP    | NULL                                                            | 软删除时间        |

**索引**：

- `idx_users_email` (email) - 登录查询
- `idx_users_status` (status) - 状态筛选
- `idx_users_deleted_at` (deleted_at) - 软删除查询

#### 2.2.2 问卷表 (surveys)

| 字段名          | 类型         | 约束                                                            | 说明                    |
| --------------- | ------------ | --------------------------------------------------------------- | ----------------------- |
| id              | BIGINT       | PRIMARY KEY, AUTO_INCREMENT                                     | 问卷唯一标识            |
| user_id         | BIGINT       | NOT NULL, FOREIGN KEY → users(id)                               | 创建者ID                |
| title           | VARCHAR(500) | NOT NULL                                                        | 问卷标题                |
| description     | TEXT         | NULL                                                            | 问卷描述                |
| status          | TINYINT      | NOT NULL, DEFAULT 0                                             | 状态：0草稿/1发布/2关闭 |
| page_size       | INT          | NOT NULL, DEFAULT 10                                            | 每页题目数              |
| total_questions | INT          | NOT NULL, DEFAULT 0                                             | 题目总数                |
| responses_count | INT          | NOT NULL, DEFAULT 0                                             | 答卷数(缓存)            |
| is_public       | TINYINT      | NOT NULL, DEFAULT 0                                             | 是否公开                |
| access_code     | VARCHAR(100) | NULL                                                            | 访问密码                |
| created_at      | TIMESTAMP    | NOT NULL, DEFAULT CURRENT_TIMESTAMP                             | 创建时间                |
| updated_at      | TIMESTAMP    | NOT NULL, DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP | 更新时间                |
| published_at    | TIMESTAMP    | NULL                                                            | 发布时间                |
| closed_at       | TIMESTAMP    | NULL                                                            | 关闭时间                |

**索引**：

- `idx_surveys_user_id` (user_id) - 用户问卷列表
- `idx_surveys_status` (status) - 状态筛选
- `idx_surveys_created_at` (created_at) - 时间排序
- `idx_surveys_is_public` (is_public) - 公开问卷查询

#### 2.2.3 问卷组件表 (survey_components)

| 字段名      | 类型         | 约束                                                            | 说明         |
| ----------- | ------------ | --------------------------------------------------------------- | ------------ |
| id          | BIGINT       | PRIMARY KEY, AUTO_INCREMENT                                     | 组件唯一标识 |
| survey_id   | BIGINT       | NOT NULL, FOREIGN KEY → surveys(id)                             | 所属问卷ID   |
| type        | VARCHAR(100) | NOT NULL                                                        | 组件类型     |
| config      | JSON         | NOT NULL                                                        | 组件配置     |
| order_index | INT          | NOT NULL, DEFAULT 0                                             | 排序索引     |
| required    | TINYINT      | NOT NULL, DEFAULT 0                                             | 是否必填     |
| created_at  | TIMESTAMP    | NOT NULL, DEFAULT CURRENT_TIMESTAMP                             | 创建时间     |
| updated_at  | TIMESTAMP    | NOT NULL, DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP | 更新时间     |

**索引**：

- `idx_components_survey_id` (survey_id) - 问卷题目查询
- `idx_components_order` (survey_id, order_index) - 排序查询

#### 2.2.4 答卷表 (responses)

| 字段名       | 类型         | 约束                                                            | 说明                  |
| ------------ | ------------ | --------------------------------------------------------------- | --------------------- |
| id           | BIGINT       | PRIMARY KEY, AUTO_INCREMENT                                     | 答卷唯一标识          |
| survey_id    | BIGINT       | NOT NULL, FOREIGN KEY → surveys(id)                             | 问卷ID                |
| user_id      | BIGINT       | NULL, FOREIGN KEY → users(id)                                   | 填写者ID(登录用户)    |
| anonymous_id | VARCHAR(255) | NULL                                                            | 匿名用户标识          |
| status       | TINYINT      | NOT NULL, DEFAULT 0                                             | 状态：0未完成/1已提交 |
| submitted_at | TIMESTAMP    | NULL                                                            | 提交时间              |
| created_at   | TIMESTAMP    | NOT NULL, DEFAULT CURRENT_TIMESTAMP                             | 创建时间              |
| updated_at   | TIMESTAMP    | NOT NULL, DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP | 更新时间              |

**索引**：

- `idx_responses_survey_id` (survey_id) - 问卷答卷查询
- `idx_responses_user_id` (user_id) - 用户答卷查询
- `idx_responses_submitted_at` (submitted_at) - 时间筛选

#### 2.2.5 答案表 (answers)

| 字段名       | 类型      | 约束                                          | 说明           |
| ------------ | --------- | --------------------------------------------- | -------------- |
| id           | BIGINT    | PRIMARY KEY, AUTO_INCREMENT                   | 答案唯一标识   |
| response_id  | BIGINT    | NOT NULL, FOREIGN KEY → responses(id)         | 答卷ID         |
| component_id | BIGINT    | NOT NULL, FOREIGN KEY → survey_components(id) | 题目ID         |
| value        | TEXT      | NULL                                          | 答案值         |
| values       | JSON      | NULL                                          | 多选答案(数组) |
| created_at   | TIMESTAMP | NOT NULL, DEFAULT CURRENT_TIMESTAMP           | 创建时间       |

**索引**：

- `idx_answers_response_id` (response_id) - 答卷答案查询
- `idx_answers_component_id` (component_id) - 题目答案统计

#### 2.2.6 API令牌表 (api_tokens)

| 字段名       | 类型         | 约束                                | 说明              |
| ------------ | ------------ | ----------------------------------- | ----------------- |
| id           | BIGINT       | PRIMARY KEY, AUTO_INCREMENT         | 令牌唯一标识      |
| user_id      | BIGINT       | NOT NULL, FOREIGN KEY → users(id)   | 用户ID            |
| token        | VARCHAR(255) | UNIQUE, NOT NULL                    | 令牌值            |
| name         | VARCHAR(100) | NOT NULL                            | 令牌名称          |
| scope        | TEXT         | NULL                                | 权限范围(JSON)    |
| expires_at   | TIMESTAMP    | NULL                                | 过期时间          |
| status       | TINYINT      | NOT NULL, DEFAULT 1                 | 状态：0禁用/1启用 |
| created_at   | TIMESTAMP    | NOT NULL, DEFAULT CURRENT_TIMESTAMP | 创建时间          |
| last_used_at | TIMESTAMP    | NULL                                | 最后使用时间      |

**索引**：

- `idx_tokens_user_id` (user_id) - 用户令牌列表
- `idx_tokens_token` (token) - 令牌验证
- `idx_tokens_status` (status) - 状态筛选

#### 2.2.7 审计日志表 (audit_logs)

| 字段名        | 类型         | 约束                                | 说明         |
| ------------- | ------------ | ----------------------------------- | ------------ |
| id            | BIGINT       | PRIMARY KEY, AUTO_INCREMENT         | 日志唯一标识 |
| user_id       | BIGINT       | NULL, FOREIGN KEY → users(id)       | 用户ID       |
| action        | VARCHAR(100) | NOT NULL                            | 操作类型     |
| resource_type | VARCHAR(100) | NOT NULL                            | 资源类型     |
| resource_id   | BIGINT       | NULL                                | 资源ID       |
| details       | JSON         | NULL                                | 操作详情     |
| ip_address    | VARCHAR(50)  | NULL                                | 客户端IP     |
| user_agent    | VARCHAR(500) | NULL                                | 浏览器信息   |
| created_at    | TIMESTAMP    | NOT NULL, DEFAULT CURRENT_TIMESTAMP | 创建时间     |

**索引**：

- `idx_logs_user_id` (user_id) - 用户操作日志
- `idx_logs_action` (action) - 操作类型筛选
- `idx_logs_created_at` (created_at) - 时间筛选
- `idx_logs_resource` (resource_type, resource_id) - 资源操作查询

#### 2.2.8 系统配置表 (system_configs)

| 字段名      | 类型         | 约束                                                            | 说明         |
| ----------- | ------------ | --------------------------------------------------------------- | ------------ |
| id          | BIGINT       | PRIMARY KEY, AUTO_INCREMENT                                     | 配置唯一标识 |
| key         | VARCHAR(255) | UNIQUE, NOT NULL                                                | 配置键       |
| value       | TEXT         | NULL                                                            | 配置值       |
| description | VARCHAR(500) | NULL                                                            | 配置描述     |
| category    | VARCHAR(100) | NOT NULL, DEFAULT 'general'                                     | 配置分类     |
| created_at  | TIMESTAMP    | NOT NULL, DEFAULT CURRENT_TIMESTAMP                             | 创建时间     |
| updated_at  | TIMESTAMP    | NOT NULL, DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP | 更新时间     |

**索引**：

- `idx_configs_key` (key) - 配置查询
- `idx_configs_category` (category) - 分类查询

---

## 3. 多对多关系表

### 3.1 用户角色关联表 (user_roles)

| 字段名    | 类型        | 约束                                 | 说明     |
| --------- | ----------- | ------------------------------------ | -------- |
| user_id   | BIGINT      | PRIMARY KEY, FOREIGN KEY → users(id) | 用户ID   |
| role_code | VARCHAR(50) | PRIMARY KEY                          | 角色代码 |

**索引**：

- `idx_user_roles_user_id` (user_id)
- `idx_user_roles_role_code` (role_code)

### 3.2 问卷权限表 (survey_permissions)

| 字段名     | 类型        | 约束                                   | 说明                       |
| ---------- | ----------- | -------------------------------------- | -------------------------- |
| survey_id  | BIGINT      | PRIMARY KEY, FOREIGN KEY → surveys(id) | 问卷ID                     |
| user_id    | BIGINT      | PRIMARY KEY, FOREIGN KEY → users(id)   | 用户ID                     |
| permission | VARCHAR(50) | NOT NULL                               | 权限类型：view/edit/delete |

**索引**：

- `idx_permissions_survey_id` (survey_id)
- `idx_permissions_user_id` (user_id)

---

## 4. 数据库优化策略

### 4.1 索引策略

| 表名              | 索引名称                 | 字段         | 用途         |
| ----------------- | ------------------------ | ------------ | ------------ |
| users             | idx_users_email          | email        | 登录查询     |
| users             | idx_users_status         | status       | 用户筛选     |
| surveys           | idx_surveys_user_id      | user_id      | 用户问卷列表 |
| surveys           | idx_surveys_status       | status       | 状态筛选     |
| survey_components | idx_components_survey_id | survey_id    | 题目查询     |
| responses         | idx_responses_survey_id  | survey_id    | 答卷统计     |
| answers           | idx_answers_component_id | component_id | 答案统计     |
| audit_logs        | idx_logs_created_at      | created_at   | 日志查询     |

### 4.2 分区策略

**responses 表分区**（按日期）：

```sql
ALTER TABLE responses
PARTITION BY RANGE (submitted_at) (
PARTITION p202401 VALUES LESS THAN ('2024-02-01'),
PARTITION p202402 VALUES LESS THAN ('2024-03-01'),
PARTITION p202403 VALUES LESS THAN ('2024-04-01'),
PARTITION p_future VALUES LESS THAN MAXVALUE
);
```

**audit_logs 表分区**（按日期）：

```sql
ALTER TABLE audit_logs
PARTITION BY RANGE (created_at) (
PARTITION log_p202401 VALUES LESS THAN ('2024-02-01'),
PARTITION log_p202402 VALUES LESS THAN ('2024-03-01'),
PARTITION log_p_future VALUES LESS THAN MAXVALUE
);
```

### 4.3 缓存策略

| 缓存类型 | 数据     | 过期时间 | 刷新策略        |
| -------- | -------- | -------- | --------------- |
| Redis    | 问卷配置 | 5分钟    | 更新时刷新      |
| Redis    | 用户信息 | 1小时    | 登录/更新时刷新 |
| Redis    | 统计数据 | 10分钟   | 定时刷新        |
| Redis    | 热门问卷 | 30分钟   | 访问触发刷新    |

### 4.4 查询优化

**常见查询优化示例**：

```sql
-- 查询问卷统计（使用覆盖索引）
SELECT
    COUNT(*) as total,
    SUM(CASE WHEN status = 1 THEN 1 ELSE 0 END) as completed
FROM responses
WHERE survey_id = ?;

-- 答案统计（使用索引）
SELECT
    a.component_id,
    COUNT(*) as count,
    JSON_ARRAYAGG(a.value) as values
FROM answers a
WHERE a.component_id IN (SELECT id FROM survey_components WHERE survey_id = ?)
GROUP BY a.component_id;
```

---

## 5. 安全性设计

### 5.1 数据约束

| 表名      | 约束类型    | 约束说明                      |
| --------- | ----------- | ----------------------------- |
| users     | UNIQUE      | email唯一                     |
| users     | NOT NULL    | 关键字段非空                  |
| surveys   | FOREIGN KEY | user_id关联                   |
| responses | FOREIGN KEY | survey_id关联                 |
| answers   | FOREIGN KEY | response_id, component_id关联 |

### 5.2 数据加密

| 字段          | 加密方式        | 说明         |
| ------------- | --------------- | ------------ |
| password_hash | bcrypt          | 密码哈希     |
| access_code   | AES-256         | 问卷访问密码 |
| token         | UUID + 哈希存储 | API令牌      |

### 5.3 敏感数据处理

| 数据类型    | 处理方式     |
| ----------- | ------------ |
| 用户密码    | 仅存储哈希值 |
| 邮箱/手机号 | 日志脱敏显示 |
| IP地址      | 可选择匿名化 |

---

## 6. 扩展性设计

### 6.1 读写分离

```
┌─────────────────────────────────────────────────────────────────────┐
│                        读写分离架构                                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│         ┌─────────────┐                                            │
│         │  Application │                                            │
│         └──────┬──────┘                                            │
│                │                                                    │
│         ┌──────┴──────┐                                            │
│         │   Load      │                                            │
│         │  Balancer   │                                            │
│         └──────┬──────┘                                            │
│                │                                                    │
│      ┌────────┴────────┐                                           │
│      ▼                 ▼                                           │
│ ┌──────────┐      ┌──────────┐                                     │
│ │ Master   │      │  Slave   │                                     │
│ │ (Write)  │      │  (Read)  │                                     │
│ └──────────┘      └──────────┘                                     │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 6.2 分片策略

**按用户ID分片**（适用于大规模用户）：

```sql
-- 分片键：user_id % 100
-- 分片数量：100个
```

### 6.3 冷热数据分离

| 数据类型           | 存储方式      | 保留期限 |
| ------------------ | ------------- | -------- |
| 热数据（近30天）   | SSD本地存储   | 永久     |
| 温数据（30-90天）  | 本地磁盘      | 永久     |
| 冷数据（90天以上） | 对象存储/归档 | 按需保留 |

---

## 7. Prisma Schema 实现

```prisma
generator client {
provider = "prisma-client-js"
}

datasource db {
provider = "postgresql"
url      = env("DATABASE_URL")
}

model User {
id            BigInt      @id @default(autoincrement())
email         String      @unique
password_hash String
username      String
role          String      @default("user")
avatar_url    String?
status        Int         @default(1)
created_at    DateTime    @default(now())
updated_at    DateTime    @updatedAt
last_login_at DateTime?
deleted_at    DateTime?

surveys       Survey[]
responses     Response[]
tokens        ApiToken[]
audit_logs    AuditLog[]

@@index([email])
@@index([status])
@@index([deleted_at])
}

model Survey {
id               BigInt             @id @default(autoincrement())
user_id          BigInt
title            String
description      String?
status           Int                @default(0)
page_size        Int                @default(10)
total_questions  Int                @default(0)
responses_count  Int                @default(0)
is_public        Int                @default(0)
access_code      String?
created_at       DateTime           @default(now())
updated_at       DateTime           @updatedAt
published_at     DateTime?
closed_at        DateTime?

user             User               @relation(fields: [user_id], references: [id])
components       SurveyComponent[]
responses        Response[]
audit_logs       AuditLog[]
permissions      SurveyPermission[]

@@index([user_id])
@@index([status])
@@index([created_at])
@@index([is_public])
}

model SurveyComponent {
id          BigInt      @id @default(autoincrement())
survey_id   BigInt
type        String
config      Json
order_index Int         @default(0)
required    Int         @default(0)
created_at  DateTime    @default(now())
updated_at  DateTime    @updatedAt

survey      Survey      @relation(fields: [survey_id], references: [id])
answers     Answer[]

@@index([survey_id])
@@index([survey_id, order_index])
}

model Response {
id           BigInt      @id @default(autoincrement())
survey_id    BigInt
user_id      BigInt?
anonymous_id String?
status       Int         @default(0)
submitted_at DateTime?
created_at   DateTime    @default(now())
updated_at   DateTime    @updatedAt

survey       Survey      @relation(fields: [survey_id], references: [id])
user         User?       @relation(fields: [user_id], references: [id])
answers      Answer[]

@@index([survey_id])
@@index([user_id])
@@index([submitted_at])
}

model Answer {
id            BigInt              @id @default(autoincrement())
response_id   BigInt
component_id  BigInt
value         String?
values        Json?
created_at    DateTime            @default(now())

response      Response            @relation(fields: [response_id], references: [id])
component     SurveyComponent     @relation(fields: [component_id], references: [id])

@@index([response_id])
@@index([component_id])
}

model ApiToken {
id           BigInt      @id @default(autoincrement())
user_id      BigInt
token        String      @unique
name         String
scope        String?
expires_at   DateTime?
status       Int         @default(1)
created_at   DateTime    @default(now())
last_used_at DateTime?

user         User        @relation(fields: [user_id], references: [id])

@@index([user_id])
@@index([token])
@@index([status])
}

model AuditLog {
id            BigInt      @id @default(autoincrement())
user_id       BigInt?
action        String
resource_type String
resource_id   BigInt?
details       Json?
ip_address    String?
user_agent    String?
created_at    DateTime    @default(now())

user          User?       @relation(fields: [user_id], references: [id])

@@index([user_id])
@@index([action])
@@index([created_at])
@@index([resource_type, resource_id])
}

model SystemConfig {
id          BigInt      @id @default(autoincrement())
key         String      @unique
value       String?
description String?
category    String      @default("general")
created_at  DateTime    @default(now())
updated_at  DateTime    @updatedAt

@@index([key])
@@index([category])
}

model SurveyPermission {
survey_id   BigInt
user_id     BigInt
permission  String

survey      Survey      @relation(fields: [survey_id], references: [id], onDelete: Cascade)
user        User        @relation(fields: [user_id], references: [id], onDelete: Cascade)

@@id([survey_id, user_id])
@@index([survey_id])
@@index([user_id])
}
```

---

## 8. 总结

### 8.1 设计亮点

| 特性           | 实现方式                         |
| -------------- | -------------------------------- |
| **高并发**     | 索引优化、读写分离、缓存策略     |
| **数据安全**   | 密码哈希、外键约束、敏感数据脱敏 |
| **可扩展性**   | 分区策略、分片支持、冷热分离     |
| **数据完整性** | 外键约束、事务支持、软删除       |

### 8.2 性能指标

| 指标     | 目标值  |
| -------- | ------- |
| 问卷创建 | < 100ms |
| 答卷提交 | < 150ms |
| 统计查询 | < 500ms |
| 日志查询 | < 1s    |

### 8.3 部署建议

| 环境 | 配置                        |
| ---- | --------------------------- |
| 开发 | 单节点 PostgreSQL           |
| 测试 | 主从复制 + Redis            |
| 生产 | 读写分离 + 分片 + Redis集群 |

---

**文档版本**: v1.0  
**创建日期**: 2026-06-05  
**适用项目**: q-editor + frontend 问卷系统
