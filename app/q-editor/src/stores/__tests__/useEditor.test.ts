/**
 * 编辑器 Store 覆盖/追加模式单元测试
 *
 * 测试范围：
 *   1. 覆盖模式：resetComs + addCom 组合
 *   2. 追加模式：仅 addCom（保留原有内容）
 *   3. dirty 状态管理
 *   4. 数据安全性：追加不修改原有内容
 */
import { describe, it, expect, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useEditorStore } from "../useEditor";
import type { Status } from "@/types";

/** 创建模拟 Status 对象的工厂函数 */
function createMockStatus(name: string, title: string, id?: string): Status {
  return {
    id: id ?? `mock-${name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    type: {} as unknown as Status["type"],
    status: {
      title: { status: title, isShow: true, id: `title-${Date.now()}` },
      desc: { status: "", isShow: false, id: `desc-${Date.now()}` },
      options: {} as unknown as Status["status"]["options"],
      required: { status: false, id: `req-${Date.now()}` }
    }
  } as unknown as Status;
}

describe("useEditorStore — 覆盖与追加", () => {
  let store: ReturnType<typeof useEditorStore>;

  beforeEach(() => {
    setActivePinia(createPinia());
    store = useEditorStore();
    store.resetComs();
  });

  // ─── 覆盖模式 ────────────────────────────────────────────────
  describe("覆盖模式 (resetComs + addCom)", () => {
    it("resetComs 后 coms 应只包含初始组件", () => {
      const initialLength = store.coms.length;
      store.resetComs();
      expect(store.coms.length).toBe(initialLength);
    });

    it("覆盖后 coms 应只包含新添加的组件", () => {
      // 先添加一些原有内容
      store.addCom(createMockStatus("single-select", "原有题目1"));
      store.addCom(createMockStatus("multi-select", "原有题目2"));
      expect(store.coms.length).toBeGreaterThan(0);

      // 覆盖：先清空再添加
      store.resetComs();
      const newCom1 = createMockStatus("single-select", "新题目1");
      const newCom2 = createMockStatus("text-input", "新题目2");
      store.addCom(newCom1);
      store.addCom(newCom2);

      // 验证：只有新组件
      const titles = store.coms
        .filter(c => (c.status as Record<string, unknown>).title)
        .map(c => ((c.status as Record<string, unknown>).title as { status: string }).status);

      expect(titles).toContain("新题目1");
      expect(titles).toContain("新题目2");
      expect(titles).not.toContain("原有题目1");
      expect(titles).not.toContain("原有题目2");
    });
  });

  // ─── 追加模式 ────────────────────────────────────────────────
  describe("追加模式 (仅 addCom)", () => {
    it("追加后原有内容保持不变", () => {
      const originalCom = createMockStatus("single-select", "原有题目");
      store.addCom(originalCom);

      const originalLength = store.coms.length;
      const originalFirstTitle = (
        (store.coms[originalLength - 1]!.status as Record<string, unknown>).title as { status: string }
      ).status;

      // 追加新组件
      const newCom = createMockStatus("multi-select", "新题目");
      store.addCom(newCom);

      // 验证：原有内容不变
      expect(store.coms.length).toBe(originalLength + 1);
      expect(
        ((store.coms[originalLength - 1]!.status as Record<string, unknown>).title as { status: string }).status
      ).toBe(originalFirstTitle);
    });

    it("追加后新组件应排在末尾", () => {
      store.addCom(createMockStatus("single-select", "第一题"));
      store.addCom(createMockStatus("multi-select", "第二题"));

      const newCom = createMockStatus("text-input", "追加的题");
      store.addCom(newCom);

      const lastCom = store.coms[store.coms.length - 1]!;
      const lastTitle = ((lastCom.status as Record<string, unknown>).title as { status: string }).status;
      expect(lastTitle).toBe("追加的题");
    });

    it("多次追加多个组件不应丢失数据", () => {
      const originalComs = [
        createMockStatus("single-select", "原题1"),
        createMockStatus("multi-select", "原题2"),
        createMockStatus("text-input", "原题3")
      ];

      originalComs.forEach(c => store.addCom(c));
      const originalLength = store.coms.length;

      // 追加 5 个新组件
      for (let i = 0; i < 5; i++) {
        store.addCom(createMockStatus("single-select", `追加题${i + 1}`));
      }

      expect(store.coms.length).toBe(originalLength + 5);

      // 验证原有的 3 个组件（位于初始组件之后，索引 originalLength-3 到 originalLength-1）
      const originalComsSlice = store.coms.slice(originalLength - 3, originalLength);
      const titles = originalComsSlice.map(
        c => ((c.status as Record<string, unknown>).title as { status: string }).status
      );
      expect(titles).toEqual(["原题1", "原题2", "原题3"]);
    });
  });

  // ─── dirty 状态 ──────────────────────────────────────────────
  describe("dirty 状态管理", () => {
    it("addCom 后 dirty 应为 true", () => {
      store.addCom(createMockStatus("single-select", "测试"));
      expect(store.dirty).toBe(true);
    });

    it("resetComs 后 dirty 应为 false", () => {
      store.addCom(createMockStatus("single-select", "测试"));
      store.resetComs();
      expect(store.dirty).toBe(false);
    });

    it("markClean 后 dirty 应为 false", () => {
      store.addCom(createMockStatus("single-select", "测试"));
      store.markClean();
      expect(store.dirty).toBe(false);
    });
  });

  // ─── 数据安全性 ──────────────────────────────────────────────
  describe("数据安全性", () => {
    it("追加不应修改原有组件的属性", () => {
      const originalCom = createMockStatus("single-select", "原始标题");
      store.addCom(originalCom);

      const originalSnapshot = JSON.parse(JSON.stringify(store.coms));

      store.addCom(createMockStatus("multi-select", "新标题"));

      // 原有组件属性应完全一致
      const afterSnapshot = JSON.parse(JSON.stringify(store.coms.slice(0, -1)));
      expect(afterSnapshot).toEqual(originalSnapshot);
    });

    it("覆盖不应留下旧组件的残留数据", () => {
      store.addCom(createMockStatus("single-select", "旧题"));
      store.addCom(createMockStatus("multi-select", "旧题2"));

      store.resetComs();
      store.addCom(createMockStatus("text-input", "新题"));

      const allTitles = store.coms
        .filter(c => (c.status as Record<string, unknown>).title)
        .map(c => ((c.status as Record<string, unknown>).title as { status: string }).status);

      expect(allTitles).not.toContain("旧题");
      expect(allTitles).not.toContain("旧题2");
      expect(allTitles).toContain("新题");
    });
  });
});
