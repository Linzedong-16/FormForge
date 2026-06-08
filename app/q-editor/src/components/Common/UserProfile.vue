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
          <span>{{ isDark ? t("header.darkMode") : t("header.lightMode") }}</span>
        </div>
        <el-switch :model-value="isDark" @change="onToggleTheme" />
      </div>

      <!-- 语言切换 -->
      <div class="menu-item lang-item">
        <div class="theme-label">
          <font-awesome-icon :icon="['fas', 'globe']" class="menu-icon" />
          <span>{{ t("header.language") }}</span>
        </div>
        <div class="lang-options">
          <span
            v-for="l in langs"
            :key="l.value"
            class="lang-opt"
            :class="{ active: locale === l.value }"
            @click="onChangeLang(l.value)"
            >{{ l.short }}</span
          >
        </div>
      </div>

      <!-- 色弱模式：下拉选择 -->
      <div class="menu-item cb-item">
        <div class="theme-label">
          <el-icon class="menu-icon"><View /></el-icon>
          <span>{{ t("header.colorBlind") }}</span>
        </div>
        <el-select
          :model-value="colorBlindMode"
          size="small"
          class="cb-select"
          :teleported="false"
          @change="onChangeColorBlind"
        >
          <el-option v-for="o in cbOptions" :key="o.value" :label="t(o.labelKey)" :value="o.value" />
        </el-select>
      </div>

      <div class="panel-divider"></div>

      <!-- 菜单项 -->
      <div class="menu-item" @click="onSettings">
        <el-icon class="menu-icon"><Setting /></el-icon>
        <span>{{ t("header.settings") }}</span>
      </div>
      <div class="menu-item" @click="onLogout">
        <el-icon class="menu-icon"><SwitchButton /></el-icon>
        <span>{{ t("header.logout") }}</span>
      </div>
    </div>
  </el-popover>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useI18n } from "vue-i18n";
import { Setting, SwitchButton, Sunny, Moon, View } from "@element-plus/icons-vue";
import { useTheme } from "@/utils/useTheme";
import { useColorBlind, type ColorBlindMode } from "@/utils/useColorBlind";
import { setLocale, type SupportLocale } from "@/i18n";
import { useUserStore } from "@/stores/useUser";

const { t, locale } = useI18n();

// 从 Pinia Store 获取用户信息
const userStore = useUserStore();

// 用户信息：从 Pinia 持久化状态读取
const avatar = ref("http://47.94.168.252/upload/1759642363899.gif");
const nickname = computed(() => userStore.user?.username ?? "User");
const email = computed(() => userStore.user?.email ?? "");

// 亮暗主题切换
const { isDark, toggleTheme } = useTheme();
const onToggleTheme = (val: string | number | boolean) => {
  toggleTheme(Boolean(val));
};

// 语言切换选项
const langs: { value: SupportLocale; short: string }[] = [
  { value: "zh-CN", short: "中" },
  { value: "en-US", short: "EN" },
  { value: "ja-JP", short: "日" }
];
const onChangeLang = (l: SupportLocale) => {
  setLocale(l);
  window.location.reload();
};

// 色弱模式切换
const { mode: colorBlindMode, setColorBlindMode } = useColorBlind();
const cbOptions: { value: ColorBlindMode; labelKey: string }[] = [
  { value: "normal", labelKey: "header.cbNormal" },
  { value: "protanopia", labelKey: "header.cbProtanopia" },
  { value: "deuteranopia", labelKey: "header.cbDeuteranopia" },
  { value: "tritanopia", labelKey: "header.cbTritanopia" },
  { value: "achromatopsia", labelKey: "header.cbAchromatopsia" }
];
const onChangeColorBlind = (v: string | number | boolean | undefined) => {
  setColorBlindMode(v as ColorBlindMode);
};

// 打开个人设置（空实现，待对接业务）
const onSettings = () => {};

// 退出登录
const onLogout = async () => {
  await userStore.handleLogout();
  // 登出后跳转到登录页或首页
  window.location.reload();
};
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
.theme-item,
.lang-item,
.cb-item {
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

// 色弱模式下拉框：限制宽度，避免撑大面板
.cb-select {
  width: 110px;
}

// 语言选项：小号文字，当前语言主色高亮
.lang-options {
  display: flex;
  gap: 4px;
}
.lang-opt {
  font-size: 12px;
  padding: 2px 7px;
  border-radius: var(--border-radius-sm);
  color: var(--font-color-lighter);
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    color 0.15s ease;

  &:hover {
    background-color: var(--background-color);
  }
  &.active {
    color: var(--primary-color);
    font-weight: 600;
    background-color: var(--background-color);
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
