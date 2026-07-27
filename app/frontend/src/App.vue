<script setup lang="ts">
// App Component
</script>

<template>
  <div class="app">
    <router-view v-slot="{ Component }">
      <transition name="page-fade-slide" mode="out-in">
        <component :is="Component" />
      </transition>
    </router-view>
  </div>
</template>

<style scoped>
.app {
  width: 100vw;
  height: 100vh;
}
</style>
