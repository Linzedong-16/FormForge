<template>
  <a-drawer :visible="visible" title="消息" :width="440" unmount-on-close @cancel="handleClose">
    <template #title>
      <div class="drawer-title-row">
        <span>消息</span>
        <a-space>
          <a-button v-if="!userStore.isSuperAdmin" type="text" size="mini" @click="composeVisible = true"
            >联系管理员</a-button
          >
          <a-button
            type="text"
            size="mini"
            :disabled="!hasAnyMessage"
            :loading="markingAllRead"
            @click="handleMarkAllRead"
            >全部已读</a-button
          >
        </a-space>
      </div>
    </template>

    <a-tabs v-model:active-key="activeType" size="small">
      <a-tab-pane key="" title="全部" />
      <a-tab-pane key="operation_notify" title="操作通知" />
      <a-tab-pane key="template_like" title="模板互动" />
      <a-tab-pane key="survey_lifecycle" title="问卷动态" />
      <a-tab-pane key="user_admin_comm" title="通信" />
      <a-tab-pane key="admin_broadcast" title="广播" />
    </a-tabs>

    <a-spin v-if="status === 'loading'" :loading="true" style="width: 100%; padding: 32px 0" />

    <a-result v-else-if="status === 'error'" status="error" :subtitle="errorMessage || '加载失败'">
      <template #extra>
        <a-button type="primary" @click="loadMessages">重试</a-button>
      </template>
    </a-result>

    <a-empty v-else-if="items.length === 0" description="暂无消息" />

    <template v-else>
      <MessageItem
        v-for="item in items"
        :key="item.id"
        :message="item"
        :is-admin="userStore.isSuperAdmin"
        @read="handleRead"
        @delete="handleDelete"
        @view-detail="handleViewDetail"
        @click-message="handleClickMessage"
        @reply="handleReply"
      />
      <a-pagination
        class="drawer-pagination"
        :current="page"
        :page-size="pageSize"
        :total="total"
        size="mini"
        @change="handlePageChange"
      />
    </template>

    <!-- 消息详情弹窗 -->
    <a-modal
      v-model:visible="detailVisible"
      :title="detailMessage?.title || '消息详情'"
      :footer="false"
      @cancel="detailMessage = null"
    >
      <template v-if="detailMessage">
        <a-space class="detail-meta" size="small">
          <a-tag :color="detailTagColor">{{ detailTypeLabel }}</a-tag>
          <span class="detail-sender">{{ detailMessage.sender.name }}</span>
          <span class="detail-time">{{ detailMessage.created_at }}</span>
        </a-space>
        <div class="detail-content">{{ detailMessage.content }}</div>
        <div v-if="detailMessage.related_resource && detailMessage.related_resource_id" class="detail-related">
          <a-link @click="handleViewDetail(detailMessage)">查看关联资源</a-link>
        </div>
      </template>
    </a-modal>

    <!-- 联系管理员 -->
    <a-modal
      v-model:visible="composeVisible"
      title="联系管理员"
      :confirm-loading="composing"
      @ok="handleSendMessage"
      @cancel="composeContent = ''"
    >
      <a-textarea
        v-model="composeContent"
        placeholder="请描述您的问题或建议（1-2000 字）"
        :max-length="2000"
        show-word-limit
        :auto-size="{ minRows: 4, maxRows: 8 }"
      />
    </a-modal>
  </a-drawer>
</template>

<script setup lang="ts">
/**
 * 消息收件箱抽屉（管理后台）
 *
 * 列表/分页/按类型筛选/点击标记已读/删除/全部已读/空态，对齐参考文档 §8.1。
 */
import { ref, watch, computed } from "vue";
import { useRouter } from "vue-router";
import { Message as MessageToast } from "@arco-design/web-vue";
import { getMessages, markMessageRead, markAllMessagesRead, deleteMessage, sendMessage } from "@/api/modules/message";
import { useMessageStore } from "@/store/modules/message";
import { useUserStore } from "@/store/modules/user";
import type { MessageListItem, MessageType } from "@common/message/message.interface";
import MessageItem from "./MessageItem.vue";

const props = defineProps<{ visible: boolean }>();
const emit = defineEmits<{ (e: "update:visible", val: boolean): void }>();

const router = useRouter();
const messageStore = useMessageStore();
const userStore = useUserStore();

type PanelStatus = "loading" | "ready" | "error";

