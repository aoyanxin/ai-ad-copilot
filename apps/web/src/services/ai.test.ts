import type { AiStreamEvent, CopywritingRequest } from '@ai-ad-copilot/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createMockAiService, httpAiService } from './ai';

const REQUEST: CopywritingRequest = {
  product: '秋季轻薄风衣',
  audience: '25-35 岁通勤女性',
  channel: 'douyin',
  tone: 'professional',
  variants: 3,
};

/** 与后端 integration 测试里看到的线格式完全一致（交错 delta 模拟 3 路并发） */
const SERVER_SSE_BODY = [
  'event: meta\ndata: {"model":"mock-llm","variantCount":3,"requestId":"r-1"}\n\n',
  'event: variant\ndata: {"index":0,"angle":"selling_point"}\n\n',
  'event: variant\ndata: {"index":1,"angle":"scenario"}\n\n',
  'event: variant\ndata: {"index":2,"angle":"benefit"}\n\n',
  'event: delta\ndata: {"index":0,"text":"秋季"}\n\n',
  'event: delta\ndata: {"index":1,"text":"通勤"}\n\n',
  'event: delta\ndata: {"index":2,"text":"立减"}\n\n',
  'event: delta\ndata: {"index":0,"text":"轻薄风衣"}\n\n',
  'event: variant-done\ndata: {"index":0,"finishReason":"stop","chars":8}\n\n',
  'event: variant-done\ndata: {"index":1,"finishReason":"stop","chars":8}\n\n',
  'event: variant-done\ndata: {"index":2,"finishReason":"stop","chars":8}\n\n',
  'event: done\ndata: {"durationMs":1200,"variantCount":3}\n\n',
].join('');

/** 与服务端一致：失败也走 error 帧 */
const SERVER_ERROR_BODY = [
  'event: meta\ndata: {"model":"mock-llm","variantCount":3,"requestId":"r-2"}\n\n',
  'event: variant\ndata: {"index":0,"angle":"selling_point"}\n\n',
  'event: error\ndata: {"code":42900,"message":"AI 服务繁忙（限流），请稍后重试"}\n\n',
].join('');

function createStreamResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  let index = 0;

  return {
    ok: true,
    status: 200,
    json: async () => ({}),
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

function splitInTwo(body: string): string[] {
  const middle = Math.floor(body.length / 2);
  return [body.slice(0, middle), body.slice(middle)];
}

async function collectHttp(body: string): Promise<AiStreamEvent[]> {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(createStreamResponse(splitInTwo(body))));
  const events: AiStreamEvent[] = [];

  await httpAiService.streamCopywriting(REQUEST, { onEvent: (event) => events.push(event) });

  return events;
}

async function collectMock(options = {}): Promise<AiStreamEvent[]> {
  const events: AiStreamEvent[] = [];
  const service = createMockAiService({ chunkDelayMs: 0, ...options });

  await service.streamCopywriting(REQUEST, { onEvent: (event) => events.push(event) });

  return events;
}

/** 连续 delta 折叠成一段，便于跨实现比较"里程碑顺序" */
function normalizeShape(events: AiStreamEvent[]): string[] {
  return events.reduce<string[]>((shape, event) => {
    if (event.event === 'delta' && shape[shape.length - 1] === 'delta') {
      return shape;
    }
    return [...shape, event.event];
  }, []);
}

const EXPECTED_SHAPE = [
  'meta',
  'variant',
  'variant',
  'variant',
  'delta',
  'variant-done',
  'variant-done',
  'variant-done',
  'done',
];

function assertStreamContract(events: AiStreamEvent[]): void {
  const names = events.map((event) => event.event);

  expect(names[0]).toBe('meta');
  expect(names[names.length - 1]).toBe('done');
  expect(names).not.toContain('error');
  expect(normalizeShape(events)).toEqual(EXPECTED_SHAPE);

  // 所有 variant 都在第一个 delta 之前；所有 variant-done 都在 done 之前
  expect(names.lastIndexOf('variant')).toBeLessThan(names.indexOf('delta'));
  expect(names.lastIndexOf('variant-done')).toBeLessThan(names.lastIndexOf('done'));

  const variantIndexes = events
    .filter((event) => event.event === 'variant')
    .map((event) => (event.data as { index: number }).index);
  const doneIndexes = events
    .filter((event) => event.event === 'variant-done')
    .map((event) => (event.data as { index: number }).index);

  expect(variantIndexes).toEqual([0, 1, 2]);
  expect([...doneIndexes].sort()).toEqual([0, 1, 2]);

  // 每个版本都收到了文本，且 index 都在范围内
  const textByIndex = new Map<number, string>();
  events
    .filter((event) => event.event === 'delta')
    .forEach((event) => {
      const data = event.data as { index: number; text: string };
      expect([0, 1, 2]).toContain(data.index);
      textByIndex.set(data.index, `${textByIndex.get(data.index) ?? ''}${data.text}`);
    });
  expect([...textByIndex.keys()].sort()).toEqual([0, 1, 2]);
  textByIndex.forEach((text) => expect(text.length).toBeGreaterThan(0));
}

