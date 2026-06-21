<template>
  <slot />
</template>

<script setup lang="ts">
import { provide } from "vue";
import type { PicLink, OptionsProps } from "@/types";
import { useEditorStore } from "@/stores/useEditor";

const props = defineProps<{
  comIndex: number;
}>();

const store = useEditorStore();

/**
 * 作用域化的 getLink —— 确保图片链接写入当前组件而非依赖全局 currentComponentIndex
 *
 * 与 MaterialsView/Layout.vue 的设计保持一致：每个组件拥有自己的 getLink，
 * 图片上传回调携带的选项索引直接作用于本组件。
 */
const getLink = (payload: PicLink) => {
  const com = store.coms[props.comIndex];
  if (!com) {
    // 静默跳过：组件不存在时由 Center.vue 的全局 getLink 兜底（带提示）
    return;
  }
  const optionsProps = com.status.options as OptionsProps | undefined;
  if (optionsProps) {
    store.setPicLinkByIndex(optionsProps, payload);
  }
};

provide("getLink", getLink);
</script>
