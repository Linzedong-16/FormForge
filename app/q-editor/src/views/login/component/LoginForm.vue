<template>
  <div class="login-form">
    <h2 class="form-title" style="text-align: center">邮箱登录</h2>

    <el-form ref="loginFormRef" :model="loginForm" :rules="loginRules" class="form-content">
      <el-form-item prop="email">
        <el-input
          v-model="loginForm.email"
          type="text"
          placeholder="您的电子邮箱地址"
          class="form-input"
          :prefix-icon="Message"
        />
      </el-form-item>

      <el-form-item prop="password">
        <el-input
          v-model="loginForm.password"
          type="password"
          placeholder="输入密码"
          class="form-input"
          :prefix-icon="Lock"
          :show-password="showPassword"
        />
        <span class="forgot-link" @click="showForgotModal = true">忘记密码?</span>
      </el-form-item>

      <el-form-item>
        <div style="width: 100%; display: flex; justify-content: center; align-items: center">
          <el-button type="primary" class="submit-btn" :loading="isLoading" @click="handleLogin"> 登录 </el-button>
        </div>
      </el-form-item>
    </el-form>

    <div class="form-footer">
      <span class="switch-link" @click="$emit('switch-to-register')"> 用电子邮箱注册 </span>
    </div>

    <!-- 忘记密码弹窗 -->
    <el-dialog v-model="showForgotModal" title="忘记密码" width="400px" :close-on-click-modal="false">
      <el-form ref="forgotFormRef" :model="forgotForm" :rules="forgotRules">
        <el-form-item prop="email" label="电子邮箱">
          <el-input v-model="forgotForm.email" type="text" placeholder="请输入注册时的邮箱" :prefix-icon="Message" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showForgotModal = false">取消</el-button>
        <el-button type="primary" @click="handleForgot">发送验证码</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from "vue";
import { Message, Lock } from "@element-plus/icons-vue";
import { ElMessage, type FormInstance, type FormRules } from "element-plus";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const emit = defineEmits(["switch-to-register"]);

const loginFormRef = ref<FormInstance>();
const forgotFormRef = ref<FormInstance>();

const showPassword = ref(false);
const showForgotModal = ref(false);
const isLoading = ref(false);

const loginForm = reactive({
  email: "",
  password: ""
});

const forgotForm = reactive({
  email: ""
});

const loginRules: FormRules = {
  email: [
    { required: true, message: "请输入邮箱", trigger: "blur" },
    { type: "email", message: "请输入正确的邮箱格式", trigger: "blur" }
  ],
  password: [
    { required: true, message: "请输入密码", trigger: "blur" },
    { min: 6, message: "密码长度不能少于6位", trigger: "blur" }
  ]
};

const forgotRules: FormRules = {
  email: [
    { required: true, message: "请输入邮箱", trigger: "blur" },
    { type: "email", message: "请输入正确的邮箱格式", trigger: "blur" }
  ]
};

const handleLogin = async () => {
  if (!loginFormRef.value) return;

  const valid = await loginFormRef.value.validate();
  if (!valid) return;

  isLoading.value = true;

  // 模拟登录请求
  setTimeout(() => {
    isLoading.value = false;
    ElMessage.success("登录成功");
    // 登录成功后跳转到首页
    window.location.href = "/home";
  }, 1500);
};

const handleForgot = async () => {
  if (!forgotFormRef.value) return;

  const valid = await forgotFormRef.value.validate();
  if (!valid) return;

  ElMessage.success("验证码已发送至您的邮箱");
  showForgotModal.value = false;
};
</script>

<style scoped lang="scss">
.login-form {
  display: flex;
  flex-direction: column;
}

.switch-link {
  cursor: pointer;
}

.forgot-link {
  display: block;
  text-align: right;
  font-size: 12px;
  color: var(--login-text-muted);
  cursor: pointer;
  margin-top: 8px;
  transition: color 0.2s;

  &:hover {
    color: var(--login-primary);
  }
}
</style>
