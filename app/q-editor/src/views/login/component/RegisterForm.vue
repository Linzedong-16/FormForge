<template>
  <div class="register-form">
    <h2 class="form-title" style="text-align: center">
      {{ isInitMode ? t("login.initTitle") : t("login.registerTitle") }}
    </h2>

    <!-- SMTP 未配置 + 已初始化 → 提示联系管理员 -->
    <template v-if="statusChecked && showContactAdmin">
      <div style="text-align: center; padding: 20px 0">
        <p style="color: var(--login-text-muted); margin-bottom: 8px">{{ t("login.publicRegistrationClosed") }}</p>
        <p style="color: var(--login-text-muted); font-size: 13px">{{ t("login.contactAdmin") }}</p>
      </div>
      <div class="form-footer">
        <span class="switch-link" @click="$emit('switch-to-login')">{{ t("login.backToLogin") }}</span>
      </div>
    </template>

    <!-- 可注册状态 -->
    <template v-if="statusChecked && !showContactAdmin">
      <el-form ref="registerFormRef" :model="registerForm" :rules="registerRules" class="form-content">
        <!-- 邮箱 -->
        <el-form-item prop="email">
          <el-input
            v-model="registerForm.email"
            type="text"
            :placeholder="t('login.emailPlaceholder')"
            class="form-input"
            :prefix-icon="Message"
          />
        </el-form-item>

        <!-- 用户名（可选） -->
        <el-form-item prop="username">
          <el-input
            v-model="registerForm.username"
            type="text"
            :placeholder="t('login.usernamePlaceholder')"
            class="form-input"
            :prefix-icon="User"
          />
        </el-form-item>

        <!-- 密码 -->
        <el-form-item prop="password">
          <el-input
            v-model="registerForm.password"
            type="password"
            :placeholder="t('login.setPasswordPlaceholder')"
            class="form-input"
            :prefix-icon="Lock"
            show-password
          />
        </el-form-item>

        <!-- 确认密码 -->
        <el-form-item prop="confirmPassword">
          <el-input
            v-model="registerForm.confirmPassword"
            type="password"
            :placeholder="t('login.confirmPasswordPlaceholder')"
            class="form-input"
            :prefix-icon="Lock"
            show-password
          />
        </el-form-item>

        <!-- 邮箱验证模式：验证码 -->
        <template v-if="!isInitMode">
          <el-form-item prop="code">
            <div class="captcha-row">
              <el-input
                v-model="registerForm.code"
                type="text"
                :placeholder="t('login.codePlaceholder')"
                class="captcha-input"
                :prefix-icon="EditPen"
                maxlength="6"
              />
              <el-button
                class="captcha-btn"
                :disabled="countDown > 0 || !canSendCaptcha"
                :loading="sendingCode"
                @click="handleSendCode"
              >
                {{ countDown > 0 ? `${countDown}s` : t("login.getCodeButton") }}
              </el-button>
            </div>
          </el-form-item>
        </template>

        <!-- 协议勾选 -->
        <el-form-item class="agreement-item">
          <el-checkbox v-model="agreed">
            {{ t("login.agreementText") }}
            <a href="#" class="agreement-link">{{ t("login.userAgreement") }}</a>
            {{ t("common.and") }}
            <a href="#" class="agreement-link">{{ t("login.privacyPolicy") }}</a>
          </el-checkbox>
        </el-form-item>

        <!-- 提交 -->
        <el-form-item>
          <div style="width: 100%; display: flex; justify-content: center; align-items: center">
            <el-button
              type="primary"
              class="submit-btn"
              :loading="isLoading"
              :disabled="!agreed"
              @click="handleRegister"
            >
              {{ isInitMode ? t("login.initButton") : t("login.registerButton") }}
            </el-button>
          </div>
        </el-form-item>
      </el-form>

      <div class="form-footer">
        <span class="switch-link" @click="$emit('switch-to-login')">{{ t("login.backToLogin") }}</span>
      </div>
    </template>

    <!-- 状态加载中 -->
    <template v-if="!statusChecked">
      <div style="text-align: center; padding: 40px 0">
        <el-icon class="is-loading" :size="24"><Loading /></el-icon>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { Message, Lock, EditPen, User, Loading } from "@element-plus/icons-vue";
import { ElMessage, type FormInstance, type FormRules } from "element-plus";
import { useUserStore } from "@/stores/useUser";
import { sendCode, verifyRegister, initRegister } from "@/api";
import { BizCode } from "@common/user/user.interface";
import type { SystemStatusResponse } from "@common/user/user.interface";
import { useI18n } from "vue-i18n";

const { t } = useI18n();
const router = useRouter();
const userStore = useUserStore();

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const emit = defineEmits(["switch-to-login"]);

// ─── 系统状态 ────────────────────────────────────────────────

const statusChecked = ref(false);
const systemStatus = ref<SystemStatusResponse | null>(null);

/** 是否初始化模式（首次注册 → 超级管理员） */
const isInitMode = computed(() => systemStatus.value?.initialized === false);

