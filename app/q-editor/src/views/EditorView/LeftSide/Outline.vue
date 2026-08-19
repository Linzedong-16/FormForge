<template>
  <div v-if="store.surveyCount">
    <draggable v-model="store.coms" item-key="index" @start="dragstart">
      <template #item="{ element, index }">
        <div
          v-show="isSurveyComName(element.name)"
          class="mb-10"
          :class="{
            active: store.currentComponentIndex === index
          }"
          @click="clickHandle(index)"
        >
          <div class="item">
            {{ serialNum[index] }}.
            {{
              element.status.title.status.length > 10
                ? element.status.title.status.substring(0, 10) + "..."
                : element.status.title.status
            }}
          </div>
        </div>
      </template>
    </draggable>
  </div>
  <div v-else class="tip flex align-items-center justify-content-center">{{ t("editor.addQuestion") }}</div>
</template>

<script setup lang="ts">
import { computed } from "vue";
// 拖动组件
import draggable from "vuedraggable";
import { isSurveyComName } from "@/types";
// 事件总线
import EventBus from "@/utils/eventBus";
// 仓库
import { useEditorStore } from "monorepo-survey-engine";
const store = useEditorStore();
// 组合式函数
import { useSurveyNo } from "@/utils/hooks";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

// 获取题目编号
const serialNum = computed(() => useSurveyNo(store.coms).value);

const dragstart = () => {
  store.setCurrentComponentIndex(-1);
};

const clickHandle = (index: number) => {
  if (store.currentComponentIndex === index) {
    store.setCurrentComponentIndex(-1);
  } else {
    store.setCurrentComponentIndex(index);
    // 先切换到该题目所在的分页，再滚动定位，保证跨页导航可见
    store.setCurrentPage(Math.floor(index / store.pageSize) + 1);
    EventBus.emit("scrollToCenter", index);
  }
};
</script>

<style scoped>
.item {
  /* outline: 1px solid black; */
  color: var(--font-color-light);
  font-size: var(--font-size-base);
  padding: 10px;
  cursor: pointer;
}
.tip {
  height: calc(100% - 50px);
}
.active {
  transform: scale(1.04);
  transition: 0.5s;
  background-color: var(--border-color);
  border-radius: var(--border-radius-lg);
}
</style>
