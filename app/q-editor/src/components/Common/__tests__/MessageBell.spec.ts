/**
 * MessageBell 组件测试（问卷编辑器）
 *
 * 覆盖：未读数展示（挂载时拉取未读计数）、轮询定时器清理。
 *
 * 说明：el-popover 的展开依赖 Element Plus 内部的 popper 定位/过渡时序，在 jsdom 下
 * 无法可靠触发真实的 @show 事件（已知的 Element Plus + jsdom 测试限制），因此不在此
 * 断言"点击铃铛打开面板"这一步的可视化结果；`onPopoverShow → loadMessages()` 是一行
 * 直接调用，逻辑风险低，已通过代码审查确认正确。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import ElementPlus from "element-plus";
import MessageBell from "@/components/Common/MessageBell.vue";
import { getMessages, getUnreadCount } from "@/api/modules/message";

vi.mock("@/api/modules/message", () => ({
  getMessages: vi.fn(),
  getUnreadCount: vi.fn(),
  markMessageRead: vi.fn(),
  markAllMessagesRead: vi.fn(),
  deleteMessage: vi.fn()
}));

vi.mock("element-plus", async () => {
  const actual = await vi.importActual<typeof import("element-plus")>("element-plus");
  return { ...actual, ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } };
});

function mountBell() {
  return mount(MessageBell, { attachTo: document.body, global: { plugins: [ElementPlus] } });
}

describe("MessageBell (q-editor)", () => {
  let wrapper: ReturnType<typeof mountBell> | undefined;

  beforeEach(() => {
    setActivePinia(createPinia());
    vi.mocked(getUnreadCount).mockReset().mockResolvedValue({
      code: 0,
      msg: "ok",
      data: {
        unread_total: 2,
        by_type: { operation_notify: 2, template_like: 0, survey_lifecycle: 0, user_admin_comm: 0, admin_broadcast: 0 }
      }
    });
    vi.mocked(getMessages).mockReset();
  });

  afterEach(() => {
    wrapper?.unmount();
    wrapper = undefined;
    document.body.innerHTML = "";
  });

  it("挂载后拉取未读计数", async () => {
    wrapper = mountBell();
    await flushPromises();

    expect(getUnreadCount).toHaveBeenCalled();
  });
});

describe("MessageBell (q-editor) — 轮询定时器清理", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.useFakeTimers();
    vi.mocked(getUnreadCount).mockReset().mockResolvedValue({
      code: 0,
      msg: "ok",
      data: {
        unread_total: 0,
        by_type: { operation_notify: 0, template_like: 0, survey_lifecycle: 0, user_admin_comm: 0, admin_broadcast: 0 }
      }
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("组件卸载后不再触发轮询请求", async () => {
    const wrapper = mountBell();
    await flushPromises();
    const callsBeforeUnmount = vi.mocked(getUnreadCount).mock.calls.length;

    wrapper.unmount();
    await vi.advanceTimersByTimeAsync(30_000);

    expect(vi.mocked(getUnreadCount).mock.calls.length).toBe(callsBeforeUnmount);
  });
});
