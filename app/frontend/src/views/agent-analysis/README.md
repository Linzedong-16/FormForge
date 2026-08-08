# AI 问卷分析（Agent Analysis）

超级管理员可对指定问卷发起 AI Agent 自主分析（Function Calling 自主循环），
通过 SSE 实时观察分析过程（状态提示 / 工具调用轨迹 / 逐字结论），
并在异常、限流、降级等场景下获得清晰反馈。

对应后端能力：`app/ai-service` 的 `AnalysisAgent`，经 `app/q-server` 的
`ai-proxy` 模块代理暴露为 `POST /api/ai/agent/analysis/stream`（`requireSuperAdmin` 鉴权）。

## 架构决策

### 1. SSE 客户端复用来源

新增 `packages/sse-client/src/agent.ts`（`monorepo-sse-client/agent`），
仿照包内已有的 `src/ai.ts`（被 `app/q-editor` 的 `useAIGenerate.ts` 消费）实现，
基于同一套 `createSSEClient()` 通用封装（`@microsoft/fetch-event-source`，
支持 POST + body、Bearer Token 注入、`AbortSignal`、超时），
不在前端重复实现 SSE 分帧解析逻辑。

新增的关键差异点：`createSSEClient` 原生的 `onOpen` 不校验 `response.ok`，
非 2xx 响应会被当成正常连接继续尝试解析 SSE 帧，导致错误无法被 `onError`
正确捕获。`agent.ts` 在 `onOpen` 中自行校验状态码，非 2xx 时构造
`AgentStreamError`（携带 `status` 与归类后的 `kind`）并 `throw`，
使其经由 `createSSEClient` 内部 `onerror` 转发到 `onError` 回调，
从而让前端能区分 401/403/429/503 与普通业务错误。

### 2. 类型共享位置

后端字段命名 snake_case（对齐 ai-service 的 Pydantic 模型），
共享类型集中定义在 `packages/common/src/agent/agent-analysis.interface.ts`，
以显式具名导出的方式在 `packages/common/src/index.ts` 中导出
（避免与 `ai/ai.interface.ts` 中已有的通用 `SSEEvent` 类型产生歧义）。
前端 Store（`store/modules/agentAnalysis.ts`）与 SSE 客户端层共同依赖这一份类型，
不在 `app/frontend` 内重复定义。

### 3. 错误分类策略

`AgentStreamError.kind` 分为四类，Store 层的 `errorMessageByKind()` 统一映射为中文提示：

| kind                         | 触发场景          | 提示文案                                     |
| ---------------------------- | ----------------- | -------------------------------------------- |
| `unauthorized` / `forbidden` | 401 / 403         | 登录状态失效或权限不足，请重新登录后再试     |
| `rate_limited`               | 429               | 请求过于频繁，请稍后再试（限流：10 次/分钟） |
| `unavailable`                | 503               | AI 服务暂不可用，请稍后重试                  |
| `unknown`                    | 其他网络/业务异常 | 展示原始错误信息，无原始信息则展示通用提示   |

不做 401 自动刷新重试：`createSSEClient` 无内建的 token 刷新-重试机制
（与 `api/clients/server.ts` 的 axios 拦截器行为不同），SSE 场景下 401
直接提示用户重新登录，避免在流式连接场景引入复杂的重连状态机。

### 4. 不支持"追问"（不透传 `session_id`）

后端 `AnalysisAgent` 未实现跨请求的会话记忆，每次请求都是独立分析。
因此前端请求体只发送 `survey_id` / `focus`，**不透传 `session_id`**——
透传只会误导用户以为支持连续追问。`done` 事件返回的 `session_id`
仅作为展示 / 日志关联信息保留在本地会话记录（`backend_session_id`），
不参与下一次请求。UI 上也不提供"追问"输入框，每次点击"开始分析"
都会创建一条全新的本地会话记录。

### 5. 本地持久化与裁剪策略

会话历史通过 Pinia (`pinia-plugin-persistedstate`) 持久化到 `localStorage`
（key: `frontend-agent-analysis`，仅持久化 `sessions` 字段，运行态的
SSE 控制器引用 `currentController` 不持久化）：

- **数量裁剪**：`startAnalysis` 中通过 `unshift` 插入新记录后，
  超过 `MAX_SESSIONS = 20` 条时裁剪最旧的记录，避免 `localStorage` 无限膨胀。
- **脏记录修复**：页面刷新会导致 SSE 控制器引用丢失，若持久化恢复出
  `status` 仍为 `"streaming"` 的记录，会被强制修正为 `"error"`
  （文案："页面已刷新，此前的分析连接已中断"），避免 UI 卡在"进行中"假象。
  该修复逻辑必须放在 `persist.afterHydrate` 钩子中而非 Store 的
  `setup()` 函数体内 —— `pinia-plugin-persistedstate` 的 `$patch`
  恢复发生在 `setup()` 执行完毕、插件运行阶段之后，写在 `setup()`
  里的修复代码会先于恢复执行，等同于死代码。

### 6. 并发限制

同一时间只允许一个进行中的分析：`startAnalysis` 在已有 `streaming`
状态的会话时直接返回 `false`（UI 层据此提示"已有一个分析正在进行"），
不支持多会话并发流式，降低状态管理复杂度。

## 测试

`src/__tests__/store/agentAnalysis.spec.ts` 覆盖：

- SSE 事件归约顺序（`status` → `tool_call` → `tool_result` → `token` → `done`）
- `token` 事件缺失时以 `done.reply` 兜底
- `degraded` 标记落地
- 并发限制、`abortCurrent`（区分 `aborted` 与 `error`）
- `removeSession` / `clearHistory` 的进行中保护
- 4 类错误分类文案映射
- `onClose` 异常断开兜底（不覆盖已落地的 `done` 状态）
- 历史记录数量裁剪（超过 20 条裁剪最旧）
- 持久化恢复的脏记录修复（`afterHydrate`）

测试中若需要验证 `pinia-plugin-persistedstate` 插件是否生效，
必须先用 `createApp({}).use(pinia)` 完成"安装"再调用
`pinia.use(piniaPluginPersistedstate)` —— Pinia 的 `pinia.use(plugin)`
仅在 `pinia._a`（已安装的 Vue app）存在时才会立即把插件推入生效队列，
否则插件会被排入 `toBeInstalled`、直到某次 `app.use(pinia)` 才真正启用，
且失败时不会抛出任何异常，只会静默地不触发插件逻辑。
