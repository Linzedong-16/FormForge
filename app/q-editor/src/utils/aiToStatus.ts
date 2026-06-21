/**
 * AI 组件数据 → 编辑器 Status[] 格式转换
 *
 * 职责：
 *   1. 将后端返回的 AIComponent[] 转换为编辑器 Status[]
 *   2. 使用 defaultStatusMap 获取各组件的默认配置模板
 *   3. 将 AI 生成的 config 字段合并到默认模板中（仅覆盖可映射字段）
 *   4. 过滤无效组件类型，返回有效组件列表 + 警告信息
 */
import { defaultStatusMap } from "@/configs/defaultStatus/defaultStatusMap";
import { componentMap } from "@/configs/componentMap";
import type { Status } from "@/types";
import type { AIComponent } from "monorepo-code-common";
import { v4 as uuidv4 } from "uuid";

/**
 * 单个转换结果
 */
export interface ConvertResult {
  /** 转换成功的 Status[] */
  statuses: Status[];
  /** 跳过/警告信息 */
  warnings: string[];
}

/**
 * AI config 字段 → Status 字段覆盖策略
 *
 * key: AI config 中的字段名
 * value: { targetField: Status.status 中的字段名, property: 目标对象中要覆盖的属性名 }
 */
const STATUS_FIELD_MAP: Record<string, { target: string; prop: string }> = {
  title: { target: "title", prop: "status" },
  desc: { target: "desc", prop: "status" },
  options: { target: "options", prop: "status" }
};

/**
 * 将 AI 生成的组件列表转换为编辑器 Status[]
 */
export function aiComponentsToStatus(components: AIComponent[]): ConvertResult {
  const statuses: Status[] = [];
  const warnings: string[] = [];

  for (let i = 0; i < components.length; i++) {
    const comp = components[i]!;
    const typeName = comp.type;

    // 校验组件类型是否有对应的工厂函数
    const factory = defaultStatusMap[typeName];
    if (!factory) {
      warnings.push(`第 ${i + 1} 个组件类型 "${comp.type}" 不在编辑器中，已跳过`);
      continue;
    }

    // 校验组件是否在 componentMap 中注册
    const vueComponent = (componentMap as Record<string, unknown>)[typeName];
    if (!vueComponent) {
      warnings.push(`组件 "${comp.type}" 未在 componentMap 中注册，已跳过`);
      continue;
    }

    try {
      // 1. 深拷贝默认模板（JSON 序列化得到纯数据，丢失 type 引用）
      const plainStatus = JSON.parse(JSON.stringify(factory())) as Record<string, unknown>;

      // 2. 合并 AI config 到默认模板
      const statusObj = plainStatus["status"] as Record<string, Record<string, unknown>>;
      mergeAIConfigIntoStatus(statusObj, comp.config);

      // 3. 重新生成唯一 ID（避免与已有组件冲突）
      plainStatus["id"] = uuidv4();
      regenerateStatusIds(statusObj);

      // 4. 从 componentMap 重新挂载 Vue 组件引用（JSON.parse 丢失 type）
      plainStatus["type"] = vueComponent;

      statuses.push(plainStatus as unknown as Status);
    } catch (err) {
      warnings.push(
        `组件 "${comp.type}"(${i + 1}) 转换失败：${err instanceof Error ? err.message : "未知错误"}，已跳过`
      );
    }
  }

  return { statuses, warnings };
}

/**
 * 将 AI config 合并到 Status 的 status 对象中
 *
 * 仅覆盖 STATUS_FIELD_MAP 中定义的字段：
 *   - title.status  → 接受 string
 *   - desc.status   → 接受 string
 *   - options.status → 接受 string[] 或 { status: string[] }
 */
function mergeAIConfigIntoStatus(
  statusObj: Record<string, Record<string, unknown>>,
  config: Record<string, unknown>
): void {
  for (const [aiField, mapping] of Object.entries(STATUS_FIELD_MAP)) {
    const aiValue = config[aiField];
    if (aiValue === undefined || aiValue === null) continue;

    const targetField = statusObj[mapping.target];
    if (!targetField || typeof targetField !== "object") continue;

    const propKey = mapping.prop;

    // AI 返回 config 中的 status 字段可能是嵌套的（如 options: { status: ["A", "B"] }）
    let resolvedValue: unknown;
    if (typeof aiValue === "object" && aiValue !== null && "status" in aiValue) {
      resolvedValue = (aiValue as Record<string, unknown>).status;
    } else {
      resolvedValue = aiValue;
    }

    // 字符串字段（title.status, desc.status）
    if (typeof resolvedValue === "string") {
      targetField[propKey] = resolvedValue;
    }
    // 数组字段（options.status）：只接受全为 string 的数组
    else if (
      Array.isArray(resolvedValue) &&
      resolvedValue.length > 0 &&
      resolvedValue.every((item: unknown) => typeof item === "string")
    ) {
      targetField[propKey] = resolvedValue;
    }
  }
}

/**
 * 重新生成 Status.status 中所有嵌套字段的 uuid
 */
function regenerateStatusIds(statusObj: Record<string, Record<string, unknown>>): void {
  for (const item of Object.values(statusObj)) {
    if (item && typeof item === "object" && "id" in item) {
      item["id"] = uuidv4();
    }
  }
}
