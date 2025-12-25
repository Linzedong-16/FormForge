<template>
  <div class="header-top">
    <div class="header-left">
      <a-button type="text" size="large" @click="toggleSidebar">
        <icon-menu-fold v-if="!isCollapsed" />
        <icon-menu-unfold v-else />
      </a-button>
      <div class="logo">
        <a-icon icon="logo" :size="28" />
        <span class="logo-text">后台管理系统</span>
      </div>
    </div>
    <div class="header-right">
      <a-button type="text" :icon="'fullscreen'" size="large" @click="toggleFullscreen">
        <template #icon>
          <icon-fullscreen v-if="!isFullscreen" />
          <icon-fullscreen-exit v-else />
        </template>
      </a-button>
      <a-button type="text" size="large" @click="toggleTheme">
        <template #icon>
          <icon-moon-fill v-if="!isDark" />
          <icon-sun-fill v-else />
        </template>
      </a-button>
      <a-avatar :size="32"> Arco </a-avatar>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";

// 侧边栏折叠状态
const isCollapsed = ref(false);
// 主题状态
const isDark = ref(false);
const emit = defineEmits<{
  (e: "sidebar-toggle", val: boolean): void;
}>();
// 切换侧边栏
const toggleSidebar = () => {
  isCollapsed.value = !isCollapsed.value;
  // 触发自定义事件，通知父组件侧边栏状态变化
  emit("sidebar-toggle", isCollapsed.value);
};

// 切换全屏
const isFullscreen = ref(false);
const toggleFullscreen = () => {
  if (!document.fullscreenElement) {
    isFullscreen.value = true;
    document.documentElement.requestFullscreen().catch(err => {
      console.error(`Error attempting to enable fullscreen: ${err.message}`);
    });
  } else {
    isFullscreen.value = false;
    if (document.exitFullscreen) {
      document.exitFullscreen();
    }
  }
};

// 切换主题
const toggleTheme = () => {
  isDark.value = !isDark.value;
  if (isDark.value) {
    document.body.setAttribute("arco-theme", "dark");
  } else {
    document.body.removeAttribute("arco-theme");
  }
};

// 监听全屏状态变化
onMounted(() => {
  // 检查初始主题
  const currentTheme = document.body.getAttribute("arco-theme");
  isDark.value = currentTheme === "dark";
});
</script>

<style scoped>
.header-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 64px;
  padding: 0 24px;
  background-color: var(--color-bg-1);
  border-bottom: 1px solid var(--color-border-1);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.logo {
  display: flex;
  align-items: center;
  gap: 12px;
}

.logo-text {
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text-1);
}

.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}
</style>
