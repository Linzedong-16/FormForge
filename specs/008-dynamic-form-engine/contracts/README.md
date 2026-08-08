# Phase 1 接口契约：低代码问卷动态表单引擎

**输入**：[data-model.md](../data-model.md) · **对齐**：`app/q-server/src/modules/survey/survey-crud/survey-crud.routes.ts`

本目录记录本功能新增/变更的 q-server REST 接口契约。全部接口沿用项目既有统一响应封装（`app/q-server/src/utils/response.ts`）：

```ts
interface ApiResponse<T> {
  data: T | null;
  code: number; // 0 = 成功；非 0 时对应 BizCode 或标准 HTTP 语义状态码
  msg: string;
}
```

成功响应统一通过 `reply.sendSuccess(data, msg?)` 产出；业务错误统一通过 `throw new AppError(message, httpStatus, bizCode?)` 抛出，由全局错误处理器转换为 `sendFail` 风格的 `{code, msg}`。本功能新增的业务错误码见下方各文件的 BizCode 章节，统一落在 `BizCode` 枚举的 **6xxx（规则校验）** 新区段，不与既有 1xxx（认证）/2xxx（用户）/3xxx（问卷文件）/4xxx（AI/RAG）/5xxx（消息系统）区段冲突。

## 文件索引

- [survey-components.contract.md](./survey-components.contract.md) — 问卷保存接口（`PUT /api/surveys/:id`）新增 `client_key`/`logic` 字段
- [survey-publish.contract.md](./survey-publish.contract.md) — 发布接口（`POST /api/surveys/:id/publish`）新增规则校验拦截；新增预检接口 `POST /api/surveys/:id/validate-rules`
- [survey-responses.contract.md](./survey-responses.contract.md) — 提交答卷接口（`POST /api/surveys/:surveyId/responses`）新增 `answer_status` 字段

## 未变更的既有接口

`GET /api/surveys`、`GET /api/surveys/:id`、`DELETE /api/surveys/:id`、`POST /api/surveys/:id/close`、`POST /api/surveys/:id/submit-review`、`POST /api/surveys/:id/apply-template`、`POST /api/surveys/:id/generate-link`、`GET /api/surveys/:id/public`、`GET /api/surveys/:surveyId/token`、`GET /api/surveys/:surveyId/responses`、`GET /api/responses/:id`、`DELETE /api/responses/:id` 均不受本功能影响——响应体新增字段（`client_key`/`logic`/`answer_status`）以可选字段形式随既有序列化路径自然透出，不需要单独契约说明。
