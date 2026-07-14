/**
 * EditorView 埋点性能计时集成测试
 *
 * 覆盖范围（对齐 FR-002 / User Story 2）：
 *   1. 挂载时（onMounted 加载已有问卷）上报 editor_load 耗时，success=true
 *   2. Ctrl+S 保存已有问卷时上报 editor_save 耗时，success=true
 *
 * 子组件（Header/LeftSide/Center/RightSide）通过 shallow 挂载自动 stub，
 * 仅关注 <script setup> 中的加载/保存耗时上报逻辑本身。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import { nextTick } from "vue";
import { i18n } from "@/i18n";

const trackTimingSpy = vi.fn();
const reportErrorSpy = vi.fn();

vi.mock("@/plugins/tracking", () => ({
  getPerformanceCollector: () => ({ trackTiming: trackTimingSpy }),
  getErrorCollector: () => ({ reportError: reportErrorSpy })
}));

vi.mock("element-plus", async () => {
  const actual = await vi.importActual<typeof import("element-plus")>("element-plus");
  return {
    ...actual,
    ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() }
  };
});

vi.mock("@/utils", async () => {
  const actual = await vi.importActual<typeof import("@/utils")>("@/utils");
  return { ...actual, restoreComponentStatus: vi.fn() };
});

const FAKE_SURVEY = {
  createDate: Date.now(),
  updateDate: Date.now(),
  title: "测试问卷",
  surveyCount: 1,
  coms: [{ id: "com-1", name: "text-note", status: {} }],
  pageSize: 10,
  syncStatus: "synced" as const,
  remote_survey_id: "remote-1",
  review_status: "none" as const
};

const getSurveyByIdMock = vi.fn();
const updateSurveyByIdMock = vi.fn();
const saveSurveyMock = vi.fn();

vi.mock("@/db/operation", () => ({
  getSurveyById: (...args: unknown[]) => getSurveyByIdMock(...args),
  updateSurveyById: (...args: unknown[]) => updateSurveyByIdMock(...args),
  saveSurvey: (...args: unknown[]) => saveSurveyMock(...args)
}));

vi.mock("@/api/modules/survey", () => ({
  createSurvey: vi.fn(),
  updateSurvey: vi.fn().mockResolvedValue({ code: 0, msg: "ok", data: { survey_id: "remote-1" } }),
  serializeComponents: vi.fn().mockReturnValue([]),
  extractSurveyMetadata: vi.fn().mockReturnValue({ title: "测试问卷", description: "" })
}));

describe("EditorView — 埋点性能计时", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    trackTimingSpy.mockClear();
    reportErrorSpy.mockClear();
    getSurveyByIdMock.mockReset();
    updateSurveyByIdMock.mockReset();
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  async function mountEditorView(surveyId: string) {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: "/editor/:id", name: "editor", component: { template: "<div />" } }]
    });
    await router.push(`/editor/${surveyId}`);
    await router.isReady();

    const { default: EditorView } = await import("../index.vue");

    return mount(EditorView, {
      shallow: true,
      global: { plugins: [router, i18n] }
    });
  }

  it("加载已有问卷成功时上报 editor_load 耗时，success=true", { timeout: 15000 }, async () => {
    getSurveyByIdMock.mockResolvedValue(FAKE_SURVEY);

    await mountEditorView("123");
    await flushPromises();
    await nextTick();

    expect(getSurveyByIdMock).toHaveBeenCalledWith(123);
    expect(trackTimingSpy).toHaveBeenCalledWith("editor_load", expect.any(Number), { success: true });
  });

  it("加载失败时上报 editor_load 耗时 success=false，并手动上报错误，不产生未处理的 Promise 拒绝", async () => {
    getSurveyByIdMock.mockRejectedValue(new Error("load failed"));

    await mountEditorView("456");
    await flushPromises();

    expect(trackTimingSpy).toHaveBeenCalledWith("editor_load", expect.any(Number), { success: false });
    expect(reportErrorSpy).toHaveBeenCalledWith(expect.any(Error), { action: "editor_load" });
  });

  it("Ctrl+S 保存已有问卷成功时上报 editor_save 耗时，success=true", async () => {
    getSurveyByIdMock.mockResolvedValue(FAKE_SURVEY);
    updateSurveyByIdMock.mockResolvedValue(undefined);

    const wrapper = await mountEditorView("123");
    await flushPromises();
    trackTimingSpy.mockClear(); // 只关注保存动作触发的上报，排除加载阶段的调用

    // 触发 EditorView 内部注册的 Ctrl+S 快捷键监听
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "s", ctrlKey: true }));
    await flushPromises();
    await nextTick();

    expect(trackTimingSpy).toHaveBeenCalledWith("editor_save", expect.any(Number), { success: true });

    wrapper.unmount();
  });
});
