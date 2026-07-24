# Data Model: q-editor GitHub Pages 静态演示

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

本功能不涉及任何数据库/持久化层的 schema 变更——所有实体均是内存中的**静态假数据**（`src/standalone/data.ts`），供客户端 Mock 适配器在拦截 `/api/*` 请求时返回。字段设计对齐 `packages/common` 现有共享类型（`user.interface.ts` 等）与 `q-server` 真实响应结构，保证与生产环境行为一致（Constitution Principle III）。

## 1. 演示用户 (DemoUser)

| 字段        | 类型            | 说明                                                                |
| ----------- | --------------- | ------------------------------------------------------------------- |
| `id`        | `string`        | 固定 UID                                                            |
| `email`     | `string`        | 登录邮箱，固定为 `admin@example.com`（对应 FR-004）                 |
| `password`  | `string`        | 演示密码，固定为 `Admin@123`（仅用于 Mock 校验，非真实凭据）        |
| `role`      | `"super_admin"` | 角色，决定管理后台可见性（对应 FR-007）                             |
| `nickname`  | `string`        | 昵称，固定为「管理员」                                              |
| `avatarUrl` | `string`        | 固定为 `https://linzex.top/upload/1759642363899.gif`（对应 FR-008） |

**校验规则**：Mock 登录 handler 仅比对 `email`/`password` 是否与该固定账号完全匹配；不匹配时返回 `{code: 401, msg: "账号或密码错误"}`，与真实认证失败响应结构一致。

**关系**：1 个 DemoUser 拥有 1 个 UserProfile（1:1，内嵌于同一数据对象，不单独建模）。

## 2. Token 会话 (MockSession)

| 字段               | 类型     | 说明                                                 |
| ------------------ | -------- | ---------------------------------------------------- |
| `accessToken`      | `string` | 固定格式的假 Token 字符串                            |
| `refreshToken`     | `string` | 固定格式的假 Refresh Token                           |
| `expiresIn`        | `number` | 固定为 `3600`（秒），与真实 Token 有效期字段语义一致 |
| `refreshExpiresIn` | `number` | 固定为 `604800`（秒）                                |

**状态转换**：无真实过期逻辑——Mock 的 `/api/auth/refresh` 端点始终返回同一组固定值，不校验传入 Token 是否真实过期，保证演示场景下 Token 刷新永不失败（对应 Edge Case「连续快速点击登录按钮」不会因 Token 状态混乱而报错）。

## 3. 演示问卷 (DemoSurvey)

| 字段                      | 类型                                 | 说明                                           |
| ------------------------- | ------------------------------------ | ---------------------------------------------- |
| `id`                      | `string`                             | 问卷 UID                                       |
| `title`                   | `string`                             | 标题                                           |
| `description`             | `string`                             | 描述                                           |
| `status`                  | `"draft" \| "published" \| "closed"` | 状态（对应 FR-009，至少 1 已发布 + 1 草稿）    |
| `components`              | `DemoComponent[]`                    | 题目组件列表（对应 FR-010，至少 3 种不同类型） |
| `createdAt` / `updatedAt` | `string`（ISO 时间）                 | 创建/更新时间                                  |

### 3.1 演示问卷组件 (DemoComponent)

| 字段        | 类型                                                                      | 说明                                                                  |
| ----------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `id`        | `string`                                                                  | 组件 UID                                                              |
| `survey_id` | `string`                                                                  | 所属问卷 ID（外键，指向 DemoSurvey.id）                               |
| `type`      | `"text_note" \| "single_select" \| "multi_select" \| "text_input" \| ...` | 题型（对应 FR-011 的多题型渲染要求）                                  |
| `order`     | `number`                                                                  | 画布内排序                                                            |
| `config`    | `Record<string, unknown>`                                                 | 题型特定配置（选项列表、必填校验等），结构对齐真实组件的编辑态 schema |

**关系**：1 个 DemoSurvey 拥有多个 DemoComponent（1:N，通过 `survey_id` 关联）。

## 4. 演示答卷 (DemoResponse)

| 字段          | 类型                      | 说明           |
| ------------- | ------------------------- | -------------- |
| `id`          | `string`                  | 答卷 UID       |
| `survey_id`   | `string`                  | 所属问卷 ID    |
| `answers`     | `Record<string, unknown>` | 各组件的填写值 |
| `submittedAt` | `string`                  | 提交时间       |

**关系**：1 个 DemoSurvey 拥有多个 DemoResponse（1:N）。

## 5. 演示模板 (DemoTemplate)

| 字段         | 类型              | 说明                                      |
| ------------ | ----------------- | ----------------------------------------- |
| `id`         | `string`          | 模板 UID                                  |
| `name`       | `string`          | 模板名称                                  |
| `category`   | `string`          | 分类（如「员工满意度」「客户反馈」）      |
| `usageCount` | `number`          | 使用次数（对应 FR-004 场景 2 的展示字段） |
| `rating`     | `number`          | 评分                                      |
| `components` | `DemoComponent[]` | 预设组件配置，应用模板时复制到目标问卷    |

## 6. 管理后台用户 (DemoAdminUser)

| 字段        | 类型                                 | 说明     |
| ----------- | ------------------------------------ | -------- |
| `id`        | `string`                             | 用户 UID |
| `email`     | `string`                             | 邮箱     |
| `role`      | `"user" \| "admin" \| "super_admin"` | 角色     |
| `status`    | `"active" \| "disabled"`             | 账号状态 |
| `createdAt` | `string`                             | 注册时间 |

## 7. Mock 请求映射 (MockRouteMapping)

不是持久化实体，而是 `handlers.ts` 内部的路由匹配规则，逻辑形态：

```
(method: HttpMethod, urlPattern: string) → (config: AxiosRequestConfig) => MockResponseBody
```

| 属性         | 说明                                                                 |
| ------------ | -------------------------------------------------------------------- |
| `method`     | HTTP 方法（GET/POST/PUT/DELETE）                                     |
| `urlPattern` | 路径模式，支持 `:param` 占位符（如 `/api/surveys/:id`）              |
| `resolver`   | 处理函数，读取 `data.ts` 中的静态数据并返回 `{code, msg, data}` 包体 |

**校验规则**：未匹配到任何规则的请求返回 `{code: 404, msg: "Mock 接口未实现: {method} {url}"}` 并在控制台输出 `console.warn`（对应 FR-017），不抛出异常、不导致页面崩溃。

## 实体关系图（文字描述）

```
DemoUser (1) ──has── (1) UserProfile（内嵌）
DemoUser (1) ──issues── (1) MockSession
DemoSurvey (1) ──contains── (N) DemoComponent
DemoSurvey (1) ──receives── (N) DemoResponse
DemoTemplate (1) ──seeds── (N) DemoComponent（应用模板时的初始快照，非引用关系）
DemoAdminUser (N) ── 独立列表，供管理后台 CRUD 演示，与 DemoUser 无强关联
```
