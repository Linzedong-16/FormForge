<template>
  <div class="register-form">
    <h2 class="form-title" style="text-align: center">
      {{ isInitMode ? "初始化系统" : "邮箱注册" }}
    </h2>

    <!-- SMTP 未配置 + 已初始化 → 提示联系管理员 -->
    <template v-if="statusChecked && showContactAdmin">
      <div style="text-align: center; padding: 20px 0">
        <p style="color: var(--login-text-muted); margin-bottom: 8px">暂未开放公开注册</p>
        <p style="color: var(--login-text-muted); font-size: 13px">请联系系统管理员创建账户</p>
      </div>
      <div class="form-footer">
        <span class="switch-link" @click="$emit('switch-to-login')">返回登录</span>
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
            placeholder="您的电子邮箱地址"
            class="form-input"
            :prefix-icon="Message"
          />
        </el-form-item>

        <!-- 用户名（可选） -->
        <el-form-item prop="username">
          <el-input
            v-model="registerForm.username"
            type="text"
            placeholder="用户名（选填，默认使用邮箱前缀）"
            class="form-input"
            :prefix-icon="User"
          />
        </el-form-item>

        <!-- 密码 -->
        <el-form-item prop="password">
          <el-input
            v-model="registerForm.password"
            type="password"
            placeholder="设置密码（8-128位，大小写+数字）"
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
            placeholder="确认密码"
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
                placeholder="验证码"
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
                {{ countDown > 0 ? `${countDown}s` : "获取验证码" }}
              </el-button>
            </div>
          </el-form-item>
        </template>

        <!-- 协议勾选 -->
        <el-form-item class="agreement-item">
          <el-checkbox v-model="agreed">
            我已阅读并同意
            <a href="#" class="agreement-link">用户协议</a>
            和
            <a href="#" class="agreement-link">隐私政策</a>
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
              {{ isInitMode ? "初始化系统" : "注册" }}
            </el-button>
          </div>
        </el-form-item>
      </el-form>

      <div class="form-footer">
        <span class="switch-link" @click="$emit('switch-to-login')">返回登录</span>
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
    ElMessage.error("获取系统状态失败");
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
    { required: true, message: "请输入邮箱", trigger: "blur" },
    { type: "email", message: "请输入正确的邮箱格式", trigger: "blur" }
  ],
  password: [
    { required: true, message: "请输入密码", trigger: "blur" },
    { min: 8, message: "密码至少8位", trigger: "blur" },
    { pattern: /[A-Z]/, message: "密码需包含大写字母", trigger: "blur" },
    { pattern: /[a-z]/, message: "密码需包含小写字母", trigger: "blur" },
    { pattern: /\d/, message: "密码需包含数字", trigger: "blur" }
  ],
  confirmPassword: [
    { required: true, message: "请确认密码", trigger: "blur" },
    {
      validator: (_rule: unknown, value: string, callback: (err?: Error) => void) => {
        if (value !== registerForm.password) {
          callback(new Error("两次输入的密码不一致"));
        } else {
          callback();
        }
      },
      trigger: "blur"
    }
  ],
  code: [
    { required: true, message: "请输入验证码", trigger: "blur" },
    { len: 6, message: "验证码为6位数字", trigger: "blur" }
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
    ElMessage.warning("请先输入正确的邮箱");
    return;
  }

  sendingCode.value = true;
  try {
    const res = await sendCode({ email: registerForm.email, type: "register" });
    if (res.code === 0) {
      ElMessage.success("验证码已发送至您的邮箱");
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
    ElMessage.error("发送失败，请检查网络");
  } finally {
    sendingCode.value = false;
  }
};

// ─── 注册提交 ────────────────────────────────────────────────

const REGISTER_ERROR_MAP: Record<number, string> = {
  [BizCode.EmailExists]: "该邮箱已被注册，请直接登录",
  [BizCode.RegistrationClosed]: "暂未开放注册，请联系管理员",
  [BizCode.SmtpNotConfigured]: "邮件服务未配置，请联系管理员创建账户"
};

const handleRegister = async () => {
  if (!registerFormRef.value) return;
  const valid = await registerFormRef.value.validate().catch(() => false);
  if (!valid) return;

  if (!agreed.value) {
    ElMessage.warning("请先同意用户协议和隐私政策");
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
      ElMessage.success(isInitMode.value ? "系统初始化成功" : "注册成功");
      router.push({ name: "home" });
    } else {
      const mappedMsg = REGISTER_ERROR_MAP[res.code];
      ElMessage.error(mappedMsg ?? res.msg);
    }
  } catch {
    ElMessage.error("注册失败，请检查网络连接");
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
