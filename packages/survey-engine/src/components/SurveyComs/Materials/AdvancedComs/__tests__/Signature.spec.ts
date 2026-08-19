// ──────────────────────────────────────────────────────────────────────────────
// Signature 组件测试 — MinIO 签名上传流程（T019，对应 FR-010 第 3 项）
//
// jsdom 默认未完整实现 HTMLCanvasElement（getContext/toBlob/toDataURL 等），
// 需在 beforeEach 中手动 mock，才能驱动 startDraw/endDraw 真实流程。
// uploadSignature 走 vi.mock 隔离网络层，仅验证组件对返回结果的分支处理。
// ──────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import ElementPlus from "element-plus";
import { createPinia, setActivePinia } from "pinia";
import { i18n } from "../../../../../i18n";
import Signature from "../Signature.vue";
import type { SignatureStatus, OptionsProps, TextProps } from "../../../../../types";

vi.mock("../../../../../api/upload", () => ({
  uploadSignature: vi.fn()
}));

import { uploadSignature } from "../../../../../api/upload";

const mockUploadSignature = uploadSignature as unknown as ReturnType<typeof vi.fn>;

function makeSignatureStatus(): SignatureStatus {
  const textProp = (status: string): TextProps => ({ id: "x", isShow: true, name: "x", editCom: {} as never, status });
  const optionsProp = (status: string[]): OptionsProps => ({
    id: "x",
    isShow: true,
    name: "x",
    editCom: {} as never,
    status,
    currentStatus: 0
  });
  return {
    title: textProp("签名题"),
    desc: textProp(""),
    position: optionsProp(["左对齐", "居中"]),
    titleSize: optionsProp(["16", "18"]),
    descSize: optionsProp(["14", "16"]),
    titleWeight: optionsProp(["正常", "粗体"]),
    descWeight: optionsProp(["正常", "粗体"]),
    titleItalic: optionsProp(["正常", "斜体"]),
    descItalic: optionsProp(["正常", "斜体"]),
    titleColor: textProp("#000000"),
    descColor: textProp("#999999"),
    strokeColor: textProp("#000000"),
    strokeWidth: optionsProp(["1", "2", "3"]),
    showToolbar: optionsProp(["显示", "隐藏"])
  };
}

// canvas 2D 上下文的最小 mock：仅覆盖 initCanvas/startDraw/drawing/endDraw 实际调用到的方法
const mockCtx = {
  scale: vi.fn(),
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  quadraticCurveTo: vi.fn(),
  stroke: vi.fn(),
  clearRect: vi.fn(),
  putImageData: vi.fn(),
  getImageData: vi.fn(() => ({}) as ImageData),
  lineCap: "",
  lineJoin: "",
  strokeStyle: "",
  lineWidth: 0
};

const FAKE_DATA_URL = "data:image/png;base64,MOCK";

beforeEach(() => {
  vi.clearAllMocks();
  HTMLCanvasElement.prototype.getContext = vi.fn(() => mockCtx) as never;
  HTMLCanvasElement.prototype.getBoundingClientRect = vi.fn(
    () => ({ left: 0, top: 0, width: 400, height: 200, right: 400, bottom: 200, x: 0, y: 0, toJSON: () => ({}) })
  ) as never;
  HTMLCanvasElement.prototype.toDataURL = vi.fn(() => FAKE_DATA_URL) as never;
  HTMLCanvasElement.prototype.toBlob = vi.fn((cb: BlobCallback) => {
    cb(new Blob(["mock"], { type: "image/png" }));
  }) as never;
});

async function mountSignature(getSurveyId: () => string | null) {
  setActivePinia(createPinia());
  const wrapper = mount(Signature, {
    props: { serialNum: 1, status: makeSignatureStatus() },
    global: {
      plugins: [ElementPlus, i18n],
      provide: { getSurveyId }
    }
  });
  await flushPromises();
  return wrapper;
}

// 模拟一次完整的鼠标签名动作：mousedown 开始 -> mouseup 结束（触发 endDraw 上传流程）
async function draw(wrapper: VueWrapper) {
  const canvas = wrapper.find("canvas");
  await canvas.trigger("mousedown", { clientX: 10, clientY: 10 });
  await canvas.trigger("mouseup", { clientX: 20, clientY: 20 });
}

describe("Signature — MinIO 签名上传流程", () => {
  it("有 surveyId 且上传成功时，emit 远程 URL 作答", async () => {
    mockUploadSignature.mockResolvedValue({
      code: 0,
      msg: "",
      data: { file_id: "f1", file_url: "https://minio/x.png" }
    });

    const wrapper = await mountSignature(() => "survey-1");
    await draw(wrapper);
    await flushPromises();

    expect(mockUploadSignature).toHaveBeenCalledTimes(1);
    expect(wrapper.emitted("updateAnswer")?.at(-1)).toEqual(["https://minio/x.png"]);
  });

  it("无 surveyId 时，直接降级为 base64，不调用上传接口", async () => {
    const wrapper = await mountSignature(() => null);
    await draw(wrapper);
    await flushPromises();

    expect(mockUploadSignature).not.toHaveBeenCalled();
    expect(wrapper.emitted("updateAnswer")?.at(-1)).toEqual([FAKE_DATA_URL]);
  });

  it("上传失败（业务信封 code !== 0）时，降级为 base64 并提示", async () => {
    mockUploadSignature.mockResolvedValue({ code: 1, msg: "签名上传失败", data: null });

    const wrapper = await mountSignature(() => "survey-1");
    await draw(wrapper);
    await flushPromises();

    expect(mockUploadSignature).toHaveBeenCalledTimes(1);
    expect(wrapper.emitted("updateAnswer")?.at(-1)).toEqual([FAKE_DATA_URL]);
  });

  it("上传期间 uploading 为 true，展示上传中提示，上传完成后恢复", async () => {
    let resolveUpload!: (value: { code: number; msg: string; data: { file_id: string; file_url: string } }) => void;
    mockUploadSignature.mockImplementation(
      () =>
        new Promise(resolve => {
          resolveUpload = resolve;
        })
    );

    const wrapper = await mountSignature(() => "survey-1");
    await draw(wrapper);
    await flushPromises();

    expect(wrapper.text()).toContain("上传中");

    resolveUpload({ code: 0, msg: "", data: { file_id: "f1", file_url: "https://minio/x.png" } });
    await flushPromises();

    expect(wrapper.text()).not.toContain("上传中");
    expect(wrapper.emitted("updateAnswer")?.at(-1)).toEqual(["https://minio/x.png"]);
  });
});
