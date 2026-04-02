# 低代码问卷编辑器系统

## 项目简介

低代码问卷编辑器系统是一个基于Vue 3 + TypeScript开发的企业级低代码平台，旨在通过可视化拖拽和配置的方式快速创建各类问卷。系统支持多种题型组件，具备实时预览、本地存储、PDF导出、在线答题等核心功能，大幅降低问卷创建门槛，提高工作效率。

## 项目架构

本项目采用pnpm monorepo架构，将前端和后端分离管理，便于代码维护和版本控制。

```
├── app/
│   ├── q-editor/         # 低代码问卷编辑器前端
│   ├── backend/          # 后端服务（提供API接口）
│   └── frontend/         # 基础前端项目
├── packages/             # 共享组件和工具库
├── docs/                 # 项目文档
├── temp/                 # 临时文件
├── package.json          # 根项目配置
└── pnpm-workspace.yaml   # pnpm工作空间配置
```

## 技术栈

### 前端技术栈

- **框架**：Vue 3 + TypeScript
- **状态管理**：Pinia
- **路由**：Vue Router
- **UI组件库**：Element Plus
- **样式**：SCSS
- **构建工具**：Vite
- **图标库**：Font Awesome
- **拖拽组件**：vuedraggable
- **本地存储**：Dexie.js (IndexedDB)

### 后端技术栈

- **框架**：Express.js
- **数据库**：MySQL + Sequelize
- **文件上传**：Multer
- **环境配置**：dotenv
- **跨域处理**：CORS

### 开发工具

- **包管理**：pnpm
- **代码规范**：ESLint + Prettier
- **Git钩子**：Husky + Commitlint + Lint-staged
- **拼写检查**：cspell

## 核心功能

### 1. 低代码编辑器

- **拖拽式界面**：通过拖拽方式添加和调整问卷组件
- **实时预览**：编辑过程中即时查看问卷效果
- **组件配置**：支持标题、描述、样式、选项等属性的实时配置
- **组件库**：提供10+种问卷组件类型，包括单选、多选、文本输入、日期时间、评分、图片选择等

### 2. 素材库管理

- **分类管理**：将组件分为选择题、输入题、高级组件、个人信息、联系方式等类别
- **组件预览**：每个组件都有详细的预览和使用说明
- **快速添加**：从素材库中快速添加组件到问卷

### 3. 数据管理

- **本地存储**：使用IndexedDB存储问卷数据，支持离线使用
- **数据同步**：确保编辑器、预览页面和存储数据的一致性
- **版本管理**：支持问卷的历史记录和回滚功能

### 4. 图片上传

- **拖拽上传**：支持图片的拖拽上传
- **图片管理**：支持图片的预览、删除等操作
- **URL生成**：自动生成图片URL，确保图片资源的正确引用

### 5. 导出功能

- **PDF导出**：支持将问卷导出为PDF格式
- **在线答题**：支持在线填写问卷并提交

## 安装与运行

### 环境要求

- Node.js >= 22.17.0
- pnpm >= 10.12.4
- MySQL (可选，用于后端服务)

### 安装步骤

1. **克隆项目**

   ```bash
   git clone <项目地址>
   cd questionnaireSys
   ```

2. **安装依赖**

   ```bash
   pnpm install
   ```

3. **配置环境变量**
   - 在 `app/backend` 目录下创建 `.env` 文件
   - 配置数据库连接和端口等信息

   ```
   # .env
   PORT=3000
   NODE_ENV=development
   DB_HOST=localhost
   DB_PORT=3306
   DB_USER=root
   DB_PASSWORD=your_password
   DB_NAME=questionnaire_db
   CORS_ORIGIN=*
   ```

4. **启动服务**
   - 同时启动前端和后端服务

   ```bash
   pnpm start
   ```

   - 单独启动前端服务

   ```bash
   cd app/q-editor
   pnpm dev
   ```

   - 单独启动后端服务

   ```bash
   cd app/backend
   pnpm dev
   ```

