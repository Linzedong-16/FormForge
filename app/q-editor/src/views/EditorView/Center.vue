<template>
  <div ref="centerContainer" class="center-container survey-scope">
    <draggable
      :list="store.coms"
      item-key="id"
      item-index="index"
      :options="{ animation: 150, ghostClass: 'ghost', chosenClass: 'chosen', dragClass: 'drag' }"
      @start="onDragStart"
      @change="onDragChange"
    >
      <template #item="{ element, index }">
        <ComItemProvider :com-index="index">
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
        </ComItemProvider>
      </template>
    </draggable>
  </div>
</template>

<script setup lang="ts">
import draggable from "vuedraggable";

import { computed, nextTick, ref, type ComponentPublicInstance, onMounted, onUnmounted, provide, toRaw } from "vue";
import { useEditorStore } from "@/stores/useEditor";
import type { Snapshot } from "@/utils/undoManager";
const store = useEditorStore();
/** 提供函数式 surveyId 获取器，确保上传时始终获取最新的 remoteSurveyId */
provide("getSurveyId", () => store.remoteSurveyId);
// 事件总监
import EventBus from "@/utils/eventBus";
import { useSurveyNo } from "@/utils/hooks";
import { Close } from "@element-plus/icons-vue";
import { ElMessage, ElMessageBox } from "element-plus";
import type { OptionsProps, PicLink } from "@/types";
import { useI18n } from "vue-i18n";
import ComItemProvider from "@/components/Editor/ComItemProvider.vue";

const { t } = useI18n();

// ─── 全局 getLink 兜底 ──────────────────────────────────────────
// ComItemProvider 已为每个组件注入作用域化的 getLink（优先使用），
// 此全局 getLink 作为兜底：当 inject 链未找到 ComItemProvider 时，
// 回退到基于 currentComponentIndex 的旧逻辑并提供警告提示。
const globalGetLink = (payload: PicLink) => {
  const index = store.currentComponentIndex;
  if (index === -1 || !store.coms[index]) {
    ElMessage.warning(t("editor.selectComponentFirst"));
    return;
  }
  const optionsProps = store.coms[index]!.status.options as OptionsProps;
  store.setPicLinkByIndex(optionsProps, payload);
};
provide("getLink", globalGetLink);

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

// ─── 拖拽排序快照（vuedraggable 直接 mutate coms，需手动记录）────────────────

let dragSnapshot: Snapshot | null = null;

/** 拖拽开始：保存当前状态快照（JSON 序列化，Vue 组件引用由 restored 时重新挂载） */
const onDragStart = () => {
  dragSnapshot = {
    coms: JSON.parse(JSON.stringify(toRaw(store.coms))),
    surveyCount: store.surveyCount,
    currentComponentIndex: store.currentComponentIndex
  };
};

/** 拖拽结束（排序变更）：将开始前保存的快照压入撤销栈 */
const onDragChange = () => {
  if (dragSnapshot) {
    // 将拖拽前的快照压入撤销栈（此时 coms 已被 vuedraggable 修改）
    store._pushSnapshot(dragSnapshot);
    dragSnapshot = null;
  }
};

// 删除选中的组件
const removeCom = (index: number) => {
  ElMessageBox.confirm(t("editor.deleteConfirm"), t("editor.deleteTitle"), {
    confirmButtonText: t("editor.confirm"),
    cancelButtonText: t("editor.cancel"),
    type: "warning"
  })
    .then(() => {
      store.removeCom(index);
      store.setCurrentComponentIndex(-1);
      ElMessage.success(t("editor.deleteSuccess"));
    })
    .catch(() => {
      ElMessage.info(t("editor.deleteCancelled"));
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
  // 原为 background: var(--white); opacity: 0.9，整体透明会连内部文字一起拉淡；
  // 改为只对背景本身取一个接近白的半透明值，画布内容保持 100% 清晰可读
  background: rgba(255, 255, 255, 0.94);
  position: relative;
  overflow: auto;
  max-height: calc(100vh - 140px); /* 70px margin top + 70px margin bottom */
  /* 细而透明的灰色滚动条，参考千问侧边栏样式：常态若隐若现，hover 时略微加深 */
  &::-webkit-scrollbar {
    width: 6px;
  }
  &::-webkit-scrollbar-track {
    background: transparent;
  }
  &::-webkit-scrollbar-thumb {
    background-color: color-mix(in srgb, var(--black) 18%, transparent);
    border-radius: 3px;
  }
  &::-webkit-scrollbar-thumb:hover {
    background-color: color-mix(in srgb, var(--black) 32%, transparent);
  }
  scrollbar-width: thin; /* Firefox */
  scrollbar-color: color-mix(in srgb, var(--black) 18%, transparent) transparent;
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
      box-shadow: var(--shadow-md);
    }
  }
}

.active {
  transform: scale(1.01);
  transition: 0.5s;
  box-shadow: var(--shadow-md);
}
.delete-btn {
  right: -5px;
  top: -10px;
}
</style>
