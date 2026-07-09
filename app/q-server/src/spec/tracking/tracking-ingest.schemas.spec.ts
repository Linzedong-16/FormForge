/**
 * tracking-ingest schema 单元测试
 *
 * 重点覆盖本次新增的 environment 字段校验规则
 */
import { describe, it, expect } from "vitest";
import { trackEventSchema, trackBatchSchema } from "../../modules/tracking/tracking-ingest/tracking-ingest.schemas.js";

function baseEvent(overrides: Record<string, unknown> = {}) {
  return {
    event_id: "019a6f80-1234-7abc-8def-0123456789ab",
    event_name: "editor_perf",
    app_id: "q-editor",
    environment: "production",
    timestamp: new Date().toISOString(),
    sdk_version: "1.0.0",
    ...overrides
  };
}

describe("trackEventSchema — environment 字段", () => {
  it("接受合法的 environment 取值", () => {
    for (const environment of ["production", "staging", "development"]) {
      const result = trackEventSchema.safeParse(baseEvent({ environment }));
      expect(result.success).toBe(true);
    }
  });

  it("缺失 environment 时校验失败", () => {
    const event = baseEvent();
    delete (event as Record<string, unknown>).environment;

    const result = trackEventSchema.safeParse(event);
    expect(result.success).toBe(false);
  });

  it("非法 environment 取值时校验失败", () => {
    const result = trackEventSchema.safeParse(baseEvent({ environment: "prod" }));
    expect(result.success).toBe(false);
  });
});

describe("trackBatchSchema — environment 字段", () => {
  it("批量事件中每一条都必须携带合法 environment", () => {
    const validBatch = trackBatchSchema.safeParse({
      events: [baseEvent({ event_id: "id-1" }), baseEvent({ event_id: "id-2", environment: "staging" })]
    });
    expect(validBatch.success).toBe(true);

    const invalidBatch = trackBatchSchema.safeParse({
      events: [baseEvent({ event_id: "id-1" }), baseEvent({ event_id: "id-2", environment: "not-a-real-env" })]
    });
    expect(invalidBatch.success).toBe(false);
  });
});
