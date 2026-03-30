<template>
  <Layout>
    <Router-link class="link-item mb-15" exact-active-class="link-item-active" to="/personal-info-gender"
      >性别</Router-link
    >
    <Router-link class="link-item mb-15" exact-active-class="link-item-active" to="/personal-info-education"
      >学历</Router-link
    >
  </Layout>
</template>

<script setup lang="ts">
import Layout from "./Layout.vue";
</script>

<style scoped></style>
