/**
 * SurveyView 填写者真实作答状态回归测试（US2 / D2 Bug，FR-003/FR-004/FR-010）
 *
 * 覆盖范围：
 *   T008：被规则隐藏跳过的题目、展示但留空的题目，在提交负载中应携带 answer_status（1/2）；
 *         运行本测试用于先确认在当前实现下二者完全缺失（复现 Bug 2）
 *   T009：不含任何 logic 配置的问卷，submitAnswers() 产出的提交负载与修复前基线行为一致，
 *         作为后续修复（T010）不得破坏的零回归锚点（FR-010）
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createRouter, createMemoryHistory } from "vue-router";
import { defineComponent, h } from "vue";
import { i18n } from "@/i18n";
import type { SurveyComponentDetail, SurveyDetail } from "@common/survey/survey.interface";

vi.mock("element-plus", async () => {
  const actual = await vi.importActual<typeof import("element-plus")>("element-plus");
  return {
    ...actual,
    ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
    ElMessageBox: { confirm: vi.fn().mockResolvedValue(undefined) }
  };
});

// test-setup.ts 已全局将 @/configs/componentMap mock 为空对象，真实 restoreComponentStatus
// 在测试环境下永远无法回填 com.type；此处覆盖为可控实现：为每个题目注入一个基于 h() 渲染函数的
// stub 组件（避免依赖运行时模板编译器），点击即触发 update-answer 事件，模拟填写者的作答交互
vi.mock("@/utils", async () => {
  const actual = await vi.importActual<typeof import("@/utils")>("@/utils");
  return {
    ...actual,
    restoreComponentStatus: vi.fn((coms: Array<Record<string, unknown>>) => {
      coms.forEach(com => {
        const key = String(com.client_key ?? com._componentId);
        com.type = defineComponent({
          name: `StubQuestion_${key}`,
          emits: ["update-answer"],
          setup(_, { emit }) {
            return () =>
              h("button", {
                class: `stub-question stub-${key}`,
                onClick: () => emit("update-answer", "填写的答案")
              });
          }
        });
      });
    })
  };
});

vi.mock("@/utils/fingerprint", () => ({
  getFingerprint: vi.fn().mockResolvedValue({ success: true, hash: "test-fingerprint-hash", env: "desktop" })
}));

const getPublicSurveyByIdMock = vi.fn();
const getSurveyTokenMock = vi.fn();
const submitResponseMock = vi.fn();

vi.mock("@/api/modules/survey", async () => {
  const actual = await vi.importActual<typeof import("@/api/modules/survey")>("@/api/modules/survey");
  return {
    ...actual,
    getPublicSurveyById: (...args: unknown[]) => getPublicSurveyByIdMock(...args),
    getSurveyToken: (...args: unknown[]) => getSurveyTokenMock(...args),
    submitResponse: (...args: unknown[]) => submitResponseMock(...args)
  };
});

/** 构造最小可用的问卷组件载荷（对齐后端 SurveyComponentDetail 结构） */
function makeComponent(overrides: {
  id: string;
  order_index: number;
  client_key: string;
  logic?: SurveyComponentDetail["logic"];
}): SurveyComponentDetail {
  return {
    id: overrides.id,
    survey_id: "survey-1",
    type: "text_input",
    config: { title: { status: `题目-${overrides.client_key}`, isShow: true } },
    order_index: overrides.order_index,
    required: 0,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    client_key: overrides.client_key,
    logic: overrides.logic ?? null
  };
}

/** 构造最小可用的 SurveyDetail 响应体 */
function makeSurveyDetail(components: SurveyComponentDetail[]): SurveyDetail {
  return {
    id: "survey-1",
    user_id: "user-1",
    title: "测试问卷",
    description: null,
    status: 1,
    page_size: 10,
    total_questions: components.length,
    responses_count: 0,
    is_public: 1,
    review_status: "none",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    published_at: "2026-01-01T00:00:00.000Z",
    closed_at: null,
    access_code: null,
    components
  };
}

