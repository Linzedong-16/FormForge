// ──────────────────────────────────────────────────────────────────────────────
// resolveVisibility — 单元测试
// 覆盖：隐藏优先裁决（FR-002/Clarification Q2）、AND/OR 组合、baseVisibility 两种默认态、
// 各比较运算符在不同 NormalizedValue kind 下的求值语义
// ──────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { resolveVisibility, resolveJump, resolveOptionPool, computeDerivedField } from "../evaluator";
import type {
  ClientKey,
  NormalizedValue,
  QuestionVisibilityConfig,
  QuestionJumpConfig,
  OptionDependencyMapping,
  ComputedFieldConfig
} from "../types";

/** 快捷构造单条件、单规则的最小 QuestionVisibilityConfig，减少各用例的样板代码 */
function singleRuleConfig(
  action: "show" | "hide",
  sourceKey: ClientKey,
  operator: "eq" | "neq" | "contains" | "notContains" | "gt" | "gte" | "lt" | "lte" | "isEmpty" | "isNotEmpty",
  value: string | number | string[] | undefined,
  baseVisibility: "visible" | "hidden" = "visible"
): QuestionVisibilityConfig {
  return {
    baseVisibility,
    rules: [{ action, condition: { combinator: "AND", conditions: [{ sourceKey, operator, value }] } }]
  };
}

describe("resolveVisibility — 未配置规则", () => {
  it("config 为 undefined → 始终可见", () => {
    expect(resolveVisibility(undefined, {})).toBe("visible");
  });
});

describe("resolveVisibility — baseVisibility 两种默认态（无规则命中）", () => {
  const answers: Record<ClientKey, NormalizedValue> = { q1: { kind: "text", value: "无关值" } };

  it("baseVisibility=visible，规则未命中 → visible", () => {
    const config = singleRuleConfig("show", "q1", "eq", "命中值", "visible");
    expect(resolveVisibility(config, answers)).toBe("visible");
  });

  it("baseVisibility=hidden，规则未命中 → hidden", () => {
    const config = singleRuleConfig("show", "q1", "eq", "命中值", "hidden");
    expect(resolveVisibility(config, answers)).toBe("hidden");
  });
});

describe("resolveVisibility — 隐藏优先胜出裁决（FR-002/Clarification Q2）", () => {
  it("show 与 hide 规则同时命中 → hidden", () => {
    const answers: Record<ClientKey, NormalizedValue> = { q1: { kind: "text", value: "A" } };
    const config: QuestionVisibilityConfig = {
      baseVisibility: "hidden",
      rules: [
        { action: "show", condition: { combinator: "AND", conditions: [{ sourceKey: "q1", operator: "eq", value: "A" }] } },
        { action: "hide", condition: { combinator: "AND", conditions: [{ sourceKey: "q1", operator: "eq", value: "A" }] } }
      ]
    };
    expect(resolveVisibility(config, answers)).toBe("hidden");
  });

  it("仅 show 规则命中 → visible", () => {
    const answers: Record<ClientKey, NormalizedValue> = { q1: { kind: "text", value: "A" } };
    const config = singleRuleConfig("show", "q1", "eq", "A", "hidden");
    expect(resolveVisibility(config, answers)).toBe("visible");
  });

  it("仅 hide 规则命中 → hidden", () => {
    const answers: Record<ClientKey, NormalizedValue> = { q1: { kind: "text", value: "A" } };
    const config = singleRuleConfig("hide", "q1", "eq", "A", "visible");
    expect(resolveVisibility(config, answers)).toBe("hidden");
  });
});

describe("resolveVisibility — AND/OR 组合", () => {
  const answers: Record<ClientKey, NormalizedValue> = {
    q1: { kind: "text", value: "A" },
    q2: { kind: "number", value: 5 }
  };

  it("AND：全部条件满足才命中", () => {
    const config: QuestionVisibilityConfig = {
      baseVisibility: "hidden",
      rules: [
        {
          action: "show",
          condition: {
            combinator: "AND",
            conditions: [
              { sourceKey: "q1", operator: "eq", value: "A" },
              { sourceKey: "q2", operator: "gt", value: 10 }
            ]
          }
        }
      ]
    };
    expect(resolveVisibility(config, answers)).toBe("hidden");
  });

  it("OR：任一条件满足即命中", () => {
    const config: QuestionVisibilityConfig = {
      baseVisibility: "hidden",
      rules: [
        {
          action: "show",
          condition: {
            combinator: "OR",
            conditions: [
              { sourceKey: "q1", operator: "eq", value: "不匹配" },
              { sourceKey: "q2", operator: "gt", value: 1 }
            ]
          }
        }
      ]
    };
    expect(resolveVisibility(config, answers)).toBe("visible");
  });
});

