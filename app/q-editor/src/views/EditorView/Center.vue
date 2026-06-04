<template>
  <div ref="centerContainer" class="center-container">
    <draggable
      :list="store.coms"
      item-index="index"
      :options="{ animation: 150, ghostClass: 'ghost', chosenClass: 'chosen', dragClass: 'drag' }"
    >
      <template #item="{ element, index }">
        <div
          v-show="isInCurrentPage(index)"
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

import { computed, nextTick, ref, type ComponentPublicInstance, onMounted, onUnmounted, provide } from "vue";
import { useEditorStore } from "@/stores/useEditor";
const store = useEditorStore();
// 事件总监
import EventBus from "@/utils/eventBus";
import { useSurveyNo } from "@/utils/hooks";
import { Close } from "@element-plus/icons-vue";
import { ElMessage, ElMessageBox } from "element-plus";
import type { OptionsProps, PicLink } from "@/types";

// 图片选择组件的图片上传回调
// 业务组件（如 SinglePicSelect）内部的 PicItem 上传成功后会通过 inject 调用此函数，
// 这里将图片链接写入「当前选中组件」options 配置中，并经 pinia 持久化到编辑器状态。
// 说明：编辑图片题目时该组件必然已被选中（右侧才会显示对应编辑面板），故以 currentComponentIndex 定位组件。
const getLink = (payload: PicLink) => {
  const index = store.currentComponentIndex;
  if (index === -1 || !store.coms[index]) {
    ElMessage.warning("请先选中该图片题目组件后再上传图片");
    return;
  }
  const optionsProps = store.coms[index]!.status.options as OptionsProps;
  store.setPicLinkByIndex(optionsProps, payload);

  // 强制触发响应式更新，确保编辑面板和预览同步更新
  nextTick(() => {
    store.setCurrentComponentIndex(index);
  });
};
provide("getLink", getLink);

const centerContainer = ref<HTMLElement | null>(null);

// 节流函数
function throttle(callback: (...args: any[]) => void, interval: number) {
  let last = 0;
  return (...args: any[]) => {
    const now = Date.now();
    if (now - last >= interval) {
      callback(...args);
      last = now;
    }
  };
}

const scrollToBottom = throttle(() => {
  nextTick(() => {
    const container = centerContainer.value; // 获取容器的dom元素
    if (container) {
      window.scrollTo({
        top: container.scrollHeight, // 滚动到最底部
        behavior: "smooth"
      });
    }
  });
}, 100);

const componentsRefs = ref<(Element | ComponentPublicInstance | null)[]>([]);

const scrollToCenter = throttle((index: number) => {
  nextTick(() => {
    const item = componentsRefs.value[index] as HTMLElement;
    if (item instanceof HTMLElement) {
      item.scrollIntoView({
        behavior: "smooth",
        block: "center"
      });
    }
  });
}, 100);

// 鼠标滚轮事件节流处理
const handleWheel = throttle((e: WheelEvent) => {
  // 阻止默认滚动行为，避免频繁触发窗口滚动
  e.preventDefault();
  console.log("节流函数触发");
  // 获取容器元素
  const container = centerContainer.value;
  if (container) {
    // 计算新的滚动位置
    const newScrollTop = container.scrollTop + e.deltaY * 0.5; // 0.5 是滚动速度系数，可以根据需要调整

    // 设置新的滚动位置
    container.scrollTop = Math.max(0, Math.min(newScrollTop, container.scrollHeight - container.clientHeight));
  }
}, 100);

// 组件挂载时添加事件监听器
onMounted(() => {
  // 为编辑器容器添加滚轮事件监听
  const container = centerContainer.value;
  if (container) {
    container.addEventListener("wheel", handleWheel, { passive: false });
  }
});

// 组件卸载时移除事件监听器
onUnmounted(() => {
  const container = centerContainer.value;
  if (container) {
    container.removeEventListener("wheel", handleWheel);
  }
});

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

// 判断某个全局索引的组件是否属于当前分页（仅控制可见性，不改变索引与业务逻辑）
const isInCurrentPage = (index: number) => {
  const start = (store.currentPage - 1) * store.pageSize;
  return index >= start && index < start + store.pageSize;
};

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
  // 中部区域通过左右外边距为两侧固定定位的侧栏让位，宽度自动填充中间剩余空间，
  // 因此在各尺寸下都不会与侧栏重叠（侧栏宽度见 variables.scss，三栏由 CSS 变量联动）。
  width: auto;
  margin-top: 70px;
  margin-bottom: 20px;
  margin-left: calc(var(--editor-left-width) + var(--editor-gap) * 2);
  margin-right: calc(var(--editor-right-width) + var(--editor-gap) * 2);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-md);
  padding: 20px;
  background: rgba(255, 255, 255, 0.9);
  position: relative;
  overflow: auto;
  max-height: calc(100vh - 140px); /* 70px margin top + 70px margin bottom */
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
