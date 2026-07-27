/**
 * OverviewView 组件测试
 *
 * 覆盖：就绪态渲染、全 0 响应渲染空态、请求失败渲染错误态、
 * 组件卸载时清除轮询定时器
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import ArcoVue from "@arco-design/web-vue";
import ArcoVueIcon from "@arco-design/web-vue/es/icon";
import OverviewView from "@/views/analytics-dashboard/OverviewView.vue";
import { getOverview, getRealtime } from "@/api/modules/analytics";

vi.mock("@/api/modules/analytics", () => ({
  getOverview: vi.fn(),
  getRealtime: vi.fn()
}));

function mountPanel() {
  return mount(OverviewView, {
    global: { plugins: [ArcoVue, ArcoVueIcon] }
  });
}

describe("OverviewView", () => {
  beforeEach(() => {
    vi.mocked(getOverview).mockReset();
    vi.mocked(getRealtime).mockReset();
  });

  it("有数据时渲染就绪态", async () => {
    vi.mocked(getOverview).mockResolvedValue({
      code: 0,
      msg: "ok",
      data: {
        pv_today: 100,
        uv_today: 20,
        online_users: 3,
        surveys_created_today: 5,
        responses_today: 10,
        errors_today: 2,
        ai_usage_today: 1
      }
    });
    vi.mocked(getRealtime).mockResolvedValue({
      code: 0,
      msg: "ok",
      data: { online_users: 3, recent_pv: 4, recent_errors: 0, recent_api_avg_ms: 120 }
    });

    const wrapper = mountPanel();
    await flushPromises();

    expect(wrapper.text()).toContain("100");
    expect(wrapper.text()).toContain("汇总全部环境");
  });

  it("全 0 响应渲染暂无数据的空态", async () => {
    vi.mocked(getOverview).mockResolvedValue({
      code: 0,
      msg: "ok",
      data: {
        pv_today: 0,
        uv_today: 0,
        online_users: 0,
        surveys_created_today: 0,
        responses_today: 0,
        errors_today: 0,
        ai_usage_today: 0
      }
    });
    vi.mocked(getRealtime).mockResolvedValue({
      code: 0,
      msg: "ok",
      data: { online_users: 0, recent_pv: 0, recent_errors: 0, recent_api_avg_ms: 0 }
    });

    const wrapper = mountPanel();
    await flushPromises();

    expect(wrapper.text()).toContain("尚无数据");
  });

  it("请求失败渲染持久化错误态", async () => {
    vi.mocked(getOverview).mockRejectedValue(new Error("网络连接失败"));
    vi.mocked(getRealtime).mockResolvedValue({ code: 0, msg: "ok", data: null });

    const wrapper = mountPanel();
    await flushPromises();

    expect(wrapper.text()).toContain("网络连接失败");
  });
});

describe("OverviewView — 轮询定时器清理", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(getOverview).mockReset().mockResolvedValue({
      code: 0,
      msg: "ok",
      data: {
        pv_today: 1,
        uv_today: 1,
        online_users: 0,
        surveys_created_today: 0,
        responses_today: 0,
        errors_today: 0,
        ai_usage_today: 0
      }
    });
    vi.mocked(getRealtime).mockReset().mockResolvedValue({
      code: 0,
      msg: "ok",
      data: { online_users: 0, recent_pv: 0, recent_errors: 0, recent_api_avg_ms: 0 }
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("组件卸载时清除 30s/60s 轮询定时器", async () => {
    const clearSpy = vi.spyOn(global, "clearInterval");
    const wrapper = mountPanel();
    await flushPromises();

    wrapper.unmount();

    expect(clearSpy).toHaveBeenCalledTimes(2);
    clearSpy.mockRestore();
  });
});
