<template>
  <div>
    <component :is="icons" />
  </div>
</template>

<script setup lang="ts">
import {
  IconHome,
  IconDashboard,
  IconBarChart,
  IconFolder,
  IconHistory,
  IconLock,
  IconCloud,
  IconCodeSandbox,
  IconCode,
  IconShrink,
  IconLayout,
  IconCloudDownload,
  IconFile,
  IconPhone,
  IconLink,
  IconInfo,
  IconBook,
  IconUser,
  IconSettings,
  IconUserGroup,
  IconList,
  IconSafe,
  IconSend,
  IconThunderbolt,
  IconBug
} from "@arco-design/web-vue/es/icon";
import { computed } from "vue";

// 图标名称到 Arco 图标组件的映射表
const iconMap = {
  home: IconHome,
  dashboard: IconDashboard,
  barChart: IconBarChart,
  folderOpen: IconFolder,
  history: IconHistory,
  lock: IconLock,
  cloud: IconCloud,
  codeSandbox: IconCodeSandbox,
  code: IconCode,
  shrink: IconShrink,
  layout: IconLayout,
  download: IconCloudDownload,
  file: IconFile,
  phone: IconPhone,
  link: IconLink,
  info: IconInfo,
  book: IconBook,
  user: IconUser,
  settings: IconSettings,
  userGroup: IconUserGroup,
  list: IconList,
  safe: IconSafe,
  send: IconSend,
  thunderbolt: IconThunderbolt,
  bug: IconBug
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
