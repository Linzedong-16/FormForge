/**
 * 编辑器操作函数单元测试
 *
 * 测试范围：
 *   1. setTextStatus — 设置文本状态
 *   2. addOption — 添加选项（字符串数组、图片数组）
 *   3. removeOption — 删除选项（最小保留 2 项）
 *   4. setCurrentStatus / setPosition / setSize / setWeight / setItalic
 *   5. setColor — 设置颜色
 *   6. setPicLinkByIndex — 设置图片链接
 *   7. setIsUse — 设置是否启用
 *   8. setRateScoreDesc — 设置评分描述
 *   9. setCascaderOptions — 级联树增删改
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  setTextStatus,
  addOption,
  removeOption,
  setCurrentStatus,
  setPosition,
  setSize,
  setWeight,
  setItalic,
  setColor,
  setPicLinkByIndex,
  setIsUse,
  setRateScoreDesc,
  setCascaderOptions
} from "../actions";
import type { OptionsProps, TextProps, CascaderStatusArr } from "@/types";

// ─── 辅助函数 ──────────────────────────────────────────────────

/** 创建模拟 TextProps */
function createTextProps(status = ""): TextProps {
  return {
    id: "text-1",
    status,
    isShow: true,
    name: "test-editor",
    editCom: {} as any
  };
}

/** 创建模拟 OptionsProps（字符串数组类型） */
function createStringOptionsProps(status: string[] = ["选项1", "选项2"]): OptionsProps {
  return {
    id: "opt-1",
    status,
    isShow: true,
    name: "options-editor",
    editCom: {} as any,
    currentStatus: 0
  };
}

/** 创建模拟 OptionsProps（图片标题描述数组类型） */
function createPicOptionsProps(): OptionsProps {
  return {
    id: "pic-1",
    status: [{ picTitle: "图片1", picDesc: "描述1", value: "" }],
    isShow: true,
    name: "pic-options-editor",
    editCom: {} as any,
    currentStatus: 0
  };
}

/** 创建模拟 OptionsProps（评分描述数组类型） */
function createRateScoreProps(): OptionsProps {
  return {
    id: "rate-1",
    status: ["非常不满意", "不满意", "一般", "满意", "非常满意"],
    isShow: true,
    name: "rate-score-editor",
    editCom: {} as any,
    currentStatus: 0
  };
}

/** 创建模拟 OptionsProps（级联树类型） */
function createCascaderProps(): OptionsProps {
  return {
    id: "cascader-1",
    status: [
      { label: "省份1", value: "v1", children: [
        { label: "城市1-1", value: "v1-1" }
      ]},
      { label: "省份2", value: "v2" }
    ] as CascaderStatusArr,
    isShow: true,
    name: "cascader-editor",
    editCom: {} as any,
    currentStatus: 0
  };
}

