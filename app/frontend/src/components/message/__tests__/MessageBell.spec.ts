/**
 * MessageBell 组件测试（管理后台）
 *
 * 覆盖：未读数展示、点击触发 click 事件、轮询启动/停止
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import ArcoVue from "@arco-design/web-vue";
import ArcoVueIcon from "@arco-design/web-vue/es/icon";
import MessageBell from "@/components/message/MessageBell.vue";
import { getUnreadCount } from "@/api/modules/message";

vi.mock("@/api/modules/message", () => ({
  getUnreadCount: vi.fn()
}));

function mountBell() {
  return mount(MessageBell, {
    global: { plugins: [ArcoVue, ArcoVueIcon] }
  });
}

describe("MessageBell", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.mocked(getUnreadCount).mockReset().mockResolvedValue({
      code: 0,
      msg: "ok",
      data: {
        unread_total: 3,
        by_type: { operation_notify: 3, template_like: 0, survey_lifecycle: 0, user_admin_comm: 0, admin_broadcast: 0 }
      }
    });
  });

  it("挂载后拉取未读计数并展示", async () => {
    const wrapper = mountBell();
    await flushPromises();

    expect(wrapper.text()).toContain("3");
  });

  it("点击铃铛触发 click 事件", async () => {
    const wrapper = mountBell();
    await flushPromises();

    await wrapper.find("button").trigger("click");

    expect(wrapper.emitted("click")).toBeTruthy();
  });
});

describe("MessageBell — 轮询定时器清理", () => {
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
