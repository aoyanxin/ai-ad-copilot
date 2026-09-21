import { ConfigService } from '@nestjs/config';

import { DeepSeekLlmClient } from './deepseek-llm-client';
import { createLlmClient, resolveLlmProvider, SUPPORTED_LLM_PROVIDERS } from './llm-client.factory';
import { MockLlmClient } from './mock-llm-client';

describe('resolveLlmProvider', () => {
  it('识别 mock / deepseek，且大小写与空白无关', () => {
    expect(resolveLlmProvider('mock')).toBe('mock');
    expect(resolveLlmProvider(' MOCK ')).toBe('mock');
    expect(resolveLlmProvider('deepseek')).toBe('deepseek');
    expect(resolveLlmProvider('DeepSeek')).toBe('deepseek');
  });

  it('缺省与未知取值都回落到 deepseek', () => {
    expect(resolveLlmProvider(undefined)).toBe('deepseek');
    expect(resolveLlmProvider('')).toBe('deepseek');
    expect(resolveLlmProvider('openai')).toBe('deepseek');
  });

  it('支持列表与文档一致', () => {
    expect([...SUPPORTED_LLM_PROVIDERS]).toEqual(['deepseek', 'mock']);
  });
});

describe('createLlmClient', () => {
  it('LLM_PROVIDER=mock 时返回 MockLlmClient', () => {
    const client = createLlmClient(new ConfigService({ LLM_PROVIDER: 'mock' }));

    expect(client).toBeInstanceOf(MockLlmClient);
    expect(client.model).toBe('mock-llm');
  });

  it('默认（deepseek）返回 DeepSeekLlmClient，并读取 LLM_MODEL', () => {
    const client = createLlmClient(new ConfigService({ LLM_MODEL: 'deepseek-chat' }));

    expect(client).toBeInstanceOf(DeepSeekLlmClient);
    expect(client.model).toBe('deepseek-chat');
  });

  it('缺省模型名回落到 deepseek-chat', () => {
    const client = createLlmClient(new ConfigService({}));

    expect(client.model).toBe('deepseek-chat');
  });
});
