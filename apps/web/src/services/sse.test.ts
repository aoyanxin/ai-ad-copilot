import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiRequestError } from './http';
import { createSseParser, parseSseEvent, postSseStream } from './sse';

function createStreamResponse(
  chunks: string[],
  init: { status?: number; ok?: boolean; json?: () => Promise<unknown> } = {},
): Response {
  const encoder = new TextEncoder();
  let index = 0;

  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: init.json ?? (async () => ({})),
    body: {
      getReader: () => ({
        read: async () =>
          index < chunks.length
            ? { done: false, value: encoder.encode(chunks[index++]) }
            : { done: true, value: undefined },
        releaseLock: () => undefined,
      }),
    },
  } as unknown as Response;
}

describe('createSseParser', () => {
  it('解析单个完整帧', () => {
    const parser = createSseParser();

    expect(parser.push('event: delta\ndata: {"index":0,"text":"a"}\n\n')).toEqual([
      { event: 'delta', data: '{"index":0,"text":"a"}' },
    ]);
  });

  it('一个 chunk 里的多帧全部产出', () => {
    const parser = createSseParser();
    const frames = parser.push(
      'event: meta\ndata: {"variantCount":3}\n\nevent: delta\ndata: {"index":0,"text":"a"}\n\n',
    );

    expect(frames.map((frame) => frame.event)).toEqual(['meta', 'delta']);
  });

  it('半帧跨 chunk 时留到下一次，不产出残缺事件', () => {
    const parser = createSseParser();

    expect(parser.push('event: delta\ndata: {"index":0,"te')).toEqual([]);
    expect(parser.push('xt":"秋季"}\n\n')).toEqual([
      { event: 'delta', data: '{"index":0,"text":"秋季"}' },
    ]);
  });

  it('兼容 CRLF（包括 \r 与 \n 被切开的情况）', () => {
    const parser = createSseParser();

    expect(parser.push('event: delta\r')).toEqual([]);
    expect(parser.push('\ndata: {"index":0,"text":"x"}\r\n\r\n')).toEqual([
      { event: 'delta', data: '{"index":0,"text":"x"}' },
    ]);
  });

  it('忽略注释行（心跳）', () => {
    const parser = createSseParser();

    expect(parser.push(': ping\n\nevent: done\ndata: {"durationMs":1}\n\n')).toEqual([
      { event: 'done', data: '{"durationMs":1}' },
    ]);
  });

  it('多行 data 按换行拼接', () => {
    const parser = createSseParser();

    expect(parser.push('event: delta\ndata: line1\ndata: line2\n\n')).toEqual([
      { event: 'delta', data: 'line1\nline2' },
    ]);
  });

  it('flush 产出缓冲区里的残留帧', () => {
    const parser = createSseParser();

    parser.push('event: done\ndata: {"x":1}');

    expect(parser.flush()).toEqual([{ event: 'done', data: '{"x":1}' }]);
    expect(parser.flush()).toEqual([]);
  });
});

describe('parseSseEvent', () => {
  it('解析成契约里的事件', () => {
    expect(parseSseEvent({ event: 'delta', data: '{"index":1,"text":"a"}' })).toEqual({
      event: 'delta',
      data: { index: 1, text: 'a' },
    });
  });

  it('未知事件名或非法 JSON 返回 null（向前兼容）', () => {
    expect(parseSseEvent({ event: 'unknown-event', data: '{}' })).toBeNull();
    expect(parseSseEvent({ event: 'delta', data: 'not-json' })).toBeNull();
  });
});

describe('postSseStream', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('POST + Accept: text/event-stream，并把帧回调出去', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createStreamResponse([
        'event: meta\ndata: {"variantCount":3}\n\n',
        'event: delta\ndata: {"index":0,"text":"a"}\n\n',
      ]),
    );
    vi.stubGlobal('fetch', fetchMock);
    const frames: string[] = [];

    await postSseStream('/ai/copywriting/stream', { product: '风衣' }, {
      onFrame: (frame) => frames.push(frame.event),
    });

    expect(frames).toEqual(['meta', 'delta']);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/ai/copywriting/stream',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Accept: 'text/event-stream' }),
        body: JSON.stringify({ product: '风衣' }),
      }),
    );
  });

  it('HTTP 非 2xx 时抛后端错误结构（带 code / details）', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        createStreamResponse([], {
          ok: false,
          status: 429,
          json: async () => ({ code: 42900, message: 'AI 服务繁忙', details: ['retry later'] }),
        }),
      ),
    );

    const error = await postSseStream('/ai/copywriting/stream', {}, {
      onFrame: () => undefined,
    }).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(ApiRequestError);
    expect((error as ApiRequestError).code).toBe(42900);
    expect((error as ApiRequestError).message).toBe('AI 服务繁忙');
    expect((error as ApiRequestError).details).toEqual(['retry later']);
  });

  it('非 2xx 且返回非 JSON 时用状态码兜底', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        createStreamResponse([], {
          ok: false,
          status: 502,
          json: async () => {
            throw new Error('not json');
          },
        }),
      ),
    );

    await expect(
      postSseStream('/ai/copywriting/stream', {}, { onFrame: () => undefined }),
    ).rejects.toMatchObject({ code: 502, message: '请求失败（HTTP 502）' });
  });

  it('网络异常统一成错误码 0，AbortError 原样抛出', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(
      postSseStream('/ai/copywriting/stream', {}, { onFrame: () => undefined }),
    ).rejects.toMatchObject({ code: 0 });

    const abortError = new Error('请求已取消');
    abortError.name = 'AbortError';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abortError));
    await expect(
      postSseStream('/ai/copywriting/stream', {}, { onFrame: () => undefined }),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('读取过程中断时给出可读错误', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        body: {
          getReader: () => ({
            read: async () => {
              throw new Error('stream broken');
            },
            releaseLock: () => undefined,
          }),
        },
      } as unknown as Response),
    );

    await expect(
      postSseStream('/ai/copywriting/stream', {}, { onFrame: () => undefined }),
    ).rejects.toMatchObject({ code: 0, message: '流式响应中断，请重试' });
  });
});
