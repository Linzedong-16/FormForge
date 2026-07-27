<p align="center">
  <h1 align="center">FormForge</h1>
  <p align="center"><strong>开源低代码问卷/表单构建平台</strong></p>
  <p align="center">
    <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License"></a>
    <a href="#"><img src="https://img.shields.io/badge/vue-3.5-brightgreen.svg" alt="Vue 3.5"></a>
    <a href="#"><img src="https://img.shields.io/badge/fastify-5-black.svg" alt="Fastify 5"></a>
    <a href="#"><img src="https://img.shields.io/badge/pnpm-10.12.4-orange.svg" alt="pnpm 10"></a>
  </p>
</p>

---

## 简介

FormForge 是一个开源的低代码问卷与表单构建平台，提供可视化拖拽编辑器、丰富的题型组件库、实时预览、AI 智能生成问卷、在线答题与数据分析等能力。系统采用前后端分离 + 微前端架构，适合企业内部调查、市场调研、用户反馈收集等场景，也可作为 SaaS 表单服务的基座进行二次开发。

### 亮点

- **可视化低代码编辑器** —— 拖拽 + 配置即可快速搭建问卷，支持撤销/重做、组件化复用
- **AI 辅助生成** —— 基于 LangChain 接入大模型，支持自然语言描述生成问卷及内容润色（SSE 流式输出）
- **企业级后端基建** —— Fastify + Prisma + PostgreSQL + Redis + RabbitMQ + ClickHouse 全链路
- **微前端架构** —— qiankun 基座 + 多子应用并行开发，编辑器与后台管理独立部署
- **多主题国际化** —— 亮/暗主题 + 色弱模式，中/英/日三语，shadcn 视觉风格
- **完善的 infra 工具链** —— 自研埋点 SDK、SSE 流式客户端、二进制权限控制插件、问卷渲染引擎

---

## 技术栈

| 层               | 技术                                                      |
| ---------------- | --------------------------------------------------------- |
| **前端框架**     | Vue 3 + TypeScript + Vite 7                               |
| **UI 组件库**    | Element Plus + Arco Design（管理后台）                    |
| **状态管理**     | Pinia + pinia-plugin-persistedstate                       |
| **微前端**       | qiankun（基座 `main-app`，子应用 `q-editor`、`frontend`） |
| **HTTP 框架**    | Fastify 5                                                 |
| **主数据库**     | PostgreSQL + Prisma 7 ORM                                 |
| **缓存**         | Redis（ioredis）                                          |
| **消息队列**     | RabbitMQ（amqplib）                                       |
| **对象存储**     | MinIO（S3 兼容）                                          |
| **日志/文档库**  | MongoDB / Mongoose                                        |
| **分析数据库**   | ClickHouse（埋点分析）                                    |
| **AI / LLM**     | LangChain.js + Anthropic + OpenAI                         |
| **前端本地存储** | Dexie.js（IndexedDB）                                     |
| **认证**         | JWT + bcrypt                                              |
| **校验**         | Zod 4                                                     |
| **包管理**       | pnpm（monorepo）                                          |
| **代码质量**     | ESLint 9 + Prettier + Husky + Commitlint + cspell         |

---

## 项目结构

```
FormForge/
├── app/
│   ├── q-editor/              # 低代码问卷编辑器（qiankun 子应用）
│   ├── q-server/              # 后端 API 服务（Fastify 5）
│   ├── main-app/              # 微前端基座主应用（qiankun）
│   ├── frontend/              # 管理后台（qiankun 子应用，Element Plus + Arco Design）
│   ├── backend/               # [遗留] 旧版 Express 后端（不再维护）
│   └── ai-service/            # [预留] AI 独立服务
├── packages/
│   ├── common/                # 前后端共享 TypeScript 类型
│   ├── components/            # 共享 Vue 组件库
│   ├── survey-engine/         # 问卷渲染引擎（跨项目共享）
│   ├── sse-client/            # 通用 SSE 流式消费客户端
│   ├── tracking-sdk/          # 前端统一埋点监控 SDK
│   ├── bit-permission/        # 二进制位运算前端权限控制插件
│   └── utils/                 # 通用工具函数
├── pnpm-workspace.yaml
├── package.json
├── LICENSE
└── README.md
```

---

## 核心功能

### 问卷编辑器

- 拖拽式可视化编辑，支持 10+ 种题型（单选/多选/文本/评分/级联/矩阵/滑块/日期等）
- 实时预览、组件属性即时配置
- 撤销/重做快照栈（50 层历史）
- 分页问卷、题目排序、题库复用

### AI 生成与润色

- 自然语言描述 → 自动生成结构化问卷（SSE 流式输出，边生成边展示）
- 已有问卷内容智能润色/扩展
- 状态机增量 JSON 解析 + 三级容错策略，生成成功率 > 90%
- Prompt 模板体系与 Token 用量审计

### 素材库与物料管理

- 组件分类浏览（选择题/输入题/高级组件/个人信息/联系方式）
- 图片素材本地上传 / MinIO 云端存储
- 模板市场 —— 社区共享问卷模板，支持评分与搜索

### 审核与发布

