# API Contract: 发送验证码接口变更

**Feature**: 010-backend-p1-fixes / US5
**Created**: 2026-08-08

## 端点

```
POST /api/auth/send-code
```

## 变更类型

响应行为变更 — RabbitMQ 不可用时的返回值从"成功（实际未发送）"改为"明确失败"。

## 请求

无变更。

```json
{
  "email": "user@example.com",
  "type": "register"
}
```

## 响应

### 成功发送（200）

```json
{
  "code": 0,
  "msg": "验证码已发送",
  "data": null
}
```

行为不变 — RabbitMQ 正常可用时，邮件成功投递到队列。

### RabbitMQ 不可用（变更点）

**变更前**（RabbitMQ 不可用时）：

```json
{
  "code": 0,
  "msg": "验证码已发送",
  "data": null
}
```

验证码已存入 Redis，但邮件未发送，用户永远收不到。

**变更后**（RabbitMQ 不可用时）：

```json
{
  "code": <新错误码>,
  "msg": "邮件服务暂时不可用，请稍后重试",
  "data": null
}
```

同时服务端记录 WARN 日志：

```text
[WARN] 邮件未发送——RabbitMQ 不可用，验证码已生成但无法投递。target=u***@example.com type=register
```

### 其他错误（不变）

| 场景                       | HTTP    | code                           | msg                                |
| -------------------------- | ------- | ------------------------------ | ---------------------------------- |
| SMTP 未配置                | 503     | `SMTP_NOT_CONFIGURED`          | 邮件服务暂未配置                   |
| 注册未开放                 | 403     | `REGISTRATION_CLOSED`          | 暂未开放注册                       |
| 邮箱已注册                 | 409     | `EMAIL_EXISTS`                 | 该邮箱已被注册                     |
| 邮箱未注册（重置密码）     | 404     | `EMAIL_NOT_EXISTS`             | 该邮箱未注册                       |
| 发送频繁                   | 429     | —                              | 发送过于频繁，请1分钟后再试        |
| **邮件服务不可用（新增）** | **503** | **`MAIL_SERVICE_UNAVAILABLE`** | **邮件服务暂时不可用，请稍后重试** |

## 兼容性

- **前端**：需要处理新增的 `MAIL_SERVICE_UNAVAILABLE` 错误码，建议展示"邮件服务暂时不可用，请稍后重试"提示（与现有错误处理模式一致）。
- **向后兼容**：RabbitMQ 正常时行为完全不变。
