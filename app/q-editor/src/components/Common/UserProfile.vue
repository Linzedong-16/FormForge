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
      <el-avatar :size="36" :src="avatar" shape="circle" class="user-profile-trigger" />
    </template>

    <div class="user-profile-panel">
      <!-- 用户信息：头像居左，昵称 + 邮箱上下排布居右 -->
      <div class="user-info">
        <el-avatar :size="56" :src="avatar" shape="circle" class="panel-avatar" />
        <div class="user-meta">
          <div class="user-name" :title="nickname">{{ nickname }}</div>
          <div v-if="occupation" class="user-occupation" :title="occupation">{{ occupation }}</div>
          <div class="user-email" :title="email">{{ email }}</div>
          <div v-if="bio" class="user-bio" :title="bio">{{ bio }}</div>
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

      <!-- 菜单项：当前已在设置页时隐藏入口 -->
      <div v-if="!isOnSettingsPage" class="menu-item" @click="onSettings">
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
import { computed, onMounted } from "vue";
import { useRouter, useRoute } from "vue-router";
import { useI18n } from "vue-i18n";
import { ElMessageBox } from "element-plus";
import { Setting, SwitchButton, Sunny, Moon, View } from "@element-plus/icons-vue";
import { useTheme } from "@/utils/useTheme";
import { useColorBlind, type ColorBlindMode } from "@/utils/useColorBlind";
import { setLocale, type SupportLocale } from "@/i18n";
import { useUserStore } from "@/stores/useUser";

const { t, locale } = useI18n();
const router = useRouter();
const route = useRoute();

// 当前处于个人设置页面时，隐藏"个人设置"菜单入口
const isOnSettingsPage = computed(() => route.name === "settings");

// 从 Pinia Store 获取用户信息
const userStore = useUserStore();

// 用户信息：从 Pinia 持久化状态读取
const avatar = computed(() => userStore.profile.avatarUrl ?? undefined);
const nickname = computed(() => userStore.profile.nickname || userStore.user?.username || "User");
const email = computed(() => userStore.user?.email ?? "");
const occupation = computed(() => userStore.profile.occupation || "");
const bio = computed(() => userStore.profile.bio || "");

// 组件挂载时异步加载最新资料（不阻塞首屏渲染，静默刷新）
onMounted(() => {
  userStore.fetchProfile();
});

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

// 打开个人设置
const onSettings = () => {
  router.push({ name: "settings" });
};

// 退出登录
const onLogout = async () => {
  // 1. 检测是否存在未同步问卷
  let unsyncedCount = 0;
  let unsyncedTitles: string[] = [];
  try {
    const result = await userStore.checkUnsyncedSurveys();
    unsyncedCount = result.count;
    unsyncedTitles = result.titles;
  } catch {
    // 检测失败不阻塞退出流程
  }

  console.log(
    `[UserProfile] 退出登录操作 - 用户: ${userStore.user?.email}, 未同步问卷数: ${unsyncedCount}, ` +
      `未同步问卷: ${unsyncedTitles.join("、") || "无"}`
  );

  // 2. 存在未同步问卷 → 弹出确认对话框
  if (unsyncedCount > 0) {
    const titleList = unsyncedTitles
      .slice(0, 5)
      .map(t => `「${t}」`)
      .join("、");
    const moreHint = unsyncedTitles.length > 5 ? ` 等 ${unsyncedTitles.length} 份问卷` : "";
    const content =
      `<p style="margin-bottom:8px">检测到有 <strong>${unsyncedCount}</strong> 份未完成同步的问卷：</p>` +
      `<p style="color:#909399;font-size:13px;margin-bottom:12px">${titleList}${moreHint}</p>` +
      `<p style="color:#e6a23c;font-size:13px">⚠ 直接退出将清空本地所有问卷记录，未同步数据将永久丢失。</p>`;

    try {
      await ElMessageBox.confirm(content, "退出登录确认", {
        dangerouslyUseHTMLString: true,
        confirmButtonText: "先同步再退出",
        cancelButtonText: "直接退出（数据将被清空）",
        distinguishCancelAndClose: true,
        type: "warning"
      });
      // 用户选择"先同步再退出" → 不退出，跳转到首页让用户手动同步
      console.log("[UserProfile] 用户选择先同步再退出，跳转到首页");
      router.push({ name: "home" });
      return;
    } catch (action: unknown) {
      // action === 'cancel' → 直接退出
      // action === 'close' → 点击右上角 X，视为取消操作
      if (action === "close") {
        console.log("[UserProfile] 用户关闭退出对话框，取消操作");
        return;
      }
      console.log("[UserProfile] 用户选择直接退出，清空 IndexedDB 并登出");
    }
  }

  // 3. 执行登出 + 清空 IndexedDB
  console.log("[UserProfile] 执行登出操作，清空 IndexedDB");
  await userStore.handleLogoutAndClear();
  window.location.reload();
};
</script>

<style scoped lang="scss">
.user-profile-trigger {
  cursor: pointer;
  // 确保圆形不被全局样式覆盖
  border-radius: 50% !important;
  overflow: hidden;
  // 圆形头像框：统一的环形边框
  box-shadow: 0 0 0 2px var(--border-color);
  transition: box-shadow 0.2s ease;

  &:hover {
    box-shadow: 0 0 0 2px var(--primary-color);
  }
}

// 面板内头像框
.panel-avatar {
  flex-shrink: 0;
  margin-top: 4px; // 与文字块顶部微调对齐
  border-radius: 50% !important;
  overflow: hidden;
  box-shadow: 0 0 0 2px var(--border-color);
}

.user-profile-panel {
  display: flex;
  flex-direction: column;
  border-radius: 10px;
}

// 用户信息区：头像左 + 昵称/职业/邮箱/介绍右
.user-info {
  display: flex;
  align-items: flex-start; // 多行时头像顶部对齐
  gap: 12px;
  padding: 8px 10px 12px;
}

.user-meta {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0; // 配合子元素省略号
}

.user-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--font-color);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.4;
}

.user-occupation {
  font-size: 12px;
  color: var(--font-color-light);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.4;
}

.user-email {
  font-size: 12px;
  color: var(--font-color-lighter);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.4;
}

// 个人介绍：多行省略（最多 2 行）
.user-bio {
  font-size: 12px;
  color: var(--font-color-lighter);
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  line-height: 1.5;
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
