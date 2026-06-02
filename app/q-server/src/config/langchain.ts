import { ChatOpenAI } from "@langchain/openai";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";

export interface ChatModelOptions {
  model?: string;
  temperature?: number;
}

export const createOpenAIChat = (options?: ChatModelOptions) =>
  new ChatOpenAI({
    model: options?.model ?? "gpt-4o-mini",
    temperature: options?.temperature ?? 0.7,
    apiKey: process.env.OPENAI_API_KEY
  });

export const createAnthropicChat = (options?: ChatModelOptions) =>
  new ChatAnthropic({
    model: options?.model ?? "claude-sonnet-4-6",
    temperature: options?.temperature ?? 0.7,
    apiKey: process.env.ANTHROPIC_API_KEY
  });

export { ChatPromptTemplate, StringOutputParser };
