/**
 * 问卷模块 API 单元测试
 *
 * 测试范围（核心工具函数）：
 *   1. serializeComponents — Status[] → SurveyComponentPayload[]
 *   2. extractSurveyMetadata — 从组件中提取标题/描述
 *   3. getSurveyMetadata — Store 优先回退
 *   4. serializeAnswers — 前端答案格式 → 后端提交格式
 *   5. deserializeSurveyDetail — 后端响应 → 前端 Status[]
 *   6. getComponentMap — 组件 id → order_index 映射
 */
import { describe, it, expect } from "vitest";
import {
  serializeComponents,
  extractSurveyMetadata,
  getSurveyMetadata,
  serializeAnswers,
  deserializeSurveyDetail,
  getComponentMap
} from "../index";

// ============================================================
// serializeComponents
// ============================================================
describe("serializeComponents", () => {
  it("空数组应返回空数组", () => {
    expect(serializeComponents([])).toEqual([]);
  });

  it("应正确转换 type（kebab-case → snake_case）", () => {
    const result = serializeComponents([
      { name: "single-select", status: {} },
      { name: "multi-pic-select", status: {} },
      { name: "text-input", status: {} }
    ]);
    expect(result[0].type).toBe("single_select");
    expect(result[1].type).toBe("multi_pic_select");
    expect(result[2].type).toBe("text_input");
  });

  it("应正确设置 order_index（从 0 开始递增）", () => {
    const result = serializeComponents([
      { name: "single-select", status: {} },
      { name: "multi-select", status: {} },
      { name: "text-note", status: {} }
    ]);
    expect(result[0].order_index).toBe(0);
    expect(result[1].order_index).toBe(1);
    expect(result[2].order_index).toBe(2);
  });

  it("required 为 boolean true 时应转为 1", () => {
    const result = serializeComponents([
      { name: "single-select", status: { required: true } }
    ] as any);
    expect(result[0].required).toBe(1);
  });

  it("required 为 boolean false 时应转为 0", () => {
    const result = serializeComponents([
      { name: "single-select", status: { required: false } }
    ] as any);
    expect(result[0].required).toBe(0);
  });

  it("required 为数字 1 时应保留为 1", () => {
    const result = serializeComponents([
      { name: "single-select", status: { required: 1 } }
    ] as any);
    expect(result[0].required).toBe(1);
  });

  it("required 为数字 0 时应保留为 0", () => {
    const result = serializeComponents([
      { name: "single-select", status: { required: 0 } }
    ] as any);
    expect(result[0].required).toBe(0);
  });

  it("required 为对象 { status: true } 时应转为 1", () => {
    const result = serializeComponents([
      { name: "single-select", status: { required: { status: true } } }
    ] as any);
    expect(result[0].required).toBe(1);
  });

  it("required 为对象 { status: false } 时应转为 0", () => {
    const result = serializeComponents([
      { name: "single-select", status: { required: { status: false } } }
    ] as any);
    expect(result[0].required).toBe(0);
  });

  it("config 应移除 editCom 和 id 字段", () => {
    const result = serializeComponents([
      {
        name: "single-select",
        status: {
          title: { status: "标题", isShow: true, editCom: () => {}, id: "uuid-1" },
          options: { status: ["选项1", "选项2"], editCom: () => {}, id: "uuid-2" }
        }
      }
    ] as any);
    const config = result[0].config;
    const titleConfig = config.title as Record<string, unknown>;
    const optionsConfig = config.options as Record<string, unknown>;
    expect(titleConfig).not.toHaveProperty("editCom");
    expect(titleConfig).not.toHaveProperty("id");
    expect(titleConfig).toHaveProperty("status");
    expect(titleConfig).toHaveProperty("isShow");
    expect(optionsConfig).not.toHaveProperty("editCom");
    expect(optionsConfig).not.toHaveProperty("id");
  });

  it("config 应保留业务数据字段", () => {
    const result = serializeComponents([
      {
        name: "single-select",
        status: {
          title: { status: "单选题", isShow: true },
          desc: { status: "描述", isShow: false },
          options: { status: ["A", "B"], currentStatus: 0, isShow: true }
        }
      }
    ] as any);
    const config = result[0].config;
    expect(config.title).toBeDefined();
    expect(config.desc).toBeDefined();
    expect(config.options).toBeDefined();
  });

  it("config 应递归清理嵌套数组中的对象", () => {
    const result = serializeComponents([
      {
        name: "single-select",
        status: {
          options: {
            status: [
              { value: "v1", status: "s1" },
              { value: "v2", status: "s2" }
            ],
            currentStatus: 0
          }
        }
      }
    ] as any);
    const optionsConfig = result[0].config.options as Record<string, unknown>;
    const statusArr = optionsConfig.status as Array<Record<string, unknown>>;
    expect(statusArr).toHaveLength(2);
    expect(statusArr[0].value).toBe("v1");
    expect(statusArr[0].status).toBe("s1");
    expect(statusArr[1].value).toBe("v2");
    expect(statusArr[1].status).toBe("s2");
  });

  it("config 嵌套对象中的 editCom 和 id 应被移除", () => {
    const result = serializeComponents([
      {
        name: "single-select",
        status: {
          title: { status: "标题", isShow: true, editCom: () => {}, id: "uuid-1", nested: { editCom: () => {}, id: "uuid-nested", data: "keep" } }
        }
      }
    ] as any);
    const titleConfig = result[0].config.title as Record<string, unknown>;
    // 顶层 editCom/id 在 title 对象内被移除
    expect(titleConfig).not.toHaveProperty("editCom");
    expect(titleConfig).not.toHaveProperty("id");
    // 嵌套对象中的 editCom/id 也被移除
    const nested = titleConfig.nested as Record<string, unknown>;
    expect(nested).not.toHaveProperty("editCom");
    expect(nested).not.toHaveProperty("id");
    expect(nested.data).toBe("keep");
  });
});