/** 是否显示"联系管理员"（已初始化 + SMTP 未配置） */
const showContactAdmin = computed(
  () => systemStatus.value?.initialized === true && systemStatus.value?.smtpConfigured === false
);

onMounted(async () => {
  // 优先使用 store 中缓存的状态
  if (userStore.systemStatus) {
    systemStatus.value = userStore.systemStatus;
    statusChecked.value = true;
    return;
  }

  try {
    const res = await userStore.fetchSystemStatus();
    if (res.code === 0 && res.data) {
      systemStatus.value = res.data;
    }
  } catch {
    ElMessage.error(t("login.statusFetchFailed"));
  } finally {
    statusChecked.value = true;
  }
});

// ─── 表单状态 ────────────────────────────────────────────────

const registerFormRef = ref<FormInstance>();
const isLoading = ref(false);
const sendingCode = ref(false);
const agreed = ref(false);
const countDown = ref(0);

const registerForm = reactive({
  email: "",
  username: "",
  password: "",
  confirmPassword: "",
  code: ""
});

// ─── 校验规则（匹配后端 Zod Schema） ─────────────────────────

const registerRules: FormRules = {
  email: [
    { required: true, message: t("login.emailRequired"), trigger: "blur" },
    { type: "email", message: t("login.emailInvalid"), trigger: "blur" }
  ],
  password: [
    { required: true, message: t("login.passwordRequired"), trigger: "blur" },
    { min: 8, message: t("login.passwordMinLength"), trigger: "blur" },
    { pattern: /[A-Z]/, message: t("login.passwordUppercase"), trigger: "blur" },
    { pattern: /[a-z]/, message: t("login.passwordLowercase"), trigger: "blur" },
    { pattern: /\d/, message: t("login.passwordDigit"), trigger: "blur" }
  ],
  confirmPassword: [
    { required: true, message: t("login.confirmPasswordRequired"), trigger: "blur" },
    {
      validator: (_rule: unknown, value: string, callback: (err?: Error) => void) => {
        if (value !== registerForm.password) {
          callback(new Error(t("login.passwordMismatch")));
        } else {
          callback();
        }
      },
      trigger: "blur"
    }
  ],
  code: [
    { required: true, message: t("login.codeRequired"), trigger: "blur" },
    { len: 6, message: t("login.codeLength"), trigger: "blur" }
  ]
};

// ─── 验证码发送 ──────────────────────────────────────────────

const canSendCaptcha = computed(() => {
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(registerForm.email);
  return emailValid && countDown.value === 0;
});

/** 发送验证码 → 后端 /api/auth/send-code */
const handleSendCode = async () => {
  if (!canSendCaptcha.value) {
    ElMessage.warning(t("login.emailInvalid"));
    return;
  }

  sendingCode.value = true;
  try {
    const res = await sendCode({ email: registerForm.email, type: "register" });
    if (res.code === 0) {
      ElMessage.success(t("login.codeSent"));
      // 60 秒倒计时
      countDown.value = 60;
      const timer = setInterval(() => {
        countDown.value--;
        if (countDown.value <= 0) clearInterval(timer);
      }, 1000);
    } else {
      ElMessage.error(res.msg);
    }
  } catch {
    ElMessage.error(t("login.sendFailed"));
  } finally {
    sendingCode.value = false;
  }
};

// ─── 注册提交 ────────────────────────────────────────────────

const getRegisterErrorMap = (): Record<number, string> => ({
  [BizCode.EmailExists]: t("login.emailExists"),
  [BizCode.RegistrationClosed]: t("login.registrationClosed"),
  [BizCode.SmtpNotConfigured]: t("login.smtpNotConfigured")
});

const handleRegister = async () => {
  if (!registerFormRef.value) return;
  const valid = await registerFormRef.value.validate().catch(() => false);
  if (!valid) return;

  if (!agreed.value) {
    ElMessage.warning(t("login.agreementRequired"));
    return;
  }

  isLoading.value = true;
  try {
    let res;

    if (isInitMode.value) {
      // 初始化模式 → 直接注册为超级管理员
      res = await initRegister({
        email: registerForm.email,
        password: registerForm.password,
        username: registerForm.username || undefined
      });
    } else {
      // 邮箱验证模式 → 验证码校验 + 注册
      res = await verifyRegister({
        email: registerForm.email,
        code: registerForm.code,
        password: registerForm.password,
        username: registerForm.username || undefined
      });
    }

    if (res.code === 0 && res.data) {
      // 注册成功 → 存储 Token + 跳转
      userStore.setTokens(res.data);
      ElMessage.success(isInitMode.value ? t("login.initSuccess") : t("login.registerSuccess"));
      router.push({ name: "home" });
    } else {
      const mappedMsg = getRegisterErrorMap()[res.code];
      ElMessage.error(mappedMsg ?? res.msg);
    }
  } catch {
    ElMessage.error(t("login.registerFailed"));
  } finally {
    isLoading.value = false;
  }
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
