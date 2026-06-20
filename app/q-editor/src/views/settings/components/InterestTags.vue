<template>
  <div class="interest-tags">
    <!-- 已选标签 -->
    <div class="tags-list">
      <el-tag
        v-for="(tag, index) in modelValue"
        :key="index"
        closable
        :disable-transitions="false"
        class="interest-tag"
        @close="handleRemoveTag(tag)"
      >
        {{ tag }}
      </el-tag>

      <!-- 添加标签输入框 -->
      <el-input
        v-if="inputVisible"
        ref="inputRef"
        v-model="inputValue"
        size="small"
        class="tag-input"
        maxlength="20"
        @keyup.enter="handleInputConfirm"
        @blur="handleInputConfirm"
      />
      <el-button v-else size="small" class="add-tag-btn" @click="showInput"> + {{ t("settings.addTag") }} </el-button>
    </div>

    <!-- 推荐标签 -->
    <div class="suggested-tags">
      <span class="suggested-label">{{ t("settings.suggestedTags") }}</span>
      <el-tag
        v-for="tag in suggestedTags"
        :key="tag"
        :type="modelValue.includes(tag) ? 'primary' : 'info'"
        size="small"
        class="suggested-tag"
        :class="{ selected: modelValue.includes(tag) }"
        @click="handleToggleTag(tag)"
      >
        {{ tag }}
      </el-tag>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick } from "vue";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

// ── Props & Emits ────────────────────────────────────
const props = defineProps<{
  modelValue: string[];
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: string[]): void;
}>();

// ── 状态 ────────────────────────────────────────────
const inputVisible = ref(false);
const inputValue = ref("");
const inputRef = ref<InstanceType<typeof import("element-plus").ElInput> | null>(null);

// ── 推荐标签 ────────────────────────────────────────
const suggestedTags = [
  "前端",
  "后端",
  "全栈",
  "人工智能",
  "产品设计",
  "UI设计",
  "数据分析",
  "系统架构",
  "开源",
  "DevOps",
  "移动开发",
  "游戏开发",
  "云计算",
  "安全",
  "区块链",
  "物联网"
];

// ── 显示输入框 ──────────────────────────────────────
function showInput() {
  inputVisible.value = true;
  nextTick(() => {
    inputRef.value?.focus();
  });
}

// ── 确认输入 ────────────────────────────────────────
function handleInputConfirm() {
  const value = inputValue.value.trim();
  if (value && !props.modelValue.includes(value)) {
    emit("update:modelValue", [...props.modelValue, value]);
  }
  inputVisible.value = false;
  inputValue.value = "";
}

// ── 删除标签 ────────────────────────────────────────
function handleRemoveTag(tag: string) {
  emit(
    "update:modelValue",
    props.modelValue.filter(t => t !== tag)
  );
}

// ── 切换推荐标签 ────────────────────────────────────
function handleToggleTag(tag: string) {
  if (props.modelValue.includes(tag)) {
    handleRemoveTag(tag);
  } else {
    emit("update:modelValue", [...props.modelValue, tag]);
  }
}
</script>

<style scoped lang="scss">
// ── 本地 fallback：引用项目主题系统变量，确保亮/暗主题下均有可读的对比度 ──
$clr-text-secondary: var(--font-color-lighter, #71717a);

.interest-tags {
  width: 100%;
}

.tags-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-bottom: 16px;
}

.interest-tag {
  font-size: 13px;
}

.tag-input {
  width: 120px;
}

.add-tag-btn {
  font-size: 12px;
  padding: 2px 10px;
  height: auto;
}

// ── 推荐标签 ────────────────────────────────────────
.suggested-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.suggested-label {
  font-size: 12px;
  color: $clr-text-secondary;
  margin-right: 4px;
  white-space: nowrap;
}

.suggested-tag {
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    opacity: 0.8;
  }
}
</style>