- 问卷提审 → 审核（通过/驳回）→ 发布工作流
- 同步状态追踪（已同步/未同步）
- 问卷链接生成与分享

### 数据分析与埋点

- 答卷数据收集与统计
- 前端埋点 SDK（事件追踪、错误上报、性能采集）
- ClickHouse 后端聚合分析 + 可视化看板

### 消息与通知

- 系统广播消息、审核结果通知
- 消息已读状态追踪

---

## 快速开始

### 环境要求

| 依赖       | 最低版本        |
| ---------- | --------------- |
| Node.js    | >= 22.17.0      |
| pnpm       | >= 10.12.4      |
| PostgreSQL | 14+（生产环境） |
| Redis      | 6+（生产环境）  |

> 对象存储（MinIO）、消息队列（RabbitMQ）、文档库（MongoDB）、分析库（ClickHouse）为可选依赖，本地开发可不启用。

### 启动前端问卷编辑器（独立模式）

无需后端，使用浏览器 IndexedDB + Mock API：

```bash
pnpm install
cd app/q-editor
pnpm dev:mock
```

访问 http://localhost:5173

### 启动后端 + 全栈开发

1. **配置环境变量** —— 在 `app/q-server` 下创建 `.env`：

   ```bash
   DATABASE_URL="postgresql://user:password@localhost:5432/formforge"
   JWT_SECRET="your-secret-key"
   REDIS_URL="redis://localhost:6379"
   # 以下可选，不配置则对应插件降级
   RABBITMQ_URL="amqp://localhost"
   MINIO_ENDPOINT="localhost"
   MINIO_PORT=9000
   MINIO_ACCESS_KEY="minioadmin"
   MINIO_SECRET_KEY="minioadmin"
   MONGODB_URL="mongodb://localhost:27017/formforge"
   CLICKHOUSE_URL="http://localhost:8123"
   ```

2. **初始化数据库**：

   ```bash
   cd app/q-server
   pnpm prisma migrate dev
   pnpm prisma db seed
   ```

3. **启动后端**：

   ```bash
   pnpm --filter q-server dev
   ```

   服务运行在 http://localhost:3000，健康检查 http://localhost:3000/api/health

4. **启动前端**（选择其一）：

   ```bash
   # 微前端集群模式（基座 + 编辑器 + 管理后台）
   pnpm dev:micro

   # 或单独启动编辑器子应用
   pnpm --filter q-editor dev
   ```

### 运行测试

```bash
# 编辑器单元测试
pnpm --filter q-editor test

# 编辑器 E2E 测试
pnpm --filter q-editor test:e2e

# 后端类型检查
pnpm --filter q-server type-check
```

---

## API 概览

| 模块     | 前缀                | 说明                            |
| -------- | ------------------- | ------------------------------- |
| 认证     | `/api/auth`         | 登录/注册/Token 刷新/退出       |
| 用户管理 | `/api/admin`        | 用户 CRUD、角色权限、审核管理   |
| 问卷管理 | `/api/surveys`      | 问卷 CRUD、AI 生成与润色（SSE） |
| 模板市场 | `/api/templates`    | 模板上传/搜索/评分              |
| 审核     | `/api/reviews`      | 问卷提审/审批流程               |
| 物料管理 | `/api/media-assets` | 图片素材上传/引用管理           |
| 消息系统 | `/api/messages`     | 广播消息/已读追踪               |
| 埋点上报 | `/api/v1`           | 前端埋点数据收集                |
| 健康检查 | `/api/health`       | 数据库/缓存/队列/存储连通性探测 |

---

## 开发指南

### 代码规范

- TypeScript 严格模式，完整的类型声明
- ESLint 9 + Prettier，统一的代码风格
- 提交信息遵循 [Conventional Commits](https://www.conventionalcommits.org/)：`type(scope): subject`
- 使用 `pnpm commit` 交互式提交，自动生成格式化的 commit message

### 分支策略

```bash
git checkout -b feature/xxx   # 新功能
git checkout -b fix/xxx       # Bug 修复
git checkout -b refactor/xxx  # 重构
```

提交前请确保 `pnpm lint` 通过。

---

## 贡献

欢迎任何形式的贡献！无论是 Issue 反馈、PR 提交、文档改进还是功能建议。

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`pnpm commit`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 创建 Pull Request

> 较大改动建议先开 Issue 讨论设计方案，避免方向偏差。

---

## 许可证

本项目采用 [MIT License](LICENSE) 开源。

---

## 致谢

FormForge 的构建离不开以下开源项目：

- [Vue.js](https://vuejs.org/) & [Vite](https://vitejs.dev/) —— 前端框架与构建工具
- [Element Plus](https://element-plus.org/) —— UI 组件库
- [Fastify](https://fastify.dev/) —— 高性能 Node.js HTTP 框架
- [Prisma](https://www.prisma.io/) —— 下一代 ORM
- [LangChain.js](https://js.langchain.com/) —— LLM 应用开发框架
- [qiankun](https://qiankun.umijs.org/) —— 微前端解决方案
- [Dexie.js](https://dexie.org/) —— IndexedDB 封装库
