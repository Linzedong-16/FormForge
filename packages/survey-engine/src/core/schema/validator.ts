// core/schema/validator.ts —— LowCodeSchema 结构完整性校验（contracts/schema-validation.md、data-model.md §1）。
// 纯函数，不抛异常，只校验结构层面完整性（id/clientKey 唯一性、name 是否为已知题型），
// 不校验 FieldConfig.status 内部业务取值范围（属于各题型组件自身编辑态校验，不属于本次改造范围）。
import { isSurveyComName, type LowCodeSchema, type Material } from "./types";

export interface SchemaValidationIssue {
  path: string;
  message: string;
}

export interface SchemaValidationResult {
  valid: boolean;
  issues: SchemaValidationIssue[];
}

// Material = SurveyComName | "text-note" | "computed-field"，
// isSurveyComName 只覆盖题目类型部分，此处补齐非题目类型的两个成员
function isKnownMaterial(name: string): name is Material {
  return isSurveyComName(name) || name === "text-note" || name === "computed-field";
}

export function validateSchema(schema: LowCodeSchema): SchemaValidationResult {
  const issues: SchemaValidationIssue[] = [];
  const seenIds = new Set<string>();
  const seenClientKeys = new Set<string>();

  schema.components.forEach((component, index) => {
    if (seenIds.has(component.id)) {
      issues.push({ path: `components[${index}].id`, message: `id "${component.id}" 与其他题目重复` });
    } else {
      seenIds.add(component.id);
    }

    if (component.clientKey !== undefined) {
      if (seenClientKeys.has(component.clientKey)) {
        issues.push({
          path: `components[${index}].clientKey`,
          message: `clientKey "${component.clientKey}" 与其他题目重复`
        });
      } else {
        seenClientKeys.add(component.clientKey);
      }
    }

    if (!isKnownMaterial(component.name)) {
      issues.push({ path: `components[${index}].name`, message: `未知题型标识 "${component.name}"` });
    }
  });

  return { valid: issues.length === 0, issues };
}
