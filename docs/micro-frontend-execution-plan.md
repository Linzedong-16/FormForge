# 微前端执行方案

---

## 一、技术选型

### 1.1 微前端框架

| 组件 | 技术 | 版本 | 说明 |
|------|------|------|------|
| 微前端框架 | qiankun | ^2.10.16 | 阿里开源，沙箱隔离完善 |
| 主应用框架 | Vue | ^3.5.25 | 保持与子应用一致 |
| 路由 | Vue Router | ^4.6.3 | 统一路由管理 |
| 状态管理 | Pinia | ^3.0.4 | 全局状态共享 |

### 1.2 目录结构规划

```
questionnaire-system/
├── app/
│   ├── main-app/              # 新增：qiankun 主应用
│   │   ├── src/
│   │   │   ├── main.ts
│   │   │   ├── App.vue
│   │   │   ├── router/
│   │   │   ├── stores/
│   │   │   └── style/
│   │   ├── package.json
│   │   └── vite.config.ts
│   ├── q-editor/              # 改造：子应用
│   └── frontend/              # 改造：子应用
└── docs/
    ├── micro-frontend-feasibility-analysis.md
    └── micro-frontend-execution-plan.md
```

---

## 二、模块改造步骤

### 2.1 主应用搭建

#### (1) 创建主应用目录结构

```bash
mkdir -p app/main-app/src/{router,stores,style}
```

#### (2) 初始化主应用 package.json

```json
{
  "name": "main-app",
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vue-tsc -b && vite build"
  },
  "dependencies": {
    "@vueuse/core": "^11.0.3",
    "pinia": "^3.0.4",
    "qiankun": "^2.10.16",
    "vue": "^3.5.25",
    "vue-router": "^4.6.3"
  },
  "devDependencies": {
    "@vitejs/plugin-vue": "^6.0.2",
    "typescript": "~5.9.0",
    "vite": "^7.2.4",
    "vue-tsc": "^3.1.5"
  }
}
```

#### (3) 主应用 vite.config.ts

```typescript
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'path';

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  },
  server: {
    port: 8000,
    cors: true
  }
});
```

#### (4) 主应用入口 main.ts

```typescript
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { registerMicroApps, start } from 'qiankun';
import App from './App.vue';
import router from './router';

const app = createApp(App);
const pinia = createPinia();

app.use(pinia);
app.use(router);

// 注册微应用
registerMicroApps([
  {
    name: 'q-editor',
    entry: '//localhost:5173',
    container: '#subapp-container',
    activeRule: '/editor',
    props: {
      routerBase: '/editor'
    }
  },
  {
    name: 'frontend',
    entry: '//localhost:5174',
    container: '#subapp-container',
    activeRule: '/admin',
    props: {
      routerBase: '/admin'
    }
  }
]);

// 启动 qiankun
start({
  sandbox: {
    strictStyleIsolation: true,
    experimentalStyleIsolation: true
  }
});

app.mount('#app');
```

#### (5) 主应用 App.vue

```vue
<template>
  <div class="main-app">
    <header class="main-header">
      <nav class="main-nav">
        <router-link to="/editor">问卷编辑器</router-link>
        <router-link to="/admin">管理后台</router-link>
      </nav>
    </header>
    <main class="main-content">
      <div id="subapp-container"></div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import { useGlobalState } from './stores/global';

const globalState = useGlobalState();

onMounted(() => {
  console.log('主应用初始化');
});

onUnmounted(() => {
  console.log('主应用卸载');
});
</script>

<style>
.main-app {
  min-height: 100vh;
}
.main-header {
  background: #fff;
  border-bottom: 1px solid #e8e8e8;
  padding: 0 20px;
}
.main-nav {
  display: flex;
  gap: 20px;
}
.main-nav a {
  line-height: 60px;
  color: #333;
  text-decoration: none;
}
.main-content {
  padding: 20px;
}
</style>
```

### 2.2 q-editor 子应用改造

#### (1) 新增 public-path.ts

```typescript
if (window.__POWERED_BY_QIANKUN__) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  __webpack_public_path__ = (window as any).__INJECTED_PUBLIC_PATH_BY_QIANKUN__;
}
```

#### (2) 修改 main.ts

```typescript
import './public-path';
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';
import i18n from './i18n';

let app: ReturnType<typeof createApp> | null = null;

function render(props: Record<string, unknown> = {}) {
  const { container } = props;
  app = createApp(App);
  
  app.use(createPinia());
  app.use(i18n);
  app.use(router);
  
  app.mount(container ? (container as HTMLElement).querySelector('#app') : '#app');
}

// 独立运行时
if (!window.__POWERED_BY_QIANKUN__) {
  render();
}

// qiankun 生命周期钩子
export async function bootstrap() {
  console.log('q-editor 启动');
}

export async function mount(props: Record<string, unknown>) {
  console.log('q-editor 挂载', props);
  render(props);
}

export async function unmount() {
  console.log('q-editor 卸载');
  app?.unmount();
  app = null;
}
```

#### (3) 修改 vite.config.ts

