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
import { computed, provide, watch } from "vue";
import { ElMessage } from "element-plus";
import { useRoute } from "vue-router";
import { isPicLink, isRateScoreDesc, type OptionsProps, type PicLink, type TextProps, type TypeStatus } from "@/types";
import { changeEditorIsShowStatus } from "@/utils";

// 数据仓库
const store = useMaterialStore();
const currentCom = computed(() => store.coms[store.currentMaterialCom]);

// 从编辑面板的组件中获取更新状态的方法函数 updateStatus
const updateStatus = (configKey: string, payload?: number | string | boolean | object, keepStatus?: boolean) => {
  if (!currentCom.value) {
    console.error("Current component is not available");
    return;
  }
  switch (configKey) {
    case "type": {
      console.log("type", payload);
      console.log("type", typeof payload);
      if (!keepStatus) {
        changeEditorIsShowStatus(currentCom.value.status as unknown as TypeStatus, payload as number);
      }
      store.setPosition(currentCom.value.status[configKey] as OptionsProps, payload as number);
      break;
    }
    case "title":
    case "desc": {
      if (typeof payload !== "string") {
        console.error('Invalid payload type for "title or desc". Expected string.');
        break;
      }
      store.setTextStatus(currentCom.value.status[configKey] as TextProps, payload as string);
      break;
    }
    case "titleWeight":
    case "descWeight": {
      if (typeof payload !== "number") {
        console.error('Invalid payload type for "titleWeight or descWeight". Expected number.');
        break;
      }
      store.setWeight(currentCom.value.status[configKey] as OptionsProps, payload);
      break;
    }
    case "titleItalic":
    case "descItalic": {
      if (typeof payload !== "number") {
        console.error('Invalid payload type for "titleItalic or descItalic". Expected number.');
        break;
      }
      store.setItalic(currentCom.value.status[configKey] as OptionsProps, payload);
      break;
    }
    case "options": {
      if (typeof payload === "number") {
        const result = store.removeOption(currentCom.value.status[configKey] as OptionsProps, payload);
        if (result) ElMessage.success("删除成功");
        else ElMessage.error("至少保留两个选项");
      } else if (typeof payload === "object" && payload !== null && isPicLink(payload)) {
        // 处理图片链接
        store.setPicLinkByIndex(currentCom.value.status[configKey] as OptionsProps, payload);
      } else if (typeof payload === "boolean") {
        store.setIsUse(currentCom.value.status[configKey] as OptionsProps, payload);
      } else if (typeof payload === "object" && payload !== null && isRateScoreDesc(payload)) {
        // 处理辅助文字选项修改
        store.setRateScoreDesc(currentCom.value.status[configKey] as OptionsProps, payload);
        break;
      } else {
        store.addOption(currentCom.value.status[configKey] as OptionsProps);
      }
      break;
    }
    case "position": {
      if (typeof payload !== "number") {
        console.error('Invalid payload type for "position". Expected number.');
        break;
      }
      store.setPosition(currentCom.value.status[configKey] as OptionsProps, payload);
      break;
    }
    case "titleColor":
    case "descColor": {
      if (typeof payload !== "string") {
        console.error('Invalid payload type for "titleColor or descColor". Expected string.');
        break;
      }
      store.setColor(currentCom.value.status[configKey] as TextProps, payload as string);
      break;
    }
    case "isUse": {
      if (typeof payload !== "boolean") {
        console.error('Invalid payload type for "isUse". Expected boolean.');
        break;
      }
      store.setTextStatus(currentCom.value.status[configKey] as TextProps, payload.toString());
      break;
    }
    case "titleSize":
    case "descSize": {
      if (typeof payload !== "number") {
        console.error('Invalid payload type for "titleSize or descSize". Expected number.');
        break;
      }
      store.setSize(currentCom.value.status[configKey] as OptionsProps, payload);
      break;
    }
    default: {
      console.error(`Unknown configKey: ${configKey}`);
    }
  }
};
provide("updateStatus", updateStatus);

// 从编辑面板的组件中获取获取图片链接的方法函数 getLink
const getLink = (link: PicLink) => {
  updateStatus("options", link);
};

provide("getLink", getLink);

// 路由路径到组件名称的映射
const routeToComponentMap: Record<string, string> = {
  "/single-select": "single-select",
  "/multi-select": "multi-select",
  "/option-select": "option-select",
  "/single-pic-select": "single-pic-select",
  "/multi-pic-select": "multi-pic-select",
  // 备注组件
  "/text-note": "text-note",
  // 输入框组件
  "/text-input": "text-input",
  // 个人信息组件
  "/personal-info-gender": "personal-info-gender",
  "/personal-info-education": "personal-info-education",
  "/personal-info-name": "personal-info-name",
  "/personal-info-id": "personal-info-id",
  "/personal-info-age": "personal-info-age",
  "/personal-info-career": "personal-info-career",
  "/personal-info-collage": "personal-info-collage",
  "/personal-info-major": "personal-info-major",
  "/personal-info-industry": "personal-info-industry",
  "/personal-info-company": "personal-info-company",
  "/personal-info-position": "personal-info-position",
  // 高级组件
  "/date-time": "date-time",
  "/rate-score": "rate-score",
  // 联系信息组件
  "/personal-info-tel": "personal-info-tel",
  "/personal-info-wechat": "personal-info-wechat",
  "/personal-info-qq": "personal-info-qq",
  "/personal-info-email": "personal-info-email",
  "/personal-info-address": "personal-info-address"
};

const route = useRoute();
// 监听路由变化，更新当前组件
watch(
  () => route.path,
  newPath => {
    const componentName = routeToComponentMap[newPath];
    if (componentName) {
      store.currentMaterialCom = componentName;
      // 如果组件不存在，初始化它
      if (!store.coms[componentName]) {
        import(
          /* @vite-ignore */
          /* webpackChunkName: "default-status" */ `@/configs/defaultStatus/${componentName.charAt(0).toUpperCase() + componentName.slice(1)}`
        )
          .then(() => {
            // const defaultStatusFn = module.default;
            store.setCurrentMaterialCom(componentName);
            // store.coms[componentName] = defaultStatusFn();
          })
          .catch(error => {
            console.error(`Failed to load default status for ${componentName}:`, error);
          });
      }
    }
  },
  { immediate: true }
);
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
