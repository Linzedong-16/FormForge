<template>
  <div>
    <div class="container mb-15">
      <!-- 标题 -->
      <h2 class="title font-weight-100">这是一个标题</h2>
      <!-- 描述 -->
      <div class="desc">这是一个描述</div>
    </div>
  </div>
</template>

<script setup lang="ts"></script>

<style scoped lang="scss">
.container {
  > h2 {
    font-size: 20px;
    > span {
      margin: 0 5px;
    }
  }
}
.desc {
  font-size: var(--font-size-base);
  color: var(--font-color-light);
  text-indent: 5px;
}
</style>
