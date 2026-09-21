import { ErrorCode } from '../../../common/constants/error-code';
import {
  LlmAbortError,
  LlmAuthError,
  LlmRateLimitError,
  LlmTimeoutError,
  LlmUpstreamError,
  type LlmMessage,
} from './llm-client';
import { MockLlmClient } from './mock-llm-client';

const MESSAGES: LlmMessage[] = [
  { role: 'system', content: '你是广告文案专家' },
  { role: 'user', content: '产品：秋季新品风衣' },
];

async function collect(client: MockLlmClient, signal?: AbortSignal): Promise<string[]> {
  const chunks: string[] = [];
  for await (const chunk of client.chatStream(MESSAGES, { signal })) {
    chunks.push(chunk);
  }
  return chunks;
}

describe('MockLlmClient', () => {
  it('按分片逐步 yield，且同样的输入结果完全一致', async () => {
    const first = await collect(new MockLlmClient({ chunkDelayMs: 0 }));
    const second = await collect(new MockLlmClient({ chunkDelayMs: 0 }));

    expect(first.length).toBeGreaterThan(1);
    expect(first).toEqual(second);
    expect(first.join('')).toContain('mock-');
  });

  it('不同 prompt 产出不同文本（避免"看起来是假数据"）', async () => {
    const client = new MockLlmClient({ chunkDelayMs: 0 });
    const other: LlmMessage[] = [{ role: 'user', content: '产品：冬季羽绒服' }];

    const chunks: string[] = [];
    for await (const chunk of client.chatStream(other, {})) {
      chunks.push(chunk);
    }

    expect(chunks.join('')).not.toBe((await collect(client)).join(''));
  });

  it('已经取消的 signal 立即抛 LlmAbortError，并记录一次取消', async () => {
    const controller = new AbortController();
    controller.abort();
    const client = new MockLlmClient({ chunkDelayMs: 0 });

    await expect(collect(client, controller.signal)).rejects.toBeInstanceOf(LlmAbortError);
    expect(client.abortObservations).toBe(1);
  });

  it('流式过程中取消：抛 LlmAbortError 且记录取消次数', async () => {
    const controller = new AbortController();
    const client = new MockLlmClient({ chunkDelayMs: 5 });
    const chunks: string[] = [];

    await expect(
      (async () => {
        for await (const chunk of client.chatStream(MESSAGES, {
          signal: controller.signal,
        })) {
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

  it('可以强制制造各类上游故障，便于覆盖错误路径', async () => {
    await expect(collect(new MockLlmClient({ failWith: 'auth' }))).rejects.toBeInstanceOf(
      LlmAuthError,
    );
    await expect(collect(new MockLlmClient({ failWith: 'rate_limit' }))).rejects.toBeInstanceOf(
      LlmRateLimitError,
    );
    await expect(collect(new MockLlmClient({ failWith: 'timeout' }))).rejects.toBeInstanceOf(
      LlmTimeoutError,
    );
    await expect(collect(new MockLlmClient({ failWith: 'upstream' }))).rejects.toBeInstanceOf(
      LlmUpstreamError,
    );
  });

  it('错误码符合契约：鉴权 40100 / 限流 42900 / 超时 50400 / 上游 50200', () => {
    expect(new LlmAuthError().code).toBe(ErrorCode.UNAUTHORIZED);
    expect(new LlmRateLimitError().code).toBe(ErrorCode.RATE_LIMITED);
    expect(new LlmTimeoutError().code).toBe(ErrorCode.LLM_TIMEOUT);
    expect(new LlmUpstreamError().code).toBe(ErrorCode.LLM_UPSTREAM);
  });
});
