<template>
  <div class="left-side-container flex">
    <div class="tabs">
      <!-- 题型 -->
      <div
        class="tab-item"
        :class="{
          'tab-show': routeName === 'survey-type'
        }"
        @click="switchEditor"
      >
        <el-icon><Memo /></el-icon>
        <span class="tab-item-title mt-5">{{ t("editor.surveyType") }}</span>
      </div>
      <!-- 大纲 -->
      <div
        class="tab-item"
        :class="{
          'tab-show': routeName === 'outline'
        }"
        @click="switchOutline"
      >
        <el-icon><Document /></el-icon>
        <span class="tab-item-title mt-5">{{ t("editor.outline") }}</span>
      </div>
      <!-- 模板市场 -->
      <div
        class="tab-item"
        :class="{
          'tab-show': routeName === 'template-market'
        }"
        @click="switchTemplateMarket"
      >
        <el-icon><Shop /></el-icon>
        <span class="tab-item-title mt-5">{{ t("editor.templateMarket") }}</span>
      </div>
    </div>
    <RouterView class="tab-pane" />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { Document, Memo, Shop } from "@element-plus/icons-vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

const route = useRoute();
const routeName = computed(() => route.name);
const router = useRouter();

const switchEditor = () => {
  router.push({ name: "survey-type" });
};

const switchOutline = () => {
  router.push({ name: "outline" });
};

const switchTemplateMarket = () => {
  router.push({ name: "template-market" });
};
</script>

<style scoped lang="scss">
.left-side-container {
  width: var(--editor-left-width);
  height: calc(100vh - 50px - 40px);
  position: fixed;
  left: var(--editor-gap);
  top: 70px;
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-md);
  > .tabs {
    flex-shrink: 0;
    width: 60px;
    height: 100%;
    border-right: 1px solid var(--border-color);
    > .tab-item {
      width: 100%;
      height: 100px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-direction: column;
      color: var(--font-color-light);
      text-decoration: none;
      cursor: pointer;
      position: relative;
      transition:
        color 0.2s ease,
        background-color 0.2s ease;
      > .tab-item-title {
        font-size: var(--font-size-base);
      }
      // 左侧高亮指示条
      &::before {
        content: "";
        position: absolute;
        left: 0;
        top: 50%;
        transform: translateY(-50%);
        width: 3px;
        height: 0;
        background: var(--primary-color);
        border-radius: 0 2px 2px 0;
        transition: height 0.2s ease;
      }
      &:hover {
        color: var(--primary-color);
        background-color: var(--background-color);
      }
    }
    > .tab-show {
      color: var(--primary-color);
      font-weight: 600;
      background-color: var(--background-color);
      // 选中态指示条展开
      &::before {
        height: 28px;
      }
    }
  }
  > .tab-pane {
    flex: 1;
    height: calc(100% - 50px);
    padding: 25px;
    overflow-y: auto;
    &::-webkit-scrollbar {
      display: none;
    }
    scrollbar-width: none;
  }
}

/* 暗色模式：面板背景 + 容器背景适配 */
html.dark .left-side-container {
  background: rgba(24, 24, 27, 0.92);
}
</style>
