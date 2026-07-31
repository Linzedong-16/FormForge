<template>
  <div class="button-group-container flex align-items-center">
    <!-- 标题以及当前状态：文字过长时靠原生 title 兜底显示全名 -->
    <div class="title-container flex align-items-center">
      <div class="title-text mr-10" :title="title">{{ title }}</div>
      <div class="currentStatus" :title="status">{{ status }}</div>
    </div>
    <!-- 按钮组 -->
    <div class="button-wrapper">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps({
  title: {
    type: String,
    default: ""
  },
  status: {
    type: String,
    default: ""
  }
});
</script>

<style scoped lang="scss">
.button-group-container {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}
.title-container {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
}
.title-text {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 180px;
}
.currentStatus {
  color: var(--info-color);
  font-size: var(--font-size-base);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 80px;
}
.button-wrapper {
  flex-shrink: 0;
  margin-left: 10px;
}
</style>
