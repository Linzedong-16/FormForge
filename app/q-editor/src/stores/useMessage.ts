/**
 * 消息未读计数状态管理 (Pinia Store)
 *
 * 与 frontend 侧 store/modules/message.ts 逻辑一致（30 秒轮询、失败保留旧数据），
 * 各自独立轮询、独立维护 Pinia store 实例，不依赖 qiankun globalState
 * （对齐 research.md §7：两个应用当前本就相互隔离，消息未读数不引入新的强耦合）。
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
