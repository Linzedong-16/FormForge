<template>
  <div class="profile-tab">
    <h2 class="tab-title">{{ t("settings.profile") }}</h2>
    <p class="tab-desc">{{ t("settings.profileDesc") }}</p>

    <el-form label-position="top" class="profile-form">
      <!-- 头像上传 -->
      <el-form-item :label="t('settings.avatar')">
        <AvatarUpload v-model="form.avatarUrl" />
      </el-form-item>

      <!-- 昵称 -->
      <el-form-item :label="t('settings.nickname')">
        <el-input
          v-model="form.nickname"
          :placeholder="t('settings.nicknamePlaceholder')"
          maxlength="50"
          show-word-limit
        />
      </el-form-item>

      <!-- 职业 -->
      <el-form-item :label="t('settings.occupation')">
        <el-autocomplete
          v-model="form.occupation"
          :placeholder="t('settings.occupationPlaceholder')"
          :fetch-suggestions="queryOccupation"
          maxlength="100"
          show-word-limit
          clearable
        />
      </el-form-item>

      <!-- 个人介绍 -->
      <el-form-item :label="t('settings.bio')">
        <el-input
          v-model="form.bio"
          type="textarea"
          :rows="4"
          :placeholder="t('settings.bioPlaceholder')"
          maxlength="500"
          show-word-limit
        />
      </el-form-item>

      <!-- 兴趣标签 -->
      <el-form-item :label="t('settings.interests')">
        <InterestTags v-model="form.interests" />
      </el-form-item>

      <!-- 提交按钮 -->
      <el-form-item>
        <el-button type="primary" :loading="saving" @click="handleSave">
          {{ t("settings.saveProfile") }}
        </el-button>
        <el-button @click="handleReset">
          {{ t("settings.reset") }}
        </el-button>
      </el-form-item>
    </el-form>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from "vue";
import { useI18n } from "vue-i18n";
import { ElMessage } from "element-plus";
import AvatarUpload from "./AvatarUpload.vue";
import InterestTags from "./InterestTags.vue";

const { t } = useI18n();
const saving = ref(false);

// ── 表单数据（暂用本地状态，后续对接 API） ──────────────
const form = reactive({
  avatarUrl: "",
  nickname: "",
  occupation: "",
  bio: "",
  interests: [] as string[]
});

// ── 职业自动补全建议 ──────────────────────────────────
const OCCUPATION_SUGGESTIONS = [
  { value: "前端开发工程师" },
  { value: "后端开发工程师" },
  { value: "全栈开发工程师" },
  { value: "UI/UX 设计师" },
  { value: "产品经理" },
  { value: "数据分析师" },
  { value: "测试工程师" },
  { value: "运维工程师" },
  { value: "学生" },
  { value: "教师" },
  { value: "研究员" },
  { value: "创业者" }
];

function queryOccupation(queryString: string, cb: (results: { value: string }[]) => void) {
  const results = queryString
    ? OCCUPATION_SUGGESTIONS.filter(item => item.value.toLowerCase().includes(queryString.toLowerCase()))
    : OCCUPATION_SUGGESTIONS;
  cb(results);
}

// ── 保存（预留 API 调用位） ───────────────────────────
async function handleSave() {
  saving.value = true;
  try {
    // TODO: 调用 API 保存用户资料
    // await profileApi.saveProfile(form);
    ElMessage.success(t("settings.saveSuccess"));
  } catch {
    ElMessage.error(t("settings.saveFailed"));
  } finally {
    saving.value = false;
  }
}

// ── 重置（预留 API 调用位） ───────────────────────────
function handleReset() {
  // TODO: 调用 API 获取已保存的用户资料并回填
  form.avatarUrl = "";
  form.nickname = "";
  form.occupation = "";
  form.bio = "";
  form.interests = [];
}
</script>

<style scoped lang="scss">
// ── 本地 fallback：引用项目主题系统变量，确保亮/暗主题下均有可读的对比度 ──
$clr-text: var(--font-color, #18181b);
$clr-text-secondary: var(--font-color-lighter, #71717a);

.profile-tab {
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

.profile-form {
  :deep(.el-form-item__label) {
    font-weight: 500;
    color: $clr-text;
  }
}
</style>
