# 基于浏览器指纹的多端重复提交防止方案（方案A）

## 1. 方案概述

### 1.1 背景与目标

在开放式问卷场景中，同一用户可能在多个设备/浏览器中重复提交同一份问卷，导致数据失真。本方案通过**浏览器指纹 + 临时 token** 的组合机制，在服务端实现去重拦截，防止恶意或误操作的重复提交。

### 1.2 核心思路

```
用户打开问卷 → 服务端生成临时 token → 前端采集浏览器指纹
        ↓
用户提交答卷 → 前端发送 {指纹哈希 + token + 答案}
        ↓
服务端验证 → 二次加盐哈希指纹 → 检查 Redis 去重记录
        ↓
首次提交 → 写入 DB + 写入 Redis 去重标记 → 返回成功
重复提交 → 返回 409（重复提交）
```

### 1.3 技术选型

| 层级       | 技术                                            | 说明                            |
| ---------- | ----------------------------------------------- | ------------------------------- |
| 临时 Token | UUID v4 (crypto.randomUUID)                     | 全局唯一，有效期 30 分钟        |
| 指纹采集   | Canvas + WebGL + UA + 屏幕 + 时区 + 语言 + 字体 | 多维信息组合，前端 SHA-256 哈希 |
| 服务端哈希 | SHA-256 加盐                                    | 防彩虹表攻击                    |
| 去重存储   | Redis SET NX                                    | 原子操作，24 小时 TTL           |
| 降级策略   | IP + UA 组合 / CAPTCHA                          | Redis 不可用或指纹采集失败时    |

---

## 2. 架构设计

### 2.1 整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        前端 (q-editor)                           │
├─────────────────────────────────────────────────────────────────┤
│  SurveyView.vue                                                 │
│  ├── initFingerprint() ── 并行采集指纹 + 获取 token              │
│  ├── getFingerprint()  ── Canvas/WebGL/UA/屏幕/时区/语言/字体     │
│  └── submitAnswers()   ── 提交时携带 fingerprint + token         │
│                                                                  │
│  utils/fingerprint.ts                                           │
│  ├── collectFingerprintComponents() ── 多维指纹采集               │
│  ├── sha256()                        ── Web Crypto API 哈希      │
│  └── detectEnvironment()             ── 桌面/移动/WebView 检测    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     后端 (q-server)                              │
├─────────────────────────────────────────────────────────────────┤
│  Routes:                                                        │
│  GET  /api/surveys/:surveyId/token     ── 获取临时 token         │
│  POST /api/surveys/:surveyId/responses ── 提交答卷（含去重校验）  │
│                                                                  │
│  utils/fingerprint.ts                                           │
│  ├── hashFingerprint()      ── 服务端二次加盐哈希                 │
│  ├── generateToken()        ── UUID v4 生成                      │
│  ├── storeToken()           ── Redis 存储 token                  │
│  ├── validateToken()        ── 验证 token 有效性                  │
│  ├── consumeToken()         ── 消费 token（防复用）               │
│  ├── checkDuplicateSubmit() ── 检查去重记录                       │
│  └── recordSubmit()         ── 写入去重记录                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         Redis 缓存层                             │
├─────────────────────────────────────────────────────────────────┤
│  survey:token:{surveyId}:{token}    ── Token 存储（TTL 30min）   │
│  survey:submit:{fpHash}:{token}     ── 去重记录（TTL 24h）       │
│  survey:token:prev:{surveyId}       ── 旧 token 标记（TTL 60s）  │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 数据流

```
┌──────────┐    GET /token     ┌──────────┐    SET NX     ┌───────┐
│  Browser  │ ────────────────→ │  Server  │ ───────────→ │ Redis │
│          │ ←── {token,ttl} ── │          │ ←── OK ──── │       │
│          │                    │          │              │       │
│          │  POST /responses   │          │  GET token   │       │
│          │  {fp,token,ans} ─→ │          │ ───────────→ │       │
│          │                    │          │ ←── valid ── │       │
│          │                    │          │              │       │
│          │                    │          │  GET submit  │       │
│          │                    │          │ ───────────→ │       │
│          │                    │          │ ←── null ─── │       │
│          │                    │          │              │       │
│          │                    │  ┌─── DB Write ───┐    │       │
│          │                    │  │ Response+Answer│    │       │
│          │                    │  └────────────────┘    │       │
│          │                    │          │              │       │
│          │                    │          │  SET submit  │       │
│          │                    │          │ ───────────→ │       │
│          │                    │          │ ←── OK ──── │       │
│          │                    │          │              │       │
│          │  ←── {success} ─── │          │  DEL token   │       │
│          │                    │          │ ───────────→ │       │
└──────────┘                    └──────────┘              └───────┘
```

