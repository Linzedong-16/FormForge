<template>
  <div class="message-item" :class="{ unread: !message.is_read }" @click="handleClick">
    <span class="message-unread-dot" :class="{ 'dot-visible': !message.is_read }"></span>
    <div class="message-icon" :style="{ color: typeMeta.color }">
      <component :is="typeMeta.icon" />
    </div>
    <div class="message-body">
      <div class="message-title-row">
        <span class="message-title">{{ message.title }}</span>
        <span class="message-sender">{{ message.sender.name }}</span>
      </div>
      <div class="message-content">{{ message.content }}</div>
      <div class="message-meta">
        <span class="message-time">{{ relativeTime }}</span>
        <a-link v-if="message.related_resource" @click.stop="handleViewDetail">查看详情</a-link>
        <a-link v-if="showReplyEntry" @click.stop="replyVisible = !replyVisible">回复</a-link>
      </div>
      <div v-if="replyVisible" class="message-reply" @click.stop>
        <a-textarea
          v-model="replyContent"
          placeholder="回复内容"
          :max-length="2000"
          :auto-size="{ minRows: 2, maxRows: 4 }"
        />
        <a-button type="primary" size="mini" :loading="replying" @click="handleReplySubmit">发送</a-button>
      </div>
    </div>
    <a-button class="message-delete" type="text" size="small" @click.stop="handleDelete">
      <template #icon><icon-delete /></template>
    </a-button>
  </div>
</template>

<script setup lang="ts">
/**
 * 单条消息行（管理后台收件箱列表项）
 *
 * 点击行体标记已读并（若有关联资源）跳转；点击关联资源若目标已不存在，
 * 由调用方（MessageDrawer）在跳转失败时展示"资源已不存在"提示（对齐 FR-017/M2 修复）。
 */
import { ref, computed } from "vue";
import { Message as MessageToast } from "@arco-design/web-vue";
import type { MessageListItem, MessageType } from "@common/message/message.interface";

const props = defineProps<{ message: MessageListItem; isAdmin?: boolean }>();
const emit = defineEmits<{
  (e: "read", id: string): void;
  (e: "delete", id: string): void;
  (e: "view-detail", message: MessageListItem): void;
  (e: "click-message", message: MessageListItem): void;
  (e: "reply", payload: { messageId: string; content: string }): void;
}>();

/** 仅管理员可对用户-管理员通信类消息回复 */
const showReplyEntry = computed(() => props.isAdmin && props.message.type === "user_admin_comm");
const replyVisible = ref(false);
const replyContent = ref("");
const replying = ref(false);

/** 消息类型 → 图标/颜色映射，对齐参考文档 §8.3 */
const TYPE_META: Record<MessageType, { icon: string; color: string }> = {
  operation_notify: { icon: "icon-check-circle", color: "rgb(var(--blue-6))" },
  template_like: { icon: "icon-star", color: "rgb(var(--pink-6))" },
  survey_lifecycle: { icon: "icon-calendar", color: "rgb(var(--green-6))" },
  user_admin_comm: { icon: "icon-message", color: "rgb(var(--orange-6))" },
  admin_broadcast: { icon: "icon-sound", color: "rgb(var(--red-6))" }
};

const typeMeta = computed(() => TYPE_META[props.message.type]);

const relativeTime = computed(() => formatRelativeTime(props.message.created_at));

/** 轻量相对时间格式化，不引入 dayjs 等新依赖 */
function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "刚刚";
  if (diffMin < 60) return `${diffMin} 分钟前`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} 小时前`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 30) return `${diffDay} 天前`;
  return new Date(iso).toLocaleDateString();
}

function handleClick() {
  // 点击消息行：打开详情弹窗 + 未读时自动标记已读
  emit("click-message", props.message);
  if (!props.message.is_read) emit("read", props.message.id);
}

function handleDelete() {
  emit("delete", props.message.id);
}

function handleViewDetail() {
  if (!props.message.related_resource_id) {
    MessageToast.warning("资源已不存在");
    return;
  }
  emit("view-detail", props.message);
}

function handleReplySubmit() {
  if (!replyContent.value.trim()) {
    MessageToast.warning("请输入回复内容");
    return;
  }
  replying.value = true;
  emit("reply", { messageId: props.message.id, content: replyContent.value.trim() });
  replyContent.value = "";
  replyVisible.value = false;
  replying.value = false;
}
</script>

<style scoped>
.message-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.message-item:hover {
  background-color: var(--color-fill-2);
}

.message-item.unread .message-title {
  font-weight: 600;
}

.message-icon {
  flex-shrink: 0;
  font-size: 20px;
  margin-top: 2px;
}

.message-body {
  flex: 1;
  min-width: 0;
}

.message-title-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.message-title {
  font-size: 14px;
  color: var(--color-text-1);
}

.message-sender {
  font-size: 12px;
  color: var(--color-text-3);
}

.message-content {
  margin-top: 4px;
  font-size: 13px;
  color: var(--color-text-2);
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.message-meta {
  margin-top: 6px;
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 12px;
  color: var(--color-text-3);
}

.message-reply {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: flex-end;
}

.message-delete {
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 0.2s;
}

.message-item:hover .message-delete {
  opacity: 1;
}

.message-unread-dot {
  flex-shrink: 0;
  width: 8px;
  height: 8px;
  margin-top: 7px;
  border-radius: 50%;
  background-color: rgb(var(--red-6));
  opacity: 0;
  transition: opacity 0.2s ease;

  &.dot-visible {
    opacity: 1;
  }
}
</style>
