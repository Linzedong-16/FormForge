// ──────────────────────────────────────────────────────────────────────────────
// 问卷引擎 撤销/重做 管理器 — 单元测试
// 覆盖 core/orchestration/undoManager.ts 中 UndoManager 的全部功能
// 原位于 src/__tests__/undoManager.spec.ts，随 T029 迁移至此，仅调整 import 路径
// ──────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, beforeEach } from "vitest";
import { UndoManager, type Snapshot } from "../undoManager";
import type { Status } from "../../../types";

// ─── 辅助：构造测试快照 ──────────────────────────────────────────────────────

function makeSnapshot(comsCount: number, surveyCount: number, index: number): Snapshot {
  const coms = Array.from({ length: comsCount }, (_, i) => ({
    type: undefined as never,
    name: "single-select" as const,
    id: `id-${i}`,
    status: {}
  })) as Status[];
  return { coms, surveyCount, currentComponentIndex: index };
}

// ──────────────────────────────────────────────────────────────────────────────
describe("UndoManager", () => {
  let manager: UndoManager;

  beforeEach(() => {
    manager = new UndoManager();
  });

  // ─── push ───────────────────────────────────────────────────────────────

  describe("push", () => {
    it("推入快照后 canUndo 为 true", () => {
      manager.push(makeSnapshot(3, 3, 0));
      expect(manager.canUndo).toBe(true);
    });

    it("push 后清空 redoStack", () => {
      const snap1 = makeSnapshot(1, 1, 0);
      const snap2 = makeSnapshot(2, 2, 0);
      manager.push(snap1);
      // 模拟 undo+redo 产生 redo 栈
      manager.undo(snap2);
      expect(manager.canRedo).toBe(true);
      // 然后 push 新快照 → redoStack 清空
      manager.push(snap2);
      expect(manager.canRedo).toBe(false);
    });

    it("超出 maxHistory 时丢弃最旧快照", () => {
      // 填充 50 层
      for (let i = 0; i < 51; i++) {
        manager.push(makeSnapshot(i + 1, i + 1, 0));
      }
      // 第 51 个 push 后 undoStack 应为 50
      // 无法直接访问 private，通过 undo 50 次来验证
      let undoCount = 0;
      let current = makeSnapshot(100, 100, 0);
      while (manager.canUndo) {
        const snap = manager.undo(current);
        if (snap) {
          current = snap;
          undoCount++;
        }
      }
      // 最多 50 次
      expect(undoCount).toBe(50);
    });
  });

  // ─── undo ───────────────────────────────────────────────────────────────

  describe("undo", () => {
    it("空栈返回 null", () => {
      expect(manager.undo(makeSnapshot(1, 1, 0))).toBeNull();
    });

    it("有快照时返回上一个快照，current 被压入 redoStack", () => {
      const snap1 = makeSnapshot(1, 1, 0);
      const snap2 = makeSnapshot(2, 2, 1);
      manager.push(snap1);
      const result = manager.undo(snap2);
      expect(result).not.toBeNull();
      expect(result!.coms.length).toBe(1);
      expect(result!.surveyCount).toBe(1);
      expect(manager.canUndo).toBe(false); // 只有一层
      expect(manager.canRedo).toBe(true); // 当前态被压入 redoStack
    });

    it("深度拷贝：返回的 coms 与原始快照不是同一个引用", () => {
      const snap = makeSnapshot(1, 1, 0);
      manager.push(snap);
      const result = manager.undo(makeSnapshot(2, 2, 0));
      expect(result?.coms).not.toBe(snap.coms);
    });
  });

  // ─── redo ───────────────────────────────────────────────────────────────

  describe("redo", () => {
    it("空栈返回 null", () => {
      expect(manager.redo(makeSnapshot(1, 1, 0))).toBeNull();
    });

    it("undo 后可 redo 恢复", () => {
      const snap1 = makeSnapshot(1, 1, 0);
      const snap2 = makeSnapshot(2, 2, 1);
      manager.push(snap1);
      manager.undo(snap2);
      const result = manager.redo(snap2);
      expect(result).not.toBeNull();
      expect(result!.surveyCount).toBe(2);
      expect(manager.canRedo).toBe(false);
    });
  });

  // ─── clear ──────────────────────────────────────────────────────────────

  describe("clear", () => {
    it("清空所有历史", () => {
      manager.push(makeSnapshot(1, 1, 0));
      manager.push(makeSnapshot(2, 2, 0));
      manager.clear();
      expect(manager.canUndo).toBe(false);
      expect(manager.canRedo).toBe(false);
    });
  });
});
