<template>
  <!-- TODO: 处理路由元数据中的图标、默认选中项 -->
  <a-menu
    :style="{ width: '100%', height: '100%' }"
    :inline-collapsed="isCollapsed"
    breakpoint="xl"
    style="border-right: 0"
    mode="vertical"
  >
    <div v-for="route in routes" :key="route.path">
      <a-menu-item v-if="!route.children?.length" :key="route.path" @click="handlePush(route.path)">
        <template #icon>
          <acro-icons :icon="(route.meta?.icon as any) || 'home'" />
        </template>
        {{ route?.meta?.title }}
        <!-- 二级菜单 -->
      </a-menu-item>
      <a-sub-menu v-else :key="`sub-${route.path}`">
        <template #icon>
          <acro-icons :icon="(route.meta?.icon as any) || 'home'" />
        </template>
        <template #title>{{ route?.meta?.title }}</template>
        <a-menu-item v-for="child in route.children" :key="child.path" @click="handlePush(child.path)">
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
import { ref, onMounted, onUnmounted, watch } from "vue";
import acroIcons from "@/components/acro-icons.vue";
import { childrenRoutes } from "@/router/routes";
import type { RouteRecordRaw } from "vue-router";
import router from "@/router";

const routes = ref<Array<RouteRecordRaw>>([]);
onMounted(() => {
  console.info("childrenRoutes:", childrenRoutes);
  routes.value = childrenRoutes;
});

// 定义属性
const props = defineProps<{
  collapsed?: boolean;
}>();

const handlePush = (path: string) => {
  router.push(path);
};

// 侧边栏折叠状态
const isCollapsed = ref(props.collapsed || false);

// 监听侧边栏切换事件
const handleSidebarToggle = (event: CustomEvent<boolean>) => {
  isCollapsed.value = event.detail;
};

// 监听props变化
watch(
  () => props.collapsed,
  newVal => {
    isCollapsed.value = newVal || false;
  }
);

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
