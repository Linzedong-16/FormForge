<template>
  <div class="broadcast-sent-view">
    <a-card>
      <template #title>
        <div class="card-title-row">
          <span>已发送广播</span>
          <a-button type="primary" size="small" @click="publishVisible = true">发布广播</a-button>
        </div>
      </template>

      <a-table
        :data="items"
        :loading="loading"
        :pagination="{
          current: page,
          pageSize: pageSize,
          total: total,
          showTotal: true
        }"
        row-key="id"
        :bordered="{ wrapper: true, cell: true }"
        @page-change="handlePageChange"
      >
        <template #columns>
          <a-table-column title="ID" data-index="id" :width="90" align="center" />
          <a-table-column title="标题" data-index="title" :ellipsis="true" :tooltip="true" :width="200" />
          <a-table-column title="内容" data-index="content" :ellipsis="true" :tooltip="true" />
          <a-table-column title="目标范围" :width="120" align="center">
            <template #cell="{ record }">
              <a-tag :color="targetRoleColor(record.target_role)" size="small">
                {{ targetRoleLabel(record.target_role) }}
              </a-tag>
            </template>
          </a-table-column>
          <a-table-column title="预估接收人数" data-index="estimated_recipients" :width="120" align="center" />
          <a-table-column title="发送时间" :width="180" align="center">
            <template #cell="{ record }">{{ formatDate(record.created_at) }}</template>
          </a-table-column>
        </template>
      </a-table>
    </a-card>

    <!-- 发布广播 -->
    <a-modal
      v-model:visible="publishVisible"
      title="发布广播"
      :confirm-loading="publishing"
      @ok="handlePublish"
      @cancel="resetForm"
    >
      <a-form :model="form" layout="vertical">
        <a-form-item label="标题">
          <a-input v-model="form.title" placeholder="请输入广播标题（1-200 字）" :max-length="200" show-word-limit />
        </a-form-item>
        <a-form-item label="内容">
          <a-textarea
            v-model="form.content"
            placeholder="请输入广播内容（1-2000 字）"
            :max-length="2000"
            show-word-limit
            :auto-size="{ minRows: 4, maxRows: 8 }"
          />
        </a-form-item>
        <a-form-item label="目标范围">
          <a-select v-model="form.target_role">
            <a-option value="all">全部用户</a-option>
            <a-option value="user">普通用户</a-option>
            <a-option value="super_admin">超级管理员</a-option>
          </a-select>
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
/**
 * 消息中心 — 已发送广播（管理后台）
 *
 * 展示管理员历史广播记录，并提供发布新广播的入口，对齐参考文档 US3 场景。
 */
import { ref, onMounted } from "vue";
import { Message as MessageToast } from "@arco-design/web-vue";
import { getSentBroadcasts, broadcastMessage } from "@/api/modules/message-admin";
import type { BroadcastSentItem, MessageTargetRole } from "@common/message/message.interface";

const items = ref<BroadcastSentItem[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const loading = ref(false);

async function loadList() {
  loading.value = true;
  try {
    const res = await getSentBroadcasts({ page: page.value, page_size: pageSize.value });
    if (res.code !== 0) throw new Error(res.msg || "加载失败");
    items.value = res.data?.items ?? [];
    total.value = res.data?.total ?? 0;
  } catch (err) {
    MessageToast.error(err instanceof Error ? err.message : "加载失败");
  } finally {
    loading.value = false;
  }
}

function handlePageChange(newPage: number) {
  page.value = newPage;
  loadList();
}

onMounted(loadList);

const targetRoleLabelMap: Record<MessageTargetRole, string> = {
  all: "全部用户",
  user: "普通用户",
  super_admin: "超级管理员"
};
const targetRoleColorMap: Record<MessageTargetRole, string> = {
  all: "arcoblue",
  user: "green",
  super_admin: "orangered"
};

function targetRoleLabel(role: MessageTargetRole): string {
  return targetRoleLabelMap[role] ?? role;
}
function targetRoleColor(role: MessageTargetRole): string {
  return targetRoleColorMap[role] ?? "gray";
}

function formatDate(iso: string): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("zh-CN", { hour12: false });
}

// ── 发布广播 ──────────────────────────────────────────────

const publishVisible = ref(false);
const publishing = ref(false);
const form = ref<{ title: string; content: string; target_role: MessageTargetRole }>({
  title: "",
  content: "",
  target_role: "all"
});

function resetForm() {
  form.value = { title: "", content: "", target_role: "all" };
}

async function handlePublish() {
  if (!form.value.title.trim() || !form.value.content.trim()) {
    MessageToast.warning("请填写标题和内容");
    return;
  }
  publishing.value = true;
  try {
    const res = await broadcastMessage({
      title: form.value.title.trim(),
      content: form.value.content.trim(),
      target_role: form.value.target_role
    });
    if (res.code !== 0) throw new Error(res.msg || "发布失败");
    MessageToast.success(`广播已发布，预计触达 ${res.data?.estimated_recipients ?? 0} 人`);
    publishVisible.value = false;
    resetForm();
    page.value = 1;
    loadList();
  } catch (err) {
    MessageToast.error(err instanceof Error ? err.message : "发布失败");
  } finally {
    publishing.value = false;
  }
}
</script>

<style scoped>
.card-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}
</style>
