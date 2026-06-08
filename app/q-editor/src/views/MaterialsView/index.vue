<template>
  <Header :is-editor="false" />
  <div>
    <h1 class="font-weight-100 text-center m0 p0">{{ t("materials.pageTitle") }}</h1>
    <div class="container mc flex">
      <!-- 导航 -->
      <nav class="category mc">
        <el-tooltip :content="t('materials.categorySelect')" placement="right">
          <Router-link class="category-item" to="/select-group">
            <el-icon>
              <CircleCheck />
            </el-icon>
            <div class="category-text">{{ t("materials.categorySelect") }}</div>
          </Router-link>
        </el-tooltip>
        <el-tooltip :content="t('materials.categoryInput')" placement="right">
          <Router-link class="category-item" to="/input-group">
            <el-icon>
              <EditPen />
            </el-icon>
            <div class="category-text">{{ t("materials.categoryInput") }}</div>
          </Router-link>
        </el-tooltip>
        <el-tooltip :content="t('materials.categoryAdvanced')" placement="right">
          <Router-link class="category-item" to="/advanced-group">
            <el-icon>
              <Files />
            </el-icon>
            <div class="category-text">{{ t("materials.categoryAdvanced") }}</div>
          </Router-link>
        </el-tooltip>
        <el-tooltip :content="t('materials.categoryNote')" placement="right">
          <Router-link class="category-item" to="/note-group">
            <el-icon>
              <ChatLineSquare />
            </el-icon>
            <div class="category-text">{{ t("materials.categoryNote") }}</div>
          </Router-link>
        </el-tooltip>
        <el-tooltip :content="t('materials.categoryPersonalInfo')" placement="right">
          <Router-link class="category-item" to="/personal-info-group">
            <el-icon>
              <User />
            </el-icon>
            <div class="category-text">{{ t("materials.categoryPersonalInfo") }}</div>
          </Router-link>
        </el-tooltip>
        <el-tooltip :content="t('materials.categoryContact')" placement="right">
          <Router-link class="category-item" to="/contact-group">
            <el-icon>
              <Message />
            </el-icon>
            <div class="category-text">{{ t("materials.categoryContact") }}</div>
          </Router-link>
        </el-tooltip>
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
