<template>
  <div class="login-page">
    <div class="login-card">
      <div class="login-header">
        <h1 class="login-title">问卷低代码平台</h1>
        <p class="login-subtitle">登录后台管理系统</p>
      </div>

      <a-form ref="formRef" :model="form" :rules="rules" layout="vertical" @submit="handleLogin">
        <!-- 邮箱 -->
        <a-form-item field="email" label="邮箱" :validate-trigger="['change', 'submit']">
          <a-input
            v-model="form.email"
            placeholder="请输入邮箱地址"
            :max-length="128"
            size="large"
            autocomplete="email"
          >
            <template #prefix>
              <icon-email />
            </template>
          </a-input>
        </a-form-item>

        <!-- 密码 -->
        <a-form-item field="password" label="密码" :validate-trigger="['change', 'submit']">
          <a-input-password
            v-model="form.password"
            placeholder="请输入密码"
            :max-length="64"
            size="large"
            autocomplete="current-password"
          >
            <template #prefix>
              <icon-lock />
            </template>
          </a-input-password>
        </a-form-item>

        <!-- 错误提示 -->
        <a-alert v-if="errorMsg" type="error" :show-icon="true" class="error-alert">
          {{ errorMsg }}
        </a-alert>

        <!-- 登录按钮 -->
        <a-form-item>
          <a-button type="primary" html-type="submit" :loading="loading" size="large" long>
            {{ loading ? "登录中..." : "登 录" }}
          </a-button>
        </a-form-item>
      </a-form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from "vue";
import { useRouter } from "vue-router";
import { useUserStore } from "@/store/modules/user";
import type { FormInstance } from "@arco-design/web-vue";

const router = useRouter();
const userStore = useUserStore();
const formRef = ref<FormInstance | null>(null);
const loading = ref(false);
const errorMsg = ref("");

const form = reactive({
  email: "",
  password: ""
});

const rules = {
  email: [
    { required: true, message: "请输入邮箱地址" },
    { type: "email" as const, message: "邮箱格式不正确" }
  ],
  password: [
    { required: true, message: "请输入密码" },
    { minLength: 6, message: "密码至少 6 位" }
  ]
};

async function handleLogin() {
  const valid = await formRef.value?.validate();
  if (valid) return;

  errorMsg.value = "";
  loading.value = true;

  try {
    const res = await userStore.handleLogin(form.email, form.password);
    if (res.code === 0) {
      userStore.fetchProfile().catch(() => {});
      router.push("/");
    } else {
      errorMsg.value = res.msg || "登录失败，请检查邮箱和密码";
    }
  } catch (err: any) {
    errorMsg.value = err?.message || "网络异常，请稍后重试";
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.login-page {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.login-card {
  width: 400px;
  padding: 40px;
  background: var(--color-bg-1);
  border-radius: 12px;
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.12);
}

.login-header {
  text-align: center;
  margin-bottom: 32px;
}

.login-title {
  font-size: 24px;
  font-weight: 700;
  color: var(--color-text-1);
  margin: 0 0 8px 0;
}

.login-subtitle {
  font-size: 14px;
  color: var(--color-text-3);
  margin: 0;
}

.error-alert {
  margin-bottom: 16px;
}
</style>
