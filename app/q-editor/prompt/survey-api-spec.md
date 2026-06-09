# 问卷模块 API 技术文档

## 1. 概述

本文档描述问卷系统前端与后端之间的数据交互规范，包括 API 函数定义、数据结构、字段映射关系及使用示例。

## 2. API 函数说明

### 2.1 函数列表

| 函数名           | HTTP方法 | 端点                      | 说明         |
| ---------------- | -------- | ------------------------- | ------------ |
| `createSurvey`   | POST     | `/api/surveys`            | 创建新问卷   |
| `getSurveyById`  | GET      | `/api/surveys/:id`        | 获取问卷详情 |
| `updateSurvey`   | PUT      | `/api/surveys/:id`        | 更新问卷     |
| `deleteSurvey`   | DELETE   | `/api/surveys/:id`        | 删除问卷     |
| `submitAnswers`  | POST     | `/api/surveys/:id/submit` | 提交问卷答案 |
| `getSurveyStats` | GET      | `/api/surveys/:id/stats`  | 获取问卷统计 |
| `getSurveyList`  | GET      | `/api/surveys`            | 获取问卷列表 |

### 2.2 函数详细说明

#### 2.2.1 createSurvey

**功能**：创建新问卷并保存到数据库

**签名**：

```typescript
export const createSurvey = (data: CreateSurveyRequest): Promise<ApiResponse<CreateSurveyResponse>>
```

**参数**：`CreateSurveyRequest` 类型，详见 3.1 节

**返回值**：`ApiResponse<CreateSurveyResponse>` 类型，详见 3.2 节

**请求示例**：

```typescript
const request: CreateSurveyRequest = {
  title: "用户满意度调查",
  description: "感谢您参与本次调查",
  page_size: 10,
  is_public: 1,
  status: 1,
  components: [
    {
      type: "single_select",
      config: { title: { status: "您的年龄" }, options: { status: ["18-25", "26-35", "36-45"] } },
      order_index: 0,
      required: 1
    }
  ]
};

const response = await createSurvey(request);
```

#### 2.2.2 getSurveyById

**功能**：获取问卷完整信息，包括组件列表

**签名**：

```typescript
export const getSurveyById = (id: number): Promise<ApiResponse<SurveyDetailResponse>>
```

**参数**：

- `id`: `number` - 问卷ID

**返回值**：`ApiResponse<SurveyDetailResponse>` 类型，详见 3.3 节

#### 2.2.3 updateSurvey

**功能**：更新问卷信息

**签名**：

```typescript
export const updateSurvey = (id: number, data: Partial<CreateSurveyRequest>): Promise<ApiResponse<SurveyDetailResponse>>
```

**参数**：

- `id`: `number` - 问卷ID
- `data`: `Partial<CreateSurveyRequest>` - 更新数据（可选字段）

#### 2.2.4 deleteSurvey

**功能**：删除指定问卷及其所有组件和答案

**签名**：

```typescript
export const deleteSurvey = (id: number): Promise<ApiResponse<null>>
```

**参数**：

- `id`: `number` - 问卷ID

#### 2.2.5 submitAnswers

**功能**：用户提交问卷作答结果

**签名**：

```typescript
export const submitAnswers = (surveyId: number, data: SubmitAnswersRequest): Promise<ApiResponse<null>>
```

**参数**：

- `surveyId`: `number` - 问卷ID
- `data`: `SubmitAnswersRequest` - 答案数据，详见 3.5 节

**请求示例**：

```typescript
const request: SubmitAnswersRequest = {
  survey_id: 123,
  answers: {
    1: "选项A", // 单选题
    2: ["选项B", "选项C"], // 多选题
    3: "自由文本回答", // 填空题
    4: 5 // 评分题
  }
};

await submitAnswers(123, request);
```

#### 2.2.6 getSurveyStats

**功能**：获取问卷的作答统计信息

**签名**：

```typescript
export const getSurveyStats = (id: number): Promise<ApiResponse<SurveyStatsResponse>>
```

**参数**：

- `id`: `number` - 问卷ID

**返回值**：`ApiResponse<SurveyStatsResponse>` 类型，详见 3.6 节

#### 2.2.7 getSurveyList

**功能**：获取当前用户创建的问卷列表（分页）

**签名**：

```typescript
export const getSurveyList = (params?: { page?: number; pageSize?: number; status?: number }): Promise<ApiResponse<{ data: SurveyDetailResponse[]; total: number }>>
```

**参数**：

- `params`: 可选查询参数
  - `page`: 页码，默认 1
  - `pageSize`: 每页数量，默认 10
  - `status`: 筛选状态（0:草稿, 1:发布, 2:关闭）

---

## 3. 数据结构定义

### 3.1 CreateSurveyRequest（创建问卷请求）

| 字段名        | 类型                       | 必填 | 说明                           |
| ------------- | -------------------------- | ---- | ------------------------------ |
| `title`       | `string`                   | ✅   | 问卷标题                       |
| `description` | `string`                   | ❌   | 问卷描述                       |
| `page_size`   | `number`                   | ✅   | 每页显示数量                   |
| `is_public`   | `0 \| 1`                   | ✅   | 是否公开（0:否, 1:是）         |
| `status`      | `0 \| 1 \| 2`              | ✅   | 状态（0:草稿, 1:发布, 2:关闭） |
| `components`  | `SurveyComponentRequest[]` | ✅   | 组件列表                       |

