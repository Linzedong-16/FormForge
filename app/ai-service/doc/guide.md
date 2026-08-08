# ai-service 开发指南

## 环境

- Conda 环境：`form-agent`（Python 3.13）
- 端口：8090
- 中间件：由 `deploy/docker-compose.yml` 统一管理

## 快速启动

```bash
# 方式一：npm 脚本（推荐）
pnpm dev:ai

# 方式二：手动
conda activate form-agent
cd app/ai-service
uvicorn src.main:app --host 0.0.0.0 --port 8090 --reload
```

## 接口

| 端点                                 | 说明                                       |
| ------------------------------------ | ------------------------------------------ |
| `http://localhost:8090/docs`         | Swagger API 文档                           |
| `http://localhost:8090/health`       | 健康检查（含 q-server 连通性）             |
| `POST /api/v1/agent/chat`            | Agent 同步对话                             |
| `POST /api/v1/agent/chat/stream`     | Agent SSE 流式对话                         |
| `GET /api/v1/agent/types`            | 可用 Agent 类型列表                        |
| `POST /api/v1/agent/analysis`        | 问卷分析 Agent，自主循环，同步返回完整结论 |
| `POST /api/v1/agent/analysis/stream` | 问卷分析 Agent，SSE 流式推送分析过程与结论 |

分析 Agent 的自主循环机制、工具契约、SSE 事件协议详见 [architecture.md](./architecture.md)。

## 前端调用

前端不直连 ai-service，通过 q-server 代理（[app/q-server/src/modules/ai-proxy/ai-proxy.routes.ts](../../q-server/src/modules/ai-proxy/ai-proxy.routes.ts)）。路径映射：

- 通用对话类：`/api/ai/agent/chat*` → ai-service `/api/v1/agent/chat*`（登录即可调用）
- 分析类：`/api/ai/agent/analysis*` → ai-service `/api/v1/agent/analysis*`（需超级管理员权限，涉及问卷统计数据）
