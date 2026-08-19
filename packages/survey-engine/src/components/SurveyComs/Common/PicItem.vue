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
import { uploadSurveyFile } from "../../../api/upload";
import type { SurveyFileUploadResponse } from "../../../api/upload";
import type { ApiResponse } from "../../../types";

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

/** 函数式 surveyId 获取器，上传时实时获取当前问卷 ID */
const getSurveyId = inject<() => string | null>("getSurveyId", () => null);

/**
 * 自定义上传 — 使用带追踪的新上传接口（写入 media_assets 表）
 *
 * 优先调用 uploadSurveyFile（带 media_asset 追踪），surveyId 为空时仍使用
 * 该接口（传空 survey_id），确保所有图片从上传第一刻起即被物料管理追踪。
 */
const customUpload = async (options: UploadRequestOptions) => {
  try {
    const sid = getSurveyId();
    // 始终使用追踪接口，survey_id 可选（草稿阶段为空）
    const data = await uploadSurveyFile(options.file, sid ?? undefined);
    options.onSuccess?.(data);
    return data;
  } catch (error) {
    ElMessage.error(t("components.picItem.uploadFailed"));
    options.onError?.(error as Parameters<NonNullable<typeof options.onError>>[0]);
    throw error;
  }
};

/**
 * 上传成功回调 — 读取 T014 拦截器生效后的标准响应信封
 *
 * uploadSurveyFile 的返回值即为业务信封 { code, msg, data }（T014/T015 已统一为该形状），
 * 后端接口已统一返回标准信封，故不再兼容扁平结构（response.file_url/imageUrl），
 * 直接从 response.data.file_url 中取值；取不到值时视为失败，走 ElMessage 提示分支
 */
const handleAvatarSuccess: UploadProps["onSuccess"] = async (response: ApiResponse<SurveyFileUploadResponse>) => {
  const url = response.data?.file_url ?? "";
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
  if (rawFile.size / 1024 / 1024 > 2) {
    ElMessage.error(t("components.picItem.sizeLimit"));
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