// ============================================================
// extractSurveyMetadata
// ============================================================
describe("extractSurveyMetadata", () => {
  it("空数组应返回空标题和描述", () => {
    const result = extractSurveyMetadata([]);
    expect(result.title).toBe("");
    expect(result.description).toBe("");
  });

  it("应提取标题组件（type.currentStatus === 0）", () => {
    const result = extractSurveyMetadata([
      {
        status: {
          type: { currentStatus: 0 },
          title: { status: "我的问卷标题", isShow: true }
        }
      }
    ] as any);
    expect(result.title).toBe("我的问卷标题");
  });

  it("应提取描述组件（type.currentStatus === 1）", () => {
    const result = extractSurveyMetadata([
      {
        status: {
          type: { currentStatus: 1 },
          desc: { status: "问卷描述内容", isShow: true }
        }
      }
    ] as any);
    expect(result.description).toBe("问卷描述内容");
  });

  it("标题和描述可同时从不同组件中提取", () => {
    const result = extractSurveyMetadata([
      {
        status: {
          type: { currentStatus: 0 },
          title: { status: "标题", isShow: true }
        }
      },
      {
        status: {
          type: { currentStatus: 1 },
          desc: { status: "描述", isShow: true }
        }
      }
    ] as any);
    expect(result.title).toBe("标题");
    expect(result.description).toBe("描述");
  });

  it("标题 isShow 为 false 时应跳过", () => {
    const result = extractSurveyMetadata([
      {
        status: {
          type: { currentStatus: 0 },
          title: { status: "隐藏标题", isShow: false }
        }
      }
    ] as any);
    expect(result.title).toBe("");
  });

  it("应只取第一个匹配的标题组件", () => {
    const result = extractSurveyMetadata([
      {
        status: {
          type: { currentStatus: 0 },
          title: { status: "第一个标题", isShow: true }
        }
      },
      {
        status: {
          type: { currentStatus: 0 },
          title: { status: "第二个标题", isShow: true }
        }
      }
    ] as any);
    expect(result.title).toBe("第一个标题");
  });

  it("type 不存在时应安全处理", () => {
    const result = extractSurveyMetadata([
      { status: { title: { status: "无type", isShow: true } } }
    ] as any);
    expect(result.title).toBe("");
    expect(result.description).toBe("");
  });
});

// ============================================================
// getSurveyMetadata
// ============================================================
describe("getSurveyMetadata", () => {
  it("Store 有 surveyTitle 时优先使用", () => {
    const result = getSurveyMetadata({
      surveyTitle: "Store标题",
      coms: []
    });
    expect(result.title).toBe("Store标题");
  });

  it("Store 有 surveyDescription 时优先使用", () => {
    const result = getSurveyMetadata({
      surveyDescription: "Store描述",
      coms: []
    });
    expect(result.description).toBe("Store描述");
  });

  it("Store 无字段时回退到组件提取", () => {
    const result = getSurveyMetadata({
      coms: [
        {
          status: {
            type: { currentStatus: 0 },
            title: { status: "组件标题", isShow: true }
          }
        }
      ] as any
    });
    expect(result.title).toBe("组件标题");
  });
});

