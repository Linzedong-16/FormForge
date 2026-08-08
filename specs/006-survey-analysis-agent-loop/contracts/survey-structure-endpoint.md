# Contract: q-server 新增接口 — GET /api/admin/surveys/:id

**对应**：spec.md 附录 A 卡点 2 | FR-012 | research.md R6

## 背景

现状 `GET /api/surveys/:id`（`survey-crud.routes.ts`）要求用户级 JWT（`authenticate`），且内部按 `request.user.userId` 过滤所有权（`surveyService.getById(userId, surveyId)`）。ai-service 对 q-server 的所有回调只携带 `X-Internal-Api-Key`，没有用户 JWT，且该路由不支持内部凭证豁免，因此工具 `get_survey_structure` **无法**复用现状接口，必须新增一个不做所有权过滤、仅需内部凭证或超级管理员权限即可访问的等价接口。

## 接口定义

- **方法/路径**：`GET /api/admin/surveys/:id`
- **挂载模块**：`app/q-server/src/modules/survey/survey-stats/survey-stats.routes.ts`（与已存在的 `/surveys/:id/stats`、`/surveys/:id/responses` 同文件、同模式，见 research.md R6）
- **鉴权**：模块级 `requireSuperAdminOrInternal`（已通过 `fastify.addHook("preHandler", requireSuperAdminOrInternal)` 挂载在该模块全部路由上，新增路由自动继承，无需单独声明）
- **路径参数**：`id`（问卷 ID），复用既有 `statsSurveyIdSchema` 做格式校验（与 `/surveys/:id/stats` 一致的 `parseStatsSurveyId()` 辅助函数）
- **限流**：建议与同模块其他只读接口一致，`{ max: 30, timeWindow: "1 minute" }`

## 响应结构

沿用统一 API 包装（`reply.sendSuccess()`，Constitution Principle III）：

```json
{
  "code": 0,
  "msg": "ok",
  "data": {
    "survey_id": "string",
    "title": "string",
    "description": "string | null",
    "questions": [{ "id": "string", "type": "string", "title": "string", "required": true, "options": ["string"] }]
  }
}
```

## 错误响应

| 场景                                           | HTTP 状态码 | 说明                                                                        |
| ---------------------------------------------- | ----------- | --------------------------------------------------------------------------- |
| 问卷不存在或已软删除                           | 404         | 与现状 `AppError` 处理模式一致（`err.statusCode`/`err.code`/`err.message`） |
| 未携带合法 `X-Internal-Api-Key` 且非超级管理员 | 401/403     | 由 `requireSuperAdminOrInternal` 中间件统一处理，无需路由层重复校验         |
| 路径参数格式错误                               | 400         | 复用 `statsSurveyIdSchema.safeParse()` 校验结果                             |

## 实现要点（供 `/speckit-tasks` 落地参考，非本阶段产出代码）

1. 在 `SurveyStatsService` 新增 `getSurveyStructure(surveyId: bigint)` 方法：查询问卷标题/描述/题目/选项，**不做** `userId` 所有权过滤（区别于 `survey-crud` 模块现状实现）。
2. 在 `survey-stats.routes.ts` 新增一条 `fastify.get("/surveys/:id", ...)` 路由，复用 `parseStatsSurveyId()` 校验路径参数，调用上述新方法并 `reply.sendSuccess(result)`。
3. 不需要新增 Zod schema（无 query 参数），仅复用现有 `statsSurveyIdSchema`。
4. ai-service 侧 `survey_client.py` 新增 `get_survey_structure(survey_id)` 方法调用本接口；**不删除**现状 `get_survey_detail()`（对外 API 场景仍可保留旧方法用于其他用途，见 spec.md 附录 A.2 卡点 2 建议），仅在 `AnalysisAgent`/`analysis_tools.py` 中不再依赖它。

## 与既有权限体系的一致性（SC-006）

本接口与现有 `/surveys/:id/stats`、`/surveys/:id/responses` 使用完全相同的中间件（`requireSuperAdminOrInternal`），不引入新的权限判定逻辑或绕过路径，符合 SC-006"新增或修改的 q-server 接口，与现有权限体系保持一致"的要求。
