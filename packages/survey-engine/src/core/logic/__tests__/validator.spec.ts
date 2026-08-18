// ──────────────────────────────────────────────────────────────────────────────
// validateRuleSet — 单元测试
// 覆盖：循环依赖 DFS 三色标记检测、无效引用检测（visibility/jump/optionDependency/
// computedField 四类 logic 配置均可产生悬空引用）、非法跳转目标检测、多违规并存场景
// 对应 data-model.md §1.9 / research.md §6 / quickstart.md 场景5 / FR-006
//
// 迁移说明（T019，原路径 src/logic/__tests__/validator.spec.ts）：仅调整 import 路径迁移至
// core/logic/__tests__/，断言内容不变
// ──────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { validateRuleSet } from "../validator";
import type { ClientKey, QuestionLogicConfig, RuleValidationResult } from "../types";

/** validateRuleSet 的入参元素类型，避免每个用例重复书写字段名 */
interface RuleComponent {
  clientKey: ClientKey;
  orderIndex: number;
  logic: QuestionLogicConfig | null;
}

/** 快捷构造"可见性依赖 sourceKey"的最小 logic 配置 */
function visibilityDependsOn(sourceKey: ClientKey): QuestionLogicConfig {
  return {
    visibility: {
      baseVisibility: "visible",
      rules: [{ action: "hide", condition: { combinator: "AND", conditions: [{ sourceKey, operator: "isNotEmpty" }] } }]
    }
  };
}

/** 快捷构造"跳转目标为 targetKey"的最小 logic 配置 */
function jumpTo(targetKey: ClientKey): QuestionLogicConfig {
  return {
    jump: {
      rules: [
        {
          condition: { combinator: "AND", conditions: [{ sourceKey: targetKey, operator: "isNotEmpty" }] },
          target: { type: "question", targetKey }
        }
      ]
    }
  };
}

describe("validateRuleSet — 合法配置", () => {
  it("无任何 logic 配置 → valid 为 true，violations 为空数组", () => {
    const components: RuleComponent[] = [
      { clientKey: "q1", orderIndex: 0, logic: null },
      { clientKey: "q2", orderIndex: 1, logic: null }
    ];
    expect(validateRuleSet(components)).toEqual({ valid: true, violations: [] });
  });

  it("显示规则依赖更早题目、跳转指向更晚题目 → 合法，无违规", () => {
    const components: RuleComponent[] = [
      { clientKey: "q1", orderIndex: 0, logic: null },
      { clientKey: "q2", orderIndex: 1, logic: visibilityDependsOn("q1") },
      { clientKey: "q3", orderIndex: 2, logic: jumpTo("q4") },
      { clientKey: "q4", orderIndex: 3, logic: null }
    ];
    const result = validateRuleSet(components);
    expect(result.valid).toBe(true);
    expect(result.violations).toEqual([]);
  });
});

describe("validateRuleSet — 循环依赖（DFS 三色标记检测）", () => {
  it("两题可见性规则互相引用对方 clientKey（quickstart.md 场景5示例）→ 检出 circularDependency", () => {
    const components: RuleComponent[] = [
      { clientKey: "qa", orderIndex: 0, logic: visibilityDependsOn("qb") },
      { clientKey: "qb", orderIndex: 1, logic: visibilityDependsOn("qa") }
    ];
    const result = validateRuleSet(components);
    expect(result.valid).toBe(false);
    const circular = result.violations.filter(v => v.type === "circularDependency");
    expect(circular).toHaveLength(1);
    expect([...circular[0]!.involvedKeys].sort()).toEqual(["qa", "qb"]);
  });

  it("三题构成更长的环（A←B←C←A）→ 检出唯一一条 circularDependency，involvedKeys 覆盖全部环上题目", () => {
    const components: RuleComponent[] = [
      { clientKey: "qa", orderIndex: 0, logic: visibilityDependsOn("qc") },
      { clientKey: "qb", orderIndex: 1, logic: visibilityDependsOn("qa") },
      { clientKey: "qc", orderIndex: 2, logic: visibilityDependsOn("qb") }
    ];
    const result = validateRuleSet(components);
    expect(result.valid).toBe(false);
    const circular = result.violations.filter(v => v.type === "circularDependency");
    expect(circular).toHaveLength(1);
    expect([...circular[0]!.involvedKeys].sort()).toEqual(["qa", "qb", "qc"]);
  });

  it("计算字段公式互相引用构成环 → 同样检出 circularDependency（覆盖 computedField 依赖边）", () => {
    const components: RuleComponent[] = [
      {
        clientKey: "sum-a",
        orderIndex: 0,
        logic: { computedField: { formula: { kind: "sum", sourceKeys: ["sum-b"] }, incompleteStrategy: "treatAsZero", visibleToFiller: true } }
      },
      {
        clientKey: "sum-b",
        orderIndex: 1,
        logic: { computedField: { formula: { kind: "sum", sourceKeys: ["sum-a"] }, incompleteStrategy: "treatAsZero", visibleToFiller: true } }
      }
    ];
    const result = validateRuleSet(components);
    expect(result.valid).toBe(false);
    expect(result.violations.some(v => v.type === "circularDependency")).toBe(true);
  });

  it("无环的正常依赖链（A←B←C，非闭环）→ 不产生 circularDependency", () => {
    const components: RuleComponent[] = [
      { clientKey: "qa", orderIndex: 0, logic: null },
      { clientKey: "qb", orderIndex: 1, logic: visibilityDependsOn("qa") },
      { clientKey: "qc", orderIndex: 2, logic: visibilityDependsOn("qb") }
    ];
    const result = validateRuleSet(components);
    expect(result.violations.filter(v => v.type === "circularDependency")).toEqual([]);
  });
});

