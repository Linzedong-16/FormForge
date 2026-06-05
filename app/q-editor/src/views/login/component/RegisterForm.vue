<template>
  <div class="register-form">
    <h2 class="form-title" style="text-align: center">邮箱注册</h2>

    <el-form ref="registerFormRef" :model="registerForm" :rules="registerRules" class="form-content">
      <el-form-item prop="email">
        <el-input
          v-model="registerForm.email"
          type="text"
          placeholder="您的电子邮箱地址"
          class="form-input"
          :prefix-icon="Message"
        />
      </el-form-item>

      <el-form-item prop="password">
        <el-input
          v-model="registerForm.password"
          type="password"
          placeholder="设置密码"
          class="form-input"
          :prefix-icon="Lock"
          :show-password="showPassword"
        />
      </el-form-item>

      <el-form-item prop="confirmPassword">
        <el-input
          v-model="registerForm.confirmPassword"
          type="password"
          placeholder="确认密码"
          class="form-input"
          :prefix-icon="Lock"
          :show-password="showPassword"
        />
      </el-form-item>

      <el-form-item prop="captcha">
        <div class="captcha-row">
          <el-input
            v-model="registerForm.captcha"
            type="text"
            placeholder="验证码"
            class="captcha-input"
            :prefix-icon="EditPen"
          />
          <el-button class="captcha-btn" :disabled="countDown > 0" @click="sendCaptcha">
            {{ countDown > 0 ? `${countDown}s` : "获取验证码" }}
          </el-button>
        </div>
      </el-form-item>

      <el-form-item class="agreement-item">
        <el-checkbox v-model="agreed">
          我已阅读并同意
          <a href="#" class="agreement-link">用户协议</a>
          和
          <a href="#" class="agreement-link">隐私政策</a>
        </el-checkbox>
      </el-form-item>

      <el-form-item>
        <div style="width: 100%; display: flex; justify-content: center; align-items: center">
          <el-button type="primary" class="submit-btn" :loading="isLoading" :disabled="!agreed" @click="handleRegister">
            注册
          </el-button>
        </div>
      </el-form-item>
    </el-form>

    <div class="form-footer">
      <span class="switch-link" @click="$emit('switch-to-login')"> 返回登录 </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from "vue";
import { Message, Lock, EditPen } from "@element-plus/icons-vue";
import { ElMessage, type FormInstance, type FormRules } from "element-plus";

const emit = defineEmits(["switch-to-login"]);

const registerFormRef = ref<FormInstance>();

const showPassword = ref(false);
const isLoading = ref(false);
const agreed = ref(false);
const countDown = ref(0);

const registerForm = reactive({
  email: "",
  password: "",
  confirmPassword: "",
  captcha: ""
});

const registerRules: FormRules = {
  email: [
    { required: true, message: "请输入邮箱", trigger: "blur" },
    { type: "email", message: "请输入正确的邮箱格式", trigger: "blur" }
  ],
  password: [
    { required: true, message: "请输入密码", trigger: "blur" },
    { min: 6, message: "密码长度不能少于6位", trigger: "blur" },
    { pattern: /^(?=.*[A-Za-z])(?=.*\d)/, message: "密码需包含字母和数字", trigger: "blur" }
  ],
  confirmPassword: [
    { required: true, message: "请确认密码", trigger: "blur" },
    {
      validator: (rule: any, value: string, callback: any) => {
        if (value !== registerForm.password) {
          callback(new Error("两次输入的密码不一致"));
        } else {
          callback();
        }
      },
      trigger: "blur"
    }
  ],
  captcha: [
    { required: true, message: "请输入验证码", trigger: "blur" },
    { len: 6, message: "验证码长度为6位", trigger: "blur" }
  ]
};

const canSendCaptcha = computed(() => {
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(registerForm.email);
  return emailValid && countDown.value === 0;
});

const sendCaptcha = () => {
  if (!canSendCaptcha.value) {
    ElMessage.warning("请先输入正确的邮箱");
    return;
  }

  countDown.value = 60;
  ElMessage.success("验证码已发送至您的邮箱");

  const timer = setInterval(() => {
    countDown.value--;
    if (countDown.value <= 0) {
      clearInterval(timer);
    }
  }, 1000);
};

const handleRegister = async () => {
  if (!registerFormRef.value) return;

  const valid = await registerFormRef.value.validate();
  if (!valid) return;

  if (!agreed.value) {
    ElMessage.warning("请先同意用户协议和隐私政策");
    return;
  }

  isLoading.value = true;

  // 模拟注册请求
  setTimeout(() => {
    isLoading.value = false;
    ElMessage.success("注册成功，请登录");
    emit("switch-to-login");
  }, 1500);
};
</script>

<style scoped lang="scss">
.register-form {
  display: flex;
  flex-direction: column;
}

.switch-link {
  cursor: pointer;
}

.captcha-row {
  display: flex;
  gap: 12px;
}

.captcha-input {
  flex: 1;
}
</style>
