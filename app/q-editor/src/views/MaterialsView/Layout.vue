<template>
  <div class="layout-container flex">
    <!-- 选择具体的业务组件 -->
    <div class="left flex wrap space-between">
      <slot />
    </div>
    <!-- 显示对应的业务组件 -->
    <div class="center">
      <Router-View v-slot="{ Component }">
        <!-- 根据当前路由匹配到的组件，动态渲染 -->
        <component :is="Component" :serial-num="1" :status="store.coms[store.currentMaterialCom]?.status" />
      </Router-View>
    </div>
    <!-- 编辑面板 -->
    <div class="right">编辑面板</div>
  </div>
</template>

<script setup lang="ts">
import { useMaterialStore } from "@/stores/useMaterial";
// import { computed } from "vue";
// 数据仓库
const store = useMaterialStore();
// const currentCom = computed(() => store.coms[store.currentMaterialCom]);
</script>

<style scoped lang="scss">
.layout-container {
  width: 100%;
  height: calc(100vh - 100px - 40px - 20px);
  align-items: flex-start;
  border: 1px solid var(--border-color);
  border-top-right-radius: var(--border-radius-lg);
  border-bottom-left-radius: var(--border-radius-lg);
  border-bottom-right-radius: var(--border-radius-lg);
}
.left {
  width: 180px;
  text-align: center;
  align-items: flex-start;
  padding: 20px;
}
.center {
  width: 550px;
  // 多减去的60px是上下的padding，，最后20px是额外多减去一部分，避免贴底
  height: calc(100vh - 100px - 40px - 60px - 20px);
  overflow-y: scroll;
  padding: 30px;
  border-left: 1px solid var(--border-color);
}
.right {
  width: 350px;
  height: calc(100vh - 100px - 40px - 20px);
  overflow-y: scroll;
  border-left: 1px solid var(--border-color);
}
</style>
