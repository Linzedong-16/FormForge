<template>
  <Layout>
    <Router-Link to="/rate-score" class="link-item mb-15" exact-active-class="link-item-active">评价/打分</Router-Link>
    <Router-Link to="/date-time" class="link-item mb-15" exact-active-class="link-item-active">日期/时间</Router-Link>
    <Router-Link to="/cascader" class="link-item mb-15" exact-active-class="link-item-active">多级联动</Router-Link>
    <Router-Link to="/matrix-single" class="link-item mb-15" exact-active-class="link-item-active"
      >矩阵单选</Router-Link
    >
  </Layout>
</template>

<script setup lang="ts">
import Layout from "./Layout.vue";
</script>