describe("validateRuleSet — 无效引用检测（悬空引用不在题目全集中）", () => {
  it("可见性规则的 sourceKey 引用已被删除的题目 → 检出 danglingReference（quickstart.md 场景5示例）", () => {
    const components: RuleComponent[] = [{ clientKey: "q1", orderIndex: 0, logic: visibilityDependsOn("deleted-question") }];
    const result = validateRuleSet(components);
    expect(result.valid).toBe(false);
    const dangling = result.violations.filter(v => v.type === "danglingReference");
    expect(dangling.length).toBeGreaterThanOrEqual(1);
    expect(dangling.some(v => v.involvedKeys.includes("deleted-question"))).toBe(true);
  });

  it("选项依赖映射的 dependsOnKey 引用不存在题目 → 检出 danglingReference", () => {
    const components: RuleComponent[] = [
      {
        clientKey: "q1",
        orderIndex: 0,
        logic: { optionDependency: { dependsOnKey: "not-exist", optionsByAnswer: {}, emptyStrategy: "empty" } }
      }
    ];
    const result = validateRuleSet(components);
    expect(result.valid).toBe(false);
    expect(result.violations.some(v => v.type === "danglingReference" && v.involvedKeys.includes("not-exist"))).toBe(true);
  });

  it("计算字段公式的 sourceKeys 引用不存在题目 → 检出 danglingReference", () => {
    const components: RuleComponent[] = [
      {
        clientKey: "q1",
        orderIndex: 0,
        logic: { computedField: { formula: { kind: "sum", sourceKeys: ["not-exist"] }, incompleteStrategy: "treatAsZero", visibleToFiller: true } }
      }
    ];
    const result = validateRuleSet(components);
    expect(result.valid).toBe(false);
    expect(result.violations.some(v => v.type === "danglingReference" && v.involvedKeys.includes("not-exist"))).toBe(true);
  });

  it("跳转目标引用不存在题目 → 检出 danglingReference", () => {
    const components: RuleComponent[] = [{ clientKey: "q1", orderIndex: 0, logic: jumpTo("not-exist") }];
    const result = validateRuleSet(components);
    expect(result.valid).toBe(false);
    expect(result.violations.some(v => v.type === "danglingReference" && v.involvedKeys.includes("not-exist"))).toBe(true);
  });
});

