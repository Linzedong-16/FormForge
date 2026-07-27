/**
 * 埋点监控分析模块 API 测试
 *
 * 覆盖 getOverview/getRealtime（Foundational）、getErrors/getTrend（US2）、
 * getPerformance（US3，含新增 editor_load/editor_save 指标）、getFunnel（US4）
 */
import { describe, it, expect, vi } from "vitest";

const mockGet = vi.fn();

vi.mock("@/api/clients/server", () => ({
  default: {
    get: (...args: unknown[]) => mockGet(...args)
  }
}));

import { getOverview, getRealtime, getErrors, getTrend, getPerformance, getFunnel } from "@/api/modules/analytics";

describe("analytics API — 概览/实时", () => {
  it("getOverview() 请求 GET /admin/analytics/overview，不带任何参数", async () => {
    mockGet.mockResolvedValueOnce({ code: 0, msg: "ok", data: {} });
    await getOverview();
    expect(mockGet).toHaveBeenCalledWith("/admin/analytics/overview");
  });

  it("getRealtime() 请求 GET /admin/analytics/realtime，不带任何参数", async () => {
    mockGet.mockResolvedValueOnce({ code: 0, msg: "ok", data: {} });
    await getRealtime();
    expect(mockGet).toHaveBeenCalledWith("/admin/analytics/realtime");
  });
});

describe("analytics API — 错误/趋势", () => {
  it("getErrors() 正确传递 environment/app_id/top_n 等参数（camelCase → snake_case）", async () => {
    mockGet.mockResolvedValueOnce({ code: 0, msg: "ok", data: {} });
    await getErrors({ range: "24h", environment: "staging", appId: "q-editor", topN: 5, errorType: "js_error" });
    expect(mockGet).toHaveBeenCalledWith("/admin/analytics/errors", {
      params: { range: "24h", environment: "staging", app_id: "q-editor", top_n: 5, error_type: "js_error" }
    });
  });

  it("getTrend() 正确传递 metric/granularity/environment/app_id", async () => {
    mockGet.mockResolvedValueOnce({ code: 0, msg: "ok", data: {} });
    await getTrend({ metric: "errors", granularity: "hour", range: "24h", environment: "production", appId: "q-editor" });
    expect(mockGet).toHaveBeenCalledWith("/admin/analytics/trend", {
      params: { metric: "errors", granularity: "hour", range: "24h", environment: "production", app_id: "q-editor" }
    });
  });
});

describe("analytics API — 性能（含新增 editor_load/editor_save）", () => {
  it("getPerformance() 支持既有指标（lcp）", async () => {
    mockGet.mockResolvedValueOnce({ code: 0, msg: "ok", data: {} });
    await getPerformance({ metric: "lcp", range: "24h", environment: "production" });
    expect(mockGet).toHaveBeenCalledWith("/admin/analytics/performance", {
      params: { metric: "lcp", range: "24h", environment: "production", app_id: undefined, page_url: undefined }
    });
  });

  it("getPerformance() 支持本功能新增的 editor_load 指标", async () => {
    mockGet.mockResolvedValueOnce({ code: 0, msg: "ok", data: {} });
    await getPerformance({ metric: "editor_load", range: "24h", environment: "production", appId: "q-editor" });
    expect(mockGet).toHaveBeenCalledWith("/admin/analytics/performance", {
      params: { metric: "editor_load", range: "24h", environment: "production", app_id: "q-editor", page_url: undefined }
    });
  });

  it("getPerformance() 支持本功能新增的 editor_save 指标", async () => {
    mockGet.mockResolvedValueOnce({ code: 0, msg: "ok", data: {} });
    await getPerformance({ metric: "editor_save", range: "24h", environment: "production" });
    expect(mockGet).toHaveBeenCalledWith(
      "/admin/analytics/performance",
      expect.objectContaining({ params: expect.objectContaining({ metric: "editor_save" }) })
    );
  });
});

describe("analytics API — 漏斗", () => {
  it("getFunnel() 不带 environment 参数（漏斗接口不支持环境筛选）", async () => {
    mockGet.mockResolvedValueOnce({ code: 0, msg: "ok", data: {} });
    await getFunnel({ funnelName: "survey_creation", range: "7d", appId: "q-editor" });
    expect(mockGet).toHaveBeenCalledWith("/admin/analytics/funnel", {
      params: { funnel_name: "survey_creation", range: "7d", app_id: "q-editor" }
    });
  });
});
