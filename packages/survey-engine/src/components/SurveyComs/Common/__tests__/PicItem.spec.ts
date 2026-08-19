// ──────────────────────────────────────────────────────────────────────────────
// PicItem 组件测试 — 图片上传响应体解析统一（T021，对应 FR-010 第 4 项）
//
// 覆盖：标准信封 { code, msg, data: { file_url } } 正确解析展示；
//       上传失败时错误通过 options.onError 向上抛出，而非静默吞错。
// ──────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import ElementPlus from "element-plus";
import type { UploadRequestOptions } from "element-plus";
import { i18n } from "../../../../i18n";
import PicItem from "../PicItem.vue";

vi.mock("../../../../api/upload", () => ({
  uploadSurveyFile: vi.fn()
}));

import { uploadSurveyFile } from "../../../../api/upload";

const mockUploadSurveyFile = uploadSurveyFile as unknown as ReturnType<typeof vi.fn>;

// customUpload/handleAvatarSuccess/imageUrl 均是 <script setup> 内部绑定，未通过 defineExpose
// 暴露为公共 API，仅 vitest 运行时开发模式实例可访问；经 unknown 中转收窄类型，避免 any，
// 同时不修改组件本身的公共 API
function getInternal(vm: object) {
  return vm as unknown as {
    customUpload: (options: UploadRequestOptions) => Promise<unknown>;
    handleAvatarSuccess: (response: { code: number; msg: string; data: { file_url?: string } | null }) => Promise<void>;
    imageUrl: string;
  };
}

function mountPicItem(getLink = vi.fn()) {
  return mount(PicItem, {
    props: { picTitle: "标题", picDesc: "描述", value: "", index: 0 },
    global: {
      plugins: [ElementPlus, i18n],
      provide: { getLink, getSurveyId: () => "survey-1" }
    }
  });
}

describe("PicItem — 图片上传响应体解析", () => {
  it("标准信封 { code: 0, data: { file_url } } 正确解析并展示图片链接", async () => {
    const getLink = vi.fn();
    const wrapper = mountPicItem(getLink);

    await getInternal(wrapper.vm).handleAvatarSuccess({
      code: 0,
      msg: "",
      data: { file_url: "https://minio/pic.png" }
    });
    await flushPromises();

    expect(getLink).toHaveBeenCalledWith({ index: 0, link: "https://minio/pic.png" });
    expect(getInternal(wrapper.vm).imageUrl).toBe("https://minio/pic.png");
    expect(wrapper.find("img.avatar").attributes("src")).toBe("https://minio/pic.png");
  });

  it("上传失败时，onError 被正确调用，错误不被静默吞掉", async () => {
    mockUploadSurveyFile.mockRejectedValue(new Error("network error"));
    const wrapper = mountPicItem();

    const onError = vi.fn();
    const options = {
      file: new File(["x"], "x.png", { type: "image/png" }),
      filename: "file",
      action: "",
      onProgress: vi.fn(),
      onSuccess: vi.fn(),
      onError
    } as unknown as UploadRequestOptions;

    await expect(getInternal(wrapper.vm).customUpload(options)).rejects.toThrow();

    expect(onError).toHaveBeenCalledTimes(1);
  });
});
