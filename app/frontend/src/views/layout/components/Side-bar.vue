<template>
  <a-menu
    :style="{ width: '100%', height: '100%' }"
    :inline-collapsed="isCollapsed"
    :selected-keys="selectedKeys"
    :open-keys="openKeys"
    style="border-right: 0"
    mode="vertical"
    @update:open-keys="onOpenKeysChange"
  >
    <!-- 遍历路由配置，自动生成导航菜单项 -->
    <div v-for="route in routes" :key="route.path">
      <!-- 无子路由：直接渲染菜单项（首页空路径 → key="/"） -->
      <a-menu-item v-if="!route.children?.length" :key="route.path || '/'" @click="handlePush(route.path)">
        <template #icon>
          <acro-icons :icon="(route.meta?.icon as any) || 'home'" />
        </template>
        {{ route?.meta?.title }}
      </a-menu-item>
      <!-- 有子路由：渲染可展开的子菜单 -->
      <a-sub-menu v-else :key="`sub-${route.path}`">
        <template #icon>
          <acro-icons :icon="(route.meta?.icon as any) || 'home'" />
        </template>
        <template #title>
          <span @click.stop="handlePush((route.path + '/' + (route.children?.[0]?.path || '')).replace(/\/+/g, '/'))">
            {{ route?.meta?.title }}
          </span>
        </template>
        <a-menu-item
          v-for="child in route.children"
          :key="(route.path + '/' + child.path).replace(/\/+/g, '/')"
          @click="handlePush((route.path + '/' + child.path).replace(/\/+/g, '/'))"
        >
          <template #icon>
            <acro-icons :icon="(child.meta?.icon as any) || 'home'" />
          </template>
          {{ child?.meta?.title }}
        </a-menu-item>
      </a-sub-menu>
    </div>
  </a-menu>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import acroIcons from "@/components/acro-icons.vue";
import { childrenRoutes } from "@/router/routes";
import type { RouteRecordRaw } from "vue-router";

const routes = ref<Array<RouteRecordRaw>>(childrenRoutes);
const currentRoute = useRoute();
const router = useRouter();

// 根据当前路由路径计算高亮菜单项
const selectedKeys = computed(() => [currentRoute.path]);

// 计算当前应展开的子菜单 key
const manualOpenKeys = ref<string[]>([]);

const openKeys = computed(() => {
  const path = currentRoute.path;
  const autoKeys: string[] = [];
  for (const route of childrenRoutes) {
    if (route.children?.length) {
      const prefix = `sub-${route.path}`;
      for (const child of route.children) {
        const childPath = (route.path + "/" + child.path).replace(/\/+/g, "/");
        if (path === childPath || path.startsWith(childPath + "/")) {
          autoKeys.push(prefix);
        }
      }
    }
  }
  // 合并自动展开 + 手动展开（自动优先）
  return [...new Set([...autoKeys, ...manualOpenKeys.value])];
});

function onOpenKeysChange(keys: string[]) {
  manualOpenKeys.value = keys;
}

// 定义属性
const props = defineProps<{
  collapsed?: boolean;
}>();

// 侧边栏折叠状态，同步 props
const isCollapsed = ref(props.collapsed || false);

watch(
  () => props.collapsed,
  newVal => {
    isCollapsed.value = newVal || false;
  }
);

const handlePush = (path: string) => {
  router.push(path || "/");
};

// 监听顶部栏折叠事件（window 事件方式兼容）
const handleSidebarToggle = (event: CustomEvent<boolean>) => {
  isCollapsed.value = event.detail;
};

onMounted(() => {
  window.addEventListener("sidebar-toggle", handleSidebarToggle as EventListener);
});

onUnmounted(() => {
  window.removeEventListener("sidebar-toggle", handleSidebarToggle as EventListener);
});
</script>

<style scoped>
/* ── 菜单容器 ──────────────────────────────────────────── */

:deep(.arco-menu) {
  background-color: var(--color-menu-bg, var(--color-bg-1));
  width: 100%;
  height: 100%;
  border-right: 0;
}

/* ── 菜单项默认态 ──────────────────────────────────────── */

:deep(.arco-menu-item) {
  border-radius: 0 20px 20px 0;
  margin: 2px 8px 2px 0;
  padding-left: 16px;
  transition: all 0.2s ease;
}

/* ── 菜单项悬停态 ──────────────────────────────────────── */

:deep(.arco-menu-item:hover) {
  background-color: var(--color-fill-2);
}

/* ── 菜单项选中高亮态 ──────────────────────────────────── */

:deep(.arco-menu-item.arco-menu-selected) {
  background: linear-gradient(90deg, rgb(var(--primary-6)), rgb(var(--primary-5)));
  color: #fff;
  font-weight: 600;
  box-shadow: 0 2px 8px rgba(var(--primary-6), 0.3);
}

/* 选中态的图标颜色 */
:deep(.arco-menu-item.arco-menu-selected .arco-icon) {
  color: #fff;
}

/* ── 子菜单标题 ────────────────────────────────────────── */

:deep(.arco-menu-inline-header) {
  border-radius: 0 20px 20px 0;
  margin: 2px 8px 2px 0;
  font-weight: 500;
  transition: all 0.2s ease;
}

:deep(.arco-menu-inline-header:hover) {
  background-color: var(--color-fill-2);
}

/* 子菜单中有子项选中时，父级标题高亮 */
:deep(.arco-menu-inline-header.arco-menu-inline-header-selected) {
  background-color: var(--color-primary-light-1);
  color: rgb(var(--primary-6));
  font-weight: 600;
}

/* ── 子菜单内菜单项 ────────────────────────────────────── */

:deep(.arco-menu-inline .arco-menu-item) {
  padding-left: 48px;
}

/* 折叠模式适配 */
:deep(.arco-menu-collapse) {
  padding: 8px 0;
}

:deep(.arco-menu-collapse .arco-menu-item),
:deep(.arco-menu-collapse .arco-menu-inline-header) {
  border-radius: 0;
  margin: 2px 4px;
}
</style>
