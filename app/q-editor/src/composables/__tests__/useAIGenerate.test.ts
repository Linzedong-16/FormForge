/**
 * useAIGenerate composable 单元测试
 *
 * 测试范围：
 *   1. 初始状态
 *   2. 输入校验（空输入、过短、过长、正常）
 *   3. 状态转换（idle → generating → done/error）
 *   4. reset 操作
 *   5. 历史记录
 */
import { describe, it, expect, beforeEach } from "vitest";
import { useAIGenerate } from "../useAIGenerate";

describe("useAIGenerate", () => {
  let ai: ReturnType<typeof useAIGenerate>;

  beforeEach(() => {
    ai = useAIGenerate();
  });

  // ─── 初始状态 ────────────────────────────────────────────────
  describe("初始状态", () => {
    it("phase 应为 idle", () => {
      expect(ai.phase.value).toBe("idle");
    });

    it("prompt 应为空字符串", () => {
      expect(ai.prompt.value).toBe("");
    });

    it("count 默认值应为 10", () => {
      expect(ai.count.value).toBe(10);
    });

    it("language 默认值应为 zh-CN", () => {
      expect(ai.language.value).toBe("zh-CN");
    });

    it("streamText 应为空", () => {
      expect(ai.streamText.value).toBe("");
    });

    it("components 应为空数组", () => {
      expect(ai.components.value).toEqual([]);
    });

    it("result 应为 null", () => {
      expect(ai.result.value).toBeNull();
    });

    it("计算属性 isIdle 应为 true", () => {
      expect(ai.isIdle.value).toBe(true);
    });

    it("计算属性 isGenerating 应为 false", () => {
      expect(ai.isGenerating.value).toBe(false);
    });

    it("计算属性 isDone 应为 false", () => {
      expect(ai.isDone.value).toBe(false);
    });

    it("计算属性 isError 应为 false", () => {
      expect(ai.isError.value).toBe(false);
    });

    it("componentCount 应为 0", () => {
      expect(ai.componentCount.value).toBe(0);
    });
  });

  // ─── 输入校验 ────────────────────────────────────────────────
  describe("validateInput", () => {
    it("空输入应返回 aiEmptyPrompt", () => {
      ai.prompt.value = "";
      expect(ai.validateInput()).toBe("aiEmptyPrompt");
    });

    it("纯空格输入应返回 aiEmptyPrompt", () => {
      ai.prompt.value = "   ";
      expect(ai.validateInput()).toBe("aiEmptyPrompt");
    });

    it("少于 5 个字符应返回 aiPromptTooShort", () => {
      ai.prompt.value = "abc";
      expect(ai.validateInput()).toBe("aiPromptTooShort");
    });

    it("超过 2000 个字符应返回 aiPromptTooLong", () => {
      ai.prompt.value = "a".repeat(2001);
      expect(ai.validateInput()).toBe("aiPromptTooLong");
    });

    it("5 个字符的合法输入应返回 null", () => {
      ai.prompt.value = "abcde";
      expect(ai.validateInput()).toBeNull();
    });

    it("正常长度的合法输入应返回 null", () => {
      ai.prompt.value = "生成一份员工满意度调查问卷";
      expect(ai.validateInput()).toBeNull();
    });

    it("恰好 2000 个字符应返回 null", () => {
      ai.prompt.value = "a".repeat(2000);
      expect(ai.validateInput()).toBeNull();
    });
  });

  // ─── reset 操作 ──────────────────────────────────────────────
  describe("reset", () => {
    it("重置后 phase 应回到 idle", () => {
      ai.prompt.value = "test survey";
      ai.count.value = 15;
      ai.reset();

      expect(ai.phase.value).toBe("idle");
      expect(ai.streamText.value).toBe("");
      expect(ai.components.value).toEqual([]);
      expect(ai.errorMessage.value).toBe("");
      expect(ai.result.value).toBeNull();
    });
  });

  // ─── 历史记录 ────────────────────────────────────────────────
  describe("restoreHistory", () => {
    it("恢复历史记录后 phase 应为 done", () => {
      const entry = {
        prompt: "测试问卷",
        count: 5,
        result: {
          title: "测试",
          description: "描述",
          components: [
            { index: 0, type: "single-select", title: "单选题", description: "请选择" }
          ],
          warnings: [],
          _rawComponents: []
        },
        timestamp: Date.now()
      };

      ai.restoreHistory(entry);
      expect(ai.phase.value).toBe("done");
      expect(ai.prompt.value).toBe("测试问卷");
      expect(ai.count.value).toBe(5);
      expect(ai.result.value?.title).toBe("测试");
    });
  });
});