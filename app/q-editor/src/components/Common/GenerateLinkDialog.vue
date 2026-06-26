<template>
  <el-dialog
    v-model="visible"
    :title="t('layout.generateLinkTitle')"
    width="520px"
    :close-on-click-modal="false"
    @closed="handleClosed"
  >
    <!-- 截止时间设置 -->
    <el-form :model="formData" label-width="90px">
      <el-form-item :label="t('layout.generateLinkDeadline')" required>
        <el-date-picker
          v-model="formData.deadline"
          type="datetime"
          :placeholder="t('layout.generateLinkDeadlineRequired')"
          :disabled-date="disabledDate"
          :disabled-hours="disabledHours"
          :disabled-minutes="disabledMinutes"
          :shortcuts="dateShortcuts"
          style="width: 100%"
        />
        <div class="deadline-hint">
          <el-icon><InfoFilled /></el-icon>
          <span>{{ t("layout.generateLinkDeadlineHint") }}</span>
        </div>
      </el-form-item>

      <!-- 生成结果展示 -->
      <template v-if="generatedLink">
        <el-divider />
        <el-form-item :label="t('layout.linkLabel')">
          <div class="link-result">
            <el-input :model-value="generatedLink.link_url" readonly class="link-input">
              <template #append>
                <el-button :icon="CopyDocument" @click="copyLink">
                  {{ t("layout.copyLink") }}
                </el-button>
              </template>
            </el-input>
            <div class="link-meta">
              <el-tag type="warning" size="small" effect="plain">
                截止时间：{{ formatDeadline(generatedLink.deadline) }}
              </el-tag>
            </div>
          </div>
        </el-form-item>
      </template>
    </el-form>

    <template #footer>
      <el-button @click="handleCancel">{{ t("layout.cancel") }}</el-button>
      <el-button
        v-if="!generatedLink"
        type="primary"
        :loading="submitting"
        :disabled="!isFormValid"
        @click="handleGenerate"
      >
        {{ submitting ? t("layout.generating") : t("layout.generateLinkGenerate") }}
      </el-button>
      <el-button v-else type="primary" @click="handleGoToSurvey">
        {{ t("layout.goToSurvey") }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useI18n } from "vue-i18n";
import { ElMessage } from "element-plus";
import { CopyDocument, InfoFilled } from "@element-plus/icons-vue";
import { useRouter } from "vue-router";
import type { GenerateLinkResponse } from "@common/survey/survey.interface";
import { generateSurveyLink } from "@/api/modules/survey";

// ════════════════════════════════════════════════════════════
//  Props
// ════════════════════════════════════════════════════════════

const props = defineProps<{
  /** 弹窗显示控制 */
  modelValue: boolean;
  /** 问卷 ID */
  surveyId: string;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
  /** 生成成功（可选，通知父组件刷新数据） */
  (e: "generated", data: GenerateLinkResponse): void;
}>();

// ════════════════════════════════════════════════════════════
//  状态
// ════════════════════════════════════════════════════════════

const { t } = useI18n();
const router = useRouter();

const visible = computed({
  get: () => props.modelValue,
  set: (val: boolean) => emit("update:modelValue", val)
});

/** 表单数据 */
const formData = ref({
  deadline: null as Date | null
});

/** 提交 loading */
const submitting = ref(false);

/** 生成结果 */
const generatedLink = ref<GenerateLinkResponse | null>(null);

/** 表单是否有效 */
const isFormValid = computed(() => {
  if (!formData.value.deadline) return false;
  const deadlineMs = formData.value.deadline.getTime();
  const nowMs = Date.now();
  // 截止时间至少在当前时间之后 1 分钟（与后端校验对齐，后端仅要求 > now）
  const minDeadline = nowMs + 60 * 1000;
  // 截止时间不能超过 90 天后（与后端 Zod schema 的 refine 对齐）
  const maxDeadline = nowMs + 90 * 24 * 60 * 60 * 1000;
  return deadlineMs >= minDeadline && deadlineMs <= maxDeadline;
});

// ════════════════════════════════════════════════════════════
//  日期时间禁用逻辑
// ════════════════════════════════════════════════════════════

