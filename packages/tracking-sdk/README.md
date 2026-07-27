# 问卷系统前端统一埋点监控 SDK

> **包名**：`monorepo-tracking-sdk` · **版本**：1.0.0 · **语言**：TypeScript (strict)
>
> 面向 monorepo-code 问卷平台的轻量级前端可观测性方案，覆盖**事件追踪、错误上报、性能采集、用户行为分析**四大领域。与设计文档 `docs/监控全链路设计方案.md` 配套使用。

---

## 目录

- [1. 快速开始](#1-快速开始)
- [2. 架构总览](#2-架构总览)
- [3. 分层解析](#3-分层解析)
  - [3.1 类型系统（types/）](#31-类型系统types)
  - [3.2 工具层（utils/）](#32-工具层utils)
  - [3.3 传输层（transport/）](#33-传输层transport)
  - [3.4 核心引擎（core/）](#34-核心引擎core)
  - [3.5 采集器（collectors/）](#35-采集器collectors)
  - [3.6 框架插件（plugins/）](#36-框架插件plugins)
- [4. 核心流程详解](#4-核心流程详解)
- [5. 安全与数据治理](#5-安全与数据治理)
- [6. API 参考手册](#6-api-参考手册)
- [7. 接入指南](#7-接入指南)

---

## 1. 快速开始

### 安装

```bash
# monorepo 内部引用（在子应用的 package.json 中）
{ "dependencies": { "monorepo-tracking-sdk": "workspace:*" } }
```

### 最简使用

```ts
import { Tracker, ErrorCollector, PerformanceCollector, PageViewCollector } from "monorepo-tracking-sdk";

// 1. 创建
const tracker = new Tracker({
  appId: "q-editor",
  endpoint: "/api/v1/track",
  debug: import.meta.env.DEV
});

// 2. 初始化
tracker.init();

// 3. 安装采集器（自动捕获错误、性能、PV）
new ErrorCollector(tracker).register();
new PerformanceCollector(tracker).register();
new PageViewCollector(tracker).register();

// 4. 手动埋点
tracker.track("editor_create_survey", "behavior", { source: "scratch" });

// 5. 登录后设置用户
tracker.setUserId("42");
```

### Vue 3 集成

```ts
import { createTrackingPlugin } from "monorepo-tracking-sdk/plugins/vue";
app.use(createTrackingPlugin(tracker, { router }));
// 然后通过 inject(TRACKER_INJECTION_KEY) 或 this.$tracker 获取
```

### Axios 集成

```ts
import { installAxiosInterceptor } from "monorepo-tracking-sdk/plugins/axios";
installAxiosInterceptor(axios, tracker, {
  excludePaths: [/\/api\/v1\/track/]
});
```

---

## 2. 架构总览

```text
                          ┌─────────────────────┐
                          │    tracker.track()    │  ← 唯一外部入口
                          └──────────┬──────────┘
                                     │
              ┌──────────────────────┼──────────────────────┐
              │ 采样判断             │ 脱敏+答卷检测         │ beforeSend
              │ shouldSample()       │ sanitizeObject()      │ 过滤回调
              └──────────────────────┼──────────────────────┘
                                     │
                          ┌──────────▼──────────┐
                          │ context.buildEvent() │  ← 公共字段自动填充
                          └──────────┬──────────┘
                                     │
                    ┌────────────────┴────────────────┐
                    │ priority === "error" ?           │
                    └──────┬──────────────────┬───────┘
                           │ YES              │ NO
                           ▼                  ▼
                 ┌─────────────────┐  ┌───────────────┐
                 │ transmitImmediate│  │ queue.enqueue │  ← 错误直达，其他入队
                 │ sendBeacon/fetch │  └───────┬───────┘
                 └─────────────────┘          │
                                    ┌─────────▼─────────┐
                                    │ 50条/批 或 10s 定时 │
                                    │ queue.flush()      │
                                    └─────────┬─────────┘
                                              │
                                    ┌─────────▼─────────┐
                                    │ transmitBatch()    │
                                    │ fetch POST + 重试  │
                                    └─────────┬─────────┘
                                              │
                                    ┌─────────▼─────────┐
                                    │   q-server 接收端  │
                                    │ POST /api/v1/track │
                                    └───────────────────┘
```

**分层职责**：

| 层级     | 目录          | 职责                                          |
| -------- | ------------- | --------------------------------------------- |
| 类型系统 | `types/`      | 所有接口、类型别名的唯一定义源                |
| 工具层   | `utils/`      | 零依赖纯函数：UUID、脱敏、环境检测            |
| 传输层   | `transport/`  | 三种上报通道：fetch、sendBeacon、image beacon |
| 核心引擎 | `core/`       | 调度中心：Tracker + 会话 + 队列 + 上下文      |
| 采集器   | `collectors/` | 自动化数据源：错误、性能、PV、行为            |
| 框架插件 | `plugins/`    | Vue 3 Plugin + Axios interceptor              |
| 统一入口 | `index.ts`    | 对外导出全部公共 API                          |

---

## 3. 分层解析

### 3.1 类型系统（types/）

#### `config.ts` — 配置类型（88 行）

| 类型              | 说明                                          |
| ----------------- | --------------------------------------------- |
| `EventPriority`   | `"error" \| "perf" \| "behavior" \| "metric"` |
| `TransportMethod` | `"fetch" \| "beacon" \| "image"`              |
| `TrackingConfig`  | SDK 初始化配置接口，14 个可选字段             |
| `ResolvedConfig`  | 内部使用的完整配置，所有字段已填充默认值      |

**`TrackingConfig`** **字段说明**：

| 字段            | 类型                        |       默认值        | 说明                         |
| --------------- | --------------------------- | :-----------------: | ---------------------------- |
| `appId`         | `string`                    |      **必填**       | 应用标识，用于区分三个子应用 |
| `endpoint`      | `string`                    |      **必填**       | 上报端点，如 `/api/v1/track` |
| `batchEndpoint` | `string`                    | `endpoint + /batch` | 批量上报端点                 |
| `enabled`       | `boolean`                   |       `true`        | 全局开关，false 则 SDK 静默  |
| `debug`         | `boolean`                   |       `false`       | 调试日志                     |
| `maxQueueSize`  | `number`                    |        `200`        | 内存队列最大容量             |
| `batchSize`     | `number`                    |        `50`         | 批量发送阈值                 |
| `flushInterval` | `number`                    |       `10000`       | 定时冲刷间隔（ms）           |
| `maxRetries`    | `number`                    |         `3`         | 最大重试次数                 |
| `retryBaseMs`   | `number`                    |       `1000`        | 重试指数退避基数             |
| `sampleRate`    | `number`                    |         `1`         | 全局采样率（0-1）            |
| `headers`       | `Record<string,string>`     |        `{}`         | 自定义请求头                 |
| `beforeSend`    | `(event) => event \| false` |       `null`        | 发送前过滤回调               |

#### `events.ts` — 事件模型（85 行）

| 类型                | 说明                                            |
| ------------------- | ----------------------------------------------- |
| `ClientEnv`         | 客户端环境信息（OS/浏览器/设备/网络/语言/时区） |
| `BaseTrackingEvent` | 事件基类，16 个公共字段                         |
| `TrackingEvent`     | 完整事件 = 基类 + priority + properties         |
| `BatchPayload`      | 批量上报请求体（events + timestamp + batch_id） |

**`TrackingEvent`** **公共字段全览**：

| 字段           | 来源                | 说明                       |
| -------------- | ------------------- | -------------------------- |
| `event_id`     | `uuidv7()`          | UUID v7，时间有序          |
| `event_name`   | 调用者传入          | 事件名，snake_case         |
| `app_id`       | 配置                | 应用标识                   |
| `user_id`      | `setUserId()`       | 登录用户 ID，未登录为 null |
| `anonymous_id` | localStorage        | 匿名用户标识，长期稳定     |
| `session_id`   | sessionStorage      | 会话 ID，标签页级别        |
| `device_id`    | localStorage        | 设备 ID，永不过期          |
| `timestamp`    | `new Date()`        | 客户端 ISO 8601 毫秒时间戳 |
| `client_env`   | `detectEnv()`       | OS/浏览器/设备/网络/语言   |
| `page_url`     | `location.href`     | 已脱敏的当前 URL           |
| `page_title`   | `document.title`    | 页面标题                   |
| `referrer`     | `document.referrer` | 来源 URL                   |
| `sdk_version`  | 常量                | SDK 版本号                 |
| `priority`     | 调用者传入          | 事件优先级                 |
| `properties`   | 调用者传入          | 自定义属性 JSON            |

### 3.2 工具层（utils/）

#### `uuid.ts` — UUID v7 生成器（70 行）

**算法特性**：

- 前 48 位 = UNIX 毫秒时间戳，保证时间有序
- 同一毫秒内通过计数器单调递增
- 使用 `crypto.getRandomValues()` 生成随机位
- 降级方案：`Math.random()` × 256
- 输出格式：`019a6f80-1234-7abc-8def-0123456789ab`

**方法**：

| 方法       | 返回     | 说明                         |
| ---------- | -------- | ---------------------------- |
| `uuidv7()` | `string` | 生成一个 UUID v7，无外部依赖 |

**关键路径**：检查 `lastTimestamp` → 同毫秒递增 `counter` → 生成 10 字节随机 → 按 RFC 9562 组装。

#### `sanitize.ts` — 数据脱敏引擎（180 行）

**三层防护**：

```
Level 1: 字段黑名单
  password / token / secret / apikey / auth / credential
  → 直接删除属性

Level 2: 字段脱敏
  email / phone / idcard / name / address
  → 替换值为 [REDACTED]

Level 3: 正则扫描
  身份证号(18位) / 手机号(11位) / 邮箱格式
  → 匹配到的子串替换为 [REDACTED]
```

**方法**：

| 方法                           | 签名                                  | 说明                                     |
| ------------------------------ | ------------------------------------- | ---------------------------------------- |
| `sanitizeObject(obj, depth)`   | `(unknown, number) => unknown`        | 递归脱敏，最大深度 5 防止栈溢出          |
| `sanitizeUrl(url)`             | `(string) => string`                  | 清洗 URL 中的 token/code/sign 等敏感参数 |
| `containsSurveyContent(props)` | `(Record<string,unknown>) => boolean` | 检测属性中是否疑似包含答卷文本内容       |

**关键流程**（`sanitizeObject`）：

1. 深度检查 → 超过 5 层直接返回
2. null/非对象 → 直接返回
3. 字符串 → `sanitizeString()` 正则脱敏
4. 数组 → 递归每个元素
5. 对象 → 遍历 key：命中 blocklist 删除，命中 redact 替换，否则递归 value

#### `env.ts` — 环境检测器（115 行）

**方法**：

| 方法                       | 返回                      | 检测方式                   |
| -------------------------- | ------------------------- | -------------------------- |
| `detectEnv()`              | `ClientEnv`               | 聚合检测，返回完整环境对象 |
| `detectOS(ua)`             | `string`                  | UA 字符串匹配 7 种系统     |
| `detectBrowser(ua)`        | `string`                  | UA 匹配 6 种浏览器         |
| `detectBrowserVersion(ua)` | `string`                  | 正则提取主版本号           |
| `detectDeviceType(ua)`     | `desktop\|mobile\|tablet` | UA + 屏幕尺寸联合判断      |
| `detectNetworkType()`      | `string`                  | Network Information API    |

**设备类型判断逻辑**：

```
含 tablet/playbook/silk              → tablet
含 android 但不含 mobile              → tablet
含 mobi/android/iphone/ipod/iemobile  → mobile
其他全部                              → desktop
```

### 3.3 传输层（transport/）

#### `fetch.ts` — Fetch 批量上报（95 行）

| 方法                                                   | 说明                                                            |
| ------------------------------------------------------ | --------------------------------------------------------------- |
| `sendBatch(endpoint, payload, headers?, timeoutMs?)`   | POST JSON 批量发送，AbortController 超时控制，`keepalive: true` |
| `sendSingleWithKeepalive(endpoint, payload, headers?)` | 单条 fire-and-forget 发送                                       |

**`sendBatch`** **流程**：

1. 创建 `AbortController` + 5 秒超时
2. `JSON.stringify(payload)` → `fetch(endpoint, { method: 'POST', body, keepalive: true })`
3. 检查 `resp.ok`，状态码 >= 400 抛出 `Error`
4. finally 中清除定时器

**失败处理**：调用方（Tracker）捕获异常后执行指数退避重试。

#### `beacon.ts` — sendBeacon 上报（71 行）

| 方法                                     | 返回      | 说明                              |
| ---------------------------------------- | --------- | --------------------------------- |
| `sendBeacon(endpoint, payload)`          | `boolean` | 单条 Blob + application/json 发送 |
| `sendBeaconBatch(endpoint, payloadList)` | `number`  | 批量逐条发送，返回成功数          |

**为什么用 Blob？**
`navigator.sendBeacon()` 默认 Content-Type 为 `text/plain`，使用 `new Blob([payload], { type: 'application/json' })` 可强制 `application/json`，让服务端正确解析。

**失败条件**：

- `navigator.sendBeacon` 不存在（极旧浏览器）
- body 超过浏览器限制（通常 64KB）
- `new Blob()` 抛出异常

#### `fallback.ts` — Image Beacon 降级（61 行）

| 方法                          | 返回      | 说明                    |
| ----------------------------- | --------- | ----------------------- |
| `imageBeacon(endpoint, data)` | `boolean` | 创建 1x1 Image GET 请求 |

**限制**：

- 仅 GET 请求
- URL 总长约 2000 字符
- 仅适用于极小事件（裁切每个属性值 ≤ 100 字符）

**使用场景**：仅当 fetch 和 sendBeacon 都不可用时作为最终兜底。

### 3.4 核心引擎（core/）

#### `session.ts` — 会话管理器（180 行）

**三个核心标识**：

| 标识           | 存储           | 生命周期                           | 用途                       |
| -------------- | -------------- | ---------------------------------- | -------------------------- |
| `session_id`   | sessionStorage | 标签页级别，空闲 30 分钟后自动续期 | 串联用户单次访问的所有事件 |
| `device_id`    | localStorage   | 永久，除非手动清除                 | 跨会话设备去重             |
| `anonymous_id` | localStorage   | 永久                               | 未登录用户的身份锚点       |

**类** **`SessionManager`**：

| 方法/属性              | 说明                                |
| ---------------------- | ----------------------------------- |
| `get sessionId`        | getter，返回当前会话 ID（自动续期） |
| `get deviceId`         | getter，返回设备 ID                 |
| `get anonymousId`      | getter，返回匿名用户 ID             |
| `refreshAnonymousId()` | 用户注销后刷新匿名 ID               |

**空闲检测逻辑**：

```
每次访问 sessionId getter 时：
  now - lastActivity > 30min ?
    YES → 生成新 sessionId + 写入 sessionStorage
  update lastActivity = now
```

**单例模式**：`getSessionManager(deviceId?)` 全局唯一实例，避免多个实例导致 ID 不一致。

#### `queue.ts` — 缓冲队列（141 行）

**类** **`EventQueue`**：

| 方法/属性        | 说明                                             |
| ---------------- | ------------------------------------------------ |
| `enqueue(event)` | 推入事件，返回 true（入队）/ false（应直接发送） |
| `flush()`        | 立即冲刷队列，并发锁防止重复执行                 |
| `get size`       | 当前队列长度                                     |
| `get events`     | 只读事件列表                                     |
| `destroy()`      | 清除定时器                                       |

**冲刷触发条件（三选一）**：

| 条件     | 逻辑                                                         |
| -------- | ------------------------------------------------------------ |
| 批量阈值 | `buffer.length >= 50` → 立即 `flush()`                       |
| 定时触发 | `setInterval` 每 10s 检查 → `buffer.length > 0` 则 `flush()` |
| 手动调用 | `tracker.flush()` → `queue.flush()`                          |

**满队列淘汰策略**：

```
buffer.length >= maxSize (200) →
  找到第一个 priority !== "error" 的事件 → 删除
  如果全为 error 事件（理论上不可能）→ 丢弃新事件
```

**并发保护**：`flushing` 标志位，正在冲刷时不重复触发。

#### `context.ts` — 上下文构建器（96 行）

**类** **`ContextBuilder`**：

| 方法                                | 说明                            |
| ----------------------------------- | ------------------------------- |
| `buildEvent(name, priority, props)` | 组装完整的 `TrackingEvent` 对象 |
| `shouldSample(priority)`            | 按优先级判断是否采样            |
| `setUserId(id)`                     | 更新当前用户 ID                 |

**采样率表**（硬编码在 SDK 内部，非配置项）：

|   优先级   | 采样率 | 理由                          |
| :--------: | :----: | ----------------------------- |
|  `error`   |  100%  | 错误极其重要，全量上报        |
|   `perf`   |  100%  | 性能指标基数小，全量          |
| `behavior` |  10%   | 点击/滚动高频，采样控制数据量 |
|  `metric`  |  100%  | 业务指标低频，全量            |

**`buildEvent`** **组装流程**：

1. 从 `SessionManager` 取 session_id / device_id / anonymous_id
2. `detectEnv()` 生成 client_env
3. `sanitizeUrl(location.href)` 清洗 URL
4. 获取 document.title / document.referrer
5. 合并所有公共字段 + 调用者属性 → 返回完整 `TrackingEvent`

#### `tracker.ts` — 主追踪器（355 行）

SDK 的**调度中心**，所有外部调用最终汇入此类。

**类** **`Tracker`**：

| 公开方法                        | 说明                                 |
| ------------------------------- | ------------------------------------ |
| `constructor(config)`           | 解析配置 + 创建队列 + 注册卸载监听器 |
| `init()`                        | 标记已初始化，防重复                 |
| `track(name, priority, props?)` | **核心埋点方法**，详见下方流程       |
| `setUserId(id)`                 | 设置登录用户 ID                      |
| `flush()`                       | 手动冲刷队列                         |
| `get queueSize`                 | 队列当前长度                         |
| `get isInitialized`             | 是否已初始化                         |

**`track()`** **方法的完整流水线（6 步）**：

```
Step 1: enabled 检查
  config.enabled === false → 直接 return

Step 2: 采样判断
  context.shouldSample(priority)
    behavior 事件 90% 概率在此被丢弃

Step 3: 数据安全
  sanitizeObject(properties)       ← 字段黑名单 + 正则脱敏
  containsSurveyContent(result)    ← 答卷文本检测
  检测到敏感内容 → debug log + 丢弃事件

Step 4: 事件组装
  context.buildEvent(name, priority, safeProps)
  自动填充 16 个公共字段
  event.event_id = uuidv7()

Step 5: beforeSend 过滤
  config.beforeSend(event)
    返回 false → 丢弃事件
    返回修改后的事件 → 合并到 event

Step 6: 路由分发
  priority === "error" ?
    → transmitImmediate(event)    sendBeacon → 失败降级 fetch
    → queue.enqueue(event)       入缓冲队列等待批量发送
```

**内部方法**：

| 方法                       | 说明                                                 |
| -------------------------- | ---------------------------------------------------- |
| `resolveConfig(input)`     | 合并用户配置与默认值，生成 `ResolvedConfig`          |
| `transmitImmediate(event)` | 错误事件直发：sendBeacon → 失败降级 fetch keepalive  |
| `transmitBatch(events)`    | 批量发送：fetch POST + 指数退避重试（maxRetries 次） |
| `setupUnloadListener()`    | 注册 visibilitychange + beforeunload + pagehide 监听 |
| `handlePageUnload()`       | 页面卸载时将队列中所有事件通过 sendBeacon 逐条发送   |

**重试策略**：

```
第 0 次（首次）：立即发送
失败 → 等待 retryBaseMs × 2^0 = 1000ms
第 1 次：重试
失败 → 等待 retryBaseMs × 2^1 = 2000ms
第 2 次：重试
失败 → 等待 retryBaseMs × 2^2 = 4000ms
第 3 次（最后一次）：重试
失败 → throw Error（由队列层 catch，事件重回队首）
```

**异常安全原则**：`transmitImmediate()` 中所有代码包裹在 try-catch 中，埋点失败**绝不抛异常到业务层**。

### 3.5 采集器（collectors/）

#### `error.ts` — 错误采集器（168 行）

**类** **`ErrorCollector`**：

| 方法                           | 说明                |
| ------------------------------ | ------------------- |
| `register()`                   | 注册 3 个全局监听器 |
| `reportError(error, context?)` | 手动上报可恢复错误  |

**三个自动监听器**：

| 监听器                                          | 捕获内容                        |    上报事件名    |
| ----------------------------------------------- | ------------------------------- | :--------------: |
| `window.addEventListener('error')`              | JS 运行时错误（ErrorEvent）     |    `js_error`    |
| `window.addEventListener('unhandledrejection')` | Promise 未捕获异常              |    `js_error`    |
| `window.addEventListener('error', ..., true)`   | 资源加载失败（script/link/img） | `resource_error` |

**错误信息压缩**：

- `error_message`：截断到 500 字符
- `error_stack`：截断到 2048 字符
- `resource_url`：截断到 2048 字符
- 额外属性：`error_type`、`filename`、`lineno`、`colno`、`rejection_type`

#### `performance.ts` — 性能采集器（309 行）

**类** **`PerformanceCollector`**：

| 方法                                    | 说明                          |
| --------------------------------------- | ----------------------------- |
| `register()`                            | 注册 5 个 PerformanceObserver |
| `trackTiming(name, duration, context?)` | 手动上报自定义计时            |

**采集的指标**：

| 指标                       | 缩写 | 观察器类型                 | 说明                                  |
| -------------------------- | :--: | -------------------------- | ------------------------------------- |
| First Contentful Paint     | FCP  | `paint`                    | 首次内容渲染                          |
| Largest Contentful Paint   | LCP  | `largest-contentful-paint` | 最大内容渲染                          |
| Time to Interactive (近似) | TTI  | Navigation Timing          | `domInteractive` 时间                 |
| Cumulative Layout Shift    | CLS  | `layout-shift`             | 累积布局偏移（不含用户交互偏移）      |
| Interaction to Next Paint  | INP  | `event`                    | 最大交互延迟                          |
| DNS 解析                   |  —   | Navigation Timing          | `domainLookupEnd - domainLookupStart` |
| TCP 连接                   |  —   | Navigation Timing          | `connectEnd - connectStart`           |
| TTFB                       |  —   | Navigation Timing          | `responseStart - requestStart`        |

**慢资源阈值**：仅上报 > 500ms 的资源，避免数据膨胀。

**长任务上报**：仅上报 > 500ms 的 longtask，过滤普通的 50-500ms 任务。

**LCP 最终确定时机**：

```
触发条件（任一满足）：
  • window load 事件
  • 用户首次交互（keydown / click / scroll）
```

**CLS 最终确定时机**：

```
触发条件（任一满足）：
  • pagehide 事件
  • visibilitychange → hidden
```

**上报时机**：Navigation Timing 采集后延迟 2 秒发送，确保所有 Web Vital 观察器都有足够时间触发。

#### `page-view.ts` — 页面浏览采集器（140 行）

**类** **`PageViewCollector`**：

| 方法                | 说明                                                  |
| ------------------- | ----------------------------------------------------- |
| `register(router?)` | 注册 PV 监听，支持 Vue Router 和 History API 两种模式 |

**两种采集模式**：

| 模式        | 触发条件             | 实现方式                                                         |
| ----------- | -------------------- | ---------------------------------------------------------------- |
| SPA（推荐） | 传入 Vue Router 实例 | `router.afterEach()` 钩子                                        |
| 通用 Web    | 未传入 router        | 包装 `history.pushState/replaceState` + 监听 popstate/hashchange |

**query 参数清洗**：自动移除 `token`, `code`, `sign`, `signature`, `access_token` 等敏感参数。

**首次上报**：`register()` 时立即上报一次当前页面的 PV。

#### `behavior.ts` — 用户行为采集器（163 行）

**类** **`BehaviorCollector`**：

| 方法         | 说明                 |
| ------------ | -------------------- |
| `register()` | 注册点击和滚动监听器 |

**点击监听**：

- 事件委托在 document 上（捕获阶段）
- 采样率：10%（`Math.random() < 0.1`）
- 仅上报交互元素：`<button>` / `<a>` / `role="button"` / `data-track-id`
- 向上遍历 DOM 树查找最近的 `data-track-id` 属性
- 提取元素文本（截断 50 字符）和 CSS class（截断 100 字符）

**滚动深度监听**：

- 4 个深度级别：25% / 50% / 75% / 100%
- 每个深度级别仅上报一次
- 使用 `requestIdleCallback` 节流检测
- 所有 4 个深度都达到后移除监听器

### 3.6 框架插件（plugins/）

#### `vue.ts` — Vue 3 插件（115 行）

**导出**：

| 导出                                     | 类型        | 说明                  |
| ---------------------------------------- | ----------- | --------------------- |
| `createTrackingPlugin(tracker, options)` | `Plugin`    | Vue 3 插件工厂        |
| `TRACKER_INJECTION_KEY`                  | `Symbol`    | provide/inject 注入键 |
| `VueTrackingPluginOptions`               | `interface` | 插件配置接口          |

**插件选项**：

| 选项               | 类型      |  默认  | 说明                               |
| ------------------ | --------- | :----: | ---------------------------------- |
| `router`           | `Router`  |   —    | Vue Router 实例                    |
| `captureErrors`    | `boolean` | `true` | 是否注册 `app.config.errorHandler` |
| `capturePageViews` | `boolean` | `true` | 是否自动采集 PV                    |

**安装时自动执行**：

1. `app.provide(TRACKER_INJECTION_KEY, tracker)` — Composition API 注入
2. `app.config.globalProperties.$tracker = tracker` — Options API 全局属性
3. `app.config.errorHandler` — 注册 Vue 错误处理器，`instance?.$options?.name` 提取组件名
4. `new PageViewCollector(tracker).register(router)` — 注册 PV 监听
5. `tracker.init()` — 如果尚未初始化

**TypeScript 类型增强**：通过 `declare module 'vue'` 为 `ComponentCustomProperties.$tracker` 添加类型。

#### `axios.ts` — Axios 拦截器（176 行）

**导出**：

| 导出                                                | 类型        | 说明       |
| --------------------------------------------------- | ----------- | ---------- |
| `installAxiosInterceptor(axios, tracker, options?)` | `void`      | 安装拦截器 |
| `AxiosInterceptorOptions`                           | `interface` | 配置接口   |

**选项**：

| 选项                     | 类型       |          默认          | 说明                 |
| ------------------------ | ---------- | :--------------------: | -------------------- |
| `capturePerformance`     | `boolean`  |         `true`         | 捕获成功请求的性能   |
| `captureErrors`          | `boolean`  |         `true`         | 捕获失败请求（500+） |
| `excludePaths`           | `RegExp[]` | `[/\/api\/v1\/track/]` | 排除路径             |
| `maxErrorResponseLength` | `number`   |         `200`          | 错误响应截断长度     |

**请求拦截器**：在 `config` 上打 `__trackStartTime` 时间戳。

**响应拦截器（成功）**：

- 计算 `duration_ms = now - __trackStartTime`
- 估算 `response_size_bytes`
- 上报 `api_perf` 事件

**响应拦截器（失败）**：

- 仅捕获 `http_status === 0`（网络错误）或 `>= 500`（服务端错误）
- 截断 `response_body` 到 `maxErrorResponseLength` 字符
- URL 中敏感参数自动清洗
- 上报 `api_error` 事件

---

## 4. 核心流程详解

### 4.1 事件从产生到发送的完整链路

```
业务代码调用 tracker.track()
          │
  ┌───────▼────────┐
  │ enabled?        │ → NO → return
  └───────┬────────┘
          │ YES
  ┌───────▼────────┐
  │ shouldSample?   │ → NO → return（behavior 90% 丢弃）
  └───────┬────────┘
          │ YES
  ┌───────▼────────┐
  │ sanitizeObject  │  脱敏：删除 password/token，替换 email/phone，
  │ +               │  正则匹配身份证/手机号/邮箱
  │ containsSurvey  │  答卷文本检测：识别 answer/response/text_value 等
  │ Content         │ → 命中 → return（debug 模式打印 warn）
  └───────┬────────┘
          │ 通过
  ┌───────▼────────┐
  │ buildEvent      │  自动填充：
  │                 │  session_id ← SessionManager.sessionId（自动续期）
  │                 │  device_id ← localStorage
  │                 │  anonymous_id ← localStorage
  │                 │  client_env ← detectEnv()
  │                 │  page_url ← sanitizeUrl(location.href)
  │                 │  timestamp ← new Date().toISOString()
  │                 │  sdk_version ← "1.0.0"
  └───────┬────────┘
          │
  ┌───────▼────────┐
  │ beforeSend?     │ → 返回 false → return
  │                 │ → 返回对象 → Object.assign(event, result)
  └───────┬────────┘
          │
  ┌───────▼──────────────┐
  │ priority === "error"?  │
  └───────┬──────┬────────┘
          │ YES  │ NO
          ▼      ▼
  ┌──────────┐  ┌──────────────┐
  │ transmit  │  │ queue.enqueue│
  │ Immediate │  │ → 满则淘汰旧│
  │           │  │ → 50条冲刷  │
  │ sendBeacon│  │ → 10s 定时  │
  │   ↓失败   │  └──────┬───────┘
  │ fetch     │         │
  │ keepalive │         ▼
  └──────────┘  ┌──────────────┐
                │ flush()       │
                │ → transmitBatch│
                │ → fetch POST  │
                │ → HTTP 失败?  │
                │   重试 3 次   │
                │   指数退避    │
                │   仍失败 →    │
                │   事件回队首  │
                └──────────────┘
```

### 4.2 页面卸载时的应急冲刷

```
visibilitychange → hidden
beforeunload
pagehide
       │
       ▼
  handlePageUnload()
       │
       ▼
  取 queue.events（只读，不清空）
       │
       ▼
  逐条 sendBeacon(endpoint, JSON.stringify(event))
       │
       ├── sendBeacon 成功 → 浏览器保证发送
       └── sendBeacon 失败 → 事件丢失（页面正在关闭，无法修复）
```

### 4.3 会话 ID 续期机制

```
用户访问页面 → sessionStorage 无 sid → uuidv7() → 写入 sessionStorage
用户操作 → tracker.track() → sessionManager.sessionId 被访问
  → now - lastActivity > 30min?
      YES → 新 sessionId → 写入 sessionStorage
      NO  → 更新 lastActivity = now
用户关闭标签页 → sessionStorage 清空 → 会话结束
用户重新打开 → 新 sessionId
```

### 4.4 用户标识体系

```
          ┌──────────────┐
          │   device_id   │  localStorage，永不过期
          │   设备指纹     │  同一设备所有会话共用
          └──────┬───────┘
                 │ 1:N
    ┌────────────┼────────────┐
    ▼            ▼            ▼
┌────────┐  ┌────────┐  ┌────────┐
│session 1│  │session 2│  │session 3│  sessionStorage，标签页级别
└───┬────┘  └───┬────┘  └───┬────┘
    │           │           │
    │    ┌──────┴──────┐    │
    │    │ anonymous_id │    │   localStorage，长期稳定
    │    │  未登录锚点   │    │
    │    └──────┬──────┘    │
    │           │           │
    └───────────┼───────────┘
                │
         ┌──────▼──────┐
         │   user_id    │  登录后关联
         │   (可选)     │  setUserId('42') → user_id = '42'
         └─────────────┘  setUserId(null)  → user_id = null
```

---

## 5. 安全与数据治理

### 5.1 多层安全防护

```
Layer 1: 客户端脱敏（SDK 内部）
  ├── sanitizeObject()：递归检查字段名
  │     blacklist → 删除  |  redact → 替换为 [REDACTED]
  ├── sanitizeString()：正则匹配
  │     身份证 18 位 / 手机号 11 位 / 邮箱格式
  ├── sanitizeUrl()：清洗 URL 参数
  │     token / code / sign / access_token / apikey
  └── containsSurveyContent()：答卷内容检测
        answer / response / text_value / user_input / comment / feedback
        → 命中 → 事件被丢弃（不是脱敏，是整条丢弃）

Layer 2: 传输层安全
  ├── HTTPS 加密传输（依赖页面协议）
  └── 内网部署 tracking-api（不暴露公网）

Layer 3: 服务端校验（tracking-api）
  ├── event_name 长度校验 1-64
  ├── app_id 白名单
  ├── timestamp 不得超过未来 5 分钟
  ├── properties JSON < 8KB
  └── IP 哈希处理（SHA256 前 16 字节），不存储明文 IP

Layer 4: 存储层安全（ClickHouse）
  ├── 明细数据 90 天 TTL 自动删除
  ├── 聚合数据脱敏存储
  └── 列级访问控制
```

### 5.2 Opt-out 机制

用户可通过以下方式完全退出埋点追踪：

```ts
// 方式 1：全局变量（页面加载前设置）
window.__TRACKING_OPT_OUT__ = true;

// 方式 2：localStorage（持久化）
localStorage.setItem("tracking_opt_out", "true");
```

SDK 初始化时检测此标志，若为 true 则跳过所有采集逻辑。

---

## 6. API 参考手册

### 6.1 主入口导出

```ts
// 核心
export { Tracker } from "./core/tracker.js";
export { ContextBuilder } from "./core/context.js";
export { EventQueue } from "./core/queue.js";
export { getSessionManager } from "./core/session.js";

// 采集器
export { ErrorCollector } from "./collectors/error.js";
export { PerformanceCollector } from "./collectors/performance.js";
export { PageViewCollector } from "./collectors/page-view.js";
export { BehaviorCollector } from "./collectors/behavior.js";

// 传输层
export { sendBatch, sendSingleWithKeepalive } from "./transport/fetch.js";
export { sendBeacon, sendBeaconBatch } from "./transport/beacon.js";
export { imageBeacon } from "./transport/fallback.js";

// 工具
export { uuidv7 } from "./utils/uuid.js";
export { sanitizeObject, sanitizeUrl, containsSurveyContent } from "./utils/sanitize.js";
export { detectEnv } from "./utils/env.js";

// 类型
export type { TrackingConfig, EventPriority, ClientEnv, TrackingEvent, BatchPayload, ... };

// 版本
export { SDK_VERSION } from "./core/context.js";
```

### 6.2 事件优先级速查

|  priority  | 适用场景             | 采样率 | 发送方式        | 示例事件                                       |
| :--------: | -------------------- | :----: | --------------- | ---------------------------------------------- |
|  `error`   | JS/API/资源/SSE 错误 |  100%  | sendBeacon 即时 | `js_error`, `api_error`, `resource_error`      |
|   `perf`   | 页面/API/资源性能    |  100%  | 队列批量        | `page_perf`, `api_perf`, `resource_perf`       |
| `behavior` | 用户交互/页面浏览    |  10%   | 队列批量        | `page_view`, `component_click`, `scroll_depth` |
|  `metric`  | 业务指标             |  100%  | 队列批量        | `ai_usage_daily`, `template_apply`             |

### 6.3 业务事件命名规范

```text
    对象_动作[_状态]
    ↓    ↓      ↓
  editor_create_survey
  survey_submit_success
  admin_approve_review
  editor_use_ai_generate

规则：
  • snake_case
  • 仅小写字母、数字、下划线
  • 对象在前，动作在后
  • 最多 3 层（对象_动作_状态）
```

---

## 7. 接入指南

### 7.1 q-editor 接入

```ts
// main.ts
import { Tracker, ErrorCollector, PerformanceCollector, BehaviorCollector } from "monorepo-tracking-sdk";
import { createTrackingPlugin } from "monorepo-tracking-sdk/plugins/vue";
import { installAxiosInterceptor } from "monorepo-tracking-sdk/plugins/axios";
import axios from "axios";
import router from "./router";

const tracker = new Tracker({
  appId: "q-editor",
  endpoint: "/api/v1/track",
  debug: import.meta.env.DEV
});

// Vue 插件（自动 PV + Vue 错误）
app.use(createTrackingPlugin(tracker, { router }));

// Axios 拦截器（API 性能 + 错误）
installAxiosInterceptor(axios, tracker);

// 采集器注册
new ErrorCollector(tracker).register();
new PerformanceCollector(tracker).register();
new BehaviorCollector(tracker).register();

// 编辑器关键操作埋点示例
// 在 useEditorStore 中：
tracker.track("editor_create_survey", "behavior", { source: "scratch" });
tracker.track("editor_add_component", "behavior", { component_type: "single-select" });
tracker.track("editor_use_ai_generate", "metric", {
  prompt_length: prompt.length,
  generated_count: components.length,
  elapsed_ms: Date.now() - startTime
});
tracker.track("editor_publish_survey", "behavior", {
  survey_id: savedId,
  component_count: coms.length
});
```

### 7.2 frontend 接入

```ts
const tracker = new Tracker({
  appId: "frontend",
  endpoint: "/api/v1/track",
  headers: { Authorization: `Bearer ${getToken()}` }
});

// 管理操作埋点
tracker.track("admin_approve_review", "behavior", {
  review_id: id,
  review_type: "survey"
});
tracker.track("admin_ban_user", "behavior", {
  target_user_id: userId,
  duration_minutes: minutes
});
```

### 7.3 main-app 接入

```ts
const tracker = new Tracker({
  appId: "main-app",
  endpoint: "/api/v1/track"
  // 基座应用只关心加载性能和基座路由
});

new PerformanceCollector(tracker).register(); // 子应用加载耗时
new PageViewCollector(tracker).register(); // 基座路由变化
```

### 7.4 C 端答卷页接入

```ts
// SurveyView.vue
import { inject } from "vue";
import { TRACKER_INJECTION_KEY } from "monorepo-tracking-sdk/plugins/vue";

const tracker = inject(TRACKER_INJECTION_KEY)!;

// 打开问卷
tracker.track("survey_view", "behavior", {
  survey_id: surveyId,
  is_public: true
});

// 提交
tracker.track("survey_submit_start", "behavior", {
  survey_id: surveyId,
  answered_count: answered,
  total_count: total
});
// ... 提交请求 ...
tracker.track("survey_submit_success", "behavior", {
  survey_id: surveyId,
  answered_count: answered,
  elapsed_s: (Date.now() - start) / 1000
});

// 弃填（页面卸载时自动通过 sendBeacon 上报）
window.addEventListener("beforeunload", () => {
  tracker.track("survey_abandon", "behavior", {
    survey_id: surveyId,
    answered_count: answered,
    total_count: total,
    stay_s: (Date.now() - openTime) / 1000
  });
});
```

---

## 附录

### A. 文件清单

```
packages/tracking-sdk/
├── package.json              (42 行)  monorepo 包配置
├── tsconfig.json             (25 行)  Strict TypeScript 编译配置
├── README.md                 (本文件)
├── dist/                     (构建产物）
└── src/
    ├── index.ts              (87 行)  统一导出 + API 文档
    ├── types/
    │   ├── index.ts           (8 行)  类型统一导出
    │   ├── config.ts         (88 行)  配置接口定义
    │   └── events.ts         (85 行)  事件数据模型
    ├── utils/
    │   ├── index.ts           (9 行)  工具统一导出
    │   ├── uuid.ts           (70 行)  UUID v7 生成器
    │   ├── sanitize.ts      (180 行)  三层数据脱敏引擎
    │   └── env.ts           (115 行)  环境自动检测
    ├── core/
    │   ├── index.ts          (10 行)  核心统一导出
    │   ├── tracker.ts       (355 行)  主追踪器（调度中心）
    │   ├── session.ts       (180 行)  会话/设备/匿名标识管理
    │   ├── queue.ts         (141 行)  内存缓冲队列
    │   └── context.ts        (96 行)  事件上下文构建
    ├── collectors/
    │   ├── index.ts          (10 行)  采集器统一导出
    │   ├── error.ts         (168 行)  错误自动采集
    │   ├── performance.ts   (309 行)  Web Vitals 性能采集
    │   ├── page-view.ts     (140 行)  PV 页面浏览采集
    │   └── behavior.ts      (163 行)  用户行为采集
    ├── transport/
    │   ├── index.ts           (9 行)  传输层统一导出
    │   ├── fetch.ts          (95 行)  fetch 批量上报
    │   ├── beacon.ts         (71 行)  sendBeacon 上报
    │   └── fallback.ts       (61 行)  Image Beacon 降级
    └── plugins/
        ├── vue.ts           (115 行)  Vue 3 插件
        └── axios.ts         (176 行)  Axios 拦截器

总文件数：24 个 TypeScript 源文件
总代码量：约 2,600 行（不含空行和注释约 2,100 行）
```

### B. 依赖关系图

```text
index.ts
├── core/tracker.ts
│   ├── core/context.ts
│   │   ├── core/session.ts → utils/uuid.ts
│   │   └── utils/env.ts
│   ├── core/queue.ts
│   ├── utils/sanitize.ts
│   └── transport/index.ts
│       ├── transport/fetch.ts
│       ├── transport/beacon.ts
│       └── transport/fallback.ts
├── collectors/error.ts → core/tracker.ts
├── collectors/performance.ts → core/tracker.ts
├── collectors/page-view.ts → core/tracker.ts
├── collectors/behavior.ts → core/tracker.ts
├── plugins/vue.ts → core/tracker.ts, collectors/error.ts, collectors/page-view.ts
└── plugins/axios.ts → core/tracker.ts
```

### C. 兼容性

| 能力       | 要求                                          |
| ---------- | --------------------------------------------- |
| 浏览器     | Chrome 72+, Firefox 78+, Safari 14+, Edge 79+ |
| Vue        | 3.5+                                          |
| Vue Router | 4.0+                                          |
| Axios      | 1.0+                                          |
| TypeScript | 5.0+                                          |

### D. 性能开销

| 指标                     |    估值    | 说明                       |
| ------------------------ | :--------: | -------------------------- |
| SDK gzip 体积            |   \~5KB    | 无运行时依赖               |
| track() 调用耗时         |   < 1ms    | 纯同步操作（不含网络 I/O） |
| 内存占用                 |   < 50KB   | 200 条事件缓冲             |
| PerformanceObserver 开销 | < 0.1% CPU | 浏览器原生异步 API         |

---

> **相关文档**：[监控全链路设计方案](../../docs/监控全链路设计方案.md) — 服务端接收端、ClickHouse 存储、告警机制
>
> **维护者**：问卷系统团队 · **最后更新**：2026-06-27
