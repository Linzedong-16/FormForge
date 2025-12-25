<template>
  <div>
    <component :is="icons" />
  </div>
</template>

<script setup lang="ts">
import {
  IconHome,
  IconCodeSandbox,
  IconCode,
  IconShrink,
  IconLayout,
  IconCloudDownload,
  IconFile,
  IconPhone,
  IconLink,
  IconInfo,
  IconBook
} from "@arco-design/web-vue/es/icon";
import { computed } from "vue";

const iconMap = {
  home: IconHome,
  codeSandbox: IconCodeSandbox,
  code: IconCode,
  shrink: IconShrink,
  layout: IconLayout,
  download: IconCloudDownload,
  file: IconFile,
  phone: IconPhone,
  link: IconLink,
  info: IconInfo,
  book: IconBook
};
type IconProps = {
  icon: keyof typeof iconMap;
};
const props = defineProps<IconProps>();

const icons = computed(() => {
  return iconMap[props.icon] || IconHome;
});
</script>

<style lang="less" scoped></style>
