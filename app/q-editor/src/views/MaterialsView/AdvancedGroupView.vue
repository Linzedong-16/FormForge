<template>
  <Layout>
    <Router-Link to="/rate-score" class="link-item mb-15" exact-active-class="link-item-active">{{
      t("materials.rateScore")
    }}</Router-Link>
    <Router-Link to="/date-time" class="link-item mb-15" exact-active-class="link-item-active">{{
      t("materials.dateTime")
    }}</Router-Link>
    <Router-Link to="/cascader" class="link-item mb-15" exact-active-class="link-item-active">{{
      t("materials.cascader")
    }}</Router-Link>
    <Router-Link to="/matrix-single" class="link-item mb-15" exact-active-class="link-item-active">{{
      t("materials.matrixSingle")
    }}</Router-Link>
    <Router-Link to="/slider" class="link-item mb-15" exact-active-class="link-item-active">{{
      t("materials.slider")
    }}</Router-Link>
    <Router-Link to="/transfer" class="link-item mb-15" exact-active-class="link-item-active">{{
      t("materials.transfer")
    }}</Router-Link>
  </Layout>
</template>

<script setup lang="ts">
import Layout from "./Layout.vue";
import { useI18n } from "vue-i18n";

const { t } = useI18n();
</script>
