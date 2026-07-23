import { ChatOpenAI } from "@langchain/openai";
import type { FastifyInstance } from "fastify";
import { decrypt } from "../utils/crypto.js";

export interface ChatModelOptions {
  model?: string;
  temperature?: number;
  /** 最大输出 Token 数（默认 4096） */
  maxTokens?: number;
}

export const createOpenAIChat = (options?: ChatModelOptions) =>
  new ChatOpenAI({
    model: options?.model ?? "gpt-4o-mini",
    temperature: options?.temperature ?? 0.7,
    maxTokens: options?.maxTokens ?? 4096,
    apiKey: process.env.OPENAI_API_KEY
  });

export const createAnthropicChat = (options?: ChatModelOptions) =>
  new ChatOpenAI({
    model: options?.model ?? "claude-sonnet-4-6",
    temperature: options?.temperature ?? 0.7,
    maxTokens: options?.maxTokens ?? 4096,
    apiKey: process.env.ANTHROPIC_API_KEY
  });

/**
 * AI 配置缓存（模块级，避免每次请求都查 DB）
 *
 * 设计说明：
 *   - AI 配置属于低频变更数据（管理员配置后长期不变），模块级缓存足够
 *   - 服务重启后自动刷新
 *   - 可通过设置 aiConfigCache 为 null 手动失效（留给后续 admin 路由调用）
 */
interface AIConfigCache {
  apiKey: string; // 解密后的明文 Key
  model: string;
  enabled: boolean;
}

let aiConfigCache: AIConfigCache | null = null;

/**
 * 从 system_configs 表一次查询获取所有 AI 配置，
 * 缓存到模块级变量，减少 DB 往返。
 */
async function loadAIConfig(fastify: FastifyInstance): Promise<AIConfigCache> {
  const configs = await fastify.prisma.systemConfig.findMany({
    where: { key: { in: ["ai_api_key", "ai_model", "ai_enabled"] } }
  });

  const apiKeyEnc = configs.find(c => c.key === "ai_api_key")?.value;
  const model = configs.find(c => c.key === "ai_model")?.value ?? "deepseek-chat";
  const enabled = configs.find(c => c.key === "ai_enabled")?.value === "true";

  if (!apiKeyEnc) {
    throw new Error("DeepSeek API Key 未配置，请在系统设置中上传");
  }

  const apiKey = decrypt(apiKeyEnc);
  return { apiKey, model, enabled };
}

/**
 * 失效 AI 配置缓存（admin 更新配置后调用）
 */
export function invalidateAIConfigCache(): void {
  aiConfigCache = null;
}

/**
 * 创建 DeepSeek Chat 模型实例
 *
 * API Key 运行时从 system_configs 表读取并 AES-256-GCM 解密。
 * 配置有模块级缓存，仅首次调用或缓存失效时查 DB。
 *
 * @param fastify  Fastify 实例
 * @param options  可选配置（model / temperature），会覆盖 DB 中的模型设置
 * @returns ChatOpenAI 实例
 */
export const createDeepSeekChat = async (fastify: FastifyInstance, options?: ChatModelOptions) => {
  // 模块级缓存：仅首次或失效后查 DB
  if (!aiConfigCache) {
    aiConfigCache = await loadAIConfig(fastify);
  }

  if (!aiConfigCache.enabled) {
    throw new Error("AI 生成功能已被管理员关闭");
  }

  const resolvedModel = options?.model ?? aiConfigCache.model;
  const chatModel = new ChatOpenAI({
    model: resolvedModel,
    temperature: options?.temperature ?? 0.7,
    maxTokens: options?.maxTokens ?? 4096,
    apiKey: aiConfigCache.apiKey,
    configuration: {
      baseURL: "https://api.deepseek.com/v1"
    }
  });

  // deepseek-reasoner 系列模型不支持 response_format 等参数，跳过 JSON 模式绑定
  if (resolvedModel.includes("reasoner")) {
    return chatModel;
  }

  // 绑定 JSON 模式：由 DeepSeek 服务端保证输出是合法 JSON，
  // 减少对"提示词约束 + 事后文本容错解析"的依赖
  return chatModel.bind({ response_format: { type: "json_object" } });
};
