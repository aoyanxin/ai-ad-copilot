import type { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { DeepSeekLlmClient } from './deepseek-llm-client';
import type { LlmClient } from './llm-client';
import { MockLlmClient } from './mock-llm-client';

/** 注入 token：业务侧只依赖 LlmClient 接口 */
export const LLM_CLIENT = Symbol('LLM_CLIENT');

export const SUPPORTED_LLM_PROVIDERS = ['deepseek', 'mock'] as const;

export type LlmProvider = (typeof SUPPORTED_LLM_PROVIDERS)[number];

export function resolveLlmProvider(raw: string | undefined): LlmProvider {
  const normalized = raw?.trim().toLowerCase();
  if (normalized === 'mock') {
    return 'mock';
  }
  // 默认 deepseek；未知取值也回落到 deepseek，并由 DeepSeekLlmClient 给出鉴权错误提示
  return 'deepseek';
}

export function createLlmClient(configService: ConfigService): LlmClient {
  return resolveLlmProvider(configService.get<string>('LLM_PROVIDER')) === 'mock'
    ? new MockLlmClient()
    : new DeepSeekLlmClient(configService);
}

export const llmClientProvider: Provider = {
  provide: LLM_CLIENT,
  useFactory: createLlmClient,
  inject: [ConfigService],
};
