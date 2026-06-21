<template>
  <a-modal
    :visible="visible"
    :footer="false"
    :closable="true"
    title="登录后台管理系统"
    :width="420"
    @cancel="handleClose"
    @close="handleClose"
  >
    <a-form ref="formRef" :model="form" :rules="rules" layout="vertical" @submit="handleSubmit">
      <!-- 邮箱 -->
      <a-form-item field="email" label="邮箱" :validate-trigger="['change', 'submit']">
        <a-input v-model="form.email" placeholder="请输入邮箱地址" :max-length="128" autocomplete="email">
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

      <!-- 提交按钮 -->
      <a-form-item>
        <a-button type="primary" html-type="submit" :loading="loading" long>
          {{ loading ? "登录中..." : "登 录" }}
        </a-button>
      </a-form-item>
    </a-form>
  </a-modal>
</template>

<script setup lang="ts">
import { ref, reactive } from "vue";
import { useUserStore } from "@/store/modules/user";
import type { FormInstance } from "@arco-design/web-vue";

// ── Props / Emits ────────────────────────────────────────────────

defineProps<{
  visible: boolean;
}>();

const emit = defineEmits<{
  (e: "update:visible", val: boolean): void;
  (e: "success"): void;
}>();

// ── 表单 ────────────────────────────────────────────────────────

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

// ── 登录逻辑 ─────────────────────────────────────────────────────

async function handleSubmit() {
  const valid = await formRef.value?.validate();
  if (valid) return; // 有校验错误

  errorMsg.value = "";
  loading.value = true;

  try {
    const res = await userStore.handleLogin(form.email, form.password);
    if (res.code === 0) {
      // 登录成功 → 拉取用户资料
      userStore.fetchProfile().catch(() => {});
      emit("success");
      handleClose();
    } else {
      errorMsg.value = res.msg || "登录失败，请检查邮箱和密码";
    }
  } catch (err: any) {
    errorMsg.value = err?.message || "网络异常，请稍后重试";
  } finally {
    loading.value = false;
  }
}

function handleClose() {
  form.email = "";
  form.password = "";
  errorMsg.value = "";
  loading.value = false;
  emit("update:visible", false);
}
</script>

<style scoped>
.error-alert {
  margin-bottom: 16px;
}
</style>
