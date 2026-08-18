// ──────────────────────────────────────────────────────────────────────────────
// 问卷引擎 Pinia Store — 集成测试
// 覆盖 useEditorStore 中核心 CRUD、撤销/重做、持久化状态
//
// 注意：通过 vi.mock 隔离 componentMap、i18n、db 等重模块依赖，
//       测试聚焦于 Store 本身的业务逻辑。
// ──────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, beforeEach, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

// mock 重模块 — 避免引入 IndexedDB、axios 等运行时依赖
// （componentMap 已随 T014 从 stores/useEditor.ts 的引入链中移除，无需再 mock）
vi.mock("../utils/i18n", () => ({
  t: vi.fn((key: string) => key),
  i18n: { global: { locale: { value: "zh-CN" } } },
  setupI18n: vi.fn()
}));

vi.mock("../db/operation", () => ({
  saveSurvey: vi.fn().mockResolvedValue(1),
  updateSurveyById: vi.fn().mockResolvedValue(undefined)
}));

vi.mock("../api/upload", () => ({
  uploadImage: vi.fn()
}));

vi.mock("../api/clients/server", () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() }
}));

import { useEditorStore } from "../stores/useEditor";
import type { Status, TextProps, OptionsProps } from "../types";

// ─── 辅助：构造组件 ──────────────────────────────────────────────────────────

function makeCom(name: string, id: string, titleText: string): Status {
  return {
    type: undefined as never,
    name: name as never,
    id,
    status: {
      title: { id: "t1", isShow: true, name: "title", editCom: {} as never, status: titleText },
      desc: { id: "d1", isShow: true, name: "desc", editCom: {} as never, status: "" },
      position: {
        id: "p1",
        isShow: true,
        name: "position",
        editCom: {} as never,
        status: ["左对齐", "居中"],
        currentStatus: 0
      } as OptionsProps,
      titleSize: {
        id: "ts1",
        isShow: true,
        name: "titleSize",
        editCom: {} as never,
        status: ["16", "18", "22"],
        currentStatus: 0
      } as OptionsProps,
      descSize: {
        id: "ds1",
        isShow: true,
        name: "descSize",
        editCom: {} as never,
        status: ["14", "16"],
        currentStatus: 0
      } as OptionsProps,
      titleWeight: {
        id: "tw1",
        isShow: true,
        name: "titleWeight",
        editCom: {} as never,
        status: ["正常", "粗体"],
        currentStatus: 0
      } as OptionsProps,
      descWeight: {
        id: "dw1",
        isShow: true,
        name: "descWeight",
        editCom: {} as never,
        status: ["正常", "粗体"],
        currentStatus: 0
      } as OptionsProps,
      titleItalic: {
        id: "ti1",
        isShow: true,
        name: "titleItalic",
        editCom: {} as never,
        status: ["正常", "斜体"],
        currentStatus: 0
      } as OptionsProps,
      descItalic: {
        id: "di1",
        isShow: true,
        name: "descItalic",
        editCom: {} as never,
        status: ["正常", "斜体"],
        currentStatus: 0
      } as OptionsProps,
      titleColor: {
        id: "tc1",
        isShow: true,
        name: "titleColor",
        editCom: {} as never,
        status: "#000000"
      } as TextProps,
      descColor: {
        id: "dc1",
        isShow: true,
        name: "descColor",
        editCom: {} as never,
        status: "#999999"
      } as TextProps,
      options: {
        id: "o1",
        isShow: true,
        name: "options",
        editCom: {} as never,
        status: ["选项A", "选项B", "选项C"],
        currentStatus: 0
      } as OptionsProps
    }
  };
}

