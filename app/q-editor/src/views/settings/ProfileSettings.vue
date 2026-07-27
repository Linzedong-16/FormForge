<template>
  <div class="settings-page">
    <!-- 顶部导航栏 -->
    <headerNav>
      <template #left>
        <el-button :icon="ArrowLeft" circle size="small" @click="goBack" />
      </template>
      <template #center>
        <span class="header-title">{{ t("settings.settings") }}</span>
      </template>
    </headerNav>

    <div class="settings-container">
      <!-- 左侧导航 -->
      <aside class="settings-sidebar">
        <nav class="sidebar-nav">
          <a
            v-for="tab in tabs"
            :key="tab.key"
            class="nav-item"
            :class="{ active: activeTab === tab.key }"
            @click="activeTab = tab.key"
          >
            <el-icon class="nav-icon"><component :is="tab.icon" /></el-icon>
            <span>{{ tab.label }}</span>
          </a>
        </nav>
      </aside>

      <!-- 右侧内容区 -->
      <main class="settings-content">
        <ProfileTab v-if="activeTab === 'profile'" />
        <AccountTab v-if="activeTab === 'account'" />
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import { User, Lock, ArrowLeft } from "@element-plus/icons-vue";
import headerNav from "@/components/Common/header-nav.vue";
import ProfileTab from "./components/ProfileTab.vue";
import AccountTab from "./components/AccountTab.vue";

const { t } = useI18n();
const router = useRouter();

const activeTab = ref<"profile" | "account">("profile");

// 返回上一页
function goBack() {
  router.back();
}

const tabs = [
  { key: "profile" as const, label: t("settings.profile"), icon: User },
  { key: "account" as const, label: t("settings.account"), icon: Lock }
];
</script>

<style scoped lang="scss">
// ── 本地 fallback 映射：使用项目主题系统定义的 CSS 变量，确保亮/暗主题下均有足够对比度 ──
// 变量来源：variables.scss（亮色） / theme-dark.scss（暗色），无自定义变量名，全部引用已有变量
$clr-bg: var(--background-color, #f4f4f5); // 页面底色
$clr-card: var(--white, #ffffff); // 面板/卡片背景（暗色下自动变为 #18181b）
$clr-text: var(--font-color, #18181b); // 主文字色
$clr-text-secondary: var(--font-color-lighter, #71717a); // 次要文字色
$clr-border: var(--border-color, #e4e4e7); // 边框色
$clr-primary: var(--primary-color, #18181b); // 主色
$clr-primary-light: var(--primary-color, #18181b); // 主色（浅色变体复用）
$clr-primary-bg: var(--el-color-primary-light-9, #f4f4f5); // 主色浅底（暗色下 #27272a，与近白主色形成对比）
$clr-hover-bg: var(--el-fill-color-light, #f4f4f5); // 悬停背景（暗色下 #232326）
$radius-lg: var(--border-radius-lg, 8px);
$radius-md: var(--border-radius-md, 6px);

// ── 顶部导航标题 ────────────────────────────────────
.header-title {
  font-size: 15px;
  font-weight: 500;
  color: $clr-text;
  margin-right: 24px;
}

// header-nav 间距微调：标题与右侧消息按钮拉开距离
:deep(.center) {
  gap: 12px;
}

.settings-page {
  min-height: 100vh;
  // 渐变色暂不使用
  // background: linear-gradient(170deg, #22b0c9 0%, #3a78e8 50%, #7a42d8 100%);
  background-color: $clr-bg;
  padding: 24px;
}

.settings-container {
  max-width: 960px;
  margin: 0 auto;
  display: flex;
  gap: 24px;
  align-items: flex-start;
}

// ── 左侧导航 ──────────────────────────────────────────
.settings-sidebar {
  width: 200px;
  flex-shrink: 0;
  background: $clr-card;
  border-radius: $radius-lg;
  border: 1px solid $clr-border;
  overflow: hidden;
  position: sticky;
  top: 50px;
}

.sidebar-nav {
  padding: 8px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-radius: $radius-md;
  font-size: 14px;
  color: $clr-text;
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    color 0.15s ease;
  text-decoration: none;

  &:hover {
    background-color: $clr-hover-bg;
  }

  &.active {
    color: $clr-primary;
    background-color: $clr-primary-bg;
    font-weight: 500;
  }

  .nav-icon {
    font-size: 18px;
    flex-shrink: 0;
  }
}

// ── 右侧内容区 ────────────────────────────────────────
.settings-content {
  flex: 1;
  min-width: 0;
  background: $clr-card;
  border-radius: $radius-lg;
  border: 1px solid $clr-border;
  padding: 32px;
}

// ── 响应式 ────────────────────────────────────────────
@media (max-width: 768px) {
  .settings-page {
    padding: 12px;
  }

  .settings-container {
    flex-direction: column;
  }

  .settings-sidebar {
    width: 100%;
    position: static;
  }

  .sidebar-nav {
    display: flex;
    gap: 4px;
  }

  .nav-item {
    flex: 1;
    justify-content: center;
  }

  .settings-content {
    padding: 20px;
  }
}
</style>
