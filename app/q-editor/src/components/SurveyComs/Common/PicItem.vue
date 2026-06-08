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
import { uploadImage } from "@/api/upload";

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
// 自定义上传：使用 api 层提取出的 uploadImage 接口替代 el-upload 的默认上传逻辑
// 上传成功后，通过 options.onSuccess 触发组件的 on-success 回调（handleAvatarSuccess），复用原有处理链路
const customUpload = async (options: UploadRequestOptions) => {
  try {
    const data = await uploadImage(options.file);
    options.onSuccess?.(data);
    return data;
  } catch (error) {
    ElMessage.error(t("components.picItem.uploadFailed"));
    options.onError?.(error as Parameters<NonNullable<typeof options.onError>>[0]);
    throw error;
  }
};
// 上传成功的回调
const handleAvatarSuccess: UploadProps["onSuccess"] = async response => {
  console.log("图片上传响应:", response);
  if (getLink && response.imageUrl) {
    getLink({
      index: props.index,
      link: response.imageUrl
    });
    imageUrl.value = response.imageUrl;
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
