import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

import {
  translateLlmError,
  LlmAuthError,
  type ChatStreamOptions,
  type LlmClient,
  type LlmMessage,
} from './llm-client';
import { resolveTimeoutMs } from './stream-timeouts';

/** 默认总时长上限：与 .env.example 的 LLM_TOTAL_TIMEOUT_MS 保持一致 */
const DEFAULT_TOTAL_TIMEOUT_MS = 120_000;
const DEFAULT_MODEL = 'deepseek-chat';
const DEFAULT_BASE_URL = 'https://api.deepseek.com';
/** 单次生成的最大输出 token：成本兜底，避免模型长篇大论 */
const DEFAULT_MAX_TOKENS = 400;

/**
 * DeepSeek 的 OpenAI 兼容实现。
 *
 * - `stream: true`，逐 chunk 取 `choices[0].delta.content`
 * - `maxRetries: 0`：不自动重试（重试会造成重复文本与双倍 token 成本）
 * - 缺少 API key 时不在构造期抛错，而是首次调用抛 LlmAuthError（40100），
 *   避免"配错 key 导致整个服务起不来"
 */
export class DeepSeekLlmClient implements LlmClient {
  readonly model: string;

  private readonly logger = new Logger(DeepSeekLlmClient.name);
  private readonly client: OpenAI | null;
  private readonly configured: boolean;

  constructor(configService: ConfigService) {
    const apiKey = configService.get<string>('LLM_API_KEY')?.trim() ?? '';
    const baseURL = configService.get<string>('LLM_BASE_URL')?.trim() || DEFAULT_BASE_URL;

    this.model = configService.get<string>('LLM_MODEL')?.trim() || DEFAULT_MODEL;
    this.configured = apiKey.length > 0;
    this.client = this.configured
      ? new OpenAI({
          apiKey,
          baseURL,
          maxRetries: 0,
          timeout: resolveTimeoutMs(
            configService.get<string>('LLM_TOTAL_TIMEOUT_MS'),
            DEFAULT_TOTAL_TIMEOUT_MS,
          ),
        })
      : null;

    if (!this.configured) {
      this.logger.warn('未配置 LLM_API_KEY：/api/ai/* 会返回 40100，直到补齐配置');
    }
  }

  async *chatStream(
    messages: LlmMessage[],
    options: ChatStreamOptions = {},
  ): AsyncIterable<string> {
    if (!this.client) {
      throw new LlmAuthError('未配置 LLM_API_KEY');
    }

    try {
      const stream = await this.client.chat.completions.create(
        {
          model: this.model,
          messages,
          stream: true,
          temperature: options.temperature ?? 0.8,
          max_tokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
        },
        { signal: options.signal },
      );

      for await (const chunk of stream) {
        const text = chunk.choices?.[0]?.delta?.content;
        if (text) {
          yield text;
        }
      }
    } catch (error) {
      throw translateLlmError(error);
    }
  }
}