### 3.2 CreateSurveyResponse（创建问卷响应）

| 字段名       | 类型     | 说明                |
| ------------ | -------- | ------------------- |
| `id`         | `number` | 问卷ID              |
| `title`      | `string` | 问卷标题            |
| `created_at` | `string` | 创建时间（ISO格式） |

### 3.3 SurveyDetailResponse（问卷详情响应）

| 字段名            | 类型                        | 说明                           |
| ----------------- | --------------------------- | ------------------------------ |
| `id`              | `number`                    | 问卷ID                         |
| `user_id`         | `number`                    | 创建者用户ID                   |
| `title`           | `string`                    | 问卷标题                       |
| `description`     | `string \| null`            | 问卷描述                       |
| `status`          | `number`                    | 状态（0:草稿, 1:发布, 2:关闭） |
| `page_size`       | `number`                    | 每页显示数量                   |
| `total_questions` | `number`                    | 题目总数                       |
| `responses_count` | `number`                    | 答卷数缓存                     |
| `is_public`       | `number`                    | 是否公开                       |
| `access_code`     | `string \| null`            | 访问密码                       |
| `published_at`    | `string \| null`            | 发布时间                       |
| `created_at`      | `string`                    | 创建时间                       |
| `updated_at`      | `string`                    | 更新时间                       |
| `components`      | `SurveyComponentResponse[]` | 组件列表                       |

### 3.4 SurveyComponentRequest/Response（组件数据）

| 字段名        | 类型                      | 必填         | 说明                     |
| ------------- | ------------------------- | ------------ | ------------------------ |
| `id`          | `number`                  | ❌（创建时） | 组件ID（响应中返回）     |
| `survey_id`   | `number`                  | ❌（创建时） | 关联问卷ID（响应中返回） |
| `type`        | `string`                  | ✅           | 组件类型                 |
| `config`      | `Record<string, unknown>` | ✅           | 组件配置JSON             |
| `order_index` | `number`                  | ✅           | 排序索引                 |
| `required`    | `0 \| 1`                  | ✅           | 是否必填                 |

### 3.5 SubmitAnswersRequest（提交答案请求）

| 字段名      | 类型                                           | 必填 | 说明     |
| ----------- | ---------------------------------------------- | ---- | -------- |
| `survey_id` | `number`                                       | ✅   | 问卷ID   |
| `answers`   | `Record<number, string \| number \| string[]>` | ✅   | 答案对象 |

**answers 对象结构**：

- **key**: `number` - 题目序号（从1开始）
- **value**:
  - `string` - 单选/填空题答案
  - `number` - 评分/数值题答案
  - `string[]` - 多选题答案（多选时返回选项数组）

### 3.6 SurveyStatsResponse（统计响应）

| 字段名            | 类型              | 说明               |
| ----------------- | ----------------- | ------------------ |
| `survey_id`       | `number`          | 问卷ID             |
| `total_responses` | `number`          | 总答卷数           |
| `avg_duration`    | `number`          | 平均完成时间（秒） |
| `question_stats`  | `QuestionStats[]` | 各题统计           |

### 3.7 QuestionStats（题目统计）

| 字段名                | 类型                                  | 说明                 |
| --------------------- | ------------------------------------- | -------------------- |
| `question_index`      | `number`                              | 题目序号             |
| `question_type`       | `string`                              | 题目类型             |
| `answered_count`      | `number`                              | 作答人数             |
| `skipped_count`       | `number`                              | 未作答人数           |
| `option_distribution` | `Record<string, number> \| undefined` | 选项分布（仅选择题） |

---

## 4. 字段映射关系

### 4.1 前端组件状态到后端配置映射

| 前端字段路径          | 后端字段                | 说明                  |
| --------------------- | ----------------------- | --------------------- |
| `com.type`            | `component.type`        | 组件类型标识          |
| `com.status`          | `component.config`      | 完整组件配置JSON      |
| `index`（数组索引）   | `component.order_index` | 排序索引              |
| `com.status.required` | `component.required`    | 必填标记（转换为0/1） |

### 4.2 数据库表字段映射

**Survey 表**：

| 前端请求字段  | 数据库字段        | 类型         |
| ------------- | ----------------- | ------------ |
| `title`       | `title`           | VARCHAR(255) |
| `description` | `description`     | TEXT         |
| `page_size`   | `page_size`       | INT          |
| `is_public`   | `is_public`       | TINYINT      |
| `status`      | `status`          | TINYINT      |
| -（自动）     | `user_id`         | BIGINT       |
| -（自动）     | `total_questions` | INT          |
| -（自动）     | `responses_count` | INT          |

**SurveyComponent 表**：

