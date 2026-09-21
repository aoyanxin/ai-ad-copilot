import {
  LlmAbortError,
  LlmAuthError,
  LlmRateLimitError,
  LlmTimeoutError,
  LlmUpstreamError,
  type ChatStreamOptions,
  type LlmClient,
  type LlmMessage,
} from './llm-client';

export type MockLlmFailure = 'auth' | 'rate_limit' | 'timeout' | 'upstream';

export interface MockLlmClientOptions {
  /** 每个分片之间的间隔（毫秒），0 表示尽快吐完 */
  chunkDelayMs?: number;
  /** 强制失败：用于覆盖错误路径的测试 */
  failWith?: MockLlmFailure;
}

const MOCK_BODY = [
  '限时体验',
  '新品',
  '现在下单',
  '立享',
  '专属优惠',
  '点击',
  '了解详情',
];

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** 由 prompt 推出的确定性文案：同样的入参永远得到同样的分片序列 */
function buildTokens(messages: LlmMessage[]): string[] {
  if (expectsJson(messages)) {
    return jsonTokens(buildScoreJson(messages));
  }

  const lastUserMessage = [...messages].reverse().find((message) => message.role === 'user');
  const digest = hashString(lastUserMessage?.content ?? '');
  const offset = digest % MOCK_BODY.length;
  const rotated = [...MOCK_BODY.slice(offset), ...MOCK_BODY.slice(0, offset)];

  return [`【mock-${digest.toString(16).slice(0, 6)}】`, ...rotated];
}

/** 打分模板要求"只输出 JSON"，mock 也要按这个契约返回结构化结果 */
function expectsJson(messages: LlmMessage[]): boolean {
  return messages.some((message) => message.content.includes('JSON'));
}

function buildScoreJson(messages: LlmMessage[]): string {
  const userPrompt = [...messages].reverse().find((message) => message.role === 'user')?.content ?? '';
  const copies = userPrompt
    .split('\n')
    .map((line) => /^\[(\d+)]\s*(.*)$/.exec(line.trim()))
    .filter((match): match is RegExpExecArray => match !== null);

  const results = copies.map((match) => {
    const index = Number(match[1]);
    const score = 60 + (hashString(match[2]) % 35);

    return {
      index,
      score,
      reasons: [`第 ${index + 1} 条：结构完整度 ${score} 分`, 'mock 评审结果，仅用于联调与测试'],
    };
  });

  return JSON.stringify({ results });
}

function jsonTokens(json: string): string[] {
  // 按 24 字符切片，模拟真实流的碎片化到达
  const chunkSize = 24;
  const tokens: string[] = [];

  for (let index = 0; index < json.length; index += chunkSize) {
    tokens.push(json.slice(index, index + chunkSize));
  }

  return tokens;
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) {
    return signal?.aborted ? Promise.reject(new LlmAbortError()) : Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', handleAbort);
      resolve();
    }, ms);

    function handleAbort(): void {
      clearTimeout(timer);
      reject(new LlmAbortError());
    }

    signal?.addEventListener('abort', handleAbort, { once: true });
  });
}

/**
 * 离线 / CI 用的 LLM 实现：按词逐步 yield，行为与真实流式一致，
 * 并且会把"上游请求被取消"记录下来，便于测试断言 abort 真的传播到了客户端。
 */
export class MockLlmClient implements LlmClient {
  readonly model = 'mock-llm';

  private abortCount = 0;

  constructor(private readonly options: MockLlmClientOptions = {}) {}

  /** 观测到的取消次数（断言客户端断开 / 用户停止是否传到上游） */
  get abortObservations(): number {
    return this.abortCount;
  }

  async *chatStream(
    messages: LlmMessage[],
    options: ChatStreamOptions = {},
  ): AsyncIterable<string> {
    // 一进入就监听 signal：取消可能发生在两次 next() 之间，
    // 只靠循环里检查会漏掉"生成器被挂起时到达的取消"。
    const handleAbort = (): void => {
      this.abortCount += 1;
    };
    if (options.signal?.aborted) {
      handleAbort();
    } else {
      options.signal?.addEventListener('abort', handleAbort, { once: true });
    }

    try {
      if (this.options.failWith) {
        throw this.createFailure(this.options.failWith);
      }

      const chunkDelayMs = this.options.chunkDelayMs ?? 15;

      for (const token of buildTokens(messages)) {
        if (options.signal?.aborted) {
          throw new LlmAbortError();
        }

        await delay(chunkDelayMs, options.signal);
        yield token;
      }
    } finally {
      options.signal?.removeEventListener('abort', handleAbort);
    }
  }

  private createFailure(failure: MockLlmFailure): Error {
    switch (failure) {
      case 'auth':
        return new LlmAuthError();
      case 'rate_limit':
        return new LlmRateLimitError();
      case 'timeout':
        return new LlmTimeoutError();
      case 'upstream':
        return new LlmUpstreamError();
      default:
        return new LlmUpstreamError();
    }
  }
}
