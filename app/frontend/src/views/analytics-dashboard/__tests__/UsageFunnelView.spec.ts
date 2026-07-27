/**
 * UsageFunnelView 组件测试
 *
 * 覆盖：模拟数据渲染趋势 + 漏斗、环境筛选变化时重新请求趋势数据（但不重新请求漏斗数据，
 * 因为漏斗接口不支持 environment 筛选，见 research.md §7）
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import ArcoVue from "@arco-design/web-vue";
import ArcoVueIcon from "@arco-design/web-vue/es/icon";
import UsageFunnelView from "@/views/analytics-dashboard/UsageFunnelView.vue";
import { getTrend, getFunnel } from "@/api/modules/analytics";
import { useAnalyticsFilters } from "@/composables/useAnalyticsFilters";

vi.mock("@/api/modules/analytics", () => ({
  getTrend: vi.fn(),
  getFunnel: vi.fn()
}));

// vue-echarts 依赖 ResizeObserver/canvas，jsdom 不支持，测试中用轻量占位组件替代
vi.mock("@/plugins/echarts", () => ({
  VChart: { template: "<div class=\"chart-stub\" />" }
}));

function mountPanel() {
  return mount(UsageFunnelView, {
    global: { plugins: [ArcoVue, ArcoVueIcon] }
  });
}

describe("UsageFunnelView", () => {
  let wrapper: ReturnType<typeof mountPanel> | undefined;

  beforeEach(() => {
    vi.mocked(getTrend).mockReset();
    vi.mocked(getFunnel).mockReset();
  });

  afterEach(() => {
    wrapper?.unmount();
    wrapper = undefined;
    const { filters } = useAnalyticsFilters();
    filters.range = "24h";
    filters.appId = undefined;
    filters.environment = "production";
  });

  it("渲染趋势与漏斗", async () => {
    vi.mocked(getTrend).mockResolvedValue({
      code: 0,
      msg: "ok",
      data: { metric: "pv", granularity: "hour", points: [{ time: "2026-07-09T00:00:00Z", value: 10 }] }
    });
    vi.mocked(getFunnel).mockResolvedValue({
      code: 0,
      msg: "ok",
      data: {
        funnel_name: "survey_creation",
        total_users: 50,
        steps: [{ name: "进入编辑器", event_name: "editor_enter", count: 50, rate: 100, prev_step_rate: 100 }]
      }
    });

    wrapper = mountPanel();
    await flushPromises();

    expect(wrapper.text()).toContain("汇总全部环境");
    expect(wrapper.text()).toContain("进入编辑器");
  });

  it("环境筛选变化时重新请求趋势数据，但不重新请求漏斗数据", async () => {
    vi.mocked(getTrend).mockResolvedValue({ code: 0, msg: "ok", data: { metric: "pv", granularity: "hour", points: [] } });
    vi.mocked(getFunnel).mockResolvedValue({
      code: 0,
      msg: "ok",
      data: { funnel_name: "survey_creation", total_users: 0, steps: [] }
    });

    wrapper = mountPanel();
    await flushPromises();
    const trendCallsBefore = vi.mocked(getTrend).mock.calls.length;
    const funnelCallsBefore = vi.mocked(getFunnel).mock.calls.length;

    const { filters } = useAnalyticsFilters();
    filters.environment = "staging";
    await flushPromises();

    expect(vi.mocked(getTrend).mock.calls.length).toBeGreaterThan(trendCallsBefore);
    expect(vi.mocked(getFunnel).mock.calls.length).toBe(funnelCallsBefore);
  });
});
