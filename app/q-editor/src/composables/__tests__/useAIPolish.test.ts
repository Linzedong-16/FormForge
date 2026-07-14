/**
 * useAIPolish composable 单元测试
 *
 * 测试范围：
 *   1. 初始状态
 *   2. 计算属性
 *   3. 润色前置校验（空指令、空编辑器）
 *   4. cancel 操作
 *   5. reset 操作
 *   6. applyToEditor 空结果处理
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useAIPolish } from "../useAIPolish";

// Mock SSE 流 — 使用 hoisted 避免 vi.mock 提升导致变量未初始化
const { mockAbort } = vi.hoisted(() => ({ mockAbort: vi.fn() }));
vi.mock("monorepo-sse-client/ai", () => ({
  createAIPolishStream: vi.fn(() => ({ abort: mockAbort })),
  createAIGenerateStream: vi.fn()
}));

// Mock aiToStatus
vi.mock("@/utils/aiToStatus", () => ({
  aiComponentsToStatus: vi.fn().mockReturnValue({ statuses: [], warnings: [] })
}));

describe("useAIPolish", () => {
  let polish: ReturnType<typeof useAIPolish>;

  beforeEach(() => {
    setActivePinia(createPinia());
    mockAbort.mockClear();
    polish = useAIPolish();
  });

  // ─── 初始状态 ────────────────────────────────────────────────
  describe("初始状态", () => {
    it("phase 应为 idle", () => {
      expect(polish.phase.value).toBe("idle");
    });

    it("instructions 应为空字符串", () => {
      expect(polish.instructions.value).toBe("");
    });

    it("aspects 应为空数组", () => {
      expect(polish.aspects.value).toEqual([]);
    });

    it("streamText 应为空", () => {
      expect(polish.streamText.value).toBe("");
    });

    it("result 应为 null", () => {
      expect(polish.result.value).toBeNull();
    });

    it("errorMessage 应为空", () => {
      expect(polish.errorMessage.value).toBe("");
    });
  });

  // ─── 计算属性 ────────────────────────────────────────────────
  describe("计算属性", () => {
    it("isIdle 初始应为 true", () => {
      expect(polish.isIdle.value).toBe(true);
    });

    it("isPolishing 初始应为 false", () => {
      expect(polish.isPolishing.value).toBe(false);
    });

    it("isDone 初始应为 false", () => {
      expect(polish.isDone.value).toBe(false);
    });

    it("isError 初始应为 false", () => {
      expect(polish.isError.value).toBe(false);
    });

    it("hasResult 初始应为 false", () => {
      expect(polish.hasResult.value).toBe(false);
    });

    it("changeCount 初始应为 0", () => {
      expect(polish.changeCount.value).toBe(0);
    });
  });

  // ─── 润色前置校验 ────────────────────────────────────────────
  describe("polish 前置校验", () => {
    it("空指令应直接返回，不发起润色", async () => {
      polish.instructions.value = "";
      await polish.polish();
      expect(polish.phase.value).toBe("idle");
    });

    it("纯空格指令应直接返回", async () => {
      polish.instructions.value = "   ";
      await polish.polish();
      expect(polish.phase.value).toBe("idle");
    });
  });

  // ─── cancel ─────────────────────────────────────────────────
  describe("cancel", () => {
    it("非 polishing 状态下 cancel 不应改变 phase", () => {
      polish.phase.value = "done" as any;
      polish.cancel();
      expect(polish.phase.value).toBe("done");
    });

    it("polishing 状态下 cancel 应重置 phase 为 idle", () => {
      // 注意：streamController 为 null 时 cancel 仍应重置 phase
      polish.phase.value = "polishing" as any;
      polish.cancel();
      expect(polish.phase.value).toBe("idle");
    });
  });

  // ─── reset ──────────────────────────────────────────────────
  describe("reset", () => {
    it("应重置所有状态到初始值", () => {
      polish.instructions.value = "test";
      polish.streamText.value = "some text";
      polish.result.value = { title: "test", components: [], changes: [] } as any;
      polish.errorMessage.value = "error";
      polish.phase.value = "error" as any;

      polish.reset();

      expect(polish.phase.value).toBe("idle");
      expect(polish.streamText.value).toBe("");
      expect(polish.result.value).toBeNull();
      expect(polish.errorMessage.value).toBe("");
    });
  });

  // ─── applyToEditor 空结果处理 ────────────────────────────────
  describe("applyToEditor", () => {
    it("result 为 null 时应返回错误信息", () => {
      polish.result.value = null;
      const warnings = polish.applyToEditor();
      expect(warnings).toContain("润色结果为空");
    });

    it("components 为空数组时应返回错误信息", () => {
      polish.result.value = { title: "", components: [], changes: [] } as any;
      const warnings = polish.applyToEditor();
      expect(warnings).toContain("润色结果为空");
    });
  });
});