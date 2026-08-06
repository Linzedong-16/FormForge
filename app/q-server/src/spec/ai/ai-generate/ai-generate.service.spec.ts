/**
 * AIGenerateService 单元测试
 *
 * 覆盖范围（对应 tasks.md T022，FR-020/SC-006）：
 *   - 生成前 RAG 检索命中历史模板片段时，正确拼入 System Prompt 的参考章节
 *   - 检索为空/异常/超时/fastify.aiRag 未装饰时，均跳过增强但不中断生成主流程
 *
 * Mock 策略：
 *   - chatModel 通过 mock `config/langchain.js` 的 createDeepSeekChat 构造，
 *     避免真实调用 DeepSeek API（与 embedding.service.spec.ts 保持一致的 mock 方式）
 *   - fastify.redis / fastify.prisma 使用 test-helpers 的通用 mock，
 *     仅需将限流计数器 incr 结果配置为放行
 *   - fastify.aiRag.retriever.hybridSearch 直接复用 createFastifyMock() 内置 mock
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AIGenerateService } from "../../../modules/ai/ai-generate/ai-generate.service.js";
import type { SSEEvent } from "../../../modules/ai/ai-generate/ai-generate.service.js";
import { createFastifyMock } from "../../utils/test-helpers.js";

// ─── Mock：跳过真实 DeepSeek Chat 构造，直接返回可控的假流 ──────
const createDeepSeekChatMock = vi.fn();
vi.mock("../../../config/langchain.js", () => ({
  createDeepSeekChat: (...args: unknown[]) => createDeepSeekChatMock(...args)
}));

// ─── 测试固定数据 ────────────────────────────────────────────

const USER_ID = BigInt(2);

/** 一份可通过 Zod 校验的最小合法 AI 输出 JSON */
const VALID_AI_JSON = JSON.stringify({
  title: "测试问卷",
  description: "",
  components: [{ type: "text-input", config: { title: { status: "你的姓名", isShow: true } } }]
});

/** 收集 AsyncGenerator 产出的全部 SSE 事件 */
async function collectEvents(gen: AsyncGenerator<SSEEvent>): Promise<SSEEvent[]> {
  const events: SSEEvent[] = [];
  for await (const ev of gen) events.push(ev);
  return events;
}

describe("AIGenerateService", () => {
  let fastify: ReturnType<typeof createFastifyMock>;
  let service: AIGenerateService;

  beforeEach(() => {
    vi.clearAllMocks();
    fastify = createFastifyMock();

    // 限流放行：incr 返回 1（未超过 max=3）
    fastify.redis.set.mockResolvedValue("OK");
    fastify.redis.incr.mockResolvedValue(1);

    // chatModel.stream 默认返回一个合法 JSON 的单个 chunk（for-await 可直接消费数组）
    createDeepSeekChatMock.mockResolvedValue({
      stream: vi.fn().mockResolvedValue([{ content: VALID_AI_JSON, response_metadata: { tokenUsage: { totalTokens: 10 } } }])
    });

    service = new AIGenerateService(fastify);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("生成前 RAG 检索增强", () => {
    it("检索命中历史模板 → 参考片段拼入 System Prompt，且生成正常完成", async () => {
      fastify.aiRag.retriever.hybridSearch.mockResolvedValue({
        items: [
          {
            id: "1",
            score: 0.9,
            vectorScore: 0.9,
            keywordScore: 0.8,
            snippet: "您的性别是？",
            source: { type: "template", refId: "200", title: "客户满意度调查模板" }
          }
        ],
        degraded: null
      });

      const events = await collectEvents(service.generate(USER_ID, { prompt: "帮我生成一份客户满意度调查问卷" }));

      // 检索以正确的 scope/query/topK 调用
      expect(fastify.aiRag.retriever.hybridSearch).toHaveBeenCalledWith(
        "template",
        "帮我生成一份客户满意度调查问卷",
        { topK: 3 }
      );

      // System Prompt（chatModel.stream 的第一个 message）应包含检索到的参考片段
      const chatModel = await createDeepSeekChatMock.mock.results[0]!.value;
      const [messages] = chatModel.stream.mock.calls[0] as [Array<{ content: string }>];
      const systemContent = messages[0]!.content;
      expect(systemContent).toContain("历史模板参考");
      expect(systemContent).toContain("客户满意度调查模板");
      expect(systemContent).toContain("您的性别是？");

      // 生成流程未受影响，正常产出 done 事件
      expect(events.some(e => e.event === "done")).toBe(true);
      expect(events.some(e => e.event === "error")).toBe(false);
    });

    it("检索命中为空 → 不拼入参考章节，仍正常生成", async () => {
      fastify.aiRag.retriever.hybridSearch.mockResolvedValue({ items: [], degraded: null });

      const events = await collectEvents(service.generate(USER_ID, { prompt: "生成一份员工满意度调查问卷" }));

      const chatModel = await createDeepSeekChatMock.mock.results[0]!.value;
      const [messages] = chatModel.stream.mock.calls[0] as [Array<{ content: string }>];
      expect(messages[0]!.content).not.toContain("历史模板参考");

      expect(events.some(e => e.event === "done")).toBe(true);
    });

    it("检索抛出异常 → 跳过增强，生成流程不中断也不报错", async () => {
      fastify.aiRag.retriever.hybridSearch.mockRejectedValue(new Error("向量检索服务暂时不可用"));

      const events = await collectEvents(service.generate(USER_ID, { prompt: "生成一份产品调研问卷" }));

      const chatModel = await createDeepSeekChatMock.mock.results[0]!.value;
      const [messages] = chatModel.stream.mock.calls[0] as [Array<{ content: string }>];
      expect(messages[0]!.content).not.toContain("历史模板参考");

      expect(events.some(e => e.event === "done")).toBe(true);
      expect(events.some(e => e.event === "error")).toBe(false);
      expect(fastify.log.warn).toHaveBeenCalledWith(
        expect.objectContaining({ err: expect.any(Error) }),
        "RAG 生成前检索异常，跳过增强"
      );
    });

    it("检索超时（超过 1.5s 预算）→ 跳过增强，生成流程不中断", async () => {
      vi.useFakeTimers();
      // 永不 resolve，模拟检索卡住 → 触发 Promise.race 的超时分支
      fastify.aiRag.retriever.hybridSearch.mockImplementation(() => new Promise(() => {}));

      const eventsPromise = collectEvents(service.generate(USER_ID, { prompt: "生成一份满意度调查问卷" }));

      // 推进到超时阈值，触发 setTimeout 回调
      await vi.advanceTimersByTimeAsync(1500);
      const events = await eventsPromise;

      expect(fastify.log.warn).toHaveBeenCalledWith("RAG 生成前检索超时，跳过增强");
      expect(events.some(e => e.event === "done")).toBe(true);
      expect(events.some(e => e.event === "error")).toBe(false);
    });

    it("fastify.aiRag 未装饰（RAG 模块未启用）→ 直接跳过检索，生成正常返回", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (fastify as any).aiRag = undefined;

      const events = await collectEvents(service.generate(USER_ID, { prompt: "生成一份满意度调查问卷" }));

      expect(events.some(e => e.event === "done")).toBe(true);
      expect(events.some(e => e.event === "error")).toBe(false);
    });
  });
});
