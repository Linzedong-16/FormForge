<template>
  <Layout>
    <el-tooltip :content="t('materials.rateScore')" placement="right">
      <Router-Link to="/rate-score" class="link-item mb-15" exact-active-class="link-item-active">{{
        t("materials.rateScore")
      }}</Router-Link>
    </el-tooltip>
    <el-tooltip :content="t('materials.dateTime')" placement="right">
      <Router-Link to="/date-time" class="link-item mb-15" exact-active-class="link-item-active">{{
        t("materials.dateTime")
      }}</Router-Link>
    </el-tooltip>
    <el-tooltip :content="t('materials.cascader')" placement="right">
      <Router-Link to="/cascader" class="link-item mb-15" exact-active-class="link-item-active">{{
        t("materials.cascader")
      }}</Router-Link>
    </el-tooltip>
    <el-tooltip :content="t('materials.matrixSingle')" placement="right">
      <Router-Link to="/matrix-single" class="link-item mb-15" exact-active-class="link-item-active">{{
        t("materials.matrixSingle")
      }}</Router-Link>
    </el-tooltip>
    <el-tooltip :content="t('materials.slider')" placement="right">
      <Router-Link to="/slider" class="link-item mb-15" exact-active-class="link-item-active">{{
        t("materials.slider")
      }}</Router-Link>
    </el-tooltip>
    <el-tooltip :content="t('materials.transfer')" placement="right">
      <Router-Link to="/transfer" class="link-item mb-15" exact-active-class="link-item-active">{{
        t("materials.transfer")
      }}</Router-Link>
    </el-tooltip>
  </Layout>
</template>

<script setup lang="ts">
import Layout from "./Layout.vue";
import { useI18n } from "vue-i18n";

const { t } = useI18n();
</script>
