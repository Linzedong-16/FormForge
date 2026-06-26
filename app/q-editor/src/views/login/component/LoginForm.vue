<template>
  <div class="login-form">
    <h2 class="form-title" style="text-align: center">{{ t("login.loginTitle") }}</h2>

    <!--
      语义化说明：
        - autocomplete="email"/"current-password" → 浏览器密码管理器识别字段
        - name="email"/"password" → 浏览器用 name 作为凭证存储键
        - type="email" → 语义化输入类型，触发生效自动填充
        - @submit.prevent + native-type="submit" → 原生表单提交语义，触发"保存密码"弹窗
    -->
    <el-form
      ref="loginFormRef"
      :model="loginForm"
      :rules="loginRules"
      class="form-content"
      @submit.prevent="handleLogin"
    >
      <el-form-item prop="email">
        <el-input
          v-model="loginForm.email"
          name="email"
          type="email"
          autocomplete="email"
          :placeholder="t('login.emailPlaceholder')"
          class="form-input"
          :prefix-icon="Message"
        />
      </el-form-item>

      <el-form-item prop="password">
        <el-input
          v-model="loginForm.password"
          name="password"
          type="password"
          autocomplete="current-password"
          :placeholder="t('login.passwordPlaceholder')"
          class="form-input"
          :prefix-icon="Lock"
          show-password
        />
        <span class="forgot-link" @click="openForgotModal">{{ t("login.forgotPassword") }}</span>
      </el-form-item>

      <el-form-item>
        <div style="width: 100%; display: flex; justify-content: center; align-items: center">
          <el-button native-type="submit" type="primary" class="submit-btn" :loading="isLoading">
            {{ t("login.loginButton") }}
          </el-button>
        </div>
      </el-form-item>
    </el-form>

    <div class="form-footer">
      <span class="switch-link" @click="$emit('switch-to-register')">{{ t("login.registerLink") }}</span>
    </div>

    <!-- 忘记密码弹窗 -->
    <el-dialog v-model="showForgotModal" :title="t('login.resetTitle')" width="420px" :close-on-click-modal="false">
      <!-- 步骤1：输入邮箱 → 发送验证码 -->
      <el-form v-if="forgotStep === 1" ref="forgotEmailFormRef" :model="forgotForm" :rules="forgotEmailRules">
        <el-form-item prop="email" :label="t('login.resetEmailLabel')">
          <el-input
            v-model="forgotForm.email"
            type="text"
            :placeholder="t('login.resetEmailPlaceholder')"
            :prefix-icon="Message"
          />
        </el-form-item>
      </el-form>

      <!-- 步骤2：输入验证码 + 新密码 → 重置 -->
      <el-form v-if="forgotStep === 2" ref="forgotResetFormRef" :model="forgotForm" :rules="forgotResetRules">
        <el-form-item prop="code" :label="t('login.resetCodeLabel')">
          <el-input
            v-model="forgotForm.code"
            type="text"
            :placeholder="t('login.resetCodePlaceholder')"
            maxlength="6"
          />
        </el-form-item>
        <el-form-item prop="newPassword" :label="t('login.resetPasswordLabel')">
          <el-input
            v-model="forgotForm.newPassword"
            type="password"
            :placeholder="t('login.resetPasswordPlaceholder')"
            show-password
          />
        </el-form-item>
      </el-form>

      <template #footer>
        <template v-if="forgotStep === 1">
          <el-button @click="showForgotModal = false">{{ t("login.resetCancelButton") }}</el-button>
          <el-button type="primary" :loading="sendingCode" @click="handleSendResetCode">{{
            t("login.sendCodeButton")
          }}</el-button>
        </template>
        <template v-else>
          <el-button @click="showForgotModal = false">{{ t("login.resetCancelButton") }}</el-button>
          <el-button type="primary" :loading="isLoading" @click="handleResetPassword">{{
            t("login.resetButton")
          }}</el-button>
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
import { useI18n } from "vue-i18n";

const { t } = useI18n();
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
    { required: true, message: t("login.emailRequired"), trigger: "blur" },
    { type: "email", message: t("login.emailInvalid"), trigger: "blur" }
  ],
  password: [{ required: true, message: t("login.passwordRequired"), trigger: "blur" }]
};

/** 登录业务错误码 → 用户提示 */
const getLoginErrorMap = (): Record<number, string> => ({
  [BizCode.AccountLocked]: t("login.accountLocked"),
  [BizCode.AccountDisabled]: t("login.accountDisabled")
});

const handleLogin = async () => {
  if (!loginFormRef.value) return;
  const valid = await loginFormRef.value.validate().catch(() => false);
  if (!valid) return;

  isLoading.value = true;
  try {
    const res = await userStore.handleLogin(loginForm.email, loginForm.password);

    if (res.code === 0) {
      ElMessage.success(t("login.loginSuccess"));
      router.push({ name: "home" });
      return;
    }

    // 密码错误 → 显示剩余次数
    if (res.code === 401 && (res.data as any)?.remainAttempts !== undefined) {
      const remain = (res.data as any).remainAttempts as number;
      ElMessage.error(t("login.passwordError", { count: remain }));
      return;
    }

    // 其他业务错误
    const mappedMsg = getLoginErrorMap()[res.code];
    ElMessage.error(mappedMsg ?? res.msg);
  } catch {
    ElMessage.error(t("login.loginFailed"));
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
    { required: true, message: t("login.emailRequired"), trigger: "blur" },
    { type: "email", message: t("login.emailInvalid"), trigger: "blur" }
  ]
};

const forgotResetRules: FormRules = {
  code: [
    { required: true, message: t("login.codeRequired"), trigger: "blur" },
    { len: 6, message: t("login.codeLength"), trigger: "blur" }
  ],
  newPassword: [
    { required: true, message: t("login.resetPasswordRequired"), trigger: "blur" },
    { min: 8, message: t("login.passwordMinLength"), trigger: "blur" },
    { pattern: /[A-Z]/, message: t("login.passwordUppercase"), trigger: "blur" },
    { pattern: /[a-z]/, message: t("login.passwordLowercase"), trigger: "blur" },
    { pattern: /\d/, message: t("login.passwordDigit"), trigger: "blur" }
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
      ElMessage.success(t("login.codeSent"));
      forgotStep.value = 2;
    } else {
      ElMessage.error(res.msg);
    }
  } catch {
    ElMessage.error(t("login.sendFailed"));
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
      ElMessage.success(t("login.resetSuccess"));
      showForgotModal.value = false;
    } else {
      ElMessage.error(res.msg);
    }
  } catch {
    ElMessage.error(t("login.resetFailed"));
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
