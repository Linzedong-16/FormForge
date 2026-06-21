<template>
  <div class="right-side-container">
    <div v-if="store.currentComponentIndex === -1" class="content flex justify-content-center align-items-center">
      {{ t("editor.clickToEdit") }}
    </div>
    <div v-else>
      <EditPannel :key="store.editorVersion" :com="currentCom!" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, provide } from "vue";
// 仓库
import { useEditorStore } from "@/stores/useEditor";
const store = useEditorStore();
import EditPannel from "@/components/SurveyComs/EditItems/EditPannel.vue";

import { ElMessage } from "element-plus";
import type { OptionsProps, OptionsStatus, PicLink, TextProps, TypeStatus } from "@/types";
import { isPicLink, isRateScoreDesc, IsTypeStatus, IsOptionsStatus } from "@/types";
import type { CascaderEditPayload } from "@/stores/actions";
import { changeEditorIsShowStatus } from "@/utils";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

const currentCom = computed(() => store.coms[store.currentComponentIndex]);

// TODO: 完善 updateStatus 方法 -> 映射到EditorStore的方法
const updateStatus = (configKey: string, payload?: number | string | boolean | PicLink | object) => {
  // 拿到新的状态数据之后，就应该去修改仓库里面的数据
  switch (configKey) {
    case "type": {
      if (typeof payload === "number" && IsTypeStatus(currentCom.value!.status as unknown as TypeStatus)) {
        // 切换其他编辑器的显示状态
        changeEditorIsShowStatus(currentCom.value!.status as unknown as TypeStatus, payload);
        store.setCurrentStatus(currentCom.value!.status[configKey] as OptionsProps, payload);
      }
      break;
    }
    case "title":
    case "desc": {
      if (typeof payload !== "string") {
        console.error('Invalid payload type for "title or desc". Expected string.');
        return;
      }
      store.setTextStatus(currentCom.value!.status[configKey] as TextProps, payload);
      break;
    }
    case "options": {
      if (IsOptionsStatus(currentCom.value!.status as unknown as OptionsStatus))
        if (typeof payload === "number") {
          // 说明是删除选项
          const result = store.removeOption(currentCom.value!.status[configKey] as OptionsProps, payload);
          if (result) ElMessage.success(t("editor.deleteSuccess"));
          else ElMessage.error(t("editor.keepTwoOptions"));
        } else if (typeof payload === "object" && payload !== null && isPicLink(payload)) {
          // 说明是在设置图片的链接
          store.setPicLinkByIndex(currentCom.value!.status[configKey] as OptionsProps, payload);
        } else if (typeof payload === "boolean") {
          // 切换开关状态（如评分题是否显示辅助文字）
          store.setIsUse(currentCom.value!.status[configKey] as OptionsProps, payload);
        } else if (typeof payload === "object" && payload !== null && isRateScoreDesc(payload)) {
          // 处理辅助文字选项修改
          store.setRateScoreDesc(currentCom.value!.status[configKey] as OptionsProps, payload);
        } else {
          // 说明是新增选项
          store.addOption(currentCom.value!.status[configKey] as OptionsProps);
        }
      break;
    }
    case "cascaderOptions": {
      // 多级联动题：布尔切换地址/自定义模式，对象则为级联树的增删改
      if (typeof payload === "boolean") {
        store.setIsUse(currentCom.value!.status[configKey] as OptionsProps, payload);
      } else if (typeof payload === "object" && payload !== null) {
        store.setCascaderOptions(currentCom.value!.status[configKey] as OptionsProps, payload as CascaderEditPayload);
      }
      break;
    }
    case "matrixRows":
    case "matrixColumns":
    case "transferItems": {
      // 矩阵行/列、排序题选项的增删（复用 addOption/removeOption），文本修改由编辑器直接同步
      if (typeof payload === "number") {
        const result = store.removeOption(currentCom.value!.status[configKey] as OptionsProps, payload);
        if (result) ElMessage.success(t("editor.deleteSuccess"));
        else ElMessage.error(t("editor.keepTwoItems"));
      } else {
        store.addOption(currentCom.value!.status[configKey] as OptionsProps);
      }
      break;
    }
    case "position": {
      if (typeof payload !== "number") {
        console.error('Invalid payload type for "position". Expected number.');
        return;
      }
      store.setPosition(currentCom.value!.status[configKey] as OptionsProps, payload);
      break;
    }
    case "titleSize":
    case "descSize": {
      if (typeof payload !== "number") {
        console.error('Invalid payload type for "titleSize or descSize". Expected number.');
        return;
      }
      store.setSize(currentCom.value!.status[configKey] as OptionsProps, payload);
      break;
    }
    case "titleWeight":
    case "descWeight": {
      if (typeof payload !== "number") {
        console.error('Invalid payload type for "titleWeight or descWeight". Expected number.');
        return;
      }
      store.setWeight(currentCom.value!.status[configKey] as OptionsProps, payload);
      break;
    }
    case "titleItalic":
    case "descItalic": {
      if (typeof payload !== "number") {
        console.error('Invalid payload type for "titleItalic or descItalic". Expected number.');
        return;
      }
      store.setItalic(currentCom.value!.status[configKey] as OptionsProps, payload);
      break;
    }
    case "titleColor":
    case "descColor": {
      if (typeof payload !== "string") {
        console.error('Invalid payload type for "titleColor or descColor". Expected string.');
        return;
      }
      store.setColor(currentCom.value!.status[configKey] as TextProps, payload);
      break;
    }
    case "isUse": {
      if (typeof payload !== "boolean") {
        console.error('Invalid payload type for "isUse". Expected boolean.');
        return;
      }
      store.setIsUse(currentCom.value!.status[configKey] as OptionsProps, payload);
      break;
    }
    default: {
      console.error(`Invalid configKey: ${configKey}`);
      break;
    }
  }
};

const getLink = (link: PicLink) => {
  updateStatus("options", link);
};

provide("updateStatus", updateStatus);
provide("getLink", getLink);
</script>

<style scoped lang="scss">
.right-side-container {
  width: var(--editor-right-width);
  height: calc(100vh - 50px - 40px);
  position: fixed;
  right: var(--editor-gap);
  top: 70px;
  background-color: rgba(255, 255, 255, 0.9);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-md);
  overflow-y: scroll;
}
.content {
  height: 100%;
}
</style>
