<template>
  <Layout>
    <el-tooltip :content="t('materials.textInput')" placement="right">
      <Router-link to="/text-input" class="link-item mb-15" exact-active-class="link-item-active">{{
        t("materials.textInput")
      }}</Router-link>
    </el-tooltip>
  </Layout>
</template>

<script setup lang="ts">
import Layout from "./Layout.vue";
import { useI18n } from "vue-i18n";

const { t } = useI18n();
</script>

<style scoped></style>
