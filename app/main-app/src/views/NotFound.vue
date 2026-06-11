<template>
  <div class="not-found-container">
    <div class="not-found-content">
      <div class="error-code">404</div>
      <div class="error-message">页面未找到</div>
      <div class="error-desc">抱歉，您访问的页面不存在</div>
      <button class="back-button" @click="goBack">返回首页</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from "vue-router";

const router = useRouter();

function goBack() {
  router.push("/");
}
</script>

<style scoped>
.not-found-container {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.not-found-content {
  text-align: center;
  color: white;
}

.error-code {
  font-size: 120px;
  font-weight: bold;
  margin-bottom: 20px;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.3);
}

.error-message {
  font-size: 32px;
  font-weight: 600;
  margin-bottom: 10px;
}

.error-desc {
  font-size: 16px;
  opacity: 0.8;
  margin-bottom: 30px;
}

.back-button {
  padding: 12px 36px;
  font-size: 16px;
  font-weight: 500;
  color: #667eea;
  background: white;
  border: none;
  border-radius: 30px;
  cursor: pointer;
  transition: all 0.3s ease;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
}

.back-button:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.3);
}

.back-button:active {
  transform: translateY(0);
}
</style>
