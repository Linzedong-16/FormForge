<template>
  <div
    class="avatar-display"
    :style="avatarStyle"
    :title="username || undefined"
    role="img"
    :aria-label="username ? `${username} 的头像` : '用户头像'"
  >
    <!-- 有效 URL → 渲染图片，加载失败时降级为兜底 -->
    <img
      v-if="avatarUrl"
      :src="avatarUrl"
      :width="size"
      :height="size"
      class="avatar-display__img"
      @error="onImgError"
      @load="onImgLoad"
    />
    <!-- 兜底：圆形背景 + 用户名首字符 -->
    <span v-else class="avatar-display__fallback">
      {{ displayChar }}
    </span>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";

const props = withDefaults(
  defineProps<{
    /** 头像 URL，为 null/空字符串时触发兜底 */
    avatarUrl?: string | null;
    /** 用户名，用于生成首字符兜底和背景色哈希 */
    username?: string;
    /** 头像尺寸（px），同时控制宽高和兜底字号 */
    size?: number;
  }>(),
  {
    avatarUrl: null,
    username: "",
    size: 40
  }
);

/** 图片是否加载失败（触发降级） */
const imgFailed = ref(false);

function onImgError() {
  imgFailed.value = true;
}

function onImgLoad() {
  imgFailed.value = false;
}

/** 是否展示兜底：无有效 URL 或图片加载失败 */
const showFallback = computed(() => {
  if (!props.avatarUrl) return true;
  return imgFailed.value;
});

/** 兜底首字符：用户名首字符大写，无用户名时展示 person 图标占位 */
const displayChar = computed(() => {
  if (!props.username) return "";
  // 取首字符（URL-safe 字符），转换成大写
  return props.username.charAt(0).toUpperCase();
});

/** 兜底头像的显示字符：空用户名时显示 person 图标 */
const fallbackText = computed(() => {
  return displayChar.value || "";
});

/**
 * 基于用户名的简单哈希 → HSL 色相，同一用户颜色稳定，不同用户颜色区分
 * 使用 djb2 哈希算法，轻量且分布均匀
 */
function usernameHash(name: string): number {
  let hash = 5381;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) + hash + name.charCodeAt(i)) | 0; // eslint-disable-line no-bitwise
  }
  return Math.abs(hash);
}

const bgColor = computed(() => {
  if (!props.username) return "#c0c4cc"; // 通用灰色占位
  const hue = usernameHash(props.username) % 360;
  return `hsl(${hue}, 55%, 55%)`;
});

const avatarStyle = computed(() => ({
  width: `${props.size}px`,
  height: `${props.size}px`,
  minWidth: `${props.size}px`,
  fontSize: `${Math.max(props.size * 0.4, 12)}px`,
  backgroundColor: showFallback.value ? bgColor.value : "transparent"
}));
</script>

<style scoped>
.avatar-display {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  overflow: hidden;
  vertical-align: middle;
  flex-shrink: 0;
  user-select: none;
  color: #fff;
  font-weight: 600;
  line-height: 1;
}

.avatar-display__img {
  border-radius: 50%;
  object-fit: cover;
  display: block;
}

.avatar-display__fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}
</style>
