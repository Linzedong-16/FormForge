# Contract: 客户端 Mock API 路由映射

**Feature**: [spec.md](../spec.md) | **Plan**: [../plan.md](../plan.md) | **Data Model**: [../data-model.md](../data-model.md)

本功能对外暴露的"接口"不是新的 HTTP 服务端点，而是**客户端 Mock 适配器对既有前端 API 调用契约的镜像实现**——q-editor 业务代码（`api/modules/*.ts`）调用的每一个 `/api/*` 端点，在 standalone 构建下都必须由 `src/standalone/handlers.ts` 提供等价的假数据响应，响应包体结构与 `q-server` 真实契约（`{code, msg, data}`，Constitution Principle III）完全一致，业务代码无需感知是否处于 Mock 模式。

## 响应包体约定

```typescript
// 成功
{ code: 0, msg: string, data: T }

// 失败
{ code: number /* > 0 */, msg: string, data: null }
```

## 端点映射表

| 方法       | 路径                              | 对应 FR        | 说明                                          |
| ---------- | --------------------------------- | -------------- | --------------------------------------------- |
| GET        | `/api/auth/status`                | FR-004         | 返回系统已初始化、演示账号已就绪              |
| POST       | `/api/auth/login`                 | FR-006, FR-007 | 校验固定账号密码，返回 MockSession + DemoUser |
| POST       | `/api/auth/send-code`             | FR-016         | 返回验证码已发送（固定 `123456`，不真实发送） |
| POST       | `/api/auth/register`              | FR-016         | 返回注册成功（不落地新用户，演示用）          |
| POST       | `/api/auth/verify-register`       | FR-016         | 返回验证通过                                  |
| POST       | `/api/auth/refresh`               | FR-007         | 始终返回同一组固定 MockSession                |
| POST       | `/api/auth/reset-password`        | FR-016         | 返回重置成功                                  |
| POST       | `/api/auth/logout`                | FR-016         | 返回登出成功                                  |
| GET        | `/api/user/me`                    | FR-007         | 返回 DemoUser 基本信息                        |
| GET        | `/api/user/profile`               | FR-008         | 返回含固定头像 URL 的完整 Profile             |
| PUT        | `/api/user/update`                | FR-020         | 接受并"回显"更新后的字段（不持久化）          |
| PUT        | `/api/user/profile`               | FR-020         | 同上                                          |
| POST       | `/api/user/avatar`                | FR-008         | 始终返回固定头像 URL，忽略上传的实际文件      |
| PUT        | `/api/user/change-password`       | FR-016         | 返回修改成功                                  |
| POST       | `/api/user/bind-email`            | FR-016         | 返回绑定成功                                  |
| DELETE     | `/api/user/account`               | FR-016         | 返回注销成功（不真实删除演示账号）            |
| GET        | `/api/surveys`                    | FR-009         | 返回预置问卷列表（分页包体）                  |
| POST       | `/api/surveys`                    | FR-012         | 创建新问卷（写入内存态列表，不持久化跨会话）  |
| GET        | `/api/surveys/:id`                | FR-011         | 返回单份问卷详情（含组件列表）                |
| PUT        | `/api/surveys/:id`                | FR-013, FR-014 | 更新问卷（内存态回显）                        |
| DELETE     | `/api/surveys/:id`                | FR-012         | 删除问卷（内存态移除）                        |
| POST       | `/api/surveys/:id/publish`        | FR-009         | 状态切换为 `published`                        |
| POST       | `/api/surveys/:id/close`          | FR-009         | 状态切换为 `closed`                           |
| GET        | `/api/surveys/:id/public`         | FR-011         | 公开访问视角的问卷详情                        |
| GET        | `/api/surveys/:id/token`          | FR-011         | 返回提交凭证（固定值）                        |
| POST       | `/api/surveys/:id/generate-link`  | FR-011         | 返回问卷分享链接（拼接当前 origin）           |
| GET/POST   | `/api/surveys/:id/responses`      | FR-011         | 答卷列表/提交                                 |
| POST       | `/api/surveys/:id/submit-review`  | FR-016         | 返回提审成功                                  |
| POST       | `/api/surveys/:id/apply-template` | FR-004 场景2   | 将模板组件复制进目标问卷                      |
| GET        | `/api/templates`                  | FR-004         | 返回预置模板列表                              |
| GET        | `/api/templates/:id`              | FR-004         | 模板详情                                      |
| POST       | `/api/templates/:id/apply`        | FR-004         | 应用模板                                      |
| POST       | `/api/templates/:id/rate`         | FR-016         | 返回评分成功                                  |
| GET        | `/api/responses/:id`              | FR-011         | 答卷详情                                      |
| DELETE     | `/api/responses/:id`              | FR-016         | 删除答卷                                      |
| GET/POST   | `/api/admin/users`                | FR-016         | 管理后台用户列表/创建                         |
| PUT/DELETE | `/api/admin/users/:id`            | FR-016         | 管理后台用户更新/删除                         |
| GET        | `/api/admin/config`               | FR-016         | 系统配置（SMTP/Auth）                         |

## 未覆盖端点的降级契约

任意未在上表中的 `/api/*` 请求：

```json
{ "code": 404, "msg": "Mock 接口未实现: {METHOD} {URL}", "data": null }
```

并在浏览器控制台输出 `console.warn`，前端业务代码按正常的接口失败分支处理（Toast 提示/静默忽略，取决于调用点已有的错误处理），不会导致页面级崩溃（对应 FR-017、Edge Case「Mock 接口未覆盖时的处理」）。

## 非 `/api` 请求的透传契约

Mock 适配器仅拦截以 `/api` 为前缀（`baseURL + url` 拼接后判断）的请求；其余请求（如指向 CDN 的静态资源）不经过 Mock 适配器，按 axios 默认行为处理。
