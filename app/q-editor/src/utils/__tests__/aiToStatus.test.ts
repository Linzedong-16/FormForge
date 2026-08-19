/**
 * aiToStatus 工具函数单元测试
 *
 * 测试范围：
 *   1. aiComponentsToStatus() — 空数组、有效组件、无效组件、混合场景
 *   2. mergeAIConfigIntoStatus() — 通过 aiComponentsToStatus 间接覆盖
 *   3. regenerateStatusIds() — 通过 aiComponentsToStatus 间接覆盖
 *   4. STATUS_FIELD_MAP — title/desc/options 字段映射
 *   5. 异常处理 — 组件类型不存在、未注册、转换异常
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// ─── Mock 模块（使用 vi.hoisted 避免 hoisting 问题） ────────────

const { mockFactory, mockRestoreComponentStatus } = vi.hoisted(() => {
  return {
    mockFactory: vi.fn(() => ({
      id: "mock-id",
      name: "single-select",
      type: {},
      status: {
        title: { id: "title-id", status: "默认标题", isShow: true, name: "title-editor" },
        desc: { id: "desc-id", status: "默认描述", isShow: true, name: "desc-editor" },
        options: { id: "options-id", status: ["选项1", "选项2"], isShow: true, name: "options-editor", currentStatus: 0 },
        required: { id: "req-id", status: false, isShow: true, name: "required-editor" }
      }
    })),
    mockRestoreComponentStatus: vi.fn()
  };
});

// defaultStatusMap 已随迁移改由 monorepo-survey-engine 提供，物理文件路径为
// packages/survey-engine/src/configs/defaultStatus/defaultStatusMap.ts，借助该包
// "./*": "./src/*" 的 exports 通配声明按同一物理文件单独 mock
vi.mock("monorepo-survey-engine/configs/defaultStatus/defaultStatusMap", () => ({
  defaultStatusMap: {
    "single-select": mockFactory,
    "multi-select": () => ({
      id: "multi-id",
      name: "multi-select",
      type: {},
      status: {
        title: { id: "mt-id", status: "多选题", isShow: true, name: "title-editor" },
        desc: { id: "md-id", status: "", isShow: true, name: "desc-editor" },
        options: { id: "mo-id", status: ["选项A", "选项B"], isShow: true, name: "options-editor", currentStatus: 0 },
        required: { id: "mr-id", status: false, isShow: true, name: "required-editor" }
      }
    }),
    "text-note": () => ({
      id: "note-id",
      name: "text-note",
      type: {},
      status: {
        type: { id: "nt-id", status: 0, currentStatus: 0, isShow: true, name: "text-type-editor" },
        title: { id: "ntt-id", status: "备注", isShow: true, name: "title-editor" },
        desc: { id: "ntd-id", status: "说明", isShow: true, name: "desc-editor" }
      }
    })
  }
}));

// componentMap 已随迁移改由 monorepo-survey-engine 提供，通过 importOriginal 保留该包其余
// 真实导出（如 useEditorStore），仅覆盖 componentMap 为测试所需的最小假组件表
vi.mock("monorepo-survey-engine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("monorepo-survey-engine")>();
  return {
    ...actual,
    componentMap: {
      "single-select": {} as any,
      "multi-select": {} as any,
      "text-note": {} as any
    }
  };
});

vi.mock("@/utils", () => ({
  restoreComponentStatus: mockRestoreComponentStatus
}));

// 必须在 mock 之后导入
import { aiComponentsToStatus } from "../aiToStatus";
import type { AIComponent } from "monorepo-code-common";

describe("aiToStatus — 全量单元测试", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ════════════════════════════════════════════════════════════
  //  1. aiComponentsToStatus — 空数组
  // ════════════════════════════════════════════════════════════
  describe("aiComponentsToStatus — 空数组", () => {
    it("空数组应返回空 statuses 和空 warnings", () => {
      const result = aiComponentsToStatus([]);
      expect(result.statuses).toEqual([]);
      expect(result.warnings).toEqual([]);
    });
  });

  // ════════════════════════════════════════════════════════════
  //  2. aiComponentsToStatus — 有效组件
  // ════════════════════════════════════════════════════════════
  describe("aiComponentsToStatus — 有效组件", () => {
    it("单个有效组件应成功转换", () => {
      const components: AIComponent[] = [
        { type: "single-select", config: { title: "单选题标题" } }
      ];

      const result = aiComponentsToStatus(components);

      expect(result.statuses).toHaveLength(1);
      expect(result.warnings).toHaveLength(0);
      expect(result.statuses[0]!.name).toBe("single-select");
      // ID 被重新生成，不应是原始的 mock-id
      expect(result.statuses[0]!.id).not.toBe("mock-id");
    });

    it("多个有效组件应全部成功转换", () => {
      const components: AIComponent[] = [
        { type: "single-select", config: { title: "第一题" } },
        { type: "multi-select", config: { title: "第二题" } },
        { type: "text-note", config: { title: "备注" } }
      ];

      const result = aiComponentsToStatus(components);

      expect(result.statuses).toHaveLength(3);
      expect(result.warnings).toHaveLength(0);
    });

    it("应调用 restoreComponentStatus 恢复组件引用", () => {
      const components: AIComponent[] = [
        { type: "single-select", config: {} }
      ];

      aiComponentsToStatus(components);
      expect(mockRestoreComponentStatus).toHaveBeenCalledOnce();
    });
  });

  // ════════════════════════════════════════════════════════════
  //  3. aiComponentsToStatus — 无效组件类型
  // ════════════════════════════════════════════════════════════
  describe("aiComponentsToStatus — 无效组件", () => {
    it("不存在的组件类型应产生警告", () => {
      const components: AIComponent[] = [
        { type: "unknown-type", config: {} }
      ];

      const result = aiComponentsToStatus(components);

      expect(result.statuses).toHaveLength(0);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain("unknown-type");
      expect(result.warnings[0]).toContain("不在编辑器中");
    });

    it("不在 componentMap 中的组件应产生警告", () => {
      // "signature" 不在 defaultStatusMap mock 中，先命中"不在编辑器中"警告
      const components: AIComponent[] = [
        { type: "signature", config: {} }
      ];

      const result = aiComponentsToStatus(components);

      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain("不在编辑器中");
    });
  });

  // ════════════════════════════════════════════════════════════
  //  4. aiComponentsToStatus — 混合场景
  // ════════════════════════════════════════════════════════════
  describe("aiComponentsToStatus — 混合场景", () => {
    it("有效和无效组件混合时应正确分组", () => {
      const components: AIComponent[] = [
        { type: "single-select", config: { title: "有效题" } },
        { type: "unknown-type", config: {} },
        { type: "multi-select", config: { title: "另一题" } },
        { type: "another-invalid", config: {} }
      ];

      const result = aiComponentsToStatus(components);

      expect(result.statuses).toHaveLength(2);
      expect(result.warnings).toHaveLength(2);
      expect(result.statuses[0]!.name).toBe("single-select");
      expect(result.statuses[1]!.name).toBe("multi-select");
    });
  });

  // ════════════════════════════════════════════════════════════
  //  5. STATUS_FIELD_MAP — title 字段合并
  // ════════════════════════════════════════════════════════════
  describe("字段合并 — title", () => {
    it("AI config 中的 title 应覆盖默认 title.status", () => {
      const components: AIComponent[] = [
        { type: "single-select", config: { title: "AI 生成的新标题" } }
      ];

      const result = aiComponentsToStatus(components);

      const titleStatus = result.statuses[0]!.status["title"] as any;
      expect(titleStatus.status).toBe("AI 生成的新标题");
    });

    it("AI config 无 title 时应保留默认标题", () => {
      const components: AIComponent[] = [
        { type: "single-select", config: {} }
      ];

      const result = aiComponentsToStatus(components);

      const titleStatus = result.statuses[0]!.status["title"] as any;
      expect(titleStatus.status).toBe("默认标题");
    });
  });

  // ════════════════════════════════════════════════════════════
  //  6. STATUS_FIELD_MAP — desc 字段合并
  // ════════════════════════════════════════════════════════════
  describe("字段合并 — desc", () => {
    it("AI config 中的 desc 应覆盖默认 desc.status", () => {
      const components: AIComponent[] = [
        { type: "single-select", config: { desc: "这是 AI 生成的描述" } }
      ];

      const result = aiComponentsToStatus(components);

      const descStatus = result.statuses[0]!.status["desc"] as any;
      expect(descStatus.status).toBe("这是 AI 生成的描述");
    });
  });

  // ════════════════════════════════════════════════════════════
  //  7. STATUS_FIELD_MAP — options 字段合并
  // ════════════════════════════════════════════════════════════
  describe("字段合并 — options", () => {
    it("AI config 中的 options 数组应覆盖默认 options.status", () => {
      const components: AIComponent[] = [
        { type: "single-select", config: { options: ["选项A", "选项B", "选项C"] } }
      ];

      const result = aiComponentsToStatus(components);

      const optionsStatus = result.statuses[0]!.status["options"] as any;
      expect(optionsStatus.status).toEqual(["选项A", "选项B", "选项C"]);
    });

    it("AI config 中的 options 为嵌套对象时应提取 status", () => {
      const components: AIComponent[] = [
        { type: "single-select", config: { options: { status: ["X", "Y", "Z"] } } }
      ];

      const result = aiComponentsToStatus(components);

      const optionsStatus = result.statuses[0]!.status["options"] as any;
      expect(optionsStatus.status).toEqual(["X", "Y", "Z"]);
    });

    it("空 options 数组不应覆盖默认值", () => {
      const components: AIComponent[] = [
        { type: "single-select", config: { options: [] } }
      ];

      const result = aiComponentsToStatus(components);

      const optionsStatus = result.statuses[0]!.status["options"] as any;
      // 空数组不满足 "length > 0 && every item is string" 的条件，保留默认值
      expect(optionsStatus.status).toEqual(["选项1", "选项2"]);
    });

    it("options 包含非字符串元素时不应覆盖", () => {
      const components: AIComponent[] = [
        { type: "single-select", config: { options: [1, 2, 3] as any } }
      ];

      const result = aiComponentsToStatus(components);

      const optionsStatus = result.statuses[0]!.status["options"] as any;
      expect(optionsStatus.status).toEqual(["选项1", "选项2"]);
    });
  });

  // ════════════════════════════════════════════════════════════
  //  8. ID 重新生成
  // ════════════════════════════════════════════════════════════
  describe("ID 重新生成", () => {
    it("顶层 Status.id 应被重新生成", () => {
      const components: AIComponent[] = [
        { type: "single-select", config: {} }
      ];

      const result = aiComponentsToStatus(components);

      expect(result.statuses[0]!.id).not.toBe("mock-id");
      // 应为有效的 UUID 格式
      expect(result.statuses[0]!.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
    });

    it("嵌套 status 中的 id 应被重新生成", () => {
      const components: AIComponent[] = [
        { type: "single-select", config: {} }
      ];

      const result = aiComponentsToStatus(components);

      const titleStatus = result.statuses[0]!.status["title"] as any;
      const optionsStatus = result.statuses[0]!.status["options"] as any;

      expect(titleStatus.id).not.toBe("title-id");
      expect(optionsStatus.id).not.toBe("options-id");
      expect(titleStatus.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });

    it("两个组件的 ID 应互不相同", () => {
      const components: AIComponent[] = [
        { type: "single-select", config: {} },
        { type: "multi-select", config: {} }
      ];

      const result = aiComponentsToStatus(components);

      expect(result.statuses[0]!.id).not.toBe(result.statuses[1]!.id);
    });
  });

  // ════════════════════════════════════════════════════════════
  //  9. 边界条件
  // ════════════════════════════════════════════════════════════
  describe("边界条件", () => {
    it("config 为 null 时 mergeAIConfig 会抛异常，组件被跳过并产生警告", () => {
      const components: AIComponent[] = [
        { type: "single-select", config: null as any }
      ];

      const result = aiComponentsToStatus(components);

      // mergeAIConfigIntoStatus 中 config[aiField] 会触发 TypeError，被 try-catch 捕获
      expect(result.statuses).toHaveLength(0);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain("转换失败");
    });

    it("config 中包含未知字段时不应影响转换", () => {
      const components: AIComponent[] = [
        { type: "single-select", config: { title: "标题", unknownField: "未知值" } }
      ];

      const result = aiComponentsToStatus(components);

      expect(result.statuses).toHaveLength(1);
      expect(result.warnings).toHaveLength(0);
      const titleStatus = result.statuses[0]!.status["title"] as any;
      expect(titleStatus.status).toBe("标题");
    });

    it("多个相同类型组件应各自独立转换", () => {
      const components: AIComponent[] = [
        { type: "single-select", config: { title: "第一题" } },
        { type: "single-select", config: { title: "第二题" } }
      ];

      const result = aiComponentsToStatus(components);

      expect(result.statuses).toHaveLength(2);
      const t1 = result.statuses[0]!.status["title"] as any;
      const t2 = result.statuses[1]!.status["title"] as any;
      expect(t1.status).toBe("第一题");
      expect(t2.status).toBe("第二题");
    });
  });
});