// ============================================================
// serializeAnswers
// ============================================================
describe("serializeAnswers", () => {
  const components = [
    { id: "comp-1", order_index: 0 },
    { id: "comp-2", order_index: 1 },
    { id: "comp-3", order_index: 2 }
  ];

  it("空答案应返回空数组", () => {
    expect(serializeAnswers({}, components)).toEqual([]);
  });

  it("应正确映射标量答案（单选/文本）", () => {
    const result = serializeAnswers({ 0: "选项A" }, components);
    expect(result).toHaveLength(1);
    expect(result[0].component_id).toBe("comp-1");
    expect(result[0].value).toBe("选项A");
  });

  it("应正确映射数组答案（多选）", () => {
    const result = serializeAnswers({ 0: ["A", "B", "C"] }, components);
    expect(result[0].values).toEqual(["A", "B", "C"]);
    expect(result[0].value).toBeUndefined();
  });

  it("Date 类型应转为 ISO 字符串", () => {
    const date = new Date("2025-01-15T10:30:00Z");
    const result = serializeAnswers({ 0: date }, components);
    expect(result[0].value).toBe(date.toISOString());
  });

  it("对象类型应 JSON.stringify", () => {
    const matrixData = { row1: "col1", row2: "col2" };
    const result = serializeAnswers({ 0: matrixData }, components);
    expect(result[0].value).toBe(JSON.stringify(matrixData));
  });

  it("数字答案应转为字符串", () => {
    const result = serializeAnswers({ 0: 5 }, components);
    expect(result[0].value).toBe("5");
  });

  it("不存在的组件应跳过", () => {
    const result = serializeAnswers({ 999: "不存在" }, components);
    expect(result).toHaveLength(0);
  });
});

// ============================================================
// deserializeSurveyDetail
// ============================================================
describe("deserializeSurveyDetail", () => {
  it("空数组应返回空数组", () => {
    expect(deserializeSurveyDetail([])).toEqual([]);
  });

  it("应按 order_index 排序", () => {
    const result = deserializeSurveyDetail([
      { id: "c1", survey_id: "s1", type: "single_select", config: {}, order_index: 2, required: 1 as const, created_at: "", updated_at: "" },
      { id: "c2", survey_id: "s1", type: "multi_select", config: {}, order_index: 0, required: 0 as const, created_at: "", updated_at: "" },
      { id: "c3", survey_id: "s1", type: "text_note", config: {}, order_index: 1, required: 0 as const, created_at: "", updated_at: "" }
    ]);
    expect(result[0]._componentId).toBe("c2");
    expect(result[1]._componentId).toBe("c3");
    expect(result[2]._componentId).toBe("c1");
  });

  it("应将 snake_case type 转为 kebab-case name", () => {
    const result = deserializeSurveyDetail([
      { id: "c1", survey_id: "s1", type: "single_select", config: {}, order_index: 0, required: 1 as const, created_at: "", updated_at: "" },
      { id: "c2", survey_id: "s1", type: "multi_pic_select", config: {}, order_index: 1, required: 0 as const, created_at: "", updated_at: "" }
    ]);
    expect(result[0].name).toBe("single-select");
    expect(result[1].name).toBe("multi-pic-select");
  });

  it("应保留 config 和 _componentId", () => {
    const config = { title: { status: "测试" } };
    const result = deserializeSurveyDetail([
      { id: "c1", survey_id: "s1", type: "single_select", config, order_index: 0, required: 1 as const, created_at: "", updated_at: "" }
    ]);
    expect(result[0].status).toEqual(config);
    expect(result[0]._componentId).toBe("c1");
  });
});

// ============================================================
// getComponentMap
// ============================================================
describe("getComponentMap", () => {
  it("空数组应返回空数组", () => {
    expect(getComponentMap([])).toEqual([]);
  });

  it("应提取 id 和 order_index", () => {
    const result = getComponentMap([
      { id: "c1", order_index: 0 },
      { id: "c2", order_index: 1 }
    ]);
    expect(result).toEqual([
      { id: "c1", order_index: 0 },
      { id: "c2", order_index: 1 }
    ]);
  });
});