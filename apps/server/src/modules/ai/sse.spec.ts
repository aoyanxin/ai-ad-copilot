import type { Response } from 'express';

import {
  createClientAbort,
  endSseResponse,
  formatSseComment,
  formatSseFrame,
  initSseResponse,
  writeSseFrame,
} from './sse';

function createResponseMock(): {
  res: Response;
  headers: Record<string, string>;
  flushHeaders: jest.Mock;
  write: jest.Mock;
  end: jest.Mock;
  emitClose: () => void;
  setWritableEnded: (value: boolean) => void;
} {
  const headers: Record<string, string> = {};
  const flushHeaders = jest.fn();
  const write = jest.fn();
  const end = jest.fn();
  const listeners = new Set<() => void>();

  const res = {
    setHeader: (name: string, value: string) => {
      headers[name] = value;
      return res;
    },
    flushHeaders,
    write,
    end,
    writableEnded: false,
    on: (event: string, listener: () => void) => {
      if (event === 'close') {
        listeners.add(listener);
      }
      return res;
    },
    off: (event: string, listener: () => void) => {
      if (event === 'close') {
        listeners.delete(listener);
      }
      return res;
    },
  } as unknown as Response;

  return {
    res,
    headers,
    flushHeaders,
    write,
    end,
    emitClose: () => listeners.forEach((listener) => listener()),
    setWritableEnded: (value: boolean) => {
      (res as unknown as { writableEnded: boolean }).writableEnded = value;
    },
  };
}

describe('formatSseFrame', () => {
  it('输出精确的 event/data 两行 + 空行', () => {
    expect(formatSseFrame('delta', { index: 0, text: '秋季上新' })).toBe(
      'event: delta\ndata: {"index":0,"text":"秋季上新"}\n\n',
    );
  });

  it('各事件类型的 payload 结构符合契约', () => {
    expect(formatSseFrame('meta', { model: 'mock-llm', variantCount: 3, requestId: 'r-1' })).toBe(
      'event: meta\ndata: {"model":"mock-llm","variantCount":3,"requestId":"r-1"}\n\n',
    );
    expect(formatSseFrame('variant', { index: 1, angle: 'scenario' })).toContain(
      'data: {"index":1,"angle":"scenario"}',
    );
    expect(formatSseFrame('variant-done', { index: 0, finishReason: 'stop', chars: 42 })).toContain(
      'event: variant-done',
    );
    expect(formatSseFrame('done', { durationMs: 1234, variantCount: 3 })).toContain(
      'event: done',
    );
    expect(formatSseFrame('error', { code: 42900, message: '限流' })).toContain(
      'data: {"code":42900,"message":"限流"}',
    );
  });
});

describe('formatSseComment', () => {
  it('注释帧以冒号开头', () => {
    expect(formatSseComment('ping')).toBe(': ping\n\n');
  });
});

describe('initSseResponse', () => {
  it('设置 SSE 必需响应头并立即 flush', () => {
    const { res, headers, flushHeaders } = createResponseMock();

    initSseResponse(res);

    expect(headers['Content-Type']).toBe('text/event-stream; charset=utf-8');
    expect(headers['Cache-Control']).toBe('no-cache, no-transform');
    expect(headers['Connection']).toBe('keep-alive');
    expect(headers['X-Accel-Buffering']).toBe('no');
    expect(flushHeaders).toHaveBeenCalledTimes(1);
  });
});

describe('writeSseFrame / endSseResponse', () => {
  it('按帧写入并结束响应', () => {
    const { res, write, end } = createResponseMock();

    writeSseFrame(res, 'delta', { index: 2, text: 'x' });
    writeSseFrame(res, 'done', { durationMs: 1, variantCount: 3 });
    endSseResponse(res);

    expect(write).toHaveBeenNthCalledWith(1, 'event: delta\ndata: {"index":2,"text":"x"}\n\n');
    expect(write).toHaveBeenNthCalledWith(2, 'event: done\ndata: {"durationMs":1,"variantCount":3}\n\n');
    expect(end).toHaveBeenCalledTimes(1);
  });
});

describe('createClientAbort', () => {
  it('客户端提前断开时 abort', () => {
    const { res, emitClose, setWritableEnded } = createResponseMock();
    const handle = createClientAbort(res);

    expect(handle.signal.aborted).toBe(false);
    setWritableEnded(false);
    emitClose();

    expect(handle.signal.aborted).toBe(true);
  });

  it('正常写完再关闭不触发 abort', () => {
    const { res, emitClose, setWritableEnded } = createResponseMock();
    const handle = createClientAbort(res);

    setWritableEnded(true);
    emitClose();

    expect(handle.signal.aborted).toBe(false);
  });

  it('cleanup 之后不再监听', () => {
    const { res, emitClose } = createResponseMock();
    const handle = createClientAbort(res);

    handle.cleanup();
    emitClose();

    expect(handle.signal.aborted).toBe(false);
  });
});