describe("resolveVisibility — 各比较运算符语义", () => {
  it("isEmpty：未作答题目（answers 中无此 key）→ 命中", () => {
    const config = singleRuleConfig("hide", "q1", "isEmpty", undefined, "visible");
    expect(resolveVisibility(config, {})).toBe("hidden");
  });

  it("isEmpty：kind 为 empty → 命中", () => {
    const config = singleRuleConfig("hide", "q1", "isEmpty", undefined, "visible");
    expect(resolveVisibility(config, { q1: { kind: "empty" } })).toBe("hidden");
  });

  it("isNotEmpty：已作答 → 命中", () => {
    const config = singleRuleConfig("hide", "q1", "isNotEmpty", undefined, "visible");
    expect(resolveVisibility(config, { q1: { kind: "text", value: "已填写" } })).toBe("hidden");
  });

  it("未作答题目对非 isEmpty/isNotEmpty 运算符始终视为不命中（安全兜底）", () => {
    const config = singleRuleConfig("hide", "q1", "eq", "任意值", "visible");
    expect(resolveVisibility(config, {})).toBe("visible");
  });

  it("neq：文本不等 → 命中", () => {
    const config = singleRuleConfig("hide", "q1", "neq", "B", "visible");
    expect(resolveVisibility(config, { q1: { kind: "text", value: "A" } })).toBe("hidden");
  });

  it("contains：text-list 包含指定文本 → 命中", () => {
    const config = singleRuleConfig("hide", "q1", "contains", "选项2", "visible");
    expect(resolveVisibility(config, { q1: { kind: "text-list", value: ["选项1", "选项2"] } })).toBe("hidden");
  });

  it("notContains：text-list 不包含指定文本 → 命中", () => {
    const config = singleRuleConfig("hide", "q1", "notContains", "选项3", "visible");
    expect(resolveVisibility(config, { q1: { kind: "text-list", value: ["选项1", "选项2"] } })).toBe("hidden");
  });

  it("contains：text 子串包含 → 命中", () => {
    const config = singleRuleConfig("hide", "q1", "contains", "关键字", "visible");
    expect(resolveVisibility(config, { q1: { kind: "text", value: "包含关键字的文本" } })).toBe("hidden");
  });

  it("gte/lte：数字边界值（含等于）→ 命中", () => {
    const gteConfig = singleRuleConfig("hide", "q1", "gte", 5, "visible");
    expect(resolveVisibility(gteConfig, { q1: { kind: "number", value: 5 } })).toBe("hidden");

    const lteConfig = singleRuleConfig("hide", "q1", "lte", 5, "visible");
    expect(resolveVisibility(lteConfig, { q1: { kind: "number", value: 5 } })).toBe("hidden");
  });

  it("gt/lt：日期 ISO 字符串按字典序比较（复用文本比较运算符）", () => {
    const config = singleRuleConfig("hide", "q1", "gt", "2026-01-01T00:00:00.000Z", "visible");
    expect(resolveVisibility(config, { q1: { kind: "text", value: "2026-06-15T00:00:00.000Z" } })).toBe("hidden");
    expect(resolveVisibility(config, { q1: { kind: "text", value: "2025-01-01T00:00:00.000Z" } })).toBe("visible");
  });

  it("gt 作用于 text-list（不支持的运算符/类型组合）→ 安全兜底为不命中", () => {
    const config = singleRuleConfig("hide", "q1", "gt", "1", "visible");
    expect(resolveVisibility(config, { q1: { kind: "text-list", value: ["1", "2"] } })).toBe("visible");
  });

  it("sourceKey 引用不存在的题目 → 等同未作答（安全兜底）", () => {
    const config = singleRuleConfig("hide", "not-exist", "isEmpty", undefined, "visible");
    expect(resolveVisibility(config, { q1: { kind: "text", value: "A" } })).toBe("hidden");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// resolveJump — 单元测试
// 覆盖：多规则同时命中取第一条生效（first-match-wins）、endSurvey 跳转目标、无命中场景
// ──────────────────────────────────────────────────────────────────────────────

/** 快捷构造单条件、指向题目的跳转规则，减少各用例的样板代码 */
function singleJumpRule(
  sourceKey: ClientKey,
  operator: "eq" | "neq" | "contains" | "notContains" | "gt" | "gte" | "lt" | "lte" | "isEmpty" | "isNotEmpty",
  value: string | number | string[] | undefined,
  targetKey: ClientKey
): QuestionJumpConfig["rules"][number] {
  return {
    condition: { combinator: "AND", conditions: [{ sourceKey, operator, value }] },
    target: { type: "question", targetKey }
  };
}

describe("resolveJump — 未配置规则", () => {
  it("config 为 undefined → 返回 null（不跳转，走顺序下一题）", () => {
    expect(resolveJump(undefined, {})).toBeNull();
  });

  it("rules 为空数组 → 返回 null", () => {
    expect(resolveJump({ rules: [] }, {})).toBeNull();
  });
});

describe("resolveJump — 无命中场景", () => {
  it("全部规则条件均未命中 → 返回 null（走顺序下一题）", () => {
    const answers: Record<ClientKey, NormalizedValue> = { q1: { kind: "text", value: "A" } };
    const config: QuestionJumpConfig = {
      rules: [singleJumpRule("q1", "eq", "不匹配的值", "q3")]
    };
    expect(resolveJump(config, answers)).toBeNull();
  });
});

describe("resolveJump — 多规则同时命中取第一条生效（first-match-wins）", () => {
  it("多条规则同时满足触发条件 → 返回数组中第一条命中的规则", () => {
    const answers: Record<ClientKey, NormalizedValue> = { q1: { kind: "text", value: "A" } };
    const firstRule = singleJumpRule("q1", "eq", "A", "q2");
    const secondRule = singleJumpRule("q1", "isNotEmpty", undefined, "q3");
    const config: QuestionJumpConfig = { rules: [firstRule, secondRule] };

    const result = resolveJump(config, answers);
    expect(result).toBe(firstRule);
    expect(result?.target.targetKey).toBe("q2");
  });

  it("第一条规则未命中、第二条命中 → 返回第二条规则", () => {
    const answers: Record<ClientKey, NormalizedValue> = { q1: { kind: "text", value: "A" } };
    const firstRule = singleJumpRule("q1", "eq", "不匹配", "q2");
    const secondRule = singleJumpRule("q1", "eq", "A", "q3");
    const config: QuestionJumpConfig = { rules: [firstRule, secondRule] };

    const result = resolveJump(config, answers);
    expect(result).toBe(secondRule);
    expect(result?.target.targetKey).toBe("q3");
  });
});

describe("resolveJump — endSurvey 跳转目标", () => {
  it("命中规则的 target.type 为 endSurvey → 原样返回该规则（不要求 targetKey）", () => {
    const answers: Record<ClientKey, NormalizedValue> = { q1: { kind: "text", value: "不符合资格" } };
    const rule = {
      condition: { combinator: "AND" as const, conditions: [{ sourceKey: "q1" as ClientKey, operator: "eq" as const, value: "不符合资格" }] },
      target: { type: "endSurvey" as const }
    };
    const config: QuestionJumpConfig = { rules: [rule] };

    const result = resolveJump(config, answers);
    expect(result).toBe(rule);
    expect(result?.target.type).toBe("endSurvey");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// resolveOptionPool — 单元测试
// 覆盖：候选集合按依赖答案刷新、依赖题未作答时两种 emptyStrategy 降级行为、
// 答案值不在映射表中/答案类型不受支持时的安全兜底
// ──────────────────────────────────────────────────────────────────────────────

/** 快捷构造省市联动风格的最小 OptionDependencyMapping，减少各用例的样板代码 */
function provinceCityMapping(emptyStrategy: "empty" | "promptFillDependency" = "empty"): OptionDependencyMapping {
  return {
    dependsOnKey: "province",
    optionsByAnswer: {
      广东省: ["广州市", "深圳市"],
      浙江省: ["杭州市", "宁波市"]
    },
    emptyStrategy
  };
}

describe("resolveOptionPool — 候选集合按依赖答案刷新", () => {
  it("依赖题目答案变化 → 返回对应候选集合（FR-004 acceptance scenario 1）", () => {
    const mapping = provinceCityMapping();
    expect(resolveOptionPool(mapping, { province: { kind: "text", value: "广东省" } })).toEqual(["广州市", "深圳市"]);
    expect(resolveOptionPool(mapping, { province: { kind: "text", value: "浙江省" } })).toEqual(["杭州市", "宁波市"]);
  });
});

describe("resolveOptionPool — 依赖题目未作答（两种 emptyStrategy）", () => {
  it('emptyStrategy = "empty" → 候选集合为空数组', () => {
    const mapping = provinceCityMapping("empty");
    expect(resolveOptionPool(mapping, {})).toEqual([]);
  });

  it('emptyStrategy = "promptFillDependency" → 返回提示占位，交由 UI 引导先填依赖题', () => {
    const mapping = provinceCityMapping("promptFillDependency");
    expect(resolveOptionPool(mapping, {})).toEqual({ prompt: true });
  });

  it("依赖题目 NormalizedValue.kind 为 empty（已作答但显式清空）→ 视同未作答", () => {
    const mapping = provinceCityMapping("promptFillDependency");
    expect(resolveOptionPool(mapping, { province: { kind: "empty" } })).toEqual({ prompt: true });
  });
});

describe("resolveOptionPool — 安全兜底（不抛异常）", () => {
  it("依赖题目已作答但答案值不在映射表中 → 返回空数组，不视为未作答", () => {
    const mapping = provinceCityMapping("promptFillDependency");
    expect(resolveOptionPool(mapping, { province: { kind: "text", value: "未配置的省份" } })).toEqual([]);
  });

  it("依赖题目答案类型非 text（如误配置为多选题）→ 安全兜底为空数组", () => {
    const mapping = provinceCityMapping();
    expect(resolveOptionPool(mapping, { province: { kind: "text-list", value: ["广东省"] } })).toEqual([]);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// computeDerivedField — 单元测试
// 覆盖：sum/weightedSum 两种公式、treatAsZero/skipCalculation 两种降级策略、
// 参与题目答案类型非 number 时的安全兜底
// ──────────────────────────────────────────────────────────────────────────────

/** 快捷构造 sum 公式的最小 ComputedFieldConfig，减少各用例的样板代码 */
function sumConfig(
  sourceKeys: ClientKey[],
  incompleteStrategy: ComputedFieldConfig["incompleteStrategy"] = "treatAsZero"
): ComputedFieldConfig {
  return {
    formula: { kind: "sum", sourceKeys },
    incompleteStrategy,
    visibleToFiller: true
  };
}

describe("computeDerivedField — sum 公式", () => {
  it("全部参与题目均已作答 → 返回数值之和（FR-005 acceptance scenario 1）", () => {
    const config = sumConfig(["qa", "qb"]);
    const answers: Record<ClientKey, NormalizedValue> = {
      qa: { kind: "number", value: 3 },
      qb: { kind: "number", value: 4 }
    };
    expect(computeDerivedField(config, answers)).toBe(7);
  });

  it('部分参与题目未作答，incompleteStrategy = "treatAsZero" → 未作答题目按 0 参与求和（FR-005 acceptance scenario 4）', () => {
    const config = sumConfig(["qa", "qb"], "treatAsZero");
    const answers: Record<ClientKey, NormalizedValue> = { qa: { kind: "number", value: 3 } };
    expect(computeDerivedField(config, answers)).toBe(3);
  });

  it('部分参与题目未作答，incompleteStrategy = "skipCalculation" → 返回 null（不产出计算结果）', () => {
    const config = sumConfig(["qa", "qb"], "skipCalculation");
    const answers: Record<ClientKey, NormalizedValue> = { qa: { kind: "number", value: 3 } };
    expect(computeDerivedField(config, answers)).toBeNull();
  });
});

describe("computeDerivedField — weightedSum 公式", () => {
  it("全部参与题目均已作答 → 返回加权和", () => {
    const config: ComputedFieldConfig = {
      formula: {
        kind: "weightedSum",
        sources: [
          { key: "qa", weight: 2 },
          { key: "qb", weight: 0.5 }
        ]
      },
      incompleteStrategy: "treatAsZero",
      visibleToFiller: true
    };
    const answers: Record<ClientKey, NormalizedValue> = {
      qa: { kind: "number", value: 10 },
      qb: { kind: "number", value: 8 }
    };
    // 2*10 + 0.5*8 = 24
    expect(computeDerivedField(config, answers)).toBe(24);
  });

  it('部分参与题目未作答，incompleteStrategy = "skipCalculation" → 返回 null', () => {
    const config: ComputedFieldConfig = {
      formula: { kind: "weightedSum", sources: [{ key: "qa", weight: 2 }, { key: "qb", weight: 0.5 }] },
      incompleteStrategy: "skipCalculation",
      visibleToFiller: true
    };
    const answers: Record<ClientKey, NormalizedValue> = { qa: { kind: "number", value: 10 } };
    expect(computeDerivedField(config, answers)).toBeNull();
  });
});

describe("computeDerivedField — 安全兜底（不抛异常）", () => {
  it("参与题目答案类型非 number（如误配置为文本题）→ 视同未作答，按 incompleteStrategy 降级处理", () => {
    const config = sumConfig(["qa", "qb"], "treatAsZero");
    const answers: Record<ClientKey, NormalizedValue> = {
      qa: { kind: "number", value: 3 },
      qb: { kind: "text", value: "非数值答案" }
    };
    expect(computeDerivedField(config, answers)).toBe(3);
  });

  it("参与题目集合为空数组 → 返回 0（sum 公式的空和语义）", () => {
    const config = sumConfig([]);
    expect(computeDerivedField(config, {})).toBe(0);
  });
});