```typescript
export default defineConfig(({ command, mode }) => {
  const mockEnabled = mode === 'mock';
  
  return {
    plugins: [...],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
        '@common': fileURLToPath(new URL('../../packages/common/src', import.meta.url))
      }
    },
    server: {
      port: 5173,
      headers: {
        'Access-Control-Allow-Origin': '*'
      },
      proxy: {
        '/api': {
          target: 'http://localhost:8080',
          changeOrigin: true,
          bypass(req) {
            if (mockEnabled) return req.url;
          }
        }
      }
    },
    build: {
      target: 'esnext',
      lib: {
        entry: './src/main.ts',
        name: 'qEditor',
        formats: ['umd']
      },
      rollupOptions: {
        output: {
          manualChunks: {
            'vue-vendor': ['vue', 'vue-router', 'pinia'],
            'element-plus': ['element-plus']
          }
        }
      }
    }
  };
});
```

### 2.3 frontend 子应用改造

#### (1) 新增 public-path.ts

```typescript
if (window.__POWERED_BY_QIANKUN__) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  __webpack_public_path__ = (window as any).__INJECTED_PUBLIC_PATH_BY_QIANKUN__;
}
```

#### (2) 修改 main.ts

```typescript
import './public-path';
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';

let app: ReturnType<typeof createApp> | null = null;

function render(props: Record<string, unknown> = {}) {
  const { container } = props;
  app = createApp(App);
  
  app.use(createPinia());
  app.use(router);
  
  app.mount(container ? (container as HTMLElement).querySelector('#app') : '#app');
}

if (!window.__POWERED_BY_QIANKUN__) {
  render();
}

export async function bootstrap() {
  console.log('frontend 启动');
}

export async function mount(props: Record<string, unknown>) {
  console.log('frontend 挂载', props);
  render(props);
}

export async function unmount() {
  console.log('frontend 卸载');
  app?.unmount();
  app = null;
}
```

#### (3) 修改 vite.config.ts

```typescript
export default defineConfig({
  plugins: [
    vue(),
    vitePluginForArco({ style: 'css' }),
    AutoImport({ resolvers: [ArcoResolver()] }),
    Components({
      resolvers: [ArcoResolver({ sideEffect: true })]
    })
  ],
  resolve: {
    alias: { '@': resolve(__dirname, 'src') }
  },
  server: {
    port: 5174,
    headers: {
      'Access-Control-Allow-Origin': '*'
    },
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: path => path
      }
    }
  },
  build: {
    target: 'esnext',
    lib: {
      entry: './src/main.ts',
      name: 'frontend',
      formats: ['umd']
    }
  }
});
```

---

## 三、通信机制设计

### 3.1 全局状态管理

#### (1) 主应用全局状态 stores/global.ts

```typescript
import { defineStore } from 'pinia';
import { reactive } from 'vue';

export const useGlobalState = defineStore('global', () => {
  const state = reactive({
    user: null as UserInfo | null,
    token: '',
    appTheme: 'light'
  });

  function setUser(user: UserInfo) {
    state.user = user;
  }

  function setToken(token: string) {
    state.token = token;
  }

  function setTheme(theme: string) {
    state.appTheme = theme;
  }

  return { state, setUser, setToken, setTheme };
});

export interface UserInfo {
  id: string;
  username: string;
  email: string;
  role: string;
}
```

#### (2) qiankun initGlobalState 配置

```typescript
// 主应用 main.ts
import { initGlobalState, MicroAppStateActions } from 'qiankun';

const initialState = {
  user: null,
  token: '',
  theme: 'light'
};

const actions: MicroAppStateActions = initGlobalState(initialState);

actions.onGlobalStateChange((state, prev) => {
  console.log('全局状态变化:', prev, state);
});

export { actions };
```

#### (3) 子应用使用全局状态

```typescript
// q-editor 或 frontend 中
import { onMounted, onUnmounted } from 'vue';

onMounted(() => {
  if (window.__POWERED_BY_QIANKUN__) {
    // 获取全局状态
    // @ts-ignore
    window.__INJECTED_GLOBAL_STATE_BY_QIANKUN__.onGlobalStateChange((state: Record<string, unknown>) => {
      console.log('子应用收到全局状态:', state);
    });
  }
});
```

### 3.2 事件通信机制

#### (1) 主应用事件监听

```typescript
// main.ts
window.addEventListener('micro-app-event', (event) => {
  const detail = (event as CustomEvent).detail;
  console.log('收到子应用事件:', detail);
  
  switch (detail.type) {
    case 'logout':
      // 处理登出逻辑
      break;
    case 'navigate':
      // 处理导航
      router.push(detail.path);
      break;
  }
});
```

#### (2) 子应用发送事件

```typescript
// 子应用中
function emitEvent(type: string, data?: unknown) {
  const event = new CustomEvent('micro-app-event', {
    detail: { type, data },
    bubbles: true,
    composed: true
  });
  window.dispatchEvent(event);
}

// 使用示例
emitEvent('logout');
emitEvent('navigate', { path: '/admin' });
```

---

## 四、样式隔离策略

### 4.1 qiankun 沙箱配置

