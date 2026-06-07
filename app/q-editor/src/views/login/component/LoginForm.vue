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
          show-password
        />
        <span class="forgot-link" @click="openForgotModal">忘记密码?</span>
      </el-form-item>

      <el-form-item>
        <div style="width: 100%; display: flex; justify-content: center; align-items: center">
          <el-button type="primary" class="submit-btn" :loading="isLoading" @click="handleLogin"> 登录 </el-button>
        </div>
      </el-form-item>
    </el-form>

    <div class="form-footer">
      <span class="switch-link" @click="$emit('switch-to-register')">用电子邮箱注册</span>
    </div>

    <!-- 忘记密码弹窗 -->
    <el-dialog v-model="showForgotModal" title="重置密码" width="420px" :close-on-click-modal="false">
      <!-- 步骤1：输入邮箱 → 发送验证码 -->
      <el-form v-if="forgotStep === 1" ref="forgotEmailFormRef" :model="forgotForm" :rules="forgotEmailRules">
        <el-form-item prop="email" label="电子邮箱">
          <el-input v-model="forgotForm.email" type="text" placeholder="请输入注册时的邮箱" :prefix-icon="Message" />
        </el-form-item>
      </el-form>

      <!-- 步骤2：输入验证码 + 新密码 → 重置 -->
      <el-form v-if="forgotStep === 2" ref="forgotResetFormRef" :model="forgotForm" :rules="forgotResetRules">
        <el-form-item prop="code" label="验证码">
          <el-input v-model="forgotForm.code" type="text" placeholder="请输入6位验证码" maxlength="6" />
        </el-form-item>
        <el-form-item prop="newPassword" label="新密码">
          <el-input
            v-model="forgotForm.newPassword"
            type="password"
            placeholder="8-128位，含大小写字母+数字"
            show-password
          />
        </el-form-item>
      </el-form>

      <template #footer>
        <template v-if="forgotStep === 1">
          <el-button @click="showForgotModal = false">取消</el-button>
          <el-button type="primary" :loading="sendingCode" @click="handleSendResetCode">发送验证码</el-button>
        </template>
        <template v-else>
          <el-button @click="showForgotModal = false">取消</el-button>
          <el-button type="primary" :loading="isLoading" @click="handleResetPassword">重置密码</el-button>
        </template>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from "vue";
import { useRouter } from "vue-router";
import { Message, Lock } from "@element-plus/icons-vue";
import { ElMessage, type FormInstance, type FormRules } from "element-plus";
import { useUserStore } from "@/stores/useUser";
import { sendCode, resetPassword } from "@/api";
import { BizCode } from "@common/user/user.interface";

const router = useRouter();
const userStore = useUserStore();

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const emit = defineEmits(["switch-to-register"]);

// ─── 登录表单 ────────────────────────────────────────────────

const loginFormRef = ref<FormInstance>();
const isLoading = ref(false);

const loginForm = reactive({
  email: "",
  password: ""
});

const loginRules: FormRules = {
  email: [
    { required: true, message: "请输入邮箱", trigger: "blur" },
    { type: "email", message: "请输入正确的邮箱格式", trigger: "blur" }
  ],
  password: [{ required: true, message: "请输入密码", trigger: "blur" }]
};

/** 登录业务错误码 → 用户提示 */
const LOGIN_ERROR_MAP: Record<number, string> = {
  [BizCode.AccountLocked]: "登录失败次数过多，请30分钟后再试",
  [BizCode.AccountDisabled]: "账户已被禁用，请联系管理员"
};

const handleLogin = async () => {
  if (!loginFormRef.value) return;
  const valid = await loginFormRef.value.validate().catch(() => false);
  if (!valid) return;

  isLoading.value = true;
  try {
    const res = await userStore.handleLogin(loginForm.email, loginForm.password);

    if (res.code === 0) {
      ElMessage.success("登录成功");
      router.push({ name: "home" });
      return;
    }

    // 密码错误 → 显示剩余次数
    if (res.code === 401 && (res.data as any)?.remainAttempts !== undefined) {
      const remain = (res.data as any).remainAttempts as number;
      ElMessage.error(`邮箱或密码错误，剩余尝试次数: ${remain}`);
      return;
    }

    // 其他业务错误
    const mappedMsg = LOGIN_ERROR_MAP[res.code];
    ElMessage.error(mappedMsg ?? res.msg);
  } catch {
    ElMessage.error("登录失败，请检查网络连接");
  } finally {
    isLoading.value = false;
  }
};

// ─── 忘记密码弹窗 ────────────────────────────────────────────

const showForgotModal = ref(false);
const forgotStep = ref(1);
const sendingCode = ref(false);

const forgotEmailFormRef = ref<FormInstance>();
const forgotResetFormRef = ref<FormInstance>();

const forgotForm = reactive({
  email: "",
  code: "",
  newPassword: ""
});

const forgotEmailRules: FormRules = {
  email: [
    { required: true, message: "请输入邮箱", trigger: "blur" },
    { type: "email", message: "请输入正确的邮箱格式", trigger: "blur" }
  ]
};

const forgotResetRules: FormRules = {
  code: [
    { required: true, message: "请输入验证码", trigger: "blur" },
    { len: 6, message: "验证码为6位数字", trigger: "blur" }
  ],
  newPassword: [
    { required: true, message: "请输入新密码", trigger: "blur" },
    { min: 8, message: "密码至少8位", trigger: "blur" },
    { pattern: /[A-Z]/, message: "密码需包含大写字母", trigger: "blur" },
    { pattern: /[a-z]/, message: "密码需包含小写字母", trigger: "blur" },
    { pattern: /\d/, message: "密码需包含数字", trigger: "blur" }
  ]
};

function openForgotModal() {
  forgotStep.value = 1;
  forgotForm.email = "";
  forgotForm.code = "";
  forgotForm.newPassword = "";
  showForgotModal.value = true;
}

/** 步骤1 → 发送重置密码验证码 */
const handleSendResetCode = async () => {
  if (!forgotEmailFormRef.value) return;
  const valid = await forgotEmailFormRef.value.validate().catch(() => false);
  if (!valid) return;

  sendingCode.value = true;
  try {
    const res = await sendCode({ email: forgotForm.email, type: "reset_password" });
    if (res.code === 0) {
      ElMessage.success("验证码已发送至您的邮箱");
      forgotStep.value = 2;
    } else {
      ElMessage.error(res.msg);
    }
  } catch {
    ElMessage.error("发送失败，请检查网络");
  } finally {
    sendingCode.value = false;
  }
};

/** 步骤2 → 重置密码 */
const handleResetPassword = async () => {
  if (!forgotResetFormRef.value) return;
  const valid = await forgotResetFormRef.value.validate().catch(() => false);
  if (!valid) return;

  isLoading.value = true;
  try {
    const res = await resetPassword({
      email: forgotForm.email,
      code: forgotForm.code,
      newPassword: forgotForm.newPassword
    });
    if (res.code === 0) {
      ElMessage.success("密码重置成功，请使用新密码登录");
      showForgotModal.value = false;
    } else {
      ElMessage.error(res.msg);
    }
  } catch {
    ElMessage.error("重置失败，请检查网络");
  } finally {
    isLoading.value = false;
  }
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
