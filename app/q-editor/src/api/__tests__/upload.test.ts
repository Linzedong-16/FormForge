/**
 * 文件上传 API 单元测试
 *
 * 测试范围：
 *   1. uploadImage — FormData "image" 键 + POST /q-editor/upload
 *   2. uploadSurveyFile — FormData "file" + "survey_id" 键，可选 "file_type"
 *   3. uploadSignature — FormData "file" + "survey_id" 键，filename 为 signature.png
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock 模块（使用 vi.hoisted 避免 hoisting 问题） ────────────

const mockServer = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
  post: vi.fn(),
  delete: vi.fn()
}));

vi.mock("../clients/server", () => ({
  default: mockServer
}));

// 必须在 mock 之后导入
import { uploadImage, uploadSurveyFile, uploadSignature } from "../upload";

/** 辅助：从 mockServer.post 的调用中提取 FormData */
function getFormDataFromPostCall(): FormData {
  const calls = mockServer.post.mock.calls;
  expect(calls.length).toBeGreaterThanOrEqual(1);
  const [, formData] = calls[0] as [string, FormData];
  return formData;
}

describe("upload API 模块 — 全量单元测试", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ════════════════════════════════════════════════════════════
  //  1. uploadImage
  // ════════════════════════════════════════════════════════════
  describe("uploadImage", () => {
    it("应创建 FormData 并包含 'image' 键", () => {
      const file = new File(["test"], "test.png", { type: "image/png" });
      uploadImage(file);

      const formData = getFormDataFromPostCall();
      expect(formData.get("image")).toBe(file);
    });

    it("应调用 serverClient.post 并传入 /q-editor/upload 和 timeout", () => {
      const file = new File(["test"], "test.png", { type: "image/png" });
      uploadImage(file);

      const [url, , config] = mockServer.post.mock.calls[0] as [string, FormData, Record<string, unknown>];

      expect(url).toBe("/q-editor/upload");
      expect(config.timeout).toBe(30000);
    });
  });

  // ════════════════════════════════════════════════════════════
  //  2. uploadSurveyFile
  // ════════════════════════════════════════════════════════════
  describe("uploadSurveyFile", () => {
    it("应创建 FormData 并包含 'file' 和 'survey_id' 键", () => {
      const file = new File(["test"], "doc.pdf", { type: "application/pdf" });
      const surveyId = "survey-001";

      uploadSurveyFile(file, surveyId);

      const formData = getFormDataFromPostCall();
      expect(formData.get("file")).toBe(file);
      expect(formData.get("survey_id")).toBe(surveyId);
    });

    it("提供 fileType 时应添加 'file_type' 键", () => {
      const file = new File(["test"], "doc.pdf", { type: "application/pdf" });
      const surveyId = "survey-001";
      const fileType = "attachment";

      uploadSurveyFile(file, surveyId, fileType);

      const formData = getFormDataFromPostCall();
      expect(formData.get("file_type")).toBe(fileType);
    });

    it("不提供 fileType 时不应包含 'file_type' 键", () => {
      const file = new File(["test"], "doc.pdf", { type: "application/pdf" });
      const surveyId = "survey-001";

      uploadSurveyFile(file, surveyId);

      const formData = getFormDataFromPostCall();
      expect(formData.get("file_type")).toBeNull();
    });

    it("应调用 serverClient.post 并传入 /q-editor/survey-file/upload 和 timeout", () => {
      const file = new File(["test"], "doc.pdf", { type: "application/pdf" });
      const surveyId = "survey-001";

      uploadSurveyFile(file, surveyId);

      const [url, , config] = mockServer.post.mock.calls[0] as [string, FormData, Record<string, unknown>];

      expect(url).toBe("/q-editor/survey-file/upload");
      expect(config.timeout).toBe(30000);
    });
  });

  // ════════════════════════════════════════════════════════════
  //  3. uploadSignature
  // ════════════════════════════════════════════════════════════
  describe("uploadSignature", () => {
    it("应创建 FormData 并包含 'file' 和 'survey_id' 键", () => {
      const blob = new Blob(["signature-data"], { type: "image/png" });
      const surveyId = "survey-002";

      uploadSignature(blob, surveyId);

      const formData = getFormDataFromPostCall();
      expect(formData.get("file")).toBeInstanceOf(Blob);
      expect(formData.get("survey_id")).toBe(surveyId);
    });

    it("应调用 serverClient.post 并传入 /q-editor/signature/upload 和 timeout", () => {
      const blob = new Blob(["signature-data"], { type: "image/png" });
      const surveyId = "survey-002";

      uploadSignature(blob, surveyId);

      const [url, , config] = mockServer.post.mock.calls[0] as [string, FormData, Record<string, unknown>];

      expect(url).toBe("/q-editor/signature/upload");
      expect(config.timeout).toBe(30000);
    });
  });
});