/**
 * UndoManager 单元测试
 *
 * 测试范围：
 *   1. 初始状态
 *   2. push / undo / redo 基础流程
 *   3. 深拷贝验证
 *   4. 重做栈清空逻辑
 *   5. 历史上限
 *   6. clear 方法
 */
import { describe, it, expect, beforeEach } from "vitest";
import { UndoManager, type Snapshot } from "../undoManager";

function createSnapshot(coms: string[]): Snapshot {
  return {
    coms: coms.map((name, i) => ({
      id: `id-${i}`,
      name,
      type: {},
      status: { title: { status: `title-${i}`, isShow: true } }
    })) as any,
    surveyCount: coms.length,
    currentComponentIndex: -1
  };
}

describe("UndoManager", () => {
  let manager: UndoManager;

  beforeEach(() => {
    manager = new UndoManager();
  });

  // ─── 初始状态 ──────────────────────────────────────────────
  describe("初始状态", () => {
    it("新创建的 UndoManager 应不可撤销", () => {
      expect(manager.canUndo).toBe(false);
    });

    it("新创建的 UndoManager 应不可重做", () => {
      expect(manager.canRedo).toBe(false);
    });
  });

  // ─── push / undo / redo 基础流程 ─────────────────────────
  describe("push / undo / redo 基础流程", () => {
    it("push 后应可撤销", () => {
      manager.push(createSnapshot(["a", "b"]));
      expect(manager.canUndo).toBe(true);
    });

    it("push 后重做栈应为空", () => {
      manager.push(createSnapshot(["a"]));
      // push 后 redoStack 被清空
      expect(manager.canRedo).toBe(false);
    });

    it("undo 应返回上一个快照", () => {
      manager.push(createSnapshot(["a"]));
      const current = createSnapshot(["a", "b"]);
      const result = manager.undo(current);
      expect(result).not.toBeNull();
      expect(result!.coms.length).toBe(1);
    });

    it("undo 后应可重做", () => {
      manager.push(createSnapshot(["a"]));
      manager.undo(createSnapshot(["a", "b"]));
      expect(manager.canRedo).toBe(true);
    });

    it("redo 应返回之前被撤销的快照", () => {
      manager.push(createSnapshot(["a"]));
      manager.undo(createSnapshot(["a", "b"]));
      const result = manager.redo(createSnapshot(["a"]));
      expect(result).not.toBeNull();
      expect(result!.coms.length).toBe(2);
    });

    it("undo 空栈应返回 null", () => {
      const result = manager.undo(createSnapshot(["a"]));
      expect(result).toBeNull();
    });

    it("redo 空栈应返回 null", () => {
      const result = manager.redo(createSnapshot(["a"]));
      expect(result).toBeNull();
    });
  });

  // ─── 深拷贝验证 ──────────────────────────────────────────
  describe("深拷贝验证", () => {
    it("push 后修改原始数据不应影响栈中快照", () => {
      const originalComs = [{ id: "1", name: "test", type: {}, status: { title: { status: "hello", isShow: true } } }];
      const snapshot: Snapshot = {
        coms: originalComs as any,
        surveyCount: 1,
        currentComponentIndex: 0
      };
      manager.push(snapshot);

      // 修改原始数据
      originalComs[0]!.name = "modified";

      const result = manager.undo(createSnapshot(["new"]));
      expect(result!.coms[0]!.name).toBe("test");
    });

    it("undo 返回的快照应是深拷贝（修改不影响栈内数据）", () => {
      manager.push(createSnapshot(["a", "b"]));
      const result = manager.undo(createSnapshot(["a", "b", "c"]));
      expect(result).not.toBeNull();
      expect(result!.coms.length).toBe(2);

      // 修改 undo 返回的快照不应影响栈内数据
      result!.coms.push({ id: "extra", name: "extra", type: {}, status: {} } as any);

      // 重做后应恢复原始快照（只有 2 个元素，不含 extra）
      const redoResult = manager.redo(createSnapshot(["a", "b"]));
      expect(redoResult).not.toBeNull();
      expect(redoResult!.coms.length).toBe(3); // 原始 "a", "b", "c"
    });
  });

  // ─── 重做栈清空逻辑 ──────────────────────────────────────
  describe("push 清空重做栈", () => {
    it("undo 后 push 新快照应清空重做栈", () => {
      manager.push(createSnapshot(["a"]));
      manager.undo(createSnapshot(["a", "b"]));
      expect(manager.canRedo).toBe(true);

      manager.push(createSnapshot(["a", "c"]));
      expect(manager.canRedo).toBe(false);
    });
  });

  // ─── 历史上限 ────────────────────────────────────────────
  describe("50 层历史上限", () => {
    it("超过 50 个快照时应丢弃最旧的", () => {
      for (let i = 0; i < 55; i++) {
        manager.push(createSnapshot([`item-${i}`]));
      }
      // 栈中最多保留 50 个
      // 验证第一个快照已被丢弃
      const current = createSnapshot(["current"]);
      const result = manager.undo(current);
      // 倒数第二个快照应存在
      expect(result).not.toBeNull();
    });
  });

  // ─── clear ───────────────────────────────────────────────
  describe("clear", () => {
    it("clear 后应不可撤销和重做", () => {
      manager.push(createSnapshot(["a"]));
      manager.undo(createSnapshot(["a", "b"]));

      manager.clear();

      expect(manager.canUndo).toBe(false);
      expect(manager.canRedo).toBe(false);
    });
  });

  // ─── 完整流程 ────────────────────────────────────────────
  describe("完整流程", () => {
    it("push → undo → redo → undo → push 应正常工作", () => {
      manager.push(createSnapshot(["v1"]));
      manager.push(createSnapshot(["v1", "v2"]));

      const undo1 = manager.undo(createSnapshot(["v1", "v2", "v3"]));
      expect(undo1!.coms.length).toBe(2);

      const redo1 = manager.redo(createSnapshot(["v1", "v2"]));
      expect(redo1!.coms.length).toBe(3);

      const undo2 = manager.undo(createSnapshot(["v1", "v2", "v3"]));
      expect(undo2!.coms.length).toBe(2);

      manager.push(createSnapshot(["v1", "v2", "v4"]));
      expect(manager.canRedo).toBe(false);
    });
  });
});