import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ErrorCode } from '../../common/constants/error-code';
import { AiService, LOG_VALUE_MAX_LENGTH, toHttpException, truncateForLog } from './ai.service';
import { LlmAbortError, LlmRateLimitError, LlmTimeoutError } from './llm/llm-client';
import type { ChatStreamOptions, LlmClient, LlmMessage } from './llm/llm-client';
import { MockLlmClient } from './llm/mock-llm-client';

const REQUEST = {
  product: '秋季轻薄风衣',
  audience: '25-35 岁通勤女性',
  channel: 'douyin' as const,
  tone: 'professional' as const,
  variants: 3,
};

function createService(
  client: LlmClient = new MockLlmClient({ chunkDelayMs: 0 }),
  env: Record<string, string> = {},
): AiService {
  return new AiService(client, new ConfigService(env));
}

async function collect(source: AsyncIterable<string>): Promise<string> {
  const chunks: string[] = [];
  for await (const chunk of source) {
    chunks.push(chunk);
  }
  return chunks.join('');
}

/** 只吐固定文本的假 client，用于覆盖解析失败等路径 */
class FakeLlmClient implements LlmClient {
  readonly model = 'fake-llm';

  constructor(private readonly tokens: string[]) {}

  async *chatStream(_messages: LlmMessage[], _options?: ChatStreamOptions): AsyncIterable<string> {
    for (const token of this.tokens) {
      yield token;
    }
  }
}

describe('truncateForLog', () => {
  it('短文本原样保留并折叠空白', () => {
    expect(truncateForLog('  秋  季\n上新 ')).toBe('秋 季 上新');
  });

  it('超长文本截断到上限并加省略号', () => {
    const long = 'a'.repeat(LOG_VALUE_MAX_LENGTH + 50);
    const result = truncateForLog(long);

    expect(result).toHaveLength(LOG_VALUE_MAX_LENGTH + 1);
    expect(result.endsWith('…')).toBe(true);
  });

  it('可自定义上限', () => {
    expect(truncateForLog('abcdef', 4)).toBe('abcd…');
  });
});

describe('toHttpException', () => {
  it('取消返回 null（调用方安静收尾，不当作错误）', () => {
    expect(toHttpException(new LlmAbortError())).toBeNull();
    expect(toHttpException({ name: 'AbortError' })).toBeNull();
  });

  it('限流映射成 429 + 42900', () => {
    const exception = toHttpException(new LlmRateLimitError());

    expect(exception?.getStatus()).toBe(429);
    expect(exception?.getResponse()).toMatchObject({ code: ErrorCode.RATE_LIMITED });
  });

  it('超时映射成 504 + 50400', () => {
    const exception = toHttpException(new LlmTimeoutError());

    expect(exception?.getStatus()).toBe(504);
    expect(exception?.getResponse()).toMatchObject({ code: ErrorCode.LLM_TIMEOUT });
  });

  it('未知错误映射成 500 + 50000', () => {
    const exception = toHttpException(new Error('boom'));

    expect(exception?.getStatus()).toBe(500);
    expect(exception?.getResponse()).toMatchObject({ code: ErrorCode.INTERNAL_SERVER_ERROR });
  });
});

describe('AiService', () => {
  let debugSpy: jest.SpyInstance;

  beforeEach(() => {
    debugSpy = jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
  });

  afterEach(() => {
    debugSpy.mockRestore();
  });

  it('暴露上游模型名（用于 meta 帧）', () => {
    expect(createService().model).toBe('mock-llm');
  });

  it('generateCopywriting 按角度产出不同文案', async () => {
    const service = createService();

    const sellingPoint = await collect(service.generateCopywriting(REQUEST, 'selling_point'));
    const scenario = await collect(service.generateCopywriting(REQUEST, 'scenario'));

    expect(sellingPoint.length).toBeGreaterThan(0);
    expect(sellingPoint).not.toBe(scenario);
  });

  it('rewriteCopywriting 会把原文与指令带进 prompt', async () => {
    const service = createService();

    const text = await collect(
      service.rewriteCopywriting({ original: '原始文案', instruction: '更紧迫' }),
    );

    expect(text.length).toBeGreaterThan(0);
    const logged = debugSpy.mock.calls.map((call) => String(call[0]));
    expect(logged.some((line) => line.includes('rewrite'))).toBe(true);
  });

  it('静默超时会中断（LLM_TIMEOUT_MS 可覆盖）', async () => {
    const service = createService(new MockLlmClient({ chunkDelayMs: 500 }), {
      LLM_TIMEOUT_MS: '30',
    });

    await expect(collect(service.generateCopywriting(REQUEST, 'benefit'))).rejects.toBeInstanceOf(
      LlmTimeoutError,
    );
  });

  it('外部取消会中断生成，并且传播到上游 client', async () => {
    const client = new MockLlmClient({ chunkDelayMs: 5 });
    const service = createService(client);
    const controller = new AbortController();
    const chunks: string[] = [];

    await expect(
      (async () => {
        for await (const chunk of service.generateCopywriting(
          REQUEST,
          'selling_point',
          controller.signal,
        )) {
          chunks.push(chunk);
          if (chunks.length === 1) {
            controller.abort();
          }
        }
      })(),
    ).rejects.toBeInstanceOf(LlmAbortError);

    expect(chunks).toHaveLength(1);
    expect(client.abortObservations).toBe(1);
  });

  it('已经取消的 signal 不会产出任何内容', async () => {
    const service = createService();
    const controller = new AbortController();
    controller.abort();

    await expect(
      collect(service.generateCopywriting(REQUEST, 'benefit', controller.signal)),
    ).rejects.toBeInstanceOf(LlmAbortError);
  });

  it('scoreCopywriting 解析 mock 的结构化输出', async () => {
    const service = createService();

    const results = await service.scoreCopywriting(['第一条文案', '第二条文案']);

    expect(results).toHaveLength(2);
    expect(results.map((item) => item.index)).toEqual([0, 1]);
    results.forEach((item) => {
      expect(item.score).toBeGreaterThanOrEqual(60);
      expect(item.score).toBeLessThan(100);
      expect(item.reasons.length).toBeGreaterThan(0);
    });
  });

  it('scoreCopywriting 遇到非 JSON 输出抛 LLM 上游错误（50200）', async () => {
    const service = createService(new FakeLlmClient(['模型今天不想打分']));

    await expect(service.scoreCopywriting(['文案'])).rejects.toMatchObject({
      code: ErrorCode.LLM_UPSTREAM,
    });
  });

  it('日志里的 prompt 与输出都被截断到 200 字符内', async () => {
    const service = createService();
    const longProduct = '超长产品名'.repeat(100);

    await collect(service.generateCopywriting({ ...REQUEST, product: longProduct }, 'benefit'));

    const logged = debugSpy.mock.calls.map((call) => String(call[0]));
    const promptLine = logged.find((line) => line.includes('prompt=')) ?? '';
    const outputLine = logged.find((line) => line.includes('输出：')) ?? '';

    const promptValue = (promptLine.split('prompt="')[1] ?? '').replace(/"$/, '');
    const outputValue = outputLine.split('输出：')[1] ?? '';

    expect(promptLine).toContain('prompt=');
    expect(promptValue.length).toBeLessThanOrEqual(LOG_VALUE_MAX_LENGTH + 1);
    expect(outputLine).toContain('输出：');
    expect(outputValue.length).toBeLessThanOrEqual(LOG_VALUE_MAX_LENGTH + 1);
  });
});
