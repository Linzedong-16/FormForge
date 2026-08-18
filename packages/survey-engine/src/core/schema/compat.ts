// core/schema/compat.ts —— 旧格式题目数据的检测与运行时兼容转换（contracts/schema-validation.md、research.md R4）。
// 历史数据（Status.type/BaseProps.editCom 挂载组件运行时引用、或缺少 schemaVersion 标记）在加载时
// 经此模块转换为纯 JSON 的 SchemaComponent，转换过程为纯函数、同步、无副作用，不写回任何持久化存储。
import type { FieldConfig, SchemaComponent } from "./types";

// 旧格式题目对象的宽松形态：字段是否存在、取值类型均不确定，仅在此模块内部按需窄化
type LegacyRawComponent = Record<string, unknown>;

/**
 * 判定一个题目对象是否为旧格式。命中以下任一条件即视为旧格式：
 * 1. 存在 type 属性且其值不是 string（现状组件引用属性）；
 * 2. status 内任一字段配置存在 editCom 属性（现状字段编辑器组件引用属性）；
 * 3. schemaVersion 不等于 2（包括缺失该字段）。
 */
export function isLegacyComponent(raw: unknown): boolean {
  if (typeof raw !== "object" || raw === null) {
    return false;
  }
  const obj = raw as LegacyRawComponent;

  if ("type" in obj && typeof obj.type !== "string") {
    return true;
  }

  const status = obj.status;
  if (status && typeof status === "object") {
    for (const field of Object.values(status as Record<string, unknown>)) {
      if (field && typeof field === "object" && "editCom" in (field as LegacyRawComponent)) {
        return true;
      }
    }
  }

  return obj.schemaVersion !== 2;
}

/**
 * 将旧格式（或已是新格式）的题目对象转换为纯 JSON 的 SchemaComponent：
 * 剥离 type/status[*].editCom 等运行时引用属性，补齐 schemaVersion: 2，
 * 其余字段（id/name/clientKey/status 内配置值/logic）原样保留，对已是新格式的输入结果幂等。
 */
export function toSchemaComponent(raw: SchemaComponent | LegacyRawComponent): SchemaComponent {
  const { type, schemaVersion, status, ...rest } = raw as LegacyRawComponent;
  void type;
  void schemaVersion;

  const normalizedStatus: Record<string, FieldConfig> = {};
  if (status && typeof status === "object") {
    for (const [fieldName, fieldRaw] of Object.entries(status as Record<string, unknown>)) {
      const { editCom, ...fieldRest } = fieldRaw as LegacyRawComponent;
      void editCom;
      // fieldRest 静态类型仅为宽松的字符串索引对象，与 FieldConfig 不完全重叠，需先经 unknown 中转
      normalizedStatus[fieldName] = fieldRest as unknown as FieldConfig;
    }
  }

  return {
    ...rest,
    schemaVersion: 2,
    status: normalizedStatus
  } as unknown as SchemaComponent;
}
