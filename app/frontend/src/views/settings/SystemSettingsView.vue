<template>
  <div class="system-settings">
    <div class="page-header">
      <h2 class="page-title">系统设置</h2>
      <p class="page-desc">平台全局配置管理，后续可在此页面统一管理所有系统级 Key</p>
    </div>

    <!-- SMTP 邮件服务配置 -->
    <a-card title="SMTP 邮件服务" :bordered="false" class="config-card">
      <template #extra>
        <a-tag v-if="smtpConfig?.smtp_enabled === 'true'" color="green">运行中</a-tag>
        <a-tag v-else color="orange">已禁用</a-tag>
      </template>

      <a-spin :loading="hardLoading" tip="加载中...">
        <a-form ref="smtpFormRef" :model="smtpForm" layout="vertical" style="max-width: 580px">
          <!-- 启用开关 -->
          <a-form-item field="enabled" label="启用 SMTP 服务">
            <a-switch v-model="smtpForm.enabled" />
            <span class="form-hint">开启后系统将使用 SMTP 发送邮件（验证码、通知等）</span>
          </a-form-item>

          <!-- 服务器地址 -->
          <a-form-item field="host" label="SMTP 服务器地址" required>
            <a-input v-model="smtpForm.host" placeholder="smtp.example.com" :max-length="255" />
          </a-form-item>

          <!-- 端口 -->
          <a-form-item field="port" label="端口" required>
            <a-input-number v-model="smtpForm.port" :min="1" :max="65535" placeholder="465" style="width: 100%" />
          </a-form-item>

          <!-- 用户名 -->
          <a-form-item field="username" label="SMTP 用户名" required>
            <a-input v-model="smtpForm.username" placeholder="noreply@example.com" />
          </a-form-item>

          <!-- 密码 -->
          <a-form-item field="password" label="SMTP 密码">
            <a-input-password v-model="smtpForm.password" placeholder="留空不修改密码" />
          </a-form-item>

          <!-- 发件人邮箱 -->
          <a-form-item field="fromEmail" label="发件人邮箱" required>
            <a-input v-model="smtpForm.fromEmail" placeholder="noreply@example.com" />
          </a-form-item>

          <!-- 操作按钮 -->
          <a-form-item>
            <a-space>
              <a-button type="primary" :loading="smtpSaving" @click="saveSmtpConfig">
                {{ smtpSaving ? "保存中..." : "保存配置" }}
              </a-button>
              <a-button @click="resetSmtpForm">重置</a-button>
            </a-space>
          </a-form-item>
        </a-form>
      </a-spin>
    </a-card>

    <!-- 预留：其他系统配置 -->
    <a-card title="其他配置（即将上线）" :bordered="false" class="config-card">
      <a-empty description="API Token、第三方服务密钥等配置项即将接入此页面">
        <template #image>
          <icon-settings :size="48" />
        </template>
      </a-empty>
    </a-card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from "vue";
import { useUserStore } from "@/store/modules/user";
import { getAdminConfig, updateSmtpConfig } from "@/api/modules/admin";
import type { SmtpConfigInput } from "@/api/modules/admin";

const userStore = useUserStore();
const smtpFormRef = ref();

// ── 原始配置缓存 ──────────────────────────────────────────

const smtpConfig = ref<Record<string, string> | null>(null);
const hardLoading = ref(false);
const smtpSaving = ref(false);

const smtpForm = reactive<SmtpConfigInput>({
  enabled: false,
  host: "",
  port: 465,
  username: "",
  password: "",
  fromEmail: ""
});

// ── 加载配置 ──────────────────────────────────────────────

async function loadConfig() {
  hardLoading.value = true;
  try {
    const res = await getAdminConfig();
    if (res.code === 0 && res.data) {
      const smtp = res.data.smtp || {};
      smtpConfig.value = smtp;
      applySmtpToForm(smtp);
    }
  } catch {
    // 非 super_admin 账号可能无权访问
  } finally {
    hardLoading.value = false;
  }
}

function applySmtpToForm(smtp: Record<string, string>) {
  smtpForm.enabled = smtp.smtp_enabled === "true";
  smtpForm.host = smtp.smtp_host || "";
  smtpForm.port = smtp.smtp_port ? parseInt(smtp.smtp_port) : 465;
  smtpForm.username = smtp.smtp_username || "";
  smtpForm.password = ""; // 密码不回显
  smtpForm.fromEmail = smtp.smtp_from_email || "";
}

function resetSmtpForm() {
  if (smtpConfig.value) {
    applySmtpToForm(smtpConfig.value);
  }
}

// ── 保存 SMTP ─────────────────────────────────────────────

async function saveSmtpConfig() {
  smtpSaving.value = true;
  try {
    const payload: SmtpConfigInput = { ...smtpForm };
    // 密码留空时不传（表示不修改密码）
    if (!payload.password) {
      delete payload.password;
    }

    const res = await updateSmtpConfig(payload);
    if (res.code === 0) {
      // 刷新本地缓存
      smtpConfig.value = {
        smtp_enabled: String(smtpForm.enabled),
        smtp_host: smtpForm.host,
        smtp_port: String(smtpForm.port),
        smtp_username: smtpForm.username,
        smtp_from_email: smtpForm.fromEmail
      };
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (err: any) {
    // 错误消息由 serverClient 拦截器统一提示
  } finally {
    smtpSaving.value = false;
  }
}

// ── 挂载 ──────────────────────────────────────────────────

onMounted(() => {
  if (userStore.isSuperAdmin) {
    loadConfig();
  }
});
</script>

<style scoped>
.system-settings {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.page-header {
  margin-bottom: 4px;
}

.page-title {
  margin: 0 0 4px;
  font-size: 20px;
  font-weight: 600;
  color: var(--color-text-1);
}

.page-desc {
  margin: 0;
  font-size: 14px;
  color: var(--color-text-3);
}

.config-card {
  transition: box-shadow 0.2s;
}

.config-card:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.form-hint {
  margin-left: 12px;
  font-size: 13px;
  color: var(--color-text-3);
}
</style>
