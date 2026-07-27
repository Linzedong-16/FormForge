<template>
  <div class="system-settings">
    <div class="page-header">
      <h2 class="page-title">系统设置</h2>
      <p class="page-desc">平台全局配置管理，包含 SMTP 邮件服务与 AI 生成服务</p>
    </div>

    <!-- SMTP 邮件服务配置 -->
    <a-card title="SMTP 邮件服务" :bordered="false" class="config-card">
      <template #extra>
        <a-tag v-if="smtpConfig?.smtp_enabled === 'true'" color="green">运行中</a-tag>
        <a-tag v-else color="orange">已禁用</a-tag>
      </template>

      <a-spin :loading="smtpLoading" tip="加载中...">
        <a-form :model="smtpForm" layout="vertical" style="max-width: 580px">
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

    <!-- AI 生成服务配置 -->
    <a-card title="AI 生成服务 (DeepSeek)" :bordered="false" class="config-card">
      <template #extra>
        <a-tag v-if="aiConfig?.enabled" color="green">运行中</a-tag>
        <a-tag v-else color="orange">已禁用</a-tag>
      </template>

      <a-spin :loading="aiLoading" tip="加载中...">
        <a-alert v-if="aiError" type="warning" :title="aiError" :closable="true" class="mb-16" @close="aiError = ''" />
        <a-form :model="aiForm" layout="vertical" style="max-width: 580px">
          <!-- 启用开关 -->
          <a-form-item field="enabled" label="启用 AI 生成功能">
            <a-switch v-model="aiForm.enabled" />
            <span class="form-hint">启用后用户可使用 AI 一键生成问卷</span>
          </a-form-item>

          <!-- API Key -->
          <a-form-item field="apiKey" label="DeepSeek API Key" required>
            <a-input-password
              v-model="aiForm.apiKey"
              placeholder="sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              :max-length="256"
              allow-clear
            >
              <template #suffix>
                <a-tooltip content="在 DeepSeek 开放平台获取：platform.deepseek.com → API Keys">
                  <icon-question-circle :size="16" class="icon-hint" />
                </a-tooltip>
              </template>
            </a-input-password>
            <template #help>
              <span v-if="aiConfig?.configured" class="help-text"> 当前：{{ aiConfig.apiKeyMasked }} </span>
              <span v-else class="help-text help-warn"> 未配置 API Key — 留空不修改 </span>
            </template>
          </a-form-item>

          <!-- 模型名称 -->
          <a-form-item field="model" label="模型名称">
            <a-input v-model="aiForm.model" placeholder="deepseek-chat" :max-length="64" />
            <template #help>
              <span class="help-text">默认 deepseek-chat，可选 v3 或 r1 系列</span>
            </template>
          </a-form-item>

          <!-- 操作按钮 -->
          <a-form-item>
            <a-space>
              <a-button type="primary" :loading="aiSaving" @click="saveAIConfig">
                {{ aiSaving ? "保存中..." : "保存配置" }}
              </a-button>
              <a-button @click="resetAIForm">重置</a-button>
            </a-space>
          </a-form-item>
        </a-form>
      </a-spin>
    </a-card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from "vue";
import { Message } from "@arco-design/web-vue";
import { useUserStore } from "@/store/modules/user";
import { getAdminConfig, updateSmtpConfig, getAIConfig, updateAIConfig } from "@/api/modules/admin";
import type { SmtpConfigInput, AIConfigUpdateInput } from "@/api/modules/admin";

const userStore = useUserStore();

// ══════════════════════════════════════════════════════════════
//  SMTP 配置
// ══════════════════════════════════════════════════════════════

const smtpConfig = ref<Record<string, string> | null>(null);
const smtpLoading = ref(false);
const smtpSaving = ref(false);

const smtpForm = reactive<SmtpConfigInput>({
  enabled: false,
  host: "",
  port: 465,
  username: "",
  password: "",
  fromEmail: ""
});

