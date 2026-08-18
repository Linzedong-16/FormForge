// ──────────────────────────────────────────────────────────────────────────────
// 动态表单引擎 —— 规则集校验
// 对应 data-model.md §1.9 / research.md §6 / quickstart.md 场景5 / FR-006
// 四类校验：
//   - danglingReference：sourceKey/dependsOnKey/sourceKeys(或sources[].key)/targetKey 不在题目全集中
//   - invalidJumpTarget：跳转目标为自身，或目标 order_index 不晚于来源（仅支持严格向后跳转）
//   - circularDependency：以"引用键 → 拥有者题目"为有向边，DFS 三色标记法检测环，同一个环只报一次
//   - staleOptionReference（best-effort，FR-008）：optionDependency.optionsByAnswer 的答案分支
//     引用了依赖题目已不存在的选项值；仅当调用方传入 validOptionsByKey 时才启用
//
// 迁移说明（T023，原路径 src/logic/validator.ts）：仅调整相对 import 路径迁移至
// core/logic/，本身只依赖同目录的 ./types.js（纯类型），算法与行为不变
// ──────────────────────────────────────────────────────────────────────────────

import type { ClientKey, QuestionLogicConfig, RuleValidationResult, RuleViolation } from "./types.js";

/** validateRuleSet 的入参元素类型 */
interface RuleComponent {
  clientKey: ClientKey;
  orderIndex: number;
  logic: QuestionLogicConfig | null;
}

export function validateRuleSet(
  components: RuleComponent[],
  validOptionsByKey?: Record<ClientKey, string[]>
): RuleValidationResult {
  const violations: RuleViolation[] = [];
  const fullKeys = new Set(components.map(c => c.clientKey));
  const byKey = new Map(components.map(c => [c.clientKey, c]));

  // 有向边：引用键 → 拥有者 clientKey，仅在引用键存在于题目全集时才会添加（悬空引用已单独记为 danglingReference，不参与环检测）
  const edges = new Map<ClientKey, Set<ClientKey>>();
  const addEdge = (from: ClientKey, to: ClientKey) => {
    if (!edges.has(from)) edges.set(from, new Set());
    edges.get(from)!.add(to);
  };

  /** 校验单个引用字段：不存在于全集则记为 danglingReference，否则登记依赖边 */
  const checkReference = (refKey: ClientKey, ownerKey: ClientKey) => {
    if (!fullKeys.has(refKey)) {
      violations.push({
        type: "danglingReference",
        involvedKeys: [ownerKey, refKey],
        message: `题目 ${ownerKey} 的规则引用了不存在的题目 ${refKey}`
      });
      return;
    }
    addEdge(refKey, ownerKey);
  };

  for (const component of components) {
    const { logic, clientKey: ownerKey } = component;
    if (!logic) continue;

    // 显示/隐藏规则：condition.conditions[].sourceKey
    for (const rule of logic.visibility?.rules ?? []) {
      for (const condition of rule.condition.conditions) {
        checkReference(condition.sourceKey, ownerKey);
      }
    }

    // 跳转规则：condition.conditions[].sourceKey 参与依赖边检测；target.targetKey 单独做非法跳转目标判定
    for (const rule of logic.jump?.rules ?? []) {
      for (const condition of rule.condition.conditions) {
        checkReference(condition.sourceKey, ownerKey);
      }

      const target = rule.target;
      // targetKey 在 type === "question" 时必填（由写入侧 Zod discriminatedUnion 保证），
      // 此处仅为类型收窄兜底：即便出现不合规配置也直接跳过而非误报无主体的违规
      if (target.type !== "question" || target.targetKey === undefined) continue;

      const targetKey = target.targetKey;
      if (!fullKeys.has(targetKey)) {
        violations.push({
          type: "danglingReference",
          involvedKeys: [ownerKey, targetKey],
          message: `题目 ${ownerKey} 的跳转规则引用了不存在的题目 ${targetKey}`
        });
        continue;
      }

      const targetComponent = byKey.get(targetKey)!;
      if (targetKey === ownerKey || targetComponent.orderIndex <= component.orderIndex) {
        violations.push({
          type: "invalidJumpTarget",
          involvedKeys: [ownerKey, targetKey],
          message: `题目 ${ownerKey} 的跳转目标 ${targetKey} 不合法：仅支持跳转到顺序更靠后的题目`
        });
      }
    }

    // 选项联动：dependsOnKey
    const optionDependency = logic.optionDependency;
    if (optionDependency) {
      checkReference(optionDependency.dependsOnKey, ownerKey);

      // best-effort（FR-008）：仅当调用方提供了依赖题目当前有效选项集合时才检测悬空选项引用，
      // 且仅在 dependsOnKey 本身未悬空（已存在于题目全集）时才有意义比对其有效选项
      const dependsOnKey = optionDependency.dependsOnKey;
      const validOptions = validOptionsByKey?.[dependsOnKey];
      if (fullKeys.has(dependsOnKey) && validOptions) {
        const validOptionSet = new Set(validOptions);
        const staleAnswers = Object.keys(optionDependency.optionsByAnswer).filter(
          answer => !validOptionSet.has(answer)
        );
        if (staleAnswers.length > 0) {
          violations.push({
            type: "staleOptionReference",
            involvedKeys: [ownerKey, dependsOnKey],
            message: `题目 ${ownerKey} 的选项联动规则引用了依赖题目 ${dependsOnKey} 已不存在的选项值：${staleAnswers.join(", ")}`
          });
        }
      }
    }

    // 计算字段：sum 用 sourceKeys，weightedSum 用 sources[].key
    const computedField = logic.computedField;
    if (computedField) {
      const formula = computedField.formula;
      if (formula.kind === "sum") {
        for (const sourceKey of formula.sourceKeys) {
          checkReference(sourceKey, ownerKey);
        }
      } else {
        for (const source of formula.sources) {
          checkReference(source.key, ownerKey);
        }
      }
    }
  }

  // 循环依赖检测：DFS 三色标记法，同一个环（按环上节点集合规范化）只产出一条 circularDependency 违规
  const color = new Map<ClientKey, "white" | "gray" | "black">();
  const stack: ClientKey[] = [];
  const seenCycles = new Set<string>();

  const dfs = (node: ClientKey) => {
    color.set(node, "gray");
    stack.push(node);

    for (const neighbor of edges.get(node) ?? []) {
      const neighborColor = color.get(neighbor) ?? "white";
      if (neighborColor === "white") {
        dfs(neighbor);
      } else if (neighborColor === "gray") {
        const cycleStartIndex = stack.indexOf(neighbor);
        const cycleKeys = stack.slice(cycleStartIndex);
        const dedupeKey = [...cycleKeys].sort().join(",");
        if (!seenCycles.has(dedupeKey)) {
          seenCycles.add(dedupeKey);
          violations.push({
            type: "circularDependency",
            involvedKeys: cycleKeys,
            message: `题目 ${cycleKeys.join(" → ")} 之间存在循环依赖`
          });
        }
      }
    }

    stack.pop();
    color.set(node, "black");
  };

  for (const clientKey of fullKeys) {
    if ((color.get(clientKey) ?? "white") === "white") {
      dfs(clientKey);
    }
  }

  return { valid: violations.length === 0, violations };
}