describe('AI 流式契约（mock 与 real 必须一致）', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('http 实现：解析服务端 SSE 并产出契约序列', async () => {
    const events = await collectHttp(SERVER_SSE_BODY);

    assertStreamContract(events);
  });

  it('mock 实现：产出与 http 完全相同的里程碑序列', async () => {
    const events = await collectMock();

    assertStreamContract(events);
  });

  it('两种实现的归一化序列逐项相等', async () => {
    const httpShape = normalizeShape(await collectHttp(SERVER_SSE_BODY));
    const mockShape = normalizeShape(await collectMock());

    expect(mockShape).toEqual(httpShape);
  });

  it('错误路径一致：都以 error 事件收尾且没有 done', async () => {
    const httpEvents = await collectHttp(SERVER_ERROR_BODY);
    const mockEvents = await collectMock({ failWith: 'rate_limit' });

    expect(httpEvents[httpEvents.length - 1].event).toBe('error');
    expect(mockEvents[mockEvents.length - 1].event).toBe('error');
    expect(httpEvents.some((event) => event.event === 'done')).toBe(false);
    expect(mockEvents.some((event) => event.event === 'done')).toBe(false);

    const httpError = httpEvents[httpEvents.length - 1].data as { code: number; message: string };
    const mockError = mockEvents[mockEvents.length - 1].data as { code: number; message: string };
    expect(httpError.code).toBe(42900);
    expect(mockError.code).toBe(42900);
    expect(mockError.message).toBe(httpError.message);
  });
});

describe('httpAiService', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('streamCopywriting 打到 /api/ai/copywriting/stream', async () => {
    const fetchMock = vi.fn().mockResolvedValue(createStreamResponse([SERVER_SSE_BODY]));
    vi.stubGlobal('fetch', fetchMock);

    await httpAiService.streamCopywriting(REQUEST, { onEvent: () => undefined });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/ai/copywriting/stream',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('streamRewrite 打到 rewrite 端点', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        createStreamResponse([
          'event: meta\ndata: {"model":"mock-llm","variantCount":1,"requestId":"r"}\n\n',
          'event: delta\ndata: {"index":0,"text":"改写"}\n\n',
          'event: done\ndata: {"durationMs":1,"variantCount":1}\n\n',
        ]),
      );
    vi.stubGlobal('fetch', fetchMock);

    await httpAiService.streamRewrite(
      { original: '原文', instruction: '更紧迫' },
      { onEvent: () => undefined },
    );

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/ai/copywriting/rewrite/stream',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('scoreCopywriting 走 JSON 接口并解包 data', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ code: 0, message: 'ok', data: [{ index: 0, score: 88, reasons: ['好'] }] }),
    } as unknown as Response);
    vi.stubGlobal('fetch', fetchMock);

    const result = await httpAiService.scoreCopywriting(['文案']);

    expect(result).toEqual([{ index: 0, score: 88, reasons: ['好'] }]);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/ai/copywriting/score',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ copies: ['文案'] }) }),
    );
  });
});

describe('createMockAiService', () => {
  it('三个版本内容互不相同', async () => {
    const events = await collectMock();
    const texts = new Map<number, string>();

    events
      .filter((event) => event.event === 'delta')
      .forEach((event) => {
        const data = event.data as { index: number; text: string };
        texts.set(data.index, `${texts.get(data.index) ?? ''}${data.text}`);
      });

    expect(new Set([...texts.values()]).size).toBe(3);
  });

  it('改写流只有 meta → delta* → variant-done → done', async () => {
    const events: AiStreamEvent[] = [];
    const service = createMockAiService({ chunkDelayMs: 0 });

    await service.streamRewrite({ original: '原文', instruction: '更紧迫' }, {
      onEvent: (event) => events.push(event),
    });

    expect(events[0].event).toBe('meta');
    expect(events[events.length - 1].event).toBe('done');
    expect(events.some((event) => event.event === 'variant')).toBe(false);
  });

  it('打分结果是确定性的，分数在 0~100 内', async () => {
    const service = createMockAiService({ chunkDelayMs: 0 });

    const first = await service.scoreCopywriting(['文案一', '文案二']);
    const second = await service.scoreCopywriting(['文案一', '文案二']);

    expect(first).toEqual(second);
    first.forEach((item) => {
      expect(item.score).toBeGreaterThanOrEqual(0);
      expect(item.score).toBeLessThanOrEqual(100);
      expect(item.reasons.length).toBeGreaterThan(0);
    });
  });
});