describe("validateRuleSet — 非法跳转目标检测", () => {
  it("跳转目标为自身 → 检出 invalidJumpTarget", () => {
    const components: RuleComponent[] = [{ clientKey: "q1", orderIndex: 0, logic: jumpTo("q1") }];
    const result = validateRuleSet(components);
    expect(result.valid).toBe(false);
    const invalidJump = result.violations.filter(v => v.type === "invalidJumpTarget");
    expect(invalidJump.length).toBeGreaterThanOrEqual(1);
    expect(invalidJump.some(v => v.involvedKeys.includes("q1"))).toBe(true);
  });

  it("跳转目标 order_index 早于来源题目（quickstart.md 场景5示例）→ 检出 invalidJumpTarget", () => {
    const components: RuleComponent[] = [
      { clientKey: "q1", orderIndex: 0, logic: null },
      { clientKey: "q2", orderIndex: 1, logic: jumpTo("q1") }
    ];
    const result = validateRuleSet(components);
    expect(result.valid).toBe(false);
    const invalidJump = result.violations.filter(v => v.type === "invalidJumpTarget");
    expect(invalidJump.length).toBeGreaterThanOrEqual(1);
    expect(invalidJump.some(v => v.involvedKeys.includes("q2") && v.involvedKeys.includes("q1"))).toBe(true);
  });

  it("跳转目标 order_index 等于来源题目 → 同样视为非法（仅支持严格向后跳转）", () => {
    const components: RuleComponent[] = [
      { clientKey: "q1", orderIndex: 0, logic: null },
      { clientKey: "q2", orderIndex: 0, logic: jumpTo("q1") }
    ];
    const result = validateRuleSet(components);
    expect(result.violations.some(v => v.type === "invalidJumpTarget")).toBe(true);
  });

  it("跳转目标类型为 endSurvey（无 targetKey）→ 不检出 invalidJumpTarget/danglingReference", () => {
    const components: RuleComponent[] = [
      { clientKey: "q0", orderIndex: 0, logic: null },
      {
        clientKey: "q1",
        orderIndex: 1,
        logic: {
          jump: {
            rules: [
              { condition: { combinator: "AND", conditions: [{ sourceKey: "q0", operator: "isNotEmpty" }] }, target: { type: "endSurvey" } }
            ]
          }
        }
      }
    ];
    const result = validateRuleSet(components);
    expect(result.valid).toBe(true);
    expect(result.violations).toEqual([]);
  });

  it("跳转目标 order_index 晚于来源题目 → 合法，不检出 invalidJumpTarget", () => {
    const components: RuleComponent[] = [
      { clientKey: "q1", orderIndex: 0, logic: jumpTo("q2") },
      { clientKey: "q2", orderIndex: 1, logic: null }
    ];
    const result = validateRuleSet(components);
    expect(result.violations.filter(v => v.type === "invalidJumpTarget")).toEqual([]);
  });
});

describe("validateRuleSet — 悬空选项引用检测（optionDependency.optionsByAnswer，best-effort，FR-008/D6）", () => {
  it("[T013回归] optionsByAnswer 引用了依赖题目当前已不存在的选项值 → 应检出 staleOptionReference（当前实现下未被检测到）", () => {
    const components: RuleComponent[] = [
      // q1 当前有效选项仅剩 "A"（选项 "B" 已被题目所有者删除）
      { clientKey: "q1", orderIndex: 0, logic: null },
      {
        clientKey: "q2",
        orderIndex: 1,
        logic: {
          optionDependency: {
            dependsOnKey: "q1",
            // "B" 对应的候选集引用了 q1 已不存在的选项值 "B" 本身作为答案分支
            optionsByAnswer: { A: ["opt1"], B: ["opt2"] },
            emptyStrategy: "empty"
          }
        }
      }
    ];

    // T016 将为 validateRuleSet 新增可选第二参数：题目当前有效选项值集合（clientKey → 有效选项值数组）；
    // 修复前该参数尚不存在，此处通过类型断言提前对齐修复后的签名，避免测试本身因签名不匹配而无法编译
    const validOptionsByKey: Record<ClientKey, string[]> = { q1: ["A"] };
    const validateRuleSetWithOptions = validateRuleSet as unknown as (
      components: RuleComponent[],
      validOptionsByKey?: Record<ClientKey, string[]>
    ) => RuleValidationResult;
    const result = validateRuleSetWithOptions(components, validOptionsByKey);

    expect(result.valid).toBe(false);
    const stale = result.violations.filter(v => v.type === "staleOptionReference");
    expect(stale).toHaveLength(1);
    expect(stale[0]!.involvedKeys).toEqual(expect.arrayContaining(["q2", "q1"]));
  });
});

describe("validateRuleSet — 多违规并存场景", () => {
  it("同一份题目集合中同时存在循环依赖、无效引用、非法跳转 → violations 三类齐全，valid 为 false", () => {
    const components: RuleComponent[] = [
      { clientKey: "qa", orderIndex: 0, logic: visibilityDependsOn("qb") },
      { clientKey: "qb", orderIndex: 1, logic: visibilityDependsOn("qa") },
      { clientKey: "q1", orderIndex: 2, logic: visibilityDependsOn("deleted-question") },
      {
        clientKey: "q2",
        orderIndex: 3,
        logic: {
          jump: {
            rules: [
              { condition: { combinator: "AND", conditions: [{ sourceKey: "q1", operator: "isNotEmpty" }] }, target: { type: "question", targetKey: "q2" } }
            ]
          }
        }
      }
    ];
    const result = validateRuleSet(components);
    expect(result.valid).toBe(false);

    const circular = result.violations.filter(v => v.type === "circularDependency");
    expect(circular).toHaveLength(1);
    expect([...circular[0]!.involvedKeys].sort()).toEqual(["qa", "qb"]);

    const dangling = result.violations.filter(v => v.type === "danglingReference");
    expect(dangling.some(v => v.involvedKeys.includes("deleted-question"))).toBe(true);

    const invalidJump = result.violations.filter(v => v.type === "invalidJumpTarget");
    expect(invalidJump.some(v => v.involvedKeys.includes("q2"))).toBe(true);
  });
});
