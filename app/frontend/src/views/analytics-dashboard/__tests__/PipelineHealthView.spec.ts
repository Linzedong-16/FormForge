/**
 * PipelineHealthView 组件测试
 *
 * 覆盖：就绪态渲染各服务连通状态、总体异常时状态标签变红、请求失败渲染错误态、
 * 组件卸载时清除轮询定时器
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import ArcoVue from "@arco-design/web-vue";
import ArcoVueIcon from "@arco-design/web-vue/es/icon";
import PipelineHealthView from "@/views/analytics-dashboard/PipelineHealthView.vue";
import { getHealthStatus } from "@/api/modules/admin";

vi.mock("@/api/modules/admin", () => ({
  getHealthStatus: vi.fn()
}));

function mountPanel() {
  return mount(PipelineHealthView, {
    global: { plugins: [ArcoVue, ArcoVueIcon] }
  });
}

describe("PipelineHealthView", () => {
  let wrapper: VueWrapper | undefined;

  beforeEach(() => {
    vi.mocked(getHealthStatus).mockReset();
  });

  afterEach(() => {
    // 及时卸载，避免残留的轮询定时器影响后续测试（尤其是假定时器测试块的 clearInterval 计数）
    wrapper?.unmount();
    wrapper = undefined;
  });

  it("有数据时渲染各依赖服务的连通状态", async () => {
    vi.mocked(getHealthStatus).mockResolvedValue({
      code: 0,
      msg: "ok",
      data: {
        status: "ok",
        uptime: 3725,
        checks: {
          postgres: { ok: true, latency_ms: 5 },
          redis: { ok: true, latency_ms: 1 },
          rabbitmq: { ok: true, latency_ms: 3 },
          minio: { ok: true, latency_ms: 2 },
          mongodb: { ok: true, latency_ms: 4 },
          clickhouse: { ok: true, latency_ms: 8 }
        }
      }
    });

    wrapper = mountPanel();
    await flushPromises();

    expect(wrapper.text()).toContain("PostgreSQL");
    expect(wrapper.text()).toContain("ClickHouse");
    expect(wrapper.text()).toContain("正常");
    expect(wrapper.text()).toContain("1h 2m");
  });

  it("部分服务异常时展示错误信息与异常标签（后端 degraded 时 code=500 但仍带数据）", async () => {
    vi.mocked(getHealthStatus).mockResolvedValue({
      code: 500,
      msg: "部分服务异常",
      data: {
        status: "degraded",
        uptime: 60,
        checks: {
          postgres: { ok: true, latency_ms: 5 },
          clickhouse: { ok: false, error: "连接超时" }
        }
      }
    });

    wrapper = mountPanel();
    await flushPromises();

    expect(wrapper.text()).toContain("部分异常");
    expect(wrapper.text()).toContain("异常");
    expect(wrapper.text()).toContain("连接超时");
  });

  it("请求失败渲染持久化错误态", async () => {
    vi.mocked(getHealthStatus).mockRejectedValue(new Error("网络连接失败"));

    wrapper = mountPanel();
    await flushPromises();

    expect(wrapper.text()).toContain("网络连接失败");
  });
});

describe("PipelineHealthView — 轮询定时器清理", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(getHealthStatus).mockReset().mockResolvedValue({
      code: 0,
      msg: "ok",
      data: { status: "ok", uptime: 0, checks: { postgres: { ok: true, latency_ms: 1 } } }
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("组件卸载后不再触发轮询请求", async () => {
    const wrapper = mountPanel();
    await flushPromises();
    const callsBeforeUnmount = vi.mocked(getHealthStatus).mock.calls.length;

    wrapper.unmount();
    await vi.advanceTimersByTimeAsync(30_000);

    // 卸载后定时器应已清除，不应再产生新的轮询请求
    expect(vi.mocked(getHealthStatus).mock.calls.length).toBe(callsBeforeUnmount);
  });
});