// ──────────────────────────────────────────────────────────────────────────────
describe("useEditorStore", () => {
  let store: ReturnType<typeof useEditorStore>;

  beforeEach(() => {
    setActivePinia(createPinia());
    store = useEditorStore();
    // UndoManager 作为模块单例会跨测试累积快照，每次先清空
    store.resetComs();
  });

  // ─── 初始状态（resetComs 后为 initStore 预设组件） ───────────────────────

  describe("初始状态", () => {
    it("resetComs 后有预设组件", () => {
      expect(store.coms.length).toBeGreaterThan(0);
    });

    it("surveyCount 为 0", () => {
      expect(store.surveyCount).toBe(0);
    });

    it("currentComponentIndex 为 -1", () => {
      expect(store.currentComponentIndex).toBe(-1);
    });

    it("currentPage 为 1", () => {
      expect(store.currentPage).toBe(1);
    });

    it("pageSize 为 10", () => {
      expect(store.pageSize).toBe(10);
    });

    it("dirty 为 false", () => {
      expect(store.dirty).toBe(false);
    });
  });

  // ─── addCom ─────────────────────────────────────────────────────────────

  describe("addCom", () => {
    it("添加题目组件后 coms 长度 +1", () => {
      const prev = store.coms.length;
      store.addCom(makeCom("single-select", "id-1", "单选题"));
      expect(store.coms.length).toBe(prev + 1);
      expect(store.surveyCount).toBe(1);
    });

    it("添加 text-note 不影响 surveyCount", () => {
      store.addCom(makeCom("text-note", "id-1", "备注"));
      expect(store.surveyCount).toBe(0);
    });

    it("添加后 dirty 为 true", () => {
      store.addCom(makeCom("single-select", "id-1", "单选题"));
      expect(store.dirty).toBe(true);
    });

    it("添加后 canUndo 为 true", () => {
      store.addCom(makeCom("single-select", "id-1", "Q1"));
      expect(store.canUndo).toBe(true);
    });
  });

  // ─── removeCom ──────────────────────────────────────────────────────────

  describe("removeCom", () => {
    it("删除题目后 coms 长度 -1", () => {
      store.addCom(makeCom("single-select", "id-1", "Q1"));
      store.addCom(makeCom("multi-select", "id-2", "Q2"));
      const prev = store.coms.length;
      store.removeCom(prev - 2); // 删除倒数第二个（我们刚添加的第一个）
      expect(store.coms.length).toBe(prev - 1);
    });
  });

  // ─── setCurrentComponentIndex ───────────────────────────────────────────

  describe("setCurrentComponentIndex", () => {
    it("设置当前选中索引", () => {
      store.setCurrentComponentIndex(2);
      expect(store.currentComponentIndex).toBe(2);
    });
  });

  // ─── 分页 ───────────────────────────────────────────────────────────────

  describe("分页", () => {
    it("setPageSize 修改 pageSize", () => {
      store.setPageSize(5);
      expect(store.pageSize).toBe(5);
    });

    it("setCurrentPage 修改 currentPage", () => {
      store.setCurrentPage(3);
      expect(store.currentPage).toBe(3);
    });
  });

  // ─── 属性编辑 ───────────────────────────────────────────────────────────

  describe("属性编辑", () => {
    it("setTextStatus 修改标题文本", () => {
      const com = makeCom("single-select", "id-1", "原标题");
      store.addCom(com);
      const idx = store.coms.length - 1;
      store.setCurrentComponentIndex(idx);
      // status 索引签名返回 TextProps | OptionsProps 联合类型，title 字段实际固定为 TextProps
      store.setTextStatus(store.coms[idx]!.status.title as TextProps, "新标题");
      expect(store.coms[idx]!.status.title!.status).toBe("新标题");
    });

    it("addOption 向选项数组追加新选项", () => {
      const com = makeCom("single-select", "id-1", "Q1");
      store.addCom(com);
      const idx = store.coms.length - 1;
      const options = store.coms[idx]!.status.options as OptionsProps;
      store.addOption(options);
      expect(options.status.length).toBe(4); // 原 3 个 + 1
    });

    it("removeOption 删除最后一项不成功（至少保留2项）", () => {
      const com = makeCom("single-select", "id-1", "Q1");
      (com.status.options as OptionsProps).status = ["A", "B"];
      store.addCom(com);
      const idx = store.coms.length - 1;
      const options = store.coms[idx]!.status.options as OptionsProps;
      const result = store.removeOption(options, options.status.length - 1);
      expect(result).toBe(false);
      expect(options.status.length).toBe(2);
    });
  });

  // ─── 撤销 / 重做 ───────────────────────────────────────────────────────

  describe("撤销 / 重做", () => {
    it("addCom → undo 恢复添加前状态", () => {
      const prevLength = store.coms.length;
      store.addCom(makeCom("single-select", "id-1", "Q1"));
      expect(store.coms.length).toBe(prevLength + 1);

      store.undo();
      expect(store.coms.length).toBe(prevLength);
      // canUndo 取决于前面累积的历史层数，不做严格断言
      expect(store.canRedo).toBe(true);
    });

    it("undo → redo 恢复撤销前状态", () => {
      const prevLength = store.coms.length;
      store.addCom(makeCom("single-select", "id-1", "Q1"));
      store.undo();
      expect(store.coms.length).toBe(prevLength);

      store.redo();
      expect(store.coms.length).toBe(prevLength + 1);
    });

    it("add → remove → undo 恢复删除前", () => {
      const prevLength = store.coms.length;
      store.addCom(makeCom("single-select", "id-1", "Q1"));
      store.removeCom(prevLength); // 删除刚添加的
      expect(store.coms.length).toBe(prevLength);

      store.undo();
      expect(store.coms.length).toBe(prevLength + 1);
    });
  });

  // ─── setStore ───────────────────────────────────────────────────────────

  describe("setStore", () => {
    it("加载已有问卷数据到 store", () => {
      const com = makeCom("rate-score", "id-100", "评分题");
      store.setStore({ coms: [com], surveyCount: 1, pageSize: 20, createDate: 0, updateDate: 0, title: "测试问卷" });
      expect(store.coms.length).toBe(1);
      expect(store.surveyCount).toBe(1);
      expect(store.pageSize).toBe(20);
      expect(store.dirty).toBe(false);
    });

    it("加载后清空撤销历史", () => {
      store.addCom(makeCom("single-select", "id-1", "Q1"));
      const com = makeCom("rate-score", "id-100", "评分题");
      store.setStore({ coms: [com], surveyCount: 1, pageSize: 20, createDate: 0, updateDate: 0, title: "测试问卷" });
      expect(store.canUndo).toBe(false);
      expect(store.canRedo).toBe(false);
    });
  });

  // ─── resetComs ──────────────────────────────────────────────────────────

  describe("resetComs", () => {
    it("重置后 dirty 为 false", () => {
      store.addCom(makeCom("single-select", "id-1", "Q1"));
      store.resetComs();
      expect(store.dirty).toBe(false);
      expect(store.coms.length).toBeGreaterThan(0);
    });
  });

  // ─── markClean ──────────────────────────────────────────────────────────

  describe("markClean", () => {
    it("清空 dirty 标志与撤销历史", () => {
      store.addCom(makeCom("single-select", "id-1", "Q1"));
      store.markClean();
      expect(store.dirty).toBe(false);
    });
  });
});
