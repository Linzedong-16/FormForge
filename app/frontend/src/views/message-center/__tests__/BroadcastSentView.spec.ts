/**
 * BroadcastSentView 组件测试（消息中心 —— 已发送广播）
 *
 * 覆盖：列表渲染、发布广播表单提交、分页翻页
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import ArcoVue from "@arco-design/web-vue";
import ArcoVueIcon from "@arco-design/web-vue/es/icon";
import BroadcastSentView from "@/views/message-center/BroadcastSentView.vue";
import { getSentBroadcasts, broadcastMessage } from "@/api/modules/message-admin";

vi.mock("@/api/modules/message-admin", () => ({
  getSentBroadcasts: vi.fn(),
  broadcastMessage: vi.fn()
}));

function mountView() {
  return mount(BroadcastSentView, {
    attachTo: document.body,
    global: { plugins: [ArcoVue, ArcoVueIcon] }
  });
}

const MOCK_BROADCAST = {
  id: "9200",
  title: "系统维护通知",
  content: "今晚 22:00-23:00 系统维护",
  target_role: "all" as const,
  estimated_recipients: 486,
  created_at: "2026-07-01T00:00:00.000Z"
};

describe("BroadcastSentView", () => {
  let wrapper: ReturnType<typeof mountView> | undefined;

  beforeEach(() => {
    vi.mocked(getSentBroadcasts).mockReset();
    vi.mocked(broadcastMessage).mockReset();
  });

  afterEach(() => {
    wrapper?.unmount();
    wrapper = undefined;
    document.body.innerHTML = "";
  });

  it("展示已发送广播列表", async () => {
    vi.mocked(getSentBroadcasts).mockResolvedValue({
      code: 0,
      msg: "ok",
      data: { items: [MOCK_BROADCAST], total: 1, page: 1, page_size: 20 }
    });

    wrapper = mountView();
    await flushPromises();

    expect(document.body.textContent).toContain("系统维护通知");
    expect(document.body.textContent).toContain("486");
  });

  it("点击发布广播按钮弹出表单并提交", async () => {
    vi.mocked(getSentBroadcasts).mockResolvedValue({
      code: 0,
      msg: "ok",
      data: { items: [], total: 0, page: 1, page_size: 20 }
    });
    vi.mocked(broadcastMessage).mockResolvedValue({ code: 0, msg: "ok", data: { id: "9201", estimated_recipients: 100 } });

    wrapper = mountView();
    await flushPromises();

    const publishBtn = Array.from(document.body.querySelectorAll("button")).find(b =>
      b.textContent?.includes("发布广播")
    );
    publishBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flushPromises();

    const titleInput = document.body.querySelector("input[placeholder='请输入广播标题（1-200 字）']") as HTMLInputElement;
    const contentTextarea = document.body.querySelector("textarea") as HTMLTextAreaElement;
    titleInput.value = "标题";
    titleInput.dispatchEvent(new Event("input"));
    contentTextarea.value = "内容";
    contentTextarea.dispatchEvent(new Event("input"));
    await flushPromises();

    const okBtn = Array.from(document.body.querySelectorAll(".arco-modal button")).find(b =>
      b.textContent?.includes("确定")
    );
    okBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flushPromises();

    expect(broadcastMessage).toHaveBeenCalledWith({ title: "标题", content: "内容", target_role: "all" });
  });

  it("分页切换重新加载列表", async () => {
    vi.mocked(getSentBroadcasts).mockResolvedValue({
      code: 0,
      msg: "ok",
      data: { items: [MOCK_BROADCAST], total: 40, page: 1, page_size: 20 }
    });

    wrapper = mountView();
    await flushPromises();
    vi.mocked(getSentBroadcasts).mockClear();

    const nextBtn = document.body.querySelector(".arco-pagination-item-next") as HTMLElement;
    nextBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flushPromises();

    expect(getSentBroadcasts).toHaveBeenCalledWith({ page: 2, page_size: 20 });
  });
});
