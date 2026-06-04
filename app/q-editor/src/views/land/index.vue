<template>
  <div class="land-page">
    <!-- 顶部导航栏 -->
    <header class="land-header">
      <div class="header-inner">
        <div class="header-left">
          <div class="logo">
            <span class="logo-icon">
              <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M16 2L2 10v12l14 8 14-8V10L16 2z" stroke="currentColor" stroke-width="2" fill="none" />
                <path d="M16 12L8 17l8 5 8-5-8-5z" fill="currentColor" opacity="0.6" />
              </svg>
            </span>
            <span class="logo-text">Q问卷</span>
          </div>
          <nav class="nav-menu">
            <div v-for="item in navItems" :key="item.name" class="nav-item">
              {{ item.name }}
              <el-icon v-if="item.hasDropdown" class="dropdown-icon"><ArrowDown /></el-icon>
            </div>
          </nav>
        </div>
        <div class="header-right">
          <div class="action-item">
            <el-icon><ChatDotRound /></el-icon>
            <span>咨询</span>
          </div>
          <div class="action-item">
            <el-icon><User /></el-icon>
            <span>登录</span>
          </div>
          <el-button type="primary" class="btn-free">免费使用</el-button>
        </div>
      </div>
    </header>

    <!-- 主体区域 -->
    <main class="land-main">
      <div class="main-content">
        <!-- 标题区域 -->
        <div class="hero-section">
          <h1 class="hero-title">
            <span class="title-icon">
              <svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
                <circle cx="16" cy="16" r="14" stroke="currentColor" stroke-width="2" fill="none" />
                <circle cx="16" cy="16" r="8" stroke="currentColor" stroke-width="2" fill="none" />
                <circle cx="16" cy="16" r="3" fill="currentColor" />
              </svg>
            </span>
            AI开启调研新时代
          </h1>
          <p class="hero-subtitle">AI 覆盖调研工作全链路，丰富的模版库+7大应用场景</p>

          <!-- 操作按钮 -->
          <div class="hero-actions">
            <el-button size="large" class="btn-experience">立即体验AI</el-button>
            <el-button size="large" class="btn-workspace" @click="openNewTab('/home')">进入工作台</el-button>
          </div>

          <!-- 搜索框 -->
          <div class="search-box">
            <el-input v-model="searchText" size="large" placeholder="员工培训满意度调研" class="search-input">
              <template #append>
                <el-button class="search-btn" :icon="Search" />
              </template>
            </el-input>
          </div>

          <!-- 热门搜索标签 -->
          <div class="hot-tags">
            <span class="tag-label">大家都在搜</span>
            <el-tag v-for="tag in hotTags" :key="tag" class="hot-tag" effect="plain" round>
              {{ tag }}
            </el-tag>
          </div>
        </div>
      </div>

      <!-- 右侧浮动咨询 -->
      <div class="floating-consult">
        <div class="consult-avatar">
          <img src="https://cube.elemecdn.com/9/c2/f0ee8a3c7c9638a54940382568c9dpng.png" alt="咨询" />
        </div>
        <span class="consult-text">咨询</span>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { ArrowDown, ChatDotRound, User, Search } from "@element-plus/icons-vue";
import { openNewTab } from "@/utils";

const searchText = ref("");

const navItems = [
  { name: "产品", hasDropdown: true },
  { name: "模板", hasDropdown: false },
  { name: "样本", hasDropdown: true },
  { name: "互填", hasDropdown: false },
  { name: "定价", hasDropdown: false },
  { name: "合作", hasDropdown: true },
  { name: "案例", hasDropdown: false },
  { name: "支持", hasDropdown: true }
];

const hotTags = ["满意度", "投票", "评选", "报名", "健康", "学生", "社区", "公司", "员工", "消费者", "市场调查"];
</script>

<style scoped lang="scss">
// —— 基础变量（与 element-theme.scss 保持一致）——
$primary-color: #18181b;
$primary-light-3: #3f3f46;
$primary-light-5: #52525b;
$border-color: #e4e4e7;
$border-color-dark: #a1a1aa;
$fill-color: #f4f4f5;
$fill-color-blank: #ffffff;
$text-color-primary: #18181b;
$text-color-regular: #3f3f46;
$border-radius-base: 6px;
$border-radius-lg: 8px;
$border-radius-round: 9999px;
$box-shadow-light: 0 1px 2px 0 rgb(0 0 0 / 0.05);
$box-shadow:
  0 4px 6px -1px rgb(0 0 0 / 0.1),
  0 2px 4px -2px rgb(0 0 0 / 0.1);

