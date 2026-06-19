# 前端未对接后端接口需求文档

> 版本：1.0  
> 日期：2026-06-18  
> 来源：`app/q-editor` 前端项目全量扫描  
> 目标：`app/q-server` 后端开发

---

## 目录

1. [扫描结果总览](#1-扫描结果总览)
2. [模块一：AI 问卷生成](#2-模块一ai-问卷生成)
3. [模块二：AI 润色](#3-模块二ai-润色)
4. [模块三：模板市场](#4-模块三模板市场)
5. [模块四：审核管理](#5-模块四审核管理)
6. [模块五：远程同步](#6-模块五远程同步)
7. [模块六：个人设置](#7-模块六个人设置)
8. [模块七：权限列表](#8-模块七权限列表)
9. [附录：统一规范](#9-附录统一规范)

---

## 1. 扫描结果总览

对 `d:\coding\project\questionnaireSys\app\q-editor\src` 进行全量扫描，共识别出 **7 个模块**未对接真实后端接口，涉及 **14 个接口**。

| 序号 | 模块        | 前端位置                                      | 当前状态                | 优先级 |
| ---- | ----------- | --------------------------------------------- | ----------------------- | ------ |
| 1    | AI 问卷生成 | `Header.vue` `onAiSubmit()`                   | TODO 占位 + 空校验      | 高     |
| 2    | AI 润色     | `Header.vue` 按钮 disabled                    | 按钮仅展示，无交互      | 中     |
| 3    | 模板市场    | `LeftSide/Index.vue` `switchTemplateMarket()` | 空函数，无路由跳转      | 高     |
| 4    | 审核管理    | `ReviewNotice.vue` / `preview/index.vue`      | mock 假数据 + 全部 TODO | 高     |
| 5    | 远程同步    | `Layout/index.vue` `syncSurvey()`             | 模拟延迟 + 本地状态更新 | 高     |
| 6    | 个人设置    | `UserProfile.vue` `onSettings()`              | 空函数                  | 低     |
| 7    | 权限列表    | `directives/permiss.ts` 数组模式              | TODO 注释               | 低     |

> **注**：问卷 CRUD（`/api/surveys`）、用户模块（`/api/user/*`、`/api/admin/users/*`）、认证模块（`/api/auth/*`）已在 `src/api/modules/` 中定义了前端 API 客户端，对应接口规范见 `prompt/survey-api-spec.md` 和 `doc/user/auth-api.md`。本文档仅列出**尚未在前端定义 API 客户端**的新增接口需求。

---

## 2. 模块一：AI 问卷生成

### 2.1 前端现状

- **位置**：`src/components/Common/Header.vue` 第 155-164 行，`onAiSubmit()` 函数
- **触发方式**：编辑器顶部"AI一键生成"按钮 → popover 下拉框 → 用户输入需求描述 → 点击"提交"
- **当前行为**：仅校验空输入后显示成功提示，无实际 AI 调用
- **关联组件**：`src/extension/components/AI-GenPanel.vue`（空壳组件，预留展示 AI 生成结果）

### 2.2 业务逻辑

```
用户输入需求描述（如"生成一份关于咖啡消费习惯的问卷"）
  → 前端调用 AI 生成接口，传入描述文本 + 当前问卷上下文
  → 后端调用 LLM 生成结构化问卷组件（Status[] 格式）
  → 返回生成的组件列表
  → 前端将组件添加到编辑器 coms 数组中
```

### 2.3 接口定义

#### POST /api/ai/generate

**功能**：根据自然语言描述生成问卷组件

**请求头**：

```
Authorization: Bearer <access_token>
```

**请求体**：

| 字段名                        | 类型     | 必填 | 说明                                          |
| ----------------------------- | -------- | ---- | --------------------------------------------- |
| `prompt`                      | `string` | 是   | 用户输入的需求描述，最大 2000 字符            |
| `context`                     | `object` | 否   | 当前问卷上下文，用于续写/补全场景             |
| `context.survey_id`           | `number` | 否   | 当前问卷 ID（续写场景）                       |
| `context.existing_components` | `array`  | 否   | 已有组件类型列表，用于避免重复生成            |
| `locale`                      | `string` | 否   | 生成语言，默认 `zh-CN`，可选 `en-US`、`ja-JP` |

**请求示例**：

```json
{
  "prompt": "生成一份关于大学生就业意向的调查问卷，包含5道选择题和1道填空题",
  "context": {
    "existing_components": ["single_select", "text_input"]
  },
  "locale": "zh-CN"
}
```

**响应体**：

| 字段名                         | 类型                       | 说明                   |
| ------------------------------ | -------------------------- | ---------------------- |
| `code`                         | `number`                   | 状态码，0=成功         |
| `msg`                          | `string`                   | 提示信息               |
| `data`                         | `object`                   | 响应数据               |
| `data.components`              | `SurveyComponentPayload[]` | 生成的问卷组件列表     |
| `data.usage`                   | `object`                   | Token 用量统计（可选） |
| `data.usage.prompt_tokens`     | `number`                   | 输入 token 数          |
| `data.usage.completion_tokens` | `number`                   | 输出 token 数          |

**响应示例**：

```json
{
  "code": 0,
  "msg": "生成成功",
  "data": {
    "components": [
      {
        "type": "single_select",
        "config": {
          "title": { "status": "您的学历是？" },
          "options": { "status": ["高中及以下", "大专", "本科", "硕士", "博士"] }
        },
        "order_index": 0,
        "required": 1
      },
      {
        "type": "text_input",
        "config": {
          "title": { "status": "您期望的薪资范围是？" }
        },
        "order_index": 1,
        "required": 0
      }
    ],
    "usage": {
      "prompt_tokens": 150,
      "completion_tokens": 320
    }
  }
}
```

**错误码**：

| code  | 说明                      |
| ----- | ------------------------- |
| 0     | 成功                      |
| 40001 | prompt 为空或超过长度限制 |
| 40002 | AI 服务不可用             |
| 40003 | 生成失败（LLM 返回异常）  |
| 50000 | 服务器内部错误            |

### 2.4 业务规则

1. `prompt` 长度限制 1-2000 字符，需在前端和后端双重校验
2. 生成的组件必须符合 `SurveyComponentPayload` 格式（与问卷创建接口 `components` 字段一致）
3. 生成结果需包含 `order_index` 递增序号
4. 若 `context.existing_components` 非空，应避免生成重复类型的题目
5. 每次请求为独立会话，不保持对话历史

---

## 3. 模块二：AI 润色

### 3.1 前端现状

- **位置**：`src/components/Common/Header.vue` 第 30 行，`el-button plain disabled` 按钮
- **当前行为**：按钮处于 `disabled` 状态，仅做 UI 展示，无任何交互逻辑

### 3.2 业务逻辑

```
用户选中编辑器中的某个组件
  → 点击"AI润色"按钮
  → 前端将该组件的当前配置发送到后端
  → 后端调用 LLM 优化题目文案、选项措辞等
  → 返回优化后的组件配置
  → 前端替换当前组件的配置
```

### 3.3 接口定义

#### POST /api/ai/polish

**功能**：AI 润色单个问卷组件的内容

**请求头**：

```
Authorization: Bearer <access_token>
```

**请求体**：

| 字段名        | 类型                     | 必填 | 说明                                 |
| ------------- | ------------------------ | ---- | ------------------------------------ |
| `component`   | `SurveyComponentPayload` | 是   | 待润色的组件数据                     |
| `instruction` | `string`                 | 否   | 额外润色指令，如"更正式"、"更口语化" |
| `locale`      | `string`                 | 否   | 目标语言，默认 `zh-CN`               |

**请求示例**：

```json
{
  "component": {
    "type": "single_select",
    "config": {
      "title": { "status": "你觉得咋样" },
      "options": { "status": ["好", "还行", "不好"] }
    },
    "order_index": 0,
    "required": 1
  },
  "instruction": "更正式",
  "locale": "zh-CN"
}
```

**响应体**：

| 字段名           | 类型                     | 说明             |
| ---------------- | ------------------------ | ---------------- |
| `code`           | `number`                 | 0=成功           |
| `msg`            | `string`                 | 提示信息         |
| `data`           | `object`                 | 响应数据         |
| `data.component` | `SurveyComponentPayload` | 润色后的组件数据 |

**响应示例**：

```json
{
  "code": 0,
  "msg": "润色成功",
  "data": {
    "component": {
      "type": "single_select",
      "config": {
        "title": { "status": "您对本次服务的整体满意度如何？" },
        "options": { "status": ["非常满意", "比较满意", "一般", "不太满意", "非常不满意"] }
      },
      "order_index": 0,
      "required": 1
    }
  }
}
```

### 3.4 业务规则

1. 仅润色文本内容（标题、描述、选项文案），不改变组件类型、结构、`order_index`、`required` 等元数据
2. 若 `instruction` 为空，默认进行通用文案优化（更清晰、更专业）
3. 保留原始语言风格，不改变语种

---

## 4. 模块三：模板市场

### 4.1 前端现状

- **模板市场入口**：`src/views/EditorView/LeftSide/Index.vue` 第 57 行，`switchTemplateMarket()` 空函数
- **申请共享模板**：`src/components/Common/Header.vue` 第 169 行，`onApplyShareTemplate()` 空函数
- **当前行为**：两个按钮均无实际功能，无路由跳转，无 API 调用

### 4.2 业务逻辑

**模板市场浏览**：

```
用户点击"模板市场"导航
  → 进入模板市场页面（需新建路由/Tab）
  → 展示模板列表（分类、搜索、分页）
  → 用户可预览模板内容
  → 用户可将模板应用到当前编辑器
```

**申请共享模板**：

```
用户在编辑器中完成问卷设计
  → 点击"申请共享模板"按钮
  → 弹出表单：模板名称、分类、描述、是否公开
  → 提交后，问卷的 coms 数据作为模板内容上传
  → 管理员审核通过后模板进入市场
```

### 4.3 接口定义

#### 4.3.1 GET /api/templates — 获取模板列表

**请求头**：

```
Authorization: Bearer <access_token>
```

**查询参数**：

| 参数名      | 类型     | 必填 | 说明                                               |
| ----------- | -------- | ---- | -------------------------------------------------- |
| `page`      | `number` | 否   | 页码，默认 1                                       |
| `page_size` | `number` | 否   | 每页条数，默认 20，最大 50                         |
| `category`  | `string` | 否   | 分类筛选（如 `education`、`market`、`hr`）         |
| `keyword`   | `string` | 否   | 标题关键词搜索                                     |
| `sort`      | `string` | 否   | 排序方式：`newest`（默认）、`popular`、`downloads` |

**响应体**：

| 字段名           | 类型             | 说明     |
| ---------------- | ---------------- | -------- |
| `code`           | `number`         | 0=成功   |
| `data.list`      | `TemplateItem[]` | 模板列表 |
| `data.total`     | `number`         | 总数     |
| `data.page`      | `number`         | 当前页码 |
| `data.page_size` | `number`         | 每页条数 |

**TemplateItem 结构**：

| 字段名           | 类型     | 说明                                 |
| ---------------- | -------- | ------------------------------------ |
| `id`             | `number` | 模板 ID                              |
| `title`          | `string` | 模板名称                             |
| `description`    | `string` | 模板描述                             |
| `category`       | `string` | 分类                                 |
| `cover_url`      | `string` | 封面图 URL                           |
| `question_count` | `number` | 题目数量                             |
| `download_count` | `number` | 使用次数                             |
| `rating`         | `number` | 评分（0-5）                          |
| `author_name`    | `string` | 作者昵称                             |
| `status`         | `string` | `approved` 已上架 / `pending` 审核中 |
| `created_at`     | `string` | 创建时间 ISO 格式                    |

#### 4.3.2 GET /api/templates/:id — 获取模板详情

**响应体**：`TemplateItem` 基础上增加 `components: SurveyComponentPayload[]`

#### 4.3.3 POST /api/templates — 申请共享模板

**请求体**：

| 字段名        | 类型                       | 必填 | 说明                    |
| ------------- | -------------------------- | ---- | ----------------------- |
| `title`       | `string`                   | 是   | 模板名称，最大 100 字符 |
| `description` | `string`                   | 否   | 模板描述，最大 500 字符 |
| `category`    | `string`                   | 是   | 分类                    |
| `components`  | `SurveyComponentPayload[]` | 是   | 问卷组件数据            |
| `page_size`   | `number`                   | 否   | 每页显示数量，默认 10   |

**响应体**：

| 字段名        | 类型     | 说明             |
| ------------- | -------- | ---------------- |
| `code`        | `number` | 0=成功           |
| `data.id`     | `number` | 模板 ID          |
| `data.status` | `string` | `pending` 待审核 |

#### 4.3.4 POST /api/templates/:id/apply — 应用模板到问卷

**功能**：将模板的组件数据应用到用户的问卷中（创建新问卷或追加到现有问卷）

**请求体**：

| 字段名             | 类型     | 必填 | 说明                                      |
| ------------------ | -------- | ---- | ----------------------------------------- |
| `target_survey_id` | `number` | 否   | 目标问卷 ID（追加模式）；不传则创建新问卷 |
| `mode`             | `string` | 否   | `append` 追加（默认）/ `replace` 替换     |

**响应体**：

| 字段名            | 类型                       | 说明             |
| ----------------- | -------------------------- | ---------------- |
| `code`            | `number`                   | 0=成功           |
| `data.survey_id`  | `number`                   | 目标问卷 ID      |
| `data.components` | `SurveyComponentPayload[]` | 应用后的组件列表 |

### 4.4 业务规则

1. **模板分类枚举**：`education`(教育)、`market`(市场调研)、`hr`(人力资源)、`customer`(客户服务)、`event`(活动报名)、`other`(其他)
2. 申请共享模板时，`components` 的 `order_index` 由后端重新编排，忽略前端传入值
3. 应用模板时，若 `mode=append`，`order_index` 从目标问卷现有最大序号 +1 开始
4. 模板应用成功后，`download_count` +1

---

## 5. 模块四：审核管理

### 5.1 前端现状

- **审核通知**：`src/components/Common/ReviewNotice.vue`，使用 mock 假数据，所有操作函数均为 TODO
- **提交审核**：`src/views/preview/index.vue` 第 117 行，`handleSubmitReview()` 空函数
- **当前行为**：下拉框展示 5 条假数据（模拟 600ms 延迟），撤销/查看详情/编辑按钮仅打印日志

### 5.2 业务逻辑

**提交审核**：

```
用户在预览页面点击"提交审核"
  → 前端调用提交审核接口，传入问卷 ID
  → 后端创建审核记录，状态为 in_progress
  → 通知管理员有新的审核申请
```

**审核通知**：

```
用户点击铃铛图标
  → 前端调用审核记录列表接口（按当前用户筛选）
  → 展示审核记录列表（问卷ID、标题、状态标签）
  → 显示"流程中"数量角标
  → 用户可操作：撤销审核、查看详情、编辑问卷
```

**审核状态流转**：

```
in_progress（审核中） → approved（已通过） / violated（违规，打回修改）
```

### 5.3 接口定义

#### 5.3.1 POST /api/reviews — 提交审核

**请求头**：

```
Authorization: Bearer <access_token>
```

**请求体**：

| 字段名      | 类型     | 必填 | 说明                    |
| ----------- | -------- | ---- | ----------------------- |
| `survey_id` | `number` | 是   | 问卷 ID                 |
| `message`   | `string` | 否   | 附加说明，最大 500 字符 |

**响应体**：

| 字段名            | 类型     | 说明          |
| ----------------- | -------- | ------------- |
| `code`            | `number` | 0=成功        |
| `data.id`         | `number` | 审核记录 ID   |
| `data.status`     | `string` | `in_progress` |
| `data.created_at` | `string` | 创建时间      |

**错误码**：

| code  | 说明                 |
| ----- | -------------------- |
| 40010 | 问卷不存在           |
| 40011 | 问卷已有审核中的记录 |
| 40012 | 问卷尚未保存         |

#### 5.3.2 GET /api/reviews — 获取审核记录列表

**查询参数**：

| 参数名      | 类型     | 必填 | 说明                                              |
| ----------- | -------- | ---- | ------------------------------------------------- |
| `status`    | `string` | 否   | 筛选状态：`in_progress` / `approved` / `violated` |
| `page`      | `number` | 否   | 页码，默认 1                                      |
| `page_size` | `number` | 否   | 每页条数，默认 20                                 |

**响应体**：

| 字段名                   | 类型             | 说明                   |
| ------------------------ | ---------------- | ---------------------- |
| `code`                   | `number`         | 0=成功                 |
| `data.list`              | `ReviewRecord[]` | 审核记录列表           |
| `data.total`             | `number`         | 总数                   |
| `data.in_progress_count` | `number`         | 流程中数量（用于角标） |

**ReviewRecord 结构**：

| 字段名           | 类型     | 说明                                    |
| ---------------- | -------- | --------------------------------------- |
| `id`             | `number` | 审核记录 ID                             |
| `survey_id`      | `number` | 问卷 ID                                 |
| `survey_title`   | `string` | 问卷标题                                |
| `status`         | `string` | `in_progress` / `approved` / `violated` |
| `message`        | `string` | 提交时附加说明                          |
| `review_comment` | `string` | 审核意见（通过/违规时填写）             |
| `reviewed_by`    | `string` | 审核人昵称                              |
| `created_at`     | `string` | 提交时间                                |
| `updated_at`     | `string` | 审核时间                                |

#### 5.3.3 POST /api/reviews/:id/revoke — 撤销审核

**功能**：申请人撤销自己提交的审核申请

**响应体**：

```json
{
  "code": 0,
  "msg": "撤销成功"
}
```

**错误码**：

| code  | 说明                                        |
| ----- | ------------------------------------------- |
| 40020 | 审核记录不存在                              |
| 40021 | 当前状态不允许撤销（仅 in_progress 可撤销） |
| 40022 | 非申请人，无权撤销                          |

#### 5.3.4 GET /api/reviews/:id — 获取审核详情

**响应体**：`ReviewRecord` 完整结构

### 5.4 业务规则

1. 同一问卷同时只能有一个 `in_progress` 状态的审核记录
2. 仅审核申请人可撤销自己的审核（`in_progress` 状态）
3. 审核通过（`approved`）或违规（`violated`）后不可撤销
4. 审核记录列表仅返回当前用户的记录（普通用户）或所有记录（管理员）
5. 审核结果变更时，后端需通过某种方式通知前端（轮询 / WebSocket 待定）

---

## 6. 模块五：远程同步

### 6.1 前端现状

- **位置**：`src/views/Layout/index.vue` 第 194 行，`syncSurvey()` 函数
- **当前行为**：模拟 800ms 延迟后更新本地 IndexedDB 的 `syncStatus` 字段为 `synced`
- **触发方式**：问卷列表页表格中每行的"同步"按钮

### 6.2 业务逻辑

```
用户点击"同步"按钮
  → 前端从 IndexedDB 读取问卷完整数据
  → 调用远程同步接口上传
  → 后端判断问卷是否已存在：
    - 不存在：创建新问卷
    - 已存在：更新问卷数据
  → 返回服务端问卷 ID
  → 前端更新本地 syncStatus 为 synced，记录服务端 ID
```

### 6.3 接口定义

> **注**：该接口与已有的 `POST /api/surveys`（创建）和 `PUT /api/surveys/:id`（更新）功能重叠。建议不新增独立接口，而是在前端 `syncSurvey()` 中编排现有接口：
>
> 1. 检查本地是否有 `remote_survey_id` → 有则调用 `updateSurvey`，无则调用 `createSurvey`
> 2. 返回的 `survey_id` 存储到本地 IndexedDB 的 `remote_survey_id` 字段

**需要的改动**：

| 项目                | 说明                                                  |
| ------------------- | ----------------------------------------------------- |
| `SurveyDBData` 类型 | 新增 `remote_survey_id?: number` 字段                 |
| `syncSurvey()` 函数 | 替换 mock 逻辑为实际 API 调用编排                     |
| 同步状态            | `syncStatus` 根据 `remote_survey_id` 是否存在自动判断 |

**编排逻辑**：

```
syncSurvey(surveyInfo) {
  if (surveyInfo.remote_survey_id) {
    // 已同步过 → 调用 PUT /api/surveys/:id 更新
    await updateSurvey(surveyInfo.remote_survey_id, { ... })
  } else {
    // 首次同步 → 调用 POST /api/surveys 创建
    const res = await createSurvey({ ... })
    // 保存 remote_survey_id
    await updateSurveyById(surveyInfo.id, {
      remote_survey_id: res.data.survey_id,
      syncStatus: 'synced'
    })
  }
}
```

### 6.4 业务规则

1. `SurveyDBData` 需新增 `remote_survey_id?: number` 字段，记录服务端问卷 ID
2. 同步时需将 `coms` 数组序列化为 `SurveyComponentPayload[]`（复用 `serializeComponents` 工具函数）
3. 同步成功后 `syncStatus` 更新为 `synced`，本地编辑后置为 `unsynced`
4. 同步失败不阻塞本地操作，保留 `unsynced` 状态供用户重试

---

## 7. 模块六：个人设置

### 7.1 前端现状

- **位置**：`src/components/Common/UserProfile.vue` 第 137 行，`onSettings()` 空函数
- **触发方式**：用户头像下拉菜单 → "个人设置"菜单项
- **当前行为**：点击无任何响应

### 7.2 业务逻辑

```
用户点击"个人设置"
  → 进入个人设置页面/弹窗
  → 可修改：用户名、头像、密码
  → 保存后调用更新接口
```

### 7.3 接口定义

> **注**：用户信息更新已有 `PUT /api/user/update` 接口（见 `src/api/modules/user/index.ts`）。此处需新增头像上传接口。

#### POST /api/user/avatar — 上传头像

**请求头**：

```
Authorization: Bearer <access_token>
Content-Type: multipart/form-data
```

**请求体**（form-data）：

| 字段名 | 类型   | 必填 | 说明                                      |
| ------ | ------ | ---- | ----------------------------------------- |
| `file` | `File` | 是   | 图片文件，支持 jpg/png/gif/webp，最大 5MB |

**响应体**：

| 字段名     | 类型     | 说明         |
| ---------- | -------- | ------------ |
| `code`     | `number` | 0=成功       |
| `data.url` | `string` | 头像访问 URL |

**响应示例**：

```json
{
  "code": 0,
  "msg": "上传成功",
  "data": {
    "url": "https://cdn.example.com/avatars/user_123_1718000000.jpg"
  }
}
```

### 7.4 业务规则

1. 头像文件大小限制 5MB
2. 支持格式：jpg、jpeg、png、gif、webp
3. 上传后自动替换旧头像（旧文件异步删除）
4. 头像 URL 需同步更新到 `user.avatar` 字段

---

## 8. 模块七：权限列表

### 8.1 前端现状

- **位置**：`src/directives/permiss.ts` 第 66 行，数组模式权限匹配 `TODO`
- **当前行为**：仅支持角色字符串匹配（`v-permiss="'admin'"`），数组模式（`v-permiss="['survey:create']"`）预留未实现

### 8.2 业务逻辑

```
用户登录后或页面加载时
  → 前端调用权限列表接口
  → 返回当前用户拥有的权限编码列表
  → 存储到 Pinia userStore
  → v-permiss 指令的数组模式根据权限列表进行匹配
```

### 8.3 接口定义

#### GET /api/user/permissions — 获取当前用户权限列表

**请求头**：

```
Authorization: Bearer <access_token>
```

**响应体**：

| 字段名             | 类型       | 说明         |
| ------------------ | ---------- | ------------ |
| `code`             | `number`   | 0=成功       |
| `data.role`        | `string`   | 用户角色     |
| `data.permissions` | `string[]` | 权限编码列表 |

**权限编码枚举**（参考）：

| 编码              | 说明     |
| ----------------- | -------- |
| `survey:create`   | 创建问卷 |
| `survey:edit`     | 编辑问卷 |
| `survey:delete`   | 删除问卷 |
| `survey:publish`  | 发布问卷 |
| `survey:review`   | 审核问卷 |
| `user:manage`     | 用户管理 |
| `template:create` | 创建模板 |
| `template:review` | 审核模板 |
| `system:config`   | 系统配置 |

**响应示例**：

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "role": "admin",
    "permissions": ["survey:create", "survey:edit", "survey:delete", "survey:publish", "template:create"]
  }
}
```

### 8.4 业务规则

1. `super_admin` 角色默认拥有所有权限，不需要显式返回权限列表
2. 权限列表在用户登录后立即获取并缓存，Token 刷新时重新获取
3. 前端 `v-permiss` 数组模式匹配逻辑：`permissions.includes(targetPermission)`

---

## 9. 附录：统一规范

### 9.1 通用响应格式

所有接口统一使用 `ApiResponse<T>` 格式：

```typescript
interface ApiResponse<T> {
  code: number; // 0=成功，非0=失败
  msg: string; // 提示信息
  data: T; // 业务数据
}
```

### 9.2 通用错误码

| code  | 说明                |
| ----- | ------------------- |
| 0     | 成功                |
| 40001 | 参数校验失败        |
| 40100 | 未登录或 Token 过期 |
| 40300 | 无权限              |
| 40400 | 资源不存在          |
| 42900 | 请求过于频繁        |
| 50000 | 服务器内部错误      |

### 9.3 认证方式

所有接口均需携带 `Authorization: Bearer <access_token>` 请求头（除特殊说明外）。

### 9.4 分页规范

分页接口统一使用以下参数和响应字段：

| 参数        | 类型     | 说明            |
| ----------- | -------- | --------------- |
| `page`      | `number` | 页码，从 1 开始 |
| `page_size` | `number` | 每页条数        |

| 响应字段    | 类型     | 说明     |
| ----------- | -------- | -------- |
| `list`      | `array`  | 数据列表 |
| `total`     | `number` | 总记录数 |
| `page`      | `number` | 当前页码 |
| `page_size` | `number` | 每页条数 |

### 9.5 接口清单汇总

| 序号 | 方法 | 路径                       | 模块     | 说明                          |
| ---- | ---- | -------------------------- | -------- | ----------------------------- |
| 1    | POST | `/api/ai/generate`         | AI 生成  | AI 生成问卷组件               |
| 2    | POST | `/api/ai/polish`           | AI 润色  | AI 润色组件内容               |
| 3    | GET  | `/api/templates`           | 模板市场 | 获取模板列表                  |
| 4    | GET  | `/api/templates/:id`       | 模板市场 | 获取模板详情                  |
| 5    | POST | `/api/templates`           | 模板市场 | 申请共享模板                  |
| 6    | POST | `/api/templates/:id/apply` | 模板市场 | 应用模板                      |
| 7    | POST | `/api/reviews`             | 审核管理 | 提交审核                      |
| 8    | GET  | `/api/reviews`             | 审核管理 | 获取审核列表                  |
| 9    | GET  | `/api/reviews/:id`         | 审核管理 | 获取审核详情                  |
| 10   | POST | `/api/reviews/:id/revoke`  | 审核管理 | 撤销审核                      |
| 11   | —    | `/api/surveys`（复用）     | 远程同步 | 创建/更新问卷（编排现有接口） |
| 12   | POST | `/api/user/avatar`         | 个人设置 | 上传头像                      |
| 13   | GET  | `/api/user/permissions`    | 权限列表 | 获取权限列表                  |

### 9.6 前端待改造项

| 文件                                      | 改造内容                                                                                                                                               |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/components/Common/Header.vue`        | `onAiSubmit()` 对接 `POST /api/ai/generate`；`onApplyShareTemplate()` 对接 `POST /api/templates`；AI润色按钮解除 disabled 并对接 `POST /api/ai/polish` |
| `src/views/EditorView/LeftSide/Index.vue` | `switchTemplateMarket()` 实现路由跳转                                                                                                                  |
| `src/components/Common/ReviewNotice.vue`  | 替换 mock 数据为 `GET /api/reviews`；`onRevoke`/`onViewDetail`/`onEdit` 对接真实接口                                                                   |
| `src/views/preview/index.vue`             | `handleSubmitReview()` 对接 `POST /api/reviews`                                                                                                        |
| `src/views/Layout/index.vue`              | `syncSurvey()` 编排 `createSurvey`/`updateSurvey`；`SurveyDBData` 新增 `remote_survey_id`                                                              |
| `src/components/Common/UserProfile.vue`   | `onSettings()` 实现设置页面跳转                                                                                                                        |
| `src/stores/useUser.ts`                   | 新增 `permissions` 字段，登录后调用 `GET /api/user/permissions`                                                                                        |
| `src/directives/permiss.ts`               | 数组模式对接 `permissions` 列表                                                                                                                        |
| `src/api/modules/`                        | 新增 `ai.ts`、`template.ts`、`review.ts` 三个 API 模块                                                                                                 |
