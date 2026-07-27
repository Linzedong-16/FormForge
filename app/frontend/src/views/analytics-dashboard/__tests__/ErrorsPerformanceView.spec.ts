/**
 * ErrorsPerformanceView 组件测试
 *
 * 覆盖：错误排行渲染、共享筛选状态变化时重新请求错误数据；
 * 性能百分位渲染、切换指标（含新增 editor_load/editor_save）时重新请求性能数据
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import ArcoVue, { Select } from "@arco-design/web-vue";
import ArcoVueIcon from "@arco-design/web-vue/es/icon";
import ErrorsPerformanceView from "@/views/analytics-dashboard/ErrorsPerformanceView.vue";
import { getErrors, getTrend, getPerformance } from "@/api/modules/analytics";
import { useAnalyticsFilters } from "@/composables/useAnalyticsFilters";

vi.mock("@/api/modules/analytics", () => ({
  getErrors: vi.fn(),
  getTrend: vi.fn(),
  getPerformance: vi.fn()
}));

// vue-echarts 依赖 ResizeObserver/canvas，jsdom 不支持，测试中用轻量占位组件替代
vi.mock("@/plugins/echarts", () => ({
  VChart: { template: "<div class=\"chart-stub\" />" }
}));

function mountPanel() {
  return mount(ErrorsPerformanceView, {
    global: { plugins: [ArcoVue, ArcoVueIcon] }
  });
}

describe("ErrorsPerformanceView — 错误排行", () => {
  let wrapper: ReturnType<typeof mountPanel> | undefined;

  beforeEach(() => {
    vi.mocked(getErrors).mockReset();
    vi.mocked(getTrend).mockReset();
    vi.mocked(getPerformance).mockReset().mockResolvedValue({
      code: 0,
      msg: "ok",
      data: { metric: "lcp", current: { p50: 1, p75: 1, p95: 1, p99: 1, avg: 1, sample_count: 1 }, trend_points: [] }
    });
  });

  afterEach(() => {
    wrapper?.unmount();
    wrapper = undefined;
    const { filters } = useAnalyticsFilters();
    filters.range = "24h";
    filters.appId = undefined;
    filters.environment = "production";
  });

  it("渲染排名结果，并展示受影响会话数字段", async () => {
    vi.mocked(getErrors).mockResolvedValue({
      code: 0,
      msg: "ok",
      data: {
        total_count: 1,
        errors: [
          {
            error_group_key: "g1",
            error_type: "js_error",
            error_message: "Cannot read properties of undefined",
            count: 42,
            affected_users: 5,
            affected_sessions: 8,
            first_seen: "2026-07-01T00:00:00Z",
            last_seen: "2026-07-09T00:00:00Z"
          }
        ]
      }
    });
    vi.mocked(getTrend).mockResolvedValue({ code: 0, msg: "ok", data: { metric: "errors", granularity: "hour", points: [] } });

    wrapper = mountPanel();
    await flushPromises();

    expect(wrapper.text()).toContain("js_error");
    expect(wrapper.text()).toContain("42");
    expect(wrapper.text()).toContain("8");
  });

  it("共享筛选状态变化时重新请求错误数据", async () => {
    vi.mocked(getErrors).mockResolvedValue({ code: 0, msg: "ok", data: { total_count: 0, errors: [] } });
    vi.mocked(getTrend).mockResolvedValue({ code: 0, msg: "ok", data: { metric: "errors", granularity: "hour", points: [] } });

    wrapper = mountPanel();
    await flushPromises();
    expect(getErrors).toHaveBeenCalledTimes(1);

    const { filters } = useAnalyticsFilters();
    filters.range = "7d";
    await flushPromises();

    expect(getErrors).toHaveBeenCalledTimes(2);
    expect(getErrors).toHaveBeenLastCalledWith(expect.objectContaining({ range: "7d" }));
  });
});

describe("ErrorsPerformanceView — 性能百分位", () => {
  let wrapper: ReturnType<typeof mountPanel> | undefined;

  beforeEach(() => {
    vi.mocked(getErrors).mockReset().mockResolvedValue({ code: 0, msg: "ok", data: { total_count: 0, errors: [] } });
    vi.mocked(getTrend).mockReset().mockResolvedValue({ code: 0, msg: "ok", data: { metric: "errors", granularity: "hour", points: [] } });
    vi.mocked(getPerformance).mockReset();
  });

  afterEach(() => {
    wrapper?.unmount();
    wrapper = undefined;
    const { filters } = useAnalyticsFilters();
    filters.range = "24h";
    filters.appId = undefined;
    filters.environment = "production";
  });

  it("渲染百分位汇总，包含平均值与样本数", async () => {
    vi.mocked(getPerformance).mockResolvedValue({
      code: 0,
      msg: "ok",
      data: {
        metric: "lcp",
        current: { p50: 800, p75: 1100, p95: 1800, p99: 2400, avg: 950, sample_count: 120 },
        trend_points: []
      }
    });

    wrapper = mountPanel();
    await flushPromises();

    expect(wrapper.text()).toContain("800");
    expect(wrapper.text()).toContain("1800");
    expect(wrapper.text()).toContain("950");
    expect(wrapper.text()).toContain("120");
  });

  it("切换到新增的 editor_load 指标时重新请求", async () => {
    vi.mocked(getPerformance).mockResolvedValue({
      code: 0,
      msg: "ok",
      data: { metric: "lcp", current: { p50: 1, p75: 1, p95: 1, p99: 1, avg: 1, sample_count: 1 }, trend_points: [] }
    });

    wrapper = mountPanel();
    await flushPromises();
    expect(getPerformance).toHaveBeenCalledWith(expect.objectContaining({ metric: "lcp" }));

    await wrapper.findComponent(Select).vm.$emit("update:modelValue", "editor_load");
    await flushPromises();

    expect(getPerformance).toHaveBeenLastCalledWith(expect.objectContaining({ metric: "editor_load" }));
  });
});