// —— 页面特有变量（shadcn UI 黑灰风格）——
$land-bg-primary: #09090b; // zinc-950
$land-text-primary: #ffffff;
$land-accent-color: #18181b; // zinc-900

.land-page {
  height: 100vh;
  width: 100%;
  overflow: hidden;
  position: relative;
  background-image: url("@/assets/imgs/editor_background.jpg");
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  background-color: $land-bg-primary;
}

// ───────────────────────────────────────────────────────────────────────────
// 顶部导航栏
// ───────────────────────────────────────────────────────────────────────────
.land-header {
  width: 100%;
  position: relative;
  z-index: 100;

  .header-inner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 40px;
    max-width: 1400px;
    margin: 0 auto;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 40px;
  }

  .logo {
    display: flex;
    align-items: center;
    gap: 8px;
    color: $land-text-primary;

    .logo-icon {
      width: 28px;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;

      svg {
        width: 100%;
        height: 100%;
        color: $land-text-primary;
      }
    }

    .logo-text {
      font-size: 18px;
      font-weight: 600;
      letter-spacing: 1px;
    }
  }

  .nav-menu {
    display: flex;
    align-items: center;
    gap: 28px;
  }

  .nav-item {
    color: $land-text-primary;
    font-size: 14px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 2px;
    transition: opacity 0.15s ease;

    &:hover {
      opacity: 0.8;
    }

    .dropdown-icon {
      font-size: 12px;
    }
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: 24px;
  }

  .action-item {
    color: $land-text-primary;
    font-size: 14px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 4px;
    transition: opacity 0.15s ease;

    &:hover {
      opacity: 0.8;
    }

    .el-icon {
      font-size: 16px;
    }
  }

  // —— el-button 覆盖：白色实心按钮 ——
  .btn-free {
    background-color: $fill-color-blank;
    color: $land-accent-color;
    border: none;
    font-weight: 500;
    border-radius: $border-radius-lg;
    padding: 10px 20px;
    height: auto;
    font-size: 14px;
    box-shadow: $box-shadow-light;
    transition:
      background-color 0.15s ease,
      box-shadow 0.15s ease,
      transform 0.15s ease;

    &:hover {
      background-color: rgba(255, 255, 255, 0.9);
      transform: translateY(-1px);
    }

    &:focus-visible {
      // shadcn 风格：使用 zinc 色 outline
      outline: 2px solid $land-accent-color;
      outline-offset: 2px;
    }
  }
}

