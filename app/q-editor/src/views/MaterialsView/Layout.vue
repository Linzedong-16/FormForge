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
    <div class="right">
      <EditPannel :com="currentCom!" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { useMaterialStore } from "@/stores/useMaterial";
import EditPannel from "@/components/SurveyComs/EditItems/EditPannel.vue";
import { computed, provide } from "vue";
import { ElMessage } from "element-plus";

// 数据仓库
const store = useMaterialStore();
const currentCom = computed(() => store.coms[store.currentMaterialCom]);

// 从编辑面板的组件中获取更新状态的方法函数 updateStatus
const updateStatus = (configKey: string, payload?: number | string | boolean | object) => {
  if (!currentCom.value) {
    console.error("Current component is not available");
    return;
  }

  console.log(configKey, payload);
  switch (configKey) {
    case "title":
    case "desc": {
      if (typeof payload !== "string") {
        console.error('Invalid payload type for "title or desc". Expected string.');
        break;
      }
      store.setTextStatus(currentCom.value.status[configKey], payload as string);
      break;
    }
    case "titleWeight":
    case "descWeight": {
      if (typeof payload !== "number") {
        console.error('Invalid payload type for "titleWeight or descWeight". Expected number.');
        break;
      }
      store.setWeight(currentCom.value.status[configKey], payload);
      break;
    }
    case "titleItalic":
    case "descItalic": {
      if (typeof payload !== "number") {
        console.error('Invalid payload type for "titleItalic or descItalic". Expected number.');
        break;
      }
      store.setItalic(currentCom.value.status[configKey], payload);
      break;
    }
    case "options": {
      if (typeof payload === "number") {
        const result = store.removeOption(currentCom.value.status[configKey], payload);
        if (result) ElMessage.success("删除成功");
        else ElMessage.error("至少保留两个选项");
      } else {
        store.addOption(currentCom.value.status[configKey]);
      }
      break;
    }
    case "position": {
      if (typeof payload !== "number") {
        console.error('Invalid payload type for "position". Expected number.');
        break;
      }
      store.setPosition(currentCom.value.status[configKey], payload);
      break;
    }
    case "titleColor":
    case "descColor": {
      if (typeof payload !== "string") {
        console.error('Invalid payload type for "titleColor or descColor". Expected string.');
        break;
      }
      store.setColor(currentCom.value.status[configKey], payload as string);
      break;
    }
    case "titleSize":
    case "descSize": {
      if (typeof payload !== "number") {
        console.error('Invalid payload type for "titleSize or descSize". Expected number.');
        break;
      }
      store.setSize(currentCom.value.status[configKey], payload);
      break;
    }
    default: {
      console.error(`Unknown configKey: ${configKey}`);
    }
  }
};
provide("updateStatus", updateStatus);
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
