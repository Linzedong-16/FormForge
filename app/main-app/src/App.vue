<template>
  <div class="main-shell">
    <!-- ── 顶部导航壳 ─────────────────────────────────── -->
    <header class="shell-header">
      <div class="header-left">
        <div class="logo">
          <span class="logo-icon">📋</span>
          <span class="logo-text">问卷低代码平台</span>
        </div>
      </div>

      <nav class="shell-nav">
        <a
          class="nav-item"
          :class="{ active: isActive('/editor') }"
          href="/editor"
          @click.prevent="navigate('/editor')"
        >
          ✏️ 问卷编辑器
        </a>
        <a class="nav-item" :class="{ active: isActive('/admin') }" href="/admin" @click.prevent="navigate('/admin')">
          🗂️ 管理后台
        </a>
      </nav>

      <div class="header-right">
        <span class="env-badge">开发环境</span>
      </div>
    </header>

    <!-- ── 子应用挂载区域 ──────────────────────────────── -->
    <!-- qiankun 根据 activeRule 将对应子应用挂载到此节点 -->
    <main class="subapp-wrapper">
      <!-- 欢迎页：访问根路径时显示，子应用加载后自动隐藏 -->
      <div v-if="showWelcome" class="welcome-page">
        <div class="welcome-card">
          <h1>欢迎使用问卷低代码平台</h1>
          <p>请通过顶部导航选择功能模块</p>
          <div class="welcome-links">
            <a href="/editor" @click.prevent="navigate('/editor')">进入问卷编辑器 →</a>
            <a href="/admin" @click.prevent="navigate('/admin')">进入管理后台 →</a>
          </div>
        </div>
      </div>

      <!-- qiankun 子应用挂载容器，id 必须与 registerMicroApps 中 container 一致 -->
      <div id="subapp-container"></div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRouter, useRoute } from "vue-router";

const router = useRouter();
const route = useRoute();

// 判断当前路径是否激活某个子应用路由前缀
const isActive = (prefix: string) => route.path.startsWith(prefix);

// 欢迎页：仅在根路径时显示
const showWelcome = computed(() => route.path === "/" || route.path === "");

// 导航到子应用（触发 qiankun activeRule 匹配）
const navigate = (path: string) => {
  router.push(path);
};
</script>

<style scoped>
/* ── 布局骨架 ─────────────────────────────────────────── */
.main-shell {
  display: flex;
  flex-direction: column;
  width: 100%;
  min-height: 100vh;
  background: #f5f7fa;
}

/* ── 顶部导航 ─────────────────────────────────────────── */
.shell-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 56px;
  padding: 0 24px;
  background: #001529;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  position: sticky;
  top: 0;
  z-index: 1000;
}

.header-left {
  display: flex;
  align-items: center;
}

.logo {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #fff;
}

.logo-icon {
  font-size: 20px;
}

.logo-text {
  font-size: 16px;
  font-weight: 600;
  letter-spacing: 0.5px;
}

/* ── 导航链接 ─────────────────────────────────────────── */
.shell-nav {
  display: flex;
  gap: 4px;
}

.nav-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 16px;
  border-radius: 6px;
  color: rgba(255, 255, 255, 0.75);
  font-size: 14px;
  text-decoration: none;
  transition: all 0.2s;
}

.nav-item:hover {
  color: #fff;
  background: rgba(255, 255, 255, 0.1);
}

.nav-item.active {
  color: #fff;
  background: rgba(255, 255, 255, 0.15);
  font-weight: 500;
}

.header-right {
  display: flex;
  align-items: center;
}

.env-badge {
  padding: 2px 8px;
  border-radius: 4px;
  background: rgba(24, 144, 255, 0.2);
  color: #69c0ff;
  font-size: 12px;
  border: 1px solid rgba(24, 144, 255, 0.3);
}

/* ── 子应用容器 ─────────────────────────────────────────── */
.subapp-wrapper {
  flex: 1;
  position: relative;
}

#subapp-container {
  width: 100%;
  min-height: calc(100vh - 56px);
}

/* ── 欢迎页 ──────────────────────────────────────────────── */
.welcome-page {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: calc(100vh - 56px);
}

.welcome-card {
  text-align: center;
  padding: 48px;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.08);
  max-width: 480px;
}

.welcome-card h1 {
  margin: 0 0 12px;
  font-size: 24px;
  font-weight: 600;
  color: #1a1a1a;
}

.welcome-card p {
  margin: 0 0 32px;
  font-size: 15px;
  color: #666;
}

.welcome-links {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.welcome-links a {
  display: inline-block;
  padding: 10px 24px;
  border-radius: 6px;
  background: #1677ff;
  color: #fff;
  font-size: 14px;
  text-decoration: none;
  transition: background 0.2s;
}

.welcome-links a:hover {
  background: #4096ff;
}

.welcome-links a:last-child {
  background: #52c41a;
}

.welcome-links a:last-child:hover {
  background: #73d13d;
}
</style>
