/**
 * 消息未读计数状态管理 (Pinia Store)
 *
 * 职责：
 *  - 30 秒轮询未读消息计数（对齐 SC-001/SC-002 的"数十秒级可接受延迟"假设，
 *    不快于后端未读计数缓存 TTL，避免产生无意义请求）
 *  - 轮询失败保留旧数据，不打断用户查看（对齐 analytics-dashboard 面板的既有轮询哲学）
 *  - 生命周期管理：startPolling/stopPolling，供 MessageBell 在 onMounted/onUnmounted 中调用
 *
 * 选型说明（对齐 research.md §6）：未读计数需要跨组件共享、且需要跨越"消息相关页面"
 * 之外的整个应用会话持续轮询（只要顶部导航栏挂载着），因此使用 Pinia store 而非
 * useAnalyticsFilters.ts 那种局限于单个页面生命周期的模块级单例 composable。
 */
import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { getUnreadCount } from "@/api/modules/message";
import type { MessageType } from "@common/message/message.interface";

const POLL_INTERVAL_MS = 30_000;

export const useMessageStore = defineStore("message", () => {
  const unreadTotal = ref(0);
  const unreadByType = ref<Partial<Record<MessageType, number>>>({});
  let pollTimer: ReturnType<typeof setInterval> | undefined;

  const hasUnread = computed(() => unreadTotal.value > 0);
  /** 徽标展示文案：超过 99 显示 "99+"，对齐 spec.md 边界情况 */
  const badgeText = computed(() => (unreadTotal.value > 99 ? "99+" : String(unreadTotal.value)));

  async function fetchUnreadCount(): Promise<void> {
    try {
      const res = await getUnreadCount();
      if (res.code === 0 && res.data) {
        unreadTotal.value = res.data.unread_total;
        unreadByType.value = res.data.by_type;
      }
    } catch {
      // 轮询失败保留上一次的展示数据，不打断用户查看，下一轮再重试
    }
  }

  function startPolling(): void {
    if (pollTimer) return;
    fetchUnreadCount();
    pollTimer = setInterval(fetchUnreadCount, POLL_INTERVAL_MS);
  }

  function stopPolling(): void {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = undefined;
    }
  }

  return {
    unreadTotal,
    unreadByType,
    hasUnread,
    badgeText,
    fetchUnreadCount,
    startPolling,
    stopPolling
  };
});
