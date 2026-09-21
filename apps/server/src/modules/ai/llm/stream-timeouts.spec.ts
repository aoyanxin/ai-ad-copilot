import { LlmAbortError, LlmTimeoutError } from './llm-client';
import { withStreamTimeouts } from './stream-timeouts';

async function* fromTokens(tokens: string[], gapMs = 0): AsyncIterable<string> {
  for (const token of tokens) {
    if (gapMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, gapMs));
    }
    yield token;
  }
}

async function collect(source: AsyncIterable<string>): Promise<string[]> {
  const chunks: string[] = [];
  for await (const chunk of source) {
    chunks.push(chunk);
  }
  return chunks;
}

describe('withStreamTimeouts', () => {
  it('正常流原样透传', async () => {
    const controller = new AbortController();
    const chunks = await collect(
      withStreamTimeouts(fromTokens(['a', 'b', 'c']), {
        silenceTimeoutMs: 1000,
        totalTimeoutMs: 2000,
        abortUpstream: () => controller.abort(),
      }),
    );

    expect(chunks).toEqual(['a', 'b', 'c']);
    expect(controller.signal.aborted).toBe(false);
  });

  it('静默超时：超过 silenceTimeoutMs 没有新分片就中断，并且 abort 上游', async () => {
    const controller = new AbortController();
    let upstreamObservedAbort = false;

    // 模拟真实 client：卡在没有新分片的状态，但监听 signal；被 abort 时立刻收尾
    async function* stallAfterFirst(): AsyncIterable<string> {
      yield 'first';
      await new Promise<void>((resolve) => {
        controller.signal.addEventListener(
          'abort',
          () => {
            upstreamObservedAbort = true;
            resolve();
          },
          { once: true },
        );
      });
    }

    await expect(
      collect(
        withStreamTimeouts(stallAfterFirst(), {
          silenceTimeoutMs: 30,
          totalTimeoutMs: 1000,
          abortUpstream: () => controller.abort(),
        }),
      ),
    ).rejects.toBeInstanceOf(LlmTimeoutError);

    expect(controller.signal.aborted).toBe(true);
    expect(upstreamObservedAbort).toBe(true);
  });

  it('总时长超限：持续有分片但整体超过 totalTimeoutMs 时中断', async () => {
    const controller = new AbortController();

    await expect(
      collect(
        withStreamTimeouts(fromTokens(['a', 'b', 'c', 'd', 'e'], 20), {
          silenceTimeoutMs: 200,
          totalTimeoutMs: 60,
          abortUpstream: () => controller.abort(),
        }),
      ),
    ).rejects.toBeInstanceOf(LlmTimeoutError);

    expect(controller.signal.aborted).toBe(true);
  });

  it('外部取消：抛 LlmAbortError 并 abort 上游', async () => {
    const controller = new AbortController();
    const upstream = new AbortController();
    const source = withStreamTimeouts(fromTokens(['a', 'b', 'c'], 20), {
      silenceTimeoutMs: 1000,
      totalTimeoutMs: 2000,
      signal: controller.signal,
      abortUpstream: () => upstream.abort(),
    });

    const promise = collect(source);
    setTimeout(() => controller.abort(), 30);

    await expect(promise).rejects.toBeInstanceOf(LlmAbortError);
    expect(upstream.signal.aborted).toBe(true);
  });

  it('已经取消的 signal 不会产出任何分片', async () => {
    const controller = new AbortController();
    controller.abort();
    const chunks: string[] = [];

    await expect(
      (async () => {
        for await (const chunk of withStreamTimeouts(fromTokens(['a', 'b']), {
          silenceTimeoutMs: 1000,
          totalTimeoutMs: 2000,
          signal: controller.signal,
          abortUpstream: () => undefined,
        })) {
          chunks.push(chunk);
        }
      })(),
    ).rejects.toBeInstanceOf(LlmAbortError);

    expect(chunks).toEqual([]);
  });
});
