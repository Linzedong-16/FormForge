<template>
  <!-- 消息通知：popover 下拉框，trigger=click（对齐既有 ReviewNotice.vue 的实现模式） -->
  <el-popover
    placement="bottom-end"
    trigger="click"
    :width="400"
    :show-arrow="false"
    :offset="10"
    popper-class="message-bell-popover"
    @show="onPopoverShow"
  >
    <template #reference>
      <el-badge :value="unreadTotalDisplay" :hidden="messageStore.unreadTotal === 0" class="message-bell-trigger">
        <el-button :icon="Bell" circle size="small" title="消息" />
      </el-badge>
    </template>

    <div class="message-bell-panel">
      <div class="panel-header">
        <span class="panel-title">消息</span>
        <div>
          <el-button v-if="!userStore.isSuperAdmin" text type="primary" size="small" @click="composeVisible = true"
            >联系管理员</el-button
          >
          <el-button
            text
            type="primary"
            size="small"
            :disabled="items.length === 0"
            :loading="markingAllRead"
            @click="handleMarkAllRead"
          >
            全部已读
          </el-button>
        </div>
      </div>
      <div class="panel-divider"></div>

      <div v-if="loading" class="panel-loading">
        <el-icon class="loading-icon"><Loading /></el-icon>
        <span>加载中...</span>
      </div>

      <div v-else-if="loadError" class="panel-loading">
        <span>{{ loadError }}</span>
        <el-button text type="primary" size="small" @click="loadMessages">重试</el-button>
      </div>

      <div v-else-if="items.length === 0" class="panel-empty">
        <el-icon class="empty-icon"><Document /></el-icon>
        <span>暂无消息</span>
      </div>

      <div v-else class="message-list">
        <div
          v-for="item in items"
          :key="item.id"
          class="message-row"
          :class="{ unread: !item.is_read }"
          @click="handleRowClick(item)"
        >
          <span class="message-row-dot" :class="{ 'dot-hidden': item.is_read }"></span>
          <el-icon class="message-row-icon" :style="{ color: TYPE_META[item.type].color }">
            <component :is="TYPE_META[item.type].icon" />
          </el-icon>
          <div class="message-row-body">
            <div class="message-row-title">{{ item.title }}</div>
            <div class="message-row-content">{{ item.content }}</div>
          </div>
          <el-button class="message-row-delete" text size="small" :icon="Delete" @click.stop="handleDelete(item.id)" />
        </div>
      </div>
    </div>
  </el-popover>

  <!-- 消息详情弹窗 -->
  <el-dialog
    v-model="detailVisible"
    :title="detailMessage?.title || '消息详情'"
    width="480px"
    @close="detailMessage = null"
  >
    <template v-if="detailMessage">
      <div class="detail-meta">
        <el-tag :type="detailTagType" size="small">{{ detailTypeLabel }}</el-tag>
        <span class="detail-sender">{{ detailMessage.sender.name }}</span>
        <span class="detail-time">{{ detailMessage.created_at }}</span>
      </div>
      <div class="detail-content">{{ detailMessage.content }}</div>
      <div v-if="detailMessage.related_resource" class="detail-related">
        <span>关联资源：</span>
        <el-link type="primary" :underline="false">{{ detailMessage.related_resource }}</el-link>
      </div>
    </template>
  </el-dialog>

  <!-- 联系管理员 -->
  <el-dialog v-model="composeVisible" title="联系管理员" width="420px" @close="composeContent = ''">
    <el-input
      v-model="composeContent"
      type="textarea"
      :rows="4"
      maxlength="2000"
      show-word-limit
      placeholder="请描述您的问题或建议（1-2000 字）"
    />
    <template #footer>
      <el-button @click="composeVisible = false">取消</el-button>
      <el-button type="primary" :loading="composing" @click="handleSendMessage">发送</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
/**
 * 消息铃铛（问卷编辑器顶部导航）
 *
 * 与 frontend 侧逻辑一致（30 秒轮询未读计数），UI 风格对齐既有 ReviewNotice.vue
 * （Element Plus el-popover + el-badge），不是 Arco 风格。
 */
import { ref, computed, onMounted, onUnmounted } from "vue";
import {
  Bell,
  Loading,
  Document,
  Delete,
  CircleCheck,
  Star,
  Calendar,
  ChatDotRound,
  Notification
} from "@element-plus/icons-vue";
import { ElMessage } from "element-plus";
import { getMessages, markMessageRead, markAllMessagesRead, deleteMessage, sendMessage } from "@/api/modules/message";
import { useMessageStore } from "@/stores/useMessage";
import { useUserStore } from "@/stores/useUser";
import type { MessageListItem, MessageType } from "@common/message/message.interface";

const messageStore = useMessageStore();
const userStore = useUserStore();

const TYPE_META: Record<MessageType, { icon: typeof Bell; color: string }> = {
  operation_notify: { icon: CircleCheck, color: "#409eff" },
  template_like: { icon: Star, color: "#e6a23c" },
  survey_lifecycle: { icon: Calendar, color: "#67c23a" },
  user_admin_comm: { icon: ChatDotRound, color: "#f56c6c" },
  admin_broadcast: { icon: Notification, color: "#f56c6c" }
};

const loading = ref(false);
const loadError = ref("");
const items = ref<MessageListItem[]>([]);
const markingAllRead = ref(false);

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

const unreadTotalDisplay = computed(() => (messageStore.unreadTotal > 99 ? "99+" : messageStore.unreadTotal));

