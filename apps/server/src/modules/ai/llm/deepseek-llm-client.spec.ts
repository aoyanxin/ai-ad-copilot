import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ErrorCode } from '../../../common/constants/error-code';
import { DeepSeekLlmClient } from './deepseek-llm-client';
import { resolveTimeoutMs } from './stream-timeouts';
import {
  LlmAbortError,
  LlmAuthError,
  LlmRateLimitError,
  LlmTimeoutError,
  LlmUpstreamError,
  type LlmMessage,
} from './llm-client';

interface OpenAiChunk {
  choices: { delta: { content?: string } }[];
}

jest.mock('openai', () => {
  const create = jest.fn();
  const OpenAI = jest.fn(() => ({ chat: { completions: { create } } }));

  return { __esModule: true, default: OpenAI, __create: create };
});

const openAiMock = jest.requireMock('openai') as unknown as {
  default: jest.Mock;
  __create: jest.Mock;
};

const MESSAGES: LlmMessage[] = [
  { role: 'system', content: '你是广告文案专家' },
  { role: 'user', content: '写一条文案' },
];

function createClient(config: Record<string, string>): DeepSeekLlmClient {
  return new DeepSeekLlmClient(new ConfigService(config));
}

async function collect(client: DeepSeekLlmClient, signal?: AbortSignal): Promise<string[]> {
  const chunks: string[] = [];
  for await (const chunk of client.chatStream(MESSAGES, { signal })) {
    chunks.push(chunk);
  }
  return chunks;
}

async function* chunkStream(): AsyncIterable<OpenAiChunk> {
  yield { choices: [{ delta: { content: '秋季上新' } }] };
  yield { choices: [{ delta: {} }] };
  yield { choices: [{ delta: { content: '，点击了解' } }] };
}

describe('DeepSeekLlmClient', () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  describe('resolveTimeoutMs', () => {
    it('缺省 / 非法值回落到 120s，合法值生效', () => {
      expect(resolveTimeoutMs(undefined, 120_000)).toBe(120_000);
      expect(resolveTimeoutMs('abc', 120_000)).toBe(120_000);
      expect(resolveTimeoutMs('0', 120_000)).toBe(120_000);
      expect(resolveTimeoutMs('60000', 120_000)).toBe(60_000);
    });
  });

  describe('配置', () => {
    it('用 apiKey / baseURL / 模型 / 超时构造 SDK，且关闭自动重试', () => {
      createClient({
        LLM_API_KEY: 'sk-test',
        LLM_BASE_URL: 'https://api.deepseek.com',
        LLM_MODEL: 'deepseek-chat',
        LLM_TOTAL_TIMEOUT_MS: '90000',
      });

      expect(openAiMock.default).toHaveBeenCalledWith({
        apiKey: 'sk-test',
        baseURL: 'https://api.deepseek.com',
        maxRetries: 0,
        timeout: 90_000,
      });
    });

    it('缺少 apiKey 时不在构造期抛错（避免服务起不来），但首次调用返回 40100', async () => {
      const client = createClient({ LLM_API_KEY: '' });

      await expect(collect(client)).rejects.toMatchObject({
        code: ErrorCode.UNAUTHORIZED,
        message: expect.stringContaining('LLM_API_KEY'),
      });
      expect(openAiMock.default).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalled();
    });
  });

  describe('chatStream', () => {
    it('stream: true 调用上游，只产出非空 delta', async () => {
      openAiMock.__create.mockResolvedValue(chunkStream());
      const client = createClient({ LLM_API_KEY: 'sk-test' });

      const chunks = await collect(client);

      expect(chunks).toEqual(['秋季上新', '，点击了解']);
      expect(openAiMock.__create).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'deepseek-chat',
          messages: MESSAGES,
          stream: true,
          max_tokens: 400,
        }),
        { signal: undefined },
      );
    });

    it('自定义 temperature 与 max_tokens 透传', async () => {
      openAiMock.__create.mockResolvedValue(chunkStream());
      const client = createClient({ LLM_API_KEY: 'sk-test' });

      const chunks: string[] = [];
      for await (const chunk of client.chatStream(MESSAGES, {
        temperature: 0.2,
        maxTokens: 120,
      })) {
        chunks.push(chunk);
      }

      expect(openAiMock.__create).toHaveBeenCalledWith(
        expect.objectContaining({ temperature: 0.2, max_tokens: 120 }),
        expect.anything(),
      );
    });

    it('把上游错误翻译成 40100 / 42900 / 50400 / 50200', async () => {
      const client = createClient({ LLM_API_KEY: 'sk-test' });

      openAiMock.__create.mockRejectedValue({ status: 401 });
      await expect(collect(client)).rejects.toBeInstanceOf(LlmAuthError);

      openAiMock.__create.mockRejectedValue({ status: 429 });
      await expect(collect(client)).rejects.toBeInstanceOf(LlmRateLimitError);

      openAiMock.__create.mockRejectedValue({ name: 'APIConnectionTimeoutError' });
      await expect(collect(client)).rejects.toBeInstanceOf(LlmTimeoutError);

      openAiMock.__create.mockRejectedValue({ status: 503 });
      await expect(collect(client)).rejects.toBeInstanceOf(LlmUpstreamError);
    });

    it('取消被识别为 abort（不当作错误上报）', async () => {
      openAiMock.__create.mockRejectedValue({ name: 'AbortError' });
      const client = createClient({ LLM_API_KEY: 'sk-test' });

      await expect(collect(client)).rejects.toBeInstanceOf(LlmAbortError);
    });
  });
});