const status = ref<PanelStatus>("loading");
const errorMessage = ref("");
const items = ref<MessageListItem[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const activeType = ref<MessageType | "">("");

const hasAnyMessage = ref(false);
const markingAllRead = ref(false);

/** 是否所有消息均已读（无消息时也算"无需操作"） */
const allRead = computed(() => items.value.length === 0 || items.value.every(i => i.is_read));

/** 消息详情弹窗 */
const detailVisible = ref(false);
const detailMessage = ref<MessageListItem | null>(null);

/** 消息类型中文标签映射 */
const TYPE_LABELS: Record<MessageType, string> = {
  operation_notify: "操作通知",
  template_like: "模板互动",
  survey_lifecycle: "问卷动态",
  user_admin_comm: "通信",
  admin_broadcast: "广播"
};

const detailTypeLabel = computed(() => {
  if (!detailMessage.value) return "";
  return TYPE_LABELS[detailMessage.value.type] || detailMessage.value.type;
});

const detailTagColor = computed(() => {
  if (!detailMessage.value) return "blue";
  if (detailMessage.value.type === "user_admin_comm" || detailMessage.value.type === "admin_broadcast")
    return "orangered";
  if (detailMessage.value.type === "operation_notify") return "red";
  return "green";
});

async function loadMessages() {
  status.value = "loading";
  try {
    const res = await getMessages({
      page: page.value,
      page_size: pageSize.value,
      type: activeType.value || undefined
    });
    if (res.code !== 0) throw new Error(res.msg || "加载失败");
    items.value = res.data?.items ?? [];
    total.value = res.data?.total ?? 0;
    hasAnyMessage.value = hasAnyMessage.value || total.value > 0;
    status.value = "ready";
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : "加载失败";
    status.value = "error";
  }
}

function handlePageChange(newPage: number) {
  page.value = newPage;
  loadMessages();
}

watch(activeType, () => {
  page.value = 1;
  loadMessages();
});

watch(
  () => props.visible,
  visible => {
    if (visible) loadMessages();
  },
  { immediate: true }
);

async function handleRead(id: string) {
  try {
    await markMessageRead(id);
    const target = items.value.find(i => i.id === id);
    if (target) target.is_read = true;
    messageStore.fetchUnreadCount();
  } catch {
    MessageToast.error("标记已读失败");
  }
}

async function handleMarkAllRead() {
  if (allRead.value) {
    MessageToast.info("没有未读消息");
    return;
  }
  markingAllRead.value = true;
  try {
    await markAllMessagesRead(activeType.value ? { type: activeType.value } : undefined);
    items.value = items.value.map(i => ({ ...i, is_read: true }));
    messageStore.fetchUnreadCount();
    MessageToast.success("已全部标记为已读");
  } catch {
    MessageToast.error("操作失败");
  } finally {
    markingAllRead.value = false;
  }
}

/** 点击消息行：打开详情弹窗 */
function handleClickMessage(message: MessageListItem) {
  detailMessage.value = { ...message };
  detailVisible.value = true;
}

async function handleDelete(id: string) {
  try {
    await deleteMessage(id);
    items.value = items.value.filter(i => i.id !== id);
    total.value = Math.max(0, total.value - 1);
    messageStore.fetchUnreadCount();
  } catch {
    MessageToast.error("删除失败");
  }
}

async function handleReply(payload: { messageId: string; content: string }) {
  try {
    const res = await sendMessage({ content: payload.content, reply_to_message_id: Number(payload.messageId) });
    if (res.code !== 0) throw new Error(res.msg || "回复失败");
    MessageToast.success("回复已发送");
  } catch (err) {
    MessageToast.error(err instanceof Error ? err.message : "回复失败");
  }
}

/** 关联资源跳转的落地页映射：管理后台目前没有为每种资源提供逐条深链的详情路由，
 * 因此落地到与该资源类型最相关的既有管理页面（审核管理承载问卷与模板审核入口）。 */
const RESOURCE_ROUTE_MAP: Partial<Record<string, string>> = {
  survey: "/survey-management/audit",
  template: "/survey-management/audit",
  review: "/survey-management/audit"
};

function handleViewDetail(message: MessageListItem) {
  const target = message.related_resource ? RESOURCE_ROUTE_MAP[message.related_resource] : undefined;
  if (!target) {
    MessageToast.warning("资源已不存在");
    return;
  }
  router.push(target);
  handleClose();
}

function handleClose() {
  emit("update:visible", false);
}

// ── 联系管理员 ──────────────────────────────────────────────

const composeVisible = ref(false);
const composeContent = ref("");
const composing = ref(false);

async function handleSendMessage() {
  if (!composeContent.value.trim()) {
    MessageToast.warning("请输入内容");
    return;
  }
  composing.value = true;
  try {
    const res = await sendMessage({ content: composeContent.value.trim() });
    if (res.code !== 0) throw new Error(res.msg || "发送失败");
    MessageToast.success("已发送给管理员");
    composeContent.value = "";
    composeVisible.value = false;
  } catch (err) {
    MessageToast.error(err instanceof Error ? err.message : "发送失败");
  } finally {
    composing.value = false;
  }
}
</script>

<style scoped>
.drawer-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.drawer-pagination {
  margin-top: 16px;
  display: flex;
  justify-content: center;
}

.detail-meta {
  display: flex;
  align-items: center;
  margin-bottom: 16px;
}

.detail-sender {
  color: var(--color-text-1);
  font-size: 13px;
}

.detail-time {
  color: var(--color-text-3);
  font-size: 13px;
}

.detail-content {
  padding: 12px;
  background-color: var(--color-fill-2);
  border-radius: 6px;
  font-size: 14px;
  line-height: 1.8;
  color: var(--color-text-1);
  white-space: pre-wrap;
  word-break: break-word;
}

.detail-related {
  margin-top: 16px;
}
</style>
