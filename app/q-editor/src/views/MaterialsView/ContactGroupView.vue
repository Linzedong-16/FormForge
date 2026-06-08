<template>
  <Layout>
    <el-tooltip :content="t('materials.contactTel')" placement="right">
      <Router-Link to="/personal-info-tel" class="link-item mb-15" exact-active-class="link-item-active">{{
        t("materials.contactTel")
      }}</Router-Link>
    </el-tooltip>
    <el-tooltip :content="t('materials.contactWechat')" placement="right">
      <Router-Link to="/personal-info-wechat" class="link-item mb-15" exact-active-class="link-item-active">{{
        t("materials.contactWechat")
      }}</Router-Link>
    </el-tooltip>
    <el-tooltip :content="t('materials.contactQq')" placement="right">
      <Router-Link to="/personal-info-qq" class="link-item mb-15" exact-active-class="link-item-active">{{
        t("materials.contactQq")
      }}</Router-Link>
    </el-tooltip>
    <el-tooltip :content="t('materials.contactEmail')" placement="right">
      <Router-Link to="/personal-info-email" class="link-item mb-15" exact-active-class="link-item-active">{{
        t("materials.contactEmail")
      }}</Router-Link>
    </el-tooltip>
    <el-tooltip :content="t('materials.contactAddress')" placement="right">
      <Router-Link to="/personal-info-address" class="link-item mb-15" exact-active-class="link-item-active">{{
        t("materials.contactAddress")
      }}</Router-Link>
    </el-tooltip>
  </Layout>
</template>

<script setup lang="ts">
import Layout from "./Layout.vue";
import { useI18n } from "vue-i18n";

const { t } = useI18n();
</script>
