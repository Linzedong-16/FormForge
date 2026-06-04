<template>
  <div class="login-page">
    <!-- 左上角logo -->
    <div class="login-logo" style="margin-top: 1.5rem">
      <span class="logo-icon">
        <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M16 2L2 10v12l14 8 14-8V10L16 2z" stroke="currentColor" stroke-width="2" fill="none" />
          <path d="M16 12L8 17l8 5 8-5-8-5z" fill="currentColor" opacity="0.6" />
        </svg>
      </span>
      <span class="logo-text">Q问卷</span>
    </div>

    <div class="login-container">
      <!-- 左侧轮播图区域 -->
      <div class="carousel-section">
        <el-carousel :interval="4000" :autoplay="true" :loop="true" :arrow="'never'" style="height: 100% !important">
          <el-carousel-item v-for="item in carouselItems" :key="item.id">
            <div class="carousel-content">
              <div class="carousel-image-wrapper">
                <el-image :src="item.image" :alt="item.title" />
                <div
                  class="carousel-overlay"
                  :style="{
                    background: `linear-gradient(135deg, ${item.color}40 0%, ${item.color}20 100%)`
                  }"
                ></div>
              </div>
              <h3 class="carousel-title">{{ item.title }}</h3>
              <p class="carousel-desc">{{ item.desc }}</p>
            </div>
          </el-carousel-item>
        </el-carousel>
      </div>

      <!-- 右侧登录/注册表单区域 -->
      <div class="form-section">
        <div class="form-card">
          <LoginForm v-if="!isRegister" @switch-to-register="isRegister = true" />
          <RegisterForm v-else @switch-to-login="isRegister = false" />
        </div>
      </div>
    </div>

    <!-- 底部版权信息 -->
    <div class="login-footer">
      <span>Q问卷提供技术支持</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import LoginForm from "./component/LoginForm.vue";
import RegisterForm from "./component/RegisterForm.vue";

const isRegister = ref(false);

const itemImage = new URL("@/assets/imgs/item.png", import.meta.url).href;

const carouselItems = [
  {
    id: 1,
    title: "更多应用场景",
    desc: "满足您的各类调研需求",
    color: "#18181b",
    image: itemImage
  },
  {
    id: 2,
    title: "智能数据分析",
    desc: "AI驱动的调研分析报告",
    color: "#3f3f46",
    image: itemImage
  },
  {
    id: 3,
    title: "多渠道发布",
    desc: "一键分享至各大平台",
    color: "#52525b",
    image: itemImage
  },
  {
    id: 4,
    title: "实时数据同步",
    desc: "随时随地查看调研结果",
    color: "#71717a",
    image: itemImage
  }
];
</script>

<style lang="scss">
@use "@/assets/css/login-theme.scss" as *;

// ───────────────────────────────────────────────────────────────────────────
// 登录页面布局样式（非主题相关）
// ───────────────────────────────────────────────────────────────────────────

.login-container {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 100px;
  padding: 40px;
}

.carousel-section {
  width: 520px;
  height: 400px;
  overflow: hidden;
  position: relative;
  border-radius: 16px;
}

.carousel-content {
  position: relative;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  padding: 20px 30px;
}

.carousel-image-wrapper {
  position: absolute;
  top: 40px;
  left: 60px;
  right: 60px;
  height: 280px;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.2);
}

.carousel-image-wrapper :deep(.el-image) {
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: rgba(255, 255, 255, 0.1);
}

.carousel-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  pointer-events: none;
  background: linear-gradient(to bottom, rgba(0, 0, 0, 0.1) 0%, transparent 50%, rgba(0, 0, 0, 0.3) 100%);
}

.carousel-title {
  position: absolute;
  bottom: 60px;
  left: 60px;
  right: 60px;
  font-size: 28px;
  font-weight: 600;
  color: #fff;
  margin: 0;
  text-align: center;
  z-index: 1;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.carousel-desc {
  position: absolute;
  bottom: 30px;
  left: 60px;
  right: 60px;
  font-size: 16px;
  color: rgba(255, 255, 255, 0.9);
  margin: 0;
  text-align: center;
  z-index: 1;
}

.form-section {
  width: 400px;
}

.form-card {
  padding: 48px 40px;
}

// ───────────────────────────────────────────────────────────────────────────
// 表单组件样式
// ───────────────────────────────────────────────────────────────────────────
.form-card :deep(.login-form),
.form-card :deep(.register-form) {
  .form-title {
    font-size: 24px;
    font-weight: 600;
    color: var(--login-text);
    text-align: center;
    margin: 0 0 32px 0;
  }

  .form-content {
    width: 100%;
  }

  .form-input {
    width: 100%;
    height: 44px;
    border-radius: 8px;
    font-size: 14px;
  }

  .captcha-row {
    display: flex;
    gap: 12px;
  }

  .captcha-input {
    flex: 1;
    height: 44px;
    border-radius: 8px;
    font-size: 14px;
  }

  .captcha-btn {
    width: 120px;
    height: 44px;
    border-radius: 8px;
    font-size: 13px;
  }

  .agreement-item {
    margin-bottom: 16px !important;
  }

  .agreement-link {
    color: var(--login-primary);
    text-decoration: none;
    font-weight: 500;

    &:hover {
      text-decoration: underline;
    }
  }

  .submit-btn {
    width: 100%;
    height: 44px;
    border-radius: 8px;
    font-size: 15px;
    font-weight: 500;
  }

  .form-footer {
    margin-top: 24px;
    text-align: center;
  }

  .switch-link {
    font-size: 14px;
    color: var(--login-primary);
    cursor: pointer;
    font-weight: 500;
    transition: color 0.2s;

    &:hover {
      color: var(--login-primary-light);
      text-decoration: underline;
    }
  }

  .forgot-link {
    font-size: 13px;
    color: var(--login-text-muted);
    cursor: pointer;
    transition: color 0.2s;

    &:hover {
      color: var(--login-primary);
    }
  }
}

// ───────────────────────────────────────────────────────────────────────────
// 响应式布局
// ───────────────────────────────────────────────────────────────────────────
@media (max-width: 900px) {
  .login-container {
    flex-direction: column;
    gap: 32px;
    padding: 20px;
  }

  .carousel-section {
    width: 100%;
    max-width: 400px;
    height: 280px;
  }

  .form-section {
    width: 100%;
    max-width: 400px;
  }

  .login-logo {
    top: 16px;
    left: 20px;
  }
}
</style>