/** 是否所有消息均已读（无消息时也算"无需操作"） */
const allRead = computed(() => items.value.length === 0 || items.value.every(i => i.is_read));

async function loadMessages() {
  loading.value = true;
  loadError.value = "";
  try {
    const res = await getMessages({ page: 1, page_size: 20 });
    if (res.code !== 0) throw new Error(res.msg || "加载失败");
    items.value = res.data?.items ?? [];
  } catch (err) {
    loadError.value = err instanceof Error ? err.message : "加载失败";
  } finally {
    loading.value = false;
  }
}

function onPopoverShow() {
  loadMessages();
}

async function handleRowClick(item: MessageListItem) {
  // 打开详情弹窗
  detailMessage.value = { ...item };
  detailVisible.value = true;

  // 未读消息自动标记已读
  if (!item.is_read) {
    try {
      await markMessageRead(item.id);
      item.is_read = true;
      messageStore.fetchUnreadCount();
    } catch {
      // 标记失败不影响详情查看
    }
  }
}

/** detail 弹窗中展示的 tag 类型 */
const detailTagType = computed(() => {
  if (!detailMessage.value) return "";
  if (detailMessage.value.type === "user_admin_comm" || detailMessage.value.type === "admin_broadcast")
    return "warning";
  if (detailMessage.value.type === "operation_notify") return "danger";
  return "success";
});

/** detail 弹窗中展示的类型标签文本 */
const detailTypeLabel = computed(() => {
  if (!detailMessage.value) return "";
  return TYPE_LABELS[detailMessage.value.type] || detailMessage.value.type;
});

async function handleMarkAllRead() {
  if (allRead.value) {
    ElMessage.info("没有未读消息");
    return;
  }
  markingAllRead.value = true;
  try {
    await markAllMessagesRead();
    items.value = items.value.map(i => ({ ...i, is_read: true }));
    messageStore.fetchUnreadCount();
    ElMessage.success("已全部标记为已读");
  } catch {
    ElMessage.error("操作失败");
  } finally {
    markingAllRead.value = false;
  }
}

async function handleDelete(id: string) {
  try {
    await deleteMessage(id);
    items.value = items.value.filter(i => i.id !== id);
    messageStore.fetchUnreadCount();
  } catch {
    ElMessage.error("删除失败");
  }
}

onMounted(() => {
  messageStore.startPolling();
});

onUnmounted(() => {
  messageStore.stopPolling();
});

// ── 联系管理员 ──────────────────────────────────────────────

const composeVisible = ref(false);
const composeContent = ref("");
const composing = ref(false);

async function handleSendMessage() {
  if (!composeContent.value.trim()) {
    ElMessage.warning("请输入内容");
    return;
  }
  composing.value = true;
  try {
    const res = await sendMessage({ content: composeContent.value.trim() });
    if (res.code !== 0) throw new Error(res.msg || "发送失败");
    ElMessage.success("已发送给管理员");
    composeContent.value = "";
    composeVisible.value = false;
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : "发送失败");
  } finally {
    composing.value = false;
  }
}
</script>

<style scoped lang="scss">
.message-bell-trigger {
  cursor: pointer;
}

.message-bell-panel {
  display: flex;
  flex-direction: column;
  max-height: 400px;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 6px 8px;
}

.panel-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--font-color);
}

.panel-divider {
  height: 1px;
  background-color: var(--border-color);
  margin: 0 0 4px;
}

.panel-loading,
.panel-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 32px 12px;
  font-size: 14px;
  color: var(--font-color-lighter);
}

.loading-icon {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.empty-icon {
  font-size: 28px;
  color: var(--font-color-lightest);
}

.message-list {
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}

.message-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 8px;
  border-radius: var(--border-radius-md);
  cursor: pointer;
  transition: background-color 0.15s ease;

  &:hover {
    background-color: var(--background-color);
  }
}

.message-row-dot {
  flex-shrink: 0;
  width: 8px;
  height: 8px;
  margin-top: 6px;
  border-radius: 50%;
  background-color: #f56c6c;
  transition: opacity 0.2s ease;

  &.dot-hidden {
    opacity: 0;
  }
}

.message-row.unread .message-row-title {
  font-weight: 600;
}

.message-row-icon {
  margin-top: 2px;
  flex-shrink: 0;
}

.message-row-body {
  flex: 1;
  min-width: 0;
}

.message-row-title {
  font-size: 13px;
  color: var(--font-color);
}

.message-row-content {
  font-size: 12px;
  color: var(--font-color-lighter);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.message-row-delete {
  flex-shrink: 0;
}

// ── 消息详情弹窗 ────────────────────────────────

.detail-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  font-size: 13px;
  color: var(--font-color-lighter);
}

.detail-sender {
  color: var(--font-color);
}

.detail-time {
  margin-left: auto;
}

.detail-content {
  padding: 12px;
  background-color: var(--fill-color);
  border-radius: var(--border-radius-md);
  font-size: 14px;
  line-height: 1.8;
  color: var(--font-color);
  white-space: pre-wrap;
  word-break: break-word;
}

.detail-related {
  margin-top: 16px;
  font-size: 13px;
  color: var(--font-color-lighter);
}
</style>

<!-- 非 scoped：覆盖 el-popover 弹层，统一风格（对齐既有 ReviewNotice.vue） -->
<style lang="scss">
.message-bell-popover.el-popover.el-popper {
  padding: 6px;
  border-radius: var(--border-radius-lg);
  box-shadow: var(--el-box-shadow);
  border: 1px solid var(--border-color);
}
</style>
