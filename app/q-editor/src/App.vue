<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { ElConfigProvider } from "element-plus";
// Element Plus 各语言包
import zhCn from "element-plus/es/locale/lang/zh-cn.mjs";
import en from "element-plus/es/locale/lang/en.mjs";
import ja from "element-plus/es/locale/lang/ja.mjs";

const { locale } = useI18n();

// Element Plus 语言跟随 i18n 当前语言切换
const elementLocaleMap: Record<string, typeof zhCn> = {
  "zh-CN": zhCn,
  "en-US": en,
  "ja-JP": ja
};
const elementLocale = computed(() => elementLocaleMap[locale.value] ?? zhCn);
</script>

<template>
  <el-config-provider :locale="elementLocale">
    <router-view></router-view>
  </el-config-provider>
</template>

<style scoped lang="scss"></style>
