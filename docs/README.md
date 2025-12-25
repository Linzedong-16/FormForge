## 安装依赖 自动检查 engines是否符合要求

> pnpm i -Dw typescript
> 版本过低控制台报错
> ERR_PNPM_UNSUPPORTED_ENGINE  Unsupported environment (bad pnpm and/or Node.js version)


## GIT 提交规范

> 使用 pnpm commit 进行提交

## 前后端请求开发流程规范

### 1. 前后端接口设计与请求连接流程

#### 1.1 后端接口设计与实现

**接口路由设计**：
- 后端使用 Express 框架，采用模块化路由设计
- 测试接口统一前缀：`/test/`
- 用户接口统一前缀：`/users/`
- 文件上传接口统一前缀：`/upload/`

**请求处理流程**：
1. 客户端发起请求到后端服务器
2. Express 路由根据请求路径匹配对应的路由处理函数
3. 路由处理函数调用相应的控制器方法
4. 控制器进行业务逻辑处理（如数据验证、数据库操作等）
5. 控制器返回统一格式的响应数据

**响应格式**：
- 目前存在两种响应格式，建议统一使用格式一
  - 格式一：`{ code: 200, message: "操作成功", data: {} }`
  - 格式二：`{ success: true, message: "操作成功", data: {} }`

**错误处理**：
- 使用中间件统一处理错误
- 根据错误类型返回不同的 HTTP 状态码和错误信息

#### 1.2 前端请求配置与实现

**Axios 配置**：
- 前端使用 Axios 库进行 HTTP 请求
- 创建自定义 Axios 实例，配置基础 URL 和超时时间
- 实现请求拦截器和响应拦截器

**请求拦截器**：
- 在请求头中添加认证信息（如 Token）
- 统一处理请求参数
- 可以添加请求加载状态

```javascript
// 请求拦截器
instance.interceptors.request.use(
  config => {
    // 在发送请求之前做些什么
    // 可以在这里添加token等认证信息
    const token = localStorage.getItem("token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  error => {
    // 处理请求错误
    console.error("请求错误:", error);
    return Promise.reject(error);
  }
);
```

**响应拦截器**：
- 统一处理响应数据格式
- 统一处理错误信息
- 可以添加响应加载状态

```javascript
// 响应拦截器
instance.interceptors.response.use(
  response => {
    // 2xx 范围内的状态码都会触发该函数
    // 对响应数据做点什么
    const res = response.data;

    // 统一处理响应格式
    if (res.code === 200) {
      return res.data;
    } else {
      // 业务错误，返回错误信息
      console.error("业务错误:", res.message);
      return Promise.reject(new Error(res.message || "请求失败"));
    }
  },
  error => {
    // 超出 2xx 范围的状态码都会触发该函数
    // 处理响应错误
    console.error("网络错误:", error);

    let errorMessage = "网络请求失败";
    if (error.response) {
      // 服务器返回了错误状态码
      const status = error.response.status;
      const data = error.response.data;

      switch (status) {
        case 400:
          errorMessage = data.message || "请求参数错误";
          break;
        case 401:
          errorMessage = "未授权，请重新登录";
          // 可以在这里处理登录过期逻辑
          break;
        case 403:
          errorMessage = "拒绝访问";
          break;
        case 404:
          errorMessage = "请求的资源不存在";
          break;
        case 500:
          errorMessage = "服务器内部错误";
          break;
        default:
          errorMessage = data.message || `请求失败 (${status})`;
      }
    } else if (error.request) {
      // 请求已发送但没有收到响应
      errorMessage = "服务器无响应，请稍后重试";
    }

    return Promise.reject(new Error(errorMessage));
  }
);
```

**API 接口封装**：
- 统一管理所有 API 接口
- 使用 TypeScript 定义接口类型和响应类型
- 封装请求方法，提高代码复用性

```typescript
// 用户接口
export interface User {
  id: number;
  name: string;
  email: string;
}

// 测试接口：获取用户列表
export const getUsers = (): Promise<User[]> => {
  return axios.get("/test/users");
};
```

### 2. 前后端请求开发规范

#### 2.1 接口命名规范

**后端接口命名**：
- 使用 RESTful API 设计风格
- 路径使用小写字母，单词间用连字符分隔（kebab-case）
- 资源名称使用复数形式（如 `/users/` 而不是 `/user/`）
- 使用合适的 HTTP 方法：
  - GET：获取资源
  - POST：创建资源
  - PUT：更新资源
  - DELETE：删除资源

**前端 API 函数命名**：
- 使用小驼峰命名法（camelCase）
- 函数名应清晰表达接口功能
- 示例：`getUserList()`、`createUser()`、`updateUser()`、`deleteUser()`

#### 2.2 数据类型规范

**后端数据类型**：
- 使用 JavaScript 基本数据类型
- 复杂数据使用对象或数组
- 日期时间使用 ISO 格式字符串

**前端数据类型**：
- 使用 TypeScript 定义接口类型
- 接口类型应与后端返回数据结构一致
- 为所有 API 响应定义类型

```typescript
// 通用响应接口
export interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
}

// 用户接口
export interface User {
  id: number;
  name: string;
  email: string;
}
```

#### 2.3 请求与响应规范

**请求规范**：
- GET 请求参数通过 URL 传递
- POST/PUT 请求参数通过请求体传递
- 文件上传使用 FormData 格式
- 所有请求参数应进行验证

**响应规范**：
- 统一响应格式
- 成功响应返回数据和提示信息
- 错误响应返回错误码和错误信息
- 分页数据应包含总条数、当前页、每页条数等信息

#### 2.4 错误处理规范

**后端错误处理**：
- 使用中间件统一处理错误
- 根据错误类型返回不同的 HTTP 状态码
- 错误信息应清晰明确，便于前端处理

**前端错误处理**：
- 使用 try/catch 捕获异步请求错误
- 使用响应拦截器统一处理错误
- 为用户提供友好的错误提示
- 记录错误日志，便于调试

#### 2.5 开发流程规范

1. **接口设计**：
   - 前后端共同定义接口文档
   - 明确接口路径、请求方法、参数、响应格式等
   - 使用 API 接口文档工具管理接口（如 Swagger）

2. **后端实现**：
   - 根据接口文档实现后端接口
   - 进行单元测试和集成测试
   - 确保接口符合设计规范

3. **前端实现**：
   - 根据接口文档封装 API 函数
   - 实现前端页面和交互逻辑
   - 调用 API 函数获取和提交数据
   - 处理响应和错误

4. **联调测试**：
   - 前后端进行联调测试
   - 解决联调过程中遇到的问题
   - 确保接口正常工作

5. **文档更新**：
   - 及时更新 API 接口文档
   - 记录接口变更历史
   - 确保文档与实际接口一致

### 3. 注意事项

1. **接口版本管理**：
   - 建议使用版本号管理接口（如 `/api/v1/users/`）
   - 接口变更时应考虑向后兼容

2. **性能优化**：
   - 减少不必要的请求
   - 使用缓存减少服务器负载
   - 优化数据库查询

3. **安全考虑**：
   - 对敏感数据进行加密
   - 验证用户权限
   - 防止 SQL 注入、XSS 攻击等

4. **代码质量**：
   - 保持代码整洁和可维护性
   - 遵循编码规范
   - 定期进行代码审查

5. **文档维护**：
   - 及时更新 API 接口文档
   - 文档应包含完整的接口信息
   - 文档应易于理解和使用