---

## 3. 接口设计

### 3.1 新增接口

#### 3.1.1 GET /api/surveys/:surveyId/token — 获取临时提交凭证

- **认证**：无需认证（C 端公开接口）
- **限流**：60 次/分钟
- **请求参数**：路径参数 `surveyId`（问卷 ID）

**响应示例**：

```json
{
  "code": 0,
  "msg": "ok",
  "data": {
    "token": "550e8400-e29b-41d4-a716-446655440000",
    "expires_in": 1800
  }
}
```

**错误响应**：

- `404`：问卷不存在
- `400`：问卷未发布，无法获取提交凭证

#### 3.1.2 POST /api/surveys/:surveyId/responses — 提交答卷（含去重）

- **认证**：无需认证（C 端公开接口）
- **限流**：30 次/分钟

**请求体**：

```json
{
  "answers": [
    { "component_id": "1", "value": "选项A" },
    { "component_id": "2", "values": ["选项B", "选项C"] }
  ],
  "anonymous_id": "anon_xxx",
  "fingerprint": "a1b2c3d4e5f6...（64位hex字符串）",
  "token": "550e8400-e29b-41d4-a716-446655440000"
}
```

**响应示例（成功）**：

```json
{
  "code": 0,
  "msg": "提交成功",
  "data": {
    "response_id": "123",
    "submitted_at": "2026-06-25T10:30:00.000Z"
  }
}
```

**错误响应**：

- `400`：临时凭证已过期，请刷新页面后重新提交
- `400`：问卷未发布，无法提交
- `404`：问卷不存在
- `409`：请勿重复提交，您已提交过该问卷

### 3.2 修改的接口

| 接口                                    | 改动说明                                         |
| --------------------------------------- | ------------------------------------------------ |
| `POST /api/surveys/:surveyId/responses` | 新增 `fingerprint`（必填）和 `token`（必填）字段 |
| `GET /api/surveys/:surveyId/responses`  | 新增路由（原仅存在于 mock，现正式实现）          |

### 3.3 认证策略变更

原有设计为全局 `preHandler: authenticate`，现改为按路由单独配置：

- B 端接口（CRUD/审核/模板）：`preHandler: authenticate`
- C 端接口（获取 token / 提交答卷）：无需认证

---

## 4. 安全设计

### 4.1 指纹哈希链

```
浏览器原始数据
    │
    ▼ 前端 SHA-256（Web Crypto API）
64位 hex 哈希（传输）
    │
    ▼ 服务端 SHA-256(前端哈希 + FINGERPRINT_SALT)
加盐哈希（存储/比对）
```

**安全性**：

- 原始指纹数据不离开浏览器，保护用户隐私
- 服务端加盐防止彩虹表攻击
- 盐值通过环境变量 `FINGERPRINT_SALT` 注入，不硬编码

### 4.2 Token 安全

- UUID v4 格式，全局唯一，不可预测
- 与问卷 ID 绑定，防止跨问卷复用
- 提交后立即消费（删除），防止二次使用
- 30 分钟 TTL 自动过期
- Key 轮换机制：旧 token 在 60 秒过渡期内仍然有效

### 4.3 防并发

- Redis `SET NX` 原子操作，防止并发写入重复记录
- 数据库事务保证答卷 + 答案写入的原子性

### 4.4 隐私合规

| 要求             | 实现                                 |
| ---------------- | ------------------------------------ |
| 最小化数据收集   | 仅采集渲染特征，不涉及个人身份信息   |
| 数据不离开浏览器 | 前端 SHA-256 哈希后再传输            |
| 服务端不存明文   | 仅存储加盐哈希                       |
| 用户告知         | 可在隐私政策中声明使用浏览器指纹技术 |

---

## 5. 兼容性设计

### 5.1 多环境指纹采集策略

