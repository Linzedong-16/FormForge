<template>
  <div class="survey-com-item-cell">
    <!-- 文字过长时靠原生 title 兜底显示全名，无需再套一层自定义 tooltip -->
    <div
      class="survey-com-item-container pointer flex justify-content-center align-items-center"
      :title="item.comName"
      @click="addSurveyCom"
    >
      {{ item.comName }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { defaultStatusMap } from "@/configs/defaultStatus/defaultStatusMap";
import { updateInitStatusBeforeAdd } from "@/utils";
import type { Material, Status } from "@/types";
import { useEditorStore } from "@/stores/useEditor";
const store = useEditorStore();
// 事件总线
import EventBus from "@/utils/eventBus";

interface Item {
  materialName: Material;
  comName: string;
}

const props = defineProps<{
  item: Item;
}>();
const addSurveyCom = () => {
  const newSurveyComName = props.item.materialName as Material;
  if (!newSurveyComName) {
    console.warn("请先选择题型");
    return;
  }
  const newSurveyComStatus = defaultStatusMap[newSurveyComName]!() as Status;
  updateInitStatusBeforeAdd(newSurveyComStatus, newSurveyComName);

  store.addCom(newSurveyComStatus);
  // 每次添加了新的组件，都要滚动到底部
  EventBus.emit("scrollToBottom");
};
</script>

<style scoped lang="scss">
.survey-com-item-cell {
  // 网格单元格自动撑满，无需额外样式
}
.survey-com-item-container {
  width: 100%;
  height: 30px;
  padding: 0 8px;
  box-sizing: border-box;
  background-color: var(--background-color);
  border-radius: var(--border-radius-md);
  font-size: var(--font-size-base);
  color: var(--font-color-light);
  user-select: none;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition:
    background-color 0.15s ease,
    box-shadow 0.15s ease,
    transform 0.15s ease;
}
.survey-com-item-container:hover {
  background-color: var(--font-color-lightest);
  // 轻微上浮 + 阴影反馈，与卡片默认态形成层次区分
  box-shadow: var(--shadow-xs);
  transform: translateY(-1px);
}
</style>