| 前端请求字段  | 数据库字段    | 类型        |
| ------------- | ------------- | ----------- |
| `type`        | `type`        | VARCHAR(50) |
| `config`      | `config`      | JSON        |
| `order_index` | `order_index` | INT         |
| `required`    | `required`    | TINYINT     |
| -（自动）     | `survey_id`   | BIGINT      |

---

## 5. 数据序列化方案

### 5.1 前端组件序列化

使用工具函数 `serializeComponents` 将编辑器组件数组转换为后端格式：

```typescript
export const serializeComponents = (
  coms: Array<{ type: string; status: Record<string, unknown> }>
): SurveyComponentRequest[] =>
  coms.map((com, index) => ({
    type: com.type,
    config: com.status,
    order_index: index,
    required: (com.status as Record<string, unknown>)?.required ? 1 : 0
  }));
```

**使用示例**：

```typescript
import { serializeComponents, createSurvey } from "@/api/modules/survey";

// 从编辑器store获取组件
const { coms, pageSize } = useEditorStore();

// 序列化组件
const components = serializeComponents(coms);

// 构建请求
const request: CreateSurveyRequest = {
  title: "未命名问卷",
  description: "",
  page_size: pageSize,
  is_public: 1,
  status: 1,
  components
};

// 发送请求
const response = await createSurvey(request);
console.log("问卷ID:", response.data.id);
```

### 5.2 答案序列化

```typescript
// 前端答案数据结构
const answers: Ref<Record<number, string | number | string[]>> = ref({});

// 提交时直接传递给API
await submitAnswers(surveyId, {
  survey_id: surveyId,
  answers: answers.value
});
```

---

## 6. 错误处理与数据验证

### 6.1 请求头设置

`serverClient` 自动处理以下请求头：

| 请求头          | 值                     | 设置方式       |
| --------------- | ---------------------- | -------------- |
| `Authorization` | `Bearer {accessToken}` | 拦截器自动附加 |
| `Content-Type`  | `application/json`     | axios 默认设置 |

### 6.2 错误处理策略

```typescript
try {
  const response = await createSurvey(request);
  // 成功处理
} catch (error) {
  // 错误处理
  if (error.response?.status === 401) {
    // Token 过期，已由拦截器自动处理
  } else if (error.response?.status === 403) {
    ElMessage.error("权限不足");
  } else if (error.response?.status === 422) {
    // 数据验证失败
    ElMessage.error(error.response.data.message || "数据格式错误");
  } else {
    ElMessage.error("操作失败，请稍后重试");
  }
}
```

### 6.3 数据验证规则

**问卷创建验证**：

- `title`: 必填，最大长度 255
- `page_size`: 必填，范围 1-100
- `components`: 必填，至少包含一个组件
- `components[].type`: 必填，有效组件类型

**答案提交验证**：

- `survey_id`: 必填，有效问卷ID
- `answers`: 必填，非空对象
- 答案值类型必须与题目类型匹配

---

## 7. API 调用示例

### 7.1 创建问卷完整示例

```typescript
import { CreateSurveyRequest, createSurvey } from "@/api/modules/survey";
import { ElMessage } from "element-plus";

const createNewSurvey = async (title: string, components: Array<{ type: string; status: Record<string, unknown> }>) => {
  try {
    const request: CreateSurveyRequest = {
      title,
      description: "",
      page_size: 10,
      is_public: 1,
      status: 1,
      components: components.map((com, index) => ({
        type: com.type,
        config: com.status,
        order_index: index,
        required: 1
      }))
    };

    const response = await createSurvey(request);

    if (response.code === 200) {
      ElMessage.success("问卷创建成功");
      return response.data.id;
    } else {
      ElMessage.error(response.message || "创建失败");
    }
  } catch (error) {
    ElMessage.error("网络错误，请稍后重试");
    console.error("Create survey error:", error);
  }
};
```

### 7.2 提交答案完整示例

```typescript
import { SubmitAnswersRequest, submitAnswers } from "@/api/modules/survey";
import { ElMessage } from "element-plus";

const handleSubmitAnswers = async (surveyId: number, answers: Record<number, string | number | string[]>) => {
  try {
    const request: SubmitAnswersRequest = {
      survey_id: surveyId,
      answers
    };

    const response = await submitAnswers(surveyId, request);

    if (response.code === 200) {
      ElMessage.success("提交成功");
    } else {
      ElMessage.error(response.message || "提交失败");
    }
  } catch (error) {
    ElMessage.error("提交失败，请稍后重试");
    console.error("Submit answers error:", error);
  }
};
```

---

## 8. 安全注意事项

1. **Token 认证**：所有问卷操作均通过 `serverClient` 自动携带 JWT Token
2. **数据加密**：敏感数据（如访问密码）需在传输层加密（HTTPS）
3. **输入验证**：后端需对所有输入进行严格验证，防止 SQL 注入和 XSS 攻击
4. **权限控制**：后端需验证用户对问卷的操作权限（创建者才能修改/删除）
5. **防重提交**：答案提交接口需考虑幂等性，防止重复提交

---

## 9. 版本历史

| 版本 | 日期       | 修改内容 |
| ---- | ---------- | -------- |
| v1.0 | 2024-01-01 | 初始版本 |
