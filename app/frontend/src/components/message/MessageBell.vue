<template>
  <a-badge :count="messageStore.unreadTotal" :max-count="99" :dot="false">
    <a-button type="text" size="large" @click="handleClick">
      <template #icon>
        <icon-notification />
      </template>
    </a-button>
  </a-badge>
</template>

<script setup lang="ts">
/**
 * 消息铃铛（管理后台顶部导航）
 *
 * 未读数为 0 时 a-badge 自动隐藏徽标（Arco 默认行为），超过 99 显示 "99+"
 * （由 :max-count="99" 控制，对齐 spec.md 边界情况）。
 */
import { onMounted, onUnmounted } from "vue";
import { useMessageStore } from "@/store/modules/message";

const emit = defineEmits<{ (e: "click"): void }>();

const messageStore = useMessageStore();

function handleClick() {
  emit("click");
}

onMounted(() => {
  messageStore.startPolling();
});

onUnmounted(() => {
  messageStore.stopPolling();
});
</script>
