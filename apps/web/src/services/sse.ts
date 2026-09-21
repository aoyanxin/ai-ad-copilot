/**
 * SSE 客户端：用 fetch + ReadableStream 而不是 EventSource
 * （EventSource 只能 GET，且不能带自定义 header / 请求体）。
 *
 * 线格式与后端 modules/ai/sse.ts 一一对应：
 *   event: <name>\n
 *   data: <JSON>\n
 *   \n
 */

import { isAiStreamEventName, type AiStreamEvent } from '@ai-ad-copilot/shared';

import { ApiRequestError, isAbortError, resolveApiBaseUrl } from './http';

export interface SseFrame {
  event: string;
  data: string;
}

export interface SseParser {
  push(chunk: string): SseFrame[];
  flush(): SseFrame[];
}

function parseBlock(block: string): SseFrame | null {
  let event = 'message';
  const dataLines: string[] = [];
  let hasField = false;

  block.split('\n').forEach((line) => {
    // 注释行（心跳）与空行直接忽略
    if (line.length === 0 || line.startsWith(':')) {
      return;
    }

    const separator = line.indexOf(':');
    const field = separator >= 0 ? line.slice(0, separator) : line;
    let value = separator >= 0 ? line.slice(separator + 1) : '';

    if (value.startsWith(' ')) {
      value = value.slice(1);
    }

    if (field === 'event') {
      event = value;
      hasField = true;
    } else if (field === 'data') {
      dataLines.push(value);
      hasField = true;
    }
  });

  return hasField ? { event, data: dataLines.join('\n') } : null;
}

/**
 * 增量解析器：一帧可能被 TCP 切在两个 chunk 之间，
 * 未闭合的尾帧留在缓冲里等下一次 push。
 */
export function createSseParser(): SseParser {
  let buffer = '';

  const takeCompleteFrames = (): SseFrame[] => {
    const frames: SseFrame[] = [];
    let boundary = buffer.indexOf('\n\n');

    while (boundary >= 0) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);

      const frame = parseBlock(block);
      if (frame) {
        frames.push(frame);
      }

      boundary = buffer.indexOf('\n\n');
    }

    return frames;
  };

  return {
    push(chunk: string): SseFrame[] {
      // 统一换行：chunk 边界正好落在 \r\n 中间也能正确拼接
      buffer = `${buffer}${chunk}`.replace(/\r\n/g, '\n');
      return takeCompleteFrames();
    },
    flush(): SseFrame[] {
      const rest = buffer.replace(/\r\n/g, '\n').trim();
      buffer = '';
      const frame = parseBlock(rest);
      return frame ? [frame] : [];
    },
  };
}

/** 把原始帧解析成契约里的事件；未知事件名或非法 JSON 直接忽略（向前兼容） */
export function parseSseEvent(frame: SseFrame): AiStreamEvent | null {
  if (!isAiStreamEventName(frame.event)) {
    return null;
  }

  try {
    return { event: frame.event, data: JSON.parse(frame.data) } as AiStreamEvent;
  } catch {
    return null;
  }
}

export interface PostSseOptions {
  signal?: AbortSignal;
  onFrame: (frame: SseFrame) => void;
}

/** POST 建立 SSE 流；调用方负责把 frame 映射成业务事件 */
export async function postSseStream(
  path: string,
  body: unknown,
  options: PostSseOptions,
): Promise<void> {
  const url = `${resolveApiBaseUrl()}${path}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify(body),
      signal: options.signal,
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }
    throw new ApiRequestError(0, '网络异常，请确认后端服务已启动');
  }

  // 还没开始流式就失败：后端返回的是统一 JSON 错误结构
  if (!response.ok) {
    let failure: { code?: unknown; message?: unknown; details?: unknown } = {};
    try {
      failure = (await response.json()) as typeof failure;
    } catch {
      // 保持空对象，下面用状态码兜底
    }

    throw new ApiRequestError(
      typeof failure.code === 'number' ? failure.code : response.status,
      typeof failure.message === 'string' && failure.message.length > 0
        ? failure.message
        : `请求失败（HTTP ${response.status}）`,
      Array.isArray(failure.details) ? failure.details.map((item) => String(item)) : undefined,
    );
  }

  if (!response.body) {
    throw new ApiRequestError(response.status, '当前环境不支持流式响应');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const parser = createSseParser();

  try {
    for (;;) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      const chunk = decoder.decode(value, { stream: true });
      parser.push(chunk).forEach(options.onFrame);
    }

    const rest = decoder.decode();
    if (rest.length > 0) {
      parser.push(rest).forEach(options.onFrame);
    }
    parser.flush().forEach(options.onFrame);
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }
    throw new ApiRequestError(0, '流式响应中断，请重试');
  } finally {
    reader.releaseLock?.();
  }
}
