<template>
  <a-drawer :visible="visible" title="编辑物料" width="480" @cancel="handleClose" @update:visible="handleClose">
    <a-spin :loading="loading" style="width: 100%">
      <template v-if="detail">
        <a-descriptions :column="1" bordered size="small" style="margin-bottom: 16px">
          <a-descriptions-item label="文件名">{{ detail.file_name }}</a-descriptions-item>
          <a-descriptions-item label="MIME 类型">{{ detail.mime_type }}</a-descriptions-item>
          <a-descriptions-item label="上传者">{{ detail.user_id }}</a-descriptions-item>
          <a-descriptions-item label="最近审核人">{{ detail.reviewed_by ?? "—" }}</a-descriptions-item>
          <a-descriptions-item label="最近审核时间">{{ detail.reviewed_at ?? "—" }}</a-descriptions-item>
        </a-descriptions>

        <a-alert v-if="detail.references.length > 0" type="warning" style="margin-bottom: 16px">
          当前被以下内容引用：{{ formatReferences(detail.references) }}
        </a-alert>

        <a-form :model="form" layout="vertical">
          <a-form-item label="资源类型">
            <a-input v-model="form.resource_type" placeholder="image" />
          </a-form-item>
          <a-form-item label="所属问卷 ID（留空表示不关联）">
            <a-input v-model="form.survey_id" placeholder="留空表示不关联任何问卷" allow-clear />
          </a-form-item>
          <a-form-item>
            <a-button type="primary" :loading="savingMeta" @click="handleSaveMeta">保存元信息</a-button>
          </a-form-item>
        </a-form>

        <a-divider />

        <a-form :model="reviewForm" layout="vertical">
          <a-form-item label="审核状态">
            <a-select v-model="reviewForm.review_status">
              <a-option value="pending">待审核</a-option>
              <a-option value="approved">已通过</a-option>
              <a-option value="rejected">已驳回</a-option>
            </a-select>
          </a-form-item>
          <a-form-item label="审核意见（可选）">
            <a-textarea v-model="reviewForm.review_comment" placeholder="审核意见，最多 500 字" :max-length="500" />
          </a-form-item>
          <a-form-item>
            <a-button type="primary" :loading="savingReview" @click="handleSaveReviewStatus"> 保存审核状态 </a-button>
          </a-form-item>
        </a-form>
      </template>
    </a-spin>

    <template #footer>
      <a-button @click="handleClose">关闭</a-button>
    </template>
  </a-drawer>
</template>

<script setup lang="ts">
import { ref, reactive, watch } from "vue";
import { Message } from "@arco-design/web-vue";
import {
  getMediaAssetDetail,
  updateMediaAsset,
  changeMediaAssetReviewStatus,
  type MediaAssetDetail,
  type MediaAssetReference,
  type ReviewStatus
} from "@/api/modules/media-asset";

const props = defineProps<{
  visible: boolean;
  mediaAssetId: string | null;
}>();

const emit = defineEmits<{
  "update:visible": [boolean];
  updated: [];
}>();

const loading = ref(false);
const detail = ref<MediaAssetDetail | null>(null);

const form = reactive({ resource_type: "", survey_id: "" });
const savingMeta = ref(false);

const reviewForm = reactive({ review_status: "pending" as ReviewStatus, review_comment: "" });
const savingReview = ref(false);

watch(
  () => [props.visible, props.mediaAssetId] as const,
  async ([visible, id]) => {
    if (visible && id) {
      await fetchDetail(id);
    } else {
      detail.value = null;
    }
  },
  { immediate: true }
);

async function fetchDetail(id: string) {
  loading.value = true;
  try {
    const res = await getMediaAssetDetail(id);
    if (res.data) {
      detail.value = res.data;
      form.resource_type = res.data.resource_type;
      form.survey_id = res.data.survey_id ?? "";
      reviewForm.review_status = res.data.review_status === "none" ? "pending" : res.data.review_status;
      reviewForm.review_comment = res.data.review_comment ?? "";
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "获取物料详情失败";
    Message.error(msg);
  } finally {
    loading.value = false;
  }
}

function formatReferences(references: MediaAssetReference[]): string {
  return references
    .map(r => (r.type === "survey_component" ? `问卷「${r.survey_title}」的题目` : `用户 ${r.user_id} 的当前头像`))
    .join("；");
}

async function handleSaveMeta() {
  if (!props.mediaAssetId) return;
  savingMeta.value = true;
  try {
    const res = await updateMediaAsset(props.mediaAssetId, {
      resource_type: form.resource_type || undefined,
      survey_id: form.survey_id || null
    });
    if (res.data) {
      Message.success("元信息已更新");
      emit("updated");
      await fetchDetail(props.mediaAssetId);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "更新失败";
    Message.error(msg);
  } finally {
    savingMeta.value = false;
  }
}

async function handleSaveReviewStatus() {
  if (!props.mediaAssetId) return;
  savingReview.value = true;
  try {
    const res = await changeMediaAssetReviewStatus(props.mediaAssetId, {
      review_status: reviewForm.review_status,
      review_comment: reviewForm.review_comment || undefined
    });
    if (res.data) {
      Message.success("审核状态已更新（不影响该物料在原有引用位置的展示）");
      emit("updated");
      await fetchDetail(props.mediaAssetId);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "审核状态更新失败";
    Message.error(msg);
  } finally {
    savingReview.value = false;
  }
}

function handleClose() {
  emit("update:visible", false);
}
</script>
