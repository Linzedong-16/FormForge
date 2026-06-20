<template>
  <div class="account-tab">
    <h2 class="tab-title">{{ t("settings.account") }}</h2>
    <p class="tab-desc">{{ t("settings.accountDesc") }}</p>

    <!-- ── 绑定邮箱 ────────────────────────────────── -->
    <section class="form-section">
      <h3 class="section-title">{{ t("settings.bindEmail") }}</h3>
      <el-form label-position="top" class="account-form">
        <el-form-item :label="t('settings.emailAddress')">
          <el-input v-model="emailForm.email" :placeholder="t('settings.emailPlaceholder')" maxlength="255" />
        </el-form-item>

        <el-form-item :label="t('settings.verifyCode')">
          <div class="verify-code-row">
            <el-input
              v-model="emailForm.code"
              :placeholder="t('settings.codePlaceholder')"
              maxlength="6"
              class="code-input"
            />
            <el-button :disabled="countdown > 0" size="large" @click="handleSendCode">
              {{ countdown > 0 ? `${countdown}s` : t("settings.sendCode") }}
            </el-button>
          </div>
        </el-form-item>

        <el-form-item>
          <el-button type="primary" :loading="binding" @click="handleBindEmail">
            {{ t("settings.confirmBind") }}
          </el-button>
        </el-form-item>
      </el-form>
    </section>

    <div class="section-divider"></div>

    <!-- ── 更改密码 ────────────────────────────────── -->
    <section class="form-section">
      <h3 class="section-title">{{ t("settings.changePassword") }}</h3>
      <el-form label-position="top" class="account-form">
        <el-form-item :label="t('settings.currentPassword')">
          <el-input
            v-model="passwordForm.currentPassword"
            type="password"
            :placeholder="t('settings.currentPasswordPlaceholder')"
            show-password
          />
        </el-form-item>

        <el-form-item :label="t('settings.newPassword')">
          <el-input
            v-model="passwordForm.newPassword"
            type="password"
            :placeholder="t('settings.newPasswordPlaceholder')"
            show-password
          />
        </el-form-item>

        <el-form-item :label="t('settings.confirmPassword')">
          <el-input
            v-model="passwordForm.confirmPassword"
            type="password"
            :placeholder="t('settings.confirmPasswordPlaceholder')"
            show-password
          />
        </el-form-item>

        <el-form-item>
          <el-button type="primary" :loading="changing" @click="handleChangePassword">
            {{ t("settings.updatePassword") }}
          </el-button>
          <el-button @click="handleForgotPassword">
            {{ t("settings.forgotPassword") }}
          </el-button>
        </el-form-item>
      </el-form>
    </section>

    <div class="section-divider"></div>

    <!-- ── 账号注销 ────────────────────────────────── -->
    <section class="form-section">
      <h3 class="section-title danger-title">{{ t("settings.deleteAccount") }}</h3>
      <p class="danger-desc">{{ t("settings.deleteAccountDesc") }}</p>
      <el-button type="danger" plain @click="handleDeleteAccount">
        {{ t("settings.confirmDelete") }}
      </el-button>
    </section>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from "vue";
import { useI18n } from "vue-i18n";
import { ElMessage, ElMessageBox } from "element-plus";
import { useRouter } from "vue-router";

const { t } = useI18n();
const router = useRouter();

const binding = ref(false);
const changing = ref(false);
const countdown = ref(0);

// ── 邮箱绑定表单 ────────────────────────────────────
const emailForm = reactive({
  email: "",
  code: ""
});

// ── 密码更改表单 ────────────────────────────────────
const passwordForm = reactive({
  currentPassword: "",
  newPassword: "",
  confirmPassword: ""
});