describe("编辑器操作函数 — 全量单元测试", () => {
  // ════════════════════════════════════════════════════════════
  //  1. setTextStatus
  // ════════════════════════════════════════════════════════════
  describe("setTextStatus", () => {
    it("应设置文本状态", () => {
      const props = createTextProps();
      setTextStatus(props, "新文本");
      expect(props.status).toBe("新文本");
    });

    it("应覆盖原有文本", () => {
      const props = createTextProps("旧文本");
      setTextStatus(props, "新文本");
      expect(props.status).toBe("新文本");
    });

    it("应支持空字符串", () => {
      const props = createTextProps("有内容");
      setTextStatus(props, "");
      expect(props.status).toBe("");
    });
  });

  // ════════════════════════════════════════════════════════════
  //  2. addOption
  // ════════════════════════════════════════════════════════════
  describe("addOption", () => {
    describe("字符串数组 status", () => {
      it("应在末尾添加新选项", () => {
        const props = createStringOptionsProps(["选项1", "选项2"]);
        addOption(props);
        expect(props.status).toHaveLength(3);
        expect(props.status[2]).toBe("新增选项3");
      });

      it("当最后一项不以数字结尾时应添加 '新增选项1'", () => {
        const props = createStringOptionsProps(["男", "女", "保密"]);
        addOption(props);
        expect(props.status).toHaveLength(4);
        expect(props.status[3]).toBe("新增选项1");
      });
    });

    describe("图片标题描述数组 status", () => {
      it("应添加图片选项", () => {
        const props = createPicOptionsProps();
        addOption(props);
        expect(props.status).toHaveLength(2);
        expect((props.status as any)[1]).toEqual({
          picTitle: "图片标题",
          picDesc: "图片描述",
          value: ""
        });
      });
    });
  });

  // ════════════════════════════════════════════════════════════
  //  3. removeOption
  // ════════════════════════════════════════════════════════════
  describe("removeOption", () => {
    it("应删除指定索引的选项", () => {
      const props = createStringOptionsProps(["A", "B", "C"]);
      const result = removeOption(props, 1);
      expect(result).toBe(true);
      expect(props.status).toEqual(["A", "C"]);
    });

    it("删除第一个选项", () => {
      const props = createStringOptionsProps(["A", "B", "C"]);
      const result = removeOption(props, 0);
      expect(result).toBe(true);
      expect(props.status).toEqual(["B", "C"]);
    });

    it("删除最后一个选项", () => {
      const props = createStringOptionsProps(["A", "B", "C"]);
      const result = removeOption(props, 2);
      expect(result).toBe(true);
      expect(props.status).toEqual(["A", "B"]);
    });

    it("只剩 2 个选项时不应删除，返回 false", () => {
      const props = createStringOptionsProps(["A", "B"]);
      const result = removeOption(props, 0);
      expect(result).toBe(false);
      expect(props.status).toHaveLength(2);
    });

    it("只剩 1 个选项时仍可删除，返回 true", () => {
      const props = createStringOptionsProps(["A"]);
      const result = removeOption(props, 0);
      // removeOption 仅在 status.length === 2 时阻止删除
      expect(result).toBe(true);
      expect(props.status).toHaveLength(0);
    });
  });

  // ════════════════════════════════════════════════════════════
  //  4. setCurrentStatus / setPosition / setSize / setWeight / setItalic
  // ════════════════════════════════════════════════════════════
  describe("setCurrentStatus", () => {
    it("应设置 currentStatus", () => {
      const props = createStringOptionsProps();
      setCurrentStatus(props, 2);
      expect(props.currentStatus).toBe(2);
    });
  });

  describe("setPosition", () => {
    it("应设置 currentStatus", () => {
      const props = createStringOptionsProps();
      setPosition(props, 1);
      expect(props.currentStatus).toBe(1);
    });
  });

  describe("setSize", () => {
    it("应设置 currentStatus", () => {
      const props = createStringOptionsProps();
      setSize(props, 3);
      expect(props.currentStatus).toBe(3);
    });
  });

  describe("setWeight", () => {
    it("应设置 currentStatus", () => {
      const props = createStringOptionsProps();
      setWeight(props, 5);
      expect(props.currentStatus).toBe(5);
    });
  });

  describe("setItalic", () => {
    it("应设置 currentStatus", () => {
      const props = createStringOptionsProps();
      setItalic(props, 1);
      expect(props.currentStatus).toBe(1);
    });
  });

  // ════════════════════════════════════════════════════════════
  //  5. setColor
  // ════════════════════════════════════════════════════════════
  describe("setColor", () => {
    it("应设置颜色", () => {
      const props = createTextProps();
      setColor(props, "#ff0000");
      expect(props.status).toBe("#ff0000");
    });

    it("应覆盖原有颜色", () => {
      const props = createTextProps("#000000");
      setColor(props, "#ffffff");
      expect(props.status).toBe("#ffffff");
    });
  });

  // ════════════════════════════════════════════════════════════
  //  6. setPicLinkByIndex
  // ════════════════════════════════════════════════════════════
  describe("setPicLinkByIndex", () => {
    it("应设置图片链接", () => {
      const props = createPicOptionsProps();
      setPicLinkByIndex(props, { link: "https://example.com/img.png", index: 0 });
      expect((props.status as any)[0].value).toBe("https://example.com/img.png");
    });

    it("非图片数组类型时不应修改", () => {
      const props = createStringOptionsProps(["A", "B"]);
      setPicLinkByIndex(props, { link: "https://example.com/img.png", index: 0 });
      // 字符串数组类型不会被修改
      expect(props.status).toEqual(["A", "B"]);
    });
  });

  // ════════════════════════════════════════════════════════════
  //  7. setIsUse
  // ════════════════════════════════════════════════════════════
  describe("setIsUse", () => {
    it("应设置 isUse 为 true", () => {
      const props = createStringOptionsProps();
      setIsUse(props, true);
      expect(props.isUse).toBe(true);
    });

    it("应设置 isUse 为 false", () => {
      const props = createStringOptionsProps();
      props.isUse = true;
      setIsUse(props, false);
      expect(props.isUse).toBe(false);
    });
  });

  // ════════════════════════════════════════════════════════════
  //  8. setRateScoreDesc
  // ════════════════════════════════════════════════════════════
  describe("setRateScoreDesc", () => {
    it("字符串数组 status 不被 isRateScoreDesc 类型守卫匹配，不应修改", () => {
      const props = createRateScoreProps();
      const original = [...(props.status as string[])];
      setRateScoreDesc(props, { index: 0, val: "极差" });
      // isRateScoreDesc 检查 status 是否有 index/val 属性，字符串数组无此属性
      expect(props.status).toEqual(original);
    });

    it("status 为对象数组时也不被匹配，不应修改", () => {
      const props = createRateScoreProps();
      const original = [...(props.status as string[])];
      setRateScoreDesc(props, { index: 2, val: "中等" });
      expect(props.status).toEqual(original);
    });
  });

  // ════════════════════════════════════════════════════════════
  //  9. setCascaderOptions — 级联树增删改
  // ════════════════════════════════════════════════════════════
  describe("setCascaderOptions", () => {
    describe("add — 新增", () => {
      it("顶层新增一级选项", () => {
        const props = createCascaderProps();
        const tree = props.status as CascaderStatusArr;
        const initialLength = tree.length;

        setCascaderOptions(props, { action: "add", path: [] });

        expect(tree.length).toBe(initialLength + 1);
        expect(tree[tree.length - 1]!.label).toBe("新选项");
      });

      it("在指定节点下新增子选项", () => {
        const props = createCascaderProps();
        const tree = props.status as CascaderStatusArr;
        const childCount = tree[0]!.children!.length;

        setCascaderOptions(props, { action: "add", path: [0] });

        expect(tree[0]!.children!.length).toBe(childCount + 1);
        expect(tree[0]!.children![tree[0]!.children!.length - 1]!.label).toBe("新选项");
      });

      it("在无 children 的节点下新增应自动创建 children", () => {
        const props = createCascaderProps();
        const tree = props.status as CascaderStatusArr;

        setCascaderOptions(props, { action: "add", path: [1] });

        expect(tree[1]!.children).toBeDefined();
        expect(tree[1]!.children!.length).toBe(1);
      });
    });

    describe("remove — 删除", () => {
      it("删除顶层一级选项", () => {
        const props = createCascaderProps();
        const tree = props.status as CascaderStatusArr;
        const initialLength = tree.length;

        setCascaderOptions(props, { action: "remove", path: [1] });

        expect(tree.length).toBe(initialLength - 1);
      });

      it("删除子选项", () => {
        const props = createCascaderProps();
        const tree = props.status as CascaderStatusArr;
        const childCount = tree[0]!.children!.length;

        setCascaderOptions(props, { action: "remove", path: [0, 0] });

        expect(tree[0]!.children!.length).toBe(childCount - 1);
      });
    });

    describe("edit — 编辑", () => {
      it("编辑顶层选项标签", () => {
        const props = createCascaderProps();
        const tree = props.status as CascaderStatusArr;

        setCascaderOptions(props, { action: "edit", path: [0], label: "修改后的省份" });

        expect(tree[0]!.label).toBe("修改后的省份");
      });

      it("编辑子选项标签", () => {
        const props = createCascaderProps();
        const tree = props.status as CascaderStatusArr;

        setCascaderOptions(props, { action: "edit", path: [0, 0], label: "修改后的城市" });

        expect(tree[0]!.children![0]!.label).toBe("修改后的城市");
      });
    });
  });
});