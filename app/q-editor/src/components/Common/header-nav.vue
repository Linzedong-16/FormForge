<template>
  <div>
    <div class="container flex self-start align-items-center border-box">
      <!-- 左侧：预留插槽，默认空白 -->
      <div class="left flex justify-content-center align-items-center">
        <slot name="left"></slot>
      </div>
      <!-- 中间：预留插槽，默认空白 -->
      <div class="center flex align-items-center pl-15 pr-15">
        <slot name="center"></slot>
        <MessageBell />
      </div>
      <!-- 右侧：与 Header 一致，保留用户头像组件 -->
      <div class="right flex justify-content-center align-items-center">
        <UserProfile />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import UserProfile from "@/components/Common/UserProfile.vue";
import MessageBell from "@/components/Common/MessageBell.vue";
</script>

<style scoped lang="scss">
.container {
  width: 100%;
  height: 50px;
  border-bottom: 1px solid var(--border-color);
  .left {
    width: 60px;
    height: 100%;
  }
  .center {
    flex: 1;
    height: 100%;
    border-left: 1px solid var(--border-color);
    border-right: 1px solid var(--border-color);
  }
  .right {
    width: 80px;
    height: 100%;
  }
}
</style>
