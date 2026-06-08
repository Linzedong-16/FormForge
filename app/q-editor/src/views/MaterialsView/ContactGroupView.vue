<template>
  <Layout>
    <Router-Link to="/personal-info-tel" class="link-item mb-15" exact-active-class="link-item-active">{{
      t("materials.contactTel")
    }}</Router-Link>
    <Router-Link to="/personal-info-wechat" class="link-item mb-15" exact-active-class="link-item-active">{{
      t("materials.contactWechat")
    }}</Router-Link>
    <Router-Link to="/personal-info-qq" class="link-item mb-15" exact-active-class="link-item-active">{{
      t("materials.contactQq")
    }}</Router-Link>
    <Router-Link to="/personal-info-email" class="link-item mb-15" exact-active-class="link-item-active">{{
      t("materials.contactEmail")
    }}</Router-Link>
    <Router-Link to="/personal-info-address" class="link-item mb-15" exact-active-class="link-item-active">{{
      t("materials.contactAddress")
    }}</Router-Link>
  </Layout>
</template>

<script setup lang="ts">
import Layout from "./Layout.vue";
import { useI18n } from "vue-i18n";

const { t } = useI18n();
</script>