| 环境            | Canvas | WebGL | 字体检测 | 特殊处理             |
| --------------- | ------ | ----- | -------- | -------------------- |
| 桌面浏览器      | 完整   | 完整  | 完整     | 全维度采集           |
| iOS Safari      | 完整   | 完整  | 跳过     | 隐私限制较少         |
| iOS WebView     | 受限   | 受限  | 跳过     | 部分 Canvas 操作受限 |
| Android Chrome  | 完整   | 完整  | 跳过     | 性能考虑跳过字体     |
| Android WebView | 受限   | 受限  | 跳过     | 同 iOS WebView       |

### 5.2 降级策略

| 场景            | 降级方案                     | 影响                       |
| --------------- | ---------------------------- | -------------------------- |
| Canvas 采集失败 | 使用 UA + 屏幕 + 时区 + 语言 | 指纹精度降低，误判风险略增 |
| WebGL 采集失败  | 跳过 GPU 信息                | 指纹精度降低               |
| Redis 不可用    | 跳过 token 校验和去重检查    | 完全降级，不做去重         |
| Token 获取失败  | 前端生成客户端临时 token     | 服务端验证时降级放行       |
| 指纹完全失败    | 空指纹 + 服务端 IP 降级      | 最弱去重能力               |

---

## 6. 涉及文件清单

### 6.1 新增文件

| 文件                                                        | 说明                                             |
| ----------------------------------------------------------- | ------------------------------------------------ |
| `app/q-server/src/utils/fingerprint.ts`                     | 服务端指纹处理工具（哈希、Token 管理、去重记录） |
| `app/q-editor/src/utils/fingerprint.ts`                     | 前端浏览器指纹采集工具（Canvas/WebGL/UA 等）     |
| `app/q-server/doc/survey/browser-fingerprint-prevention.md` | 本文档                                           |

### 6.2 修改文件

| 文件                                                                 | 改动说明                                                                 |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `app/q-server/src/modules/survey/survey-crud/survey-crud.schemas.ts` | 新增 `submitResponseSchema`、`responseListQuerySchema`、`getTokenSchema` |
| `app/q-server/src/modules/survey/survey-crud/survey-crud.service.ts` | 新增 `generateSurveyToken`、`submitResponse`、`listResponses` 方法       |
| `app/q-server/src/modules/survey/survey-crud/survey-crud.routes.ts`  | 新增 3 个路由；认证策略从全局 `preHandler` 改为按路由配置                |
| `app/q-editor/src/api/modules/survey/index.ts`                       | 新增 `getSurveyToken`；更新 `submitResponse` 签名                        |
| `app/q-editor/src/views/online/SurveyView.vue`                       | 集成指纹采集和 token 获取；提交时携带指纹和 token                        |
| `app/q-editor/src/mock/modules/survey.ts`                            | 新增 token mock 接口                                                     |
| `packages/common/src/survey/survey.interface.ts`                     | `SubmitResponseRequest` 新增 `fingerprint` 和 `token` 字段               |

---

## 7. 环境变量

| 变量名             | 说明           | 默认值                                | 必填         |
| ------------------ | -------------- | ------------------------------------- | ------------ |
| `FINGERPRINT_SALT` | 指纹哈希加盐值 | `questionnaire-sys-default-salt-2026` | 生产环境必填 |

---

## 8. 测试建议

### 8.1 单元测试

- `fingerprint.ts`（后端）：测试 `hashFingerprint` 确定性、`generateToken` 唯一性
- `fingerprint.ts`（前端）：测试 `getFingerprint` 返回格式、降级策略

### 8.2 集成测试

- 正常提交流程：获取 token → 采集指纹 → 提交答卷 → 验证成功
- 重复提交拦截：首次提交成功 → 相同指纹+token 再次提交 → 返回 409
- Token 过期：等待 token 过期 → 提交 → 返回 400
- Redis 不可用：模拟 Redis 宕机 → 验证降级放行
- 指纹采集失败：模拟 Canvas 不可用 → 验证降级指纹可用

### 8.3 兼容性测试

- Chrome / Firefox / Safari / Edge 桌面版
- iOS Safari / Chrome
- Android Chrome / 微信内置浏览器
- iOS WKWebView
- Android WebView

---

## 9. 后续优化方向

1. **IP 辅助校验**：结合 IP 地址作为辅助去重维度
2. **行为分析**：记录用户填写时间，异常快速提交触发验证码
3. **CAPTCHA 集成**：指纹采集完全失败时，弹出验证码作为替代方案
4. **机器学习**：基于历史数据训练异常提交检测模型
5. **监控告警**：接入去重拦截率监控，异常波动时告警
