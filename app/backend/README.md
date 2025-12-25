# Express + Sequelize + Multer 后端项目

## 项目简介

这是一个基于 Express + JavaScript + Sequelize + Multer 的后端项目，采用 ESM 模块化标准开发。项目提供了用户管理、文件上传等核心功能，支持各种格式的请求解析，并具备完善的错误处理和日志记录机制。

## 技术栈

- **框架**: Express.js (v5.2.1)
- **数据库**: MySQL + Sequelize ORM (v6.37.7)
- **文件上传**: Multer (v2.0.2)
- **模块化**: ESM (ES Modules)
- **环境变量**: dotenv (v16.4.5)
- **跨域支持**: cors (v2.8.5)
- **请求解析**: body-parser (v1.20.2)
- **开发工具**: nodemon (v3.1.11)

## 项目结构

```
backend/
├── src/
│   ├── config/               # 配置文件目录
│   │   ├── db.js             # Sequelize 数据库配置
│   │   └── multer.js         # Multer 文件上传配置
│   ├── controllers/          # 控制器目录
│   │   ├── UserController.js    # 用户相关业务逻辑
│   │   └── UploadController.js  # 文件上传业务逻辑
│   ├── middlewares/          # 中间件目录
│   │   ├── errorHandler.js      # 全局错误处理中间件
│   │   └── requestLogger.js     # 请求日志记录中间件
│   ├── models/               # 数据模型目录
│   │   ├── User.js           # 用户数据模型
│   │   └── index.js          # 模型导出和数据库同步
│   ├── routes/               # 路由目录
│   │   ├── userRoutes.js      # 用户相关 API 路由
│   │   ├── uploadRoutes.js    # 文件上传 API 路由
│   │   └── index.js           # 路由统一入口
│   ├── uploads/              # 文件上传存储目录
│   └── index.js              # 应用程序入口文件
├── .env                      # 环境变量配置
├── package.json              # 项目依赖和脚本
└── README.md                 # 项目说明文档
```

## 环境要求

- Node.js >= 18.0.0
- MySQL >= 5.7.0
- npm 或 pnpm

## 安装与配置

### 1. 克隆项目

```bash
git clone <仓库地址>
cd backend
```

### 2. 安装依赖

```bash
# 使用 npm
npm install

# 使用 pnpm
pnpm install
```

### 3. 配置环境变量

复制 `.env.example` 文件为 `.env` 并修改其中的配置：

```bash
cp .env.example .env
```

`.env` 文件内容示例：

```env
# 数据库配置
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=password
DB_NAME=test_db

# 服务器配置
PORT=3000
NODE_ENV=development
CORS_ORIGIN=*
```

### 4. 初始化数据库

确保 MySQL 服务已启动，并创建了指定的数据库。项目启动时会自动创建表结构。

## 使用方法

### 启动开发服务器

```bash
# 使用 npm
npm run dev

# 使用 pnpm
pnpm dev
```

服务器将在 `http://localhost:3000` 启动。

### 启动生产服务器

```bash
# 使用 npm
npm start

# 使用 pnpm
pnpm start
```

## API 文档

### 健康检查

- **URL**: `/health`
- **方法**: `GET`
- **描述**: 检查服务器是否正常运行
- **响应示例**:
  ```json
  {
    "success": true,
    "message": "服务器运行正常",
    "timestamp": "2023-05-15T10:00:00.000Z"
  }
  ```

### 用户管理

#### 获取所有用户

- **URL**: `/api/users`
- **方法**: `GET`
- **响应示例**:
  ```json
  {
    "success": true,
    "data": [
      {
        "id": 1,
        "username": "admin",
        "email": "admin@example.com",
        "role": "admin",
        "status": true
      }
    ],
    "message": "获取所有用户成功"
  }
  ```

#### 创建用户

- **URL**: `/api/users`
- **方法**: `POST`
- **请求体**:
  ```json
  {
    "username": "newuser",
    "email": "newuser@example.com",
    "password": "password123"
  }
  ```
- **响应示例**:
  ```json
  {
    "success": true,
    "data": {
      "id": 2,
      "username": "newuser",
      "email": "newuser@example.com",
      "role": "user",
      "status": true
    },
    "message": "创建用户成功"
  }
  ```

#### 上传用户头像

- **URL**: `/api/users/:id/avatar`
- **方法**: `POST`
- **请求体**: `multipart/form-data`
- **文件字段**: `avatar`
- **响应示例**:
  ```json
  {
    "success": true,
    "data": {
      "id": 1,
      "username": "admin",
      "email": "admin@example.com",
      "avatar": "/uploads/1621000000000-avatar.jpg",
      "role": "admin",
      "status": true
    },
    "message": "上传头像成功"
  }
  ```

### 文件上传

#### 上传单个文件

- **URL**: `/api/upload`
- **方法**: `POST`
- **请求体**: `multipart/form-data`
- **文件字段**: `file`
- **响应示例**:
  ```json
  {
    "success": true,
    "data": {
      "filename": "1621000000000-file.jpg",
      "originalName": "file.jpg",
      "mimetype": "image/jpeg",
      "size": 102400,
      "path": "/uploads/1621000000000-file.jpg"
    },
    "message": "文件上传成功"
  }
  ```

#### 上传多个文件

- **URL**: `/api/upload/multiple`
- **方法**: `POST`
- **请求体**: `multipart/form-data`
- **文件字段**: `files` (最多10个文件)
- **响应示例**:
  ```json
  {
    "success": true,
    "data": [
      {
        "filename": "1621000000000-file1.jpg",
        "originalName": "file1.jpg",
        "mimetype": "image/jpeg",
        "size": 102400,
        "path": "/uploads/1621000000000-file1.jpg"
      },
      {
        "filename": "1621000000000-file2.jpg",
        "originalName": "file2.jpg",
        "mimetype": "image/jpeg",
        "size": 204800,
        "path": "/uploads/1621000000000-file2.jpg"
      }
    ],
    "message": "文件上传成功",
    "count": 2
  }
  ```

## 开发规范

### 代码风格

- 使用 ESM 模块化标准（`import`/`export`）
- 使用 2 个空格进行缩进
- 变量命名使用驼峰式命名法
- 函数命名使用驼峰式命名法
- 文件名使用 PascalCase 或 camelCase

### 目录规范

- `config/`: 存放配置文件
- `controllers/`: 存放业务逻辑控制器
- `middlewares/`: 存放中间件
- `models/`: 存放数据模型
- `routes/`: 存放路由定义
- `uploads/`: 存放上传的文件

### 错误处理

- 使用统一的错误处理中间件
- 所有 API 响应使用统一的格式：
  ```json
  {
    "success": true/false,
    "data": {...},          // 成功时返回的数据
    "message": "...",       // 响应消息
    "error": "..."          // 失败时的错误信息
  }
  ```

## 贡献指南

1. Fork 本仓库
2. 创建新的特性分支（`git checkout -b feature/AmazingFeature`）
3. 提交更改（`git commit -m 'Add some AmazingFeature'`）
4. 推送到分支（`git push origin feature/AmazingFeature`）
5. 提交 Pull Request

## 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。

## 联系方式

- 项目维护者: [Your Name]
- 邮箱: [your-email@example.com]
- 项目地址: [https://github.com/yourusername/your-repo](https://github.com/yourusername/your-repo)