### 访问地址

- 前端问卷编辑器：http://localhost:5173
- 后端API服务：http://localhost:3000

## 项目结构详解

### 前端项目结构 (app/q-editor)

```
├── src/
│   ├── assets/          # 静态资源
│   ├── components/      # 组件
│   │   ├── Common/      # 通用组件
│   │   ├── Editor/      # 编辑器相关组件
│   │   └── SurveyComs/  # 问卷组件
│   ├── configs/         # 配置文件
│   ├── db/              # 数据库操作
│   ├── stores/          # 状态管理
│   ├── types/           # TypeScript类型定义
│   ├── utils/           # 工具函数
│   ├── views/           # 页面
│   │   ├── EditorView/  # 编辑器页面
│   │   ├── Layout/      # 布局页面
│   │   ├── MaterialsView/ # 素材库页面
│   │   └── preview/     # 预览页面
│   ├── App.vue          # 应用根组件
│   ├── main.ts          # 应用入口
│   └── router/          # 路由配置
├── package.json         # 项目配置
└── vite.config.ts       # Vite配置
```

### 后端项目结构 (app/backend)

```
├── src/
│   ├── config/          # 配置文件
│   ├── controllers/     # 控制器
│   ├── middlewares/     # 中间件
│   ├── models/          # 数据模型
│   ├── routes/          # 路由
│   └── index.js         # 应用入口
├── package.json         # 项目配置
└── uploads/             # 上传文件存储
```

## 核心API

### 后端API

#### 图片上传

- **接口**：`POST /api/q-editor/upload`
- **功能**：上传图片文件
- **参数**：`file` (multipart/form-data)
- **返回**：包含图片URL的JSON响应

#### 健康检查

- **接口**：`GET /health`
- **功能**：检查服务状态
- **返回**：服务状态信息

### 前端API

#### 数据库操作

- `saveSurvey(data)`：保存问卷数据
- `getAllSurvey()`：获取所有问卷数据
- `getSurveyById(id)`：根据ID获取问卷数据
- `deleteSurveyById(id)`：根据ID删除问卷数据
- `updateSurveyById(id, data)`：根据ID更新问卷数据

## 开发指南

### 代码规范

- **ESLint**：代码质量检查
- **Prettier**：代码格式化
- **TypeScript**：类型检查
- **cspell**：拼写检查

### 提交规范

- 使用 `pnpm commit` 命令进行规范化提交
- 提交信息格式：`type(scope): subject`
- 支持的type：feat, fix, docs, style, refactor, test, chore

### 开发流程

1. 创建分支：`git checkout -b feature/xxx`
2. 开发功能：实现代码逻辑
3. 运行检查：`pnpm lint`
4. 提交代码：`pnpm commit`
5. 推送到远程：`git push origin feature/xxx`
6. 创建PR：提交合并请求

## 性能优化

1. **组件懒加载**：使用Vue Router的懒加载功能减少初始加载体积
2. **虚拟滚动**：优化长列表渲染性能
3. **响应式数据优化**：使用computed和watch合理管理响应式数据
4. **图片优化**：支持图片压缩和懒加载
5. **打包优化**：使用Vite的代码分割和Tree Shaking功能

## 浏览器兼容性

- Chrome (最新版本)
- Firefox (最新版本)
- Safari (最新版本)
- Edge (最新版本)

## 未来规划

1. **云存储集成**：支持将问卷数据存储到云端
2. **多用户协作**：支持多人同时编辑问卷
3. **模板市场**：提供问卷模板库
4. **数据分析**：增加问卷数据的分析和可视化功能
5. **移动端适配**：优化移动端体验

---

**注意**：本项目为低代码问卷编辑器系统，旨在提供便捷的问卷创建工具，适用于企业内部调查、市场调研、用户反馈等场景。
