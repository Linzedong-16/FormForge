<template>
  <!-- hover 头像展开用户面板，trigger=hover -->
  <el-popover
    placement="bottom-end"
    trigger="hover"
    :width="260"
    :show-arrow="false"
    :offset="10"
    popper-class="user-profile-popover"
  >
    <template #reference>
      <el-avatar :size="30" :src="avatar" class="user-profile-trigger" />
    </template>

    <div class="user-profile-panel">
      <!-- 用户信息：头像居左，昵称 + 邮箱上下排布居右 -->
      <div class="user-info">
        <el-avatar :size="48" :src="avatar" />
        <div class="user-meta">
          <div class="user-name" :title="nickname">{{ nickname }}</div>
          <div class="user-email" :title="email">{{ email }}</div>
        </div>
      </div>

      <div class="panel-divider"></div>

      <!-- 亮暗主题切换 -->
      <div class="menu-item theme-item">
        <div class="theme-label">
          <el-icon class="menu-icon">
            <component :is="isDark ? Moon : Sunny" />
          </el-icon>
          <span>{{ isDark ? "暗色模式" : "亮色模式" }}</span>
        </div>
        <el-switch :model-value="isDark" @change="onToggleTheme" />
      </div>

      <div class="panel-divider"></div>

      <!-- 菜单项 -->
      <div class="menu-item" @click="onSettings">
        <el-icon class="menu-icon"><Setting /></el-icon>
        <span>个人设置</span>
      </div>
      <div class="menu-item" @click="onLogout">
        <el-icon class="menu-icon"><SwitchButton /></el-icon>
        <span>退出登录</span>
      </div>
    </div>
  </el-popover>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { Setting, SwitchButton, Sunny, Moon } from "@element-plus/icons-vue";
import { useTheme } from "@/utils/useTheme";

// 亮暗主题切换
const { isDark, toggleTheme } = useTheme();
const onToggleTheme = (val: string | number | boolean) => {
  toggleTheme(Boolean(val));
};

// 用户信息（占位数据，待业务 API 对接）
const avatar = ref("http://47.94.168.252/upload/1759642363899.gif");
const nickname = ref("Linzex");
const email = ref("example@email.com");

// 打开个人设置（空实现，待对接业务）
const onSettings = () => {};

// 退出登录（空实现，待对接业务）
const onLogout = () => {};
</script>

<style scoped lang="scss">
.user-profile-trigger {
  cursor: pointer;
}

.user-profile-panel {
  display: flex;
  flex-direction: column;
  border-radius: 10px;
}

// 用户信息区：头像左 + 昵称/邮箱右
.user-info {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 10px 12px;
}

.user-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0; // 配合子元素省略号
}

.user-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--font-color);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.user-email {
  font-size: 12px;
  color: var(--font-color-lighter);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.panel-divider {
  height: 1px;
  background-color: var(--border-color);
  margin: 4px 0;
}

// 菜单项：shadcn 风格，hover 浅灰背景 + 小圆角
.menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 10px;
  border-radius: var(--border-radius-md);
  font-size: 14px;
  color: var(--font-color);
  cursor: pointer;
  transition: background-color 0.15s ease;

  &:hover {
    background-color: var(--background-color);
  }

  .menu-icon {
    font-size: 16px;
    color: var(--font-color-light);
  }
}

// 主题切换项：左侧图标+文字，右侧开关，hover 不变背景（避免与开关交互冲突）
.theme-item {
  justify-content: space-between;
  cursor: default;

  &:hover {
    background-color: transparent;
  }

  .theme-label {
    display: flex;
    align-items: center;
    gap: 8px;
  }
}
</style>

<!-- 非 scoped：覆盖 el-popover 弹层（Teleport 到 body，scoped 无法命中），统一 shadcn 风格 -->
<style lang="scss">
.user-profile-popover.el-popover.el-popper {
  padding: 6px;
  border-radius: var(--border-radius-lg);
  box-shadow: var(--el-box-shadow);
  border: 1px solid var(--border-color);
}
</style>
