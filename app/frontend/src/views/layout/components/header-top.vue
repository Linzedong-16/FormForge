<template>
  <div class="header-top">
    <div class="header-left">
      <a-button type="text" size="large" @click="toggleSidebar">
        <icon-menu-fold v-if="!isCollapsed" />
        <icon-menu-unfold v-else />
      </a-button>
      <div class="logo">
        <a-icon icon="logo" :size="28" />
        <span class="logo-text">问卷低代码平台</span>
      </div>
    </div>
    <div class="header-right">
      <!-- 全屏切换 -->
      <a-button type="text" size="large" @click="toggleFullscreen">
        <template #icon>
          <icon-fullscreen v-if="!isFullscreen" />
          <icon-fullscreen-exit v-else />
        </template>
      </a-button>

      <!-- 主题切换 -->
      <a-button type="text" size="large" @click="toggleTheme">
        <template #icon>
          <icon-moon-fill v-if="!isDark" />
          <icon-sun-fill v-else />
        </template>
      </a-button>

      <!-- 消息铃铛 -->
      <MessageBell v-if="userStore.isLoggedIn" @click="messageDrawerVisible = true" />

      <!-- 用户下拉菜单 -->
      <a-dropdown v-if="userStore.isLoggedIn" trigger="hover">
        <a-space class="user-info" :size="8">
          <a-avatar v-if="userAvatar" :size="32" :image-url="userAvatar">
            {{ userStore.user?.username?.charAt(0) || "U" }}
          </a-avatar>
          <a-avatar v-else :size="32">
            {{ userStore.user?.username?.charAt(0)?.toUpperCase() || "U" }}
          </a-avatar>
          <span class="username">{{ userStore.user?.username || "用户" }}</span>
          <icon-down :size="12" />
        </a-space>
        <template #content>
          <a-doption>
            <template #default>
              <div class="dropdown-item" @click="handleLogout">
                <icon-export />
                <span>退出登录</span>
              </div>
            </template>
          </a-doption>
        </template>
      </a-dropdown>

      <!-- 未登录 → 显示登录按钮 -->
      <a-button v-else type="primary" size="small" @click="showLoginModal">
        <template #icon><icon-user /></template>
        登录
      </a-button>

      <!-- 登录弹窗 -->
      <LoginModal v-model:visible="loginModalVisible" @success="onLoginSuccess" />
    </div>

    <!-- 消息收件箱抽屉 -->
    <MessageDrawer v-model:visible="messageDrawerVisible" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useUserStore } from "@/store/modules/user";
import { useTheme } from "@/composables/useTheme";
import LoginModal from "@/components/LoginModal.vue";
import MessageBell from "@/components/message/MessageBell.vue";
import MessageDrawer from "@/components/message/MessageDrawer.vue";

const userStore = useUserStore();
const { isDark, toggleTheme } = useTheme();

// 消息收件箱抽屉可见性
const messageDrawerVisible = ref(false);

// 侧边栏折叠状态
const isCollapsed = ref(false);
const emit = defineEmits<{
  (e: "sidebar-toggle", val: boolean): void;
}>();

// 登录弹窗
const loginModalVisible = ref(false);

// 用户头像 URL
const userAvatar = computed(() => userStore.profile?.avatarUrl || null);

// 切换侧边栏
const toggleSidebar = () => {
  isCollapsed.value = !isCollapsed.value;
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

// 登录弹窗
function showLoginModal() {
  loginModalVisible.value = true;
}

function onLoginSuccess() {
  // 登录成功后刷新 store 资料
  userStore.fetchProfile().catch(() => {});
}

// 退出登录
async function handleLogout() {
  await userStore.handleLogout();
  window.location.reload();
}
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

.user-info {
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  transition: background-color 0.2s;
}

.user-info:hover {
  background-color: var(--color-fill-2);
}

.username {
  font-size: 14px;
  color: var(--color-text-1);
}

.dropdown-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  cursor: pointer;
  font-size: 14px;
  color: var(--color-text-1);
  min-width: 120px;
}

.dropdown-item:hover {
  background-color: var(--color-fill-2);
}
</style>
