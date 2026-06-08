<template>
  <Layout>
    <el-tooltip :content="t('materials.personalName')" placement="right">
      <Router-Link to="/personal-info-name" class="link-item mb-15" exact-active-class="link-item-active">{{
        t("materials.personalName")
      }}</Router-Link>
    </el-tooltip>
    <el-tooltip :content="t('materials.personalId')" placement="right">
      <Router-Link to="/personal-info-id" class="link-item mb-15" exact-active-class="link-item-active">{{
        t("materials.personalId")
      }}</Router-Link>
    </el-tooltip>
    <el-tooltip :content="t('materials.personalGender')" placement="right">
      <Router-Link to="/personal-info-gender" class="link-item mb-15" exact-active-class="link-item-active">{{
        t("materials.personalGender")
      }}</Router-Link>
    </el-tooltip>
    <el-tooltip :content="t('materials.personalAge')" placement="right">
      <Router-Link to="/personal-info-age" class="link-item mb-15" exact-active-class="link-item-active">{{
        t("materials.personalAge")
      }}</Router-Link>
    </el-tooltip>
    <el-tooltip :content="t('materials.personalEducation')" placement="right">
      <Router-Link to="/personal-info-education" class="link-item mb-15" exact-active-class="link-item-active">{{
        t("materials.personalEducation")
      }}</Router-Link>
    </el-tooltip>
    <el-tooltip :content="t('materials.personalCollage')" placement="right">
      <Router-Link to="/personal-info-collage" class="link-item mb-15" exact-active-class="link-item-active">{{
        t("materials.personalCollage")
      }}</Router-Link>
    </el-tooltip>
    <el-tooltip :content="t('materials.personalMajor')" placement="right">
      <Router-Link to="/personal-info-major" class="link-item mb-15" exact-active-class="link-item-active">{{
        t("materials.personalMajor")
      }}</Router-Link>
    </el-tooltip>
    <el-tooltip :content="t('materials.personalIndustry')" placement="right">
      <Router-Link to="/personal-info-industry" class="link-item mb-15" exact-active-class="link-item-active">{{
        t("materials.personalIndustry")
      }}</Router-Link>
    </el-tooltip>
    <el-tooltip :content="t('materials.personalCareer')" placement="right">
      <Router-Link to="/personal-info-career" class="link-item mb-15" exact-active-class="link-item-active">{{
        t("materials.personalCareer")
      }}</Router-Link>
    </el-tooltip>
    <el-tooltip :content="t('materials.personalCompany')" placement="right">
      <Router-Link to="/personal-info-company" class="link-item mb-15" exact-active-class="link-item-active">{{
        t("materials.personalCompany")
      }}</Router-Link>
    </el-tooltip>
    <el-tooltip :content="t('materials.personalPosition')" placement="right">
      <Router-Link to="/personal-info-position" class="link-item mb-15" exact-active-class="link-item-active">{{
        t("materials.personalPosition")
      }}</Router-Link>
    </el-tooltip>
  </Layout>
</template>

<script setup lang="ts">
import Layout from "./Layout.vue";
import { useI18n } from "vue-i18n";

const { t } = useI18n();
</script>
