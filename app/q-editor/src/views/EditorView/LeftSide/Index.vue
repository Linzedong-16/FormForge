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
      <div class="tab-item" @click="switchTemplateMarket">
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
  // TODO: 跳转模板市场路由
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
    width: 20%;
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
      > .tab-item-title {
        font-size: var(--font-size-base);
      }
    }
    > .tab-show {
      color: var(--primary-color);
    }
  }
  > .tab-pane {
    width: 80%;
    // 高度需要减去padding部分，否则会溢出
    height: calc(100% - 50px);
    padding: 25px;
    overflow-y: scroll;
  }
}
</style>