async function mountSurveyView(surveyId: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: "/survey/:id", name: "survey", component: { template: "<div />" } }]
  });
  await router.push(`/survey/${surveyId}`);
  await router.isReady();

  const { default: SurveyView } = await import("../SurveyView.vue");

  return mount(SurveyView, {
    global: { plugins: [router, i18n] }
  });
}

describe("SurveyView — submitAnswers() 真实作答状态上报（US2 / D2 Bug）", () => {
  beforeEach(() => {
    getPublicSurveyByIdMock.mockReset();
    getSurveyTokenMock.mockReset();
    submitResponseMock.mockReset();
    submitResponseMock.mockResolvedValue({
      code: 0,
      msg: "ok",
      data: { response_id: "resp-1", submitted_at: "2026-01-01T00:00:00.000Z" }
    });
    getSurveyTokenMock.mockResolvedValue({
      code: 0,
      msg: "ok",
      data: { token: "11111111-1111-4111-8111-111111111111", expires_in: 300 }
    });
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("[T008] 隐藏题目与展示但留空题目应携带对应 answer_status，当前实现下二者完全缺失（复现 Bug 2）", async () => {
    const components = [
      makeComponent({
        id: "com-q1",
        order_index: 0,
        client_key: "q1",
        // baseVisibility 直接兜底为 hidden，无需构造真实的触发题目即可让该题目无条件被隐藏
        logic: { visibility: { baseVisibility: "hidden", rules: [] } }
      }),
      makeComponent({ id: "com-q2", order_index: 1, client_key: "q2" }),
      makeComponent({ id: "com-q3", order_index: 2, client_key: "q3" })
    ];
    getPublicSurveyByIdMock.mockResolvedValue({ code: 0, msg: "ok", data: makeSurveyDetail(components) });

    const wrapper = await mountSurveyView("survey-1");
    await flushPromises();

    // q1 因隐藏规则不渲染；q2 故意不交互（留空）；仅对 q3 触发作答
    expect(wrapper.find(".stub-q1").exists()).toBe(false);
    expect(wrapper.find(".stub-q2").exists()).toBe(true);
    await wrapper.find(".stub-q3").trigger("click");

    await wrapper.find("el-button").trigger("click");
    await flushPromises();

    expect(submitResponseMock).toHaveBeenCalledTimes(1);
    const payload = submitResponseMock.mock.calls[0]?.[1] as { answers: Array<Record<string, unknown>> };
    const byComponentId = new Map(payload.answers.map(item => [item.component_id, item]));

    // 修复前：被隐藏与留空的题目完全不出现在提交负载中，以下三条断言应失败
    expect(byComponentId.get("com-q1")).toEqual(
      expect.objectContaining({ component_id: "com-q1", answer_status: 1 })
    );
    expect(byComponentId.get("com-q2")).toEqual(
      expect.objectContaining({ component_id: "com-q2", answer_status: 2 })
    );
    expect(byComponentId.get("com-q3")).toEqual(
      expect.objectContaining({ component_id: "com-q3", value: "填写的答案" })
    );
  });

  it("[T009] 不含任何 logic 配置的问卷，提交负载与修复前基线行为逐字节一致（FR-010 零回归锚点）", async () => {
    const components = [
      makeComponent({ id: "com-a", order_index: 0, client_key: "qa" }),
      makeComponent({ id: "com-b", order_index: 1, client_key: "qb" })
    ];
    getPublicSurveyByIdMock.mockResolvedValue({ code: 0, msg: "ok", data: makeSurveyDetail(components) });

    const wrapper = await mountSurveyView("survey-1");
    await flushPromises();

    // qb 故意留空，仅对 qa 触发作答
    await wrapper.find(".stub-qa").trigger("click");

    await wrapper.find("el-button").trigger("click");
    await flushPromises();

    expect(submitResponseMock).toHaveBeenCalledTimes(1);
    const payload = submitResponseMock.mock.calls[0]?.[1] as { answers: Array<Record<string, unknown>> };

    // 基线行为：未填写题目完全不出现在负载中，已填写题目也不携带 answer_status 字段
    expect(payload.answers).toEqual([{ component_id: "com-a", value: "填写的答案" }]);
  });
});
