<template>
  <div ref="centerContainer" class="center-container">
    <draggable
      :list="store.coms"
      item-index="index"
      :options="{ animation: 150, ghostClass: 'ghost', chosenClass: 'chosen', dragClass: 'drag' }"
    >
      <template #item="{ element, index }">
        <div
          :key="element.id"
          :ref="el => (componentsRefs[index] = el)"
          class="content mb-10 relative"
          :class="{
            active: store.currentComponentIndex === index
          }"
          @click="clickHandle(index)"
        >
          <component :is="element.type" :status="element.status" :serial-num="serialNum[index]" />
          <div v-show="store.currentComponentIndex === index" class="absolute delete-btn">
            <el-button type="danger" class="ml-10" size="small" :icon="Close" circle @click.stop="removeCom(index)" />
          </div>
        </div>
      </template>
    </draggable>
  </div>
</template>

<script setup lang="ts">
import draggable from "vuedraggable";

import { computed, nextTick, ref, type ComponentPublicInstance } from "vue";
import { useEditorStore } from "@/stores/useEditor";
const store = useEditorStore();
// 事件总监
import EventBus from "@/utils/eventBus";
import { useSurveyNo } from "@/utils/hooks";
import { Close } from "@element-plus/icons-vue";
import { ElMessage, ElMessageBox } from "element-plus";

const centerContainer = ref<HTMLElement | null>(null);

const scrollToBottom = () => {
  nextTick(() => {
    const container = centerContainer.value; // 获取容器的dom元素
    if (container) {
      window.scrollTo({
        top: container.scrollHeight, // 滚动到最底部
        behavior: "smooth"
      });
    }
  });
};

const componentsRefs = ref<(Element | ComponentPublicInstance | null)[]>([]);

const scrollToCenter = (index: number) => {
  nextTick(() => {
    const item = componentsRefs.value[index] as HTMLElement;
    if (item instanceof HTMLElement) {
      item.scrollIntoView({
        behavior: "smooth",
        block: "center"
      });
    }
  });
};
// 通过事件总线提供滚动方法给外部调用
EventBus.on("scrollToBottom", scrollToBottom);
EventBus.on("scrollToCenter", scrollToCenter);

const clickHandle = (index: number) => {
  if (store.currentComponentIndex === index) {
    store.setCurrentComponentIndex(-1);
  } else {
    store.setCurrentComponentIndex(index);
  }
};

// 组件编号
const serialNum = computed(() => useSurveyNo(store.coms).value);

// 删除选中的组件
const removeCom = (index: number) => {
  ElMessageBox.confirm("确定删除该组件吗？", "提示", {
    confirmButtonText: "确定",
    cancelButtonText: "取消",
    type: "warning"
  })
    .then(() => {
      store.removeCom(index);
      store.setCurrentComponentIndex(-1);
      ElMessage.success("删除成功");
    })
    .catch(() => {
      ElMessage.info("已取消删除");
    });
};
</script>

<style scoped lang="scss">
.center-container {
  width: 50%;
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-md);
  margin: 70px auto;
  padding: 20px;
  background: rgba(255, 255, 255, 0.9);
  position: relative;
  overflow: auto;
  .content {
    cursor: pointer;
    padding: 10px;
    background-color: var(--white);
    border-radius: var(--border-radius-sm);

    /* transform: translateZ(0);
    backface-visibility: hidden;
    will-change: transform; */

    &:hover {
      transform: scale(1.01);
      transition: 0.5s;
      box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
    }
  }
}

.active {
  transform: scale(1.01);
  transition: 0.5s;
  box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
}
.delete-btn {
  right: -5px;
  top: -10px;
}
</style>
