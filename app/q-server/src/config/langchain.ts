import { ChatOpenAI, OpenAIEmbeddings } from "@langchain/openai";
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

// ─── Embedding 能力（RAG 检索增强，007-rag-retrieval-augmentation） ──────────
// 固定使用硅基流动（SiliconFlow）中转的 BAAI/bge-large-zh-v1.5 模型，
// 不做多 Provider 切换/降级——语义向量化与上方 Chat 推理模型配置完全独立，
// Key 单独走 SILICONFLOW_API_KEY 环境变量，不复用 system_configs 表。
const SILICONFLOW_BASE_URL = "https://api.siliconflow.cn/v1";
const SILICONFLOW_EMBEDDING_MODEL = "BAAI/bge-large-zh-v1.5";

/** 单条文本的向量化结果 */
export interface EmbeddingResult {
  /** 归一化向量，维度由实际生效的模型决定 */
  vector: number[];
  /** 实际生效的 Embedding Provider（固定为硅基流动，不做多 Provider 切换） */
  provider: "siliconflow";
  /** 向量维度（BAAI/bge-large-zh-v1.5 为 1024 维，调用方仍不应硬编码，以真实返回值为准） */
  dimension: number;
}

/** 硅基流动 Embedding 客户端（模块级懒加载单例，避免重复实例化） */
let siliconFlowEmbeddings: OpenAIEmbeddings | null = null;

/**
 * 获取硅基流动 Embedding 客户端实例（单例模式）
 * @returns 硅基流动 Embedding 客户端实例
 */
function getSiliconFlowEmbeddings(): OpenAIEmbeddings {
  if (!process.env.SILICONFLOW_API_KEY) {
    throw new Error("SILICONFLOW_API_KEY 未配置，请在 .env 中填写硅基流动 API Key");
  }
  if (!siliconFlowEmbeddings) {
    siliconFlowEmbeddings = new OpenAIEmbeddings({
      model: SILICONFLOW_EMBEDDING_MODEL,
      apiKey: process.env.SILICONFLOW_API_KEY,
      configuration: { baseURL: SILICONFLOW_BASE_URL }
    });
  }
  return siliconFlowEmbeddings;
}

/**
 * 批量计算文本向量：固定调用硅基流动 BAAI/bge-large-zh-v1.5，不做 Provider 间降级。
 *
 * @param _fastify  Fastify 实例（保留仅为不破坏 embedding.service.ts 现有调用签名，本函数不再需要查库）
 * @param texts     待向量化文本数组
 * @returns 向量化结果数组，每个元素为 EmbeddingResult 实例
 */
export async function embedBatch(_fastify: FastifyInstance, texts: string[]): Promise<EmbeddingResult[]> {
  const vectors = await getSiliconFlowEmbeddings().embedDocuments(texts);
  return vectors.map(vector => ({ vector, provider: "siliconflow" as const, dimension: vector.length }));
}

/**
 * 计算单条文本向量（embedBatch 的单条包装）
 */
export async function embedText(fastify: FastifyInstance, text: string): Promise<EmbeddingResult> {
  const [result] = await embedBatch(fastify, [text]);
  return result;
}
