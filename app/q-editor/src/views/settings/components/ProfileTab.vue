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
import { reactive, ref, onMounted, watch } from "vue";
import { useI18n } from "vue-i18n";
import { ElMessage } from "element-plus";
import AvatarUpload from "./AvatarUpload.vue";
import InterestTags from "./InterestTags.vue";
import { getProfile, updateProfile } from "@/api/modules/settings";
import { useUserStore } from "@/stores/useUser";

const { t } = useI18n();
const saving = ref(false);
const loading = ref(false);
const userStore = useUserStore();

// ── 原始数据（用于重置） ──────────────────────────────
const originalData = {
  avatarUrl: "",
  nickname: "",
  occupation: "",
  bio: "",
  interests: [] as string[]
};

// ── 表单数据 ──────────────────────────────────────────
const form = reactive({
  avatarUrl: "",
  nickname: "",
  occupation: "",
  bio: "",
  interests: [] as string[]
});

// ── 头像变更时自动上传（由 AvatarUpload emit dataUrl） ─
watch(
  () => form.avatarUrl,
  val => {
    originalData.avatarUrl = val;
  }
);

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

// ── 表单数据回填 ──────────────────────────────────────
function fillForm(data: {
  avatarUrl: string | null;
  nickname: string | null;
  occupation: string | null;
  bio: string | null;
  interests: string[];
}) {
  form.avatarUrl = data.avatarUrl ?? "";
  form.nickname = data.nickname ?? "";
  form.occupation = data.occupation ?? "";
  form.bio = data.bio ?? "";
  form.interests = data.interests ?? [];
  // 记录原始值用于重置
  Object.assign(originalData, {
    avatarUrl: form.avatarUrl,
    nickname: form.nickname,
    occupation: form.occupation,
    bio: form.bio,
    interests: [...form.interests]
  });
}

// ── 加载资料 ──────────────────────────────────────────
async function loadProfile() {
  loading.value = true;
  try {
    const res = await getProfile();
    if (res.code === 0 && res.data) {
      fillForm(res.data);
      // 同步到 Pinia store，供其他组件使用
      userStore.setProfile({
        avatarUrl: res.data.avatarUrl,
        nickname: res.data.nickname,
        occupation: res.data.occupation,
        bio: res.data.bio,
        interests: res.data.interests
      });
    }
  } catch {
    // 加载失败不阻断页面渲染，保留空白表单
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  loadProfile();
});

// ── 保存 ──────────────────────────────────────────────
async function handleSave() {
  saving.value = true;
  try {
    const res = await updateProfile({
      nickname: form.nickname || undefined,
      occupation: form.occupation || undefined,
      bio: form.bio || undefined,
      interests: form.interests.length > 0 ? form.interests : undefined
    });
    if (res.code === 0) {
      ElMessage.success(t("settings.saveSuccess"));
      // 更新原始数据
      Object.assign(originalData, {
        nickname: form.nickname,
        occupation: form.occupation,
        bio: form.bio,
        interests: [...form.interests]
      });
      // 同步到 Pinia store，所有依赖组件实时响应
      userStore.setProfile({
        nickname: form.nickname || null,
        occupation: form.occupation || null,
        bio: form.bio || null,
        interests: form.interests.length > 0 ? [...form.interests] : []
      });
    }
  } catch {
    ElMessage.error(t("settings.saveFailed"));
  } finally {
    saving.value = false;
  }
}

// ── 重置 ──────────────────────────────────────────────
function handleReset() {
  form.nickname = originalData.nickname;
  form.occupation = originalData.occupation;
  form.bio = originalData.bio;
  form.interests = [...originalData.interests];
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
