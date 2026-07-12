/**
 * useAnalyticsFilters 组合式函数测试
 *
 * 覆盖：默认值、筛选项变化时的响应式行为
 */
import { describe, it, expect, afterEach } from "vitest";
import { useAnalyticsFilters } from "@/composables/useAnalyticsFilters";

afterEach(() => {
  // 该组合式函数使用模块级单例状态，测试之间需要还原默认值，避免相互污染
  const { filters } = useAnalyticsFilters();
  filters.range = "24h";
  filters.appId = undefined;
  filters.environment = "production";
});

describe("useAnalyticsFilters", () => {
  it("默认值为 range=24h、appId=undefined、environment=production", () => {
    const { filters } = useAnalyticsFilters();
    expect(filters.range).toBe("24h");
    expect(filters.appId).toBeUndefined();
    expect(filters.environment).toBe("production");
  });

  it("setRange 更新 range 且对所有调用方可见（单例共享状态）", () => {
    const first = useAnalyticsFilters();
    const second = useAnalyticsFilters();

    first.setRange("7d");

    expect(second.filters.range).toBe("7d");
  });

  it("setAppId 更新 appId", () => {
    const { filters, setAppId } = useAnalyticsFilters();
    setAppId("q-editor");
    expect(filters.appId).toBe("q-editor");
  });

  it("setEnvironment 更新 environment", () => {
    const { filters, setEnvironment } = useAnalyticsFilters();
    setEnvironment("staging");
    expect(filters.environment).toBe("staging");
  });
});
