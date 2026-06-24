<template>
  <a-menu
    :style="{ width: '100%', height: '100%' }"
    :inline-collapsed="isCollapsed"
    :selected-keys="selectedKeys"
    style="border-right: 0"
    mode="vertical"
  >
    <!-- 遍历路由配置，自动生成导航菜单项 -->
    <div v-for="route in routes" :key="route.path">
      <!-- 无子路由：直接渲染菜单项 -->
      <a-menu-item v-if="!route.children?.length" :key="route.path" @click="handlePush(route.path)">
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
        <template #title>{{ route?.meta?.title }}</template>
        <a-menu-item
          v-for="child in route.children"
          :key="child.path"
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
// 首页子路由 path 为 ""，但 vue-router 解析后为 "/"，需做映射
const selectedKeys = computed(() => {
  const path = currentRoute.path;
  return [path === "/" ? "" : path];
});

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
  // 空路径对应首页 "/"
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
:deep(.arco-menu) {
  background-color: var(--color-bg-1);
  width: 100%;
  height: 100%;
  border-right: 0;
}
</style>
