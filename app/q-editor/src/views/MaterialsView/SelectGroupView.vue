<template>
  <Layout>
    <Router-link class="link-item mb-15" exact-active-class="link-item-active" to="/single-select">{{
      t("materials.singleSelect")
    }}</Router-link>
    <Router-link class="link-item mb-15" exact-active-class="link-item-active" to="/multi-select">{{
      t("materials.multiSelect")
    }}</Router-link>
    <Router-link class="link-item mb-15" exact-active-class="link-item-active" to="/option-select">{{
      t("materials.optionSelect")
    }}</Router-link>
    <Router-link class="link-item mb-15" exact-active-class="link-item-active" to="/single-pic-select">{{
      t("materials.singlePicSelect")
    }}</Router-link>
    <Router-link class="link-item mb-15" exact-active-class="link-item-active" to="/multi-pic-select">{{
      t("materials.multiPicSelect")
    }}</Router-link>
  </Layout>
</template>

<script setup lang="ts">
import Layout from "./Layout.vue";
import { useI18n } from "vue-i18n";

const { t } = useI18n();
</script>

<style scoped></style>