/** 快捷日期选项 */
const dateShortcuts = [
  {
    text: "1 小时后",
    value: () => new Date(Date.now() + 60 * 60 * 1000)
  },
  {
    text: "6 小时后",
    value: () => new Date(Date.now() + 6 * 60 * 60 * 1000)
  },
  {
    text: "24 小时后",
    value: () => new Date(Date.now() + 24 * 60 * 60 * 1000)
  },
  {
    text: "3 天后",
    value: () => new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
  },
  {
    text: "7 天后",
    value: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  },
  {
    text: "30 天后",
    value: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
  }
];

/** 禁用过去日期和超过 90 天的未来日期（与后端校验对齐） */
function disabledDate(date: Date): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const maxDate = new Date();
  maxDate.setDate(maxDate.getDate() + 90);
  maxDate.setHours(23, 59, 59, 999);
  // 禁用过去日期和超过 90 天后的日期
  return date.getTime() < today.getTime() || date.getTime() > maxDate.getTime();
}

/** 禁用当前小时之前的小时（当天时） */
function disabledHours(): number[] {
  const now = new Date();
  const selectedDate = formData.value.deadline;
  if (!selectedDate) return [];

  // 仅当选择的是今天时，禁用已过去的小时
  const isToday =
    selectedDate.getFullYear() === now.getFullYear() &&
    selectedDate.getMonth() === now.getMonth() &&
    selectedDate.getDate() === now.getDate();

  if (!isToday) return [];

  // 禁用当前小时及之前的小时
  const disabled: number[] = [];
  for (let h = 0; h <= now.getHours(); h++) {
    disabled.push(h);
  }
  return disabled;
}

/** 禁用当前分钟之前的分钟（当选择的是当前小时时） */
function disabledMinutes(selectedHour: number): number[] {
  const now = new Date();
  const selectedDate = formData.value.deadline;
  if (!selectedDate) return [];

  const isToday =
    selectedDate.getFullYear() === now.getFullYear() &&
    selectedDate.getMonth() === now.getMonth() &&
    selectedDate.getDate() === now.getDate();

  if (!isToday || selectedHour !== now.getHours()) return [];

  // 禁用当前分钟及之前的分钟
  const disabled: number[] = [];
  for (let m = 0; m <= now.getMinutes(); m++) {
    disabled.push(m);
  }
  return disabled;
}

// ════════════════════════════════════════════════════════════
//  操作
// ════════════════════════════════════════════════════════════

/** 生成问卷链接 */
async function handleGenerate() {
  if (!formData.value.deadline || !props.surveyId) return;

  submitting.value = true;
  try {
    // 将 Date 转为 ISO 8601 字符串发送给后端
    const deadline = formData.value.deadline.toISOString();
    const res = await generateSurveyLink(props.surveyId, { deadline });

    if (res.code === 0 && res.data) {
      generatedLink.value = res.data;
      ElMessage.success(t("layout.generateLinkSuccess"));
      emit("generated", res.data);
    } else {
      ElMessage.error(res.msg || t("layout.generateLinkFailed"));
    }
  } catch (err: any) {
    const msg = err?.response?.data?.msg || err?.message || t("layout.generateLinkFailed");
    ElMessage.error(msg);
  } finally {
    submitting.value = false;
  }
}

/** 跳转到问卷填写页面 */
function handleGoToSurvey() {
  if (!generatedLink.value) return;
  visible.value = false;
  // 通过 vue-router 导航到 SurveyView 页面
  router.push({ path: `/survey/${generatedLink.value.survey_id}` });
}

/** 复制链接到剪贴板 */
async function copyLink() {
  if (!generatedLink.value) return;
  try {
    await navigator.clipboard.writeText(generatedLink.value.link_url);
    ElMessage.success(t("layout.copySuccess"));
  } catch {
    // 降级：使用传统方法复制
    const textarea = document.createElement("textarea");
    textarea.value = generatedLink.value.link_url;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
    ElMessage.success(t("layout.copySuccess"));
  }
}

/** 取消操作 */
function handleCancel() {
  visible.value = false;
}

/** 弹窗关闭后重置状态 */
function handleClosed() {
  formData.value.deadline = null;
  generatedLink.value = null;
  submitting.value = false;
}

/** 格式化截止时间显示 */
function formatDeadline(iso: string): string {
  const d = new Date(iso);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}
</script>

<style scoped lang="scss">
.deadline-hint {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 6px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.link-result {
  width: 100%;

  .link-input {
    width: 100%;
  }

  .link-meta {
    margin-top: 8px;
  }
}
</style>