// ───────────────────────────────────────────────────────────────────────────
// 主体区域
// ───────────────────────────────────────────────────────────────────────────
.land-main {
  position: relative;
  height: calc(100vh - 60px);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 20px 40px;
  z-index: 1;

  .main-content {
    width: 100%;
    max-width: 800px;
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .hero-section {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
  }

  .hero-title {
    font-size: 32px;
    font-weight: 600;
    color: $land-text-primary;
    margin: 0 0 16px 0;
    letter-spacing: 2px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;

    .title-icon {
      width: 36px;
      height: 36px;
      display: inline-flex;
      align-items: center;
      justify-content: center;

      svg {
        width: 100%;
        height: 100%;
        color: $land-text-primary;
      }
    }
  }

  .hero-subtitle {
    font-size: 16px;
    color: rgba(255, 255, 255, 0.9);
    margin: 0 0 20px 0;
    font-weight: 400;
    letter-spacing: 1px;
  }

  .hero-actions {
    display: flex;
    gap: 16px;
    margin-bottom: 24px;
  }

  // —— el-button 覆盖：主操作按钮 ——
  .btn-experience {
    background-color: $fill-color-blank;
    color: $land-accent-color;
    border: none;
    padding: 10px 20px;
    font-size: 14px;
    border-radius: $border-radius-lg;
    height: auto;
    font-weight: 500;
    box-shadow: $box-shadow;
    transition:
      background-color 0.15s ease,
      box-shadow 0.15s ease,
      transform 0.15s ease;

    &:hover {
      background-color: rgba(255, 255, 255, 0.9);
      transform: translateY(-1px);
    }

    &:focus-visible {
      // shadcn 风格：使用 zinc 色 outline
      outline: 2px solid $land-accent-color;
      outline-offset: 2px;
    }
  }

  // —— el-button 覆盖：次操作按钮（透明边框）——
  .btn-workspace {
    // shadcn 风格：使用半透明黑色背景
    background-color: rgba(0, 0, 0, 0.5);
    color: $land-text-primary;
    border: 1px solid rgba(255, 255, 255, 0.2);
    padding: 10px 20px;
    font-size: 14px;
    border-radius: $border-radius-lg;
    height: auto;
    font-weight: 500;
    backdrop-filter: blur(10px);
    transition:
      background-color 0.15s ease,
      border-color 0.15s ease,
      box-shadow 0.15s ease,
      transform 0.15s ease;

    &:hover {
      // shadcn 风格：hover 时使用更深的半透明黑色
      background-color: rgba(0, 0, 0, 0.7);
      border-color: rgba(255, 255, 255, 0.3);
      transform: translateY(-1px);
    }

    &:focus-visible {
      outline: 2px solid rgba(255, 255, 255, 0.6);
      outline-offset: 2px;
    }
  }

  // ────────────────────────────────────────────────────────────────────────
  // el-input 覆盖：搜索框样式
  // ────────────────────────────────────────────────────────────────────────
  .search-box {
    width: 100%;
    max-width: 720px;
    margin-bottom: 16px;

    .search-input {
      :deep(.el-input__wrapper) {
        padding: 0 0 0 20px;
        box-shadow: 0 0 0 1px $border-color inset;
        border-radius: 12px 0 0 12px;
        background-color: $fill-color-blank;
        height: 48px;
        transition:
          box-shadow 0.15s ease,
          background-color 0.15s ease;

        &:hover {
          box-shadow: 0 0 0 1px $border-color-dark inset;
        }

        &.is-focus {
          // shadcn 风格：使用 zinc 色焦点框
          box-shadow:
            0 0 0 1px $land-accent-color inset,
            0 0 0 3px rgba(24, 24, 27, 0.1);
        }
      }

      :deep(.el-input__inner) {
        height: 48px;
        font-size: 15px;
        color: $text-color-primary;
      }

      :deep(.el-input-group__append) {
        // shadcn 风格：使用 zinc-900 背景
        background-color: $land-accent-color;
        border-color: $land-accent-color;
        padding: 0;
        border-radius: 0 12px 12px 0;
        overflow: hidden;
      }

      // —— el-button 覆盖：搜索按钮 ——
      .search-btn {
        // shadcn 风格：使用 zinc-900 背景
        background-color: $land-accent-color;
        border: none;
        width: 48px;
        height: 48px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: $land-text-primary;
        border-radius: 0 12px 12px 0;
        padding: 0;
        transition: background-color 0.15s ease;

        &:hover {
          // shadcn 风格：hover 时使用更深的 zinc 色
          background-color: #27272a;
        }

        &:focus-visible {
          outline: 2px solid $fill-color-blank;
          outline-offset: 2px;
        }

        .el-icon {
          font-size: 20px;
        }
      }
    }
  }

  // ────────────────────────────────────────────────────────────────────────
  // el-tag 覆盖：热门搜索标签（浅色透明样式）
  // ────────────────────────────────────────────────────────────────────────
  .hot-tags {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    justify-content: center;

    .tag-label {
      font-size: 13px;
      color: rgba(255, 255, 255, 0.8);
      margin-right: 4px;
    }

    .hot-tag {
      :deep(.el-tag) {
        background-color: rgba(255, 255, 255, 0.15);
        border-color: rgba(255, 255, 255, 0.3);
        color: rgba(255, 255, 255, 0.9);
        font-size: 12px;
        padding: 4px 14px;
        height: auto;
        border-radius: $border-radius-round;
        transition:
          background-color 0.15s ease,
          border-color 0.15s ease;

        &:hover {
          background-color: rgba(255, 255, 255, 0.25);
          border-color: rgba(255, 255, 255, 0.4);
          cursor: pointer;
        }
      }
    }
  }

  // ────────────────────────────────────────────────────────────────────────
  // 右侧浮动咨询
  // ────────────────────────────────────────────────────────────────────────
  .floating-consult {
    position: fixed;
    right: 20px;
    bottom: 40px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    background-color: $land-accent-color;
    padding: 12px 8px;
    border-radius: 24px;
    cursor: pointer;
    z-index: 100;
    transition:
      box-shadow 0.15s ease,
      transform 0.15s ease;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);

    &:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 16px rgba(0, 0, 0, 0.4);
    }

    .consult-avatar {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      overflow: hidden;
      background-color: $fill-color-blank;

      img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
    }

    .consult-text {
      font-size: 12px;
      color: $land-text-primary;
      font-weight: 500;
    }
  }
}
</style>
