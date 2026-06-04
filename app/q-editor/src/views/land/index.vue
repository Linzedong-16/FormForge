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
            <span class="logo-text">腾讯问卷</span>
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
            <el-button size="large" class="btn-workspace">进入工作台</el-button>
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
.land-page {
  min-height: 100vh;
  width: 100%;
  position: relative;
  background-image: url("@/assets/imgs/editor_background.jpg");
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  background-color: #0a5bd6;
}

/* 顶部导航栏 */
.land-header {
  width: 100%;
  position: relative;
  z-index: 100;

  .header-inner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 40px;
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
    color: #fff;

    .logo-icon {
      width: 28px;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;

      svg {
        width: 100%;
        height: 100%;
        color: #fff;
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
    color: #fff;
    font-size: 14px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 2px;
    transition: opacity 0.2s ease;

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
    color: #fff;
    font-size: 14px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 4px;
    transition: opacity 0.2s ease;

    &:hover {
      opacity: 0.8;
    }

    .el-icon {
      font-size: 16px;
    }
  }

  .btn-free {
    background-color: #fff;
    color: #1a73e8;
    border: none;
    font-weight: 500;
    border-radius: 8px;
    padding: 10px 20px;
    height: auto;
    font-size: 14px;
    transition: all 0.2s ease;

    &:hover {
      background-color: rgba(255, 255, 255, 0.9);
      transform: translateY(-1px);
    }
  }
}

/* 主体区域 */
.land-main {
  position: relative;
  min-height: calc(100vh - 80px);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 40px;
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
    font-size: 42px;
    font-weight: 600;
    color: #fff;
    margin: 0 0 20px 0;
    letter-spacing: 2px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;

    .title-icon {
      width: 48px;
      height: 48px;
      display: inline-flex;
      align-items: center;
      justify-content: center;

      svg {
        width: 100%;
        height: 100%;
        color: #fff;
      }
    }
  }

  .hero-subtitle {
    font-size: 16px;
    color: rgba(255, 255, 255, 0.9);
    margin: 0 0 32px 0;
    font-weight: 400;
    letter-spacing: 1px;
  }

  .hero-actions {
    display: flex;
    gap: 16px;
    margin-bottom: 48px;
  }

  .btn-experience {
    background-color: #fff;
    color: #1a73e8;
    border: none;
    padding: 14px 28px;
    font-size: 15px;
    border-radius: 10px;
    height: auto;
    font-weight: 500;
    transition: all 0.2s ease;

    &:hover {
      background-color: rgba(255, 255, 255, 0.9);
      transform: translateY(-2px);
      box-shadow: 0 6px 16px rgba(0, 0, 0, 0.12);
    }
  }

  .btn-workspace {
    background-color: rgba(0, 30, 80, 0.5);
    color: #fff;
    border: 1px solid rgba(255, 255, 255, 0.4);
    padding: 14px 28px;
    font-size: 15px;
    border-radius: 10px;
    height: auto;
    font-weight: 500;
    backdrop-filter: blur(10px);
    transition: all 0.2s ease;

    &:hover {
      background-color: rgba(0, 30, 80, 0.7);
      transform: translateY(-2px);
      box-shadow: 0 6px 16px rgba(0, 0, 0, 0.12);
    }
  }

  /* 搜索框 */
  .search-box {
    width: 100%;
    max-width: 720px;
    margin-bottom: 24px;

    .search-input {
      :deep(.el-input__wrapper) {
        padding: 0 0 0 20px;
        box-shadow: none;
        border-radius: 12px 0 0 12px;
        background-color: #fff;
        height: 56px;
      }

      :deep(.el-input__inner) {
        height: 56px;
        font-size: 16px;
        color: #333;
      }

      :deep(.el-input-group__append) {
        background-color: #1a73e8;
        border-color: #1a73e8;
        padding: 0;
        border-radius: 0 12px 12px 0;
        overflow: hidden;
      }

      .search-btn {
        background-color: #1a73e8;
        border: none;
        width: 64px;
        height: 56px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #fff;
        border-radius: 0 12px 12px 0;
        padding: 0;
        transition: background-color 0.2s ease;

        &:hover {
          background-color: #1557b0;
        }

        .el-icon {
          font-size: 20px;
        }
      }
    }
  }

  /* 热门搜索标签 */
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
      background-color: rgba(255, 255, 255, 0.15);
      border-color: rgba(255, 255, 255, 0.3);
      color: rgba(255, 255, 255, 0.9);
      font-size: 12px;
      padding: 4px 14px;
      height: auto;
      border-radius: 12px;
      transition: all 0.2s ease;

      &:hover {
        background-color: rgba(255, 255, 255, 0.25);
        cursor: pointer;
      }
    }
  }

  /* 右侧浮动咨询 */
  .floating-consult {
    position: fixed;
    right: 20px;
    bottom: 200px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    background-color: #1a73e8;
    padding: 12px 8px;
    border-radius: 24px;
    cursor: pointer;
    z-index: 100;
    transition: all 0.2s ease;
    box-shadow: 0 4px 12px rgba(26, 115, 232, 0.3);

    &:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 16px rgba(26, 115, 232, 0.4);
    }

    .consult-avatar {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      overflow: hidden;
      background-color: #fff;

      img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
    }

    .consult-text {
      font-size: 12px;
      color: #fff;
      font-weight: 500;
    }
  }
}
</style>