function applySmtpToForm(smtp: Record<string, string>) {
  smtpForm.enabled = smtp.smtp_enabled === "true";
  smtpForm.host = smtp.smtp_host || "";
  smtpForm.port = smtp.smtp_port ? parseInt(smtp.smtp_port) : 465;
  smtpForm.username = smtp.smtp_username || "";
  smtpForm.password = "";
  smtpForm.fromEmail = smtp.smtp_from_email || "";
}

function resetSmtpForm() {
  if (smtpConfig.value) {
    applySmtpToForm(smtpConfig.value);
  }
}

async function saveSmtpConfig() {
  smtpSaving.value = true;
  try {
    const payload: SmtpConfigInput = { ...smtpForm };
    if (!payload.password) {
      delete payload.password;
    }

    const res = await updateSmtpConfig(payload);
    if (res.code === 0) {
      smtpConfig.value = {
        smtp_enabled: String(smtpForm.enabled),
        smtp_host: smtpForm.host,
        smtp_port: String(smtpForm.port),
        smtp_username: smtpForm.username,
        smtp_from_email: smtpForm.fromEmail
      };
      Message.success("SMTP 配置已保存");
    }
  } catch (err: any) {
    Message.error(err?.message || "SMTP 配置保存失败");
  } finally {
    smtpSaving.value = false;
  }
}

// ══════════════════════════════════════════════════════════════
//  AI 配置
// ══════════════════════════════════════════════════════════════

const aiConfig = ref<{
  configured: boolean;
  apiKeyMasked: string;
  model: string;
  enabled: boolean;
} | null>(null);
const aiLoading = ref(false);
const aiSaving = ref(false);
const aiError = ref("");

const aiForm = reactive<{
  apiKey: string;
  model: string;
  enabled: boolean;
}>({
  apiKey: "",
  model: "deepseek-chat",
  enabled: false
});

function applyAIToForm(config: NonNullable<typeof aiConfig.value>) {
  aiForm.enabled = config.enabled;
  aiForm.apiKey = "";
  aiForm.model = config.model || "deepseek-chat";
}

function resetAIForm() {
  if (aiConfig.value) {
    applyAIToForm(aiConfig.value);
    aiError.value = "";
  }
}

async function loadAIConfig() {
  aiLoading.value = true;
  aiError.value = "";
  try {
    const res = await getAIConfig();
    if (res.code === 0 && res.data) {
      aiConfig.value = res.data;
      applyAIToForm(res.data);
    }
  } catch (err: any) {
    aiError.value = "加载 AI 配置失败：" + (err?.message || "未知错误");
  } finally {
    aiLoading.value = false;
  }
}

async function saveAIConfig() {
  // 前端校验
  if (!aiForm.apiKey.trim()) {
    Message.warning("API Key 不能为空");
    return;
  }
  if (!aiForm.apiKey.startsWith("sk-")) {
    Message.warning("API Key 必须以 sk- 开头");
    return;
  }

  aiSaving.value = true;
  aiError.value = "";
  try {
    const payload: AIConfigUpdateInput = {
      apiKey: aiForm.apiKey.trim(),
      model: aiForm.model.trim() || "deepseek-chat",
      enabled: aiForm.enabled
    };

    const res = await updateAIConfig(payload);
    if (res.code === 0 && res.data) {
      aiConfig.value = res.data;
      applyAIToForm(res.data);
      Message.success("AI 配置已保存");
    }
  } catch (err: any) {
    aiError.value = err?.message || "AI 配置保存失败";
  } finally {
    aiSaving.value = false;
  }
}

// ══════════════════════════════════════════════════════════════
//  挂载
// ══════════════════════════════════════════════════════════════

async function loadConfig() {
  smtpLoading.value = true;
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
    smtpLoading.value = false;
  }
}

onMounted(() => {
  if (userStore.isSuperAdmin) {
    loadConfig();
    loadAIConfig();
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
  box-shadow: var(--shadow-sm);
}

.form-hint {
  margin-left: 12px;
  font-size: 13px;
  color: var(--color-text-3);
}

.help-text {
  font-size: 12px;
  color: var(--color-text-3);
}

.help-warn {
  color: var(--color-warning);
}

.icon-hint {
  color: var(--color-text-3);
  cursor: help;
}

.mb-16 {
  margin-bottom: 16px;
}
</style>