// ── 发送验证码 ──────────────────────────────────────
async function handleSendCode() {
  if (!emailForm.email) {
    ElMessage.warning(t("settings.emailRequired"));
    return;
  }
  // 倒计时
  countdown.value = 60;
  const timer = setInterval(() => {
    countdown.value--;
    if (countdown.value <= 0) clearInterval(timer);
  }, 1000);

  // TODO: 调用 API 发送验证码
  // await authApi.sendCode(emailForm.email, "bind_email");
  ElMessage.success(t("settings.codeSent"));
}

// ── 绑定邮箱 ────────────────────────────────────────
async function handleBindEmail() {
  binding.value = true;
  try {
    // TODO: 调用 API 绑定邮箱
    // await accountApi.bindEmail(emailForm.email, emailForm.code);
    ElMessage.success(t("settings.bindSuccess"));
  } catch {
    ElMessage.error(t("settings.bindFailed"));
  } finally {
    binding.value = false;
  }
}

// ── 更改密码 ────────────────────────────────────────
async function handleChangePassword() {
  if (passwordForm.newPassword !== passwordForm.confirmPassword) {
    ElMessage.warning(t("settings.passwordMismatch"));
    return;
  }
  changing.value = true;
  try {
    // TODO: 调用 API 修改密码
    // await accountApi.changePassword(passwordForm.currentPassword, passwordForm.newPassword);
    ElMessage.success(t("settings.passwordUpdateSuccess"));
  } catch {
    ElMessage.error(t("settings.passwordUpdateFailed"));
  } finally {
    changing.value = false;
  }
}

// ── 忘记密码 ────────────────────────────────────────
function handleForgotPassword() {
  // TODO: 跳转到密码找回页面
  router.push({ name: "login", query: { mode: "reset" } });
}

// ── 注销账号 ────────────────────────────────────────
async function handleDeleteAccount() {
  try {
    await ElMessageBox.confirm(t("settings.deleteAccountConfirm"), t("settings.deleteAccount"), {
      confirmButtonText: t("settings.confirmDelete"),
      cancelButtonText: t("settings.cancel"),
      type: "warning",
      confirmButtonClass: "el-button--danger"
    });
    // TODO: 调用 API 注销账号
    // await accountApi.deleteAccount();
    ElMessage.success(t("settings.deleteSuccess"));
  } catch {
    // 用户取消
  }
}
</script>

<style scoped lang="scss">
// ── 本地 fallback：引用项目主题系统变量，确保亮/暗主题下均有可读的对比度 ──
$clr-text: var(--font-color, #18181b);
$clr-text-secondary: var(--font-color-lighter, #71717a);
$clr-border: var(--border-color, #e4e4e7);
$clr-danger: var(--el-color-danger, #ef4444);
$clr-danger-light: var(--el-color-danger-light-9, rgba(239, 68, 68, 0.1));

.account-tab {
  max-width: 560px;
}

.tab-title {
  font-size: 20px;
  font-weight: 600;
  color: $clr-text;
  margin: 0 0 8px;
}

.tab-desc {
  font-size: 13px;
  color: $clr-text-secondary;
  margin: 0 0 28px;
}

.form-section {
  margin-bottom: 4px;
}

.section-title {
  font-size: 16px;
  font-weight: 600;
  color: $clr-text;
  margin: 0 0 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid $clr-border;
}

.section-divider {
  height: 1px;
  background-color: $clr-border;
  margin: 28px 0;
}

// ── 验证码行 ────────────────────────────────────────
.verify-code-row {
  display: flex;
  gap: 12px;

  .code-input {
    flex: 1;
    max-width: 200px;
  }
}

.account-form {
  :deep(.el-form-item__label) {
    font-weight: 500;
    color: $clr-text;
  }
}

// ── 危险操作区 ──────────────────────────────────────
.danger-title {
  color: $clr-danger;
  border-bottom-color: $clr-danger-light;
}

.danger-desc {
  font-size: 13px;
  color: $clr-text-secondary;
  margin: 0 0 16px;
  line-height: 1.6;
}
</style>
