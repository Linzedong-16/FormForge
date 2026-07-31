<template>
  <Layout>
    <Router-Link to="/text-note" class="link-item mb-15" exact-active-class="link-item-active">{{
      t("materials.textNote")
    }}</Router-Link>
  </Layout>
</template>

<script setup lang="ts">
import Layout from "./Layout.vue";
import { useI18n } from "vue-i18n";

const { t } = useI18n();
</script>
