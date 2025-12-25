<template>
  <div class="layout-demo">
    <a-layout style="height: 100%">
      <a-layout-header>
        <HeaderTop @sidebar-toggle="handleCollapse" />
      </a-layout-header>
      <a-layout style="height: calc(100% - 64px)">
        <a-layout-sider :width="200" collapsible :collapsed="isCollapsed" style="background: var(--color-bg-1)">
          <SideBar :collapsed="isCollapsed" />
        </a-layout-sider>
        <a-layout-content class="layout-content">
          <router-view />
        </a-layout-content>
      </a-layout>
    </a-layout>
  </div>
</template>
<script setup lang="ts">
import { ref } from "vue";
import HeaderTop from "./components/header-top.vue";
import SideBar from "./components/Side-bar.vue";

// 侧边栏折叠状态
const isCollapsed = ref(false);

// 处理侧边栏折叠
const handleCollapse = (val: boolean) => {
  isCollapsed.value = val;
};
</script>

<style scoped>
.layout-demo {
  width: 100%;
  height: 100vh;
  overflow: hidden;
}

.layout-content {
  margin: 24px;
  padding: 24px;
  background-color: var(--color-bg-1);
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  overflow: auto;
}
</style>
