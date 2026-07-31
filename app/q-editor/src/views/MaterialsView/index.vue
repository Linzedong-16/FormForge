<template>
  <Header :is-editor="false" />
  <div class="materials-page">
    <h1 class="font-weight-100 text-center m0 p0">{{ t("materials.pageTitle") }}</h1>
    <div class="container mc flex">
      <!-- 导航：图标 + 文字已能说明用途，无需再叠加同文本的 tooltip；active-class 用于突出当前分类 -->
      <nav class="category mc">
        <Router-link class="category-item" active-class="category-item-active" to="/select-group">
          <el-icon>
            <CircleCheck />
          </el-icon>
          <div class="category-text">{{ t("materials.categorySelect") }}</div>
        </Router-link>
        <Router-link class="category-item" active-class="category-item-active" to="/input-group">
          <el-icon>
            <EditPen />
          </el-icon>
          <div class="category-text">{{ t("materials.categoryInput") }}</div>
        </Router-link>
        <Router-link class="category-item" active-class="category-item-active" to="/advanced-group">
          <el-icon>
            <Files />
          </el-icon>
          <div class="category-text">{{ t("materials.categoryAdvanced") }}</div>
        </Router-link>
        <Router-link class="category-item" active-class="category-item-active" to="/note-group">
          <el-icon>
            <ChatLineSquare />
          </el-icon>
          <div class="category-text">{{ t("materials.categoryNote") }}</div>
        </Router-link>
        <Router-link class="category-item" active-class="category-item-active" to="/personal-info-group">
          <el-icon>
            <User />
          </el-icon>
          <div class="category-text">{{ t("materials.categoryPersonalInfo") }}</div>
        </Router-link>
        <Router-link class="category-item" active-class="category-item-active" to="/contact-group">
          <el-icon>
            <Message />
          </el-icon>
          <div class="category-text">{{ t("materials.categoryContact") }}</div>
        </Router-link>
      </nav>
      <!-- 路由出口 -->
      <div class="coms">
        <RouterView />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import Header from "@/components/Common/Header.vue";
// 引入对应图标
import { CircleCheck, Files, EditPen, ChatLineSquare, User, Message } from "@element-plus/icons-vue";
import { useI18n } from "vue-i18n";

const { t } = useI18n();
</script>

<style scoped lang="scss">
// 组件市场（物料选择）页面：跟随全局亮暗主题的页面底色
// （亮/暗两套取值见 variables.scss / theme-dark.scss 的 --background-color）
// 高度需减去同级 Header（50px）的高度，否则「Header + 100vh」会超出视口，
// 导致最外层文档出现一条多余的滚动条
.materials-page {
  height: calc(100vh - 50px);
  overflow: hidden;
  background-color: var(--background-color);
}
h1 {
  height: 50px;
  margin: 20px 0;
}
.container {
  width: 1180px;
  height: 600px;
}
.category {
  width: 70px;
  height: 100%;
  > .category-item {
    width: 70px;
    height: 70px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    margin-bottom: 10px;
    text-align: center;
    text-decoration: none;
    font-size: var(--font-size-base);
    color: var(--white);
    border-top-left-radius: var(--border-radius-lg);
    border-bottom-left-radius: var(--border-radius-lg);
    // 每个分类底色不同（见下方 nth-child 规则），高亮态改用统一的主色描边 + 提亮，
    // 保证在四种彩色底色上都能识别，且颜色随 --el-color-primary 联动亮暗/色弱模式
    box-shadow: inset 0 0 0 2px transparent;
    transition:
      filter 0.15s ease,
      box-shadow 0.15s ease;
    &:hover {
      filter: brightness(1.1);
    }
    &.category-item-active {
      filter: brightness(1.08);
      box-shadow: inset 0 0 0 2px var(--el-color-primary);
    }
  }
  @for $i from 1 through 4 {
    .category-item:nth-child(4n + #{$i}) {
      @if $i == 1 {
        background-color: var(--primary-color);
      } @else if $i == 2 {
        background-color: var(--success-color);
      } @else if $i == 3 {
        background-color: var(--warning-color);
      } @else if $i == 4 {
        background-color: var(--error-color);
      }
    }
  }
}
.category-text {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 50px;
  font-size: 12px;
  margin-top: 4px;
}
.coms {
  width: calc(1180px - 60px);
  height: 100%;
}
</style>
