// 契约：core/schema/validator.ts —— LowCodeSchema 结构完整性校验（contracts/schema-validation.md）
// 只校验 id/clientKey 唯一性与 name 是否为已知题型，不校验 status 内部业务取值范围（契约明确排除）
import { describe, expect, it } from "vitest";
import { validateSchema } from "../validator";
import type { LowCodeSchema, SchemaComponent } from "../types";

function makeComponent(overrides: Partial<SchemaComponent> = {}): SchemaComponent {
  return {
    schemaVersion: 2,
    name: "text-input",
    id: "q1",
    status: {},
    ...overrides
  } as SchemaComponent;
}

describe("validateSchema", () => {
  it("合法 Schema（id/clientKey 均唯一，name 均为已知题型）校验通过", () => {
    const schema: LowCodeSchema = {
      schemaVersion: 2,
      components: [
        makeComponent({ id: "q1", clientKey: "ck-1" }),
        makeComponent({ id: "q2", clientKey: "ck-2", name: "single-select" })
      ]
    };

    const result = validateSchema(schema);

    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it("components 为空数组时视为合法（尚未添加任何题目）", () => {
    const schema: LowCodeSchema = { schemaVersion: 2, components: [] };

    const result = validateSchema(schema);

    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it("id 重复时校验失败并报告重复位置", () => {
    const schema: LowCodeSchema = {
      schemaVersion: 2,
      components: [makeComponent({ id: "dup" }), makeComponent({ id: "dup" })]
    };

    const result = validateSchema(schema);

    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: "components[1].id" })])
    );
  });

  it("clientKey 重复时校验失败并报告重复位置", () => {
    const schema: LowCodeSchema = {
      schemaVersion: 2,
      components: [
        makeComponent({ id: "q1", clientKey: "dup-ck" }),
        makeComponent({ id: "q2", clientKey: "dup-ck" })
      ]
    };

    const result = validateSchema(schema);

    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: "components[1].clientKey" })])
    );
  });

  it("name 不是已知 Material 字面量时校验失败", () => {
    const schema: LowCodeSchema = {
      schemaVersion: 2,
      components: [makeComponent({ id: "q1", name: "unknown-type-x" as SchemaComponent["name"] })]
    };

    const result = validateSchema(schema);

    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: "components[0].name" })])
    );
  });

  it("不抛异常，多项校验失败时一次性返回全部 issue", () => {
    const schema: LowCodeSchema = {
      schemaVersion: 2,
      components: [
        makeComponent({ id: "dup", name: "unknown-type-x" as SchemaComponent["name"] }),
        makeComponent({ id: "dup" })
      ]
    };

    expect(() => validateSchema(schema)).not.toThrow();
    const result = validateSchema(schema);
    expect(result.valid).toBe(false);
    expect(result.issues.length).toBeGreaterThanOrEqual(2);
  });
});
