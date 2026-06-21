<template>
  <div @click.stop>
    <div class="container mb-10">
      <!-- 添加图片 -->
      <div class="top flex justify-content-center align-items-center">
        <el-upload
          class="avatar-uploader"
          :show-file-list="false"
          :http-request="customUpload"
          :on-success="handleAvatarSuccess"
          :before-upload="beforeAvatarUpload"
        >
          <img v-if="imageUrl" :src="imageUrl" class="avatar" />
          <div v-else>
            <el-icon><Upload /></el-icon>
            {{ t("components.picItem.addImage") }}
          </div>
        </el-upload>
      </div>
      <!-- 图片标题和描述 -->
      <div class="bottom flex justify-content-center align-items-center flex-direction-column font-weight-500">
        <div class="item">{{ picTitle }}</div>
        <div class="desc mt-5 mb-5">{{ picDesc }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, inject, watch } from "vue";
import { useI18n } from "vue-i18n";
import { Upload } from "@element-plus/icons-vue";
import { ElMessage } from "element-plus";
import type { UploadProps, UploadRequestOptions } from "element-plus";
import { uploadSurveyFile, uploadImage } from "@/api/upload";

const { t } = useI18n();

const props = defineProps({
  picTitle: {
    type: String,
    default: ""
  },
  picDesc: {
    type: String,
    default: ""
  },
  value: {
    type: String,
    default: ""
  },
  index: {
    type: Number,
    default: 0
  }
});
interface GetLinkFn {
  (data: { index: number; link: string }): void;
}
const getLink = inject<GetLinkFn | null>("getLink", null);
/** 函数式 surveyId 获取器，上传时实时获取最新 remoteSurveyId */
const getSurveyId = inject<() => string | null>("getSurveyId", () => null);

/**
 * 自定义上传
 *
 * 优先使用新接口 uploadSurveyFile（需 surveyId，带文件追踪与级联清理），
 * surveyId 为空时降级为旧接口 uploadImage（无追踪，兼容未同步场景）。
 */
const customUpload = async (options: UploadRequestOptions) => {
  try {
    let result: { code: number; msg: string; data: { file_url?: string; imageUrl?: string } | null };

    const sid = getSurveyId();
    if (sid) {
      result = await uploadSurveyFile(options.file, sid);
    } else {
      // 未同步到远程时降级使用旧接口
      result = await uploadImage(options.file);
    }

    options.onSuccess?.(result);
    return result;
  } catch {
    ElMessage.error(t("components.picItem.uploadFailed"));
    throw new Error("Upload failed");
  }
};

// 上传成功的回调
const handleAvatarSuccess = (response: { code: number; msg: string; data: Record<string, unknown> }) => {
  // 兼容新旧接口：新接口返回 data.file_url，旧接口返回 data.imageUrl
  const url = (response.data?.file_url as string) || (response.data?.imageUrl as string);

  if (getLink && url) {
    getLink({
      index: props.index,
      link: url
    });
    imageUrl.value = url;
    ElMessage.success(t("components.picItem.uploadSuccess"));
  } else {
    ElMessage.error(t("components.picItem.saveFailed"));
  }
};

// 上传之前的回调
const beforeAvatarUpload: UploadProps["beforeUpload"] = rawFile => {
  if (rawFile.size / 1024 / 1024 > 10) {
    ElMessage.error("文件大小不能超过 10MB");
    return false;
  }
  return true;
};

// 图片URL: 图片上传成功后，显示在组件中
const imageUrl = ref(props.value);

// 监听图片的变化
watch(
  () => props.value,
  newVal => {
    imageUrl.value = newVal;
  },
  { immediate: true }
);
</script>

<style scoped lang="scss">
.container {
  width: 200px;
  height: 300px;
  border: 1px solid var(--font-color-lightest);
  border-radius: var(--border-radius-md);
  color: var(--font-color-light);
  > .top {
    width: 100%;
    height: 200px;
    background-color: var(--font-color-lightest);
  }
  > .bottom {
    height: 100px;
    font-size: var(--font-size-lg);
    > .desc {
      font-size: var(--font-size-base);
      color: var(--font-color-light);
    }
  }
}
.avatar {
  width: 200px;
  height: 200px;
  object-fit: contain;
}
</style>
