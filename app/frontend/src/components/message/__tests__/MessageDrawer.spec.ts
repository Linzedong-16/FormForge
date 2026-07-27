/**
 * MessageDrawer 组件测试（管理后台）
 *
 * 覆盖：列表渲染、空状态、标记已读、删除、全部已读
 *
 * 说明：a-drawer 内部通过 Teleport 渲染到 document.body，@vue/test-utils 的
 * wrapper.find()/text() 不会遍历 Teleport 目标之外的节点，因此本文件统一改为
 * 直接查询 document.body（对齐 Vue 官方文档对 Teleport 组件的测试建议）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createRouter, createWebHistory } from "vue-router";
import ArcoVue from "@arco-design/web-vue";
import ArcoVueIcon from "@arco-design/web-vue/es/icon";
import MessageDrawer from "@/components/message/MessageDrawer.vue";
import { getMessages, markMessageRead, markAllMessagesRead, deleteMessage } from "@/api/modules/message";

vi.mock("@/api/modules/message", () => ({
  getMessages: vi.fn(),
  markMessageRead: vi.fn(),
  markAllMessagesRead: vi.fn(),
  deleteMessage: vi.fn()
}));

const router = createRouter({ history: createWebHistory(), routes: [{ path: "/", component: { template: "<div/>" } }] });

function mountDrawer(visible = true) {
  return mount(MessageDrawer, {
    props: { visible },
    attachTo: document.body,
    global: { plugins: [ArcoVue, ArcoVueIcon, router] }
  });
}

/** 创建独立的 mock 消息对象，避免测试间因引用共享导致的数据污染 */
function mockItem(overrides: Partial<{
  id: string;
  type: "operation_notify";
  title: string;
  content: string;
  is_read: boolean;
}> = {}) {
  return {
    id: "1",
    type: "operation_notify" as const,
    title: "问卷审核通过",
    content: "您的问卷已通过审核",
    sender: { id: null as string | null, name: "系统通知" },
    is_read: false,
    related_resource: null as string | null,
    related_resource_id: null as string | null,
    created_at: "2026-07-01T00:00:00.000Z",
    read_at: null as string | null,
    ...overrides
  };
}

describe("MessageDrawer", () => {
  let wrapper: ReturnType<typeof mountDrawer> | undefined;

  beforeEach(() => {
    setActivePinia(createPinia());
    vi.mocked(getMessages).mockReset();
    vi.mocked(markMessageRead).mockReset();
    vi.mocked(markAllMessagesRead).mockReset();
    vi.mocked(deleteMessage).mockReset();
  });

  afterEach(() => {
    wrapper?.unmount();
    wrapper = undefined;
    document.body.innerHTML = "";
  });

  it("展示消息列表", async () => {
    vi.mocked(getMessages).mockResolvedValue({
      code: 0,
      msg: "ok",
      data: { items: [mockItem()], total: 1, page: 1, page_size: 20, total_pages: 1 }
    });

    wrapper = mountDrawer();
    await flushPromises();

    expect(document.body.textContent).toContain("问卷审核通过");
  });

  it("空列表展示暂无消息", async () => {
    vi.mocked(getMessages).mockResolvedValue({
      code: 0,
      msg: "ok",
      data: { items: [], total: 0, page: 1, page_size: 20, total_pages: 0 }
    });

    wrapper = mountDrawer();
    await flushPromises();

    expect(document.body.textContent).toContain("暂无消息");
  });

  it("加载失败展示持久化错误态", async () => {
    vi.mocked(getMessages).mockRejectedValue(new Error("网络连接失败"));

    wrapper = mountDrawer();
    await flushPromises();

    expect(document.body.textContent).toContain("网络连接失败");
  });

  it("点击消息行标记已读", async () => {
    vi.mocked(getMessages).mockResolvedValue({
      code: 0,
      msg: "ok",
      data: { items: [mockItem()], total: 1, page: 1, page_size: 20, total_pages: 1 }
    });
    vi.mocked(markMessageRead).mockResolvedValue({ code: 0, msg: "ok", data: { id: "1", is_read: true, read_at: "" } });

    wrapper = mountDrawer();
    await flushPromises();

    const row = document.body.querySelector(".message-item");
    row?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flushPromises();

    expect(markMessageRead).toHaveBeenCalledWith("1");
  });

  it("全部已读按钮调用接口", async () => {
    vi.mocked(getMessages).mockResolvedValue({
      code: 0,
      msg: "ok",
      data: { items: [mockItem()], total: 1, page: 1, page_size: 20, total_pages: 1 }
    });
    vi.mocked(markAllMessagesRead).mockResolvedValue({ code: 0, msg: "ok", data: { marked_count: 1 } });

    wrapper = mountDrawer();
    await flushPromises();

    const buttons = Array.from(document.body.querySelectorAll("button"));
    const markAllBtn = buttons.find(b => b.textContent?.includes("全部已读"));
    markAllBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flushPromises();

    expect(markAllMessagesRead).toHaveBeenCalled();
  });

  it("删除按钮调用接口", async () => {
    vi.mocked(getMessages).mockResolvedValue({
      code: 0,
      msg: "ok",
      data: { items: [mockItem()], total: 1, page: 1, page_size: 20, total_pages: 1 }
    });
    vi.mocked(deleteMessage).mockResolvedValue({ code: 0, msg: "ok", data: { id: "1", deleted: true } });

    wrapper = mountDrawer();
    await flushPromises();

    const deleteBtn = document.body.querySelector(".message-delete");
    deleteBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flushPromises();

    expect(deleteMessage).toHaveBeenCalledWith("1");
  });
});