```typescript
// 主应用 main.ts
start({
  sandbox: {
    strictStyleIsolation: true,           // 严格样式隔离
    experimentalStyleIsolation: true,     // 实验性样式隔离
    sandboxConfig: {
      // 自定义沙箱配置
    }
  }
});
```

### 4.2 CSS 命名空间（备选方案）

```scss
// q-editor 全局样式
.q-editor {
  :deep(.el-button) {
    /* Element Plus 样式覆盖 */
  }
}

// frontend 全局样式  
.frontend {
  :deep(.arco-btn) {
    /* Arco Design 样式覆盖 */
  }
}
```

### 4.3 组件库样式重置

```typescript
// 子应用 mount 时重置样式
export async function mount(props: Record<string, unknown>) {
  // 移除可能冲突的全局样式
  const stylesheets = document.querySelectorAll('style');
  stylesheets.forEach(style => {
    if (style.textContent?.includes('element-plus') || 
        style.textContent?.includes('arco')) {
      // 保留组件库样式
    }
  });
  
  render(props);
}
```

---

## 五、构建部署流程

### 5.1 统一构建脚本

```json
{
  "scripts": {
    "build:main": "cd app/main-app && pnpm build",
    "build:editor": "cd app/q-editor && pnpm build",
    "build:frontend": "cd app/frontend && pnpm build",
    "build:all": "pnpm build:main && pnpm build:editor && pnpm build:frontend",
    "dev:main": "cd app/main-app && pnpm dev",
    "dev:editor": "cd app/q-editor && pnpm dev",
    "dev:frontend": "cd app/frontend && pnpm dev"
  }
}
```

### 5.2 部署目录结构

```
dist/
├── main-app/           # 主应用
│   ├── index.html
│   └── assets/
├── q-editor/           # q-editor 子应用
│   ├── index.html
│   └── assets/
└── frontend/           # frontend 子应用
    ├── index.html
    └── assets/
```

### 5.3 Nginx 配置示例

```nginx
server {
  listen 80;
  server_name example.com;

  location / {
    root /path/to/dist/main-app;
    try_files $uri $uri/ /index.html;
  }

  location /editor/ {
    root /path/to/dist/q-editor;
    try_files $uri $uri/ /index.html;
  }

  location /admin/ {
    root /path/to/dist/frontend;
    try_files $uri $uri/ /index.html;
  }

  location /api/ {
    proxy_pass http://localhost:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
  }
}
```

---

## 六、测试计划

### 6.1 功能测试

| 测试项 | 测试内容 | 预期结果 |
|--------|----------|----------|
| 主应用启动 | 启动主应用 | 正常显示导航栏 |
| 子应用加载 | 访问 /editor | q-editor 正常加载 |
| 子应用加载 | 访问 /admin | frontend 正常加载 |
| 应用切换 | 切换两个子应用 | 无样式冲突 |
| 路由跳转 | 子应用内路由 | 正常跳转 |
| 全局状态 | 修改用户信息 | 所有应用同步更新 |

### 6.2 性能测试

| 测试项 | 测试方法 | 预期指标 |
|--------|----------|----------|
| 首屏加载 | Lighthouse | < 4s |
| 应用切换 | Chrome DevTools | < 1s |
| 内存泄漏 | Memory 面板 | 切换10次无明显增长 |

### 6.3 兼容性测试

| 浏览器 | 版本 | 测试重点 |
|--------|------|----------|
| Chrome | latest | 完整功能 |
| Firefox | latest | 完整功能 |
| Safari | latest | 完整功能 |
| Edge | latest | 完整功能 |
| IE11 | - | 不支持（Vue 3 不兼容） |

---

## 七、回滚方案

### 7.1 快速回滚策略

1. **保留独立部署能力**：子应用仍可独立运行
2. **配置切换**：通过配置文件控制是否启用微前端
3. **备份机制**：每次构建前备份当前版本

### 7.2 回滚步骤

```bash
# 1. 停止当前服务
pnpm stop

# 2. 恢复独立部署配置
git checkout app/q-editor/src/main.ts
git checkout app/frontend/src/main.ts

# 3. 重新构建
pnpm build:editor
pnpm build:frontend

# 4. 启动独立服务
pnpm dev:editor --port 5173
pnpm dev:frontend --port 5174
```

---

## 附录：开发调试指南

### A.1 开发环境启动顺序

```bash
# 终端 1：启动主应用
cd app/main-app && pnpm dev

# 终端 2：启动 q-editor
cd app/q-editor && pnpm dev

# 终端 3：启动 frontend
cd app/frontend && pnpm dev

# 访问主应用：http://localhost:8000
```

### A.2 常见问题排查

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| 子应用加载失败 | CORS 问题 | 配置 `Access-Control-Allow-Origin` |
| 样式冲突 | 组件库样式污染 | 启用 `strictStyleIsolation` |
| 路由冲突 | 路由前缀重复 | 配置不同的 activeRule |
| 状态不同步 | 全局状态未正确配置 | 检查 `initGlobalState` |

---

**文档版本**: v1.0  
**创建日期**: 2026-06-10  
**适用项目**: questionnaire-system