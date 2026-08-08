# Quickstart Validation Guide: 后端 P1 级可靠性修复

**Feature**: 010-backend-p1-fixes
**Created**: 2026-08-08

## 前置条件

- Node.js ≥22.17, pnpm ≥10.12.4
- PostgreSQL 16（含测试数据库）
- Redis 7（localhost:6379 或 `REDIS_HOST` 指定）
- RabbitMQ（localhost:5672 或 `RABBITMQ_URL` 指定，用于 US2/US5 验证）
- 项目依赖已安装：`pnpm install`

## 运行全部测试

```bash
cd app/q-server
npx vitest run src/spec/
```

验证要点：P1 修复相关的新增测试用例全部通过，已有测试无回归失败。

---

## US1: CSV 流式导出验证

### 单元测试

```bash
cd app/q-server
npx vitest run src/spec/survey-stats/survey-stats.service.spec.ts
```

### 手动集成验证

1. 准备一份含多道题目的问卷，提交至少 100 份答卷（可使用批量提交脚本）
2. 发起 CSV 导出请求：

```bash
curl -H "Authorization: Bearer <token>" \
  "http://localhost:3000/api/survey/<surveyId>/export/csv" \
  --output test-export.csv
```

3. 验证：
   - 响应头 `Content-Type: text/csv; charset=utf-8`
   - 响应头 `Transfer-Encoding: chunked`
   - `test-export.csv` 内容完整（行数 = 答卷数 + 1 表头行）
   - 服务内存无明显增长（可通过 `process.memoryUsage()` 或系统监控观察）

### 大数据量压力验证（可选）

```bash
# 使用项目内批量提交脚本或 API 工具，向问卷提交 10000+ 份答卷
# 观察导出期间服务进程内存：
# - 修复前：内存随答卷数线性增长
# - 修复后：内存保持稳定（增长 < 50MB）
```

---

## US2: RabbitMQ 自动重连验证

### 模拟 RabbitMQ 重启

```bash
# 1. 确认服务正常运行，RabbitMQ 已连接
docker restart <rabbitmq-container>

# 2. 观察 q-server 日志输出
# 预期日志序列：
# [WARN] RabbitMQ 连接已断开，将在 1s 后重连
# [INFO] RabbitMQ 重连成功，Channel 已重建
```

### 验证消息恢复投递

```bash
# RabbitMQ 恢复后，发起验证码发送请求
curl -X POST http://localhost:3000/api/auth/send-code \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","type":"register"}'

# 预期：返回成功（非 MAIL_SERVICE_UNAVAILABLE），邮件投递到队列
```

### 验证指数退避

```bash
# 停止 RabbitMQ 持续 2 分钟以上
# 观察日志中重连间隔逐渐增大：
# 1s → 2s → 4s → 8s → 16s → 30s → 30s → ...
# 确认不会因频繁重连导致 CPU 或日志洪泛
```

---

## US3: Redis 离线队列修正验证

### 单元验证

```bash
cd app/q-server
# 验证 redis.ts 中 enableOfflineQueue 配置值为 false
grep "enableOfflineQueue" src/plugins/redis.ts
# 预期：enableOfflineQueue: false
```

### 手动验证

```bash
# 1. 停止 Redis 服务
redis-cli shutdown  # 或 docker stop <redis-container>

# 2. 发起一个涉及缓存读写的请求
curl http://localhost:3000/api/survey/<id>/stats \
  -H "Authorization: Bearer <token>"

# 3. 预期：
#    - 请求不阻塞不崩溃（降级放行）
#    - 日志中出现 Redis 连接错误
#    - 服务内存中无积压的 Redis 命令

# 4. 恢复 Redis 后，缓存功能自动恢复
```

---

## US4: 统计缓存失效验证

### 单元测试

```bash
cd app/q-server
npx vitest run src/spec/survey/survey-crud/survey-crud.service.spec.ts
```

### 手动验证

```bash
# 1. 提交答卷后查询统计
curl http://localhost:3000/api/survey/<id>/stats \
  -H "Authorization: Bearer <token>"
# 记录答卷数 N

# 2. 删除一份答卷
curl -X DELETE http://localhost:3000/api/survey/response/<responseId> \
  -H "Authorization: Bearer <token>"

# 3. 再次查询统计
curl http://localhost:3000/api/survey/<id>/stats \
  -H "Authorization: Bearer <token>"
# 预期：答卷数 = N - 1（缓存已被清除并重建）
```

---

## US5: sendCode AMQP 告警验证

### 单元测试

```bash
cd app/q-server
npx vitest run src/spec/user/auth/auth.service.spec.ts
```

### 手动验证

```bash
# 1. 停止 RabbitMQ
docker stop <rabbitmq-container>

# 2. 发起验证码发送请求
curl -X POST http://localhost:3000/api/auth/send-code \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","type":"register"}'

# 3. 验证响应
# 预期响应（约 503）：
# { "code": <BizCode>, "msg": "邮件服务暂时不可用，请稍后重试", "data": null }

# 4. 验证日志
# 预期日志中包含 WARN 级别：
# "邮件未发送——RabbitMQ 不可用，验证码已生成但无法投递。target=t***@example.com type=register"
```

---

## 回归验证

```bash
# 运行全部测试套件
cd app/q-server
npx vitest run

# 验证：已有测试无新增失败（除已知的预存失败外）
```
