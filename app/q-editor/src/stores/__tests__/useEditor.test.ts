/**
 * 编辑器 Store 覆盖/追加模式单元测试
 *
 * 测试范围：
 *   1. 覆盖模式：resetComs + addCom 组合
 *   2. 追加模式：仅 addCom（保留原有内容）
 *   3. dirty 状态管理
 *   4. 数据安全性：追加不修改原有内容
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useEditorStore } from "../useEditor";
import type { Status, SurveyDBData } from "@/types";

// Mock db operations
vi.mock("@/db/operation", () => ({
  saveSurvey: vi.fn().mockResolvedValue(1),
  updateSurveyById: vi.fn().mockResolvedValue(undefined)
}));

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

  // ─── 撤销/重做 ──────────────────────────────────────────────
  describe("撤销/重做", () => {
    it("初始状态应不可撤销和重做", () => {
      expect(store.canUndo).toBe(false);
      expect(store.canRedo).toBe(false);
    });

    it("addCom 后应可撤销", () => {
      store.addCom(createMockStatus("single-select", "测试"));
      expect(store.canUndo).toBe(true);
    });

    it("undo 应恢复上一个状态", () => {
      const beforeLength = store.coms.length;
      store.addCom(createMockStatus("single-select", "新增"));
      store.undo();
      expect(store.coms.length).toBe(beforeLength);
    });

    it("undo 后应可重做", () => {
      store.addCom(createMockStatus("single-select", "新增"));
      store.undo();
      expect(store.canRedo).toBe(true);
    });

    it("redo 应恢复被撤销的操作", () => {
      store.addCom(createMockStatus("single-select", "新增"));
      const afterAddLength = store.coms.length;
      store.undo();
      store.redo();
      expect(store.coms.length).toBe(afterAddLength);
    });

    it("markClean 后应不可撤销", () => {
      store.addCom(createMockStatus("single-select", "测试"));
      store.markClean();
      expect(store.canUndo).toBe(false);
    });
  });

  // ─── 组件操作 ──────────────────────────────────────────────
  describe("组件增删", () => {
    it("removeCom 应删除指定索引的组件", () => {
      const beforeLength = store.coms.length;
      store.removeCom(0);
      expect(store.coms.length).toBe(beforeLength - 1);
    });

    it("setCurrentComponentIndex 应更新当前选中索引", () => {
      store.setCurrentComponentIndex(2);
      expect(store.currentComponentIndex).toBe(2);
    });

    it("addCom 应递增 surveyCount", () => {
      const before = store.surveyCount;
      store.addCom(createMockStatus("single-select", "测试"));
      expect(store.surveyCount).toBe(before + 1);
    });

    it("addCom 添加 text-note 不应递增 surveyCount", () => {
      const before = store.surveyCount;
      store.addCom(createMockStatus("text-note", "备注"));
      expect(store.surveyCount).toBe(before);
    });
  });

  // ─── 属性编辑 ──────────────────────────────────────────────
  describe("属性编辑", () => {
    it("setTextStatus 应修改文本状态", () => {
      store.addCom(createMockStatus("single-select", "原标题"));
      const idx = store.coms.length - 1;
      const textProps = (store.coms[idx]!.status as Record<string, unknown>).title as { status: string };
      store.setTextStatus(textProps as any, "新标题");
      expect(textProps.status).toBe("新标题");
    });

    it("setPosition 应修改位置", () => {
      const optionProps = { currentStatus: 0, status: ["left", "center", "right"], isShow: true } as any;
      store.setPosition(optionProps, 2);
      expect(optionProps.currentStatus).toBe(2);
    });

    it("setSize 应修改大小", () => {
      const optionProps = { currentStatus: 0, status: ["small", "medium", "large"], isShow: true } as any;
      store.setSize(optionProps, 1);
      expect(optionProps.currentStatus).toBe(1);
    });

    it("setWeight 应修改权重", () => {
      const optionProps = { currentStatus: 0, status: ["normal", "bold"], isShow: true } as any;
      store.setWeight(optionProps, 1);
      expect(optionProps.currentStatus).toBe(1);
    });

    it("setItalic 应修改斜体", () => {
      const optionProps = { currentStatus: 0, status: ["normal", "italic"], isShow: true } as any;
      store.setItalic(optionProps, 1);
      expect(optionProps.currentStatus).toBe(1);
    });

    it("setColor 应修改颜色", () => {
      const textProps = { status: "#000", isShow: true } as any;
      store.setColor(textProps, "#ff0000");
      expect(textProps.status).toBe("#ff0000");
    });

    it("setCurrentStatus 应修改当前状态", () => {
      const optionProps = { currentStatus: 0, status: ["a", "b", "c"], isShow: true } as any;
      store.setCurrentStatus(optionProps, 2);
      expect(optionProps.currentStatus).toBe(2);
    });
  });

  // ─── 分页 ──────────────────────────────────────────────────
  describe("分页", () => {
    it("setPageSize 应更新分页大小", () => {
      store.setPageSize(20);
      expect(store.pageSize).toBe(20);
    });

    it("setCurrentPage 应更新当前页", () => {
      store.setCurrentPage(3);
      expect(store.currentPage).toBe(3);
    });
  });

  // ─── 持久化 ────────────────────────────────────────────────
  describe("持久化", () => {
    it("saveComs 应保存并返回 id", async () => {
      const surveyData: SurveyDBData = {
        surveyCount: 1,
        coms: [],
        pageSize: 10,
        remote_survey_id: null
      } as SurveyDBData;
      const id = await store.saveComs(surveyData);
      expect(id).toBe(1);
      expect(store.savedSurveyId).toBe(1);
      expect(store.dirty).toBe(false);
    });

    it("updateComs 应更新问卷", async () => {
      const surveyData: SurveyDBData = {
        surveyCount: 1,
        coms: [],
        pageSize: 10,
        remote_survey_id: null
      } as SurveyDBData;
      await store.updateComs(1, surveyData);
      expect(store.dirty).toBe(false);
    });
  });

  // ─── 远程同步状态 ──────────────────────────────────────────
  describe("远程同步状态", () => {
    it("setRemoteSynced 应设置远程 ID", () => {
      store.setRemoteSynced("123456789");
      expect(store.remoteSurveyId).toBe("123456789");
    });

    it("setRemoteUnsynced 应清除远程 ID", () => {
      store.setRemoteSynced("123456789");
      store.setRemoteUnsynced();
      expect(store.remoteSurveyId).toBeNull();
    });
  });

  // ─── setStore 加载已有问卷 ─────────────────────────────────
  describe("setStore 加载已有问卷", () => {
    it("应正确加载问卷数据", () => {
      const data: SurveyDBData = {
        surveyCount: 3,
        coms: [
          createMockStatus("single-select", "题目1"),
          createMockStatus("multi-select", "题目2"),
          createMockStatus("text-input", "题目3")
        ],
        pageSize: 20,
        remote_survey_id: "remote-123"
      } as SurveyDBData;
      store.setStore(data, 42);
      expect(store.surveyCount).toBe(3);
      expect(store.coms.length).toBe(3);
      expect(store.pageSize).toBe(20);
      expect(store.savedSurveyId).toBe(42);
      expect(store.remoteSurveyId).toBe("remote-123");
      expect(store.currentComponentIndex).toBe(-1);
      expect(store.dirty).toBe(false);
    });
  });

  // ─── _pushSnapshot ─────────────────────────────────────────
  describe("_pushSnapshot", () => {
    it("应允许外部推入快照", () => {
      const snapshot = {
        coms: [createMockStatus("single-select", "外部快照")],
        surveyCount: 1,
        currentComponentIndex: 0
      };
      store._pushSnapshot(snapshot);
      expect(store.canUndo).toBe(true);
    });
  });

  // ─── editorVersion ─────────────────────────────────────────
  describe("editorVersion", () => {
    it("undo 后 editorVersion 应递增", () => {
      store.addCom(createMockStatus("single-select", "测试"));
      const before = store.editorVersion;
      store.undo();
      expect(store.editorVersion).toBe(before + 1);
    });

    it("redo 后 editorVersion 应递增", () => {
      store.addCom(createMockStatus("single-select", "测试"));
      store.undo();
      const before = store.editorVersion;
      store.redo();
      expect(store.editorVersion).toBe(before + 1);
    });
  });
});
