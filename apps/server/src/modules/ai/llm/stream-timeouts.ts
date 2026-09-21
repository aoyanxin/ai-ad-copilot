import { LlmAbortError, LlmTimeoutError } from './llm-client';

/** 毫秒超时解析：非法值回落到 fallback */
export function resolveTimeoutMs(raw: string | number | undefined, fallback: number): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export interface StreamTimeoutOptions {
  /** 静默超时：连续这么久没有新 token 就中断 */
  silenceTimeoutMs: number;
  /** 整条流的总时长上限 */
  totalTimeoutMs: number;
  /** 外部取消（客户端断开 / 用户点停止） */
  signal?: AbortSignal;
  /**
   * 超时或外部取消时通知上游。
   * 上游 client 持有的是同一个 controller 的 signal，abort 之后：
   * DeepSeek 侧会取消 HTTP 请求，Mock 侧会在下一个分片前抛 LlmAbortError。
   */
  abortUpstream: () => void;
}

/**
 * 给任意流式 LLM 输出套上"静默超时 + 总时长上限 + 取消"。
 *
 * 放在这一层而不是各 client 内部：DeepSeek 与 Mock 必须有一模一样的超时语义，
 * 而且这样单测可以直接驱动超时（不用打网络，也不用假的 SDK）。
 *
 * 取消上游靠 abortUpstream()（信号传播），不靠 iterator.return()：
 * 生成器可能正停在未决的 await 上，return() 会被挂住，
 * 真正能让上游停下来的是它自己监听的 signal。
 */
export async function* withStreamTimeouts(
  source: AsyncIterable<string>,
  options: StreamTimeoutOptions,
): AsyncIterable<string> {
  const iterator = source[Symbol.asyncIterator]();
  const startedAt = Date.now();

  try {
    while (true) {
      const elapsed = Date.now() - startedAt;
      const remainingTotalMs = options.totalTimeoutMs - elapsed;

      if (remainingTotalMs <= 0) {
        options.abortUpstream();
        throw new LlmTimeoutError(`AI 生成超时（超过 ${options.totalTimeoutMs}ms）`);
      }

      const waitMs = Math.min(options.silenceTimeoutMs, remainingTotalMs);
      const result = await nextWithTimeout(iterator, waitMs, options);

      if (result.done) {
        return;
      }

      yield result.value;
    }
  } finally {
    // 不 await：上游若停在未决 await 上，return() 的 promise 不会结算
    void iterator.return?.(undefined)?.catch?.(() => undefined);
  }
}

function nextWithTimeout(
  iterator: AsyncIterator<string>,
  waitMs: number,
  options: StreamTimeoutOptions,
): Promise<IteratorResult<string>> {
  return new Promise<IteratorResult<string>>((resolve, reject) => {
    let settled = false;

    const cleanup = (): void => {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', handleAbort);
    };

    const settle = (action: () => void): void => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      action();
    };

    function handleAbort(): void {
      options.abortUpstream();
      settle(() => reject(new LlmAbortError()));
    }

    const timer = setTimeout(() => {
      options.abortUpstream();
      settle(() => reject(new LlmTimeoutError(`AI 服务 ${waitMs}ms 内没有返回新内容`)));
    }, waitMs);

    if (options.signal?.aborted) {
      handleAbort();
      return;
    }
    options.signal?.addEventListener('abort', handleAbort, { once: true });

    iterator.next().then(
      (result) => settle(() => resolve(result)),
      (error: unknown) => settle(() => reject(error)),
    );
  });
}
